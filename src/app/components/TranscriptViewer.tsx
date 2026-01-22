import { useRef, useEffect } from 'react';
import { MessageSquare, Stethoscope, User, Loader2 } from 'lucide-react';

interface Segment {
  text: string;
  speaker: 'doctor' | 'patient' | 'pending';
}

interface TranscriptViewerProps {
  finalTranscript: string;
  isRecording: boolean;
  realtimeSegments: Segment[];
}

export function TranscriptViewer({
  isRecording,
  realtimeSegments
}: TranscriptViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가될 때마다 스크롤을 맨 아래로
  useEffect(() => {
    if (scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [realtimeSegments]);

  const hasContent = realtimeSegments.length > 0;

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex-none px-5 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-sm">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">실시간 대화</h3>
              <p className="text-xs text-slate-500">AI가 실시간으로 대화를 듣고 정리해줍니다</p>
            </div>
          </div>
          {isRecording && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-600">녹음 중</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto" ref={scrollContainerRef}>
          <div className="p-4">
            {!hasContent ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-700 font-medium mb-1">대화 내용이 여기에 표시됩니다</p>
                <p className="text-sm text-slate-400">녹음을 시작하면 실시간으로 변환됩니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {realtimeSegments.map((segment, index) => {
                  const isDoctor = segment.speaker === 'doctor';
                  const isPending = segment.speaker === 'pending';

                  return (
                    <div
                      key={index}
                      className={`flex ${isPending ? 'justify-center' : isDoctor ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          isPending
                            ? 'bg-amber-50 border border-amber-200 border-dashed'
                            : isDoctor
                              ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white'
                              : 'bg-slate-100'
                        }`}
                      >
                        <div className={`text-xs mb-1 flex items-center gap-1.5 font-medium ${
                          isPending
                            ? 'text-amber-600'
                            : isDoctor
                              ? 'text-teal-100'
                              : 'text-slate-500'
                        }`}>
                          {isPending ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              분석 중
                            </>
                          ) : isDoctor ? (
                            <>
                              <Stethoscope className="w-3 h-3" />
                              의사
                            </>
                          ) : (
                            <>
                              <User className="w-3 h-3" />
                              환자
                            </>
                          )}
                        </div>
                        <div className={`text-sm leading-relaxed ${
                          isDoctor ? 'text-white' : 'text-slate-700'
                        }`}>
                          {segment.text}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isRecording && (
                  <div className="flex justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 text-sm">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      음성 인식 중...
                    </div>
                  </div>
                )}
                {/* 스크롤 타겟 */}
                <div ref={scrollEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
