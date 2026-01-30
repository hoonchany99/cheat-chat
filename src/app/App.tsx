import { useState, useCallback, useEffect, useRef } from 'react';
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
import { RotateCcw, Stethoscope, FileText, Mail, Loader2, MessageSquare, Send, ChevronRight, MessageCircle, Smartphone, PanelLeft, Target, ChevronUp, Check, AlertCircle, Plus } from 'lucide-react';
import { Textarea } from '@/app/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/app/components/ui/select';

// Google Sheets API URL
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbw5uH766QFw6m0kLchHySCPH7UUXX1F0TCxZe4ygqRiGEvhcSKKSr_nQ0gs_88GCDA/exec';

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
  const [isTranscriptCollapsed, setIsTranscriptCollapsed] = useState(false);
  const [isMobileAPExpanded, setIsMobileAPExpanded] = useState(false);
  const [newDdxIds, setNewDdxIds] = useState<Set<string>>(new Set()); // 새로 추가된 DDx 추적
  const previousDdxIdsRef = useRef<Set<string>>(new Set());
  
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

  // 🧪 테스트용: 실시간 시뮬레이션 (실제 녹음처럼 대화가 하나씩 추가됨)
  const [isTestRunning, setIsTestRunning] = useState(false);
  const testIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const testSegmentsRef = useRef<Segment[]>([]);
  const isGeneratingRef = useRef(false); // API 요청 중인지 추적
  const pendingUpdateRef = useRef(false); // 대기 중인 업데이트가 있는지

  const handleTestSimulation = useCallback(async () => {
    if (isTestRunning) {
      // 테스트 중지
      if (testIntervalRef.current) {
        clearTimeout(testIntervalRef.current);
        testIntervalRef.current = null;
      }
      setIsTestRunning(false);
      setIsRecording(false);
      isGeneratingRef.current = false;
      pendingUpdateRef.current = false;
      toast.info('테스트 중지됨');
      return;
    }

    // 내과 당뇨 + 고혈압 환자 샘플 대화
    const sampleSegments: Segment[] = [
      { text: '안녕하세요, 어떻게 오셨어요?', speaker: 'doctor' },
      { text: '선생님, 요즘 머리가 너무 아프고 어지러워요. 일주일 전부터 그래요.', speaker: 'patient' },
      { text: '두통이 어떤 식으로 아프세요? 욱신욱신 아프세요, 조이는 것처럼 아프세요?', speaker: 'doctor' },
      { text: '조이는 것처럼 아프고, 특히 오후에 더 심해져요.', speaker: 'patient' },
      { text: '메스꺼움이나 구토는 없으셨어요?', speaker: 'doctor' },
      { text: '네, 그런 건 없었어요.', speaker: 'patient' },
      { text: '혹시 평소에 앓고 계신 질환이 있으세요? 당뇨나 고혈압 같은 거요.', speaker: 'doctor' },
      { text: '네, 당뇨는 10년 전부터 있었고요, 고혈압은 3년 전부터 약 먹고 있어요.', speaker: 'patient' },
      { text: '약은 뭘 드시고 계세요?', speaker: 'doctor' },
      { text: '메트포르민 500mg 하루 두 번 먹고, 혈압약은 암로디핀 5mg 먹어요.', speaker: 'patient' },
      { text: '약은 잘 드시고 계세요?', speaker: 'doctor' },
      { text: '네, 잘 먹고 있어요.', speaker: 'patient' },
      { text: '담배나 술은 하세요?', speaker: 'doctor' },
      { text: '담배는 안 피우고, 술은 가끔 한 잔 정도요.', speaker: 'patient' },
      { text: '가족 중에 뇌졸중이나 심장병 앓으신 분 계세요?', speaker: 'doctor' },
      { text: '아버지가 당뇨랑 고혈압 있으시고, 어머니는 특별히 없어요.', speaker: 'patient' },
      { text: '알겠습니다. 혈압 한번 재볼게요. 150에 95네요, 좀 높네요.', speaker: 'doctor' },
      { text: '진찰해보니 신경학적으로는 특이소견 없어요. 혈액검사랑 CT 한번 찍어봅시다.', speaker: 'doctor' },
      { text: '지금은 긴장성 두통이 의심되는데, 고혈압 조절이 잘 안 되는 것 같아요.', speaker: 'doctor' },
      { text: '혈압약 용량 올리고, 두통약 처방해드릴게요. 일주일 후에 다시 오세요.', speaker: 'doctor' },
    ];

    // 초기화
    setRealtimeSegments([]);
    setChartData(null);
    setLastAutoUpdateSegmentCount(0);
    testSegmentsRef.current = [];
    isGeneratingRef.current = false;
    pendingUpdateRef.current = false;
    setIsTestRunning(true);
    setIsRecording(true);
    toast.info('🧪 실시간 시뮬레이션 시작', { description: '대화가 하나씩 추가됩니다...' });

    let currentIndex = 0;
    let lastUpdateIndex = 0;

    // 차트 생성 함수 (요청 중이면 스킵)
    const generateChartFromCurrentSegments = async (segments: Segment[], isFinal = false) => {
      // 이미 요청 중이면 대기 플래그만 설정하고 리턴
      if (isGeneratingRef.current && !isFinal) {
        console.log('⏳ 이미 요청 중, 대기 플래그 설정');
        pendingUpdateRef.current = true;
        return;
      }

      if (segments.length === 0) return;
      
      isGeneratingRef.current = true;
      console.log('🚀 차트 생성 시작 (', segments.length, '개 대화)');
      
      try {
        const transcriptText = segments.map(s => 
          `${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`
        ).join('\n');
        
        const result = await generateChartFromTranscript(
          transcriptText,
          segments,
          chartSettings.selectedDepartment
        );
        
        if (result) {
          setChartData(prevData => {
            if (!prevData) return result;
            // 사용자가 직접 수정한 필드(source='user')만 유지, 나머지는 새 데이터로 업데이트
            const mergedData = { ...result };
            Object.keys(prevData).forEach(fieldId => {
              if (prevData[fieldId]?.source === 'user') {
                // 사용자가 수정한 필드는 유지
                mergedData[fieldId] = prevData[fieldId];
              }
            });
            return mergedData;
          });
          console.log('✅ 차트 업데이트 완료 (', segments.length, '개 대화)');
        }
      } catch (error) {
        console.error('❌ 차트 생성 에러:', error);
      } finally {
        isGeneratingRef.current = false;
        
        // 대기 중인 업데이트가 있으면 최신 데이터로 다시 요청
        if (pendingUpdateRef.current && testSegmentsRef.current.length > segments.length) {
          pendingUpdateRef.current = false;
          console.log('🔄 대기 중인 업데이트 실행');
          generateChartFromCurrentSegments(testSegmentsRef.current);
        }
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

    // 대화 하나씩 추가 (setTimeout 체인)
    const addNextSegment = () => {
      if (currentIndex >= sampleSegments.length) {
        // 모든 대화 완료
        setIsTestRunning(false);
        setIsRecording(false);
        
        // 최종 차트 생성 (강제)
        setTimeout(() => {
          generateChartFromCurrentSegments(testSegmentsRef.current, true);
          toast.success('🧪 시뮬레이션 완료!');
        }, 500);
        return;
      }

      // 대화 추가
      const newSegment = sampleSegments[currentIndex];
      testSegmentsRef.current = [...testSegmentsRef.current, newSegment];
      setRealtimeSegments([...testSegmentsRef.current]);
      currentIndex++;

      // 2개마다 차트 업데이트 (더 실시간 느낌)
      if (currentIndex - lastUpdateIndex >= 2) {
        lastUpdateIndex = currentIndex;
        console.log('🔄 중간 차트 업데이트 (', currentIndex, '개 대화)');
        generateChartFromCurrentSegments([...testSegmentsRef.current]);
      }

      // 다음 대화 예약 (현재 텍스트 길이에 따른 대기 시간)
      const delay = getDelay(newSegment.text);
      testIntervalRef.current = setTimeout(addNextSegment, delay);
    };

    // 첫 대화 시작
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
  const triggerAutoChartUpdate = useCallback(async () => {
    const currentSegmentCount = realtimeSegments.length;
    
    // 최소 3개 이상 발화가 있어야 함
    if (currentSegmentCount < 3) return;
    
    // 이미 업데이트 중이거나 차트 생성 중이면 건너뜀
    if (isAutoUpdating || isGeneratingChart) return;
    
    // 변경사항이 없으면 건너뜀
    if (currentSegmentCount <= lastAutoUpdateSegmentCount) return;

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

  // Plan 수정
  const handlePlanChange = useCallback((value: string) => {
    setChartData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        plan: { ...prev.plan, value, isConfirmed: true }
      };
    });
  }, []);

  // F/U 수정
  const handleFollowUpChange = useCallback((value: string) => {
    setChartData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        followUp: { ...prev.followUp, value, isConfirmed: true }
      };
    });
  }, []);

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

                {/* 🧪 테스트 버튼 (개발용) */}
                <Button
                  variant="outline"
                  onClick={handleTestSimulation}
                  disabled={isRecording && !isTestRunning || isRemoteRecording || isGeneratingChart}
                  className={`rounded-full h-10 px-4 shrink-0 gap-2 transition-all ${
                    isTestRunning 
                      ? 'border-red-400 text-red-600 bg-red-50 hover:bg-red-100' 
                      : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                  }`}
                  title="테스트 시뮬레이션"
                >
                  {isTestRunning ? '⏹️ 중지' : '🧪 테스트'}
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

          {/* Desktop: 3-Column Layout */}
          <div className="hidden lg:flex gap-4 h-[600px]">
            {/* 좌측: 대화창 (접을 수 있음) */}
            <div className={`transition-all duration-300 ${isTranscriptCollapsed ? 'w-12' : 'w-[280px]'} flex-none`}>
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
            <div className="flex-1 min-w-0">
              <ChartingResult
                chartData={chartData}
                isRecording={isRecording || isRemoteRecording}
                layout="wide"
                department={chartSettings.selectedDepartment}
                activeFields={chartSettings.activeFields}
              />
            </div>

            {/* 우측: A/P 패널 (고정) */}
            <div className="w-[320px] flex-none flex flex-col bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border-2 border-teal-200 shadow-sm overflow-hidden">
              {/* A/P Header */}
              <div className="flex-none px-4 py-3 border-b border-teal-200 bg-white/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-teal-800">Assessment & Plan</h3>
                    <p className="text-[10px] text-teal-600">
                      {(isRecording || isRemoteRecording) ? '실시간 업데이트' : '진단 및 계획'}
                    </p>
                  </div>
                </div>
              </div>

              {/* A/P Content */}
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

                {/* Plan (수정 가능) - 녹음 끝난 후에만 */}
                {!isRecording && !isRemoteRecording && chartData && (
                  <div className="bg-white rounded-xl p-3 border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 mb-1.5">Plan</div>
                    <textarea
                      value={typeof chartData?.plan?.value === 'string' ? chartData.plan.value : ''}
                      onChange={(e) => handlePlanChange(e.target.value)}
                      placeholder="치료 계획을 입력하세요"
                      className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                )}

                {/* F/U (수정 가능) - 녹음 끝난 후에만 */}
                {!isRecording && !isRemoteRecording && chartData && (
                  <div className="bg-white rounded-xl p-3 border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 mb-1.5">F/U</div>
                    <input
                      type="text"
                      value={typeof chartData?.followUp?.value === 'string' ? chartData.followUp.value : ''}
                      onChange={(e) => handleFollowUpChange(e.target.value)}
                      placeholder="f/u 1wk"
                      className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
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
          <div className="lg:hidden flex flex-col">
            {/* Tab Switcher */}
            <div className="flex gap-2 bg-white rounded-xl border border-slate-200 p-1.5 mb-4">
              <button
                onClick={() => setMobileTab('transcript')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
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
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  mobileTab === 'chart'
                    ? 'bg-teal-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                차트
              </button>
            </div>

            {/* Tab Content */}
            <div className={`${isMobileAPExpanded ? 'h-[200px]' : 'h-[350px]'} transition-all duration-300`}>
              {mobileTab === 'transcript' ? (
                <TranscriptViewer
                  finalTranscript={finalTranscript}
                  isRecording={isRecording || isRemoteRecording}
                  realtimeSegments={realtimeSegments}
                />
              ) : (
                <ChartingResult
                  chartData={chartData}
                  isRecording={isRecording || isRemoteRecording}
                  layout="compact"
                  department={chartSettings.selectedDepartment}
                  activeFields={chartSettings.activeFields}
                />
              )}
            </div>

            {/* Bottom A/P Panel */}
            <div className={`mt-4 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ${
              isMobileAPExpanded ? 'h-[280px]' : 'h-14'
            }`}>
              <button
                onClick={() => setIsMobileAPExpanded(!isMobileAPExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between text-white"
              >
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5" />
                  <div className="text-left">
                    <div className="text-sm font-semibold">Assessment & Plan</div>
                    {!isMobileAPExpanded && chartData?.assessment?.ddxList && (
                      <div className="text-[10px] opacity-80">
                        DDx {chartData.assessment.ddxList.filter(d => !d.isRemoved).length}개
                      </div>
                    )}
                  </div>
                </div>
                <ChevronUp className={`w-5 h-5 transition-transform ${isMobileAPExpanded ? '' : 'rotate-180'}`} />
              </button>
              
              {isMobileAPExpanded && (
                <div className="h-[calc(100%-56px)] bg-white/95 overflow-y-auto p-3">
                  {/* A/P 내용 미리보기 */}
                  <div className="space-y-2 text-sm">
                    {chartData?.diagnosisConfirmed?.value && (
                      <div className="p-2 bg-teal-100 rounded-lg">
                        <span className="font-bold text-teal-800"># {
                          Array.isArray(chartData.diagnosisConfirmed.value) 
                            ? chartData.diagnosisConfirmed.value.join(', ')
                            : chartData.diagnosisConfirmed.value
                        }</span>
                      </div>
                    )}
                    {chartData?.assessment?.ddxList?.filter(d => !d.isRemoved && !d.isConfirmed).map((ddx, i) => (
                      <div key={i} className="p-2 bg-amber-50 rounded-lg text-amber-800">
                        r/o {ddx.diagnosis}
                      </div>
                    ))}
                    {chartData?.plan?.value && (
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-700 whitespace-pre-wrap">
                        {typeof chartData.plan.value === 'string' ? chartData.plan.value : ''}
                      </div>
                    )}
                    {!chartData && (
                      <div className="text-center py-4 text-slate-400">
                        녹음 후 분석 결과가 표시됩니다
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Subscribe Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-5 lg:ml-auto lg:w-fit">
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
