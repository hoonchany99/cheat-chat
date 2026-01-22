import { useState, useEffect, useRef } from 'react';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { 
  Stethoscope, 
  Search, 
  User, 
  Calendar, 
  Clock, 
  FileText, 
  Mic, 
  Square, 
  ChevronRight,
  Phone,
  MapPin,
  AlertCircle,
  Pill,
  Activity,
  Copy,
  Check,
  History,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { DEPARTMENT_PRESETS } from '@/services/chartService';

// ============ 목업 데이터 ============

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: '남' | '여';
  chartNumber: string;
  phone: string;
  address: string;
  allergies: string[];
  lastVisit: string;
  visitReason: string;
  photo?: string;
}

interface PastRecord {
  id: string;
  date: string;
  department: string;
  doctor: string;
  chiefComplaint: string;
  diagnosis: string;
  prescription: string;
}

interface DemoConversation {
  speaker: 'doctor' | 'patient';
  text: string;
  delay: number; // ms
}

// 오늘의 환자 목록
const PATIENTS: Patient[] = [
  {
    id: '1',
    name: '김서연',
    age: 34,
    gender: '여',
    chartNumber: '2024-0892',
    phone: '010-1234-5678',
    address: '서울시 강남구 역삼동',
    allergies: ['페니실린'],
    lastVisit: '2024-01-15',
    visitReason: '두통',
  },
  {
    id: '2',
    name: '박민수',
    age: 45,
    gender: '남',
    chartNumber: '2024-0756',
    phone: '010-9876-5432',
    address: '서울시 서초구 서초동',
    allergies: [],
    lastVisit: '2024-01-10',
    visitReason: '허리통증',
  },
  {
    id: '3',
    name: '이지은',
    age: 28,
    gender: '여',
    chartNumber: '2024-1024',
    phone: '010-5555-1234',
    address: '서울시 송파구 잠실동',
    allergies: ['아스피린', '설파제'],
    lastVisit: '2024-01-08',
    visitReason: '피부발진',
  },
  {
    id: '4',
    name: '최준혁',
    age: 52,
    gender: '남',
    chartNumber: '2024-0621',
    phone: '010-7777-8888',
    address: '서울시 마포구 합정동',
    allergies: [],
    lastVisit: '2024-01-05',
    visitReason: '당뇨 정기검진',
  },
  {
    id: '5',
    name: '정하윤',
    age: 8,
    gender: '여',
    chartNumber: '2024-1156',
    phone: '010-2222-3333',
    address: '서울시 영등포구 여의도동',
    allergies: ['계란'],
    lastVisit: '신규',
    visitReason: '발열, 기침',
  },
];

// 과거 진료기록
const PAST_RECORDS: Record<string, PastRecord[]> = {
  '1': [
    {
      id: 'r1',
      date: '2024-01-15',
      department: '신경과',
      doctor: '김원장',
      chiefComplaint: '두통',
      diagnosis: 'Tension headache',
      prescription: '타이레놀 500mg 1T tid',
    },
    {
      id: 'r2',
      date: '2023-11-20',
      department: '내과',
      doctor: '김원장',
      chiefComplaint: '감기 증상',
      diagnosis: 'Acute URI',
      prescription: '판콜에이 1T tid, 지르텍 1T qd',
    },
  ],
  '2': [
    {
      id: 'r3',
      date: '2024-01-10',
      department: '정형외과',
      doctor: '김원장',
      chiefComplaint: '허리통증',
      diagnosis: 'Lumbar sprain',
      prescription: '세레브렉스 200mg 1T bid',
    },
  ],
  '3': [],
  '4': [
    {
      id: 'r4',
      date: '2024-01-05',
      department: '내과',
      doctor: '김원장',
      chiefComplaint: '당뇨 정기검진',
      diagnosis: 'DM type 2, controlled',
      prescription: '메트포르민 500mg 1T bid',
    },
    {
      id: 'r5',
      date: '2023-10-05',
      department: '내과',
      doctor: '김원장',
      chiefComplaint: '당뇨 정기검진',
      diagnosis: 'DM type 2',
      prescription: '메트포르민 500mg 1T bid',
    },
  ],
  '5': [],
};

// 진료과별 필드 및 차트 데이터 (확정/추측 구분 포함)
interface ChartFieldData {
  value: string;
  isConfirmed: boolean; // true: 대화에서 언급됨, false: AI 추측
}

