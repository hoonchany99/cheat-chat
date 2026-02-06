import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Mic, Square, Loader2 } from 'lucide-react';
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
  department = 'internal',
  isRemoteRecording = false,
  remoteRecordingTime = 0,
  isExternalGenerating = false,
  isExternalRecording = false,
  externalRecordingTime = 0,
  patientName = '',
  patientMemo = ''
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformTick, setWaveformTick] = useState(0);
  const timerRef = useRef<number | null>(null);
  const lastFastCorrectionKeyRef = useRef('');
  const lastFastCorrectedSegmentsRef = useRef<Segment[] | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
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

  // 파형 애니메이션을 위한 주기적 업데이트 (로컬 또는 원격 녹음 시)
  useEffect(() => {
    if (!isRecording && !isRemoteRecording) return;
    
    const interval = setInterval(() => {
      setWaveformTick(prev => prev + 1);
    }, 50); // 20fps로 파형 업데이트
    
    return () => clearInterval(interval);
  }, [isRecording, isRemoteRecording]);

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(average / 255);
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (error) {
      console.error('Audio analysis error:', error);
    }
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      fullTranscriptRef.current = '';
      segmentsRef.current = [];
      onTranscriptUpdate('');
      onRealtimeSegmentsUpdate([]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      await connect(stream);

      startAudioAnalysis(stream);
      setIsRecording(true);
      setRecordingTime(0);
      onRecordingStart();

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (onRecordingProgress) {
            const progress = Math.min((newTime / 300) * 100, 100);
            onRecordingProgress(progress);
          }
          return newTime;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('마이크 권한을 허용해주세요');
    }
  }, [connect, startAudioAnalysis, onRecordingStart, onRecordingProgress, onTranscriptUpdate, onRealtimeSegmentsUpdate]);

  const handleStopRecording = useCallback(async () => {
      setIsRecording(false);
    setIsTranscribing(true);
    onProcessingStart();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      timerRef.current = null;
    }

    stopAudioAnalysis();
    
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
  }, [stopAudioAnalysis, disconnect, onProcessingStart, onRecordingComplete, department]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Waveform bars
  const bars = 7;
  const getBarHeight = (index: number) => {
    const baseHeight = 6;
    const maxAdditional = 28;
    // waveformTick을 사용하여 애니메이션 동기화
    const time = waveformTick * 50; // 50ms interval
    const phase1 = (time / 150 + index * 0.8) % (Math.PI * 2);
    const phase2 = (time / 100 + index * 1.2) % (Math.PI * 2);
    const wave = (Math.sin(phase1) * 0.4 + Math.sin(phase2) * 0.3 + 0.5);
    // audioLevel을 증폭 + 기본 움직임 추가 (모바일일 경우 기본 움직임만)
    const amplifiedLevel = isRemoteRecording ? 0.5 : Math.min(audioLevel * 2.5, 1);
    const minMovement = 0.3; // 소리가 작아도 최소 움직임
    return baseHeight + (Math.max(amplifiedLevel, minMovement) * maxAdditional * wave);
  };

  // 통합된 녹음 상태 (로컬, 원격, 또는 외부 데모)
  const isAnyRecording = isRecording || isRemoteRecording || isExternalRecording;
  const isAnyGenerating = isTranscribing || isExternalGenerating;
  const displayTime = isExternalRecording ? externalRecordingTime : isRemoteRecording ? remoteRecordingTime : recordingTime;

  return (
    <div className="flex items-center gap-4">
      {/* Recording Button */}
      <div className="relative">
        {isAnyGenerating ? (
          // 차트 생성 중일 때 점 3개 애니메이션
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-lg flex items-center justify-center gap-1">
            <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : !isAnyRecording ? (
          <Button
            onClick={handleStartRecording}
            disabled={isConnecting || isRemoteRecording}
            className="h-16 w-16 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-xl shadow-red-500/30 relative overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
            {isConnecting && (
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium bg-red-700/90">
                연결중
              </span>
            )}
          </Button>
        ) : isRemoteRecording ? (
          // 모바일 녹음 중일 때는 버튼 비활성화 (모바일에서만 정지 가능)
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white shadow-xl shadow-red-500/30 flex items-center justify-center">
            <Mic className="w-6 h-6" />
          </div>
        ) : (
          <Button
            onClick={handleStopRecording}
            className="h-16 w-16 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white shadow-xl shadow-slate-700/30 transition-all hover:scale-105 active:scale-95"
          >
            <Square className="w-5 h-5 fill-current" />
          </Button>
        )}

        {/* Pulse animation when recording */}
        {isAnyRecording && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
            <span className="absolute -inset-1 rounded-full bg-red-500/20 animate-pulse pointer-events-none" />
          </>
        )}
      </div>

      {/* Recording Status */}
      <div className="flex items-center gap-4">
        {isAnyRecording ? (
          <>
            {/* Waveform */}
            <div className="flex items-center gap-1 h-10">
              {Array.from({ length: bars }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-red-500 to-red-400 rounded-full transition-all duration-75"
                  style={{ height: `${getBarHeight(i)}px` }}
                />
              ))}
            </div>
            {/* Timer & Status */}
            <div className="flex flex-col">
              <div className="text-lg font-bold text-slate-900 tabular-nums">
                {formatTime(displayTime)}
              </div>
              <div className="text-xs text-red-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {isRemoteRecording ? '휴대폰 녹음 중' : '녹음 중'}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
