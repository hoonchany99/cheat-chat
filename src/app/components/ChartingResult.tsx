import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';
import { 
  FileText, 
  Copy, 
  Check,
  Sparkles
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

  const hasAnyData = Object.keys(editableData).length > 0;

  // 통합 차트 텍스트 생성 (DDx 제외)
  const unifiedChartText = useMemo(() => {
    // DDx/Assessment 제외한 필드만
    const fieldsToShow = chartFields.filter(f => f.id !== 'assessment' && f.id !== 'diagnosisConfirmed');
    
    return fieldsToShow.map(field => {
      const fieldValue = editableData[field.id];
      if (!fieldValue) return null;
      
      // 타이핑 중인 필드는 displayedValue 사용
      const isTyping = currentTypingField === field.id;
      const rawValue = isTyping ? displayedValue : fieldValue.value;
      const displayValueStr = Array.isArray(rawValue) ? rawValue.join(', ') : safeStringValue(rawValue);
      
      if (!displayValueStr.trim()) return null;
      
      const fieldLabel = field.nameEn && field.nameEn !== field.name 
        ? `${field.nameEn} (${field.name})` 
        : field.name;
      
      return `[${fieldLabel}]\n${displayValueStr}`;
    }).filter(Boolean).join('\n\n');
  }, [chartFields, editableData, currentTypingField, displayedValue, safeStringValue]);

  // 통합 텍스트 변경 핸들러
  const handleUnifiedTextChange = useCallback((newText: string) => {
    // 텍스트를 파싱해서 각 필드에 매핑
    const sections = newText.split(/\n\n+/);
    const updates: ChartData = { ...editableData };
    
    sections.forEach(section => {
      const match = section.match(/^\[([^\]]+)\]\n?([\s\S]*)/);
      if (!match) return;
      
      const [, label, content] = match;
      // 라벨로 필드 찾기
      const field = chartFields.find(f => {
        const fieldLabel = f.nameEn && f.nameEn !== f.name 
          ? `${f.nameEn} (${f.name})` 
          : f.name;
        return fieldLabel === label;
      });
      
      if (field && updates[field.id]) {
        updates[field.id] = {
          ...updates[field.id],
          value: content.trim(),
          source: 'user' as const,
          isConfirmed: true
        };
      }
    });
    
    setEditableData(updates);
  }, [editableData, chartFields]);

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
          
          {/* Content - 통합 텍스트 뷰 */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-3">
              {/* 통합 차트 텍스트 영역 */}
              <div className="relative">
                {currentTypingField && (
                  <div className="absolute top-2 right-2 z-10">
                    <span className="text-[10px] text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI 작성 중...
                    </span>
                  </div>
                )}
                <Textarea
                  value={unifiedChartText}
                  onChange={(e) => handleUnifiedTextChange(e.target.value)}
                  className={`min-h-[400px] text-sm bg-white border-slate-200 font-mono whitespace-pre-wrap leading-relaxed resize-none ${
                    currentTypingField ? 'border-teal-300 ring-2 ring-teal-100' : ''
                  }`}
                  placeholder={`[Chief Complaint (C/C)]\n환자의 주호소\n\n[History of Present Illness (HPI)]\n현병력\n\n[Vital Signs (V/S)]\nBP, HR, BT...`}
                  readOnly={!!currentTypingField}
                />
                {currentTypingField && (
                  <div className="absolute bottom-2 right-2">
                    <span className="typing-cursor text-teal-500"></span>
                  </div>
                )}
              </div>
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
        
        {/* Content - 통합 텍스트 뷰 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* 통합 차트 텍스트 영역 */}
            <div className="relative">
              {currentTypingField && (
                <div className="absolute top-2 right-2 z-10">
                  <span className="text-[10px] text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI 작성 중...
                  </span>
                </div>
              )}
              <Textarea
                value={unifiedChartText}
                onChange={(e) => handleUnifiedTextChange(e.target.value)}
                className={`min-h-[300px] text-sm bg-white border-slate-200 font-mono whitespace-pre-wrap leading-relaxed resize-none ${
                  currentTypingField ? 'border-teal-300 ring-2 ring-teal-100' : ''
                }`}
                placeholder={`[Chief Complaint (C/C)]\n환자의 주호소\n\n[History of Present Illness (HPI)]\n현병력\n\n[Vital Signs (V/S)]\nBP, HR, BT...`}
                readOnly={!!currentTypingField}
              />
              {currentTypingField && (
                <div className="absolute bottom-2 right-2">
                  <span className="typing-cursor text-teal-500"></span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
