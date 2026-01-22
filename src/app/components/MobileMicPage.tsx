import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Mic, Square, Loader2, Wifi, WifiOff, Stethoscope, CheckCircle2 } from 'lucide-react';
import { RemoteMicClient } from '@/services/remoteMicService';
import { useDeepgram } from '@/services/deepgramService';
import { toast } from 'sonner';
import { Toaster } from '@/app/components/ui/sonner';

interface Segment {
  text: string;
  speaker: 'doctor' | 'patient' | 'pending';
}

interface MobileMicPageProps {
  sessionId: string;
}

export function MobileMicPage({ sessionId }: MobileMicPageProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lastHostPing, setLastHostPing] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [waveformTick, setWaveformTick] = useState(0);
  
  const clientRef = useRef<RemoteMicClient | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const segmentsRef = useRef<Segment[]>([]);

  const {
    connect: connectDeepgram,
    disconnect: disconnectDeepgram,
    isConnecting: isDeepgramConnecting,
  } = useDeepgram({
    onTranscript: (text, isFinal) => {
      if (clientRef.current && text) {
        clientRef.current.sendTranscript(text, isFinal);
      }
    },
    onSegmentsUpdate: (segments) => {
      segmentsRef.current = segments;
      if (clientRef.current) {
        clientRef.current.sendSegments(segments);
      }
    },
    onFullUpdate: (_, segments) => {
      segmentsRef.current = segments;
      if (clientRef.current) {
        clientRef.current.sendSegments(segments);
      }
    }
  });

  // Supabase 연결
  useEffect(() => {
    const client = new RemoteMicClient(sessionId, () => {
      setLastHostPing(Date.now());
    });
    clientRef.current = client;

    const connectToHost = async () => {
      setIsConnecting(true);
      const connected = await client.connect();
      setIsConnected(connected);
      setIsConnecting(false);
      
      if (connected) {
        toast.success('데스크톱과 연결되었습니다!');
      } else {
        toast.error('연결에 실패했습니다. 세션 코드를 확인해주세요.');
      }
    };

    connectToHost();

    return () => {
      client.disconnect();
    };
  }, [sessionId]);

  // 연결 상태 체크
  useEffect(() => {
    const checkConnection = setInterval(() => {
      if (lastHostPing > 0 && Date.now() - lastHostPing > 10000) {
        // 10초 이상 호스트 ping 없으면 연결 끊김으로 간주
        setIsConnected(false);
      }
    }, 5000);

    return () => clearInterval(checkConnection);
  }, [lastHostPing]);

  // 녹음 시간 타이머
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // 파형 애니메이션
  useEffect(() => {
    if (!isRecording) return;
    
    const interval = setInterval(() => {
      setWaveformTick(prev => prev + 1);
    }, 50);
    
    return () => clearInterval(interval);
  }, [isRecording]);

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
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      startAudioAnalysis(stream);
      await connectDeepgram(stream);
      
      setIsRecording(true);
      setRecordingTime(0);
      segmentsRef.current = [];
      
      if (clientRef.current) {
        clientRef.current.notifyRecordingStart();
      }
      
      toast.success('녹음이 시작되었습니다');
    } catch (error) {
      console.error('Recording start error:', error);
      toast.error('마이크 접근 권한이 필요합니다');
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    
    stopAudioAnalysis();
    disconnectDeepgram();
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (clientRef.current) {
      clientRef.current.notifyRecordingStop();
    }
    
    toast.success('녹음이 종료되었습니다');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 파형 높이 계산
  const bars = 7;
  const getBarHeight = (index: number) => {
    const baseHeight = 8;
    const maxAdditional = 32;
    const time = waveformTick * 50;
    const phase1 = (time / 150 + index * 0.8) % (Math.PI * 2);
    const phase2 = (time / 100 + index * 1.2) % (Math.PI * 2);
    const wave = (Math.sin(phase1) * 0.4 + Math.sin(phase2) * 0.3 + 0.5);
    const amplifiedLevel = Math.min(audioLevel * 2.5, 1);
    const minMovement = 0.3;
    return baseHeight + (Math.max(amplifiedLevel, minMovement) * maxAdditional * wave);
  };

  // 연결 중 화면
  if (isConnecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">연결 중...</h2>
            <p className="text-sm text-slate-500">세션 코드: <span className="font-mono font-bold">{sessionId}</span></p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 연결 실패 화면
  if (!isConnected && !isConnecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-8 text-center">
            <WifiOff className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">연결 끊김</h2>
            <p className="text-sm text-slate-500 mb-4">데스크톱과의 연결이 끊어졌습니다.</p>
            <Button 
              onClick={() => window.location.reload()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              다시 연결
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-600 to-teal-700 flex flex-col">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Stethoscope className="w-6 h-6" />
          <span className="font-semibold">Cheat Chat AI</span>
        </div>
        <div className="flex items-center gap-2 text-teal-100">
          <Wifi className="w-4 h-4" />
          <span className="text-sm">연결됨</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm shadow-2xl">
          <CardContent className="pt-8 pb-8">
            {/* Connection Status */}
            <div className="flex items-center justify-center gap-2 mb-6 text-teal-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">데스크톱과 연결됨</span>
            </div>

            {/* Recording Button */}
            <div className="flex flex-col items-center">
              <div className="relative mb-6">
                {!isRecording ? (
                  <Button
                    onClick={handleStartRecording}
                    disabled={isDeepgramConnecting}
                    className="h-24 w-24 rounded-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
                  >
                    {isDeepgramConnecting ? (
                      <Loader2 className="w-10 h-10 animate-spin" />
                    ) : (
                      <Mic className="w-10 h-10" />
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleStopRecording}
                    className="h-24 w-24 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white shadow-xl shadow-slate-700/30 transition-all hover:scale-105 active:scale-95"
                  >
                    <Square className="w-8 h-8 fill-current" />
                  </Button>
                )}
                
                {/* Pulse animation when recording */}
                {isRecording && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
                    <span className="absolute -inset-2 rounded-full bg-red-500/20 animate-pulse pointer-events-none" />
                  </>
                )}
              </div>

              {/* Status */}
              {isRecording ? (
                <div className="text-center">
                  {/* Waveform */}
                  <div className="flex items-center justify-center gap-1 h-12 mb-3">
                    {Array.from({ length: bars }).map((_, i) => (
                      <div
                        key={i}
                        className="w-2 bg-gradient-to-t from-red-500 to-red-400 rounded-full transition-all duration-75"
                        style={{ height: `${getBarHeight(i)}px` }}
                      />
                    ))}
                  </div>
                  {/* Timer */}
                  <div className="text-2xl font-bold text-slate-900 tabular-nums mb-1">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-sm text-red-500 font-medium flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    녹음 중 - 데스크톱에 전송 중
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-slate-600 font-medium mb-1">마이크 버튼을 눌러</p>
                  <p className="text-slate-600 font-medium">녹음을 시작하세요</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Session Info */}
        <div className="mt-6 text-center text-teal-100">
          <p className="text-sm opacity-80">세션 코드</p>
          <p className="font-mono font-bold text-lg tracking-wider">{sessionId}</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-teal-200 text-xs">
        녹음된 내용은 실시간으로 데스크톱에 전송됩니다
      </footer>
    </div>
  );
}
