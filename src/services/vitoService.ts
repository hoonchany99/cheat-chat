// 리턴제로 VITO STT API 서비스 - 실시간 스트리밍 전사 + GPT 화자분류
// 녹음 중 VITO 실시간 전사 → 녹음 종료 후 GPT 화자 분류

const VITO_CLIENT_ID = import.meta.env.VITE_VITO_CLIENT_ID || '';
const VITO_CLIENT_SECRET = import.meta.env.VITE_VITO_CLIENT_SECRET || '';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// 화자별 세그먼트 인터페이스
export interface SpeakerSegment {
  speaker: 'doctor' | 'patient' | 'pending';
  text: string;
  startTime?: number;
  endTime?: number;
}

// 토큰 캐시
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// 진료과별 의료 키워드 (키워드 부스팅용) - 한글만 허용
const MEDICAL_KEYWORDS: Record<string, string[]> = {
  general: [
    '혈압', '맥박', '체온', '호흡', '산소포화도',
    '처방', '투약', '진단', '증상', '경과',
    '검사', '혈액검사', '엑스레이', '시티', '엠알아이',
    '환자', '의사', '선생님', '원장님',
  ],
  internal: [
    '위염', '역류성', '소화불량', '변비', '설사',
    '고혈압', '당뇨', '고지혈증', '간수치', '신장',
    '내시경', '초음파', '심전도', '폐기능',
  ],
  dermatology: [
    '여드름', '습진', '아토피', '건선', '두드러기',
    '발진', '가려움', '색소침착', '흉터', '레이저',
    '연고', '스테로이드', '항히스타민',
  ],
  orthopedics: [
    '골절', '염좌', '탈구', '관절염', '디스크',
    '척추', '무릎', '어깨', '허리', '목',
    '물리치료', '재활', '깁스', '보조기',
  ],
  psychiatry: [
    '우울증', '불안', '공황', '불면증', '스트레스',
    '조현병', '양극성', '강박', '주의력결핍', '치매',
    '상담', '약물치료', '인지행동치료',
  ],
  pediatrics: [
    '발열', '감기', '기침', '콧물', '중이염',
    '예방접종', '성장', '발달', '모유', '분유',
    '아토피', '알레르기', '천식',
  ],
  dentistry: [
    '충치', '치아', '잇몸', '치주염', '치은염',
    '신경치료', '발치', '임플란트', '크라운', '브릿지',
    '스케일링', '사랑니', '교정', '치석', '치태',
    '법랑질', '상아질', '치수', '치근', '치조골',
    '불소', '레진', '아말감', '세라믹',
  ],
  custom: [],
};

// 환각 필터 패턴
const HALLUCINATION_PATTERNS = [
  /구독.*좋아요/gi,
  /좋아요.*구독/gi,
  /시청.*감사/gi,
  /Thanks.*watching/gi,
  /subscribe/gi,
  /새해\s*복\s*많이/gi,
  /블루레드|영상\s*효과/gi,
];

function filterHallucinations(text: string): string {
  let filtered = text;
  for (const pattern of HALLUCINATION_PATTERNS) {
    filtered = filtered.replace(pattern, '').trim();
  }
  return filtered.replace(/\s+/g, ' ').trim();
}

