import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { DeepgramRealtimeTranscriber, type SpeakerSegment } from '@/services/deepgramService';

interface VoiceRecorderProps {
  onTranscriptUpdate: (transcript: string) => void;
  onRealtimeSegment?: (segment: SpeakerSegment) => void; // 새 발화 추가 시
  onRealtimeSegmentsUpdate?: (segments: SpeakerSegment[]) => void; // 전체 세그먼트 업데이트 (화자 분류 후)
  onFullUpdate?: (segments: SpeakerSegment[]) => void;
  onRecordingStart?: () => void;
  onProcessingStart?: () => void;
  onRecordingComplete: () => void;
  onRecordingProgress?: (time: number, audioLevel: number, realtimeText: string) => void;
  department?: string;
}

export function VoiceRecorder({ 
  onTranscriptUpdate, 
  onRealtimeSegment,
  onRealtimeSegmentsUpdate,
  onFullUpdate, 
  onRecordingStart, 
  onProcessingStart, 
  onRecordingComplete, 
  onRecordingProgress, 
  department = 'general' 
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([0.2, 0.4, 0.6, 0.8, 0.6, 0.4, 0.3, 0.5, 0.7, 0.5, 0.3, 0.2]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const isRecordingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriberRef = useRef<DeepgramRealtimeTranscriber | null>(null);
  const currentAudioLevelRef = useRef(0);
  const realtimeTextRef = useRef<string>('');

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (transcriberRef.current) transcriberRef.current.reset();
    };
  }, []);

  // 실시간 파형 업데이트
  const updateWaveform = () => {
    if (analyserRef.current && isRecordingRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(dataArray);
      
      const bars = 12;
      const step = Math.floor(dataArray.length / bars);
      const newWaveform: number[] = [];
      let sum = 0;
      
      for (let i = 0; i < bars; i++) {
        const value = Math.abs(dataArray[i * step] - 128) / 128;
        newWaveform.push(Math.min(1, value * 3));
        sum += Math.abs(dataArray[i * step] - 128);
      }
      
      setWaveformData(newWaveform);
      currentAudioLevelRef.current = sum / dataArray.length / 128;
      
      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    }
  };

  const handleStartRecording = async () => {
    console.log('녹음 시작!');
    setIsRecording(true);
    setIsConnecting(true);
    isRecordingRef.current = true;
    setRecordingTime(0);
    setIsTranscribing(false);
    realtimeTextRef.current = '';
    onRecordingStart?.();

    // Deepgram 실시간 전사 초기화
    transcriberRef.current = new DeepgramRealtimeTranscriber(
      (segment) => {
        // 새 발화 추가
        onRealtimeSegment?.(segment);
        
        // 전체 텍스트 업데이트
        realtimeTextRef.current = transcriberRef.current?.getFullText() || '';
        onTranscriptUpdate(realtimeTextRef.current);
      },
      onFullUpdate,
      department
    );
    
    // 전체 세그먼트 업데이트 콜백 (GPT 배치 분류 후)
    transcriberRef.current.setOnSegmentsUpdate((segments) => {
      onRealtimeSegmentsUpdate?.(segments);
    });

    // Deepgram WebSocket 연결
    try {
      await transcriberRef.current.connect();
      console.log('✅ Deepgram 연결 성공');
    } catch (error) {
      console.error('❌ Deepgram 연결 실패:', error);
    }
    
    setIsConnecting(false);

    // 타이머
    timerRef.current = window.setInterval(() => {
      setRecordingTime(prev => {
        const newTime = prev + 1;
        onRecordingProgress?.(newTime, currentAudioLevelRef.current, realtimeTextRef.current);
        return newTime;
      });
    }, 1000);

    // 마이크 접근
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });
      
      streamRef.current = stream;
      console.log('마이크 접근 성공!');

      // 오디오 분석기 설정
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 2;
      source.connect(gainNode);
      gainNode.connect(analyserRef.current);
      
      updateWaveform();

      // MediaRecorder 설정 (Deepgram은 다양한 형식 지원)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0 && transcriberRef.current) {
          // Deepgram에 오디오 청크 전송
          await transcriberRef.current.addChunk(event.data);
        }
      };

      // 250ms마다 청크 생성 (더 빠른 실시간 응답)
      mediaRecorderRef.current.start(250);
      console.log('MediaRecorder 시작됨');

    } catch (error) {
      console.error('마이크 접근 실패:', error);
    }
  };

  const handleStopRecording = async () => {
    console.log('녹음 종료!');
    setIsRecording(false);
    isRecordingRef.current = false;
    
    // 타이머 정리
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    // MediaRecorder 정지
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // 처리 시작 알림
    onProcessingStart?.();

    // GPT 화자분류 처리
    if (transcriberRef.current) {
      console.log('🔚 GPT 화자분류 처리 시작...');
      setIsTranscribing(true);
      
      try {
        await transcriberRef.current.flush();
        console.log('✅ 화자분류 완료!');
      } catch (error) {
        console.error('❌ 화자분류 오류:', error);
      }
      
      setIsTranscribing(false);
    }

    // 오디오 컨텍스트 정리
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // 마이크 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    onRecordingComplete();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4">
      {/* 녹음 버튼 */}
      {!isRecording ? (
        <Button
          onClick={handleStartRecording}
          disabled={isTranscribing}
          className="h-14 w-14 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg"
        >
          {isTranscribing ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </Button>
      ) : (
        <Button
          onClick={handleStopRecording}
          className="h-14 w-14 rounded-full bg-gray-700 hover:bg-gray-800 text-white shadow-lg"
        >
          <Square className="w-5 h-5 fill-current" />
        </Button>
      )}

      {/* 녹음 상태 표시 */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          {isRecording && (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="font-mono text-lg font-semibold">
                {formatTime(recordingTime)}
              </span>
              {isConnecting && (
                <span className="text-xs text-muted-foreground">(연결 중...)</span>
              )}
            </>
          )}
          {isTranscribing && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              AI 분석중...
            </span>
          )}
          {!isRecording && !isTranscribing && (
            <span className="text-sm text-muted-foreground">
              녹음 시작을 눌러주세요
            </span>
          )}
        </div>

        {/* 파형 표시 */}
        {isRecording && (
          <div className="flex items-center gap-0.5 h-6 mt-1">
            {waveformData.map((value, index) => (
              <div
                key={index}
                className="w-1 bg-red-500 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, value * 24)}px` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