const DEPARTMENT_CHARTS: Record<string, { 
  fields: { id: string; label: string }[]; 
  data: Record<string, ChartFieldData> 
}> = {
  general: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'pi', label: 'P.I.' },
      { id: 'ros', label: 'R.O.S.' },
      { id: 'pmh', label: 'P.M.Hx.' },
      { id: 'medications', label: 'Medications' },
      { id: 'assessment', label: 'Assessment' },
      { id: 'plan', label: 'Plan' },
    ],
    data: {
      cc: { value: '두통 3일', isConfirmed: true },
      pi: { value: '3d onset, global squeezing type, p.m. aggravation, mild N/V(+), Dz(-)', isConfirmed: true },
      ros: { value: 'Gen: sleep deprivation, fatigue\nNeuro: HA(+), Dz(-), visual Sx(-)', isConfirmed: true },
      pmh: { value: 'No significant Hx', isConfirmed: true },
      medications: { value: 'MVI qd', isConfirmed: true },
      assessment: { value: 'TTH (Tension-Type Headache), likely stress-induced', isConfirmed: false },
      plan: { value: '1. Tylenol 500mg 1T prn\n2. Sleep hygiene education\n3. f/u 1wk', isConfirmed: false },
    },
  },
  internal: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'pi', label: 'H.P.I.' },
      { id: 'vitals', label: 'V/S' },
      { id: 'ros', label: 'R.O.S.' },
      { id: 'pmh', label: 'P.M.Hx.' },
      { id: 'labs', label: 'Labs' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '두통 3일', isConfirmed: true },
      pi: { value: '3d onset, diffuse squeezing HA, afternoon aggravation, N(+)/V(-)', isConfirmed: true },
      vitals: { value: 'BP 128/82, HR 76, BT 36.5℃, SpO2 98% RA', isConfirmed: false },
      ros: { value: 'Gen: fatigue, ↓sleep\nNeuro: HA(+), Dz(-), LOC(-), visual Δ(-)', isConfirmed: true },
      pmh: { value: 'NKA except PCN', isConfirmed: true },
      labs: { value: 'CBC/LFT/RFT: pending', isConfirmed: false },
      assessment: { value: 'TTH, r/o 2° causes', isConfirmed: false },
      plan: { value: '1. AAP 500mg prn\n2. ✓ CBC/BMP/TSH\n3. RTC 1wk', isConfirmed: false },
    },
  },
  orthopedic: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'moi', label: 'M.O.I.' },
      { id: 'pain', label: 'Pain' },
      { id: 'pe', label: 'P.E.' },
      { id: 'imaging', label: 'Imaging' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '왼쪽 무릎 통증 1주일', isConfirmed: true },
      moi: { value: 'Twisting injury during hiking', isConfirmed: true },
      pain: { value: 'NRS 6/10, ↑ amb, ↓ rest', isConfirmed: true },
      pe: { value: 'ROM 0-100°, (+) McMurray, (-) Lachman, mild effusion, NVI', isConfirmed: true },
      imaging: { value: 'XR: no fx/disloc\nMRI: MM tear (Grade II)', isConfirmed: true },
      assessment: { value: 'Lt. MM tear', isConfirmed: false },
      plan: { value: '1. → Arthroscopic meniscectomy\n2. Celebrex 200mg bid x2wk\n3. PT post-op', isConfirmed: false },
    },
  },
  dermatology: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'lesion', label: 'Lesion' },
      { id: 'duration', label: 'Duration' },
      { id: 'symptoms', label: 'Sx' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '팔 발진 2주', isConfirmed: true },
      lesion: { value: 'Erythematous scaly plaques, well-demarcated, 3x4cm @ Rt. forearm', isConfirmed: true },
      duration: { value: '2wk onset, progressive spreading', isConfirmed: true },
      symptoms: { value: 'Pruritus(+), pain(-), burning(-)', isConfirmed: true },
      assessment: { value: 'DDx: Psoriasis vs Nummular eczema', isConfirmed: false },
      plan: { value: '1. Clobetasol 0.05% bid x2wk\n2. Emollient prn\n3. f/u 2wk ± biopsy', isConfirmed: false },
    },
  },
  psychiatry: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'hpi', label: 'H.P.I.' },
      { id: 'mse', label: 'M.S.E.' },
      { id: 'risk', label: 'Safety' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '우울감, 불면 1개월', isConfirmed: true },
      hpi: { value: '1mo h/o ↓mood, insomnia (DIS/DMS), anhedonia, poor conc.', isConfirmed: true },
      mse: { value: 'A: kempt, cooperative\nM: "우울해요"\nAf: constricted, congruent\nT: no delusion\nP: no AH/VH\nC: A&Ox4', isConfirmed: true },
      risk: { value: 'SI(-), HI(-), no plan/intent, no access', isConfirmed: true },
      assessment: { value: 'MDD, single episode, mod severity', isConfirmed: false },
      plan: { value: '1. Lexapro 10mg qhs\n2. → CBT\n3. RTC 2wk, safety plan given', isConfirmed: false },
    },
  },
  pediatrics: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'hpi', label: 'H.P.I.' },
      { id: 'dev', label: 'Dev.' },
      { id: 'vaccine', label: 'Imm.' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '발열, 기침 2일', isConfirmed: true },
      hpi: { value: '2d h/o fever (Tmax 38.5℃), cough, rhinorrhea, V(-), PO good', isConfirmed: true },
      dev: { value: 'Age-appropriate milestones', isConfirmed: false },
      vaccine: { value: 'UTD per NIP', isConfirmed: true },
      assessment: { value: 'Acute viral URI', isConfirmed: false },
      plan: { value: '1. Supportive care\n2. AAP 10mg/kg prn fever\n3. RTC if fever >3d/worsening', isConfirmed: false },
    },
  },
  dental: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'history', label: 'DHx' },
      { id: 'exam', label: 'Exam' },
      { id: 'xray', label: 'XR' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '왼쪽 아래 어금니 시림', isConfirmed: true },
      history: { value: 'Last visit 6mo ago, no recent Tx', isConfirmed: true },
      exam: { value: '#36 MOD caries, cold(+), perc(-), palp(-)', isConfirmed: true },
      xray: { value: 'PA: caries → pulp, no periapical RL', isConfirmed: true },
      assessment: { value: '#36 Deep caries c̄ reversible pulpitis', isConfirmed: false },
      plan: { value: '1. CR restoration\n2. Desensitizing agent\n3. f/u 1wk', isConfirmed: false },
    },
  },
  surgery: {
    fields: [
      { id: 'cc', label: 'C.C.' },
      { id: 'hpi', label: 'H.P.I.' },
      { id: 'pe', label: 'P.E.' },
      { id: 'labs', label: 'W/U' },
      { id: 'assessment', label: 'A' },
      { id: 'plan', label: 'P' },
    ],
    data: {
      cc: { value: '오른쪽 아랫배 통증 1일', isConfirmed: true },
      hpi: { value: '1d h/o RLQ pain, N/V(+), anorexia(+), fever(+)', isConfirmed: true },
      pe: { value: 'RLQ TTP, (+) rebound, (+) McBurney, (+) Rovsing', isConfirmed: true },
      labs: { value: 'WBC 14K, CRP 8.5\nCT: appendix 12mm, fat stranding', isConfirmed: true },
      assessment: { value: 'Acute appendicitis', isConfirmed: false },
      plan: { value: '1. NPO/IVF\n2. Abx (Ceftri/Flagyl)\n3. → Lap appy', isConfirmed: false },
    },
  },
};