// GPT 기반 화자 분류 + 발화 재분리 함수
async function classifySpeakersWithGPT(
  fullText: string
): Promise<SpeakerSegment[]> {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API 키 없음, 화자분류 건너뜀');
    return [{ speaker: 'pending', text: fullText }];
  }

  if (!fullText.trim()) {
    console.warn('⚠️ 전사된 텍스트 없음');
    return [];
  }

  console.log('🤖 GPT 화자 분류 시작...');
  console.log('📝 입력 텍스트:', fullText.substring(0, 200) + '...');

  const prompt = `한국어 의료 상담 대화를 의사(D)와 환자(P)로 분류하세요.

## 핵심 규칙

**의사(D)의 특징:**
- 질문을 함: "~세요?", "~나요?", "~시죠?", "있으세요?"
- 선택지 제시: "아니면~", "~거나~", "또는~"
- 지시/안내: "~해볼게요", "~드릴게요"
- 의료 용어 설명

**환자(P)의 특징:**
- 증상 설명: "~아파요", "~떨려요", "~것 같습니다", "~것 같아요"
- 질문에 대답: "네", "예", "아니요", 구체적 정보 제공
- 기간/정도 답변: "3개월 전부터", "많이", "조금"

## 예시

입력: "이름은 홍길동이고 123456번입니다. 어떻게 오셨어요?"
→ P: "이름은 홍길동이고 123456번입니다."
→ D: "어떻게 오셨어요?"

## 입력 텍스트
${fullText}

## 출력
반드시 JSON 배열만 출력하세요. 다른 설명 없이:
[{"speaker": "D", "text": "..."}, {"speaker": "P", "text": "..."}, ...]`;

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
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      throw new Error(`GPT API 오류: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || '';
    
    console.log('🤖 GPT 응답:', content.substring(0, 300) + '...');

    // JSON 배열 파싱
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('GPT 응답에서 JSON 배열을 찾을 수 없음');
    }

    const parsed: Array<{ speaker: string; text: string }> = JSON.parse(jsonMatch[0]);
    
    const result: SpeakerSegment[] = parsed.map((item) => ({
      speaker: item.speaker === 'D' ? 'doctor' : 'patient',
      text: item.text,
    }));

    // 결과 로깅
    const doctorCount = result.filter(s => s.speaker === 'doctor').length;
    const patientCount = result.filter(s => s.speaker === 'patient').length;
    console.log(`✅ GPT 화자 분류 완료: 👨‍⚕️ 의사 ${doctorCount}개, 🙋 환자 ${patientCount}개`);

    return result;
  } catch (error) {
    console.error('❌ GPT 화자 분류 오류:', error);
    return [{ speaker: 'pending', text: fullText }];
  }
}

// JWT 토큰 발급
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  if (!VITO_CLIENT_ID || !VITO_CLIENT_SECRET) {
    throw new Error('VITO API 키가 설정되지 않았습니다.');
  }

  console.log('🔑 VITO 토큰 발급 요청...');

  const response = await fetch('/api/vito/v1/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `client_id=${encodeURIComponent(VITO_CLIENT_ID)}&client_secret=${encodeURIComponent(VITO_CLIENT_SECRET)}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VITO 인증 오류: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expire_at ? data.expire_at * 1000 : 3600000);
  
  console.log('✅ VITO 토큰 발급 완료');
  return cachedToken!;
}

// VITO 실시간 스트리밍 전사 클래스
export class VitoRealtimeTranscriber {
  private ws: WebSocket | null = null;
  private onRealtimeText: (text: string) => void;
  private onFullUpdate: (segments: SpeakerSegment[]) => void;
  private department: string;
  private accumulatedText: string = ''; // 누적 텍스트 (최종 결과만)
  private currentInterim: string = ''; // 현재 임시 결과
  private isConnected: boolean = false;
  private audioContext: AudioContext | null = null;
  private recordingDuration: number = 0;
  
  constructor(
    onRealtimeText: (text: string) => void,
    onFullUpdate?: (segments: SpeakerSegment[]) => void,
    department: string = 'general'
  ) {
    this.onRealtimeText = onRealtimeText;
    this.onFullUpdate = onFullUpdate || (() => {});
    this.department = department;
    console.log('🏥 VitoRealtimeTranscriber 생성, 진료과:', department);
  }

