import { useState, useCallback, useEffect } from 'react';
import { VoiceRecorder } from './components/VoiceRecorder';
import { TranscriptViewer } from './components/TranscriptViewer';
import { ChartingResult, ChartData } from './components/ChartingResult';
import { LandingPage } from './components/LandingPage';
import { DemoPage } from './components/DemoPage';
import { ChartSettingsModal } from './components/ChartSettingsModal';
import { MobileMicPage } from './components/MobileMicPage';
import { RemoteMicModal } from './components/RemoteMicModal';
import { ChartSettings, DEFAULT_CHART_SETTINGS, DEPARTMENT_PRESETS, generateChartFromTranscript, correctSTTErrors } from '@/services/chartService';
import { classifyUtterancesWithGPT } from '@/services/deepgramService';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Toaster } from '@/app/components/ui/sonner';
import { toast } from 'sonner';
import { RotateCcw, Stethoscope, FileText, Mail, Loader2, MessageSquare, Send, ChevronRight, MessageCircle, Smartphone } from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/app/components/ui/select';

// Google Sheets API URL
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbw5uH766QFw6m0kLchHySCPH7UUXX1F0TCxZe4ygqRiGEvhcSKKSr_nQ0gs_88GCDA/exec';

// 사용자 정보 옵션
const AGE_OPTIONS = [
  { value: '20s', label: '20대' },
  { value: '30s', label: '30대' },
  { value: '40s', label: '40대' },
  { value: '50s+', label: '50대 이상' },
];
  
const JOB_OPTIONS = [
  { value: 'medical_student', label: '의대생/본과생' },
  { value: 'resident', label: '전공의/레지던트' },
  { value: 'fellow', label: '펠로우/전임의' },
  { value: 'pay_doctor', label: '페이닥터' },
  { value: 'private_practice', label: '개원의' },
  { value: 'professor', label: '대학병원 교수' },
  { value: 'nurse', label: '간호사' },
  { value: 'other', label: '기타' },
];

const SPECIALTY_OPTIONS = [
  // 내과계
  { group: '내과계', items: [
    { value: 'internal', label: '내과 (일반)' },
    { value: 'cardiology', label: '순환기내과' },
    { value: 'gastroenterology', label: '소화기내과' },
    { value: 'pulmonology', label: '호흡기내과' },
    { value: 'nephrology', label: '신장내과' },
    { value: 'endocrinology', label: '내분비내과' },
    { value: 'hematology_oncology', label: '혈액종양내과' },
    { value: 'infectious', label: '감염내과' },
    { value: 'rheumatology', label: '류마티스내과' },
    { value: 'neurology', label: '신경과' },
  ]},
  // 외과계
  { group: '외과계', items: [
    { value: 'surgery', label: '외과 (일반)' },
    { value: 'thoracic', label: '흉부외과' },
    { value: 'neurosurgery', label: '신경외과' },
    { value: 'orthopedic', label: '정형외과' },
    { value: 'plastic', label: '성형외과' },
    { value: 'urology', label: '비뇨의학과' },
    { value: 'obgyn', label: '산부인과' },
  ]},
  // 기타 진료과
  { group: '기타 진료과', items: [
    { value: 'pediatrics', label: '소아청소년과' },
    { value: 'psychiatry', label: '정신건강의학과' },
    { value: 'dermatology', label: '피부과' },
    { value: 'ophthalmology', label: '안과' },
    { value: 'ent', label: '이비인후과' },
    { value: 'family', label: '가정의학과' },
    { value: 'emergency', label: '응급의학과' },
    { value: 'anesthesiology', label: '마취통증의학과' },
    { value: 'radiology', label: '영상의학과' },
    { value: 'rehabilitation', label: '재활의학과' },
    { value: 'occupational', label: '직업환경의학과' },
    { value: 'pathology', label: '병리과' },
    { value: 'laboratory', label: '진단검사의학과' },
    { value: 'nuclear', label: '핵의학과' },
    { value: 'preventive', label: '예방의학과' },
  ]},
  // 치과
  { group: '치과', items: [
    { value: 'dentistry', label: '치과 (일반)' },
    { value: 'oral_surgery', label: '구강악안면외과' },
    { value: 'orthodontics', label: '치과교정과' },
    { value: 'prosthodontics', label: '치과보철과' },
    { value: 'periodontics', label: '치주과' },
    { value: 'endodontics', label: '치과보존과' },
    { value: 'pediatric_dentistry', label: '소아치과' },
  ]},
  // 기타
  { group: '기타', items: [
    { value: 'undecided', label: '해당없음/미정' },
    { value: 'other_specialty', label: '기타' },
  ]},
];

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
  // URL 파라미터에서 모바일 마이크 세션 확인
  const urlParams = new URLSearchParams(window.location.search);
  const micSessionId = urlParams.get('mic');
  
  // 모바일 마이크 페이지인 경우 바로 렌더링
  if (micSessionId) {
    return <MobileMicPage sessionId={micSessionId} />;
  }

  return <MainApp />;
}

