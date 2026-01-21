import { useEffect, useRef } from 'react';
import { Card } from '@/app/components/ui/card';
import { Loader2, Mic } from 'lucide-react';
import { type SpeakerSegment } from '@/services/deepgramService';

interface TranscriptViewerProps {
  segments: SpeakerSegment[];
  realtimeSegments?: SpeakerSegment[]; // 실시간 화자 추정 세그먼트
  isRecording?: boolean;
  isProcessing?: boolean;
  recordingTime?: number; // 녹음 시간 (초)
  audioLevel?: number; // 오디오 레벨 (0-1)
  realtimeText?: string; // 실시간 전사 텍스트 (사용 안 함)
}

// 시간을 MM:SS 형식으로 변환
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function TranscriptViewer({ 
  segments,
  realtimeSegments = [],
  isRecording,
  isProcessing,
  recordingTime = 0,
}: TranscriptViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 스크롤 자동 이동 (녹음 중이거나 세그먼트 업데이트 시)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, realtimeSegments]);

  const hasData = segments.length > 0;
  const hasRealtimeData = realtimeSegments.length > 0;

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b flex-shrink-0 flex items-center justify-between">
        <h3 className="font-semibold">💬 실시간 대화</h3>
        <div className="flex items-center gap-2">
          {isRecording && (
            <span className="text-xs text-red-500 font-medium flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              REC {formatTime(recordingTime)}
            </span>
          )}
          {isProcessing && !isRecording && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              AI 분석중...
            </span>
          )}
        </div>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* 녹음 중 - 실시간 화자 추정 세그먼트 표시 */}
        {isRecording && (
          <div className="flex flex-col h-full">
            {hasRealtimeData ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  실시간 인식 중 (GPT-4o-mini 화자 분류)
                </p>
                
                {/* 실시간 세그먼트 목록 */}
                {realtimeSegments.map((segment, index) => {
                  const isDoctor = segment.speaker === 'doctor';
                  const isPending = segment.speaker === 'pending';
                  
                  return (
                    <div
                      key={index}
                      className={`flex ${isPending ? 'justify-center' : isDoctor ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 transition-all duration-300 ${
                          isPending
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 border-dashed'
                            : isDoctor
                              ? 'bg-blue-500/80 text-white'
                              : 'bg-muted/80'
                        }`}
                      >
                        <div className="text-xs opacity-70 mb-1">
                          {isPending ? '⏳ 분석 중...' : isDoctor ? '🩺 의사' : '🙋 환자'}
                        </div>
                        <div className="text-sm">
                          {segment.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                <p className="text-xs text-muted-foreground text-center mt-4">
                  💡 발화 3개마다 AI가 화자를 분류합니다
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <p className="text-sm text-muted-foreground">
                  대화를 시작하면 텍스트가 표시됩니다
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  마이크에 대고 말해보세요
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* 처리 중 상태 표시 */}
        {isProcessing && !isRecording && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <div className="text-center">
              <p className="font-medium text-foreground">🔄 AI가 대화를 분석하고 있습니다</p>
              <p className="text-sm text-muted-foreground mt-1">
                화자를 정확하게 구분하는 중...
              </p>
            </div>
          </div>
        )}
        
        {/* 데이터 없음 (초기 상태) */}
        {!hasData && !isRecording && !isProcessing && (
          <div className="text-center text-muted-foreground py-8">
            녹음을 시작하면 대화 내용이 여기에 표시됩니다
          </div>
        )}
        
        {/* 최종 세그먼트 목록 (GPT 화자분류 결과) */}
        {hasData && !isRecording && !isProcessing && segments.map((segment, index) => {
          const isDoctor = segment.speaker === 'doctor';
          const isPending = segment.speaker === 'pending';
          
          // 대기중 (에러 메시지 등)
          if (isPending) {
            return (
              <div key={index} className="flex justify-center">
                <div className="max-w-[90%] rounded-lg p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 border-dashed">
                  <div className="text-xs text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    알림
                  </div>
                  <div className="text-sm text-foreground/80 italic">
                    {segment.text}
                  </div>
                </div>
              </div>
            );
          }
          
          // 의사 또는 환자 (확정)
          return (
            <div
              key={index}
              className={`flex ${isDoctor ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isDoctor
                    ? 'bg-blue-500 text-white'
                    : 'bg-muted'
                }`}
              >
                <div className="text-xs opacity-70 mb-1">
                  {isDoctor ? '🩺 의사' : '🙋 환자'}
                </div>
                <div className="text-sm">
                  {segment.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
