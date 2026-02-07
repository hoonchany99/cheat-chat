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
  Loader2,
  Send,
  Mail,
} from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/app/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";

// Google Sheets API URL
const GOOGLE_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbw5uH766QFw6m0kLchHySCPH7UUXX1F0TCxZe4ygqRiGEvhcSKKSr_nQ0gs_88GCDA/exec';

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
  {
    group: '내과계',
    items: [
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
    ],
  },
  {
    group: '외과계',
    items: [
      { value: 'surgery', label: '외과 (일반)' },
      { value: 'thoracic', label: '흉부외과' },
      { value: 'neurosurgery', label: '신경외과' },
      { value: 'orthopedic', label: '정형외과' },
      { value: 'plastic', label: '성형외과' },
      { value: 'urology', label: '비뇨의학과' },
      { value: 'obgyn', label: '산부인과' },
    ],
  },
  {
    group: '기타 진료과',
    items: [
      { value: 'pediatrics', label: '소아청소년과' },
      { value: 'psychiatry', label: '정신건강의학과' },
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
    ],
  },
  {
    group: '치과',
    items: [
      { value: 'dentistry', label: '치과 (일반)' },
      { value: 'oral_surgery', label: '구강악안면외과' },
      { value: 'orthodontics', label: '치과교정과' },
      { value: 'prosthodontics', label: '치과보철과' },
      { value: 'periodontics', label: '치주과' },
      { value: 'endodontics', label: '치과보존과' },
      { value: 'pediatric_dentistry', label: '소아치과' },
    ],
  },
  {
    group: '기타',
    items: [
      { value: 'undecided', label: '해당없음/미정' },
      { value: 'other_specialty', label: '기타' },
    ],
  },
];

// ============ FAQ 데이터 ============
const FAQ_ITEMS = [
  {
    q: "Savvy가 진단을 내리나요?",
    a: "아니요. #Dx는 의사가 실제로 언급/결정한 진단만 정리합니다. r/o는 감별로 고려되는 가능성을 r/o 표기로 정리합니다.",
  },
  {
    q: "말하지 않은 것도 채워 넣나요?",
    a: "아니요. 불명확하거나 대화에 없는 내용은 비우는 것을 우선합니다.",
  },
  {
    q: "수정 가능한가요?",
    a: "네. 생성 후 바로 편집한 뒤 EMR에 복사해 붙여넣을 수 있습니다.",
  },
  {
    q: "EMR 연동이 필요한가요?",
    a: "MVP는 복사-붙여넣기 중심입니다. 병원 환경에 따라 연동은 단계적으로 검토합니다.",
  },
  {
    q: "데이터/녹음은 저장되나요?",
    a: "오디오는 실시간 텍스트 변환을 위해 외부 API로 전송됩니다. 현재 버전은 녹음을 서버에 저장하지 않도록 설계 중이며, 상세 정책은 추후 공지 예정입니다.",
  },
];

// ============ 데모 자동 재생 데이터 ============

interface DemoConversation {
  speaker: 'doctor' | 'patient';
  text: string;
  delay: number;
  chartText?: string;
}