  // WebSocket 연결 시작
  async connect(): Promise<void> {
    try {
      const token = await getAccessToken();
      
      // 의료 키워드 가져오기
      const keywords = [
        ...MEDICAL_KEYWORDS.general,
        ...(MEDICAL_KEYWORDS[this.department] || []),
      ].slice(0, 100);

      // WebSocket 연결 (VITO 스트리밍 API)
      const config = {
        sample_rate: '16000',
        encoding: 'LINEAR16',
        use_itn: 'true',
        use_disfluency_filter: 'true',
        use_profanity_filter: 'false',
        keywords: keywords.join(','),
      };

      const queryString = new URLSearchParams(config).toString();
      const wsUrl = `wss://openapi.vito.ai/v1/transcribe:streaming?${queryString}`;
      
      console.log('🔌 VITO WebSocket 연결 시도...');
      
      this.ws = new WebSocket(wsUrl, ['bearer', token]);
      
      this.ws.onopen = () => {
        console.log('✅ VITO WebSocket 연결됨');
        this.isConnected = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.final) {
            // 최종 결과
            const text = filterHallucinations(data.alternatives?.[0]?.text || '');
            if (text) {
              this.accumulatedText += text + ' ';
              this.currentInterim = '';
              console.log('📝 최종:', text);
            }
          } else {
            // 임시 결과
            this.currentInterim = data.alternatives?.[0]?.text || '';
          }
          
          // UI 업데이트 (누적 + 현재 임시)
          const displayText = (this.accumulatedText + this.currentInterim).trim();
          this.onRealtimeText(displayText);
          
        } catch (e) {
          console.error('메시지 파싱 오류:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ VITO WebSocket 오류:', error);
      };

      this.ws.onclose = (event) => {
        console.log('🔌 VITO WebSocket 닫힘:', event.code, event.reason);
        this.isConnected = false;
      };

      // 연결 대기
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket 연결 타임아웃'));
        }, 10000);

        this.ws!.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          console.log('✅ VITO WebSocket 연결됨');
          resolve();
        };

        this.ws!.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket 연결 실패'));
        };
      });

    } catch (error) {
      console.error('❌ VITO 연결 오류:', error);
      throw error;
    }
  }

  // 오디오 청크 전송 (webm → PCM 변환 필요)
  async addChunk(chunk: Blob, _isSilent: boolean = false, elapsedTime?: number): Promise<void> {
    if (elapsedTime !== undefined) {
      this.recordingDuration = elapsedTime;
    }

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // webm blob을 ArrayBuffer로 변환
      const arrayBuffer = await chunk.arrayBuffer();
      
      // PCM으로 변환 (AudioContext 사용)
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 16000 });
      }
      
      try {
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
        const pcmData = this.convertToPCM16(audioBuffer);
        
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcmData);
        }
      } catch {
        // 디코딩 실패 시 무시 (일부 청크는 단독으로 디코딩 불가)
      }
    } catch (error) {
      // 조용히 실패 (연속 스트림에서 일부 청크 실패는 정상)
    }
  }

  // AudioBuffer를 16-bit PCM으로 변환
  private convertToPCM16(audioBuffer: AudioBuffer): ArrayBuffer {
    const channelData = audioBuffer.getChannelData(0);
    const pcmData = new Int16Array(channelData.length);
    
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return pcmData.buffer;
  }

  // 녹음 종료 및 화자 분류
  async flush(): Promise<SpeakerSegment[]> {
    console.log('🔚 flush() 호출 - 녹음 종료 및 화자 분류');
    
    // WebSocket 닫기
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // EOS 신호 전송
        this.ws.send('EOS');
      }
      
      // 잠시 대기 후 닫기
      await new Promise(resolve => setTimeout(resolve, 500));
      this.ws.close();
      this.ws = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // 최종 텍스트 확인
    const finalText = this.accumulatedText.trim();
    console.log('📝 최종 전사 텍스트:', finalText.substring(0, 200) + '...');
    console.log(`📊 총 길이: ${finalText.length}자, 녹음 시간: ${this.recordingDuration.toFixed(1)}초`);

    if (!finalText) {
      console.log('⚠️ 전사된 텍스트 없음');
      return [];
    }

    // GPT로 화자 분류
    const segments = await classifySpeakersWithGPT(finalText);
    
    this.onFullUpdate(segments);
    
    return segments;
  }

  // 전체 전사 텍스트 반환
  getFullText(): string {
    return this.accumulatedText.trim();
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
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.accumulatedText = '';
    this.currentInterim = '';
    this.isConnected = false;
    this.recordingDuration = 0;
    console.log('🔄 VitoRealtimeTranscriber 리셋');
  }
}

// 기본 export
export default {
  VitoRealtimeTranscriber,
};
