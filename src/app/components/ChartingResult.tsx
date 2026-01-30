import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';
import { 
  FileText, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Edit3
} from 'lucide-react';
import { ChartField, DdxItem, ChartFieldValue, DEFAULT_FIELDS, DEPARTMENT_PRESETS } from '@/services/chartService';

export type { DdxItem, ChartFieldValue };

// 차트 애니메이션 스타일
const chartAnimationStyles = `
  @keyframes chartSlideDown {
    from { opacity: 0; max-height: 0; transform: translateY(-8px); }
    to { opacity: 1; max-height: 500px; transform: translateY(0); }
  }
  
  @keyframes fieldHighlight {
    0% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(20, 184, 166, 0.2); }
    100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0); }
  }
  
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  .chart-details-animate {
    animation: chartSlideDown 0.3s ease-out forwards;
    overflow: hidden;
  }
  
  .field-typing {
    animation: fieldPulse 0.6s ease-in-out infinite;
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.3), 0 0 20px rgba(20, 184, 166, 0.2);
  }
  
  @keyframes fieldPulse {
    0%, 100% { 
      box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.3), 0 0 20px rgba(20, 184, 166, 0.2);
    }
    50% { 
      box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.5), 0 0 25px rgba(20, 184, 166, 0.3);
    }
  }
  
  @keyframes cursorBlink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  
  .typing-cursor::after {
    content: '▋';
    animation: cursorBlink 0.5s step-end infinite;
    color: #14b8a6;
    font-weight: bold;
    margin-left: 2px;
  }
  
  @keyframes cursorBlink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  
  .chart-shimmer {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
`;

// Field placeholders (description + example)
const FIELD_PLACEHOLDERS: Record<string, string> = {
  chiefComplaint: "Patient's main complaint. e.g., LOC since this morning",
  historyOfPresentIllness: "Narrative of present illness. e.g., Pt developed LOC this AM after BM.",
  pertinentROS: "Relevant symptoms. e.g., N/V(-), LOC(+), fever(-)",
  pastMedicalHistory: "Past medical history. e.g., DM (since childhood), HTN (x3y)",
  pastSurgicalHistory: "Surgical history. e.g., s/p appendectomy (2020)",
  medications: "Current medications. e.g., metformin 500mg bid",
  allergies: "Drug allergies. e.g., None, PCN",
  socialHistory: "Social history. e.g., Smoking (-), Alcohol (-)",
  familyHistory: "Family history. e.g., Father: DM, Mother: HTN",
  vitalSigns: "Vital signs. e.g., BP 120/80, HR 72, BT 36.5",
  physicalExam: "Physical exam findings. e.g., Mental status: drowsy",
  labResults: "Lab results. e.g., WBC 12.0, Hgb 14.2",
  imaging: "Imaging findings. e.g., CXR - no infiltrate",
  plan: "Treatment plan and orders. e.g., Blood glucose, Brain CT",
  followUp: "Follow-up plan. e.g., f/u 1wk",
  notes: "Additional notes",
  // Internal medicine
  problemList: "Problem list. e.g., 1) DM 2) HTN",
  // Dermatology
  lesionDescription: "Lesion morphology. e.g., erythematous papules on trunk",
};

// Assessment 필드 ID (DDx 패널에서만 처리, 차트에서는 제외)
// Plan과 F/U는 AI 차트에서 표시
const AP_FIELDS = ['assessment', 'diagnosisConfirmed'];

export interface ChartData {
  [key: string]: ChartFieldValue;
}

interface ChartingResultProps {
  chartData: ChartData | null;
  isRecording: boolean;
  /** 'compact': 기본, 'wide': 3열 레이아웃용 (내부 2열) */
  layout?: 'compact' | 'wide';
  /** 선택된 과 ID */
  department?: string;
  /** 사용자 커스텀 필드 (차트 설정에서 수정된 필드) */
  activeFields?: ChartField[];
}

// Diff 기반 타이핑 애니메이션 타입
interface TypingTask {
  fieldId: string;
  oldValue: string;
  newValue: string;
  commonPrefixLen: number;
}