function MainApp() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'app' | 'demo'>('landing');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pageAnimation, setPageAnimation] = useState<'enter' | 'exit' | ''>('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [realtimeSegments, setRealtimeSegments] = useState<Segment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isRemoteRecording, setIsRemoteRecording] = useState(false);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [email, setEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState<'input' | 'info'>('input');
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'transcript' | 'chart'>('transcript');
  const [remoteMicOpen, setRemoteMicOpen] = useState(false);
  const [isRemoteConnected, setIsRemoteConnected] = useState(false);
  const [remoteRecordingTime, setRemoteRecordingTime] = useState(0);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [lastAutoUpdateSegmentCount, setLastAutoUpdateSegmentCount] = useState(0);
  const [silenceTimeout, setSilenceTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // 사용자 정보 상태
  const [userAge, setUserAge] = useState('');
  const [userJob, setUserJob] = useState('');
  const [userSpecialty, setUserSpecialty] = useState('');
  const [feedbackAge, setFeedbackAge] = useState('');
  const [feedbackJob, setFeedbackJob] = useState('');
  const [feedbackSpecialty, setFeedbackSpecialty] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');

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

  // 탭 전환 시 녹음 중 경고
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && (isRecording || isRemoteRecording)) {
        toast.warning('녹음 중입니다!', {
          description: '탭을 전환하면 실시간 업데이트가 지연될 수 있습니다.',
          duration: 4000,
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording, isRemoteRecording]);

  // 모바일 녹음 시간 추적
  useEffect(() => {
    if (!isRemoteRecording) {
      return;
    }
    
    setRemoteRecordingTime(0);
    const interval = setInterval(() => {
      setRemoteRecordingTime(prev => prev + 1);
    }, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [isRemoteRecording]);

  // 반실시간 차트 업데이트 트리거 함수
  const triggerAutoChartUpdate = useCallback(async () => {
    const currentSegmentCount = realtimeSegments.length;
    
    // 최소 5개 이상 발화가 있어야 함
    if (currentSegmentCount < 5) return;
    
    // 이미 업데이트 중이거나 차트 생성 중이면 건너뜀
    if (isAutoUpdating || isGeneratingChart) return;
    
    // 이전 업데이트 이후 3개 이상 새 발화가 있어야 함
    if (currentSegmentCount - lastAutoUpdateSegmentCount < 3) return;

    console.log('🔄 반실시간 차트 업데이트 시작...', currentSegmentCount, 'segments');
    setIsAutoUpdating(true);
    
    try {
      // STT 교정 (mini 모델로 빠르게)
      const correctedSegments = await correctSTTErrors(realtimeSegments);
      const transcriptText = correctedSegments.map(s => s.text).join(' ');
      
      // 차트 생성 (비동기로 진행, UI 차단 방지)
      const result = await generateChartFromTranscript(
        transcriptText, 
        correctedSegments, 
        chartSettings.selectedDepartment
      );
      
      if (result) {
        // 기존 확정된 필드는 유지하면서 업데이트
        setChartData(prevData => {
          if (!prevData) return result;
          
          // 사용자가 확정한 필드는 유지
          const mergedData = { ...result };
          Object.keys(prevData).forEach(fieldId => {
            if (prevData[fieldId]?.isConfirmed) {
              mergedData[fieldId] = prevData[fieldId];
            }
          });
          return mergedData;
        });
        setLastAutoUpdateSegmentCount(currentSegmentCount);
        console.log('✅ 반실시간 차트 업데이트 완료');
      }
    } catch (error) {
      console.warn('⚠️ 자동 업데이트 실패 (다음 주기에 재시도):', error);
    } finally {
      setIsAutoUpdating(false);
    }
  }, [realtimeSegments, lastAutoUpdateSegmentCount, isAutoUpdating, isGeneratingChart, chartSettings.selectedDepartment]);

  // 발화 멈춤 감지 (5초 동안 새 발화가 없으면 차트 업데이트)
  useEffect(() => {
    if (!isRecording && !isRemoteRecording) {
      // 녹음 중지 시 타이머 정리
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        setSilenceTimeout(null);
      }
      setLastAutoUpdateSegmentCount(0);
      setIsAutoUpdating(false);
      return;
    }

    // 새 발화가 추가되면 타이머 재설정
    if (realtimeSegments.length > 0) {
      // 기존 타이머 취소하고 새 타이머 설정
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }
      
      // 5초 동안 발화가 없으면 차트 업데이트 트리거
      const timeout = setTimeout(() => {
        console.log('⏱️ 5초간 발화 없음 - 차트 업데이트 트리거');
        triggerAutoChartUpdate();
      }, 5000);
      
      setSilenceTimeout(timeout);
    }

    return () => {
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }
    };
  }, [realtimeSegments.length, isRecording, isRemoteRecording]);

  // 주기적 차트 업데이트 (15초마다, 발화가 계속되는 경우를 대비)
  useEffect(() => {
    if (!isRecording && !isRemoteRecording) {
      return;
    }

    const interval = setInterval(() => {
      // 충분히 발화가 쌓였으면 업데이트
      if (realtimeSegments.length - lastAutoUpdateSegmentCount >= 8) {
        console.log('⏰ 15초 주기 - 차트 업데이트 트리거');
        triggerAutoChartUpdate();
      }
    }, 15000); // 15초마다 체크

    return () => clearInterval(interval);
  }, [isRecording, isRemoteRecording, realtimeSegments.length, lastAutoUpdateSegmentCount, triggerAutoChartUpdate]);

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
    setMobileTab('transcript'); // 녹음 시작 시 실시간 대화 탭으로 전환
  }, []);

  const handleProcessingStart = useCallback(() => {
    setIsRecording(false);
    setIsGeneratingChart(true);
    setMobileTab('chart'); // 차트 생성 시작 시 차트 탭으로 전환
  }, []);

  const handleRecordingComplete = useCallback((transcript: string, result: ChartData | null) => {
    setIsRecording(false);
    setFinalTranscript(transcript);
    
    if (result) {
      setChartData(result);
      setMobileTab('chart'); // 차트 생성 완료 시 차트 탭으로 전환
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

  // 이메일 입력 후 모달 열기
  const handleEmailInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('올바른 이메일을 입력해주세요');
      return;
    }
    setSubscribeOpen(true);
  };

  // 모달에서 최종 구독 완료
  const handleEmailSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAge || !userJob || !userSpecialty) {
      toast.error('모든 필드를 선택해주세요');
      return;
    }
    setIsSubscribing(true);
    
    const subscribeData = {
      type: 'subscribe',
      email,
      age: userAge,
      job: userJob,
      specialty: userSpecialty,
      timestamp: new Date().toISOString(),
      source: 'app'
    };
    
    try {
      await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscribeData),
      });
      toast.success('구독해주셔서 감사합니다!');
      setEmail('');
      setUserAge('');
      setUserJob('');
      setUserSpecialty('');
      setSubscribeOpen(false);
    } catch (error) {
      console.error('Subscribe error:', error);
      toast.error('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubscribing(false);
    }
  };

  // 피드백 다음 단계로
  const handleFeedbackNext = () => {
    if (!feedback.trim()) {
      toast.error('피드백을 입력해주세요');
      return;
    }
    setFeedbackStep('info');
  };

  // 피드백 최종 제출
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingFeedback(true);
    
    const feedbackData = {
      type: 'feedback',
      feedback,
      email: feedbackEmail || '',
      age: feedbackAge || '',
      job: feedbackJob || '',
      specialty: feedbackSpecialty || '',
      timestamp: new Date().toISOString(),
      source: 'app'
    };
    
    try {
      await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      });
      toast.success('피드백 감사합니다!');
      setFeedback('');
      setFeedbackEmail('');
      setFeedbackAge('');
      setFeedbackJob('');
      setFeedbackSpecialty('');
      setFeedbackOpen(false);
      setFeedbackStep('input');
    } catch (error) {
      console.error('Feedback error:', error);
      toast.error('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSendingFeedback(false);
    }
  };

  // 피드백 건너뛰기 (추가 정보 없이 제출)
  const handleFeedbackSkip = async () => {
    setIsSendingFeedback(true);
    
    const feedbackData = {
      type: 'feedback',
      feedback,
      email: '',
      age: '',
      job: '',
      specialty: '',
      timestamp: new Date().toISOString(),
      source: 'app'
    };
    
    try {
      await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      });
      toast.success('피드백 감사합니다!');
      setFeedback('');
      setFeedbackOpen(false);
      setFeedbackStep('input');
    } catch (error) {
      console.error('Feedback error:', error);
      toast.error('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSendingFeedback(false);
    }
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
                  isRemoteRecording={isRemoteRecording}
                  remoteRecordingTime={remoteRecordingTime}
                  isExternalGenerating={isGeneratingChart}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleReset}
                  disabled={isRecording || isRemoteRecording || isGeneratingChart}
                  className="rounded-full h-10 w-10 shrink-0"
                  title="초기화"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                
                {/* 휴대폰 마이크 연결 버튼 */}
                <Button
                  variant="outline"
                  onClick={() => setRemoteMicOpen(true)}
                  disabled={isRecording}
                  className={`rounded-full h-10 px-4 shrink-0 gap-2 transition-all ${
                    isRemoteRecording 
                      ? 'border-red-500 text-red-600 bg-red-50' 
                      : isRemoteConnected 
                        ? 'border-green-500 text-green-600 bg-green-50' 
                        : ''
                  }`}
                  title="휴대폰 마이크 연결"
                >
                  <Smartphone className="w-4 h-4" />
                  <span className="text-xs font-medium hidden sm:inline">
                    {isRemoteRecording ? '녹음 중' : isRemoteConnected ? '연결됨' : '휴대폰 연결'}
                  </span>
                  {isRemoteRecording ? (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  ) : isRemoteConnected ? (
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  ) : null}
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
          {/* Mobile Tab Switcher */}
          <div className="lg:hidden flex gap-2 bg-white rounded-xl border border-slate-200 p-1.5">
            <button
              onClick={() => setMobileTab('transcript')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mobileTab === 'transcript'
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              실시간 대화
              {isRecording && mobileTab !== 'transcript' && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setMobileTab('chart')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mobileTab === 'chart'
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4" />
              AI 차트
              {chartData && mobileTab !== 'chart' && (
                <span className="w-2 h-2 rounded-full bg-teal-500" />
              )}
            </button>
          </div>

          {/* Desktop: Grid Layout */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-6">
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

          {/* Mobile: Tab Content */}
          <div className="lg:hidden">
            {mobileTab === 'transcript' ? (
              <TranscriptViewer
                finalTranscript={finalTranscript}
                isRecording={isRecording}
                realtimeSegments={realtimeSegments}
              />
            ) : (
              <ChartingResult
                chartData={chartData}
                isGenerating={isGeneratingChart}
                recordingProgress={recordingProgress}
                isRecording={isRecording}
              />
            )}
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
                {/* Feedback Button & Modal */}
                <Dialog open={feedbackOpen} onOpenChange={(open) => {
                  setFeedbackOpen(open);
                  if (!open) setFeedbackStep('input');
                }}>
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
                        {feedbackStep === 'input' ? '피드백 보내기' : '추가 정보 (선택)'}
                      </DialogTitle>
                    </DialogHeader>
                    
                    {feedbackStep === 'input' ? (
                      <div className="space-y-4">
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
                            onClick={handleFeedbackNext}
                            className="bg-teal-600 hover:bg-teal-700"
                          >
                            다음
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                        <p className="text-sm text-slate-500">
                          더 나은 서비스를 위해 간단한 정보를 입력해주세요. 건너뛰셔도 됩니다.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <Select value={feedbackAge} onValueChange={setFeedbackAge}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="연령대" />
                            </SelectTrigger>
                            <SelectContent>
                              {AGE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <Select value={feedbackJob} onValueChange={setFeedbackJob}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="직업" />
                            </SelectTrigger>
                            <SelectContent>
                              {JOB_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
            </div>
                        
                        <Select value={feedbackSpecialty} onValueChange={setFeedbackSpecialty}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="전공과" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {SPECIALTY_OPTIONS.map(group => (
                              <SelectGroup key={group.group}>
                                <SelectLabel>{group.group}</SelectLabel>
                                {group.items.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Input
                          type="email"
                          placeholder="답변받을 이메일 (선택)"
                          value={feedbackEmail}
                          onChange={(e) => setFeedbackEmail(e.target.value)}
                        />
                        
                        <div className="flex justify-between">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            onClick={handleFeedbackSkip}
                            disabled={isSendingFeedback}
                            className="text-slate-500"
                          >
                            건너뛰기
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
                    )}
                  </DialogContent>
                </Dialog>

                {/* Subscribe Form (inline) + Modal */}
                <form onSubmit={handleEmailInputSubmit} className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-48 sm:w-56"
                  />
                  <Button 
                    type="submit" 
                    className="bg-teal-600 hover:bg-teal-700 px-5"
                  >
                    구독
                  </Button>
                </form>
                
                {/* Subscribe Info Modal */}
                <Dialog open={subscribeOpen} onOpenChange={setSubscribeOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-teal-600" />
                        조금만 더 알려주세요!
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEmailSubscribe} className="space-y-4">
                      <p className="text-sm text-slate-500">
                        <span className="font-medium text-slate-700">{email}</span>로 알림을 보내드립니다.
                        <br />더 나은 서비스를 위해 간단한 정보를 입력해주세요.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <Select value={userAge} onValueChange={setUserAge}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="연령대 *" />
                          </SelectTrigger>
                          <SelectContent>
                            {AGE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Select value={userJob} onValueChange={setUserJob}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="직업 *" />
                          </SelectTrigger>
                          <SelectContent>
                            {JOB_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <Select value={userSpecialty} onValueChange={setUserSpecialty}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="전공과 *" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {SPECIALTY_OPTIONS.map(group => (
                            <SelectGroup key={group.group}>
                              <SelectLabel>{group.group}</SelectLabel>
                              {group.items.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setSubscribeOpen(false)}>
                          취소
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={isSubscribing}
                          className="bg-teal-600 hover:bg-teal-700"
                        >
                          {isSubscribing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                          완료
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
            </div>
      </main>

      <Toaster position="top-center" richColors />
      
      {/* 휴대폰 마이크 연결 모달 */}
      <RemoteMicModal
        open={remoteMicOpen}
        onOpenChange={setRemoteMicOpen}
        onConnectionChange={setIsRemoteConnected}
        onSegmentsUpdate={(segments) => {
          setRealtimeSegments(segments);
        }}
        onTranscriptUpdate={(text) => {
          setFinalTranscript(prev => prev + (prev ? ' ' : '') + text);
        }}
        onRemoteRecordingStart={() => {
          setIsRemoteRecording(true);
          setChartData(null);
          setRecordingProgress(0);
          setMobileTab('transcript');
        }}
        onRemoteRecordingStop={async () => {
          setIsRemoteRecording(false);
          setIsGeneratingChart(true);
          setMobileTab('chart');
          
          // 수집된 세그먼트로 차트 생성
          const utterances = realtimeSegments.map(s => s.text);
          if (utterances.length > 0) {
            try {
              console.log('[Remote] Final GPT classification for', utterances.length, 'utterances');
              
              // 1. 최종 GPT 분류 (pending 상태 해소)
              const classifiedSegments = await classifyUtterancesWithGPT(utterances);
              console.log('[Remote] Classified segments:', classifiedSegments.length);
              
              // 2. STT 오류 교정 (의학 용어 등)
              console.log('[Remote] Correcting STT errors...');
              const correctedSegments = await correctSTTErrors(classifiedSegments);
              
              // 3. 교정된 세그먼트로 UI 업데이트
              setRealtimeSegments(correctedSegments);
              
              // 4. 차트 생성
              const transcriptText = correctedSegments.map(s => s.text).join(' ');
              console.log('[Remote] Generating chart from corrected segments');
              const result = await generateChartFromTranscript(
                transcriptText, 
                correctedSegments, 
                chartSettings.selectedDepartment
              );
              if (result) {
                setChartData(result);
                toast.success('차트가 생성되었습니다');
              }
            } catch (error) {
              console.error('Remote chart generation error:', error);
              toast.error('차트 생성 중 오류가 발생했습니다');
            }
          }
          setIsGeneratingChart(false);
        }}
      />
    </div>
  );
}
