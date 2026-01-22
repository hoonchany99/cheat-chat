import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent } from '@/app/components/ui/card';
import { toast } from 'sonner';
import { 
  Mic, 
  FileText, 
  ArrowRight, 
  Stethoscope,
  MessageSquare,
  Clock,
  Shield,
  Check,
  Play,
  Copy,
  Zap,
  ChevronRight,
  Square,
  User,
  Activity,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Send,
  Mail
} from 'lucide-react';
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
  { group: '외과계', items: [
    { value: 'surgery', label: '외과 (일반)' },
    { value: 'thoracic', label: '흉부외과' },
    { value: 'neurosurgery', label: '신경외과' },
    { value: 'orthopedic', label: '정형외과' },
    { value: 'plastic', label: '성형외과' },
    { value: 'urology', label: '비뇨의학과' },
    { value: 'obgyn', label: '산부인과' },
  ]},
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
  { group: '치과', items: [
    { value: 'dentistry', label: '치과 (일반)' },
    { value: 'oral_surgery', label: '구강악안면외과' },
    { value: 'orthodontics', label: '치과교정과' },
    { value: 'prosthodontics', label: '치과보철과' },
    { value: 'periodontics', label: '치주과' },
    { value: 'endodontics', label: '치과보존과' },
    { value: 'pediatric_dentistry', label: '소아치과' },
  ]},
  { group: '기타', items: [
    { value: 'undecided', label: '해당없음/미정' },
    { value: 'other_specialty', label: '기타' },
  ]},
];

// ============ 데모 자동 재생 데이터 ============

interface DemoConversation {
  speaker: 'doctor' | 'patient';
  text: string;
  delay: number;
}

interface ChartFieldData {
  value: string;
  isConfirmed: boolean;
}

// 데모 대화 스크립트
const DEMO_CONVERSATION: DemoConversation[] = [
  { speaker: 'doctor', text: '안녕하세요, 오늘은 어떻게 오셨어요?', delay: 0 },
  { speaker: 'patient', text: '3일 전부터 두통이 있어서요.', delay: 1200 },
  { speaker: 'doctor', text: '어떤 느낌의 두통인가요?', delay: 2400 },
  { speaker: 'patient', text: '머리 전체가 조이는 느낌이에요. 오후에 심해져요.', delay: 3800 },
  { speaker: 'doctor', text: '어지러움이나 메스꺼움은요?', delay: 5200 },
  { speaker: 'patient', text: '살짝 메스꺼운 느낌은 있는데 어지럽진 않아요.', delay: 6600 },
];

// 진료과별 차트 데이터
const DEMO_CHARTS: Record<string, { 
  fields: { id: string; label: string }[]; 
  data: Record<string, ChartFieldData> 
}> = {
  general: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'pi', label: 'P.I.' },
      { id: 'ros', label: 'R.O.S.' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '두통 3일', isConfirmed: true },
      pi: { value: '3d onset, squeezing type, p.m. aggravation, N(+)/V(-)', isConfirmed: true },
      ros: { value: 'Dz(-), visual Sx(-)', isConfirmed: true },
      assessment: { value: 'TTH, r/o migraine', isConfirmed: false },
      plan: { value: '1. Tylenol 500mg prn\n2. f/u 1wk', isConfirmed: false },
    },
  },
  internal: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'pi', label: 'P.I.' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '두통 3일', isConfirmed: true },
      pi: { value: '3d h/o diffuse HA, afternoon aggravation, N(+)/V(-)', isConfirmed: true },
      assessment: { value: 'TTH (Tension-type HA)', isConfirmed: false },
      plan: { value: '1. AAP 500mg prn\n2. f/u 1wk', isConfirmed: false },
    },
  },
};

type DemoPhase = 'idle' | 'recording' | 'generating' | 'confirming';

// 스크롤 애니메이션 훅
function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // 한 번만 트리거
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

