// OpenAI API 키 - 실제 배포 시에는 환경변수나 서버 사이드로 이동 필요
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// Whisper 응답 타입 (verbose_json)
export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments?: WhisperSegment[];
  duration?: number;
}

// Whisper 환각 필터 (유튜브 학습으로 인한 환각 + 프롬프트 spillover)
const HALLUCINATION_PATTERNS = [
  /구독.*좋아요/gi,
  /좋아요.*구독/gi,
  /시청.*감사/gi,
  /댓글.*부탁/gi,
  /구독.*부탁/gi,
  /Thanks.*watching/gi,
  /subscribe/gi,
  /like.*subscribe/gi,
  /안녕하십니까\?$/,  // 단독 "안녕하십니까?"도 환각일 가능성
  /^안녕\.?$/,  // 단독 "안녕"
  /유료광고/gi,
  /재택플러스/gi,
  /전해드렸습니다/gi,
  /어벤저스/gi,
  /번식의 비결/gi,
  // Whisper 프롬프트 spillover 패턴
  /충치,?\s*잇몸\s*질환,?\s*신경치료,?\s*스케일링/gi,
  /소화불량,?\s*위염,?\s*역류성/gi,
  /여드름,?\s*습진,?\s*아토피/gi,
  /관절,?\s*통증,?\s*골절/gi,
  /우울,?\s*불안,?\s*수면/gi,
  /발열,?\s*감기,?\s*예방접종/gi,
];

// 전체가 환각인지 체크 (완전히 무시할 패턴)
const FULL_HALLUCINATION_PATTERNS = [
  /^시청.*감사.*$/i,
  /^구독.*좋아요.*$/i,
  /^Thanks.*watching.*$/i,
  /^지금까지.*전해드렸습니다.*$/i,
  /^이 동영상.*유료광고.*$/i,
  /^감사합니다\.?$/i,
  /array|vå|Hmm|복재|애국|어벤저스|번식|권법|분류/i,  // 의미없는 환각 키워드
  /관련 대화입니다/i,  // Whisper 프롬프트 spillover
  /진료 대화입니다/i,  // Whisper 프롬프트 spillover
  /에 대해 이야기합니다/i,  // Whisper 프롬프트 spillover
  /블루레드|영상\s*효과|고생했던\s*시절/i,  // 유튜브/영상 관련 환각
  /새해\s*복\s*많이/i,  // 인사말 환각
  /^.{0,5}(효과|시절|플세).{0,10}$/i,  // 짧고 무의미한 환각
];

function filterHallucinations(text: string): string {
  // 전체가 환각인 경우 빈 문자열 반환
  for (const pattern of FULL_HALLUCINATION_PATTERNS) {
    if (pattern.test(text.trim())) {
      console.log('🧹 전체 환각 감지, 건너뜀:', text.slice(0, 30));
      return '';
    }
  }
  
  let filtered = text;
  for (const pattern of HALLUCINATION_PATTERNS) {
    filtered = filtered.replace(pattern, '').trim();
  }
  
  // 연속 공백 정리
  filtered = filtered.replace(/\s+/g, ' ').trim();
  
  // 필터 후 너무 짧으면 (3자 이하) 환각으로 간주
  if (filtered.length <= 3) {
    console.log('🧹 필터 후 너무 짧음, 건너뜀:', text.slice(0, 30));
    return '';
  }
  
  return filtered;
}

// 진료과별 Whisper 프롬프트 (최소화 - 환각 방지)
// 주의: 프롬프트가 길거나 키워드 나열이 많으면 Whisper가 프롬프트를 대화로 출력함
const DEPARTMENT_WHISPER_PROMPTS: Record<string, string> = {
  general: '의사와 환자의 진료 대화.',
  internal: '내과 진료 대화.',
  dermatology: '피부과 진료 대화.',
  orthopedics: '정형외과 진료 대화.',
  psychiatry: '정신건강의학과 진료 대화.',
  pediatrics: '소아청소년과 진료 대화.',
  dentistry: '치과 진료 대화.',
  custom: '의사와 환자의 진료 대화.',
};

