import { useState, useCallback, useEffect, useRef } from 'react';
import { VoiceRecorder } from './components/VoiceRecorder';
import { ChartingResult, ChartData } from './components/ChartingResult';
import { LandingPage } from './components/LandingPage';
import { DemoPage } from './components/DemoPage';
import { ChartSettingsModal } from './components/ChartSettingsModal';
import { MobileMicPage } from './components/MobileMicPage';
import { RemoteMicModal } from './components/RemoteMicModal';
import { PatientSidebar } from './components/PatientSidebar';
import { ChartSettings, DEFAULT_CHART_SETTINGS, DEPARTMENT_PRESETS, generateChartFromTranscriptStreaming, correctSTTErrors, DdxItem } from '@/services/chartService';
import { classifyUtterancesWithGPT } from '@/services/deepgramService';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Toaster } from '@/app/components/ui/sonner';
import { toast } from 'sonner';
import { Stethoscope, Mail, Loader2, MessageSquare, Send, ChevronRight, Smartphone, Play, Square, User, Bell, Menu, X, Mic, Trash2 } from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/app/components/ui/select';

// Google Sheets API URL
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbw5uH766QFw6m0kLchHySCPH7UUXX1F0TCxZe4ygqRiGEvhcSKKSr_nQ0gs_88GCDA/exec';
const MAX_CONTEXT_SEGMENTS = 8;
const ENABLE_STT_CORRECTION = true;
const MAX_SESSIONS = 5;

