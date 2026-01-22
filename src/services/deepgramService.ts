// Deepgram 실시간 스트리밍 STT + GPT 화자분류
// 녹음 중: Deepgram 실시간 전사 + GPT-4o-mini 배치 화자분류
// 녹음 종료: GPT-4o 정확한 화자분류

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || '';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// 화자별 세그먼트 인터페이스
export interface SpeakerSegment {
  speaker: 'doctor' | 'patient' | 'pending';
  text: string;
  startTime?: number;
  endTime?: number;
}

// 환각 필터 패턴
const HALLUCINATION_PATTERNS = [
  /구독.*좋아요/gi,
  /좋아요.*구독/gi,
  /시청.*감사/gi,
  /Thanks.*watching/gi,
  /subscribe/gi,
];

function filterHallucinations(text: string): string {
  let filtered = text;
  for (const pattern of HALLUCINATION_PATTERNS) {
    filtered = filtered.replace(pattern, '').trim();
  }
  return filtered.replace(/\s+/g, ' ').trim();
}

// GPT-4o 전체 발화 재구성 + 화자 분류
async function classifyUtterancesWithGPT(utterances: string[]): Promise<SpeakerSegment[]> {
  if (!OPENAI_API_KEY || utterances.length === 0) {
    console.warn('⚠️ OpenAI API 키 없음 또는 발화 없음');
    return utterances.map(text => ({ speaker: 'pending', text }));
  }

  console.log(`🤖 GPT-4o 전체 ${utterances.length}개 발화 분류 시작...`);

  // 발화를 번호로 구분해서 전송
  const numberedUtterances = utterances.map((u, i) => `[${i + 1}] ${u}`).join('\n');

  const prompt = `의료 상담 대화입니다. 전체 발화를 재구성하고 화자(D=의사, P=환자)를 분류하세요.

## 화자 구분 기준
- 의사(D): 질문("~세요?"), 설명, 지시, 안내, 진료 관련 언급
- 환자(P): 증상 설명, 대답("네", "아니요"), 감사 인사, 개인정보

## 재구성 규칙 (중요!)
1. **끊긴 문장 합치기**: 연속된 발화가 하나의 문장인데 중간에 끊긴 경우 합쳐서 출력
   - 예: "[1] 안녕하세요 김서현님 오늘 어떤" + "[2] 불편함으로 오셨나요?"
   → {"speaker": "D", "text": "안녕하세요 김서현님 오늘 어떤 불편함으로 오셨나요?"}

2. **섞인 화자 분리**: 한 발화 안에 두 화자의 말이 섞여 있으면 분리
   - 예: "[1] 감사합니다 원장님 불편하시면 다시 오세요"
   → {"speaker": "P", "text": "감사합니다 원장님"}, {"speaker": "D", "text": "불편하시면 다시 오세요"}

3. **같은 화자 연속 발화**: 같은 화자의 연속된 짧은 발화는 합쳐도 됨
   - 예: "[1] 네 맞아요" + "[2] 평소에는 괜찮은데"
   → {"speaker": "P", "text": "네 맞아요, 평소에는 괜찮은데"}

## 발화 목록
${numberedUtterances}

## 출력 형식 (JSON 배열만)
[{"speaker": "D", "text": "재구성된 완전한 문장"}, ...]

- 모든 내용을 빠짐없이 포함하세요
- 자연스러운 대화 흐름으로 재구성하세요`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPT API 오류: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('GPT 응답에서 JSON 배열을 찾을 수 없음');
    }

    const parsed: Array<{ speaker: string; text: string }> = JSON.parse(jsonMatch[0]);
    
    // 재구성된 발화 처리
    const result: SpeakerSegment[] = parsed
      .filter(item => item.text && item.text.trim())
      .map((item) => ({
        speaker: item.speaker === 'D' ? 'doctor' : 'patient',
        text: item.text.trim()
      }));

    console.log(`✅ GPT-4o 화자 분류 완료: 👨‍⚕️ 의사 ${result.filter(s => s.speaker === 'doctor').length}개, 🙋 환자 ${result.filter(s => s.speaker === 'patient').length}개`);

    return result;
  } catch (error) {
    console.error('❌ GPT-4o 화자 분류 오류:', error);
    return utterances.map(text => ({ speaker: 'pending', text }));
  }
}