// 데모용 대화 스크립트 (김서연 환자)
const DEMO_CONVERSATION: DemoConversation[] = [
  { speaker: 'doctor', text: '안녕하세요 김서연님, 오늘은 어떻게 오셨어요?', delay: 0 },
  { speaker: 'patient', text: '안녕하세요 원장님. 3일 전부터 두통이 있어서요.', delay: 1500 },
  { speaker: 'doctor', text: '어떤 종류의 두통인가요? 욱신거리는 느낌인가요, 아니면 조이는 느낌인가요?', delay: 3000 },
  { speaker: 'patient', text: '머리 전체가 조이는 것 같은 느낌이에요. 특히 오후에 심해져요.', delay: 5000 },
  { speaker: 'doctor', text: '어지러움이나 메스꺼움은 없으셨어요?', delay: 7000 },
  { speaker: 'patient', text: '어지러움은 없는데, 가끔 약간 메스꺼운 느낌이 있어요.', delay: 8500 },
  { speaker: 'doctor', text: '최근에 스트레스를 많이 받으셨거나, 수면이 부족하셨나요?', delay: 10000 },
  { speaker: 'patient', text: '네, 요즘 프로젝트 마감이 있어서 야근을 많이 했어요.', delay: 12000 },
  { speaker: 'doctor', text: '알겠습니다. 현재 복용 중인 약이 있으신가요?', delay: 14000 },
  { speaker: 'patient', text: '종합비타민만 먹고 있어요.', delay: 15500 },
  { speaker: 'doctor', text: '페니실린 알레르기가 있으시죠? 다른 알레르기는 없으시고요?', delay: 17000 },
  { speaker: 'patient', text: '네, 페니실린만요.', delay: 18500 },
];