// 타임스탬프 포함 트랜스크립션 (verbose_json)
export async function transcribeAudioWithTimestamps(
  audioBlob: Blob, 
  department: string = 'general'
): Promise<TranscriptionResult | null> {
  console.log('🎤 Transcribe (verbose) 시작, Blob 크기:', audioBlob.size, 'bytes');
  console.log('🏥 진료과 힌트:', department);
  
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    return null;
  }

  // 진료과별 프롬프트 선택
  const whisperPrompt = DEPARTMENT_WHISPER_PROMPTS[department] || DEPARTMENT_WHISPER_PROMPTS.general;

  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ko');
    formData.append('response_format', 'verbose_json');
    // 진료과별 컨텍스트 프롬프트 (인식률 향상)
    formData.append('prompt', whisperPrompt);

    console.log('📡 OpenAI API 호출 중 (verbose_json)...');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Transcription API error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    
    // 환각 필터링 적용
    const filteredText = filterHallucinations(result.text || '');
    
    if (filteredText !== result.text) {
      console.log('🧹 환각 필터링됨:', result.text?.slice(0, 30), '→', filteredText?.slice(0, 30));
    }
    
    console.log('✅ 변환 결과:', filteredText?.slice(0, 50) + '...');
    console.log('📊 세그먼트 수:', result.segments?.length || 0);
    
    return {
      text: filteredText,
      segments: result.segments || [],
      duration: result.duration
    };
  } catch (error) {
    console.error('❌ Transcription request failed:', error);
    return null;
  }
}

// 간단한 텍스트만 반환 (기존 호환성 유지)
export async function transcribeAudio(
  audioBlob: Blob, 
  department: string = 'general'
): Promise<string | null> {
  const result = await transcribeAudioWithTimestamps(audioBlob, department);
  return result?.text || null;
}

// GPT로 전체 대화를 화자별로 분리하기
export interface SpeakerSegment {
  speaker: 'doctor' | 'patient' | 'pending';  // pending = 화자분리 대기 중
  text: string;
  startTime?: number;  // 초 단위 (오디오 재생용)
  endTime?: number;    // 초 단위
}

export async function splitBySpeaker(
  fullText: string, 
  previousContext?: SpeakerSegment[]
): Promise<SpeakerSegment[]> {
  if (!OPENAI_API_KEY) {
    return [{ speaker: 'patient', text: fullText }];
  }

  // 이전 대화 컨텍스트 생성 (마지막 4개 발화)
  let contextInfo = '';
  if (previousContext && previousContext.length > 0) {
    const recentContext = previousContext.slice(-4); // 마지막 4개만
    const contextLines = recentContext.map(s => 
      `${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`
    ).join('\n');
    contextInfo = `\n\n## 이전 대화 (참고용, 화자 흐름 파악에 활용)\n${contextLines}\n\n---\n이어지는 새 대화를 분리하세요:`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `당신은 의료 대화 전문 스크라이버입니다.
당신의 주 임무는 음성 인식 텍스트를 의사(D)와 환자(P)의 발화로 '분리'하는 것입니다.

## 1. 원본 텍스트 유지 (가장 중요!)
- 내용을 창작하거나 새로운 정보를 추측해서 채워 넣지 마세요.
- 문장이 어색하거나 문법적으로 틀렸더라도, Whisper가 인식한 원본의 의도를 최대한 유지하세요.
- 단어 수정은 명백한 오타(예: "위험이나 영유성" → "위염이나 역류성") 수준으로 최소화하세요.

## 2. 화자 판단 및 분리
- 의사(D): 질문, 진단, 처방, 지시("~하세요", "~드릴게요")
- 환자(P): 증상 호소, 답변, "선생님" 호칭
- 한 문장 안에 두 화자의 말이 섞여 있으면 반드시 분리하세요!
  예: "네 알겠습니다. 2주 후에 오세요." → P: "네 알겠습니다." + D: "2주 후에 오세요."
- 같은 화자의 연속된 짧은 문장은 하나로 합치세요 (자연스러운 문장 단위로)
  예: D: "그러면 일단..." + D: "확인을 해볼게요." → D: "그러면 일단 확인을 해볼게요."

## 3. 환각(hallucination) 제거 - 매우 중요!
다음과 같은 진료와 무관한 문장은 완전히 제외하세요:
- 유튜브/방송 멘트: "구독", "좋아요", "시청", "영상", "효과", "블루레드", "플세"
- 인사말 환각: "새해 복 많이 받으세요", "시청해주셔서 감사"
- 문맥과 완전히 무관한 문장 (진료 대화 흐름에서 벗어난 문장)
- 의미없는 텍스트: 외국어, 숫자, 알 수 없는 단어 나열

## 4. 정리 규칙
- 필러워드(음, 어, 그) 제거 및 문장부호 추가
- 빈 텍스트는 출력하지 마세요.

## 출력 형식 (JSON만, 다른 텍스트 없이)
[{"speaker":"D","text":"정리된 텍스트"},{"speaker":"P","text":"정리된 텍스트"}]`
          },
          {
            role: 'user',
            content: contextInfo + fullText
          }
        ],
        max_tokens: 4000,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error('❌ Speaker split failed');
      return [{ speaker: 'patient', text: fullText }];
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content?.trim();
    
    console.log('🤖 GPT 응답:', content?.slice(0, 200) + '...');
    
    try {
      const parsed = JSON.parse(content);
      const segments: SpeakerSegment[] = parsed
        .map((item: { speaker: string; text: string }) => ({
          speaker: item.speaker === 'D' ? 'doctor' as const : 'patient' as const,
          text: item.text?.trim() || ''
        }))
        // 빈 텍스트 필터링
        .filter((s: SpeakerSegment) => s.text && s.text.length > 0);
      
      console.log('✅ 파싱 성공:', segments.length, '개 발화');
      segments.forEach((s: SpeakerSegment, i: number) => {
        console.log(`  ${i + 1}. ${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text.slice(0, 30)}...`);
      });
      return segments;
    } catch {
      console.error('❌ JSON parse error:', content);
      return [{ speaker: 'patient', text: fullText }];
    }
  } catch (error) {
    console.error('❌ Speaker split error:', error);
    return [{ speaker: 'patient', text: fullText }];
  }
}