// CSS 애니메이션 스타일
const animationStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-20px); }
  }
  
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(20, 184, 166, 0.3); }
    50% { box-shadow: 0 0 40px rgba(20, 184, 166, 0.6); }
  }
  
  @keyframes typewriter {
    from { width: 0; }
    to { width: 100%; }
  }
  
  .animate-fade-in-up {
    animation: fadeInUp 0.8s ease-out forwards;
    opacity: 0;
  }
  
  .animate-fade-in {
    animation: fadeIn 0.6s ease-out forwards;
    opacity: 0;
  }
  
  .animate-slide-in-left {
    animation: slideInLeft 0.8s ease-out forwards;
    opacity: 0;
  }
  
  .animate-slide-in-right {
    animation: slideInRight 0.8s ease-out forwards;
    opacity: 0;
  }
  
  .animate-float {
    animation: float 6s ease-in-out infinite;
  }
  
  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }
  
  .delay-100 { animation-delay: 0.1s; }
  .delay-200 { animation-delay: 0.2s; }
  .delay-300 { animation-delay: 0.3s; }
  .delay-400 { animation-delay: 0.4s; }
  .delay-500 { animation-delay: 0.5s; }
  .delay-600 { animation-delay: 0.6s; }
  .delay-700 { animation-delay: 0.7s; }
  .delay-800 { animation-delay: 0.8s; }
  
  /* 스크롤 트리거 애니메이션 */
  .scroll-hidden {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  
  .scroll-visible {
    opacity: 1;
    transform: translateY(0);
  }
  
  .scroll-hidden-left {
    opacity: 0;
    transform: translateX(-40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  
  .scroll-hidden-right {
    opacity: 0;
    transform: translateX(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  
  .scroll-visible-x {
    opacity: 1;
    transform: translateX(0);
  }
  
  .scroll-scale-hidden {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }
  
  .scroll-scale-visible {
    opacity: 1;
    transform: scale(1);
  }
  
  .stagger-1 { transition-delay: 0.1s; }
  .stagger-2 { transition-delay: 0.2s; }
  .stagger-3 { transition-delay: 0.3s; }
  .stagger-4 { transition-delay: 0.4s; }
  
  /* 스크롤바 숨김 */
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState<'input' | 'info'>('input');
  const [feedback, setFeedback] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  
  // 사용자 정보 상태
  const [userAge, setUserAge] = useState('');
  const [userJob, setUserJob] = useState('');
  const [userSpecialty, setUserSpecialty] = useState('');
  const [feedbackAge, setFeedbackAge] = useState('');
  const [feedbackJob, setFeedbackJob] = useState('');
  const [feedbackSpecialty, setFeedbackSpecialty] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');

  // ============ 데모 자동 재생 상태 ============
  const [isRecording, setIsRecording] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<DemoConversation[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [chartProgress, setChartProgress] = useState(0);
  const [chartData, setChartData] = useState<Record<string, ChartFieldData>>({});
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const [copied, setCopied] = useState(false);
  const demoScrollRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRefs = useRef<ReturnType<typeof setInterval>[]>([]);

  // 스크롤 애니메이션
  const demoSection = useScrollAnimation();
  const howItWorksSection = useScrollAnimation();
  const benefitsSection = useScrollAnimation();
  const ctaSection = useScrollAnimation();

  // 타이머 헬퍼
  const addTimeout = (callback: () => void, delay: number) => {
    const timeout = setTimeout(callback, delay);
    timeoutRefs.current.push(timeout);
    return timeout;
  };
  const addInterval = (callback: () => void, delay: number) => {
    const interval = setInterval(callback, delay);
    intervalRefs.current.push(interval);
    return interval;
  };
  const clearAllTimers = () => {
    timeoutRefs.current.forEach(clearTimeout);
    intervalRefs.current.forEach(clearInterval);
    timeoutRefs.current = [];
    intervalRefs.current = [];
  };

  // 리셋
  const resetDemo = () => {
    clearAllTimers();
    setIsRecording(false);
    setCurrentConversation([]);
    setShowChart(false);
    setChartProgress(0);
    setChartData({});
    setCopied(false);
    setDemoPhase('idle');
  };

  // 차트 생성 애니메이션
  const startChartGeneration = (deptId: string, onComplete: () => void) => {
    const chartConfig = DEMO_CHARTS[deptId] || DEMO_CHARTS.general;
    setChartData({ ...chartConfig.data });
    setShowChart(true);
    
    let progress = 0;
    const interval = addInterval(() => {
      progress += 15;
      setChartProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        onComplete();
      }
    }, 120);
  };

  // 확정 애니메이션
  const startConfirmAnimation = (deptId: string, onComplete: () => void) => {
    const chartConfig = DEMO_CHARTS[deptId] || DEMO_CHARTS.general;
    const unconfirmedFields = chartConfig.fields.filter(f => !chartConfig.data[f.id]?.isConfirmed);
    
    if (unconfirmedFields.length > 0) {
      addTimeout(() => {
        setChartData(prev => ({
          ...prev,
          [unconfirmedFields[0].id]: { ...prev[unconfirmedFields[0].id], isConfirmed: true }
        }));
        addTimeout(onComplete, 1000);
      }, 600);
    } else {
      addTimeout(onComplete, 800);
    }
  };

  // 자동 데모 시작
  useEffect(() => {
    const startDemo = () => {
      resetDemo();
      
      addTimeout(() => {
        setDemoPhase('recording');
        setIsRecording(true);
        
        DEMO_CONVERSATION.forEach((conv) => {
          addTimeout(() => {
            setCurrentConversation(prev => [...prev, conv]);
            setTimeout(() => {
              if (demoScrollRef.current) {
                demoScrollRef.current.scrollTo({
                  top: demoScrollRef.current.scrollHeight,
                  behavior: 'smooth'
                });
              }
            }, 100);
          }, conv.delay);
        });
        
        const lastDelay = DEMO_CONVERSATION[DEMO_CONVERSATION.length - 1].delay;
        addTimeout(() => {
          setIsRecording(false);
          setDemoPhase('generating');
          
          startChartGeneration('internal', () => {
            setDemoPhase('confirming');
            
            startConfirmAnimation('internal', () => {
              setCopied(true);
              addTimeout(() => {
                setCopied(false);
                // 대기 후 반복
                addTimeout(() => startDemo(), 2500);
              }, 1500);
            });
          });
        }, lastDelay + 1500);
      }, 1000);
    };

    startDemo();
    return () => clearAllTimers();
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
    setIsSubmitting(true);
    
    const subscribeData = {
      type: 'subscribe',
      email,
      age: userAge,
      job: userJob,
      specialty: userSpecialty,
      timestamp: new Date().toISOString(),
      source: 'landing'
    };
    
    try {
      await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscribeData),
      });
      setIsSubscribed(true);
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
      setIsSubmitting(false);
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
      source: 'landing'
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
      source: 'landing'
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Inject animation styles */}
      <style>{animationStyles}</style>
      
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-2 rounded-xl shadow-lg shadow-teal-500/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg">Cheat Chat AI</span>
          </div>
          
          <Button onClick={onStart} className="bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/20">
            시작하기
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-4 relative overflow-hidden">
        {/* Animated background decoration */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-teal-100 rounded-full blur-3xl opacity-40 animate-float" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-30 animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-50 rounded-full blur-3xl opacity-20 animate-pulse" />
        
        <div className="container mx-auto max-w-4xl text-center relative">
          <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-sm font-medium mb-8">
            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            AI 기반 의료 차팅 솔루션
          </div>

          <h1 className="animate-fade-in-up delay-200 text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            진료 대화를
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-600">
              AI가 자동으로 차팅
            </span>
          </h1>
          
          <p className="animate-fade-in-up delay-400 text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            녹음 버튼 하나로 의사-환자 대화를 텍스트로 변환하고,
            <br className="hidden md:block" />
            <span className="font-medium text-slate-700">EMR에 바로 붙여넣을 수 있는 차트</span>를 생성합니다.
          </p>

          <div className="animate-fade-in-up delay-500 flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Button
              size="lg"
              onClick={onStart}
              className="w-full sm:w-auto text-base px-8 py-6 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 shadow-xl shadow-teal-600/25 transition-all hover:shadow-2xl hover:shadow-teal-600/30 hover:scale-105 animate-pulse-glow"
            >
              <Play className="w-5 h-5 mr-2" />
              바로 시작하기
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          <div className="animate-fade-in-up delay-600 flex items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-teal-500" />
              로그인 필요없음
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-teal-500" />
              무료 체험
            </span>
          </div>
        </div>
      </section>

      {/* Demo Preview - 풀 자동 재생 */}
      <section ref={demoSection.ref} className="py-16 px-4">
        <div className={`container mx-auto max-w-5xl scroll-scale-hidden ${demoSection.isVisible ? 'scroll-scale-visible' : ''}`}>
          {/* 녹음 컨트롤 헤더 */}
          <Card className="border-0 shadow-2xl shadow-slate-200/50 overflow-hidden">
            <div className="bg-white border-b border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* 녹음 버튼 */}
                  <div className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isRecording 
                      ? 'bg-red-500 shadow-red-500/30' 
                      : 'bg-gradient-to-br from-teal-500 to-teal-600 shadow-teal-500/30'
                  }`}>
                    {isRecording ? (
                      <Square className="w-4 h-4 text-white fill-white" />
                    ) : (
                      <Mic className="w-5 h-5 text-white" />
                    )}
                    {isRecording && (
                      <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">
                      {demoPhase === 'recording' && '녹음 중...'}
                      {demoPhase === 'generating' && '차트 생성 중...'}
                      {demoPhase === 'confirming' && '내용 확인 중...'}
                      {demoPhase === 'idle' && '대기 중...'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {demoPhase === 'recording' && '실시간 대화 변환'}
                      {demoPhase === 'generating' && 'AI 자동 차팅'}
                      {demoPhase === 'confirming' && 'AI 추측 확정'}
                      {demoPhase === 'idle' && '데모 시작 대기'}
                    </div>
                  </div>
                </div>
                
                {/* 진료과 표시 */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium bg-slate-100 border-slate-200 text-slate-600">
                  내과
                </div>
              </div>
            </div>

            <CardContent className="!p-0">
              <div className="grid md:grid-cols-2 min-h-[320px]">
                {/* Left - 실시간 대화 */}
                <div className="p-5 bg-white border-r border-slate-100 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">실시간 대화</span>
                    {isRecording && (
                      <div className="flex items-center gap-1 ml-auto px-2 py-0.5 rounded-full bg-red-50 border border-red-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-medium text-red-600">REC</span>
                      </div>
                    )}
                  </div>
                  
                  <div 
                    ref={demoScrollRef}
                    className="flex-1 bg-slate-50 rounded-xl border border-slate-100 p-3 max-h-[220px] overflow-y-scroll hide-scrollbar pointer-events-none"
                  >
                    {currentConversation.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                        녹음이 시작되면 대화가 표시됩니다
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentConversation.map((conv, index) => (
                          <div key={index} className={`flex ${conv.speaker === 'doctor' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                              conv.speaker === 'doctor'
                                ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white'
                                : 'bg-white border border-slate-200'
                            }`}>
                              <div className={`text-[10px] mb-0.5 font-medium flex items-center gap-1 ${
                                conv.speaker === 'doctor' ? 'text-teal-100' : 'text-slate-500'
                              }`}>
                                {conv.speaker === 'doctor' ? (
                                  <><Stethoscope className="w-2.5 h-2.5" /> 의사</>
                                ) : (
                                  <><User className="w-2.5 h-2.5" /> 환자</>
                                )}
                              </div>
                              <div className={`text-xs leading-relaxed ${
                                conv.speaker === 'doctor' ? 'text-white' : 'text-slate-700'
                              }`}>
                                {conv.text}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right - AI 차트 */}
                <div className="p-5 bg-gradient-to-br from-teal-50/50 to-cyan-50/50 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
                        <FileText className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">AI 생성 차트</span>
                    </div>
                    {showChart && chartProgress >= 100 && (
                      <div className={`h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 transition-all ${
                        copied ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}>
                        {copied ? <><Check className="w-3 h-3" /> 복사됨</> : <><Copy className="w-3 h-3" /> EMR에 복사</>}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 bg-white rounded-xl border border-teal-100 p-3 max-h-[220px] overflow-y-scroll hide-scrollbar pointer-events-none">
                    {!showChart ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                        녹음 종료 후 AI가 차트를 생성합니다
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const chartConfig = DEMO_CHARTS.internal;
                          const { fields } = chartConfig;
                          const progressPerField = 100 / fields.length;
                          
                          return fields.map((field, index) => {
                            if (chartProgress < (index + 1) * progressPerField) return null;
                            
                            const fieldData = chartData[field.id];
                            const isConfirmed = fieldData?.isConfirmed ?? false;
                            const value = fieldData?.value || '-';
                            
                            return (
                              <div 
                                key={field.id} 
                                className={`p-2 rounded-lg border transition-all ${
                                  isConfirmed 
                                    ? 'bg-teal-50/50 border-teal-200' 
                                    : 'bg-amber-50/50 border-amber-200'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {isConfirmed ? (
                                    <CheckCircle2 className="w-3 h-3 text-teal-600" />
                                  ) : (
                                    <HelpCircle className="w-3 h-3 text-amber-500" />
                                  )}
                                  <span className={`text-[10px] font-bold uppercase ${
                                    isConfirmed ? 'text-teal-700' : 'text-amber-700'
                                  }`}>
                                    {field.label}
                                  </span>
                                  <span className={`text-[9px] ml-auto ${
                                    isConfirmed ? 'text-teal-500' : 'text-amber-500'
                                  }`}>
                                    {isConfirmed ? '확정' : 'AI 추측'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-700 whitespace-pre-line pl-4">
                                  {value}
                                </p>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How it Works */}
      <section ref={howItWorksSection.ref} className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4 scroll-hidden ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
            사용 방법
          </h2>
          <p className={`text-slate-500 text-center mb-16 scroll-hidden stagger-1 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
            3단계로 간편하게 차트를 생성하세요
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-1 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-teal-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <Mic className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-teal-600 mb-2 tracking-wide">STEP 1</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">녹음 시작</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                마이크 버튼을 클릭하여<br />진료 대화를 녹음합니다.
              </p>
            </div>

            <div className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-2 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-cyan-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <MessageSquare className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-cyan-600 mb-2 tracking-wide">STEP 2</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">실시간 변환</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                AI가 음성을 텍스트로 변환하고<br />화자를 자동 구분합니다.
              </p>
            </div>

            <div className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-3 ${howItWorksSection.isVisible ? 'scroll-visible' : ''}`}>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-blue-600 mb-2 tracking-wide">STEP 3</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">차트 생성</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                AI가 C.C, P.I 등<br />차트를 자동 생성합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section ref={benefitsSection.ref} className="py-24 px-4 bg-slate-50">
        <div className="container mx-auto max-w-4xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-center text-slate-900 mb-16 scroll-hidden ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
            왜 Cheat Chat AI인가요?
          </h2>

          <div className="grid sm:grid-cols-2 gap-5">
            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-1 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-teal-500/25 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">진료 시간 단축</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    차트 작성 시간을 줄이고 환자 소통에 집중하세요.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-2 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/25 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">정확한 기록</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    대화 내용을 누락 없이 차트에 반영합니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-3 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">데이터 보안</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    녹음 데이터는 저장되지 않습니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-4 ${benefitsSection.isVisible ? 'scroll-visible' : ''}`}>
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/25 group-hover:scale-110 transition-transform">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">진료과별 최적화</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    진료과에 맞는 차트 양식을 제공합니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaSection.ref} className="py-24 px-4 bg-gradient-to-br from-teal-600 to-cyan-600 overflow-hidden">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className={`text-2xl md:text-3xl font-bold text-white mb-4 scroll-hidden ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            지금 바로 체험해보세요
          </h2>
          <p className={`text-teal-100 mb-10 scroll-hidden stagger-1 ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            로그인 없이 무료로 사용할 수 있습니다.
          </p>

          <Button
            size="lg"
            onClick={onStart}
            className={`bg-white text-teal-700 hover:bg-teal-50 shadow-xl mb-12 px-8 hover:scale-105 transition-transform scroll-scale-hidden stagger-2 ${ctaSection.isVisible ? 'scroll-scale-visible' : ''}`}
          >
            <Play className="w-5 h-5 mr-2" />
            시작하기
          </Button>

          {/* Email Subscribe */}
          <div className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-md mx-auto border border-white/20 scroll-hidden stagger-3 ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            <h3 className="font-semibold text-white mb-2">
              정식 출시 알림 받기
            </h3>
            <p className="text-teal-100 text-sm mb-5">
              새로운 기능 소식을 이메일로 받아보세요.
            </p>

            {isSubscribed ? (
              <div className="flex items-center justify-center gap-2 text-white py-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <span>구독 완료!</span>
              </div>
            ) : (
              <form onSubmit={handleEmailInputSubmit} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-white/20 border-white/30 text-white placeholder:text-teal-200 focus:bg-white/30"
                />
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-white text-teal-700 hover:bg-teal-50 px-6"
                >
                  {isSubmitting ? '...' : '구독'}
                </Button>
              </form>
            )}

            {/* 피드백 버튼 */}
            <div className="mt-4 pt-4 border-t border-white/20">
              <Dialog open={feedbackOpen} onOpenChange={(open) => {
                setFeedbackOpen(open);
                if (!open) setFeedbackStep('input');
              }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-teal-100 hover:text-white hover:bg-white/10">
                    <MessageSquare className="w-4 h-4 mr-1.5" />
                    피드백 보내기
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
            </div>
          </div>
          
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
                    disabled={isSubmitting}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                    완료
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-white">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-1 rounded-lg">
                <Stethoscope className="w-4 h-4" />
              </div>
              <span className="font-medium">Cheat Chat AI</span>
            </div>
            <p>© 2026 Utopify Technologies</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