// Deepgram 실시간 스트리밍 전사 클래스
export class DeepgramRealtimeTranscriber {
  private ws: WebSocket | null = null;
  private onRealtimeSegment: (segment: SpeakerSegment) => void;
  private onSegmentsUpdate: (segments: SpeakerSegment[]) => void;
  private onFullUpdate: (segments: SpeakerSegment[]) => void;
  private isConnected: boolean = false;
  private utterances: string[] = []; // 발화 배열로 관리
  private classifiedSegments: SpeakerSegment[] = []; // 분류 완료된 세그먼트
  private classifiedUtteranceCount: number = 0; // 분류 완료된 발화 개수
  private isClassifying: boolean = false;
  private classifyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly WINDOW_SIZE = 5; // 한 번에 분류할 발화 개수
  
  constructor(
    onRealtimeSegment: (segment: SpeakerSegment) => void,
    onFullUpdate?: (segments: SpeakerSegment[]) => void,
    _department: string = 'general'
  ) {
    this.onRealtimeSegment = onRealtimeSegment;
    this.onSegmentsUpdate = () => {};
    this.onFullUpdate = onFullUpdate || (() => {});
    console.log(`🎙️ DeepgramRealtimeTranscriber 생성 (최근 ${this.WINDOW_SIZE}개 발화 화자분류)`);
  }

  // 전체 세그먼트 업데이트 콜백 설정
  setOnSegmentsUpdate(callback: (segments: SpeakerSegment[]) => void) {
    this.onSegmentsUpdate = callback;
  }

