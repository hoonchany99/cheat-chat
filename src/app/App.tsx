import { useState, useCallback, useEffect } from 'react';
import { VoiceRecorder } from './components/VoiceRecorder';
import { TranscriptViewer } from './components/TranscriptViewer';
import { ChartingResult, ChartData } from './components/ChartingResult';
import { LandingPage } from './components/LandingPage';
import { DemoPage } from './components/DemoPage';
import { ChartSettingsModal } from './components/ChartSettingsModal';
import { ChartSettings, DEFAULT_CHART_SETTINGS, DEPARTMENT_PRESETS } from '@/services/chartService';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Toaster } from '@/app/components/ui/sonner';
import { toast } from 'sonner';
import { RotateCcw, Stethoscope, FileText, Mail, Loader2, MessageSquare, Send, X, Mic, Sparkles, ClipboardList, ChevronRight } from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';

// 페이지 전환 애니메이션 스타일
const pageTransitionStyles = `
  @keyframes pageSlideIn {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes pageFadeOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.98);
    }
  }
  
  .page-enter {
    animation: pageSlideIn 0.5s ease-out forwards;
  }
  
  .page-exit {
    animation: pageFadeOut 0.3s ease-in forwards;
  }
`;

interface Segment {
  text: string;
  speaker: 'doctor' | 'patient' | 'pending';
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'app' | 'demo'>('landing');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pageAnimation, setPageAnimation] = useState<'enter' | 'exit' | ''>('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [realtimeSegments, setRealtimeSegments] = useState<Segment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [email, setEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const selectedDepartment = DEPARTMENT_PRESETS.find(d => d.id === chartSettings.selectedDepartment);
  const selectedDepartmentName = selectedDepartment?.name || '내과';

  // 페이지 전환 핸들러
  const handlePageTransition = useCallback((toPage: 'landing' | 'app' | 'demo') => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    setPageAnimation('exit');
    
    setTimeout(() => {
      setCurrentPage(toPage);
      setPageAnimation('enter');
      
      setTimeout(() => {
        setIsTransitioning(false);
        setPageAnimation('');
      }, 500);
    }, 300);
  }, [isTransitioning]);

  // 초기 진입 시 애니메이션
  useEffect(() => {
    setPageAnimation('enter');
    const timer = setTimeout(() => setPageAnimation(''), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleTranscriptUpdate = useCallback((text: string) => {
    setFinalTranscript(text);
  }, []);

  const handleRealtimeSegment = useCallback((text: string) => {
    console.log('Realtime segment:', text);
  }, []);

  const handleRealtimeSegmentsUpdate = useCallback((segments: Segment[]) => {
    setRealtimeSegments(segments);
  }, []);

  const handleFullUpdate = useCallback((_transcript: string, segments: Segment[]) => {
    setRealtimeSegments(segments);
  }, []);

  const handleRecordingStart = useCallback(() => {
    setIsRecording(true);
    setChartData(null);
    setRecordingProgress(0);
  }, []);

  const handleProcessingStart = useCallback(() => {
    console.log('Processing started');
  }, []);

  const handleRecordingComplete = useCallback((transcript: string, result: ChartData | null) => {
    setIsRecording(false);
    setFinalTranscript(transcript);
    
    if (result) {
      setChartData(result);
    }
    setIsGeneratingChart(false);
  }, []);

  const handleRecordingProgress = useCallback((progress: number) => {
    setRecordingProgress(progress);
  }, []);

  const handleReset = useCallback(() => {
    setFinalTranscript('');
    setRealtimeSegments([]);
    setChartData(null);
    setIsGeneratingChart(false);
    setRecordingProgress(0);
  }, []);

  const handleEmailSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('올바른 이메일을 입력해주세요');
      return;
    }
    setIsSubscribing(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    toast.success('구독해주셔서 감사합니다!');
    setEmail('');
    setIsSubscribing(false);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      toast.error('피드백을 입력해주세요');
      return;
    }
    setIsSendingFeedback(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('Feedback:', feedback);
    toast.success('피드백 감사합니다!');
    setFeedback('');
    setIsSendingFeedback(false);
    setFeedbackOpen(false);
  };

  // 랜딩 페이지
  if (currentPage === 'landing') {
    return (
      <>
        <style>{pageTransitionStyles}</style>
        <div className={pageAnimation === 'enter' ? 'page-enter' : pageAnimation === 'exit' ? 'page-exit' : ''}>
          <LandingPage 
            onStart={() => handlePageTransition('app')}
          />
        </div>
        <Toaster position="top-center" richColors />
      </>
    );
  }

  // 데모 페이지
  if (currentPage === 'demo') {
    return (
      <>
        <style>{pageTransitionStyles}</style>
        <div className={pageAnimation === 'enter' ? 'page-enter' : pageAnimation === 'exit' ? 'page-exit' : ''}>
          <DemoPage onBack={() => handlePageTransition('landing')} />
        </div>
        <Toaster position="top-center" richColors />
      </>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col ${pageAnimation === 'enter' ? 'page-enter' : pageAnimation === 'exit' ? 'page-exit' : ''}`}>
      <style>{pageTransitionStyles}</style>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => handlePageTransition('landing')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 text-white">
              <Stethoscope className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-slate-800">Cheat Chat AI</span>
          </button>

          <div className="flex items-center">
            <ChartSettingsModal
              settings={chartSettings}
              onSettingsChange={setChartSettings}
              departmentName={selectedDepartmentName}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex flex-col gap-6">
          {/* Recording Control */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              {/* Recording Section */}
              <div className="flex items-center gap-4">
                <VoiceRecorder
                  onTranscriptUpdate={handleTranscriptUpdate}
                  onRealtimeSegment={handleRealtimeSegment}
                  onRealtimeSegmentsUpdate={handleRealtimeSegmentsUpdate}
                  onFullUpdate={handleFullUpdate}
                  onRecordingStart={handleRecordingStart}
                  onProcessingStart={handleProcessingStart}
                  onRecordingComplete={handleRecordingComplete}
                  onRecordingProgress={handleRecordingProgress}
                  department={chartSettings.selectedDepartment}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleReset}
                  disabled={isRecording || isGeneratingChart}
                  className="rounded-full h-10 w-10 shrink-0"
                  title="초기화"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>

              {/* Usage Guide - Right aligned */}
              <div className="hidden md:flex items-center">
                <div className="flex items-center bg-slate-50 rounded-full px-1.5 py-1.5 border border-slate-200">
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <span className="text-xs font-medium text-slate-600">녹음</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <span className="text-xs font-medium text-slate-600">변환</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <span className="text-xs font-medium text-slate-600">차트</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TranscriptViewer
              finalTranscript={finalTranscript}
              isRecording={isRecording}
              realtimeSegments={realtimeSegments}
            />
            <ChartingResult
              chartData={chartData}
              isGenerating={isGeneratingChart}
              recordingProgress={recordingProgress}
              isRecording={isRecording}
            />
          </div>

          {/* Email Subscribe Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 max-w-3xl ml-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">정식 출시 알림 받기</h3>
                  <p className="text-sm text-slate-500 mt-0.5">새로운 기능과 업데이트 소식을 받아보세요</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Feedback Button */}
                <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-slate-600">
                      <MessageSquare className="w-4 h-4 mr-1.5" />
                      피드백
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-teal-600" />
                        피드백 보내기
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                      <Textarea
                        placeholder="개선사항이나 의견을 자유롭게 남겨주세요..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="min-h-[120px] resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setFeedbackOpen(false)}>
                          취소
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={isSendingFeedback}
                          className="bg-teal-600 hover:bg-teal-700"
                        >
                          {isSendingFeedback ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                          보내기
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                {/* Subscribe Form */}
                <form onSubmit={handleEmailSubscribe} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-48 sm:w-56"
                  />
                  <Button 
                    type="submit" 
                    disabled={isSubscribing}
                    className="bg-teal-600 hover:bg-teal-700 px-5"
                  >
                    {isSubscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : '구독'}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Toaster position="top-center" richColors />
    </div>
  );
}
