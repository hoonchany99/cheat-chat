import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Square, Loader2 } from 'lucide-react';
import { useDeepgram } from '@/services/deepgramService';
import { generateChartFromTranscriptStreaming, correctSTTErrors, ChartData } from '@/services/chartService';
import { toast } from 'sonner';

interface Segment {
  text: string;
  speaker: 'doctor' | 'patient' | 'pending';
}

const MAX_CONTEXT_SEGMENTS = 8;
const ENABLE_STT_CORRECTION = true;
const buildSegmentsKey = (segments: Segment[]) =>
  segments.map(segment => `${segment.speaker}:${segment.text}`).join('|');
interface VoiceRecorderProps {
  onTranscriptUpdate: (text: string) => void;
  onRealtimeSegment: (text: string) => void;
  onRealtimeSegmentsUpdate: (segments: Segment[]) => void;
  onFullUpdate: (transcript: string, segments: Segment[]) => void;
  onRecordingStart: () => void;
  onProcessingStart: () => void;
  onPartialChartUpdate?: (partial: ChartData) => void;
  onRecordingComplete: (transcript: string, chartResult: ChartData | null) => void;
  onApiStart?: () => void;
  onApiEnd?: () => void;
  onRecordingProgress?: (progress: number) => void;
  onRecordingTimeChange?: (time: number) => void;
  department?: string;
  // 모바일 마이크 연동을 위한 외부 상태
  isRemoteRecording?: boolean;
  remoteRecordingTime?: number;
  isExternalGenerating?: boolean;
  // 데모/테스트용 외부 녹음 상태
  isExternalRecording?: boolean;
  externalRecordingTime?: number;
  // 환자 정보
  patientName?: string;
  patientMemo?: string;
  // 선택된 마이크 장치 ID
  selectedDeviceId?: string;
  // 녹음 버튼 비활성화
  disabled?: boolean;
  // 비활성화 이유 (툴팁)
  disabledReason?: string;
}

