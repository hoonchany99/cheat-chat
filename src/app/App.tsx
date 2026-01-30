import { useState, useCallback, useEffect, useRef } from 'react';
import { VoiceRecorder } from './components/VoiceRecorder';
import { TranscriptViewer } from './components/TranscriptViewer';
import { ChartingResult, ChartData } from './components/ChartingResult';
import { LandingPage } from './components/LandingPage';
import { DemoPage } from './components/DemoPage';
import { ChartSettingsModal } from './components/ChartSettingsModal';
import { MobileMicPage } from './components/MobileMicPage';
import { RemoteMicModal } from './components/RemoteMicModal';
import { ChartSettings, DEFAULT_CHART_SETTINGS, DEPARTMENT_PRESETS, generateChartFromTranscriptStreaming, correctSTTErrors, DdxItem } from '@/services/chartService';
import { classifyUtterancesWithGPT } from '@/services/deepgramService';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Toaster } from '@/app/components/ui/sonner';
import { toast } from 'sonner';
import { RotateCcw, Stethoscope, FileText, Mail, Loader2, MessageSquare, Send, ChevronRight, MessageCircle, Smartphone, PanelLeft, Target, Check, AlertCircle, Plus, Play, Square } from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/app/components/ui/select';

// Google Sheets API URL
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbw5uH766QFw6m0kLchHySCPH7UUXX1F0TCxZe4ygqRiGEvhcSKKSr_nQ0gs_88GCDA/exec';
const MAX_CONTEXT_SEGMENTS = 8;
const ENABLE_STT_CORRECTION = true;

// DDx 애니메이션 스타일
const ddxAnimationStyles = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes ddxPulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(251, 191, 36, 0);
    }
  }
  
  .ddx-new {
    animation: slideInRight 0.5s ease-out, ddxPulse 1s ease-in-out 0.5s 2;
  }
