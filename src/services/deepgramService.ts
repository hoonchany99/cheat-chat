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

// GPT-4o 실시간 화자 분류 (정확도 최우선)
async function classifySpeakersRealtime(
  utterances: string[],
  previousContext: string = ''
): Promise<Array<'doctor' | 'patient'>> {
  if (!OPENAI_API_KEY || utterances.length === 0) {
    // API 키 없으면 휴리스틱 사용
    return utterances.map((text, i) => estimateSpeakerHeuristic(text, i === 0 ? null : (i % 2 === 0 ? 'patient' : 'doctor')));
  }

  const prompt = `한국어 의료 상담 대화의 화자를 분류하세요.

## 화자 구분 기준
**의사(D)**:
- 질문: "~세요?", "~나요?", "~죠?", "어떻게 오셨어요", "언제부터"
- 선택지: "아니면~", "또는~", "~거나~"
- 인사: "안녕하세요 담당 의사", "저는 ~과입니다"
- 지시: "~해보세요", "~하시면 됩니다"

**환자(P)**:
- 증상: "~아파요", "~떨려요", "~이/가 ~해요"
- 응답: "네", "예", "아니요", "그렇습니다", "맞습니다"
- 기간: "~전부터", "~개월째", "~일 전부터"
- 정보: "이름은~", "~번입니다", "~살입니다"

${previousContext ? `## 이전 대화 (참고용)\n${previousContext}\n` : ''}
## 분류할 발화
${utterances.map((u, i) => `${i + 1}. "${u}"`).join('\n')}

## 응답 형식
${utterances.length}개의 화자를 쉼표로 구분: D 또는 P만 사용
예: ${utterances.length === 1 ? 'D' : utterances.map(() => 'D').join(',')}`;

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
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPT API 오류: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    
    console.log(`🤖 GPT 응답: "${content}"`);
    
    // "D,P,D" 또는 "D, P, D" 또는 "D" 형식 파싱
    const speakers = content.split(/[,\s]+/)
      .map((s: string) => s.trim().toUpperCase())
      .filter((s: string) => s === 'D' || s === 'P')
      .map((s: string) => s === 'D' ? 'doctor' : 'patient') as Array<'doctor' | 'patient'>;

    // 결과 개수가 맞지 않으면 휴리스틱으로 대체
    if (speakers.length !== utterances.length) {
      console.warn(`⚠️ GPT 결과 개수 불일치 (기대: ${utterances.length}, 실제: ${speakers.length}), 휴리스틱 사용`);
      return utterances.map((text, i) => estimateSpeakerHeuristic(text, i === 0 ? null : (i % 2 === 0 ? 'patient' : 'doctor')));
    }

    return speakers;
  } catch (error) {
    console.error('❌ GPT-mini 화자 분류 오류:', error);
    return utterances.map((text, i) => estimateSpeakerHeuristic(text, i === 0 ? null : (i % 2 === 0 ? 'patient' : 'doctor')));
  }
}

// 휴리스틱 화자 추정 (GPT 실패 시 백업)
function estimateSpeakerHeuristic(text: string, previousSpeaker: 'doctor' | 'patient' | null): 'doctor' | 'patient' {
  // 의사 패턴 (질문, 지시, 인사)
  const doctorPatterns = [
    /세요\??$/,           // ~세요?
    /나요\??$/,           // ~나요?
    /시죠\??$/,           // ~시죠?
    /ㄹ까요\??$/,         // ~ㄹ까요?
    /있으세요/,           // 있으세요
    /어떻게.*오셨/,       // 어떻게 오셨
    /언제부터/,           // 언제부터
    /어디.*아프/,         // 어디 아프
    /아니면/,             // 아니면 (선택지)
    /또는/,               // 또는 (선택지)
    /안녕하세요.*의사/,   // 안녕하세요 의사
    /담당.*의사/,         // 담당 의사
    /저는.*과/,           // 저는 ~과입니다
    /해보세요/,           // ~해보세요
    /하시면/,             // ~하시면
    /드릴게요/,           // ~드릴게요
    /검사/,               // 검사
  ];

  // 환자 패턴 (증상, 응답, 정보)
  const patientPatterns = [
    /아파요/,             // 아파요
    /아픕니다/,           // 아픕니다
    /떨려요/,             // 떨려요
    /떨립니다/,           // 떨립니다
    /것 같아요/,          // ~것 같아요
    /것 같습니다/,        // ~것 같습니다
    /거 같아요/,          // ~거 같아요
    /전부터/,             // ~전부터
    /개월.*전/,           // 몇 개월 전
    /^네[,.\s]?$/,        // 네
    /^예[,.\s]?$/,        // 예
    /^아니요/,            // 아니요
    /맞습니다/,           // 맞습니다
    /그렇습니다/,         // 그렇습니다
    /번입니다/,           // ~번입니다 (등록번호)
    /이름은/,             // 이름은
    /살입니다/,           // ~살입니다
    /왔습니다/,           // ~왔습니다
    /있습니다$/,          // ~있습니다
    /없습니다$/,          // ~없습니다
  ];

  let doctorScore = 0, patientScore = 0;
  
  for (const p of doctorPatterns) if (p.test(text)) doctorScore += 2;
  for (const p of patientPatterns) if (p.test(text)) patientScore += 2;
  
  // 물음표로 끝나면 의사일 확률 높음
  if (text.endsWith('?') || text.endsWith('요?')) doctorScore += 1;
  
  // 짧은 응답("네", "예", "아니요")은 환자일 확률 높음
  if (text.length < 5) patientScore += 1;

  if (doctorScore > patientScore) return 'doctor';
  if (patientScore > doctorScore) return 'patient';
  
  // 동점이면 이전 화자 반대
  if (previousSpeaker === 'doctor') return 'patient';
  if (previousSpeaker === 'patient') return 'doctor';
  
  return 'doctor'; // 기본값
}

// GPT-4o 발화별 화자 분류 (번호 기반)
async function classifyUtterancesWithGPT(utterances: string[]): Promise<SpeakerSegment[]> {
  if (!OPENAI_API_KEY || utterances.length === 0) {
    console.warn('⚠️ OpenAI API 키 없음 또는 발화 없음');
    return utterances.map(text => ({ speaker: 'pending', text }));
  }

  console.log('🤖 GPT-4o 발화별 화자 분류 시작...');

  // 발화를 번호로 구분해서 전송
  const numberedUtterances = utterances.map((u, i) => `[${i + 1}] ${u}`).join('\n');

  const prompt = `의료 상담 대화입니다. 각 발화의 화자(D=의사, P=환자)를 분류하세요.

## 화자 구분 기준
- 의사(D): 질문("~세요?"), 설명, 지시, 안내, 배웅 인사("불편하시면 오세요", "건강하세요" 등)
- 환자(P): 증상 설명, 대답("네", "아니요"), 감사("감사합니다", "알겠습니다"), 개인정보

## 중요 규칙
- 한 발화 안에 두 화자의 말이 섞여 있으면 **분리**하세요.
- 예: "[1] 감사합니다 원장님 불편하시면 다시 오세요" 
  → {"id": "1a", "speaker": "P", "text": "감사합니다 원장님"}, {"id": "1b", "speaker": "D", "text": "불편하시면 다시 오세요"}

## 발화 목록
${numberedUtterances}

## 출력 형식 (JSON 배열만)
- 분리 불필요: {"id": 1, "speaker": "D"}
- 분리 필요: {"id": "1a", "speaker": "P", "text": "..."}, {"id": "1b", "speaker": "D", "text": "..."}

모든 발화를 빠짐없이 출력하세요.`;

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

    const parsed: Array<{ id: number | string; speaker: string; text?: string }> = JSON.parse(jsonMatch[0]);
    
    // id 기반으로 원래 발화 텍스트와 매칭
    const result: SpeakerSegment[] = parsed.map((item) => {
      const speaker = item.speaker === 'D' ? 'doctor' : 'patient';
      
      // 분리된 발화 (id가 "1a", "1b" 형태이고 text가 있음)
      if (item.text) {
        return { speaker, text: item.text };
      }
      
      // 분리 안된 발화 (id가 숫자)
      const idx = typeof item.id === 'number' ? item.id - 1 : parseInt(String(item.id)) - 1;
      return { speaker, text: utterances[idx] || '' };
    }).filter(seg => seg.text); // 빈 텍스트 제거

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
    
    // 새로 추가된 발화만 pending으로 표시
    const pendingSegment: SpeakerSegment = {
      speaker: 'pending',
      text: text,
    };
    
    // 기존 분류된 세그먼트 + 새 발화만 pending으로
    this.onSegmentsUpdate([...this.classifiedSegments, pendingSegment]);
    
    console.log(`📝 새 발화 #${this.utterances.length}: ${text.substring(0, 40)}...`);

    // 디바운스: 2초 동안 새 발화 없으면 화자분류 실행
    if (this.classifyTimer) {
      clearTimeout(this.classifyTimer);
    }
    
    this.classifyTimer = setTimeout(() => {
      this.classifyRecentUtterances();
    }, 2000);
  }

  // 최근 N개 발화 기반 화자분류 (GPT-4o)
  private async classifyRecentUtterances() {
    const unclassifiedCount = this.utterances.length - this.classifiedUtteranceCount;
    
    // 분류할 게 없으면 스킵
    if (unclassifiedCount === 0) {
      return;
    }
    
    // 분류 중이면 스킵
    if (this.isClassifying) {
      return;
    }

    this.isClassifying = true;

    // 최근 WINDOW_SIZE개 발화만 분류
    const startIdx = Math.max(0, this.utterances.length - this.WINDOW_SIZE);
    const recentUtterances = this.utterances.slice(startIdx);
    
    console.log(`🤖 최근 ${recentUtterances.length}개 발화 화자분류 시작`);
    console.log(`📤 [GPT 입력]`, recentUtterances);

    try {
      const newSegments = await classifyUtterancesWithGPT(recentUtterances);
      
      console.log(`📥 [GPT 출력] ${newSegments.length}개 세그먼트:`);
      newSegments.forEach((seg, i) => {
        console.log(`   ${i+1}. [${seg.speaker}] "${seg.text}"`);
      });
      
      if (newSegments.length > 0) {
        // startIdx 이전 세그먼트는 유지, 이후는 새로 분류된 것으로 교체
        const keepSegments = this.classifiedSegments.slice(0, startIdx);
        this.classifiedSegments = [...keepSegments, ...newSegments];
        
        this.classifiedUtteranceCount = this.utterances.length;
        this.onSegmentsUpdate([...this.classifiedSegments]);
        console.log(`✅ 화자분류 완료: ${this.classifiedSegments.length}개 세그먼트`);
      }
    } catch (error) {
      console.error('❌ 화자분류 오류:', error);
    } finally {
      this.isClassifying = false;
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

export default {
  DeepgramRealtimeTranscriber,
};