// 타임스탬프가 포함된 원본 세그먼트
interface RawSegmentWithTime {
  text: string;
  startTime: number;
  endTime: number;
}

// VAD 기반 실시간 트랜스크립션 + 점진적 화자분리 (1시간+ 녹음 지원)
export class RealtimeTranscriber {
  private allChunks: Blob[] = []; // 전체 청크 (헤더 포함)
  private pendingChunks: Blob[] = []; // VAD 트리거 전까지의 청크
  private pendingChunkStartTime = 0; // 현재 pending 청크들의 시작 시간
  private rawSegments: string[] = []; // Whisper 변환된 원본 텍스트들
  private rawSegmentsWithTime: RawSegmentWithTime[] = []; // 타임스탬프 포함
  private processedSegmentCount = 0; // 화자분리 완료된 세그먼트 수
  private speakerSegments: SpeakerSegment[] = []; // 화자분리된 결과
  private processingQueue: Promise<void> = Promise.resolve();
  private onFullUpdate: (segments: SpeakerSegment[]) => void;
  private isProcessing = false;
  private isSplitting = false; // 화자분리 중
  private department: string; // 진료과 정보 (Whisper 힌트용)
  private currentTime = 0; // 현재까지의 누적 시간 (초)
  
  // VAD 설정
  private silenceCount = 0;
  private readonly SILENCE_THRESHOLD = 5; // 0.5초 침묵 (100ms * 5)
  private readonly MIN_CHUNK_SIZE = 3; // 최소 0.3초 이상이어야 처리
  
  // 강제 처리 설정 (침묵 없이도 실시간 처리)
  // 값이 클수록 문장이 덜 잘리지만 실시간성이 떨어짐
  private readonly FORCE_PROCESS_CHUNKS = 10; // 10개 청크(10초)마다 강제 처리
  
  // 점진적 화자분리 설정 (긴 녹음 지원)
  private readonly SPLIT_BATCH_SIZE = 3; // 3개 세그먼트마다 화자분리

  constructor(
    _onRawTranscript: (text: string) => void,
    onFullUpdate?: (segments: SpeakerSegment[]) => void,
    department: string = 'general'
  ) {
    this.onFullUpdate = onFullUpdate || (() => {});
    this.department = department;
    console.log('🏥 RealtimeTranscriber 생성, 진료과:', department);
  }
  
  // 전체 오디오 Blob getter (재생용)
  getFullAudioBlob(): Blob {
    return new Blob(this.allChunks, { type: 'audio/webm' });
  }