  // WebSocket 연결 시작
  async connect(): Promise<void> {
    if (!DEEPGRAM_API_KEY) {
      throw new Error('Deepgram API 키가 설정되지 않았습니다. VITE_DEEPGRAM_API_KEY를 확인하세요.');
    }

    console.log('🔌 Deepgram WebSocket 연결 시도...');

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'ko',
      punctuate: 'true',
      smart_format: 'true',        // 스마트 포맷 (숫자, 날짜 등)
      interim_results: 'true',
      utterance_end_ms: '1500',    // 발화 종료 감지 (1.5초 침묵)
      endpointing: '800',          // 문장 끊김 방지 (800ms로 늘림)
      vad_events: 'true',
    });

    const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    
    this.ws = new WebSocket(wsUrl, ['token', DEEPGRAM_API_KEY]);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket 연결 타임아웃'));
      }, 10000);

      this.ws!.onopen = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        console.log('✅ Deepgram WebSocket 연결됨');
        resolve();
      };

      this.ws!.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'Results') {
            const transcript = data.channel?.alternatives?.[0]?.transcript || '';
            const isFinal = data.is_final;

            // 🔍 RAW DATA 로깅 (final만)
            if (transcript && isFinal) {
              console.log(`🎤 [Deepgram RAW] "${transcript}"`);
              
              const filteredText = filterHallucinations(transcript);
              if (filteredText) {
                console.log(`✅ [필터 후] "${filteredText}"`);
                this.handleNewUtterance(filteredText);
              } else {
                console.log(`❌ [필터됨 - hallucination]`);
              }
            }
          }
        } catch (e) {
          console.error('메시지 파싱 오류:', e);
        }
      };

      this.ws!.onerror = (error) => {
        clearTimeout(timeout);
        console.error('❌ Deepgram WebSocket 오류:', error);
        reject(new Error('WebSocket 연결 실패'));
      };

      this.ws!.onclose = (event) => {
        this.isConnected = false;
        console.log('🔌 Deepgram WebSocket 닫힘:', event.code, event.reason);
      };
    });
  }

  // 새 발화 처리 (최근 N개 발화 기반 화자분류)
  private async handleNewUtterance(text: string) {
    this.utterances.push(text);
    
    // 미분류 발화 개수 계산
    const unclassifiedCount = this.utterances.length - this.classifiedUtteranceCount;
    
    // 미분류 발화들을 pending으로 표시
    const pendingSegments: SpeakerSegment[] = this.utterances
      .slice(this.classifiedUtteranceCount)
      .map(t => ({ speaker: 'pending' as const, text: t }));
    
    // 기존 분류된 세그먼트 + 미분류 발화들을 pending으로
    this.onSegmentsUpdate([...this.classifiedSegments, ...pendingSegments]);
    
    console.log(`📝 새 발화 #${this.utterances.length}: ${text.substring(0, 40)}... (미분류: ${unclassifiedCount}개)`);

    // 타이머 취소
    if (this.classifyTimer) {
      clearTimeout(this.classifyTimer);
    }
    
    // 미분류 발화가 3개 이상이면 즉시 분류 실행
    if (unclassifiedCount >= 3) {
      console.log(`⚡ 미분류 ${unclassifiedCount}개 → 즉시 화자분류 실행`);
      this.classifyRecentUtterances();
    } else {
      // 아니면 1.5초 디바운스
      this.classifyTimer = setTimeout(() => {
        this.classifyRecentUtterances();
      }, 1500);
    }
  }

  // 전체 발화 재분류 (GPT-4o) - 이전 오류도 수정 가능
  private async classifyRecentUtterances() {
    const unclassifiedCount = this.utterances.length - this.classifiedUtteranceCount;
    
    // 분류할 게 없으면 스킵
    if (unclassifiedCount === 0) {
      return;
    }
    
    // 분류 중이면 스킵 (나중에 다시 시도됨)
    if (this.isClassifying) {
      console.log('⏸️ 분류 중이므로 대기 (분류 완료 후 재시도됨)');
      return;
    }

    this.isClassifying = true;
    
    // 분류 시작 시점의 발화 개수 저장 (분류 중 새 발화 감지용)
    const utteranceCountAtStart = this.utterances.length;

    console.log(`🤖 전체 ${this.utterances.length}개 발화 재분류 시작 (미분류: ${unclassifiedCount}개)`);
    console.log(`📤 [GPT 입력 - 전체 발화]`, this.utterances);

    try {
      // 전체 발화를 GPT에 보내서 전체 재분류
      const allSegments = await classifyUtterancesWithGPT(this.utterances);
      
      console.log(`📥 [GPT 출력] ${allSegments.length}개 세그먼트:`);
      allSegments.forEach((seg, i) => {
        console.log(`   ${i+1}. [${seg.speaker}] "${seg.text}"`);
      });
      
      if (allSegments.length > 0) {
        // 전체 세그먼트 교체 (이전 오류도 수정됨)
        this.classifiedSegments = allSegments;
        this.classifiedUtteranceCount = utteranceCountAtStart;
        this.onSegmentsUpdate([...this.classifiedSegments]);
        console.log(`✅ 전체 재분류 완료: ${this.classifiedSegments.length}개 세그먼트`);
      }
    } catch (error) {
      console.error('❌ 화자분류 오류:', error);
    } finally {
      this.isClassifying = false;
      
      // 분류 완료 후 새로 들어온 발화가 있으면 다시 시도
      const newUtterancesDuringClassify = this.utterances.length - utteranceCountAtStart;
      if (newUtterancesDuringClassify > 0) {
        console.log(`🔄 분류 중 새 발화 ${newUtterancesDuringClassify}개 추가됨 → 1초 후 재분류`);
        setTimeout(() => {
          this.classifyRecentUtterances();
        }, 1000);
      }
    }
  }

  // 오디오 데이터 전송
  sendAudio(audioData: ArrayBuffer): void {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  // MediaRecorder 청크를 Deepgram에 전송
  async addChunk(chunk: Blob): Promise<void> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const arrayBuffer = await chunk.arrayBuffer();
      this.ws.send(arrayBuffer);
    } catch (error) {
      // 조용히 실패
    }
  }

  // 현재 세그먼트 반환
  getRealtimeSegments(): SpeakerSegment[] {
    return this.classifiedSegments;
  }

  // 전체 텍스트 반환
  getFullText(): string {
    return this.utterances.join(' ').trim();
  }

  // 녹음 종료 및 GPT-4o 최종 화자 분류
  async flush(): Promise<SpeakerSegment[]> {
    console.log('🔚 flush() 호출 - 녹음 종료');
    
    // 타이머 취소
    if (this.classifyTimer) {
      clearTimeout(this.classifyTimer);
      this.classifyTimer = null;
    }

    // WebSocket 닫기
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      this.ws.close();
      this.ws = null;
    }

    console.log(`📝 최종 발화 수: ${this.utterances.length}개`);

    if (this.utterances.length === 0) {
      console.log('⚠️ 전사된 발화 없음');
      return [];
    }

    // GPT-4o로 전체 발화 화자 분류
    const segments = await classifyUtterancesWithGPT(this.utterances);
    
    this.classifiedSegments = segments;
    this.onFullUpdate(segments);
    
    return segments;
  }

  // 연결 상태 확인
  isActive(): boolean {
    return this.isConnected;
  }

  // 초기화
  reset(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.classifyTimer) {
      clearTimeout(this.classifyTimer);
      this.classifyTimer = null;
    }
    this.utterances = [];
    this.classifiedSegments = [];
    this.classifiedUtteranceCount = 0;
    this.isClassifying = false;
    this.isConnected = false;
    console.log('🔄 DeepgramRealtimeTranscriber 리셋');
  }
}