export function VoiceRecorder({
  onTranscriptUpdate,
  onRealtimeSegment,
  onRealtimeSegmentsUpdate,
  onFullUpdate,
  onRecordingStart,
  onProcessingStart,
  onPartialChartUpdate,
  onRecordingComplete,
  onApiStart,
  onApiEnd,
  onRecordingProgress,
  onRecordingTimeChange,
  department = 'internal',
  isRemoteRecording = false,
  remoteRecordingTime = 0,
  isExternalGenerating = false,
  isExternalRecording = false,
  externalRecordingTime = 0,
  patientName = '',
  patientMemo = '',
  selectedDeviceId,
  disabled = false,
  disabledReason
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<number | null>(null);
  const lastFastCorrectionKeyRef = useRef('');
  const lastFastCorrectedSegmentsRef = useRef<Segment[] | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const fullTranscriptRef = useRef<string>('');

  const {
    connect,
    disconnect,
    isConnecting,
    error: deepgramError
  } = useDeepgram({
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        onTranscriptUpdate(fullTranscriptRef.current + (fullTranscriptRef.current ? ' ' : '') + text);
      }
      onRealtimeSegment(text);
    },
    onSegmentsUpdate: (segments) => {
      segmentsRef.current = segments;
      onRealtimeSegmentsUpdate(segments);
    },
    onFullUpdate: (transcript, segments) => {
      fullTranscriptRef.current = transcript;
      segmentsRef.current = segments;
      onFullUpdate(transcript, segments);
    }
  });

  useEffect(() => {
    if (deepgramError) {
      toast.error(`연결 오류: ${deepgramError}`);
    }
  }, [deepgramError]);


  const handleStartRecording = useCallback(async () => {
    try {
      fullTranscriptRef.current = '';
      segmentsRef.current = [];
      onTranscriptUpdate('');
      onRealtimeSegmentsUpdate([]);

      // 선택된 장치 ID가 있으면 해당 장치 사용, 없으면 기본 장치 사용
      const audioConstraints: MediaStreamConstraints['audio'] = selectedDeviceId 
        ? { deviceId: { exact: selectedDeviceId } }
        : true;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      mediaStreamRef.current = stream;

      await connect(stream);

      setIsRecording(true);
      setRecordingTime(0);
      if (onRecordingTimeChange) {
        onRecordingTimeChange(0);
      }
      onRecordingStart();

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (onRecordingProgress) {
            const progress = Math.min((newTime / 300) * 100, 100);
            onRecordingProgress(progress);
          }
          if (onRecordingTimeChange) {
            onRecordingTimeChange(newTime);
          }
          return newTime;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('마이크 권한을 허용해주세요');
    }
  }, [connect, onRecordingStart, onRecordingProgress, onRecordingTimeChange, onTranscriptUpdate, onRealtimeSegmentsUpdate, selectedDeviceId]);

  const handleStopRecording = useCallback(async () => {
      setIsRecording(false);
    setIsTranscribing(true);
    onProcessingStart();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop media stream first
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Wait for disconnect and get final results
    const { transcript: finalTranscript, segments: finalSegments } = await disconnect();
    
    // Update refs
    fullTranscriptRef.current = finalTranscript;
    segmentsRef.current = finalSegments;

    if (finalTranscript) {
      try {
        onApiStart?.();
        const segmentsForFast = finalSegments.slice(-MAX_CONTEXT_SEGMENTS);
        let fastCorrectedSegments = segmentsForFast;
        if (ENABLE_STT_CORRECTION) {
          const correctionKey = buildSegmentsKey(segmentsForFast);
          if (
            lastFastCorrectionKeyRef.current === correctionKey &&
            lastFastCorrectedSegmentsRef.current
          ) {
            fastCorrectedSegments = lastFastCorrectedSegmentsRef.current;
          } else {
            fastCorrectedSegments = await correctSTTErrors(segmentsForFast);
            lastFastCorrectionKeyRef.current = correctionKey;
            lastFastCorrectedSegmentsRef.current = fastCorrectedSegments;
          }
        }

        // 2. 전체 교정은 백그라운드로 진행 (UI는 완료 후 업데이트)
        if (ENABLE_STT_CORRECTION) {
          void correctSTTErrors(finalSegments)
            .then((fullyCorrected) => {
              onRealtimeSegmentsUpdate(fullyCorrected);
              const fastSegments = fullyCorrected.slice(-MAX_CONTEXT_SEGMENTS);
              lastFastCorrectionKeyRef.current = buildSegmentsKey(fastSegments);
              lastFastCorrectedSegmentsRef.current = fastSegments;
            })
            .catch((error) => {
              console.warn('STT correction (background) failed:', error);
            });
        } else {
          onRealtimeSegmentsUpdate(finalSegments);
        }
        
        // 3. 빠른 교정본으로 차트 생성 (Streaming)
        const contextSegments = fastCorrectedSegments;
        const correctedTranscript = contextSegments.map(s => s.text).join(' ');
        const result = await generateChartFromTranscriptStreaming(
          correctedTranscript,
          contextSegments,
          department,
          (partial) => {
            onPartialChartUpdate?.(partial);
          },
          undefined,
          true,
          { name: patientName, memo: patientMemo }
        );
        onRecordingComplete(correctedTranscript, result);
      } catch (error) {
        console.error('Chart generation error:', error);
        toast.error('차트 생성 중 오류가 발생했습니다');
        onRecordingComplete(finalTranscript, null);
      } finally {
        onApiEnd?.();
      }
    } else {
      lastFastCorrectionKeyRef.current = '';
      lastFastCorrectedSegmentsRef.current = null;
      toast.info('녹음된 내용이 없습니다');
      onRecordingComplete('', null);
    }

    setIsTranscribing(false);
  }, [disconnect, onProcessingStart, onRecordingComplete, department]);

  // 통합된 녹음 상태 (로컬, 원격, 또는 외부 데모)
  const isAnyRecording = isRecording || isRemoteRecording || isExternalRecording;
  const isAnyGenerating = isTranscribing || isExternalGenerating;

  return (
    <div className="relative">
      {isAnyGenerating ? (
        // 차트 생성 중일 때 점 3개 애니메이션
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-lg flex items-center justify-center gap-0.5">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      ) : !isAnyRecording ? (
        <Button
          onClick={handleStartRecording}
          disabled={isConnecting || isRemoteRecording || disabled}
          className="h-12 w-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-500/25 relative overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled && disabledReason ? disabledReason : '녹음 시작'}
        >
          {isConnecting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <div className="w-3 h-3 bg-white rounded-full" />
          )}
        </Button>
      ) : isRemoteRecording || isExternalRecording ? (
        // 모바일 녹음 중 또는 데모 중일 때는 버튼 비활성화
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 flex items-center justify-center opacity-50 cursor-not-allowed">
          <div className="w-3 h-3 bg-white rounded-full" />
        </div>
      ) : (
        <Button
          onClick={handleStopRecording}
          className="h-12 w-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white shadow-lg shadow-slate-700/25 transition-all hover:scale-105 active:scale-95"
        >
          <Square className="w-4 h-4 fill-current" />
        </Button>
      )}

      {/* Pulse animation when recording (데모 중에는 숨김) */}
      {isAnyRecording && !isExternalRecording && (
        <>
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
          <span className="absolute -inset-0.5 rounded-full bg-red-500/20 animate-pulse pointer-events-none" />
        </>
      )}
    </div>
  );
}