  // 청크 추가 + VAD (침묵 감지) + 강제 처리
  addChunk(chunk: Blob, isSilent: boolean = false, elapsedTime?: number) {
    this.allChunks.push(chunk);
    
    // 첫 번째 pending 청크면 시작 시간 기록
    if (this.pendingChunks.length === 0 && elapsedTime !== undefined) {
      this.pendingChunkStartTime = elapsedTime - 1; // 1초 전 (청크가 1초 단위이므로)
    }
    
    this.pendingChunks.push(chunk);
    
    // 실제 녹음 경과 시간 업데이트 (더 정확한 타임스탬프)
    if (elapsedTime !== undefined) {
      this.currentTime = elapsedTime;
    }
    
    let shouldProcess = false;
    
    if (isSilent) {
      this.silenceCount++;
      
      // 침묵이 지속되면 → 발화 종료로 판단
      if (this.silenceCount >= this.SILENCE_THRESHOLD && 
          this.pendingChunks.length >= this.MIN_CHUNK_SIZE) {
        console.log(`🔇 침묵 감지! ${this.pendingChunks.length}개 청크 처리`);
        shouldProcess = true;
      }
    } else {
      this.silenceCount = 0;
    }
    
    // 강제 처리: 침묵 없이도 일정 시간마다 처리 (실시간성 보장)
    if (!shouldProcess && 
        this.pendingChunks.length >= this.FORCE_PROCESS_CHUNKS &&
        !this.isProcessing) {
      console.log(`⏰ 강제 처리! ${this.pendingChunks.length}개 청크`);
      shouldProcess = true;
    }
    
    if (shouldProcess && !this.isProcessing) {
      const chunksToProcess = [...this.pendingChunks];
      const segmentStartTime = this.pendingChunkStartTime;
      const segmentEndTime = this.currentTime;
      this.pendingChunks = [];
      this.silenceCount = 0;
      
      this.processingQueue = this.processingQueue.then(() => 
        this.processSegment(chunksToProcess, segmentStartTime, segmentEndTime)
      );
    }
    
    return false;
  }