// React Hook for Deepgram
import { useState, useRef, useCallback } from 'react';

interface UseDeepgramOptions {
  onTranscript: (text: string, isFinal: boolean) => void;
  onSegmentsUpdate: (segments: SpeakerSegment[]) => void;
  onFullUpdate: (transcript: string, segments: SpeakerSegment[]) => void;
}

interface DisconnectResult {
  transcript: string;
  segments: SpeakerSegment[];
}

export function useDeepgram(options: UseDeepgramOptions) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriberRef = useRef<DeepgramRealtimeTranscriber | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const optionsRef = useRef(options);
  
  // Keep options ref updated
  optionsRef.current = options;

  const connect = useCallback(async (stream: MediaStream) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Create transcriber
      transcriberRef.current = new DeepgramRealtimeTranscriber(
        (segment) => {
          optionsRef.current.onTranscript(segment.text, true);
        },
        (segments) => {
          const transcript = segments.map(s => s.text).join(' ');
          optionsRef.current.onFullUpdate(transcript, segments);
        }
      );

      // Set segments update callback
      transcriberRef.current.setOnSegmentsUpdate((segments) => {
        optionsRef.current.onSegmentsUpdate(segments);
      });

      // Connect to Deepgram
      await transcriberRef.current.connect();

      // Setup MediaRecorder to send audio chunks
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && transcriberRef.current) {
          await transcriberRef.current.addChunk(event.data);
        }
      };

      mediaRecorder.start(100); // Send chunks every 100ms
      mediaRecorderRef.current = mediaRecorder;

      setIsConnecting(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '연결 실패';
      setError(errorMessage);
      setIsConnecting(false);
      throw err;
    }
  }, []);

  const disconnect = useCallback(async (): Promise<DisconnectResult> => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
      mediaRecorderRef.current = null;
    }

    // Flush and close transcriber
    if (transcriberRef.current) {
      try {
        const segments = await transcriberRef.current.flush();
        const transcript = transcriberRef.current.getFullText();
        transcriberRef.current = null;
        return { transcript, segments };
      } catch (e) {
        console.error('Disconnect error:', e);
        transcriberRef.current = null;
      }
    }
    
    return { transcript: '', segments: [] };
  }, []);

  return {
    connect,
    disconnect,
    isConnecting,
    error
  };
}

export default {
  DeepgramRealtimeTranscriber,
  useDeepgram,
};