// 환자 세션 타입
export interface PatientSession {
  id: string;
  patientName: string;
  patientMemo: string;
  chartData: ChartData | null;
  freeText: string;
  createdAt: Date;
  updatedAt: Date;
}

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
  const [freeText, setFreeText] = useState(''); // 차트 자유 편집 텍스트
  
  // 환자 정보
  const [patientName, setPatientName] = useState('');
  const [patientMemo, setPatientMemo] = useState('');
  
  // 환자 세션 관리 - 초기 세션 1개 생성
  const initialSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const [sessions, setSessions] = useState<PatientSession[]>(() => [{
    id: initialSessionId,
    patientName: '',
    patientMemo: '',
    chartData: null,
    freeText: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  }]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessionId);
  const [sidebarOpen, setSidebarOpen] = useState(false); // 모바일 drawer용
  const [showWelcomeModal, setShowWelcomeModal] = useState(false); // 첫 방문 환영 모달
  
  // 첫 방문 체크
  useEffect(() => {
    const hasVisited = localStorage.getItem('cheat-chat-visited');
    if (!hasVisited) {
      setShowWelcomeModal(true);
    }
  }, []);

  const handleCloseWelcomeModal = useCallback(() => {
    setShowWelcomeModal(false);
    localStorage.setItem('cheat-chat-visited', 'true');
  }, []);
  
  // 타임스탬프
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null);
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
  const [remoteMicOpen, setRemoteMicOpen] = useState(false);
  const [isRemoteConnected, setIsRemoteConnected] = useState(false);
  const [remoteRecordingTime, setRemoteRecordingTime] = useState(0);
  const [localRecordingTime, setLocalRecordingTime] = useState(0);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [lastAutoUpdateSegmentCount, setLastAutoUpdateSegmentCount] = useState(0);
  const lastRequestedSegmentCountRef = useRef(0);
  const lastFastCorrectionKeyRef = useRef('');
  const lastFastCorrectedSegmentsRef = useRef<Segment[] | null>(null);
  const [pendingApiCount, setPendingApiCount] = useState(0);
  const pendingApiRef = useRef(0);
  const testAbortRef = useRef<AbortController | null>(null);
  const [silenceTimeout, setSilenceTimeout] = useState<NodeJS.Timeout | null>(null);
  const bumpPendingApi = useCallback((delta: number) => {
    pendingApiRef.current = Math.max(0, pendingApiRef.current + delta);
    setPendingApiCount(pendingApiRef.current);
  }, []);
  
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
  const [testRecordingTime, setTestRecordingTime] = useState(0);
  const testIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const testTimerRef = useRef<NodeJS.Timeout | null>(null);
  const testSegmentsRef = useRef<Segment[]>([]);
  const isGeneratingRef = useRef(false); // API 요청 중인지 추적
  const pendingUpdateRef = useRef(false); // 대기 중인 업데이트가 있는지
  const generationIdRef = useRef(0); // 최신 요청 ID 추적 (오래된 요청 결과 무시용)

  // 마이크 권한 상태
  const [hasMicPermission, setHasMicPermission] = useState(false);

  // 마이크 장치 목록 가져오기 (권한이 이미 있을 때만)
  const refreshAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput' && device.deviceId);
      setAudioDevices(audioInputs);
      
      // 라벨이 있으면 권한이 부여된 것
      if (audioInputs.length > 0 && audioInputs[0].label) {
        setHasMicPermission(true);
        if (!selectedMicId) {
          setSelectedMicId(audioInputs[0].deviceId);
        }
      }
    } catch (error) {
      console.log('장치 목록을 가져올 수 없습니다:', error);
    }
  }, [selectedMicId]);

  // 마이크 권한 요청
  const requestMicPermission = useCallback(async () => {
    try {
      console.log('마이크 권한 요청 시작...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 권한을 얻은 후 스트림 정지
      stream.getTracks().forEach(track => track.stop());
      setHasMicPermission(true);
      toast.success('마이크 권한이 허용되었습니다');
      await refreshAudioDevices();
    } catch (error: unknown) {
      console.error('마이크 권한 요청 실패:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          toast.error('마이크 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
        } else if (error.name === 'NotFoundError') {
          toast.error('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
        } else {
          toast.error(`마이크 오류: ${error.message}`);
        }
      } else {
        toast.error('마이크 권한을 얻을 수 없습니다.');
      }
    }
  }, [refreshAudioDevices]);

  useEffect(() => {
    // 초기 로드 시 권한 없이 장치 목록만 시도 (라벨 없이 표시될 수 있음)
    refreshAudioDevices();
    
    // 장치 변경 감지
    navigator.mediaDevices.addEventListener('devicechange', refreshAudioDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshAudioDevices);
    };
  }, [refreshAudioDevices]);

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
        source: 'stated',
        confidence: 'low',
        rationale: '',
        evidence: [],
      };
    }

    if (!allowFhx && mergedData.familyHistory?.source !== 'user') {
      mergedData.familyHistory = {
        value: '',
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
      // 데모 중지 시 타임스탬프 설정
      setSessionEndTime(new Date());
      handleReset();
      toast.info('데모 중지됨');
      return;
    }

    // 테스트 시나리오 풀 (10개) - 랜덤 재생
    // 전문적인 3개 시나리오
    const testScenarios: Segment[][] = [
      // 시나리오 1: 급성 관상동맥 증후군 (ACS) - 63세 남성
      [
        { text: '안녕하세요, 어떻게 오셨어요?', speaker: 'doctor' },
        { text: '가슴이 너무 답답하고 조이는 느낌이에요. 한 시간 전에 갑자기 시작됐어요.', speaker: 'patient' },
        { text: '통증이 어디로 퍼지나요?', speaker: 'doctor' },
        { text: '왼쪽 팔이랑 턱 쪽으로 뻗치는 느낌이 있어요.', speaker: 'patient' },
        { text: '땀이 나거나 메스꺼움은요?', speaker: 'doctor' },
        { text: '식은땀이 나고 속이 울렁거려요.', speaker: 'patient' },
        { text: '숨이 차거나 어지러운 느낌은요?', speaker: 'doctor' },
        { text: '숨이 좀 차고 어지러워요.', speaker: 'patient' },
        { text: '과거력 여쭤볼게요. 고혈압이나 당뇨, 고지혈증 있으세요?', speaker: 'doctor' },
        { text: '고혈압은 10년 됐고, 당뇨는 5년 됐어요. 고지혈증도 있어요.', speaker: 'patient' },
        { text: '드시는 약은요?', speaker: 'doctor' },
        { text: '암로디핀 5밀리 하루 한 번, 메포민 500밀리 하루 두 번, 아토바스타틴 10밀리 먹어요.', speaker: 'patient' },
        { text: '담배는 피우세요?', speaker: 'doctor' },
        { text: '하루에 한 갑씩 30년 넘게 피웠어요.', speaker: 'patient' },
        { text: '가족 중에 심장병 있으신 분 계세요?', speaker: 'doctor' },
        { text: '아버지가 50대에 심근경색으로 돌아가셨어요.', speaker: 'patient' },
        { text: '이전에 이런 가슴 통증 있었던 적 있으세요?', speaker: 'doctor' },
        { text: '가끔 운동하면 답답했는데 쉬면 괜찮아져서 그냥 넘겼어요.', speaker: 'patient' },
        { text: '알레르기는요?', speaker: 'doctor' },
        { text: '없어요.', speaker: 'patient' },
        { text: '활력징후 체크할게요. 혈압 160/95, 맥박 98, 산소포화도 94%네요.', speaker: 'doctor' },
        { text: '심전도 바로 찍고 Troponin 포함해서 cardiac enzyme 확인하겠습니다.', speaker: 'doctor' },
        { text: '아스피린 300밀리 씹어서 드시고, 니트로글리세린 설하 투여하겠습니다.', speaker: 'doctor' },
        { text: '급성 관상동맥 증후군, NSTEMI 의심되어 심장내과 협진 요청드리겠습니다.', speaker: 'doctor' },
      ],
      // 시나리오 2: 급성 충수염 - 28세 여성
      [
        { text: '어디가 불편해서 오셨어요?', speaker: 'doctor' },
        { text: '배가 너무 아파요. 어젯밤부터 시작됐어요.', speaker: 'patient' },
        { text: '처음에 어디가 아프기 시작했어요?', speaker: 'doctor' },
        { text: '처음엔 배꼽 주변이 아팠는데, 오늘 아침부터 오른쪽 아랫배로 옮겨갔어요.', speaker: 'patient' },
        { text: '통증이 어떤 양상인가요? 찌르는 듯한지, 쥐어짜는 듯한지요.', speaker: 'doctor' },
        { text: '처음엔 뻐근했는데 지금은 찌르는 것처럼 아파요. 움직이면 더 심해져요.', speaker: 'patient' },
        { text: '0에서 10까지면 통증이 어느 정도예요?', speaker: 'doctor' },
        { text: '8 정도요. 정말 많이 아파요.', speaker: 'patient' },
        { text: '열은 있었어요?', speaker: 'doctor' },
        { text: '오늘 아침에 재보니까 38.2도였어요. 오한도 있었어요.', speaker: 'patient' },
        { text: '메스꺼움이나 구토는요?', speaker: 'doctor' },
        { text: '메스껍고 한 번 토했어요. 식욕도 전혀 없어요.', speaker: 'patient' },
        { text: '마지막 대변은 언제 보셨어요?', speaker: 'doctor' },
        { text: '어제 저녁에 봤는데 그 이후로 못 봤어요.', speaker: 'patient' },
        { text: '마지막 생리는요?', speaker: 'doctor' },
        { text: '2주 전에 했어요. 주기는 규칙적이에요.', speaker: 'patient' },
        { text: '과거력이나 수술력 있으세요?', speaker: 'doctor' },
        { text: '없어요. 건강했어요.', speaker: 'patient' },
        { text: '드시는 약이나 알레르기는요?', speaker: 'doctor' },
        { text: '약은 없고, 알레르기도 없어요.', speaker: 'patient' },
        { text: '복부 진찰할게요. 오른쪽 아랫배 McBurney point 압통 있고, 반발통 양성이네요. Rovsing sign도 양성입니다.', speaker: 'doctor' },
        { text: 'CBC, CRP 포함해서 피검사하고 복부 CT 찍겠습니다. 임신 검사도 같이 할게요.', speaker: 'doctor' },
        { text: '급성 충수염 의심되어 외과 협진 요청하겠습니다. 금식 유지하시고 수액 맞으면서 대기해주세요.', speaker: 'doctor' },
      ],
      // 시나리오 3: 지역사회획득 폐렴 - 72세 여성, 기저질환 COPD
      [
        { text: '어떻게 오셨어요?', speaker: 'doctor' },
        { text: '기침이 심하고 숨이 너무 차요. 3일 전부터 점점 심해졌어요.', speaker: 'patient' },
        { text: '가래는 나와요?', speaker: 'doctor' },
        { text: '누런 가래가 많이 나와요. 피는 안 섞여 있어요.', speaker: 'patient' },
        { text: '열은 있었어요?', speaker: 'doctor' },
        { text: '어제 저녁에 38.5도까지 올랐어요. 오한도 있었고요.', speaker: 'patient' },
        { text: '평소 숨찬 정도랑 비교하면 어때요?', speaker: 'doctor' },
        { text: '평소에도 좀 차긴 한데, 지금은 가만히 있어도 숨이 차요.', speaker: 'patient' },
        { text: '가슴이 아프거나 답답한 건요?', speaker: 'doctor' },
        { text: '오른쪽 가슴이 기침할 때 아파요.', speaker: 'patient' },
        { text: '과거력 여쭤볼게요. 폐 질환 있으시죠?', speaker: 'doctor' },
        { text: '만성폐쇄성폐질환 있어요. 5년 됐어요.', speaker: 'patient' },
        { text: '다른 질환은요?', speaker: 'doctor' },
        { text: '고혈압이랑 골다공증 있어요.', speaker: 'patient' },
        { text: '드시는 약은요?', speaker: 'doctor' },
        { text: '스피리바 흡입기 쓰고, 암로디핀 5밀리, 칼슘제 먹어요.', speaker: 'patient' },
        { text: '담배는요?', speaker: 'doctor' },
        { text: '예전에 피웠는데 10년 전에 끊었어요.', speaker: 'patient' },
        { text: '알레르기는요?', speaker: 'doctor' },
        { text: '페니실린 알레르기 있어요. 두드러기 났었어요.', speaker: 'patient' },
        { text: '활력징후 볼게요. 혈압 135/80, 맥박 102, 호흡수 24, 체온 38.3, 산소포화도 room air에서 89%입니다.', speaker: 'doctor' },
        { text: '청진상 오른쪽 하엽에서 crackles 들리고, 타진상 둔탁음 있습니다.', speaker: 'doctor' },
        { text: 'CBC, CRP, Procalcitonin, BMP 하고 흉부 X-ray 찍겠습니다. 객담 배양도 보내고요.', speaker: 'doctor' },
        { text: '산소 3L 비강캐뉼라로 투여하고, 지역사회획득 폐렴으로 Levofloxacin 750밀리 하루 한 번 시작하겠습니다. 페니실린 알레르기라 퀴놀론 쓸게요.', speaker: 'doctor' },
        { text: 'CURB-65 3점으로 입원 치료 필요합니다.', speaker: 'doctor' },
      ],
    ];

    // 각 시나리오에 맞는 환자 정보
    const patientInfos = [
      // 시나리오 1: 급성 관상동맥 증후군 - 63세 남성
      { name: '박영호 (63/M)', memo: 'HTN 10y, DM 5y, Hyperlipidemia / Amlodipine 5mg, Metformin 500mg bid, Atorvastatin 10mg' },
      // 시나리오 2: 급성 충수염 - 28세 여성
      { name: '이수진 (28/F)', memo: 'N/S' },
      // 시나리오 3: 지역사회획득 폐렴 - 72세 여성
      { name: '김옥순 (72/F)', memo: 'COPD 5y, HTN, Osteoporosis / Spiriva, Amlodipine 5mg, Calcium / PCN allergy (urticaria)' },
    ];

    // 랜덤 시나리오 선택
    const scenarioIndex = Math.floor(Math.random() * testScenarios.length);
    const scenario = testScenarios[scenarioIndex];
    const patientInfo = patientInfos[scenarioIndex];

    // 초기화
    setChartData(null);
    setFinalTranscript('');
    setRealtimeSegments([]);
    setFreeText('');
    setPatientName('');
    setPatientMemo('');
    setSessionStartTime(new Date());
    
    setIsTestRunning(true);
    isTestRunningRef.current = true;
    setIsRecording(true);
    lastRequestedSegmentCountRef.current = 0;
    lastAutoUpdateTimeRef.current = 0;
    toast.info('🧪 실시간 시뮬레이션 시작');

    // 타이핑 애니메이션 (느리게 - 80ms per char)
    const typeText = (text: string, setter: (val: string) => void, charDelay: number = 80): Promise<void> => {
      return new Promise((resolve) => {
        let currentIndex = 0;
        const typeNextChar = () => {
          if (!isTestRunningRef.current) {
            resolve();
            return;
          }
          if (currentIndex <= text.length) {
            setter(text.slice(0, currentIndex));
            currentIndex++;
            setTimeout(typeNextChar, charDelay);
          } else {
            resolve();
          }
        };
        typeNextChar();
      });
    };

    // 타이핑 애니메이션 시작 (대화와 동시에 진행)
    (async () => {
      await typeText(patientInfo.name, setPatientName, 80);
      if (isTestRunningRef.current) {
        await typeText(patientInfo.memo, setPatientMemo, 60);
      }
    })();

    // AbortController 참조
    let currentAbortController: AbortController | null = null;

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
    lastFastCorrectionKeyRef.current = '';
    lastFastCorrectedSegmentsRef.current = null;
    setIsRecording(true);
    // 데모 시작 시 타임스탬프 설정
    setSessionStartTime(new Date());
    setSessionEndTime(null);

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
        await generateChartFromCurrentSegments(testSegmentsRef.current, true);
        setIsGeneratingChart(false);
        setIsTestRunning(false);
        isTestRunningRef.current = false;
        // 데모 완료 시 타임스탬프 설정
        setSessionEndTime(new Date());
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

  // 테스트 녹음 시간 추적
  useEffect(() => {
    if (isTestRunning) {
      setTestRecordingTime(0);
      testTimerRef.current = setInterval(() => {
        setTestRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (testTimerRef.current) {
        clearInterval(testTimerRef.current);
        testTimerRef.current = null;
      }
      setTestRecordingTime(0);
    }
    return () => {
      if (testTimerRef.current) {
        clearInterval(testTimerRef.current);
      }
    };
  }, [isTestRunning]);

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
    // 세션 시작 시간 기록
    const now = new Date();
    setSessionStartTime(now);
    setSessionEndTime(null);
    
    // 권한이 부여되었으므로 장치 목록 새로고침
    refreshAudioDevices();
    
    // 세션이 없으면 자동 생성
    if (!activeSessionId) {
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newSession: PatientSession = {
        id: newSessionId,
        patientName: patientName || '',
        patientMemo: patientMemo || '',
        chartData: null,
        freeText: '',
        createdAt: now,
        updatedAt: now,
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    }
  }, [activeSessionId, patientName, patientMemo, refreshAudioDevices]);

  const handleProcessingStart = useCallback(() => {
    setIsRecording(false);
    setIsGeneratingChart(true);
    if (streamingAbortRef.current) {
      streamingAbortRef.current.abort();
      streamingAbortRef.current = null;
    }
    generationIdRef.current += 1;
  }, []);

  const handleRecordingComplete = useCallback((transcript: string, result: ChartData | null) => {
    setIsRecording(false);
    setFinalTranscript(transcript);
    // 세션 종료 시간 기록
    setSessionEndTime(new Date());
    
    if (result) {
      // 기존 차트와 병합 (녹음 중 생성된 CC, PI, ROS 유지)
      setChartData(prev => mergeChartData(prev, result));
    }
    setIsGeneratingChart(false);
  }, [mergeChartData]);

  const handleRecordingProgress = useCallback((progress: number) => {
    setRecordingProgress(progress);
  }, []);

  const handleReset = useCallback(() => {
    setFinalTranscript('');
    setRealtimeSegments([]);
    setChartData(null);
    setIsGeneratingChart(false);
    setRecordingProgress(0);
    setPatientName('');
    setPatientMemo('');
    setFreeText('');
    setSessionStartTime(null);
    setSessionEndTime(null);
    lastRequestedSegmentCountRef.current = 0;
    lastAutoUpdateTimeRef.current = 0;
    lastFastCorrectionKeyRef.current = '';
    lastFastCorrectedSegmentsRef.current = null;
  }, []);

  // 세션 관리 함수들
  const generateSessionId = useCallback(() => {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const saveCurrentSession = useCallback(() => {
    if (!activeSessionId) return;
    
    setSessions(prev => prev.map(session => 
      session.id === activeSessionId
        ? {
            ...session,
            patientName,
            patientMemo,
            chartData,
            freeText,
            updatedAt: new Date(),
          }
        : session
    ));
  }, [activeSessionId, patientName, patientMemo, chartData, freeText]);

  const loadSession = useCallback((session: PatientSession) => {
    setPatientName(session.patientName);
    setPatientMemo(session.patientMemo);
    setChartData(session.chartData);
    setFreeText(session.freeText || '');
    setFinalTranscript('');
    setRealtimeSegments([]);
    setSessionStartTime(session.createdAt);
    setSessionEndTime(null);
  }, []);

  // 세션 데이터 변경 시 자동으로 동기화
  useEffect(() => {
    if (!activeSessionId) return;
    
    setSessions(prev => prev.map(session => 
      session.id === activeSessionId
        ? {
            ...session,
            patientName,
            patientMemo,
            chartData,
            freeText,
            updatedAt: new Date(),
          }
        : session
    ));
  }, [activeSessionId, patientName, patientMemo, chartData, freeText]);

  const handleNewSession = useCallback(() => {
    // 현재 세션 저장
    saveCurrentSession();
    
    // 최대 5개 제한 체크
    if (sessions.length >= MAX_SESSIONS) {
      toast.error('최대 5명까지 저장 가능합니다. 기존 환자를 삭제해주세요.');
      return;
    }
    
    // 새 세션 생성
    const newSession: PatientSession = {
      id: generateSessionId(),
      patientName: '',
      patientMemo: '',
      chartData: null,
      freeText: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    
    // 상태 초기화
    setPatientName('');
    setPatientMemo('');
    setChartData(null);
    setFreeText('');
    setFinalTranscript('');
    setRealtimeSegments([]);
    setSessionStartTime(null);
    setSessionEndTime(null);
    setSidebarOpen(false);
  }, [saveCurrentSession, sessions.length, generateSessionId]);

  const handleSelectSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionId) return;
    
    // 현재 세션 저장하고 동시에 새 세션 데이터 가져오기
    setSessions(prev => {
      // 현재 세션 저장
      const updated = prev.map(session => 
        session.id === activeSessionId
          ? {
              ...session,
              patientName,
              patientMemo,
              chartData,
              freeText,
              updatedAt: new Date(),
            }
          : session
      );
      
      // 선택한 세션 찾아서 로드
      const targetSession = updated.find(s => s.id === sessionId);
      if (targetSession) {
        // setTimeout으로 state 업데이트 후 로드
        setTimeout(() => {
          setActiveSessionId(sessionId);
          setPatientName(targetSession.patientName);
          setPatientMemo(targetSession.patientMemo);
          setChartData(targetSession.chartData);
          setFreeText(targetSession.freeText || '');
          setFinalTranscript('');
          setRealtimeSegments([]);
          setSessionStartTime(targetSession.createdAt);
          setSessionEndTime(null);
          setSidebarOpen(false);
        }, 0);
      }
      
      return updated;
    });
  }, [activeSessionId, patientName, patientMemo, chartData, freeText]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    
    // 삭제된 세션이 활성 세션이면
    if (sessionId === activeSessionId) {
      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      if (remainingSessions.length > 0) {
        // 다른 세션으로 전환
        const nextSession = remainingSessions[0];
        setActiveSessionId(nextSession.id);
        loadSession(nextSession);
      } else {
        // 세션이 없으면 초기화
        setActiveSessionId(null);
        setPatientName('');
        setPatientMemo('');
        setChartData(null);
        setFreeText('');
        setFinalTranscript('');
        setRealtimeSegments([]);
        setSessionStartTime(null);
        setSessionEndTime(null);
      }
    }
  }, [activeSessionId, sessions, loadSession]);

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
            <div className="p-1.5 rounded-lg bg-blue-600 text-white">
              <Stethoscope className="w-4 h-4" />
            </div>
            <span className="font-bold text-2xl text-slate-800">Savvy</span>
          </button>

          <div className="flex items-center gap-2">
            <ChartSettingsModal
              settings={chartSettings}
              onSettingsChange={setChartSettings}
              departmentName={selectedDepartmentName}
            />
            
            {/* 데모 버튼 - Primary CTA */}
            <Button
              onClick={handleTestSimulation}
              disabled={isRecording && !isTestRunning || isRemoteRecording || isGeneratingChart}
              className={`h-8 px-3 text-sm font-medium transition-all ${
                isTestRunning 
                  ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isTestRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  데모 중지
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  데모로 체험하기
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <PatientSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            isRecording={isRecording || isRemoteRecording}
          />
        </aside>

        {/* Mobile Sidebar Drawer */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl animate-in slide-in-from-left duration-300">
              <div className="flex items-center justify-between p-3 border-b border-slate-200">
                <span className="font-semibold text-slate-800">환자 목록</span>
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <PatientSidebar
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
                onDeleteSession={handleDeleteSession}
                isRecording={isRecording || isRemoteRecording}
              />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden min-h-0">
          <div className="container mx-auto px-4 py-6 h-full">
            <div className="flex flex-col gap-6 h-full min-h-0">
              {/* Patient Info Header - Heidi Style */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                {/* 모바일 메뉴 버튼 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden shrink-0 mr-2"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </Button>

                {/* 왼쪽: 환자 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        placeholder="환자 정보 입력"
                        className="text-2xl font-semibold border-0 outline-none placeholder:text-slate-300 bg-transparent w-[180px]"
                        style={{ fontSize: '28px' }}
                      />
                      {/* 초기화 버튼 (휴지통) */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleReset}
                        disabled={isRecording || isRemoteRecording || isGeneratingChart}
                        className="h-8 w-8 shrink-0 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="초기화"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="ml-[52px]">
                    <input
                      type="text"
                      value={patientMemo}
                      onChange={(e) => setPatientMemo(e.target.value)}
                      placeholder="메모 추가 (기저질환, 알러지, 복용약물 등)"
                      className="w-full text-sm border-0 outline-none placeholder:text-slate-400 text-slate-500 bg-transparent"
                    />
                  </div>
                  {/* 타임스탬프 */}
                  {sessionStartTime && (
                    <div className="ml-[52px] mt-2 flex items-center gap-4 text-xs text-slate-400">
                      <span>
                        {sessionStartTime.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {sessionStartTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {sessionEndTime && (
                        <>
                          <span>•</span>
                          <span>
                            {Math.floor((sessionEndTime.getTime() - sessionStartTime.getTime()) / 60000)}분 {Math.floor(((sessionEndTime.getTime() - sessionStartTime.getTime()) % 60000) / 1000)}초
                          </span>
                        </>
                      )}
                </div>
              )}
            </div>

            {/* 오른쪽: 녹음 컨트롤 */}
            <div className="flex items-center gap-3 shrink-0">
              {/* 마이크 선택 */}
              {!hasMicPermission ? (
                // 권한 없음: 마이크 버튼 클릭 시 권한 요청 (펄스 효과로 주의 유도)
                <div className="relative">
                  {/* 펄스 효과 (버튼 뒤에 위치, 데모 중에는 숨김) */}
                  {!isTestRunning && (
                    <span className="absolute inset-0 rounded-md bg-blue-400/30 animate-ping pointer-events-none z-0" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={requestMicPermission}
                    disabled={isRecording || isRemoteRecording || isTestRunning}
                    className="h-8 w-8 shrink-0 text-blue-500 hover:text-blue-600 hover:bg-blue-50 relative z-10"
                    title="마이크 권한 허용 (녹음하려면 먼저 클릭)"
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                </div>
              ) : audioDevices.length > 1 ? (
                // 권한 있음 + 여러 장치: 드롭다운
                <Select value={selectedMicId} onValueChange={setSelectedMicId} disabled={isRecording || isRemoteRecording || isTestRunning}>
                  <SelectTrigger className="h-8 w-[140px] text-xs border-slate-200">
                    <Mic className="w-3 h-3 mr-1 shrink-0" />
                    <SelectValue placeholder="마이크 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs">
                        {device.label || `마이크 ${audioDevices.indexOf(device) + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {/* 휴대폰 마이크 연결 버튼 */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRemoteMicOpen(true)}
                disabled={isRecording || isTestRunning}
                className={`h-8 w-8 shrink-0 transition-all ${
                  isRemoteRecording 
                    ? 'text-red-600 bg-red-50' 
                    : isRemoteConnected 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                } disabled:opacity-50`}
                title="휴대폰 마이크 연결"
              >
                <Smartphone className="w-4 h-4" />
              </Button>

              {/* 녹음 버튼 */}
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
                onRecordingTimeChange={setLocalRecordingTime}
                department={chartSettings.selectedDepartment}
                isRemoteRecording={isRemoteRecording}
                remoteRecordingTime={remoteRecordingTime}
                isExternalGenerating={isGeneratingChart}
                isExternalRecording={isTestRunning}
                externalRecordingTime={testRecordingTime}
                patientName={patientName}
                patientMemo={patientMemo}
                selectedDeviceId={selectedMicId}
                disabled={!hasMicPermission || isTestRunning}
                disabledReason={isTestRunning ? "데모 실행 중입니다" : "먼저 마이크 권한을 허용해주세요"}
              />
            </div>
          </div>

          {/* Desktop: Single Column Layout (Chart Only) */}
          <div className="hidden lg:flex flex-col gap-3 flex-1 min-h-0">
            {/* 중앙: AI 차트 (S/O + DDx 통합) */}
            <div className="flex-1 min-w-0 min-h-0">
              <ChartingResult
                chartData={chartData}
                isRecording={isRecording || isRemoteRecording}
                isTyping={isGeneratingChart}
                layout="wide"
                department={chartSettings.selectedDepartment}
                activeFields={chartSettings.activeFields}
                patientName={patientName}
                patientMemo={patientMemo}
                sessionStartTime={sessionStartTime}
                freeText={freeText}
                onFreeTextChange={setFreeText}
                sessionId={activeSessionId}
                recordingTime={isRemoteRecording ? remoteRecordingTime : isTestRunning ? testRecordingTime : localRecordingTime}
                isRemoteRecording={isRemoteRecording}
                currentDemoSegment={isTestRunning && realtimeSegments.length > 0 ? realtimeSegments[realtimeSegments.length - 1] : null}
              />
            </div>
          </div>

          {/* Mobile: Chart Only */}
          <div className="lg:hidden flex flex-col flex-1 min-h-0 gap-3">
            {/* Chart Content */}
            <div className="flex-1 min-h-0">
              <ChartingResult
                chartData={chartData}
                isRecording={isRecording || isRemoteRecording}
                isTyping={isGeneratingChart}
                layout="compact"
                department={chartSettings.selectedDepartment}
                activeFields={chartSettings.activeFields}
                patientName={patientName}
                patientMemo={patientMemo}
                sessionStartTime={sessionStartTime}
                freeText={freeText}
                onFreeTextChange={setFreeText}
                sessionId={activeSessionId}
                recordingTime={isRemoteRecording ? remoteRecordingTime : isTestRunning ? testRecordingTime : localRecordingTime}
                isRemoteRecording={isRemoteRecording}
                currentDemoSegment={isTestRunning && realtimeSegments.length > 0 ? realtimeSegments[realtimeSegments.length - 1] : null}
              />
            </div>
          </div>

          {/* Feedback & Subscribe Modals (숨김 처리된 트리거 없는 모달들) */}
          {/* Feedback Modal */}
          <Dialog open={feedbackOpen} onOpenChange={(open) => {
            setFeedbackOpen(open);
            if (!open) setFeedbackStep('input');
          }}>
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
                    <Button 
                      onClick={handleFeedbackNext}
                      className="bg-blue-600 hover:bg-blue-700"
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
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSendingFeedback ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                      보내기
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>

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
                    className="bg-blue-600 hover:bg-blue-700"
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
        </main>
      </div>

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
        }}
        onRemoteRecordingStop={async () => {
          setIsRemoteRecording(false);
          setIsGeneratingChart(true);
          
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

      {/* 첫 방문 환영 모달 */}
      <Dialog open={showWelcomeModal} onOpenChange={setShowWelcomeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Stethoscope className="w-6 h-6 text-blue-600" />
              Savvy에 오신 것을 환영합니다!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-slate-600 text-sm">
              AI가 진료 대화를 듣고 자동으로 차트를 작성해드립니다.
            </p>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-600 font-semibold text-sm">1</span>
                </div>
                <div>
                  <p className="font-medium text-slate-800 text-sm">녹음 시작</p>
                  <p className="text-slate-500 text-xs">마이크 버튼을 눌러 진료를 시작하세요</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-600 font-semibold text-sm">2</span>
                </div>
                <div>
                  <p className="font-medium text-slate-800 text-sm">자연스럽게 대화</p>
                  <p className="text-slate-500 text-xs">환자와 평소처럼 대화하시면 됩니다</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-600 font-semibold text-sm">3</span>
                </div>
                <div>
                  <p className="font-medium text-slate-800 text-sm">차트 자동 생성</p>
                  <p className="text-slate-500 text-xs">녹음 중단 시 AI가 차트를 정리합니다</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg border border-orange-100">
              <p className="text-orange-700 text-xs">
                <span className="font-medium">TIP:</span> 상단의 <Play className="w-3 h-3 inline mx-0.5" /> 버튼을 눌러 데모를 체험해보세요!
              </p>
            </div>
          </div>
          
          <Button 
            onClick={handleCloseWelcomeModal}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            시작하기
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