export function ChartingResult({
  chartData,
  isRecording,
  layout = 'compact',
  department = 'general',
  activeFields
}: ChartingResultProps) {
  const [editableData, setEditableData] = useState<ChartData>({});
  const [isCopied, setIsCopied] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // Diff 기반 타이핑 애니메이션 상태
  const [currentTypingField, setCurrentTypingField] = useState<string | null>(null);
  const [displayedValue, setDisplayedValue] = useState<string>('');
  const previousValuesRef = useRef<Record<string, string>>({});
  const targetValuesRef = useRef<Record<string, string>>({});
  const typingQueueRef = useRef<TypingTask[]>([]);
  const isProcessingRef = useRef(false);
  const animationRef = useRef<number | null>(null);
  
  // 타이핑 속도 (ms per character)
  const ERASE_SPEED = 12;
  const TYPE_SPEED = 20;

  // 사용자 커스텀 필드가 있으면 사용, 없으면 과별 기본 필드
  const baseFields = useMemo(() => {
    if (activeFields && activeFields.length > 0) {
      return activeFields;
    }
    const preset = DEPARTMENT_PRESETS.find(p => p.id === department);
    return preset?.fields || DEFAULT_FIELDS;
  }, [department, activeFields]);

  // 차트 필드 (A/P 제외) vs A/P 필드 분리
  const { chartFields, apFields } = useMemo(() => {
    const chart = baseFields.filter(f => !AP_FIELDS.includes(f.id));
    const ap = baseFields.filter(f => AP_FIELDS.includes(f.id));
    return { chartFields: chart, apFields: ap };
  }, [baseFields]);

  // 값을 안전하게 문자열로 변환
  const safeStringValue = useCallback((val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.filter(v => typeof v === 'string').join(', ');
    if (typeof val === 'object') return ''; // 객체는 빈 문자열
    return String(val);
  }, []);

  // 공통 prefix 길이 계산
  const getCommonPrefixLength = useCallback((str1: string, str2: string): number => {
    let i = 0;
    const minLen = Math.min(str1.length, str2.length);
    while (i < minLen && str1[i] === str2[i]) {
      i++;
    }
    return i;
  }, []);

  // Diff 기반 타이핑 애니메이션 처리
  const processTypingAnimation = useCallback((task: TypingTask) => {
    const { fieldId, oldValue, newValue, commonPrefixLen } = task;
    
    // 같은 값이면 스킵 (안전장치)
    if (oldValue === newValue) {
      console.log(`⏭️ 같은 값, 스킵: ${fieldId}`);
      previousValuesRef.current[fieldId] = newValue;
      targetValuesRef.current[fieldId] = newValue;
      isProcessingRef.current = false;
      processNextInQueue();
      return;
    }
    
    const commonPrefix = newValue.substring(0, commonPrefixLen);
    const toErase = oldValue.substring(commonPrefixLen);
    const toType = newValue.substring(commonPrefixLen);
    
    let currentText = oldValue;
    let eraseIndex = toErase.length;
    let typeIndex = 0;
    let phase: 'erase' | 'type' | 'done' = toErase.length > 0 ? 'erase' : 'type';
    
    // 해당 필드로 스크롤
    const fieldEl = fieldRefs.current[fieldId];
    if (fieldEl) {
      fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    setCurrentTypingField(fieldId);
    setDisplayedValue(oldValue);
    
    const animate = () => {
      if (phase === 'erase') {
        if (eraseIndex > 0) {
          eraseIndex--;
          currentText = commonPrefix + toErase.substring(0, eraseIndex);
          setDisplayedValue(currentText);
          animationRef.current = window.setTimeout(animate, ERASE_SPEED);
        } else {
          phase = 'type';
          currentText = commonPrefix;
          setDisplayedValue(currentText);
          if (toType.length > 0) {
            animationRef.current = window.setTimeout(animate, TYPE_SPEED);
          } else {
            phase = 'done';
            animationRef.current = window.setTimeout(animate, 0);
          }
        }
      } else if (phase === 'type') {
        if (typeIndex < toType.length) {
          typeIndex++;
          currentText = commonPrefix + toType.substring(0, typeIndex);
          setDisplayedValue(currentText);
          animationRef.current = window.setTimeout(animate, TYPE_SPEED);
        } else {
          phase = 'done';
          animationRef.current = window.setTimeout(animate, 0);
        }
      } else {
        // 완료
        setCurrentTypingField(null);
        setDisplayedValue('');
        
        // editableData 업데이트
        setEditableData(prev => {
          const currentFieldValue = prev[fieldId];
          if (currentFieldValue) {
            return {
              ...prev,
              [fieldId]: { ...currentFieldValue, value: newValue }
            };
          }
          return prev;
        });
        
        // previousValues 업데이트
        previousValuesRef.current[fieldId] = newValue;
        targetValuesRef.current[fieldId] = newValue;
        
        // 다음 태스크
        isProcessingRef.current = false;
        processNextInQueue();
      }
    };
    
    animate();
  }, []);

  // 큐에서 다음 태스크 처리
  const processNextInQueue = useCallback(() => {
    if (isProcessingRef.current) return;
    if (typingQueueRef.current.length === 0) return;
    
    const task = typingQueueRef.current.shift();
    if (!task) return;
    
    isProcessingRef.current = true;
    processTypingAnimation(task);
  }, [processTypingAnimation]);

  // 문자열 정규화 (의미 유지 + 동의 표현 축약)
  const normalizeString = useCallback((str: string): string => {
    return str
      .replace(/\s+/g, ' ')
      .replace(/\bNausea\b/gi, 'N/V')
      .replace(/\bVomiting\b/gi, 'N/V')
      .replace(/\bN\/V\b/gi, 'N/V')
      .replace(/\bthis\s+morning\b/gi, 'today AM')
      .replace(/\btoday\s+morning\b/gi, 'today AM')
      .replace(/\b금일\s+아침\b/g, '오늘 아침')
      .replace(/\b오늘\s+아침\b/g, '오늘 아침')
      .trim();
  }, []);

  // chartData가 비워질 때 내부 상태 초기화
  useEffect(() => {
    if (chartData) return;
    setEditableData({});
    setExpandedFields(new Set());
    setExpandedDDx(new Set());
    setCurrentTypingField(null);
    setDisplayedValue('');
    previousValuesRef.current = {};
    targetValuesRef.current = {};
    typingQueueRef.current = [];
  }, [chartData]);

  // 데이터 변경 시 diff 감지 및 애니메이션
  useEffect(() => {
    if (!chartData) return;
    
    const safeData: ChartData = {};
    const newTasks: TypingTask[] = [];
    
    Object.keys(chartData).forEach(fieldId => {
      const fieldValue = chartData[fieldId];
      if (!fieldValue) return;
      
      const rawValue = fieldValue.value;
      const newValue = safeStringValue(
        typeof rawValue === 'object' && !Array.isArray(rawValue) ? '' : rawValue
      );
      
      // 이전 값
      const oldValue = previousValuesRef.current[fieldId] || '';
      const lastTarget = targetValuesRef.current[fieldId] || oldValue;
      
      // 정규화된 비교 (모든 공백 정규화)
      const normalizedOld = normalizeString(oldValue);
      const normalizedNew = normalizeString(newValue);
      
      // 실제로 다른 경우에만 애니메이션
      // 길이가 같고 내용도 같으면 스킵 (더 엄격한 비교)
      const isDifferent = normalizedNew !== normalizedOld;
      const hasContent = normalizedNew.length > 0;

      // 같은 타깃 값이면 애니메이션만 스킵 (중복 애니메이션 방지)
      const isSameTarget = hasContent && normalizedNew === lastTarget;

      // 길이가 줄어드는 업데이트는 무시 (쓰다 지웠다 방지)
      if (hasContent && normalizedNew.length < lastTarget.length) {
        return;
      }
      
      if (isDifferent && hasContent && !isSameTarget) {
        const commonPrefixLen = getCommonPrefixLength(normalizedOld, normalizedNew);
        
        // 공통 prefix 이후 실제 변경량 계산
        const oldAfterPrefix = normalizedOld.length - commonPrefixLen;
        const newAfterPrefix = normalizedNew.length - commonPrefixLen;
        const totalChange = oldAfterPrefix + newAfterPrefix;
        
        // 최소 5자 이상 변경됐을 때만 애니메이션 (사소한 변경 무시)
        if (totalChange >= 5) {
          // 이미 큐에 있으면 newValue만 업데이트
          const existingIndex = typingQueueRef.current.findIndex(t => t.fieldId === fieldId);
          if (existingIndex >= 0) {
            typingQueueRef.current[existingIndex].newValue = normalizedNew;
            typingQueueRef.current[existingIndex].commonPrefixLen = getCommonPrefixLength(
              typingQueueRef.current[existingIndex].oldValue,
              normalizedNew
            );
            targetValuesRef.current[fieldId] = normalizedNew;
          } else {
            console.log(`📝 애니메이션 추가: ${fieldId} (변경: ${totalChange}자)`);
            newTasks.push({
              fieldId,
              oldValue: normalizedOld,
              newValue: normalizedNew,
              commonPrefixLen
            });
            targetValuesRef.current[fieldId] = normalizedNew;
          }
        } else {
          // 사소한 변경은 바로 적용
          previousValuesRef.current[fieldId] = normalizedNew;
          targetValuesRef.current[fieldId] = normalizedNew;
        }
      } else {
        // 같으면 previousValues 확인 (이미 본 값)
        if (normalizedNew.length > 0) {
          previousValuesRef.current[fieldId] = normalizedNew;
          targetValuesRef.current[fieldId] = normalizedNew;
        }
      }
      
      // safeData 구성
      safeData[fieldId] = {
        ...fieldValue,
        value: newValue
      };
    });
    
    // 새 태스크 큐에 추가
    typingQueueRef.current.push(...newTasks);
    
    // 애니메이션 중이 아닌 필드는 즉시 업데이트
    setEditableData(prev => {
      const updated = { ...prev };
      Object.keys(safeData).forEach(fieldId => {
        const isInQueue = typingQueueRef.current.some(t => t.fieldId === fieldId);
        const isTyping = currentTypingField === fieldId;
        
        if (!isInQueue && !isTyping) {
          updated[fieldId] = safeData[fieldId];
          // previousValues는 위에서 이미 처리됨 (normalizeString 사용)
        }
      });
      return updated;
    });
    
    // 큐 처리 시작
    processNextInQueue();
  }, [chartData, safeStringValue, normalizeString, getCommonPrefixLength, processNextInQueue, currentTypingField]);

  // 컴포넌트 언마운트 시 애니메이션 정리
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  const handleFieldChange = useCallback((fieldId: string, value: string | string[]) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        value,
        isConfirmed: true,
        source: 'user' as any, // 사용자가 수정함
      }
    }));
  }, []);

  // DDx 핸들러들
  const handleConfirmDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isConfirmed: true } : item
      );
      
      const confirmedDdx = updatedDdxList.find(item => item.id === ddxId);
      const currentConfirmed = prev.diagnosisConfirmed?.value || [];
      const confirmedArray = Array.isArray(currentConfirmed) ? currentConfirmed : [currentConfirmed].filter(Boolean);
      
      return {
        ...prev,
        assessment: { ...assessment, ddxList: updatedDdxList },
        diagnosisConfirmed: {
          value: confirmedDdx ? [...confirmedArray, confirmedDdx.diagnosis] : confirmedArray,
          isConfirmed: true,
          source: 'stated' as const,
        }
      };
    });
    toast.success('진단이 확정되었습니다');
  }, []);

  const handleRemoveDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isRemoved: true } : item
      );
      return { ...prev, assessment: { ...assessment, ddxList: updatedDdxList } };
    });
    toast.info('DDx가 제외되었습니다');
  }, []);

  const handleRestoreDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isRemoved: false } : item
      );
      return { ...prev, assessment: { ...assessment, ddxList: updatedDdxList } };
    });
    toast.success('DDx가 복구되었습니다');
  }, []);

  const handleUnconfirmDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      
      const targetDdx = assessment.ddxList.find(item => item.id === ddxId);
      if (!targetDdx) return prev;
      
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isConfirmed: false } : item
      );
      
      const currentConfirmed = prev.diagnosisConfirmed?.value || [];
      const confirmedArray = Array.isArray(currentConfirmed) ? currentConfirmed : [currentConfirmed].filter(Boolean);
      const filteredConfirmed = confirmedArray.filter(dx => dx !== targetDdx.diagnosis);
      
      return {
        ...prev,
        assessment: { ...assessment, ddxList: updatedDdxList },
        diagnosisConfirmed: { ...prev.diagnosisConfirmed, value: filteredConfirmed, isConfirmed: filteredConfirmed.length > 0 }
      };
    });
    toast.info('확정이 취소되었습니다');
  }, []);

  const [expandedDDx, setExpandedDDx] = useState<Set<string>>(new Set());
  
  const toggleDDxDetails = useCallback((ddxId: string) => {
    setExpandedDDx(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ddxId)) newSet.delete(ddxId);
      else newSet.add(ddxId);
      return newSet;
    });
  }, []);

  const toggleFieldDetails = useCallback((fieldId: string) => {
    setExpandedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) newSet.delete(fieldId);
      else newSet.add(fieldId);
      return newSet;
    });
  }, []);

  // 복사 핸들러
  const handleCopyChart = useCallback(() => {
    const allFields = [...chartFields, ...apFields];
    
    // DDx 리스트 가져오기
    const ddxList = (chartData as any)?.assessment?.ddxList;
    const allDdx = ddxList && Array.isArray(ddxList) 
      ? ddxList.filter((d: DdxItem) => !d.isRemoved)
      : [];
    
    // 확정된 Dx와 r/o 분리
    const confirmedDx = allDdx.filter((d: DdxItem) => d.isConfirmed);
    const roDdx = allDdx.filter((d: DdxItem) => !d.isConfirmed);
    
    const chartText = allFields.map(field => {
      const fieldValue = editableData[field.id];
      
      // Assessment 필드는 DDx 리스트로 대체
      if (field.id === 'assessment') {
        const dxLines = confirmedDx.map((d: DdxItem) => `# ${d.diagnosis}`).join('\n');
        const roLines = roDdx.map((d: DdxItem) => `r/o ${d.diagnosis}`).join('\n');
        const displayValue = [dxLines, roLines].filter(Boolean).join('\n');
        
        if (!displayValue) return null;
        
        const fieldLabel = field.nameEn && field.nameEn !== field.name ? field.nameEn : field.name;
        return `[${fieldLabel}]\n${displayValue}`;
      }
      
      // diagnosisConfirmed 필드는 스킵 (Assessment에 이미 포함됨)
      if (field.id === 'diagnosisConfirmed') return null;
      
      if (!fieldValue) return null;
      
      const value = fieldValue.value;
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      if (!displayValue) return null;
      
      const fieldLabel = field.nameEn && field.nameEn !== field.name ? field.nameEn : field.name;
      return `[${fieldLabel}]\n${displayValue}`;
    }).filter(Boolean).join('\n\n');
      
    navigator.clipboard.writeText(chartText);
    setIsCopied(true);
    toast.success('차트가 클립보드에 복사되었습니다');
    setTimeout(() => setIsCopied(false), 2000);
  }, [editableData, chartFields, apFields, chartData]);

  // DDx 리스트 렌더링
  const renderDDxList = (ddxList: DdxItem[]) => {
    const qualifiedItems = ddxList.filter(item => item.confidence === 'high' || item.confidence === 'medium');
    const sortedItems = [...qualifiedItems].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.confidence] - order[b.confidence];
    }).slice(0, 5);
    
    const visibleItems = sortedItems.filter(item => !item.isRemoved);
    const removedItems = sortedItems.filter(item => item.isRemoved);
    
    if (visibleItems.length === 0 && removedItems.length === 0) {
      return <div className="text-xs text-slate-400 italic mt-2">DDx가 없습니다.</div>;
    }

    return (
      <div className="space-y-1.5 mt-2">
        {visibleItems.map((item) => {
          const isExpanded = expandedDDx.has(item.id);
          return (
            <div key={item.id} className={`rounded-lg p-2 text-xs ${item.isConfirmed ? 'bg-teal-50 border border-teal-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {item.isConfirmed ? <CheckCircle2 className="w-3 h-3 text-teal-600" /> : <AlertCircle className="w-3 h-3 text-amber-600" />}
                  <span className={`font-medium ${item.isConfirmed ? 'text-teal-800' : 'text-amber-800'}`}>r/o {item.diagnosis}</span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${item.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {item.confidence === 'high' ? '높음' : '중간'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {!item.isConfirmed ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleConfirmDDx(item.id)} className="h-5 text-[10px] px-1.5 border-teal-300 text-teal-700 bg-white">확정</Button>
                      <Button variant="outline" size="sm" onClick={() => handleRemoveDDx(item.id)} className="h-5 text-[10px] px-1.5 border-slate-300 text-slate-500 bg-white">제외</Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleUnconfirmDDx(item.id)} className="h-5 text-[10px] px-1.5 border-slate-300 text-slate-500 bg-white">취소</Button>
                  )}
                </div>
              </div>
              {item.reason && (
                <button onClick={() => toggleDDxDetails(item.id)} className="text-[10px] text-slate-500 mt-1 flex items-center gap-0.5 hover:text-slate-700">
                  {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                  {isExpanded ? '닫기' : '근거'}
                </button>
              )}
              {isExpanded && item.reason && (
                <div className="mt-1 p-1.5 bg-white/60 rounded text-[10px] text-slate-600">{item.reason}</div>
              )}
            </div>
          );
        })}
        {removedItems.length > 0 && (
          <div className="pt-1.5 border-t border-dashed border-slate-200">
            {removedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-1.5 text-[10px] opacity-50 hover:opacity-100">
                <span className="text-slate-500 line-through">r/o {item.diagnosis}</span>
                <Button variant="ghost" size="sm" onClick={() => handleRestoreDDx(item.id)} className="h-4 text-[10px] px-1 text-slate-500">복구</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 필드 렌더링
  const renderField = (field: ChartField, compact: boolean = false) => {
    const fieldValue = editableData[field.id];
    const value = fieldValue?.value ?? '';
    const isConfirmed = fieldValue?.isConfirmed ?? false;
    const source = fieldValue?.source ?? 'stated';
    const isInferred = source === 'inferred';
    const rationale = fieldValue?.rationale;
    const evidence = fieldValue?.evidence || [];
    const isExpanded = expandedFields.has(field.id);
    
    // 현재 이 필드가 타이핑 중인지 확인
    const isTyping = currentTypingField === field.id;

    const isArray = field.type === 'tags' || field.type === 'list';
    
    // 타이핑 중이면 displayedValue 사용, 아니면 실제 값 사용
    const stringValue = isTyping ? displayedValue : safeStringValue(value);
    
    const hasContent = isArray 
      ? (Array.isArray(value) ? value.length > 0 : stringValue.length > 0)
      : stringValue.trim().length > 0;
    const hasDetails = isInferred && (rationale || evidence.length > 0);

    // 타이핑 중이면 특별한 스타일 적용
    const bgClass = isTyping
      ? 'bg-teal-50/70 border-2 border-teal-400 field-typing'
      : !hasContent
        ? 'bg-slate-50/50 border border-dashed border-slate-200'
        : isInferred
          ? 'bg-amber-50/50 border border-amber-200'
          : 'bg-teal-50/50 border border-teal-200';

    return (
      <div 
        key={field.id}
        ref={(el) => { fieldRefs.current[field.id] = el; }}
        className={`rounded-lg ${compact ? 'p-2' : 'p-3'} transition-all duration-300 ${bgClass}`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <label className={`${compact ? 'text-xs' : 'text-sm'} font-semibold flex items-center gap-1.5`}>
            <span className="text-slate-800">
              {field.nameEn && field.nameEn !== field.name ? `${field.nameEn} (${field.name})` : field.name}
            </span>
            {field.required && <span className="text-red-500">*</span>}
            {isTyping && (
              <span className="text-[10px] text-teal-600 animate-pulse ml-1">작성 중...</span>
            )}
          </label>

          <div className="flex items-center gap-1.5">
            {hasContent && !isTyping && (
              <span className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                source === 'user' ? 'bg-blue-100 text-blue-700' : isInferred ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {source === 'user' ? <><Edit3 className="w-2.5 h-2.5" />사용자 작성</> : isInferred ? <><Sparkles className="w-2.5 h-2.5" />AI 추천</> : <><MessageCircle className="w-2.5 h-2.5" />대화 기반</>}
              </span>
            )}
          </div>
        </div>

        {hasContent && hasDetails && !isTyping && (
          <button onClick={() => toggleFieldDetails(field.id)} className="text-[10px] text-amber-600 mb-1.5 flex items-center gap-0.5 hover:text-amber-700">
            <Sparkles className="w-2.5 h-2.5" />
            {isExpanded ? '닫기' : '근거'}
          </button>
        )}

        {hasContent && hasDetails && isExpanded && !isTyping && (
          <div className="chart-details-animate mb-2 p-2 bg-white/60 rounded text-[10px] space-y-1">
            {rationale && <div><span className="text-slate-500">근거:</span> <span className="text-slate-700">{rationale}</span></div>}
            {evidence.length > 0 && <div><span className="text-slate-500">인용:</span> {evidence.map((e, i) => <span key={i} className="text-slate-600 italic"> "{e}"</span>)}</div>}
          </div>
        )}

        {isArray ? (
          (() => {
            const arrayValue = isTyping ? displayedValue : safeStringValue(value);
            const parsedTags = arrayValue.split(',').map(s => s.trim()).filter(s => s);
            return (
              <>
                {parsedTags.length > 0 && !isTyping && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {parsedTags.map((item, index) => (
                      <Badge key={index} variant="secondary" className={`text-[10px] ${isConfirmed || !isInferred ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>{item}</Badge>
                    ))}
                  </div>
                )}
                {isTyping ? (
                  <div className={`${compact ? 'min-h-[40px] text-xs' : 'min-h-[50px] text-sm'} p-2 bg-white border border-teal-300 rounded-md whitespace-pre-wrap`}>
                    <span>{displayedValue}</span>
                    <span className="typing-cursor"></span>
                  </div>
                ) : (
                  <Textarea 
                    value={arrayValue} 
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    className={`${compact ? 'min-h-[40px] text-xs' : 'min-h-[50px] text-sm'} bg-white border-slate-200 whitespace-pre-wrap`}
                    placeholder={FIELD_PLACEHOLDERS[field.id] || ""} 
                  />
                )}
              </>
            );
          })()
        ) : field.type === 'text' ? (
          isTyping ? (
            <div className={`p-2 bg-white border border-teal-300 rounded-md ${compact ? 'text-xs h-7' : 'text-sm'}`}>
              <span>{displayedValue}</span>
              <span className="typing-cursor"></span>
            </div>
          ) : (
            <Input 
              value={stringValue} 
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={FIELD_PLACEHOLDERS[field.id] || ""}
              className={`bg-white border-slate-200 ${compact ? 'text-xs h-7' : 'text-sm'}`}
            />
          )
        ) : (
          isTyping ? (
            <div className={`${compact ? 'min-h-[40px] text-xs' : 'min-h-[60px] text-sm'} p-2 bg-white border border-teal-300 rounded-md whitespace-pre-wrap`}>
              <span>{displayedValue}</span>
              <span className="typing-cursor"></span>
            </div>
          ) : (
            <Textarea 
              value={stringValue} 
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              className={`${compact ? 'min-h-[40px] text-xs' : 'min-h-[60px] text-sm'} bg-white border-slate-200 whitespace-pre-wrap`}
              placeholder={FIELD_PLACEHOLDERS[field.id] || ""}
            />
          )
        )}

        {field.id === 'assessment' && fieldValue?.ddxList && fieldValue.ddxList.length > 0 && renderDDxList(fieldValue.ddxList)}
      </div>
    );
  };

  const hasAnyData = Object.keys(editableData).length > 0;

  // Wide 레이아웃 (데스크톱 3열용 - AI 차트만, A/P는 별도 패널)
  if (layout === 'wide') {
    return (
      <>
        <style>{chartAnimationStyles}</style>
        <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-none px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800">AI 차트</h3>
                  <p className="text-[10px] text-slate-500">
                    {isRecording ? '실시간 업데이트' : 'Subjective & Objective'}
                  </p>
                </div>
              </div>
              {hasAnyData && (
                <Button variant="outline" size="sm" onClick={handleCopyChart} className="h-7 text-xs border-teal-200 text-teal-700 hover:bg-teal-50">
                  {isCopied ? <><Check className="w-3 h-3 mr-1" />복사됨</> : <><Copy className="w-3 h-3 mr-1" />EMR 복사</>}
                </Button>
              )}
            </div>
          </div>
          
          {/* Content - 스크롤 가능 */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-2">
              {chartFields.map(field => renderField(field, false))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Compact 레이아웃 (기본, 모바일 - A/P 제외, 하단 패널에서 표시)
  return (
    <>
      <style>{chartAnimationStyles}</style>
      
      <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-none px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">AI 차트</h3>
                <p className="text-[10px] text-slate-500">
                  {isRecording ? '실시간 업데이트' : 'S/O 필드'}
                </p>
              </div>
            </div>
            {hasAnyData && (
              <Button variant="outline" size="sm" onClick={handleCopyChart} className="h-7 text-xs border-teal-200 text-teal-700 hover:bg-teal-50">
                {isCopied ? <><Check className="w-3 h-3 mr-1" />복사됨</> : <><Copy className="w-3 h-3 mr-1" />EMR 복사</>}
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-2">
            {chartFields.map(field => renderField(field, false))}
          </div>
        </div>
      </div>
    </>
  );
}