// ✅ 데모 대화 스크립트(교체): RLQ pain → appendicitis 의심 케이스
const DEMO_CONVERSATION: DemoConversation[] = [
  { speaker: 'doctor', text: '어디가 불편해서 오셨어요?', delay: 0, chartText: '' },

  {
    speaker: 'patient',
    text: '배가 너무 아파요. 어젯밤부터 시작됐어요.',
    delay: 1200,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)`,
  },

  {
    speaker: 'doctor',
    text: '처음에 어디가 아프기 시작했어요?',
    delay: 2600,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)`,
  },

  {
    speaker: 'patient',
    text: '처음엔 배꼽 주변이 아팠는데, 오늘 아침부터 오른쪽 아랫배로 옮겨갔어요.',
    delay: 4200,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
어젯밤부터 배꼽 주위 통증 시작. 금일 아침부터 RLQ로 이동함.`,
  },

  {
    speaker: 'doctor',
    text: '통증이 어떤 양상인가요? 움직이면 더 심해지나요?',
    delay: 6000,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
어젯밤부터 배꼽 주위 통증 시작. 금일 아침부터 RLQ로 이동함.`,
  },

  {
    speaker: 'patient',
    text: '처음엔 뻐근했는데 지금은 찌르는 것처럼 아파요. 움직이면 더 심해져요.',
    delay: 7600,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 악화됨.`,
  },

  {
    speaker: 'doctor',
    text: '0에서 10까지면 통증이 어느 정도예요?',
    delay: 9400,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 악화됨.`,
  },

  {
    speaker: 'patient',
    text: '8 정도요. 정말 많이 아파요.',
    delay: 11200,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함.`,
  },

  {
    speaker: 'doctor',
    text: '열은 있었어요? 오한은요?',
    delay: 13000,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함.`,
  },

  {
    speaker: 'patient',
    text: '오늘 아침에 재보니까 38.2도였어요. 오한도 있었어요.',
    delay: 14600,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음.`,
  },

  {
    speaker: 'doctor',
    text: '메스꺼움이나 구토는요? 식욕은요?',
    delay: 16500,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음.`,
  },

  {
    speaker: 'patient',
    text: '메스껍고 한 번 토했어요. 식욕도 전혀 없어요.',
    delay: 18200,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음. 메스꺼움과 구토 1회 있었으며, 식욕 부진 호소함.`,
  },

  {
    speaker: 'doctor',
    text: '복부 진찰할게요. McBurney point 압통 있고, 반발통 양성이네요. Rovsing sign도 양성입니다.',
    delay: 20500,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음. 메스꺼움과 구토 1회 있었으며, 식욕 부진 호소함.

[ROS (+/-)]
N/V(+), Fever(+), Chills(+), Appetite loss(+)

[PE]
Abdomen: Tenderness (+, RLQ), Rebound tenderness (+), Rovsing sign (+)`,
  },

  {
    speaker: 'doctor',
    text: 'CBC, CRP 포함해서 피검사하고 복부 CT 찍겠습니다. 임신 검사도 같이 할게요.',
    delay: 23500,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음. 메스꺼움과 구토 1회 있었으며, 식욕 부진 호소함.

[ROS (+/-)]
N/V(+), Fever(+), Chills(+), Appetite loss(+)

[PE]
Abdomen: Tenderness (+, RLQ), Rebound tenderness (+), Rovsing sign (+)

[Assessment]
# Appendicitis suspected

[Plan]
- CBC, CRP

- Abdominal CT

- Pregnancy test`,
  },

  {
    speaker: 'doctor',
    text: '급성 충수염 의심되어 외과 협진 요청하겠습니다. 금식 유지하시고 수액 맞으면서 대기해주세요.',
    delay: 26500,
    chartText: `[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 RLQ로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음. 메스꺼움과 구토 1회 있었으며, 식욕 부진 호소함.

[ROS (+/-)]
N/V(+), Fever(+), Chills(+), Appetite loss(+)

[Past History]
PMH: None
Meds: None
Allergies: None

[PE]
Abdomen: Tenderness (+, RLQ), Rebound tenderness (+), Rovsing sign (+)

[Assessment]
# Appendicitis suspected
r/o Gastroenteritis

[Plan]
- CBC, CRP

- Abdominal CT

- Pregnancy test

- Surgical consultation

- NPO and IV fluids`,
  },
];

type DemoPhase = 'idle' | 'recording' | 'complete';

// 스크롤 애니메이션 훅
function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

// CSS 애니메이션 스타일
const animationStyles = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-20px); }
  }
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(20, 184, 166, 0.3); }
    50% { box-shadow: 0 0 40px rgba(20, 184, 166, 0.6); }
  }

  .animate-fade-in-up { animation: fadeInUp 0.8s ease-out forwards; opacity: 0; }
  .animate-fade-in { animation: fadeIn 0.6s ease-out forwards; opacity: 0; }
  .animate-slide-in-left { animation: slideInLeft 0.8s ease-out forwards; opacity: 0; }
  .animate-slide-in-right { animation: slideInRight 0.8s ease-out forwards; opacity: 0; }
  .animate-float { animation: float 6s ease-in-out infinite; }
  .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }

  .delay-100 { animation-delay: 0.1s; }
  .delay-200 { animation-delay: 0.2s; }
  .delay-300 { animation-delay: 0.3s; }
  .delay-400 { animation-delay: 0.4s; }
  .delay-500 { animation-delay: 0.5s; }
  .delay-600 { animation-delay: 0.6s; }
  .delay-700 { animation-delay: 0.7s; }
  .delay-800 { animation-delay: 0.8s; }

  .scroll-hidden {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  .scroll-visible { opacity: 1; transform: translateY(0); }

  .scroll-scale-hidden {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }
  .scroll-scale-visible { opacity: 1; transform: scale(1); }

  .stagger-1 { transition-delay: 0.1s; }
  .stagger-2 { transition-delay: 0.2s; }
  .stagger-3 { transition-delay: 0.3s; }
  .stagger-4 { transition-delay: 0.4s; }
  .stagger-5 { transition-delay: 0.5s; }

  .hide-scrollbar::-webkit-scrollbar { display: none; }
  .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
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

  // 데모 자동 재생 상태
  const [isRecording, setIsRecording] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<DemoConversation[]>([]);
  const [chartText, setChartText] = useState('');
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const [copied, setCopied] = useState(false);
  const demoScrollRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRefs = useRef<ReturnType<typeof setInterval>[]>([]);

  const demoSection = useScrollAnimation();
  const trustSection = useScrollAnimation();
  const problemSection = useScrollAnimation();
  const solutionSection = useScrollAnimation();
  const rulesSection = useScrollAnimation();
  const medicolegalSection = useScrollAnimation();
  const exampleSection = useScrollAnimation();
  const howItWorksSection = useScrollAnimation();
  const benefitsSection = useScrollAnimation();
  const ctaSection = useScrollAnimation();

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

  const resetDemo = () => {
    clearAllTimers();
    setIsRecording(false);
    setCurrentConversation([]);
    setChartText('');
    setCopied(false);
    setDemoPhase('idle');
  };

  useEffect(() => {
    const startDemo = () => {
      resetDemo();

      addTimeout(() => {
        setDemoPhase('recording');
        setIsRecording(true);

        DEMO_CONVERSATION.forEach((conv) => {
          addTimeout(() => {
            setCurrentConversation((prev) => [...prev, conv]);

            if (conv.chartText !== undefined) {
              addTimeout(() => {
                setChartText(conv.chartText || '');
                setTimeout(() => {
                  if (chartScrollRef.current) {
                    chartScrollRef.current.scrollTo({
                      top: chartScrollRef.current.scrollHeight,
                      behavior: 'smooth',
                    });
                  }
                }, 100);
              }, 400);
            }

            setTimeout(() => {
              if (demoScrollRef.current) {
                demoScrollRef.current.scrollTo({
                  top: demoScrollRef.current.scrollHeight,
                  behavior: 'smooth',
                });
              }
            }, 100);
          }, conv.delay);
        });

        const lastDelay = DEMO_CONVERSATION[DEMO_CONVERSATION.length - 1].delay;
        addTimeout(() => {
          setIsRecording(false);
          setDemoPhase('complete');

          addTimeout(() => {
            setCopied(true);
            addTimeout(() => {
              setCopied(false);
              addTimeout(() => startDemo(), 3000);
            }, 1500);
          }, 1000);
        }, lastDelay + 2000);
      }, 1000);
    };

    startDemo();
    return () => clearAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmailInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('올바른 이메일을 입력해주세요');
      return;
    }
    setSubscribeOpen(true);
  };

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
      source: 'landing',
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

  const handleFeedbackNext = () => {
    if (!feedback.trim()) {
      toast.error('피드백을 입력해주세요');
      return;
    }
    setFeedbackStep('info');
  };

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
      source: 'landing',
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
      source: 'landing',
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
      <style>{animationStyles}</style>

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <span className="font-bold text-2xl">Savvy</span>
          </div>

          <Button onClick={onStart} className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20">
            지금 시작하기
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-100 rounded-full blur-3xl opacity-40 animate-float" />
        <div
          className="absolute bottom-10 right-10 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-30 animate-float"
          style={{ animationDelay: '2s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-50 rounded-full blur-3xl opacity-20 animate-pulse" />

        <div className="container mx-auto max-w-4xl text-center relative">
          <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium mb-8">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            의료진을 위한 AI 차팅 어시스턴트
          </div>

          <h1 className="animate-fade-in-up delay-200 text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            말하는 순간,
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-slate-600">
              차트가 채워집니다
            </span>
          </h1>

          <p className="animate-fade-in-up delay-400 text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            의사–환자 대화 → EMR-ready 차트 (실시간)
          </p>

          <div className="animate-fade-in-up delay-500 flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Button
              size="lg"
              onClick={onStart}
              className="w-full sm:w-auto text-base px-8 py-6 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-xl shadow-blue-600/25 transition-all hover:shadow-2xl hover:shadow-blue-600/30 hover:scale-105 animate-pulse-glow"
            >
              <Play className="w-5 h-5 mr-2" />
              지금 시작하기
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          {/* ✅ 체크 문구 교체 */}
          <div className="animate-fade-in-up delay-600 flex items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-blue-500" />
              회원가입 없이 시작
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-blue-500" />
              EMR-ready 포맷
            </span>
          </div>
        </div>
      </section>

      {/* Demo Preview - Hero 바로 아래에서 "이게 되네?" 경험 전달 */}
      <section ref={demoSection.ref} className="py-16 px-4 bg-slate-50">
        <div className="container mx-auto max-w-5xl mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Live Preview · 실제 화면
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">실시간으로 차트가 만들어집니다</h2>
        </div>

        <div className={`container mx-auto max-w-5xl scroll-scale-hidden ${demoSection.isVisible ? 'scroll-scale-visible' : ''}`}>
          <Card className="border-0 shadow-2xl shadow-slate-200/50 overflow-hidden">
            <div className="bg-white border-b border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                      isRecording ? 'bg-red-500 shadow-red-500/30' : 'bg-gradient-to-br from-blue-600 to-blue-700 shadow-blue-500/30'
                    }`}
                  >
                    {isRecording ? <Square className="w-4 h-4 text-white fill-white" /> : <Mic className="w-5 h-5 text-white" />}
                    {isRecording && <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">
                      {demoPhase === 'recording' && '기록중입니다'}
                      {demoPhase === 'complete' && '차트 완성'}
                      {demoPhase === 'idle' && '대기 중...'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {demoPhase === 'recording' && '대화를 듣고 실시간으로 차트를 생성합니다'}
                      {demoPhase === 'complete' && 'EMR에 복사할 준비가 되었습니다'}
                      {demoPhase === 'idle' && '예시가 곧 시작됩니다'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium bg-slate-100 border-slate-200 text-slate-600">
                  예시 케이스
                </div>
              </div>
            </div>

            <CardContent className="!p-0">
              <div className="grid md:grid-cols-2 min-h-[320px]">
                {/* Left - 실시간 대화 */}
                <div className="p-5 bg-white border-r border-slate-100 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
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
                    className="flex-1 bg-slate-50 rounded-xl border border-slate-100 p-3 max-h-[220px] overflow-y-scroll hide-scrollbar"
                  >
                    {currentConversation.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                        녹음이 시작되면 대화가 표시됩니다
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentConversation.map((conv, index) => (
                          <div key={index} className={`flex ${conv.speaker === 'doctor' ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[85%] rounded-xl px-3 py-2 ${
                                conv.speaker === 'doctor'
                                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white'
                                  : 'bg-white border border-slate-200'
                              }`}
                            >
                              <div
                                className={`text-[10px] mb-0.5 font-medium flex items-center gap-1 ${
                                  conv.speaker === 'doctor' ? 'text-blue-100' : 'text-slate-500'
                                }`}
                              >
                                {conv.speaker === 'doctor' ? (
                                  <>
                                    <Stethoscope className="w-2.5 h-2.5" /> 의사
                                  </>
                                ) : (
                                  <>
                                    <User className="w-2.5 h-2.5" /> 환자
                                  </>
                                )}
                              </div>
                              <div className={`text-xs leading-relaxed ${conv.speaker === 'doctor' ? 'text-white' : 'text-slate-700'}`}>
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
                <div className="p-5 bg-gradient-to-br from-blue-50/50 to-slate-50/50 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                        <FileText className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">AI 생성 차트</span>
                    </div>
                    {chartText && demoPhase === 'complete' && (
                      <div
                        className={`h-6 px-2 rounded text-[10px] font-medium flex items-center gap-1 transition-all ${
                          copied ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3" /> 복사됨
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> EMR에 복사
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    ref={chartScrollRef}
                    className={`flex-1 bg-white rounded-xl border p-3 max-h-[260px] overflow-y-scroll hide-scrollbar transition-colors ${
                      isRecording ? 'border-blue-300' : 'border-blue-100'
                    }`}
                  >
                    {!chartText ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                        대화를 시작하면 AI가 실시간으로 차트를 생성합니다
                      </div>
                    ) : (
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{chartText}</pre>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Trust bullets */}
      <section ref={trustSection.ref} className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-3 gap-4">
            {[
              "말하지 않은 것은 쓰지 않습니다.",
              "확정(#)과 가능성(r/o)을 섞지 않습니다.",
              "수정/보완은 언제든지 가능합니다.",
            ].map((t, i) => (
              <div
                key={i}
                className={`rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-700 scroll-hidden stagger-${i + 1} ${
                  trustSection.isVisible ? 'scroll-visible' : ''
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <Check className="w-4 h-4 text-blue-600" />
                  {t}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section ref={problemSection.ref} className="py-20 px-4 bg-slate-50">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-slate-900 mb-3 scroll-hidden ${
            problemSection.isVisible ? 'scroll-visible' : ''
          }`}>
            차트는 늘 "기억을 더듬어" 작성됩니다
          </h2>
          <p className={`text-slate-600 mb-6 leading-relaxed scroll-hidden stagger-1 ${
            problemSection.isVisible ? 'scroll-visible' : ''
          }`}>
            하루 진료가 끝난 뒤 차트를 쓰다 보면:
          </p>
          <div className="space-y-3 text-slate-700">
            {[
              '"아까 뭐라고 설명했더라?"',
              '"이 증상은 정확히 언제부터였지?"',
              '"검사 오더를 다 남겼나?"',
            ].map((text, i) => (
              <div key={i} className={`flex items-start gap-2 scroll-hidden stagger-${i + 2} ${
                problemSection.isVisible ? 'scroll-visible' : ''
              }`}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className={`mt-8 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 scroll-hidden stagger-5 ${
            problemSection.isVisible ? 'scroll-visible' : ''
          }`}>
            <p className="text-slate-800 font-medium">
              💡 Savvy는 기억 대신 <span className="text-blue-700">대화를 기반으로</span> 기록을 만듭니다.
            </p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section ref={solutionSection.ref} className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-slate-900 mb-3 scroll-hidden ${
            solutionSection.isVisible ? 'scroll-visible' : ''
          }`}>
            대화를, 차트 언어로 정리합니다
          </h2>
          <p className={`text-slate-600 leading-relaxed mb-8 scroll-hidden stagger-1 ${
            solutionSection.isVisible ? 'scroll-visible' : ''
          }`}>
            Savvy는 진료 중 오간 대화를 CC/PI/ROS/PE/A/P 구조로 자동 정리합니다.
          </p>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[
              { title: "CC/PI는 한국어 그대로", desc: "환자 표현/현병력 서술을 자연스럽게" },
              { title: "A/P는 약어 중심", desc: "임상에서 쓰는 표기 스타일로" },
              { title: "바로 복사해서 EMR에", desc: "붙여넣기 가능한 단일 문서" },
            ].map((item, i) => (
              <div key={i} className={`rounded-2xl border border-slate-100 bg-slate-50 p-5 scroll-hidden stagger-${i + 2} ${
                solutionSection.isVisible ? 'scroll-visible' : ''
              }`}>
                <div className="font-semibold text-slate-900 mb-1">{item.title}</div>
                <div className="text-sm text-slate-600">{item.desc}</div>
              </div>
            ))}
          </div>

          <Button onClick={onStart} className={`bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 scroll-hidden stagger-5 ${
            solutionSection.isVisible ? 'scroll-visible' : ''
          }`}>
            지금 시작하기
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </section>

      {/* Rule: #Dx vs r/o */}
      <section ref={rulesSection.ref} className="py-20 px-4 bg-slate-50">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-slate-900 mb-3 scroll-hidden ${
            rulesSection.isVisible ? 'scroll-visible' : ''
          }`}>
            확정과 가능성을 섞지 않습니다
          </h2>
          <p className={`text-slate-600 leading-relaxed mb-8 scroll-hidden stagger-1 ${
            rulesSection.isVisible ? 'scroll-visible' : ''
          }`}>
            Savvy는 진단을 "새로 내리지 않습니다". 임상에서 쓰는 표기 규칙을 그대로 따릅니다.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className={`rounded-2xl border border-blue-200 bg-white p-6 shadow-sm scroll-hidden stagger-2 ${
              rulesSection.isVisible ? 'scroll-visible' : ''
            }`}>
              <div className="text-sm font-semibold text-blue-700 mb-2">#Dx</div>
              <div className="text-slate-900 font-bold mb-2">의사가 실제로 언급/결정한 진단만</div>
              <p className="text-sm text-slate-600 leading-relaxed">
                대화에서 "급성 충수염 의심/진단"처럼 의사가 명확히 말한 내용만 기록합니다.
              </p>
            </div>

            <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm scroll-hidden stagger-3 ${
              rulesSection.isVisible ? 'scroll-visible' : ''
            }`}>
              <div className="text-sm font-semibold text-slate-600 mb-2">r/o</div>
              <div className="text-slate-900 font-bold mb-2">감별로 고려되는 가능성은 r/o로</div>
              <p className="text-sm text-slate-600 leading-relaxed">
                배제·고려가 필요한 감별만 r/o 형태로 정리합니다. (예: r/o gastroenteritis)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Medicolegal / Memory */}
      <section ref={medicolegalSection.ref} className="py-20 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-slate-900 mb-3 scroll-hidden ${
            medicolegalSection.isVisible ? 'scroll-visible' : ''
          }`}>
            기록은 의사를 보호합니다
          </h2>
          <p className={`text-slate-600 leading-relaxed mb-8 scroll-hidden stagger-1 ${
            medicolegalSection.isVisible ? 'scroll-visible' : ''
          }`}>
            의료 분쟁에서 중요한 것은 "무엇을 했는가"만큼 "무엇을 기록했는가"입니다.
            <br className="hidden md:block" />
            Savvy는 대화를 바탕으로 진료 내용을 더 정확히 회상하고 설명할 수 있게 돕습니다.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: "환자 표현", desc: "주호소/현병력을 환자 말 그대로" },
              { title: "확인된 +/-", desc: "질문과 답변으로 확인된 ROS" },
              { title: "의사 오더", desc: "검사/처치/협진 등 실제 오더" },
            ].map((b, i) => (
              <div key={i} className={`rounded-2xl border border-slate-100 bg-slate-50 p-6 scroll-hidden stagger-${i + 2} ${
                medicolegalSection.isVisible ? 'scroll-visible' : ''
              }`}>
                <div className="font-bold text-slate-900 mb-1">{b.title}</div>
                <div className="text-sm text-slate-600">{b.desc}</div>
              </div>
            ))}
          </div>

          <p className={`text-xs text-slate-500 mt-6 scroll-hidden stagger-5 ${
            medicolegalSection.isVisible ? 'scroll-visible' : ''
          }`}>
            * 법률적 결과를 보장하지 않으며, 최종 기록 책임은 의료진에게 있습니다.
          </p>
        </div>
      </section>

      {/* Example: conversation -> chart */}
      <section ref={exampleSection.ref} className="py-20 px-4 bg-slate-50">
        <div className="container mx-auto max-w-5xl">
          <h2 className={`text-2xl md:text-3xl font-bold text-slate-900 mb-3 scroll-hidden ${
            exampleSection.isVisible ? 'scroll-visible' : ''
          }`}>
            실제로 이렇게 변환됩니다
          </h2>
          <p className={`text-slate-600 mb-8 scroll-hidden stagger-1 ${
            exampleSection.isVisible ? 'scroll-visible' : ''
          }`}>
            실시간 대화(입력) → EMR-ready 차트(출력)
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className={`border border-slate-200 shadow-sm bg-white scroll-hidden stagger-2 ${
              exampleSection.isVisible ? 'scroll-visible' : ''
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-4 h-4 text-slate-600" />
                  <div className="font-semibold text-slate-900">입력: 대화 예시</div>
                </div>
                <div className="text-sm text-slate-700 leading-relaxed space-y-1 max-h-[280px] overflow-y-auto pr-2">
                  <div><span className="text-blue-600 font-medium">의사:</span> 어디가 불편해서 오셨어요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 배가 너무 아파요. 어젯밤부터 시작됐어요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 처음에 어디가 아프기 시작했어요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 배꼽 주변이었는데, 오른쪽 아랫배로 옮겨갔어요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 통증이 어떤 양상인가요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 뻐근했는데 지금은 찌르는 것처럼요. 움직이면 더 심해요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 0~10이면 통증이 어느 정도예요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 8 정도요. 정말 많이 아파요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 열은 있었어요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 38.2도였어요. 오한도 있었어요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 메스꺼움이나 구토는요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 메스껍고 한 번 토했어요. 식욕도 전혀 없어요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 마지막 대변은 언제 보셨어요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 어제 저녁 이후로 못 봤어요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 마지막 생리는요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 2주 전에 했어요. 주기는 규칙적이에요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 과거력이나 수술력 있으세요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 없어요. 건강했어요.</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> 드시는 약이나 알레르기는요?</div>
                  <div><span className="text-slate-500 font-medium">환자:</span> 약은 없고, 알레르기도 없어요.</div>
                  <div className="pt-1 border-t border-slate-100 mt-2"><span className="text-blue-600 font-medium">의사:</span> RLQ McBurney point 압통, 반발통(+), Rovsing sign(+).</div>
                  <div><span className="text-blue-600 font-medium">의사:</span> CBC, CRP, Abd CT, 임신검사. 충수염 의심, 외과 협진. NPO, 수액.</div>
                </div>
              </CardContent>
            </Card>

            <Card className={`border border-blue-200 shadow-sm bg-white scroll-hidden stagger-3 ${
              exampleSection.isVisible ? 'scroll-visible' : ''
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <div className="font-semibold text-slate-900">출력: 차트 예시</div>
                  <div className="ml-auto flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-medium">
                    <Copy className="w-3 h-3" /> EMR에 복사
                  </div>
                </div>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50 rounded-xl border border-slate-100 p-4 max-h-[280px] overflow-y-auto">
{`[CC]
배가 너무 아파요. (onset: 어젯밤)

[PI]
상환은 어젯밤부터 배꼽 주변에 뻐근한 통증 발생함. 금일 아침부터 통증이 오른쪽 아랫배로 옮겨갔으며, 찌르는 듯한 통증으로 변화함. 움직이면 통증이 심해짐. 통증 강도는 8/10으로 호소함. 금일 아침 38.2도의 발열과 오한 있었음. 메스꺼움과 구토 1회 있었으며, 식욕 부진 호소함. 어제 저녁 이후 대변 보지 못했음.

[ROS (+/-)]
N/V(+), Fever(+), Chills(+), Appetite loss(+)

[Past History]
PMH: None
Meds: None
Allergies: None

[PE]
Abdomen: Tenderness (+, RLQ), Rebound tenderness (+), Rovsing sign (+)

[Assessment]
r/o Appendicitis
r/o Gastroenteritis

[Plan]
- CBC, CRP

- Abdominal CT

- Pregnancy test

- Surgical consultation

- NPO and IV fluids`}
                  </pre>
                </CardContent>
              </Card>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section ref={howItWorksSection.ref} className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-5xl">
          <h2
            className={`text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4 scroll-hidden ${
              howItWorksSection.isVisible ? 'scroll-visible' : ''
            }`}
          >
            3단계로 끝나는 차트 작성
          </h2>
          <p
            className={`text-slate-500 text-center mb-16 scroll-hidden stagger-1 ${
              howItWorksSection.isVisible ? 'scroll-visible' : ''
            }`}
          >
            복잡한 설정 없이, 녹음만 하면 됩니다
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div
              className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-1 ${
                howItWorksSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <Mic className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-blue-600 mb-2 tracking-wide">STEP 1</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">녹음 시작</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                마이크 버튼을 클릭하여
                <br />
                진료 대화를 녹음합니다.
              </p>
            </div>

            <div
              className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-2 ${
                howItWorksSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-slate-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <MessageSquare className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-slate-600 mb-2 tracking-wide">STEP 2</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">실시간 구조화</h3>
              {/* ✅ 문구 교체 */}
              <p className="text-sm text-slate-500 leading-relaxed">
                AI가 대화를 텍스트로 변환하고
                <br />
                차트에 필요한 정보로 정리합니다.
              </p>
            </div>

            <div
              className={`text-center group hover:-translate-y-2 transition-all duration-300 scroll-hidden stagger-3 ${
                howItWorksSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <FileText className="w-7 h-7 text-white" />
              </div>
              <div className="text-xs font-bold text-blue-600 mb-2 tracking-wide">STEP 3</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg">차트 생성</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                AI가 CC, PI, ROS 등
                <br />
                차트를 자동 완성합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section ref={benefitsSection.ref} className="py-24 px-4 bg-slate-50">
        <div className="container mx-auto max-w-4xl">
          <h2
            className={`text-2xl md:text-3xl font-bold text-center text-slate-900 mb-16 scroll-hidden ${
              benefitsSection.isVisible ? 'scroll-visible' : ''
            }`}
          >
            왜 Savvy인가요?
          </h2>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* ✅ Benefits 카피 교체 */}
            <Card
              className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-1 ${
                benefitsSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">차팅 시간 절감</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    진료 후 차트 작성 부담을 줄이고, 환자에게 더 집중하세요.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-2 ${
                benefitsSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shrink-0 shadow-lg shadow-slate-500/25 group-hover:scale-110 transition-transform">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">말한 내용 기반으로 정리</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    대화에서 확인된 내용만 반영합니다. 불명확하면 과감히 비웁니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-3 ${
                benefitsSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">기록으로 진료를 보호</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    환자 표현과 의사 오더가 문서로 남아 재진·분쟁 상황에서도 도움이 됩니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white group cursor-default scroll-hidden stagger-4 ${
                benefitsSection.isVisible ? 'scroll-visible' : ''
              }`}
            >
              <CardContent className="p-6 flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/25 group-hover:scale-110 transition-transform">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">#Dx / r/o 표기 구분</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    확정과 감별을 섞지 않고, 한국 병원 EMR 문장 흐름에 맞춰 작성합니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-4 bg-white">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-10">
            자주 묻는 질문
          </h2>

          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, idx) => (
              <AccordionItem key={idx} value={`faq-${idx}`} className="border-slate-100">
                <AccordionTrigger className="text-left text-slate-900">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={ctaSection.ref} className="py-24 px-4 bg-gradient-to-br from-blue-600 to-slate-600 overflow-hidden">
        <div className="container mx-auto max-w-2xl text-center">
          <h2
            className={`text-2xl md:text-3xl font-bold text-white mb-4 scroll-hidden ${
              ctaSection.isVisible ? 'scroll-visible' : ''
            }`}
          >
            차트 작성, 더 이상 고민하지 마세요
          </h2>
          {/* ✅ CTA 문구 교체 */}
          <p className={`text-blue-100 mb-10 scroll-hidden stagger-1 ${ctaSection.isVisible ? 'scroll-visible' : ''}`}>
            회원가입 없이 바로 시작하고, 완성된 차트를 EMR에 복사하세요
          </p>

          <Button
            size="lg"
            onClick={onStart}
            className={`bg-white text-blue-700 hover:bg-blue-50 shadow-xl mb-12 px-8 hover:scale-105 transition-transform scroll-scale-hidden stagger-2 ${
              ctaSection.isVisible ? 'scroll-scale-visible' : ''
            }`}
          >
            <Play className="w-5 h-5 mr-2" />
            지금 시작하기
          </Button>

          {/* Email Subscribe */}
          <div
            className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-md mx-auto border border-white/20 scroll-hidden stagger-3 ${
              ctaSection.isVisible ? 'scroll-visible' : ''
            }`}
          >
            <h3 className="font-semibold text-white mb-2">정식 출시 알림 받기</h3>
            <p className="text-blue-100 text-sm mb-5">새로운 기능 소식을 이메일로 받아보세요.</p>

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
                  className="flex-1 bg-white/20 border-white/30 text-white placeholder:text-blue-200 focus:bg-white/30"
                />
                <Button type="submit" disabled={isSubmitting} className="bg-white text-blue-700 hover:bg-blue-50 px-6">
                  {isSubmitting ? '...' : '구독'}
                </Button>
              </form>
            )}

            {/* 피드백 버튼 */}
            <div className="mt-4 pt-4 border-t border-white/20">
              <Dialog
                open={feedbackOpen}
                onOpenChange={(open) => {
                  setFeedbackOpen(open);
                  if (!open) setFeedbackStep('input');
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-blue-100 hover:text-white hover:bg-white/10">
                    <MessageSquare className="w-4 h-4 mr-1.5" />
                    피드백 보내기
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
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
                        <Button onClick={handleFeedbackNext} className="bg-blue-600 hover:bg-blue-700">
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
                            {AGE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={feedbackJob} onValueChange={setFeedbackJob}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="직업" />
                          </SelectTrigger>
                          <SelectContent>
                            {JOB_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Select value={feedbackSpecialty} onValueChange={setFeedbackSpecialty}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="전공과" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {SPECIALTY_OPTIONS.map((group) => (
                            <SelectGroup key={group.group}>
                              <SelectLabel>{group.group}</SelectLabel>
                              {group.items.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
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
                        <Button type="submit" disabled={isSendingFeedback} className="bg-blue-600 hover:bg-blue-700">
                          {isSendingFeedback ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
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
                  <Mail className="w-5 h-5 text-blue-600" />
                  조금만 더 알려주세요!
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEmailSubscribe} className="space-y-4">
                <p className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{email}</span>로 알림을 보내드립니다.
                  <br />
                  더 나은 서비스를 위해 간단한 정보를 입력해주세요.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <Select value={userAge} onValueChange={setUserAge}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="연령대 *" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={userJob} onValueChange={setUserJob}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="직업 *" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Select value={userSpecialty} onValueChange={setUserSpecialty}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="전공과 *" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {SPECIALTY_OPTIONS.map((group) => (
                      <SelectGroup key={group.group}>
                        <SelectLabel>{group.group}</SelectLabel>
                        {group.items.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setSubscribeOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
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
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-1 rounded-lg">
                <Stethoscope className="w-4 h-4" />
              </div>
              <span className="font-bold text-lg">Savvy</span>
            </div>
            <p>© 2026 Utopify Technologies</p>
          </div>
        </div>
      </footer>
    </div>
  );
}