`;

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

const buildSegmentsKey = (segments: Segment[]) =>
  segments.map(segment => `${segment.speaker}:${segment.text}`).join('|');

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
  const [mobileTab, setMobileTab] = useState<'transcript' | 'chart' | 'ddx'>('transcript');
  const [remoteMicOpen, setRemoteMicOpen] = useState(false);
  const [isRemoteConnected, setIsRemoteConnected] = useState(false);
  const [remoteRecordingTime, setRemoteRecordingTime] = useState(0);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [lastAutoUpdateSegmentCount, setLastAutoUpdateSegmentCount] = useState(0);
  const lastRequestedSegmentCountRef = useRef(0);
  const lastFastCorrectionKeyRef = useRef('');
  const lastFastCorrectedSegmentsRef = useRef<Segment[] | null>(null);
  const [pendingApiCount, setPendingApiCount] = useState(0);
  const pendingApiRef = useRef(0);
  const testAbortRef = useRef<AbortController | null>(null);
  const [silenceTimeout, setSilenceTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isTranscriptCollapsed, setIsTranscriptCollapsed] = useState(false);
  const [newDdxIds, setNewDdxIds] = useState<Set<string>>(new Set()); // 새로 추가된 DDx 추적
  const previousDdxIdsRef = useRef<Set<string>>(new Set());
  const bumpPendingApi = useCallback((delta: number) => {
    pendingApiRef.current = Math.max(0, pendingApiRef.current + delta);
    setPendingApiCount(pendingApiRef.current);
  }, []);
  
  // 수동 Dx/r/o 추가 상태
  const [newDiagnosisInput, setNewDiagnosisInput] = useState('');
  const [newDiagnosisType, setNewDiagnosisType] = useState<'dx' | 'ro'>('ro');
  const [showDiagnosisForm, setShowDiagnosisForm] = useState(false);
  
  // 사용자 정보 상태
  const [userAge, setUserAge] = useState('');
  const [userJob, setUserJob] = useState('');
  const [userSpecialty, setUserSpecialty] = useState('');
  const [feedbackAge, setFeedbackAge] = useState('');
  const [feedbackJob, setFeedbackJob] = useState('');
  const [feedbackSpecialty, setFeedbackSpecialty] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');

  const isTestRunningRef = useRef(false);

  const selectedDepartment = DEPARTMENT_PRESETS.find(d => d.id === chartSettings.selectedDepartment);
  const selectedDepartmentName = selectedDepartment?.name || '내과';

  // 🧪 테스트용: 실시간 시뮬레이션 (실제 녹음처럼 대화가 하나씩 추가됨)
  const [isTestRunning, setIsTestRunning] = useState(false);
  const testIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const testSegmentsRef = useRef<Segment[]>([]);
  const isGeneratingRef = useRef(false); // API 요청 중인지 추적
  const pendingUpdateRef = useRef(false); // 대기 중인 업데이트가 있는지
  const generationIdRef = useRef(0); // 최신 요청 ID 추적 (오래된 요청 결과 무시용)

  // DDx 리스트 안정적 병합 (스트리밍 중 깜빡임 방지)
  const mergeDdxLists = useCallback((
    existingDdxList: DdxItem[] | undefined,
    newDdxList: DdxItem[] | undefined
  ): DdxItem[] => {
    if (!existingDdxList || existingDdxList.length === 0) {
      return newDdxList || [];
    }
    if (!newDdxList || newDdxList.length === 0) {
      // 새 리스트가 비어있으면 기존 것 유지 (스트리밍 중 부분 파싱)
      return existingDdxList;
    }
    
    const merged = [...existingDdxList];
    
    newDdxList.forEach(newItem => {
      // 같은 진단명이 이미 있는지 확인
      const existingIndex = merged.findIndex(
        existing => existing.id === newItem.id || 
        existing.diagnosis.toLowerCase() === newItem.diagnosis.toLowerCase()
      );
      
      if (existingIndex >= 0) {
        // 기존 항목 업데이트 (사용자가 수정한 상태는 유지)
        const existing = merged[existingIndex];
        merged[existingIndex] = {
          ...newItem,
          // 사용자 액션(확정/제외)은 유지
          isConfirmed: existing.isConfirmed,
          isRemoved: existing.isRemoved,
        };
      } else {
        // 새 항목 추가
        merged.push(newItem);
      }
    });
    
    return merged;
  }, []);

  const hasAnyPattern = (text: string, patterns: RegExp[]) => patterns.some(p => p.test(text));

  const shouldAllowSocialHistory = (text: string) => hasAnyPattern(text, [
    /\bsmok(ing|er)?\b/i,
    /\btobacco\b/i,
    /\bcigarette(s)?\b/i,
    /\bnicotine\b/i,
    /\balcohol\b/i,
    /\bdrink(s|ing)?\b/i,
    /\bbeer\b/i,
    /\bsoju\b/i,
    /담배/,
    /흡연/,
    /음주/,
    /소주/,
    /맥주/,
    /술(을|은|이|도|만|좀|가끔|자주|전혀|안|못|해서|마신|마셨|마셔|마시)/,
    /술\s*(한|마신|마셨|마시|가끔)/,
  ]);

  const shouldAllowFamilyHistory = (text: string) => hasAnyPattern(text, [
    /\bfamily history\b/i,
    /\bfamily\b/i,
    /\bfather\b/i,
    /\bmother\b/i,
    /\bparent\b/i,
    /가족력/,
    /가족\s*중/,
    /아버지|어머니|부모/,
  ]);

  // 차트 데이터 안정적 병합 (DDx 깜빡임 + 내용 후퇴 방지)
  const mergeChartData = useCallback((
    prevData: ChartData | null,
    partialChart: ChartData
  ): ChartData => {
    if (!prevData) return partialChart;

    const mergedData = { ...prevData, ...partialChart };

    // 사용자가 직접 수정한 필드는 항상 유지
    Object.keys(prevData).forEach(fieldId => {
      if (prevData[fieldId]?.source === 'user') {
        mergedData[fieldId] = prevData[fieldId];
      }
    });

    const allowShrinkFields = new Set(['socialHistory', 'familyHistory']);
    // 부분 업데이트가 이전 내용보다 짧아지는 경우(스트리밍 중 흔들림) 방지
    Object.keys(prevData).forEach(fieldId => {
      const prevField = prevData[fieldId];
      const nextField = mergedData[fieldId];
      if (!prevField || !nextField) return;
      if (prevField.source === 'user') return;
      if (allowShrinkFields.has(fieldId)) return;

      const prevValue = prevField.value;
      const nextValue = nextField.value;

      if (typeof prevValue === 'string' && typeof nextValue === 'string') {
        const prevLen = prevValue.trim().length;
        const nextLen = nextValue.trim().length;
        if (prevLen > 0 && (nextLen === 0 || nextLen < prevLen)) {
          mergedData[fieldId] = prevField;
        }
      } else if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
        if (prevValue.length > 0 && nextValue.length < prevValue.length) {
          mergedData[fieldId] = prevField;
        }
      }
    });

    // Assessment의 DDx 리스트 안정적 병합
    if (prevData.assessment?.ddxList || partialChart.assessment?.ddxList) {
      mergedData.assessment = {
        ...mergedData.assessment,
        ddxList: mergeDdxLists(
          prevData.assessment?.ddxList,
          partialChart.assessment?.ddxList
        ),
      };
    }

    // SHx/FHx는 대화에 언급된 경우에만 유지 (사용자 편집은 유지)
    const conversationText = `${finalTranscript} ${realtimeSegments.map(s => s.text).join(' ')}`.trim();
    const allowShx = conversationText ? shouldAllowSocialHistory(conversationText) : false;
    const allowFhx = conversationText ? shouldAllowFamilyHistory(conversationText) : false;

    if (!allowShx && mergedData.socialHistory?.source !== 'user') {
      mergedData.socialHistory = {
        value: '',
        isConfirmed: false,
        source: 'stated',
        confidence: 'low',
        rationale: '',
        evidence: [],
      };
    }

    if (!allowFhx && mergedData.familyHistory?.source !== 'user') {
      mergedData.familyHistory = {
        value: '',
        isConfirmed: false,
        source: 'stated',
        confidence: 'low',
        rationale: '',
        evidence: [],
      };
    }
    
    return mergedData;
  }, [mergeDdxLists, finalTranscript, realtimeSegments]);

  const handleTestSimulation = useCallback(async () => {
    if (isTestRunning) {
      // 데모 중지 → 리셋과 동일하게 초기화
      if (testIntervalRef.current) {
        clearTimeout(testIntervalRef.current);
        testIntervalRef.current = null;
      }
      if (testAbortRef.current) {
        testAbortRef.current.abort();
        testAbortRef.current = null;
      }
      generationIdRef.current += 1;
      setIsTestRunning(false);
      isTestRunningRef.current = false;
      setIsRecording(false);
      isGeneratingRef.current = false;
      pendingUpdateRef.current = false;
      handleReset();
      toast.info('데모 중지됨');
      return;
    }

    // 테스트 시나리오 풀 (10개) - 랜덤 재생
    const commonInfo: Segment[] = [
      { text: '과거에 큰 수술 받은 적 있나요?', speaker: 'doctor' },
      { text: '없어요.', speaker: 'patient' },
      { text: '현재 복용 중인 약은요?', speaker: 'doctor' },
      { text: '정기적으로 먹는 약은 없어요.', speaker: 'patient' },
      { text: '통증은 0부터 10까지면 어느 정도인가요?', speaker: 'doctor' },
      { text: '지금은 7 정도예요.', speaker: 'patient' },
      { text: '알레르기는요?', speaker: 'doctor' },
      { text: '없어요.', speaker: 'patient' },
      { text: '담배나 술은 하세요?', speaker: 'doctor' },
      { text: '담배는 안 피우고 술은 가끔 한 잔 정도예요.', speaker: 'patient' },
      { text: '가족력은요?', speaker: 'doctor' },
      { text: '특이사항 없다고 들었어요.', speaker: 'patient' },
      { text: '최근 해외여행이나 감염 접촉은 없었죠?', speaker: 'doctor' },
      { text: '없었어요.', speaker: 'patient' },
    ];

    const testScenarios: Segment[][] = [
      [
        { text: '안녕하세요, 어디가 불편해서 오셨어요?', speaker: 'doctor' },
        { text: '오른쪽 아랫배가 너무 아파요. 어제 저녁부터 점점 심해졌어요.', speaker: 'patient' },
        { text: '처음엔 어디부터 아프기 시작했나요?', speaker: 'doctor' },
        { text: '처음엔 배꼽 주변이 아팠는데, 밤부터 오른쪽 아래로 내려갔어요.', speaker: 'patient' },
        { text: '통증은 계속 있나요, 아니면 왔다 갔다 하나요?', speaker: 'doctor' },
        { text: '계속 아프고 움직이면 더 아파요.', speaker: 'patient' },
        { text: '열이나 오한은 있었어요?', speaker: 'doctor' },
        { text: '새벽에 열이 38도쯤 났고 오한도 조금 있었어요.', speaker: 'patient' },
        { text: '메스꺼움이나 구토는요?', speaker: 'doctor' },
        { text: '메스꺼움은 있는데 토하진 않았어요.', speaker: 'patient' },
        { text: '설사나 변비는요?', speaker: 'doctor' },
        { text: '설사는 없고, 변은 어제 한 번 봤어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '진찰해볼게요. 오른쪽 아래를 눌렀을 때 많이 아프네요. 반발통도 있습니다.', speaker: 'doctor' },
        { text: '혈액검사랑 복부 CT 찍고, 수술 팀에도 컨설트 하겠습니다.', speaker: 'doctor' },
        { text: '지금은 급성 충수염이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '안녕하세요, 어디가 불편하세요?', speaker: 'doctor' },
        { text: '가슴이 답답하고 숨이 차요. 오늘 아침부터요.', speaker: 'patient' },
        { text: '통증이 쥐어짜는 느낌인가요? 어디로 퍼지나요?', speaker: 'doctor' },
        { text: '가슴 한가운데가 조이는 느낌이고 왼쪽 팔로 조금 뻐근해요.', speaker: 'patient' },
        { text: '땀이나 메스꺼움은요?', speaker: 'doctor' },
        { text: '식은땀이 나고 속이 좀 메스꺼워요.', speaker: 'patient' },
        ...commonInfo,
        { text: '심전도랑 심근효소 검사하고 흉부 X-ray 찍겠습니다.', speaker: 'doctor' },
        { text: '지금은 급성 관상동맥 증후군이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '어디가 불편하셔서 오셨어요?', speaker: 'doctor' },
        { text: '목이 너무 아프고 열이 나요. 이틀 전부터요.', speaker: 'patient' },
        { text: '기침이나 콧물은요?', speaker: 'doctor' },
        { text: '기침은 조금 있고 콧물은 없어요.', speaker: 'patient' },
        { text: '음식 삼킬 때도 아픈가요?', speaker: 'doctor' },
        { text: '삼킬 때 더 아파요.', speaker: 'patient' },
        ...commonInfo,
        { text: '인후 검사해볼게요. 편도가 붓고 하얀 삼출물이 있어요.', speaker: 'doctor' },
        { text: '신속 독감 검사하고, 해열제 처방하겠습니다.', speaker: 'doctor' },
        { text: '급성 편도염이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '안녕하세요, 증상이 어떻게 되세요?', speaker: 'doctor' },
        { text: '어지럽고 눈앞이 캄캄해요. 오늘 오전에요.', speaker: 'patient' },
        { text: '쓰러진 적은 있었나요?', speaker: 'doctor' },
        { text: '네, 잠깐 눈앞이 하얘지면서 앉아있었어요.', speaker: 'patient' },
        { text: '식사는 하셨어요?', speaker: 'doctor' },
        { text: '아침은 못 먹었어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '혈당 검사와 기립성 혈압 검사 해보겠습니다.', speaker: 'doctor' },
        { text: '실신이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '어디가 아프세요?', speaker: 'doctor' },
        { text: '허리가 아프고 소변이 따가워요. 사흘 전부터요.', speaker: 'patient' },
        { text: '소변을 자주 보거나 피가 섞인 적은요?', speaker: 'doctor' },
        { text: '자주 보고, 피는 잘 모르겠어요.', speaker: 'patient' },
        { text: '열은 있었나요?', speaker: 'doctor' },
        { text: '열이 좀 났어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '요검사와 소변배양 검사하겠습니다.', speaker: 'doctor' },
        { text: '급성 신우신염이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '오늘은 어떤 증상으로 오셨어요?', speaker: 'doctor' },
        { text: '배가 쥐어짜듯이 아프고 설사를 해요. 오늘 새벽부터요.', speaker: 'patient' },
        { text: '몇 번 정도 하셨나요?', speaker: 'doctor' },
        { text: '5번 정도요. 물 같은 변이에요.', speaker: 'patient' },
        { text: '구토는요?', speaker: 'doctor' },
        { text: '한 번 했어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '탈수 확인하고 수액 처치하겠습니다.', speaker: 'doctor' },
        { text: '장염이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '어떤 증상이 있으세요?', speaker: 'doctor' },
        { text: '콧물과 기침이 심하고 열이 나요. 어제부터요.', speaker: 'patient' },
        { text: '숨쉬기 힘든가요?', speaker: 'doctor' },
        { text: '숨이 좀 차요.', speaker: 'patient' },
        ...commonInfo,
        { text: '호흡기 검사해볼게요. 청진상 우하부에서 crackles가 들립니다.', speaker: 'doctor' },
        { text: '흉부 X-ray와 혈액검사 진행하겠습니다.', speaker: 'doctor' },
        { text: '폐렴이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '어디가 불편해서 오셨어요?', speaker: 'doctor' },
        { text: '속이 쓰리고 명치가 아파요. 한 달 전부터요.', speaker: 'patient' },
        { text: '식사와 관계가 있나요?', speaker: 'doctor' },
        { text: '공복에 더 심하고 식사하면 좀 나아요.', speaker: 'patient' },
        { text: '메스꺼움이나 흑색변은요?', speaker: 'doctor' },
        { text: '메스꺼움은 있고 흑색변은 없어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '위내시경 예약하고, 위산억제제 처방하겠습니다.', speaker: 'doctor' },
        { text: '소화성 궤양이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '증상이 어떻게 되세요?', speaker: 'doctor' },
        { text: '머리가 지끈지끈 아프고 빛이 불편해요. 오늘 오전부터요.', speaker: 'patient' },
        { text: '통증이 한쪽인가요?', speaker: 'doctor' },
        { text: '네, 오른쪽 머리가 특히 아파요.', speaker: 'patient' },
        { text: '메스꺼움은요?', speaker: 'doctor' },
        { text: '있어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '진통제 처방하고, 필요하면 뇌 CT 찍겠습니다.', speaker: 'doctor' },
        { text: '편두통이 의심됩니다.', speaker: 'doctor' },
      ],
      [
        { text: '오늘 어디가 아프세요?', speaker: 'doctor' },
        { text: '다리가 붓고 숨이 찬 느낌이 있어요. 일주일 전부터요.', speaker: 'patient' },
        { text: '밤에 누우면 더 숨이 차나요?', speaker: 'doctor' },
        { text: '네, 눕기가 좀 힘들어요.', speaker: 'patient' },
        { text: '체중이 늘었나요?', speaker: 'doctor' },
        { text: '요즘 2킬로 정도 늘었어요.', speaker: 'patient' },
        ...commonInfo,
        { text: '흉부 X-ray와 BNP 검사 진행하겠습니다.', speaker: 'doctor' },
        { text: '심부전이 의심됩니다.', speaker: 'doctor' },
      ],
    ];

    // 초기화
    setChartData(null);
    setFinalTranscript('');
    setRealtimeSegments([]);
    setIsTestRunning(true);
    isTestRunningRef.current = true;
    setIsRecording(true);
    lastRequestedSegmentCountRef.current = 0;
    lastAutoUpdateTimeRef.current = 0;
    toast.info('🧪 실시간 시뮬레이션 시작');

    // AbortController 참조
    let currentAbortController: AbortController | null = null;
    const scenario = testScenarios[Math.floor(Math.random() * testScenarios.length)];

    // Streaming 차트 생성 함수
    const generateChartFromCurrentSegments = async (segments: Segment[], fastMode: boolean) => {
      // 이미 요청 중이면 이전 요청 취소하고 새로 시작
      if (isGeneratingRef.current && currentAbortController) {
        console.log('🛑 이전 요청 취소, 새 요청 시작');
        currentAbortController.abort();
      }

      if (segments.length === 0) return;
      
      // 새 요청 시작 - generation ID 증가
      generationIdRef.current += 1;
      const myGenerationId = generationIdRef.current;
      
      isGeneratingRef.current = true;
      currentAbortController = new AbortController();
      testAbortRef.current = currentAbortController;
      console.log('🚀 Streaming 차트 생성 시작 (', segments.length, '개 대화, ID:', myGenerationId, ')');
      
      try {
        const segmentsForCorrection = fastMode ? segments.slice(-MAX_CONTEXT_SEGMENTS) : segments;
        let baseSegments = segmentsForCorrection;
        if (ENABLE_STT_CORRECTION) {
          if (fastMode) {
            const correctionKey = buildSegmentsKey(segmentsForCorrection);
            if (
              lastFastCorrectionKeyRef.current === correctionKey &&
              lastFastCorrectedSegmentsRef.current
            ) {
              baseSegments = lastFastCorrectedSegmentsRef.current;
            } else {
              baseSegments = await correctSTTErrors(segmentsForCorrection);
              lastFastCorrectionKeyRef.current = correctionKey;
              lastFastCorrectedSegmentsRef.current = baseSegments;
            }
          } else {
            baseSegments = await correctSTTErrors(segmentsForCorrection);
          }
        }
        const contextSegments = baseSegments;
        const transcriptText = contextSegments.map(s => s.text).join(' ');
        
        // Streaming API 호출 - 완료 시에만 차트 업데이트 (중간 업데이트 끔)
        bumpPendingApi(1);
        const result = await generateChartFromTranscriptStreaming(
          transcriptText,
          contextSegments,
          chartSettings.selectedDepartment,
          (partial) => {
            setChartData(prevData => mergeChartData(prevData, partial));
          },
          currentAbortController.signal,
          fastMode
        );
        
        // 최신 요청인 경우에만 완료 로그 (최종 업데이트는 onPartialUpdate에서 처리)
        if (result && myGenerationId === generationIdRef.current) {
          console.log('✅ Streaming 차트 완료 (', segments.length, '개 대화, ID:', myGenerationId, ')');
        } else if (result) {
          console.log('⏭️ 오래된 요청 결과 무시 (ID:', myGenerationId, '현재:', generationIdRef.current, ')');
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('❌ 차트 생성 에러:', error);
        }
      } finally {
        bumpPendingApi(-1);
        isGeneratingRef.current = false;
        currentAbortController = null;
        testAbortRef.current = null;
      }
    };

    // 텍스트 길이에 따른 대기 시간 계산 (실제 말하는 속도 시뮬레이션)
    const getDelay = (text: string) => {
      // 한글 기준 분당 약 300자 정도 = 초당 5자
      // 최소 1.5초, 최대 5초
      const baseDelay = Math.max(1500, Math.min(5000, text.length * 100));
      // 약간의 랜덤성 추가 (±20%)
      const randomFactor = 0.8 + Math.random() * 0.4;
      return baseDelay * randomFactor;
    };

    setRealtimeSegments([]);
    setFinalTranscript('');
    setChartData(null);
    setLastAutoUpdateSegmentCount(0);
    testSegmentsRef.current = [];
    isGeneratingRef.current = false;
    pendingUpdateRef.current = false;
    setNewDdxIds(new Set());
    previousDdxIdsRef.current = new Set();
    setShowDiagnosisForm(false);
    setNewDiagnosisInput('');
    setNewDiagnosisType('ro');
    lastFastCorrectionKeyRef.current = '';
    lastFastCorrectedSegmentsRef.current = null;
    setIsRecording(true);

    let currentIndex = 0;

    const addNextSegment = async () => {
      if (!isTestRunningRef.current) return;
      if (currentIndex >= scenario.length) {
        setIsRecording(false);
        setIsGeneratingChart(true);
        if (streamingAbortRef.current) {
          streamingAbortRef.current.abort();
          streamingAbortRef.current = null;
        }
        generationIdRef.current += 1;
        setMobileTab('chart');
        await generateChartFromCurrentSegments(testSegmentsRef.current, true);
        setIsGeneratingChart(false);
        setIsTestRunning(false);
        isTestRunningRef.current = false;
        toast.success('🧪 시뮬레이션 완료!');
        return;
      }

      const newSegment = scenario[currentIndex];
      testSegmentsRef.current = [...testSegmentsRef.current, newSegment];
      setRealtimeSegments([...testSegmentsRef.current]);
      currentIndex++;

      const delay = getDelay(newSegment.text);
      testIntervalRef.current = setTimeout(addNextSegment, delay);
    };

    addNextSegment();

  }, [isTestRunning, chartSettings.selectedDepartment]);

  // 초기 진입 시 애니메이션
  useEffect(() => {
    setPageAnimation('enter');
    const timer = setTimeout(() => setPageAnimation(''), 500);
    return () => clearTimeout(timer);
  }, []);

  // DDx 변경 감지 및 애니메이션
  useEffect(() => {
    if (chartData?.assessment?.ddxList) {
      const currentDdxIds = new Set(chartData.assessment.ddxList.map(d => d.id));
      const newIds = new Set<string>();
      
      // 새로 추가된 DDx 찾기
      currentDdxIds.forEach(id => {
        if (!previousDdxIdsRef.current.has(id)) {
          newIds.add(id);
        }
      });
      
      if (newIds.size > 0) {
        setNewDdxIds(newIds);
        // 2초 후 애니메이션 클래스 제거
        setTimeout(() => setNewDdxIds(new Set()), 2000);
      }
      
      previousDdxIdsRef.current = currentDdxIds;
    }
  }, [chartData?.assessment?.ddxList]);


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
  // Streaming AbortController 참조
  const streamingAbortRef = useRef<AbortController | null>(null);
  const lastAutoUpdateTimeRef = useRef(0);

  const triggerAutoChartUpdate = useCallback(async () => {
    if (isGeneratingChart) return;
    const currentSegmentCount = realtimeSegments.length;
    
    // 최소 3개 이상 발화가 있어야 함
    if (currentSegmentCount < 3) return;
    
    // 변경사항이 없으면 건너뜀
    if (currentSegmentCount <= lastAutoUpdateSegmentCount) return;
    if (currentSegmentCount <= lastRequestedSegmentCountRef.current) return;
    if (isAutoUpdating) return;

    const now = Date.now();
    if (now - lastAutoUpdateTimeRef.current < 1800) return;

    // 이전 요청 취소
    if (streamingAbortRef.current) {
      streamingAbortRef.current.abort();
    }
    const abortController = new AbortController();
    streamingAbortRef.current = abortController;

    // 새 요청 시작 - generation ID 증가
    generationIdRef.current += 1;
    const myGenerationId = generationIdRef.current;

    console.log('🚀 Streaming 차트 업데이트 시작... (ID:', myGenerationId, ')');
    lastRequestedSegmentCountRef.current = currentSegmentCount;
    lastAutoUpdateTimeRef.current = now;
    setIsAutoUpdating(true);
    
    bumpPendingApi(1);
    try {
      const baseSegments = ENABLE_STT_CORRECTION
        ? await correctSTTErrors(realtimeSegments)
        : realtimeSegments;
      if (baseSegments.length > 0) {
        const fastSegments = baseSegments.slice(-MAX_CONTEXT_SEGMENTS);
        lastFastCorrectionKeyRef.current = buildSegmentsKey(fastSegments);
        lastFastCorrectedSegmentsRef.current = fastSegments;
      }
      const contextSegments = baseSegments;
      const transcriptText = contextSegments.map(s => s.text).join(' ');
      
      // Streaming 차트 생성 - 완료 시에만 업데이트
      const result = await generateChartFromTranscriptStreaming(
        transcriptText, 
        contextSegments, 
        chartSettings.selectedDepartment,
        (partial) => {
          setChartData(prevData => mergeChartData(prevData, partial));
        },
        abortController.signal,
        false
      );
      
      // 최신 요청인 경우에만 완료 처리 (최종 업데이트는 onPartialUpdate에서 처리)
      if (result && myGenerationId === generationIdRef.current) {
        setLastAutoUpdateSegmentCount(currentSegmentCount);
        console.log('✅ Streaming 차트 업데이트 완료 (ID:', myGenerationId, ')');
      } else if (result) {
        console.log('⏭️ 오래된 요청 결과 무시 (ID:', myGenerationId, ')');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.warn('⚠️ 자동 업데이트 실패:', error);
      }
    } finally {
      bumpPendingApi(-1);
      setIsAutoUpdating(false);
      if (streamingAbortRef.current === abortController) {
        streamingAbortRef.current = null;
      }
    }
  }, [realtimeSegments, lastAutoUpdateSegmentCount, chartSettings.selectedDepartment, isAutoUpdating, isGeneratingChart, mergeChartData, bumpPendingApi]);

  // 발화 멈춤 감지 (5초 동안 새 발화가 없으면 차트 업데이트)
  useEffect(() => {
    if (!isRecording && !isRemoteRecording) {
      // 녹음 중지 시 타이머 정리
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        setSilenceTimeout(null);
      }
      setLastAutoUpdateSegmentCount(0);
      lastRequestedSegmentCountRef.current = 0;
      lastAutoUpdateTimeRef.current = 0;
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

  // 빠른 DDx/차트 업데이트 (새 발화 직후 1.2초 디바운스)
  const rapidUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isRecording && !isRemoteRecording) {
      if (rapidUpdateTimeoutRef.current) {
        clearTimeout(rapidUpdateTimeoutRef.current);
        rapidUpdateTimeoutRef.current = null;
      }
      return;
    }

    if (realtimeSegments.length >= 2) {
      if (rapidUpdateTimeoutRef.current) {
        clearTimeout(rapidUpdateTimeoutRef.current);
      }
      rapidUpdateTimeoutRef.current = setTimeout(() => {
        triggerAutoChartUpdate();
      }, 1200);
    }

    return () => {
      if (rapidUpdateTimeoutRef.current) {
        clearTimeout(rapidUpdateTimeoutRef.current);
      }
    };
  }, [realtimeSegments.length, isRecording, isRemoteRecording, triggerAutoChartUpdate]);

  // DDx 확정 (Assessment → Dx로 이동)
  const handleConfirmDdx = useCallback((ddxId: string) => {
    setChartData(prev => {
      if (!prev?.assessment?.ddxList) return prev;
      
      const ddx = prev.assessment.ddxList.find(d => d.id === ddxId);
      if (!ddx) return prev;
      
      // DDx 확정 처리
      const updatedDdxList = prev.assessment.ddxList.map(d =>
        d.id === ddxId ? { ...d, isConfirmed: true } : d
      );
      
      // 확정 진단에 추가
      const currentConfirmed = prev.diagnosisConfirmed?.value || [];
      const confirmedArray = Array.isArray(currentConfirmed) ? currentConfirmed : [currentConfirmed];
      const newConfirmed = [...confirmedArray.filter(Boolean), ddx.diagnosis];
      
      return {
        ...prev,
        assessment: { ...prev.assessment, ddxList: updatedDdxList },
        diagnosisConfirmed: { ...prev.diagnosisConfirmed, value: newConfirmed, isConfirmed: true }
      };
    });
  }, []);

  // DDx 제외
  const handleRemoveDdx = useCallback((ddxId: string) => {
    setChartData(prev => {
      if (!prev?.assessment?.ddxList) return prev;
      
      const updatedDdxList = prev.assessment.ddxList.map(d =>
        d.id === ddxId ? { ...d, isRemoved: true } : d
      );
      
      return {
        ...prev,
        assessment: { ...prev.assessment, ddxList: updatedDdxList }
      };
    });
  }, []);

  // DDx 복구
  const handleRestoreDdx = useCallback((ddxId: string) => {
    setChartData(prev => {
      if (!prev?.assessment?.ddxList) return prev;
      
      const updatedDdxList = prev.assessment.ddxList.map(d =>
        d.id === ddxId ? { ...d, isRemoved: false } : d
      );
      
      return {
        ...prev,
        assessment: { ...prev.assessment, ddxList: updatedDdxList }
      };
    });
  }, []);

  // DDx 확정 취소 (Dx → Assessment로 복귀)
  const handleUnconfirmDdx = useCallback((ddxId: string) => {
    setChartData(prev => {
      if (!prev?.assessment?.ddxList) return prev;
      
      const ddx = prev.assessment.ddxList.find(d => d.id === ddxId);
      if (!ddx) return prev;
      
      // DDx 확정 취소
      const updatedDdxList = prev.assessment.ddxList.map(d =>
        d.id === ddxId ? { ...d, isConfirmed: false } : d
      );
      
      // 확정 진단에서 제거
      const currentConfirmed = prev.diagnosisConfirmed?.value || [];
      const confirmedArray = Array.isArray(currentConfirmed) ? currentConfirmed : [currentConfirmed];
      const newConfirmed = confirmedArray.filter(d => d !== ddx.diagnosis);
      
      return {
        ...prev,
        assessment: { ...prev.assessment, ddxList: updatedDdxList },
        diagnosisConfirmed: { ...prev.diagnosisConfirmed, value: newConfirmed }
      };
    });
  }, []);

  // 수동으로 Dx/r/o 추가
  const handleAddDiagnosis = useCallback(() => {
    if (!newDiagnosisInput.trim()) return;
    
    const newId = `user_ddx_${Date.now()}`;
    const newDdx = {
      id: newId,
      diagnosis: newDiagnosisInput.trim(),
      reason: '사용자 추가',
      confidence: 'high' as const,
      isConfirmed: newDiagnosisType === 'dx', // Dx면 바로 확정
      isRemoved: false,
      source: 'doctor' as const, // 사용자 추가는 doctor로 표시
    };
    
    setChartData(prev => {
      if (!prev) {
        // chartData가 없으면 새로 생성
        return {
          assessment: {
            value: newDiagnosisType === 'dx' ? `# ${newDiagnosisInput.trim()}` : '',
            isConfirmed: true,
            source: 'user',
            ddxList: [newDdx],
          },
        };
      }
      
      const currentDdxList = prev.assessment?.ddxList || [];
      const updatedDdxList = [...currentDdxList, newDdx];
      
      // Dx인 경우 assessment value에도 추가
      let newAssessmentValue = prev.assessment?.value || '';
      if (newDiagnosisType === 'dx') {
        newAssessmentValue = newAssessmentValue 
          ? `${newAssessmentValue}\n# ${newDiagnosisInput.trim()}`
          : `# ${newDiagnosisInput.trim()}`;
      }
      
      return {
        ...prev,
        assessment: {
          ...prev.assessment,
          value: newAssessmentValue,
          ddxList: updatedDdxList,
        },
      };
    });
    
    setNewDiagnosisInput('');
  }, [newDiagnosisInput, newDiagnosisType]);

  // 주기적 차트 업데이트 (15초마다)
  useEffect(() => {
    if (!isRecording && !isRemoteRecording) {
      return;
    }

    const interval = setInterval(() => {
      // 변경사항이 있으면 업데이트 (새 발화가 있으면)
      if (realtimeSegments.length > lastAutoUpdateSegmentCount) {
        console.log('⏰ 15초 주기 - 차트 업데이트 트리거');
        triggerAutoChartUpdate();
      } else {
        console.log('⏰ 15초 주기 - 변경사항 없음, 스킵');
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
    lastRequestedSegmentCountRef.current = 0;
    lastAutoUpdateTimeRef.current = 0;
    setMobileTab('transcript'); // 녹음 시작 시 실시간 대화 탭으로 전환
  }, []);

  const handleProcessingStart = useCallback(() => {
    setIsRecording(false);
    setIsGeneratingChart(true);
    if (streamingAbortRef.current) {
      streamingAbortRef.current.abort();
      streamingAbortRef.current = null;
    }
    generationIdRef.current += 1;
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
    lastRequestedSegmentCountRef.current = 0;
    lastAutoUpdateTimeRef.current = 0;
    setNewDdxIds(new Set());
    previousDdxIdsRef.current = new Set();
    setShowDiagnosisForm(false);
    setNewDiagnosisInput('');
    setNewDiagnosisType('ro');
    lastFastCorrectionKeyRef.current = '';
    lastFastCorrectedSegmentsRef.current = null;
  }, []);

  const resetAppState = useCallback(() => {
    if (testIntervalRef.current) {
      clearTimeout(testIntervalRef.current);
      testIntervalRef.current = null;
    }
    if (testAbortRef.current) {
      testAbortRef.current.abort();
      testAbortRef.current = null;
    }
    if (streamingAbortRef.current) {
      streamingAbortRef.current.abort();
      streamingAbortRef.current = null;
    }
    generationIdRef.current += 1;
    setIsTestRunning(false);
    isTestRunningRef.current = false;
    setIsRecording(false);
    setIsRemoteRecording(false);
    setIsGeneratingChart(false);
    setRecordingProgress(0);
    setRemoteRecordingTime(0);
    setIsAutoUpdating(false);
    isGeneratingRef.current = false;
    pendingUpdateRef.current = false;
    pendingApiRef.current = 0;
    setPendingApiCount(0);
    setRemoteMicOpen(false);
    handleReset();
  }, [handleReset]);

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

  // PC에서 랜딩으로 돌아가면 상태 초기화
  useEffect(() => {
    if (currentPage === 'landing') {
      resetAppState();
    }
  }, [currentPage, resetAppState]);

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
    <div className={`h-screen bg-slate-50 flex flex-col ${pageAnimation === 'enter' ? 'page-enter' : pageAnimation === 'exit' ? 'page-exit' : ''}`}>
      <style>{pageTransitionStyles}</style>
      <style>{ddxAnimationStyles}</style>
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
      <main className="flex-1 container mx-auto px-4 py-6 overflow-hidden min-h-0">
        <div className="flex flex-col gap-6 h-full min-h-0">
          {/* Recording Control */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-5">
              {/* Recording Section */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
                <div className="flex items-center gap-3 flex-wrap">
                  <VoiceRecorder
                    onTranscriptUpdate={handleTranscriptUpdate}
                    onRealtimeSegment={handleRealtimeSegment}
                    onRealtimeSegmentsUpdate={handleRealtimeSegmentsUpdate}
                    onFullUpdate={handleFullUpdate}
                    onRecordingStart={handleRecordingStart}
                    onProcessingStart={handleProcessingStart}
                    onPartialChartUpdate={(partial) => {
                      setChartData(prevData => mergeChartData(prevData, partial));
                    }}
                    onApiStart={() => bumpPendingApi(1)}
                    onApiEnd={() => bumpPendingApi(-1)}
                    onRecordingComplete={handleRecordingComplete}
                    onRecordingProgress={handleRecordingProgress}
                    department={chartSettings.selectedDepartment}
                    isRemoteRecording={isRemoteRecording}
                    remoteRecordingTime={remoteRecordingTime}
                    isExternalGenerating={isGeneratingChart}
                  />

                  {/* 휴대폰 마이크 연결 버튼 */}
                  <Button
                    variant="outline"
                    onClick={() => setRemoteMicOpen(true)}
                    disabled={isRecording}
                    className={`rounded-full h-9 px-3 shrink-0 gap-2 text-xs transition-all ${
                      isRemoteRecording 
                        ? 'border-red-500 text-red-600 bg-red-50' 
                        : isRemoteConnected 
                          ? 'border-green-500 text-green-600 bg-green-50' 
                          : ''
                    }`}
                    title="휴대폰 마이크 연결"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span className="font-medium hidden sm:inline">
                      {isRemoteRecording ? '녹음 중' : isRemoteConnected ? '연결됨' : '휴대폰 연결'}
                    </span>
                    {isRemoteRecording ? (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    ) : isRemoteConnected ? (
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                    ) : null}
                  </Button>
                </div>

                <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleReset}
                    disabled={isRecording || isRemoteRecording || isGeneratingChart}
                    className="h-9 w-9 shrink-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    title="초기화"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>

                  {/* 🧪 테스트 버튼 (개발용) */}
                  <Button
                    onClick={handleTestSimulation}
                    disabled={isRecording && !isTestRunning || isRemoteRecording || isGeneratingChart}
                    className={`h-9 px-3 shrink-0 gap-2 text-xs rounded-full border transition-all ${
                      isTestRunning 
                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800' 
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                    title="데모"
                  >
                    {isTestRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isTestRunning ? '중지' : '데모'}</span>
                  </Button>
                </div>
              </div>

              {/* Usage Guide - Right aligned */}
              <div className="hidden md:flex items-center">
                <div className="flex items-center flex-nowrap bg-slate-50 rounded-full px-1.5 py-1.5 border border-slate-200">
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <span className="text-xs font-medium text-slate-600 whitespace-nowrap">녹음</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-5 h-5 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <span className="text-xs font-medium text-slate-600 whitespace-nowrap">변환</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <div className="flex items-center gap-2 px-3 py-1">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <span className="text-xs font-medium text-slate-600 whitespace-nowrap">차트</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: 3-Column Layout */}
          <div className="hidden lg:flex gap-4 flex-1 min-h-0">
            {/* 좌측: 대화창 (접을 수 있음) */}
            <div className={`transition-all duration-300 ${isTranscriptCollapsed ? 'w-12' : 'w-[280px]'} flex-none h-full`}>
              {isTranscriptCollapsed ? (
                <div className="h-full bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center py-4">
                  <button
                    onClick={() => setIsTranscriptCollapsed(false)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 mb-2"
                    title="대화창 펼치기"
                  >
                    <PanelLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-cyan-500 mb-2" />
                  </div>
                  {(isRecording || isRemoteRecording) && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-2" />
                  )}
                </div>
              ) : (
                <TranscriptViewer
                  finalTranscript={finalTranscript}
                  isRecording={isRecording || isRemoteRecording}
                  realtimeSegments={realtimeSegments}
                  onCollapse={() => setIsTranscriptCollapsed(true)}
                />
              )}
            </div>

            {/* 중앙: AI 차트 (S/O 필드) */}
            <div className="flex-1 min-w-0 min-h-0">
              <ChartingResult
                chartData={chartData}
                isRecording={isRecording || isRemoteRecording}
                layout="wide"
                department={chartSettings.selectedDepartment}
                activeFields={chartSettings.activeFields}
              />
            </div>

            {/* 우측: DDx 추천 패널 (고정) */}
            <div className="w-[320px] flex-none flex flex-col h-full bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border-2 border-teal-200 shadow-sm overflow-hidden">
              {/* DDx Header */}
              <div className="flex-none px-4 py-3 border-b border-teal-200 bg-white/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-teal-800">DDx 추천</h3>
                    <p className="text-[10px] text-teal-600">
                      {(isRecording || isRemoteRecording) ? '실시간 업데이트' : '감별진단'}
                    </p>
                  </div>
                </div>
              </div>

              {/* DDx Content */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col"
                style={{ gap: chartData || isRecording || isRemoteRecording ? '0.75rem' : '0' }}>
                
                {/* Dx/r/o 수동 추가 - 녹음 끝나고 차트 있을 때만 */}
                {!isRecording && !isRemoteRecording && chartData && (
                  <div className="mb-1">
                    {!showDiagnosisForm ? (
                      <button
                        onClick={() => setShowDiagnosisForm(true)}
                        className="w-full py-2 px-3 rounded-lg border border-dashed border-slate-300 text-slate-500 text-xs hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/50 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" /> 진단 추가
                      </button>
                    ) : (
                      <div className="bg-white rounded-xl p-3 border border-teal-200 shadow-sm animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                            <Plus className="w-3 h-3" /> 진단 추가
                          </div>
                          <button 
                            onClick={() => {
                              setShowDiagnosisForm(false);
                              setNewDiagnosisInput('');
                            }}
                            className="text-slate-400 hover:text-slate-600 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex gap-1.5 mb-2">
                          <button
                            onClick={() => setNewDiagnosisType('dx')}
                            className={`flex-1 text-[10px] py-1.5 rounded-md border transition-all ${
                              newDiagnosisType === 'dx' 
                                ? 'bg-teal-500 text-white border-teal-500 font-medium' 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-teal-300'
                            }`}
                          >
                            # Dx
                          </button>
                          <button
                            onClick={() => setNewDiagnosisType('ro')}
                            className={`flex-1 text-[10px] py-1.5 rounded-md border transition-all ${
                              newDiagnosisType === 'ro' 
                                ? 'bg-blue-500 text-white border-blue-500 font-medium' 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            r/o
                          </button>
                        </div>
                        <div className="flex gap-1.5">
                          <Input
                            value={newDiagnosisInput}
                            onChange={(e) => setNewDiagnosisInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddDiagnosis();
                              if (e.key === 'Escape') {
                                setShowDiagnosisForm(false);
                                setNewDiagnosisInput('');
                              }
                            }}
                            placeholder="진단명 (예: Tension headache)"
                            className="flex-1 h-7 text-xs"
                            autoFocus
                          />
                          <Button
                            onClick={() => {
                              handleAddDiagnosis();
                              setShowDiagnosisForm(false);
                            }}
                            disabled={!newDiagnosisInput.trim()}
                            size="sm"
                            className="h-7 px-2.5 bg-teal-500 hover:bg-teal-600"
                          >
                            추가
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 확정 진단 (확정된 DDx) */}
                {chartData?.assessment?.ddxList?.filter(d => d.isConfirmed).map((ddx) => (
                  <div key={ddx.id} className="bg-teal-100 rounded-xl p-3 border border-teal-300">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-teal-600 mb-0.5 flex items-center gap-1">
                          <Check className="w-3 h-3" /> 확정 진단
                        </div>
                        <div className="text-sm font-semibold text-teal-900"># {ddx.diagnosis}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnconfirmDdx(ddx.id)}
                        className="h-6 text-[10px] text-teal-600 hover:text-teal-800 hover:bg-teal-200"
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ))}

                {/* 대화 기반 r/o (미확정) */}
                {chartData?.assessment?.ddxList && chartData.assessment.ddxList.filter(d => !d.isRemoved && !d.isConfirmed && d.source === 'doctor').length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-blue-600 px-1 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> 대화 기반 r/o
                    </div>
                    {chartData.assessment.ddxList
                      .filter(d => !d.isRemoved && !d.isConfirmed && d.source === 'doctor')
                      .map((ddx) => (
                        <div 
                          key={ddx.id} 
                          className="bg-blue-50 rounded-lg p-2.5 border border-blue-200 shadow-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-blue-800">r/o {ddx.diagnosis}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                💬 대화
                              </span>
                            </div>
                          </div>
                          {ddx.reason && (
                            <p className="text-[10px] text-slate-500 mb-2">{ddx.reason}</p>
                          )}
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmDdx(ddx.id)}
                              className="h-6 text-[10px] flex-1 border-teal-300 text-teal-700 hover:bg-teal-50"
                            >
                              <Check className="w-3 h-3 mr-1" /> 확정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveDdx(ddx.id)}
                              className="h-6 text-[10px] flex-1 border-slate-300 text-slate-500 hover:bg-slate-50"
                            >
                              제외
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* AI DDx 추천 (미확정) */}
                {chartData?.assessment?.ddxList && chartData.assessment.ddxList.filter(d => !d.isRemoved && !d.isConfirmed && d.source !== 'doctor').length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-amber-600 px-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> AI DDx 추천
                    </div>
                    {chartData.assessment.ddxList
                      .filter(d => !d.isRemoved && !d.isConfirmed && d.source !== 'doctor')
                      .map((ddx, index) => (
                        <div 
                          key={ddx.id} 
                          className={`bg-white rounded-lg p-2.5 border shadow-sm transition-all duration-300 ${
                            newDdxIds.has(ddx.id) 
                              ? 'border-amber-400 animate-[slideInRight_0.3s_ease-out]' 
                              : 'border-amber-200'
                          }`}
                          style={{ animationDelay: newDdxIds.has(ddx.id) ? `${index * 100}ms` : '0ms' }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-amber-800">r/o {ddx.diagnosis}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                ddx.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {ddx.confidence === 'high' ? '높음' : '중간'}
                              </span>
                            </div>
                          </div>
                          {ddx.reason && (
                            <p className="text-[10px] text-slate-500 mb-2">{ddx.reason}</p>
                          )}
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmDdx(ddx.id)}
                              className="h-6 text-[10px] flex-1 border-teal-300 text-teal-700 hover:bg-teal-50"
                            >
                              <Check className="w-3 h-3 mr-1" /> 확정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveDdx(ddx.id)}
                              className="h-6 text-[10px] flex-1 border-slate-300 text-slate-500 hover:bg-slate-50"
                            >
                              제외
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* 제외된 DDx (복구 가능) */}
                {chartData?.assessment?.ddxList && chartData.assessment.ddxList.filter(d => d.isRemoved).length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 px-1">제외됨</div>
                    {chartData.assessment.ddxList
                      .filter(d => d.isRemoved)
                      .map((ddx) => (
                        <div key={ddx.id} className="bg-slate-100 rounded-lg p-2 border border-slate-200 flex items-center justify-between">
                          <span className="text-xs text-slate-400 line-through">{ddx.diagnosis}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestoreDdx(ddx.id)}
                            className="h-5 text-[10px] text-slate-500 hover:text-slate-700"
                          >
                            복구
                          </Button>
                        </div>
                      ))}
                  </div>
                )}

                {/* 녹음 중 - DDx 분석 중 애니메이션 */}
                {(isRecording || isRemoteRecording) && (!chartData?.assessment?.ddxList || chartData.assessment.ddxList.filter(d => !d.isRemoved).length === 0) && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="relative mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center">
                        <Stethoscope className="w-6 h-6 text-teal-500" />
                      </div>
                      <div className="absolute inset-0 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-teal-700">대화 분석 중</p>
                    <p className="text-xs text-slate-400 mt-1">DDx를 추천합니다...</p>
                  </div>
                )}

                {/* 빈 상태 - 녹음 전 */}
                {!chartData && !isRecording && !isRemoteRecording && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <Target className="w-10 h-10 text-teal-300 mb-2" />
                    <p className="text-sm text-slate-500">녹음을 시작하면</p>
                    <p className="text-sm text-slate-500">DDx가 추천됩니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile: Tab + Bottom A/P Panel */}
          <div className="lg:hidden flex flex-col flex-1 min-h-0">
            {/* Tab Switcher */}
            <div className="flex gap-1.5 bg-white rounded-xl border border-slate-200 p-1.5 mb-4">
              <button
                onClick={() => setMobileTab('transcript')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mobileTab === 'transcript'
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                대화
                {(isRecording || isRemoteRecording) && mobileTab !== 'transcript' && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setMobileTab('chart')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mobileTab === 'chart'
                    ? 'bg-teal-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                차트
              </button>
              <button
                onClick={() => setMobileTab('ddx')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mobileTab === 'ddx'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Target className="w-4 h-4" />
                DDx
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-h-0 transition-all duration-300">
              <div className={`${mobileTab === 'transcript' ? 'block' : 'hidden'} h-full`}>
                <TranscriptViewer
                  finalTranscript={finalTranscript}
                  isRecording={isRecording || isRemoteRecording}
                  realtimeSegments={realtimeSegments}
                />
              </div>
              <div className={`${mobileTab === 'chart' ? 'block' : 'hidden'} h-full`}>
                <ChartingResult
                  chartData={chartData}
                  isRecording={isRecording || isRemoteRecording}
                  layout="compact"
                  department={chartSettings.selectedDepartment}
                  activeFields={chartSettings.activeFields}
                />
              </div>
              <div className={`${mobileTab === 'ddx' ? 'block' : 'hidden'} h-full`}>
                <div className="h-full bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border-2 border-teal-200 shadow-sm overflow-hidden flex flex-col">
                  {/* DDx Header */}
                  <div className="flex-none px-4 py-3 border-b border-teal-200 bg-white/50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                        <Target className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-teal-800">DDx 추천</h3>
                        <p className="text-[10px] text-teal-600">
                          {(isRecording || isRemoteRecording) ? '실시간 업데이트' : '감별진단'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* DDx Content */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col"
                    style={{ gap: chartData || isRecording || isRemoteRecording ? '0.75rem' : '0' }}>
                    
                    {/* Dx/r/o 수동 추가 - 녹음 끝나고 차트 있을 때만 */}
                    {!isRecording && !isRemoteRecording && chartData && (
                      <div className="mb-1">
                        {!showDiagnosisForm ? (
                          <button
                            onClick={() => setShowDiagnosisForm(true)}
                            className="w-full py-2 px-3 rounded-lg border border-dashed border-slate-300 text-slate-500 text-xs hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50/50 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" /> 진단 추가
                          </button>
                        ) : (
                          <div className="bg-white rounded-xl p-3 border border-teal-200 shadow-sm animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                                <Plus className="w-3 h-3" /> 진단 추가
                              </div>
                              <button 
                                onClick={() => {
                                  setShowDiagnosisForm(false);
                                  setNewDiagnosisInput('');
                                }}
                                className="text-slate-400 hover:text-slate-600 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex gap-1.5 mb-2">
                              <button
                                onClick={() => setNewDiagnosisType('dx')}
                                className={`flex-1 text-[10px] py-1.5 rounded-md border transition-all ${
                                  newDiagnosisType === 'dx' 
                                    ? 'bg-teal-500 text-white border-teal-500 font-medium' 
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-teal-300'
                                }`}
                              >
                                # Dx
                              </button>
                              <button
                                onClick={() => setNewDiagnosisType('ro')}
                                className={`flex-1 text-[10px] py-1.5 rounded-md border transition-all ${
                                  newDiagnosisType === 'ro' 
                                    ? 'bg-blue-500 text-white border-blue-500 font-medium' 
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'
                                }`}
                              >
                                r/o
                              </button>
                            </div>
                            <div className="flex gap-1.5">
                              <Input
                                value={newDiagnosisInput}
                                onChange={(e) => setNewDiagnosisInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddDiagnosis();
                                  if (e.key === 'Escape') {
                                    setShowDiagnosisForm(false);
                                    setNewDiagnosisInput('');
                                  }
                                }}
                                placeholder="진단명 (예: Tension headache)"
                                className="flex-1 h-7 text-xs"
                                autoFocus
                              />
                              <Button
                                onClick={() => {
                                  handleAddDiagnosis();
                                  setShowDiagnosisForm(false);
                                }}
                                disabled={!newDiagnosisInput.trim()}
                                size="sm"
                                className="h-7 px-2.5 bg-teal-500 hover:bg-teal-600"
                              >
                                추가
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 확정 진단 (확정된 DDx) */}
                    {chartData?.assessment?.ddxList?.filter(d => d.isConfirmed).map((ddx) => (
                      <div key={ddx.id} className="bg-teal-100 rounded-xl p-3 border border-teal-300">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[10px] font-bold text-teal-600 mb-0.5 flex items-center gap-1">
                              <Check className="w-3 h-3" /> 확정 진단
                            </div>
                            <div className="text-sm font-semibold text-teal-900"># {ddx.diagnosis}</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnconfirmDdx(ddx.id)}
                            className="h-6 text-[10px] text-teal-600 hover:text-teal-800 hover:bg-teal-200"
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* 대화 기반 r/o (미확정) */}
                    {chartData?.assessment?.ddxList && chartData.assessment.ddxList.filter(d => !d.isRemoved && !d.isConfirmed && d.source === 'doctor').length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold text-blue-600 px-1 flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" /> 대화 기반 r/o
                        </div>
                        {chartData.assessment.ddxList
                          .filter(d => !d.isRemoved && !d.isConfirmed && d.source === 'doctor')
                          .map((ddx) => (
                            <div 
                              key={ddx.id} 
                              className="bg-blue-50 rounded-lg p-2.5 border border-blue-200 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-blue-800">r/o {ddx.diagnosis}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                    💬 대화
                                  </span>
                                </div>
                              </div>
                              {ddx.reason && (
                                <p className="text-[10px] text-slate-500 mb-2">{ddx.reason}</p>
                              )}
                              <div className="flex gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleConfirmDdx(ddx.id)}
                                  className="h-6 text-[10px] flex-1 border-teal-300 text-teal-700 hover:bg-teal-50"
                                >
                                  <Check className="w-3 h-3 mr-1" /> 확정
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemoveDdx(ddx.id)}
                                  className="h-6 text-[10px] flex-1 border-slate-300 text-slate-500 hover:bg-slate-50"
                                >
                                  제외
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* AI DDx 추천 (미확정) */}
                    {chartData?.assessment?.ddxList && chartData.assessment.ddxList.filter(d => !d.isRemoved && !d.isConfirmed && d.source !== 'doctor').length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold text-amber-600 px-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> AI DDx 추천
                        </div>
                        {chartData.assessment.ddxList
                          .filter(d => !d.isRemoved && !d.isConfirmed && d.source !== 'doctor')
                          .map((ddx, index) => (
                            <div 
                              key={ddx.id} 
                              className={`bg-white rounded-lg p-2.5 border shadow-sm transition-all duration-300 ${
                                newDdxIds.has(ddx.id) 
                                  ? 'border-amber-400 animate-[slideInRight_0.3s_ease-out]' 
                                  : 'border-amber-200'
                              }`}
                              style={{ animationDelay: newDdxIds.has(ddx.id) ? `${index * 100}ms` : '0ms' }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-amber-800">r/o {ddx.diagnosis}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    ddx.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {ddx.confidence === 'high' ? '높음' : '중간'}
                                  </span>
                                </div>
                              </div>
                              {ddx.reason && (
                                <p className="text-[10px] text-slate-500 mb-2">{ddx.reason}</p>
                              )}
                              <div className="flex gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleConfirmDdx(ddx.id)}
                                  className="h-6 text-[10px] flex-1 border-teal-300 text-teal-700 hover:bg-teal-50"
                                >
                                  <Check className="w-3 h-3 mr-1" /> 확정
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemoveDdx(ddx.id)}
                                  className="h-6 text-[10px] flex-1 border-slate-300 text-slate-500 hover:bg-slate-50"
                                >
                                  제외
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* 제외된 DDx (복구 가능) */}
                    {chartData?.assessment?.ddxList && chartData.assessment.ddxList.filter(d => d.isRemoved).length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 px-1">제외됨</div>
                        {chartData.assessment.ddxList
                          .filter(d => d.isRemoved)
                          .map((ddx) => (
                            <div key={ddx.id} className="bg-slate-100 rounded-lg p-2 border border-slate-200 flex items-center justify-between">
                              <span className="text-xs text-slate-400 line-through">{ddx.diagnosis}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreDdx(ddx.id)}
                                className="h-5 text-[10px] text-slate-500 hover:text-slate-700"
                              >
                                복구
                              </Button>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* 녹음 중 - DDx 분석 중 애니메이션 */}
                    {(isRecording || isRemoteRecording) && (!chartData?.assessment?.ddxList || chartData.assessment.ddxList.filter(d => !d.isRemoved).length === 0) && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <div className="relative mb-3">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center">
                            <Stethoscope className="w-6 h-6 text-teal-500" />
                          </div>
                          <div className="absolute inset-0 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                        </div>
                        <p className="text-sm font-medium text-teal-700">대화 분석 중</p>
                        <p className="text-xs text-slate-400 mt-1">DDx를 추천합니다...</p>
                      </div>
                    )}

                    {/* 빈 상태 - 녹음 전 */}
                    {!chartData && !isRecording && !isRemoteRecording && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <Target className="w-10 h-10 text-teal-300 mb-2" />
                        <p className="text-sm text-slate-500">녹음을 시작하면</p>
                        <p className="text-sm text-slate-500">DDx가 추천됩니다</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile CTA */}
            <div className="mt-3 flex-none">
              <div className="bg-white/95 border border-slate-200 rounded-xl shadow-sm px-3 py-3 backdrop-blur">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-teal-600" />
                  <div className="text-xs font-semibold text-slate-700">정식 출시 알림 받기</div>
                </div>
                <form onSubmit={handleEmailInputSubmit} className="mt-2 flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Button type="submit" className="h-9 px-3 text-sm bg-teal-600 hover:bg-teal-700">
                    구독
                  </Button>
                </form>
              </div>
            </div>
          </div>

          {/* Email Subscribe Section */}
          <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 lg:ml-auto lg:w-fit">
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
          lastRequestedSegmentCountRef.current = 0;
          lastAutoUpdateTimeRef.current = 0;
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
              bumpPendingApi(1);
              console.log('[Remote] Final GPT classification for', utterances.length, 'utterances');
              
              // 1. 최종 GPT 분류 (pending 상태 해소)
              const classifiedSegments = await classifyUtterancesWithGPT(utterances);
              console.log('[Remote] Classified segments:', classifiedSegments.length);
              setRealtimeSegments(classifiedSegments);

              const segmentsForFast = classifiedSegments.slice(-MAX_CONTEXT_SEGMENTS);
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

                void correctSTTErrors(classifiedSegments)
                  .then((fullyCorrected) => {
                    setRealtimeSegments(fullyCorrected);
                    const fastSegments = fullyCorrected.slice(-MAX_CONTEXT_SEGMENTS);
                    lastFastCorrectionKeyRef.current = buildSegmentsKey(fastSegments);
                    lastFastCorrectedSegmentsRef.current = fastSegments;
                  })
                  .catch((error) => {
                    console.warn('[Remote] STT correction (background) failed:', error);
                  });
              }
              
              // 4. Streaming 차트 생성 - onPartialUpdate로만 반영
              const contextSegments = fastCorrectedSegments;
              const transcriptText = contextSegments.map(s => s.text).join(' ');
              console.log('[Remote] Streaming chart generation...');
              await generateChartFromTranscriptStreaming(
                transcriptText, 
                contextSegments, 
                chartSettings.selectedDepartment,
                (partial) => {
                  setChartData(prevData => mergeChartData(prevData, partial));
                },
                undefined,
                true
              );
              toast.success('차트가 생성되었습니다');
            } catch (error) {
              console.error('Remote chart generation error:', error);
              toast.error('차트 생성 중 오류가 발생했습니다');
            } finally {
              bumpPendingApi(-1);
            }
          }
          setIsGeneratingChart(false);
        }}
      />
    </div>
  );
}