  // 발화 세그먼트 처리 (Whisper)
  private async processSegment(chunks: Blob[], startTime: number, endTime: number) {
    if (chunks.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      const headerChunk = this.allChunks[0];
      const segmentBlob = new Blob([headerChunk, ...chunks], { type: 'audio/webm' });
      
      console.log(`⚡ 세그먼트 처리, ${chunks.length}청크, ${(segmentBlob.size / 1024).toFixed(1)}KB, 시간: ${startTime.toFixed(1)}~${endTime.toFixed(1)}초`);
      
      const text = await transcribeAudio(segmentBlob, this.department);

      // 빈 결과 (환각 필터링됨) 스킵
      if (!text || !text.trim()) {
        console.log('⏭️ 빈 결과 스킵');
        return;
      }
      
      this.rawSegments.push(text.trim());
      this.rawSegmentsWithTime.push({
        text: text.trim(),
        startTime: startTime,
        endTime: endTime
      });
      console.log(`📝 세그먼트 ${this.rawSegments.length}: "${text.slice(0, 40)}..." (${startTime.toFixed(1)}~${endTime.toFixed(1)}초)`);
      
      // 점진적 화자분리 트리거 (SPLIT_BATCH_SIZE마다)
      const unprocessedCount = this.rawSegments.length - this.processedSegmentCount;
      if (unprocessedCount >= this.SPLIT_BATCH_SIZE && !this.isSplitting) {
        await this.splitUnprocessedSegments();
      } else {
        // 실시간 미리보기 업데이트 (미분리 텍스트 + 분리된 결과)
        this.updatePreview();
      }
    } catch (error) {
      console.error('❌ Segment processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // 미처리 세그먼트들 화자분리
  private async splitUnprocessedSegments() {
    const unprocessedTexts = this.rawSegments.slice(this.processedSegmentCount);
    const unprocessedWithTime = this.rawSegmentsWithTime.slice(this.processedSegmentCount);
    if (unprocessedTexts.length === 0) return;
    
    this.isSplitting = true;
    const batchText = unprocessedTexts.join(' ');
    
    // 이 배치의 시간 범위 계산
    const batchStartTime = unprocessedWithTime[0]?.startTime || 0;
    const batchEndTime = unprocessedWithTime[unprocessedWithTime.length - 1]?.endTime || batchStartTime;
    
    console.log(`🔎 점진적 화자분리 (${unprocessedTexts.length}개 세그먼트, ${batchStartTime}~${batchEndTime}초)...`);
    console.log(`📄 입력 텍스트: "${batchText.slice(0, 100)}..."`);
    console.log(`📚 이전 컨텍스트: ${this.speakerSegments.length}개 발화`);
    
    try {
      // 이전 대화 컨텍스트 전달 → 화자분리 정확도 향상
      const newSpeakerSegments = await splitBySpeaker(batchText, this.speakerSegments);
      
      // 타임스탬프 할당 (텍스트 길이 비례 분배 - 더 정확한 싱크)
      const totalDuration = batchEndTime - batchStartTime;
      const totalTextLength = newSpeakerSegments.reduce((sum, seg) => sum + seg.text.length, 0);
      
      let currentOffset = 0;
      newSpeakerSegments.forEach((seg) => {
        const segmentRatio = totalTextLength > 0 ? seg.text.length / totalTextLength : 0;
        const segmentDuration = totalDuration * segmentRatio;
        
        seg.startTime = batchStartTime + currentOffset;
        seg.endTime = batchStartTime + currentOffset + segmentDuration;
        currentOffset += segmentDuration;
      });
      
      // 이전 결과에 추가
      this.speakerSegments.push(...newSpeakerSegments);
      this.processedSegmentCount = this.rawSegments.length;
      
      console.log(`✅ 화자분리 완료! 누적 ${this.speakerSegments.length}개 발화`);
      console.log('📊 최종 speakerSegments:', JSON.stringify(this.speakerSegments.map(s => ({ 
        speaker: s.speaker, 
        text: s.text.slice(0, 30) + '...',
        time: `${s.startTime?.toFixed(1)}~${s.endTime?.toFixed(1)}s`
      }))));
      
      // 화자분리된 결과로 UI 업데이트
      this.onFullUpdate([...this.speakerSegments]); // 새 배열로 전달
    } catch (error) {
      console.error('❌ Split error:', error);
      this.updatePreview(); // 실패 시 미리보기로 대체
    } finally {
      this.isSplitting = false;
    }
  }

  // 실시간 미리보기 업데이트
  private updatePreview() {
    const unprocessedTexts = this.rawSegments.slice(this.processedSegmentCount);
    
    console.log(`👁️ updatePreview 호출 - 분리됨: ${this.speakerSegments.length}개, 대기중: ${unprocessedTexts.length}개`);
    
    // 항상 미리보기 업데이트 (빈 상태도 포함)
    const preview: SpeakerSegment[] = [
      ...this.speakerSegments,
      ...(unprocessedTexts.length > 0 
        ? [{ speaker: 'pending' as const, text: unprocessedTexts.join(' ') }]
        : [])
    ];
    
    console.log(`📺 UI 업데이트: ${preview.length}개 세그먼트`);
    this.onFullUpdate(preview);
  }

  // 녹음 종료 시 - 남은 청크 처리 + 최종 화자분리
  async flush() {
    console.log('🔚 flush() 시작...');
    console.log(`  - rawSegments: ${this.rawSegments.length}개`);
    console.log(`  - processedSegmentCount: ${this.processedSegmentCount}`);
    console.log(`  - speakerSegments: ${this.speakerSegments.length}개`);
    console.log(`  - pendingChunks: ${this.pendingChunks.length}개`);
    
    // 남은 pending 청크 처리
    if (this.pendingChunks.length >= this.MIN_CHUNK_SIZE) {
      console.log('🔚 남은 청크 처리...');
      const chunksToProcess = [...this.pendingChunks];
      const segmentStartTime = this.pendingChunkStartTime;
      const segmentEndTime = this.currentTime;
      this.pendingChunks = [];
      await this.processSegment(chunksToProcess, segmentStartTime, segmentEndTime);
    }
    
    await this.processingQueue;
    
    while (this.isProcessing || this.isSplitting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('🔚 flush() 처리 완료 후 상태:');
    console.log(`  - rawSegments: ${this.rawSegments.length}개`);
    console.log(`  - processedSegmentCount: ${this.processedSegmentCount}`);
    console.log(`  - speakerSegments: ${this.speakerSegments.length}개`);
    
    // 미처리 세그먼트 최종 화자분리
    if (this.rawSegments.length > this.processedSegmentCount) {
      console.log('🔚 최종 화자분리 필요...');
      await this.splitUnprocessedSegments();
    }
    
    // 최종 결과 전달
    if (this.speakerSegments.length > 0) {
      console.log(`✅ 최종 완료! 총 ${this.speakerSegments.length}개 발화`);
      console.log('📊 최종 결과:', this.speakerSegments.map(s => `${s.speaker}: ${s.text.slice(0, 20)}...`));
      this.onFullUpdate([...this.speakerSegments]);
    } else {
      console.log('⚠️ speakerSegments가 비어있음!');
    }
  }

  reset() {
    this.allChunks = [];
    this.pendingChunks = [];
    this.rawSegments = [];
    this.rawSegmentsWithTime = [];
    this.processedSegmentCount = 0;
    this.speakerSegments = [];
    this.processingQueue = Promise.resolve();
    this.isProcessing = false;
    this.isSplitting = false;
    this.silenceCount = 0;
    this.currentTime = 0;
  }
}

// ==================== SOAP 차트 생성 ====================

export interface ChartingData {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  assessment: string;
  plan: string;
  diagnosis: string[];
  medications: string[];
}

export async function generateSOAPChart(segments: SpeakerSegment[]): Promise<ChartingData | null> {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    return null;
  }

  // 대화 내용 포맷팅
  const conversation = segments
    .filter(s => s.speaker !== 'pending')
    .map(s => `${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`)
    .join('\n');

  if (!conversation.trim()) {
    console.error('❌ 대화 내용이 없습니다.');
    return null;
  }

  console.log('📋 SOAP 차트 생성 시작...');
  console.log('📝 대화 내용:', conversation.slice(0, 200) + '...');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `당신은 숙련된 의료 문서 작성 전문가입니다. 의사-환자 대화를 분석하여 SOAP 형식의 의료 차트를 작성합니다.

다음 JSON 형식으로만 답변하세요:
{
  "chiefComplaint": "주 호소 (환자가 방문한 주된 이유, 1-2문장)",
  "historyOfPresentIllness": "현병력 (증상의 시작, 경과, 특징 등 상세 기술)",
  "assessment": "평가 (의사의 임상적 판단과 감별진단)",
  "plan": "치료 계획 (검사, 처방, 추적관찰 계획 등)",
  "diagnosis": ["진단명1", "진단명2"],
  "medications": ["약물1 용량 용법", "약물2 용량 용법"]
}

지침:
- 대화에서 언급된 내용만 포함하세요
- 언급되지 않은 항목은 빈 문자열 또는 빈 배열로 남기세요
- 의학적으로 정확한 용어를 사용하세요
- 환자의 증상을 왜곡하지 마세요`
          },
          {
            role: 'user',
            content: `다음 진료 대화를 분석하여 SOAP 차트를 작성해주세요:\n\n${conversation}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ SOAP 생성 API 오류:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content?.trim();
    
    console.log('🤖 GPT 응답:', content?.slice(0, 200) + '...');

    try {
      // JSON 파싱 (markdown 코드블록 제거)
      const jsonStr = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const chartData: ChartingData = JSON.parse(jsonStr);
      
      // 기본값 설정
      chartData.chiefComplaint = chartData.chiefComplaint || '';
      chartData.historyOfPresentIllness = chartData.historyOfPresentIllness || '';
      chartData.assessment = chartData.assessment || '';
      chartData.plan = chartData.plan || '';
      chartData.diagnosis = chartData.diagnosis || [];
      chartData.medications = chartData.medications || [];

      console.log('✅ SOAP 차트 생성 완료!');
      console.log('  - 주호소:', chartData.chiefComplaint?.slice(0, 50));
      console.log('  - 진단:', chartData.diagnosis);
      console.log('  - 약물:', chartData.medications);
      
      return chartData;
    } catch (parseError) {
      console.error('❌ JSON 파싱 오류:', parseError, content);
      return null;
    }
  } catch (error) {
    console.error('❌ SOAP 생성 요청 실패:', error);
    return null;
  }
}