// ============ 컴포넌트 ============

interface DemoPageProps {
  onBack: () => void;
}

// 데모 애니메이션 단계
type DemoPhase = 
  | 'idle'           // 대기
  | 'recording'      // 녹음 중 (대화 타이핑)
  | 'generating'     // 차트 생성 중
  | 'confirming'     // 확정 애니메이션
  | 'switching'      // 진료과 전환 중
  | 'regenerating';  // 새 진료과로 차트 재생성

// 진료과 순환 목록
const DEMO_DEPARTMENTS = ['general', 'internal', 'orthopedic', 'dental'];

export function DemoPage({ onBack }: DemoPageProps) {
  const [selectedPatient] = useState<Patient>(PATIENTS[0]);
  const [currentDeptIndex, setCurrentDeptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<DemoConversation[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [chartProgress, setChartProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [chartData, setChartData] = useState<Record<string, ChartFieldData>>({});
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const [showDeptChange, setShowDeptChange] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const intervalRefs = useRef<NodeJS.Timeout[]>([]);

  // 현재 진료과 정보
  const currentDeptId = DEMO_DEPARTMENTS[currentDeptIndex];
  const selectedDepartment = DEPARTMENT_PRESETS.find(d => d.id === currentDeptId);
  const selectedDepartmentName = selectedDepartment?.name || '일반';

  // 다음 진료과 정보
  const nextDeptIndex = (currentDeptIndex + 1) % DEMO_DEPARTMENTS.length;
  const nextDeptId = DEMO_DEPARTMENTS[nextDeptIndex];
  const nextDepartment = DEPARTMENT_PRESETS.find(d => d.id === nextDeptId);
  const nextDepartmentName = nextDepartment?.name || '일반';

  // 타임아웃 등록 헬퍼
  const addTimeout = (callback: () => void, delay: number) => {
    const timeout = setTimeout(callback, delay);
    timeoutRefs.current.push(timeout);
    return timeout;
  };

  // 인터벌 등록 헬퍼
  const addInterval = (callback: () => void, delay: number) => {
    const interval = setInterval(callback, delay);
    intervalRefs.current.push(interval);
    return interval;
  };

  // 모든 타이머 정리
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
    setShowDeptChange(false);
    setDemoPhase('idle');
  };

  // 차트 생성 애니메이션
  const startChartGeneration = (deptId: string, onComplete: () => void) => {
    const chartConfig = DEPARTMENT_CHARTS[deptId] || DEPARTMENT_CHARTS.general;
    setChartData({ ...chartConfig.data });
    setShowChart(true);
    
    let progress = 0;
    const interval = addInterval(() => {
      progress += 12;
      setChartProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        onComplete();
      }
    }, 150);
  };

  // 확정 애니메이션
  const startConfirmAnimation = (deptId: string, onComplete: () => void) => {
    const chartConfig = DEPARTMENT_CHARTS[deptId] || DEPARTMENT_CHARTS.general;
    const unconfirmedFields = chartConfig.fields.filter(f => !chartConfig.data[f.id]?.isConfirmed);
    
    // 첫 번째 추측 필드 확정
    if (unconfirmedFields.length > 0) {
      addTimeout(() => {
        setChartData(prev => ({
          ...prev,
          [unconfirmedFields[0].id]: {
            ...prev[unconfirmedFields[0].id],
            isConfirmed: true
          }
        }));
        
        // 두 번째 추측 필드 확정
        if (unconfirmedFields.length > 1) {
          addTimeout(() => {
            setChartData(prev => ({
              ...prev,
              [unconfirmedFields[1].id]: {
                ...prev[unconfirmedFields[1].id],
                isConfirmed: true
              }
            }));
            addTimeout(onComplete, 1500);
          }, 1000);
        } else {
          addTimeout(onComplete, 1500);
        }
      }, 800);
    } else {
      addTimeout(onComplete, 1000);
    }
  };

  // 자동 데모 시작
  useEffect(() => {
    // 초기 대기 후 시작
    const startDemo = () => {
      resetDemo();
      
      // 1. 녹음 시작 (1.5초 후)
      addTimeout(() => {
        setDemoPhase('recording');
        setIsRecording(true);
        
        // 대화 순차 등장
        DEMO_CONVERSATION.forEach((conv) => {
          addTimeout(() => {
            setCurrentConversation(prev => [...prev, conv]);
            // 스크롤 하단으로
            setTimeout(() => {
              if (scrollEndRef.current) {
                scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }, 50);
          }, conv.delay);
        });
        
        // 2. 마지막 대화 후 녹음 종료 (마지막 대화 delay + 2초)
        const lastDelay = DEMO_CONVERSATION[DEMO_CONVERSATION.length - 1].delay;
        addTimeout(() => {
          setIsRecording(false);
          setDemoPhase('generating');
          
          // 3. 차트 생성
          startChartGeneration(currentDeptId, () => {
            setDemoPhase('confirming');
            
            // 4. 확정 애니메이션
            startConfirmAnimation(currentDeptId, () => {
              // 5. 복사 애니메이션
              setCopied(true);
              addTimeout(() => {
                setCopied(false);
                
                // 6. 진료과 전환 표시
                setDemoPhase('switching');
                setShowDeptChange(true);
                
                addTimeout(() => {
                  // 7. 진료과 변경
                  setCurrentDeptIndex(nextDeptIndex);
                  setShowDeptChange(false);
                  setDemoPhase('regenerating');
                  setChartProgress(0);
                  
                  // 8. 새 차트 생성
                  addTimeout(() => {
                    startChartGeneration(nextDeptId, () => {
                      // 9. 대기 후 전체 리셋 & 반복
                      addTimeout(() => {
                        startDemo();
                      }, 3000);
                    });
                  }, 500);
                }, 2000);
              }, 1500);
            });
          });
        }, lastDelay + 2000);
      }, 1500);
    };

    startDemo();

    return () => {
      clearAllTimers();
    };
  }, []); // 최초 1회만 실행, 이후 내부에서 반복

  const pastRecords = PAST_RECORDS[selectedPatient.id] || [];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* 좌측 사이드바 - 환자 목록 */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col">
        {/* 헤더 */}
        <div className="p-4 border-b border-slate-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 mb-4 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <Stethoscope className="w-5 h-5 text-teal-600" />
            <span className="font-bold text-slate-800">Cheat Chat AI</span>
          </button>
          
          {/* 검색 (비활성화) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="환자 검색..."
              value=""
              readOnly
              className="pl-9 bg-slate-50 border-slate-200 cursor-default"
            />
          </div>
        </div>

        {/* 오늘의 환자 */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Calendar className="w-4 h-4" />
            오늘의 환자
            <Badge variant="secondary" className="ml-auto">{PATIENTS.length}</Badge>
          </div>
        </div>

        {/* 환자 리스트 (비활성화) */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {PATIENTS.map((patient) => (
              <div
                key={patient.id}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-all cursor-default ${
                  selectedPatient.id === patient.id
                    ? 'bg-teal-50 border border-teal-200'
                    : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                    patient.gender === '여' ? 'bg-pink-400' : 'bg-blue-400'
                  }`}>
                    {patient.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{patient.name}</span>
                      <span className="text-xs text-slate-500">{patient.age}세/{patient.gender}</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{patient.visitReason}</div>
                  </div>
                  {selectedPatient.id === patient.id && (
                    <ChevronRight className="w-4 h-4 text-teal-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* 메인 영역 */}
      <main className="flex-1 flex flex-col">
        {/* 환자 정보 헤더 */}
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* 환자 아바타 & 기본정보 */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-medium ${
                  selectedPatient.gender === '여' ? 'bg-pink-400' : 'bg-blue-400'
                }`}>
                  {selectedPatient.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-800">{selectedPatient.name}</h1>
                    <Badge variant="outline">{selectedPatient.chartNumber}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                    <span>{selectedPatient.age}세 / {selectedPatient.gender}</span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedPatient.phone}
                    </span>
                  </div>
                </div>
              </div>

              {/* 알레르기 경고 */}
              {selectedPatient.allergies.length > 0 && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">알레르기:</span>
                  {selectedPatient.allergies.map((allergy, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {allergy}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* 진료과 표시 (자동 변경) */}
            <div className="relative">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                showDeptChange 
                  ? 'bg-teal-50 border-teal-300 ring-2 ring-teal-200' 
                  : 'bg-slate-100 border-slate-200'
              }`}>
                <span className={`text-sm font-medium transition-colors ${
                  showDeptChange ? 'text-teal-700' : 'text-slate-600'
                }`}>
                  {selectedDepartmentName}
                </span>
                {showDeptChange && (
                  <span className="text-xs text-teal-500 animate-pulse">
                    → {nextDepartmentName}
                  </span>
                )}
              </div>
              {showDeptChange && (
                <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-lg border border-slate-200 p-2 animate-fade-in z-10">
                  <div className="text-xs text-slate-500 mb-1 px-2">진료과 변경 중...</div>
                  <div className="px-3 py-2 bg-teal-50 rounded-md text-sm font-medium text-teal-700">
                    {nextDepartmentName}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 콘텐츠 영역 */}
        <div className="flex-1 p-6 flex gap-6">
          {/* 좌측: 실시간 대화 + 차트 */}
          <div className="flex-1 flex flex-col gap-6">
            {/* 녹음 컨트롤 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                {/* Recording Section (자동 재생) */}
                <div className="flex items-center gap-4">
                  {/* 녹음 버튼 (자동) */}
                  <div
                    className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg cursor-default ${
                      isRecording
                        ? 'bg-red-500 shadow-red-500/30'
                        : 'bg-gradient-to-br from-teal-500 to-teal-600 shadow-teal-500/30'
                    }`}
                  >
                    {isRecording ? (
                      <Square className="w-5 h-5 text-white fill-white" />
                    ) : (
                      <Mic className="w-6 h-6 text-white" />
                    )}
                    {isRecording && (
                      <>
                        <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30 pointer-events-none" />
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-400 rounded-full animate-pulse pointer-events-none" />
                      </>
                    )}
                  </div>
                  
                  <div>
                    <div className="font-semibold text-slate-800">
                      {demoPhase === 'recording' && '녹음 중...'}
                      {demoPhase === 'generating' && '차트 생성 중...'}
                      {demoPhase === 'confirming' && '내용 확인 중...'}
                      {demoPhase === 'switching' && '진료과 변경 중...'}
                      {demoPhase === 'regenerating' && '차트 재생성 중...'}
                      {demoPhase === 'idle' && '대기 중...'}
                    </div>
                    <div className="text-sm text-slate-500">
                      {demoPhase === 'recording' && '대화가 실시간으로 기록됩니다'}
                      {demoPhase === 'generating' && 'AI가 차트를 자동 생성하고 있습니다'}
                      {demoPhase === 'confirming' && 'AI 추측 내용을 확정하고 있습니다'}
                      {demoPhase === 'switching' && `${nextDepartmentName} 양식으로 전환합니다`}
                      {demoPhase === 'regenerating' && '새 양식으로 차트를 생성합니다'}
                      {demoPhase === 'idle' && '데모가 곧 시작됩니다'}
                    </div>
                  </div>
                </div>

                {/* 사용 방법 */}
                <div className="hidden lg:flex items-center">
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

            {/* 실시간 대화 & 차트 */}
            <div className="flex-1 grid grid-cols-2 gap-6">
              {/* 실시간 대화 - TranscriptViewer 스타일 */}
              <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex-none px-5 py-4 border-b border-slate-100 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-sm">
                        <Activity className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-slate-800">실시간 대화</h3>
                        <p className="text-xs text-slate-500">의사/환자 자동 구분</p>
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
                      {currentConversation.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-16">
                          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                            <Activity className="w-7 h-7 text-slate-400" />
                          </div>
                          <p className="text-slate-700 font-medium mb-1">대화 내용이 여기에 표시됩니다</p>
                          <p className="text-sm text-slate-400">녹음을 시작하면 실시간으로 변환됩니다</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {currentConversation.map((conv, index) => {
                            const isDoctor = conv.speaker === 'doctor';
                            return (
                              <div
                                key={index}
                                className={`flex animate-fade-in ${isDoctor ? 'justify-end' : 'justify-start'}`}
                              >
                                <div
                                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                    isDoctor
                                      ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white'
                                      : 'bg-slate-100'
                                  }`}
                                >
                                  <div className={`text-xs mb-1 flex items-center gap-1.5 font-medium ${
                                    isDoctor ? 'text-teal-100' : 'text-slate-500'
                                  }`}>
                                    {isDoctor ? (
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
                                    {conv.text}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {/* 스크롤 타겟 */}
                          <div ref={scrollEndRef} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 차트 - ChartingResult 스타일 */}
              <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex-none px-5 py-4 border-b border-slate-100 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
                        <FileText className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-slate-800">AI 생성 차트</h3>
                        <p className="text-xs text-slate-500">{selectedDepartmentName} 양식</p>
                      </div>
                    </div>
                    {showChart && chartProgress >= 100 && (
                      <div
                        className={`h-8 px-3 rounded-md flex items-center gap-1.5 text-sm font-medium transition-all ${
                          copied 
                            ? 'bg-teal-600 text-white' 
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            복사됨
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            EMR에 복사
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      {!showChart ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-16">
                          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                            <FileText className="w-7 h-7 text-slate-400" />
                          </div>
                          <p className="text-slate-700 font-medium mb-1">차트가 여기에 생성됩니다</p>
                          <p className="text-sm text-slate-400">녹음 종료 후 AI가 자동 작성합니다</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* 범례 */}
                          <div className="flex items-center gap-4 mb-4 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <div className="w-2 h-2 rounded-full bg-teal-500" />
                              <span>확정</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <div className="w-2 h-2 rounded-full bg-amber-400" />
                              <span>AI 추측</span>
                            </div>
                          </div>
                          
                          {(() => {
                            const chartConfig = DEPARTMENT_CHARTS[currentDeptId] || DEPARTMENT_CHARTS.general;
                            const { fields } = chartConfig;
                            const progressPerField = 100 / fields.length;
                            
                            return fields.map((field, index) => {
                              const requiredProgress = (index + 1) * progressPerField;
                              if (chartProgress < requiredProgress) return null;
                              
                              const fieldData = chartData[field.id];
                              const isConfirmed = fieldData?.isConfirmed ?? false;
                              const value = fieldData?.value || '-';
                              
                              return (
                                <div 
                                  key={field.id} 
                                  className={`animate-fade-in p-3 rounded-xl border transition-all ${
                                    isConfirmed 
                                      ? 'bg-teal-50/50 border-teal-200' 
                                      : 'bg-amber-50/50 border-amber-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    {isConfirmed ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                                    ) : (
                                      <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                                    )}
                                    <span className={`text-xs font-bold uppercase tracking-wide ${
                                      isConfirmed ? 'text-teal-700' : 'text-amber-700'
                                    }`}>
                                      {field.label}
                                    </span>
                                    <span className={`text-[10px] ml-auto flex items-center gap-1 ${
                                      isConfirmed ? 'text-teal-500' : 'text-amber-500'
                                    }`}>
                                      {isConfirmed ? (
                                        <>
                                          <Check className="w-3 h-3" />
                                          확정됨
                                        </>
                                      ) : (
                                        'AI 추측'
                                      )}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-700 whitespace-pre-line pl-5.5">
                                    {value}
                                  </p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>

          {/* 우측: 진료기록 */}
          <aside className="w-80 flex flex-col gap-4">
            {/* 환자 상세정보 */}
            <Card className="border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <User className="w-4 h-4" />
                  환자 정보
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                    <span className="text-slate-600">{selectedPatient.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">최근 방문: {selectedPatient.lastVisit}</span>
                  </div>
                  {selectedPatient.allergies.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Pill className="w-4 h-4 text-red-400 mt-0.5" />
                      <div>
                        <span className="text-red-600 font-medium">알레르기: </span>
                        <span className="text-slate-600">{selectedPatient.allergies.join(', ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 과거 진료기록 */}
            <Card className="border-slate-200 flex-1 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-slate-700">진료 기록</span>
                <Badge variant="secondary" className="ml-auto">{pastRecords.length}</Badge>
              </div>
              <ScrollArea className="flex-1 p-3">
                {pastRecords.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    과거 진료기록이 없습니다
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastRecords.map((record) => (
                      <div
                        key={record.id}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-500">{record.date}</span>
                          <Badge variant="outline" className="text-xs">{record.department}</Badge>
                        </div>
                        <div className="text-sm font-medium text-slate-700 mb-1">
                          {record.chiefComplaint}
                        </div>
                        <div className="text-xs text-slate-500">
                          Dx: {record.diagnosis}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Rx: {record.prescription}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          </aside>
        </div>
      </main>

      {/* 애니메이션 스타일 */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
