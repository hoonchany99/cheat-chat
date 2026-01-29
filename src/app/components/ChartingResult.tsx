import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge } from '@/app/components/ui/badge';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  FileText, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ChartField, DEPARTMENT_PRESETS, DdxItem, ChartFieldValue, DEFAULT_FIELDS } from '@/services/chartService';

// ChartData는 여기서 export (chartService의 타입 활용)
export type { DdxItem, ChartFieldValue };

// 차트 애니메이션 스타일
const chartAnimationStyles = `
  @keyframes chartFieldFadeIn {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes chartSlideDown {
    from {
      opacity: 0;
      max-height: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      max-height: 500px;
      transform: translateY(0);
    }
  }
  
  @keyframes chartPulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
    }
  }
  
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
  
  @keyframes typewriter {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }
  
  @keyframes blink {
    0%, 50% {
      border-color: transparent;
    }
    51%, 100% {
      border-color: #14b8a6;
    }
  }
  
  @keyframes fieldHighlight {
    0% {
      box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.4);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(20, 184, 166, 0.2);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(20, 184, 166, 0);
    }
  }
  
  .chart-field-animate {
    animation: chartFieldFadeIn 0.4s ease-out forwards;
    opacity: 0;
  }
  
  .chart-details-animate {
    animation: chartSlideDown 0.3s ease-out forwards;
    overflow: hidden;
  }
  
  .chart-badge-animate {
    animation: chartPulse 0.3s ease-out;
  }
  
  .chart-shimmer {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
  
  .field-typing {
    animation: fieldHighlight 1.5s ease-out;
  }
  
  .typing-cursor::after {
    content: '|';
    animation: blink 0.8s step-end infinite;
    color: #14b8a6;
    font-weight: bold;
  }
`;

// 필드별 placeholder (영어 설명 + 예시)
const FIELD_PLACEHOLDERS: Record<string, string> = {
  // S - Subjective
  chiefComplaint: "Main symptom in patient's words (e.g., 가슴이 아파요, 머리가 아파요)",
  historyOfPresentIllness: "Detailed illness history: onset, duration, severity, progression",
  pertinentROS: "Review of systems (e.g., N/V(-), fever(-), CP(-), SOB(-))",
  
  // History
  pastMedicalHistory: "Past diagnoses (e.g., HTN, DM, asthma, CAD)",
  pastSurgicalHistory: "Surgical history (e.g., s/p appendectomy, s/p CABG)",
  medications: "Current medications (e.g., metformin 500mg, lisinopril 10mg)",
  allergies: "Drug/food allergies (e.g., PCN, shellfish) or NKDA",
  socialHistory: "Lifestyle (e.g., smoking 1ppd x 10yrs, EtOH social, retired)",
  familyHistory: "Family history (e.g., father-MI at 55, mother-DM)",
  
  // O - Objective
  vitalSigns: "Vital signs (e.g., BP 120/80, HR 72, BT 36.8, RR 16, SpO2 98%)",
  physicalExam: "Physical exam findings (e.g., lungs clear, RRR, soft NT abdomen)",
  labResults: "Lab results (e.g., WBC 12.0, Hgb 14.2, Cr 1.0, Trop <0.01)",
  imaging: "Imaging findings (e.g., CXR-no infiltrate, CT-no acute findings)",
  
  // A - Assessment
  assessment: "[Summary]\nBrief clinical summary\n\n[Provider Impression]\nOrders-based impression only",
  diagnosisConfirmed: "Confirmed Dx - DDx 확정 시 자동 추가 (e.g., pneumonia, CHF)",
  
  // P - Plan
  plan: "[Orders]\n- Specific orders only\n\n[AI Suggestions]\n- Optional AI recommendations",
  followUp: "Follow-up if discussed (e.g., f/u 1wk, PCP in 3d, RTC if worse)",
  
  // Other
  notes: "Additional notes or comments",
  problemList: "Problem list (e.g., 1) Acute bronchitis 2) HTN - controlled)",
  lesionDescription: "Lesion morphology/distribution (e.g., erythematous papules on trunk)",
};

// Assessment/Plan을 제외한 기본 필드 순서
const SUBJECTIVE_FIELDS = ['chiefComplaint', 'historyOfPresentIllness', 'pertinentROS'];
const HISTORY_FIELDS = ['pastMedicalHistory', 'pastSurgicalHistory', 'medications', 'allergies', 'socialHistory', 'familyHistory'];
const OBJECTIVE_FIELDS = ['vitalSigns', 'physicalExam', 'labResults', 'imaging'];
const ASSESSMENT_FIELDS = ['assessment', 'diagnosisConfirmed'];
const PLAN_FIELDS = ['plan', 'followUp', 'notes'];

export interface ChartData {
  [key: string]: ChartFieldValue;
}

interface ChartingResultProps {
  chartData: ChartData | null;
  isGenerating: boolean;
  recordingProgress: number;
  isRecording: boolean;
}

export function ChartingResult({
  chartData,
  isGenerating,
  isRecording
}: ChartingResultProps) {
  const [editableData, setEditableData] = useState<ChartData>({});
  const [isCopied, setIsCopied] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [typingFields, setTypingFields] = useState<Set<string>>(new Set()); // 타이핑 애니메이션 중인 필드
  const [previousValues, setPreviousValues] = useState<Record<string, string>>({}); // 이전 값 추적
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 기본 빈 양식 필드 (항상 표시)
  const baseFields = useMemo(() => {
    const allFields: ChartField[] = [];
    DEPARTMENT_PRESETS.forEach(preset => {
      preset.fields.forEach(field => {
        if (!allFields.find(f => f.id === field.id)) {
          allFields.push(field);
        }
      });
    });
    return allFields.length > 0 ? allFields : DEFAULT_FIELDS;
  }, []);

  // 필드를 섹션별로 분류
  const { subjectiveFields, historyFields, objectiveFields, assessmentFields, planFields, otherFields } = useMemo(() => {
    const fieldMap = new Map(baseFields.map(f => [f.id, f]));
    
    const getFields = (ids: string[]) => ids.map(id => fieldMap.get(id)).filter(Boolean) as ChartField[];
    
    const knownIds = new Set([...SUBJECTIVE_FIELDS, ...HISTORY_FIELDS, ...OBJECTIVE_FIELDS, ...ASSESSMENT_FIELDS, ...PLAN_FIELDS]);
    const other = baseFields.filter(f => !knownIds.has(f.id));
    
    return {
      subjectiveFields: getFields(SUBJECTIVE_FIELDS),
      historyFields: getFields(HISTORY_FIELDS),
      objectiveFields: getFields(OBJECTIVE_FIELDS),
      assessmentFields: getFields(ASSESSMENT_FIELDS),
      planFields: getFields(PLAN_FIELDS),
      otherFields: other,
    };
  }, [baseFields]);

  // 데이터 변경 감지 및 타이핑 애니메이션
  useEffect(() => {
    if (chartData) {
      const newTypingFields = new Set<string>();
      
      Object.keys(chartData).forEach(fieldId => {
        const newValue = typeof chartData[fieldId]?.value === 'string' 
          ? chartData[fieldId].value as string 
          : Array.isArray(chartData[fieldId]?.value) 
            ? (chartData[fieldId].value as string[]).join(', ')
            : '';
        const oldValue = previousValues[fieldId] || '';
        
        // 값이 변경되었으면 타이핑 애니메이션 시작
        if (newValue !== oldValue && newValue.length > 0) {
          newTypingFields.add(fieldId);
          
          // 해당 필드로 스크롤
          setTimeout(() => {
            const fieldElement = fieldRefs.current[fieldId];
            if (fieldElement) {
              fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        }
      });
      
      if (newTypingFields.size > 0) {
        setTypingFields(newTypingFields);
        
        // 1.5초 후 타이핑 애니메이션 종료
        setTimeout(() => {
          setTypingFields(new Set());
        }, 1500);
      }
      
      // 이전 값 업데이트
      const newPrevValues: Record<string, string> = {};
      Object.keys(chartData).forEach(fieldId => {
        const val = chartData[fieldId]?.value;
        newPrevValues[fieldId] = typeof val === 'string' ? val : Array.isArray(val) ? val.join(', ') : '';
      });
      setPreviousValues(newPrevValues);
      
      setEditableData(chartData);
    }
  }, [chartData]);

  const handleFieldChange = useCallback((fieldId: string, value: string | string[]) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        value,
        isConfirmed: prev[fieldId]?.isConfirmed ?? false,
        source: prev[fieldId]?.source ?? 'stated',
      }
    }));
  }, []);

  const handleConfirmField = useCallback((fieldId: string) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        isConfirmed: true,
        source: 'stated' as const,
      }
    }));
    toast.success('확정되었습니다');
  }, []);

  const handleUnconfirmField = useCallback((fieldId: string) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        isConfirmed: false,
        source: 'inferred' as const,
      }
    }));
    toast.info('확정이 취소되었습니다');
  }, []);

  // DDx 관련 핸들러들
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
        diagnosisConfirmed: {
          ...prev.diagnosisConfirmed,
          value: filteredConfirmed,
          isConfirmed: filteredConfirmed.length > 0,
        }
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
    const formatContent = (text: string): string => {
      const hasNumberedItems = /(?:^|\s)(\d+\.|\-|•)\s/.test(text);
      if (hasNumberedItems) {
        return text
          .replace(/(?<!^)\s*(\d+\.)\s*/g, '\n$1 ')
          .replace(/(?<!^)\s*(\-|•)\s*/g, '\n$1 ')
          .trim();
      }
      return text;
    };

    const allFields = [...subjectiveFields, ...historyFields, ...objectiveFields, ...assessmentFields, ...planFields, ...otherFields];
    
    const chartText = allFields.map(field => {
      const fieldValue = editableData[field.id];
      if (!fieldValue) return null;
      
      const value = fieldValue.value;
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      if (!displayValue) return null;
      
      const fieldLabel = field.nameEn && field.nameEn !== field.name ? field.nameEn : field.name;
      const source = fieldValue.source || 'stated';
      const statusMarker = fieldValue.isConfirmed ? '' : source === 'inferred' ? ' (AI)' : ' (?)';
      const formattedContent = formatContent(displayValue);
      return `[${fieldLabel}]${statusMarker}\n${formattedContent}`;
    }).filter(Boolean).join('\n\n');
      
    navigator.clipboard.writeText(chartText);
    setIsCopied(true);
    toast.success('차트가 클립보드에 복사되었습니다');
    setTimeout(() => setIsCopied(false), 2000);
  }, [editableData, subjectiveFields, historyFields, objectiveFields, assessmentFields, planFields, otherFields]);

  // DDx 리스트 렌더링
  const renderDDxList = (ddxList: DdxItem[]) => {
    const qualifiedItems = ddxList.filter(item => 
      item.confidence === 'high' || item.confidence === 'medium'
    );
    
    const sortedItems = [...qualifiedItems].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.confidence] - order[b.confidence];
    }).slice(0, 5);
    
    const visibleItems = sortedItems.filter(item => !item.isRemoved);
    const removedItems = sortedItems.filter(item => item.isRemoved);
    const lowConfidenceCount = ddxList.filter(item => item.confidence === 'low').length;
    
    if (visibleItems.length === 0 && removedItems.length === 0) {
      return (
        <div className="text-sm text-slate-400 italic">
          DDx가 없습니다.
          {lowConfidenceCount > 0 && <span className="text-xs ml-1">(낮은 신뢰도 {lowConfidenceCount}개 숨김)</span>}
        </div>
      );
    }

    return (
      <div className="space-y-2 mt-3">
        {visibleItems.length > 0 && (
          <>
            <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI DDx/r/o (개별 확정 가능)
            </div>
            {visibleItems.map((item) => {
              const isExpanded = expandedDDx.has(item.id);
              
              return (
                <div
                  key={item.id}
                  className={`rounded-lg p-3 transition-all duration-200 hover:shadow-sm ${
                    item.isConfirmed ? 'bg-teal-50 border border-teal-200' : 'bg-amber-50 border border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.isConfirmed ? (
                        <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                      <span className={`text-sm font-medium ${item.isConfirmed ? 'text-teal-800' : 'text-amber-800'}`}>
                        r/o {item.diagnosis}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.confidence === 'high' ? '높음' : '중간'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {!item.isConfirmed ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleConfirmDDx(item.id)}
                            className="h-6 text-xs px-2 border-teal-300 text-teal-700 hover:bg-teal-100 bg-white">
                            <Check className="w-3 h-3 mr-1" />확정
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleRemoveDDx(item.id)}
                            className="h-6 text-xs px-2 border-slate-300 text-slate-500 hover:bg-slate-100 bg-white">
                            제외
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleUnconfirmDDx(item.id)}
                          className="h-6 text-xs px-2 border-slate-300 text-slate-500 hover:bg-slate-100 bg-white">
                          취소
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {item.reason && (
                    <button onClick={() => toggleDDxDetails(item.id)}
                      className="text-xs text-slate-500 mt-1 flex items-center gap-1 hover:text-slate-700">
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? '근거 닫기' : '근거 보기'}
                    </button>
                  )}
                  
                  {isExpanded && item.reason && (
                    <div className="chart-details-animate mt-2 p-2 bg-white/60 rounded text-xs text-slate-600 border border-slate-200/50">
                      <span className="font-medium text-slate-500">추론 근거:</span> {item.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {removedItems.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-slate-200">
            <div className="text-xs text-slate-400 mb-2">제외됨 ({removedItems.length}개)</div>
            <div className="space-y-1.5">
              {removedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg p-2 bg-slate-50 border border-dashed border-slate-200 opacity-60 hover:opacity-100">
                  <span className="text-xs text-slate-500 line-through">r/o {item.diagnosis}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleRestoreDDx(item.id)}
                    className="h-5 text-xs px-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50">
                    복구
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 필드 렌더링
  const renderField = (field: ChartField, isTyping: boolean = false) => {
    const fieldValue = editableData[field.id];
    const value = fieldValue?.value ?? '';
    const isConfirmed = fieldValue?.isConfirmed ?? false;
    const source = fieldValue?.source ?? 'stated';
    const isInferred = source === 'inferred';
    const confidence = fieldValue?.confidence;
    const rationale = fieldValue?.rationale;
    const evidence = fieldValue?.evidence || [];
    const isExpanded = expandedFields.has(field.id);

    const isArray = field.type === 'tags' || field.type === 'list';
    const arrayValue = Array.isArray(value) ? value : [];
    const stringValue = typeof value === 'string' ? value : '';
    const hasContent = isArray ? arrayValue.length > 0 : stringValue.trim().length > 0;
    const hasDetails = isInferred && (rationale || evidence.length > 0);

    // 배경색
    const bgClass = !hasContent
      ? 'bg-slate-50/50 border border-dashed border-slate-200'
      : isConfirmed
        ? 'bg-teal-50/50 border border-teal-200'
        : isInferred
          ? 'bg-amber-50/50 border border-amber-200'
          : 'bg-yellow-50/50 border border-yellow-200';

    return (
      <div 
        key={field.id}
        ref={(el) => { fieldRefs.current[field.id] = el; }}
        className={`rounded-xl p-4 transition-all duration-300 hover:shadow-md ${bgClass} ${isTyping ? 'field-typing ring-2 ring-teal-400' : ''}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold flex items-center gap-2">
            <span className="text-slate-800">
              {field.nameEn && field.nameEn !== field.name 
                ? `${field.nameEn} (${field.name})`
                : field.name
              }
            </span>
            {field.required && <span className="text-red-500">*</span>}
            {isTyping && <span className="typing-cursor text-xs text-teal-500 ml-1">입력 중</span>}
          </label>

          <div className="flex items-center gap-2">
            {hasContent && (
              <span className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded-full ${
                isConfirmed ? 'bg-teal-100 text-teal-700' 
                : isInferred ? 'bg-amber-100 text-amber-700' 
                : 'bg-yellow-100 text-yellow-700'
              }`}>
                {isConfirmed ? <><CheckCircle2 className="w-3 h-3" />확정됨</> 
                : isInferred ? <><Sparkles className="w-3 h-3" />AI 추론</> 
                : <><AlertCircle className="w-3 h-3" />불확실</>}
              </span>
            )}

            {hasContent && !isConfirmed && field.id !== 'chiefComplaint' && field.id !== 'historyOfPresentIllness' && (
              <Button variant="outline" size="sm" onClick={() => handleConfirmField(field.id)}
                className={`h-6 text-xs px-2 bg-white ${isInferred ? 'border-amber-300 text-amber-700 hover:bg-amber-100' : 'border-yellow-300 text-yellow-700 hover:bg-yellow-100'}`}>
                <Check className="w-3 h-3 mr-1" />확정
              </Button>
            )}
            
            {hasContent && isConfirmed && field.id !== 'chiefComplaint' && field.id !== 'historyOfPresentIllness' && (
              <Button variant="ghost" size="sm" onClick={() => handleUnconfirmField(field.id)}
                className="h-6 text-xs px-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                취소
              </Button>
            )}
          </div>
        </div>

        {/* 상세정보 토글 */}
        {hasContent && hasDetails && (
          <button onClick={() => toggleFieldDetails(field.id)}
            className="text-xs text-amber-600 mb-2 flex items-center gap-1 hover:text-amber-700">
            <Sparkles className="w-3 h-3" />
            {isExpanded ? '상세정보 닫기' : '추론 근거 보기'}
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {hasContent && hasDetails && isExpanded && (
          <div className="chart-details-animate mb-3 p-2.5 bg-white/60 rounded-lg border border-amber-200/50 text-xs space-y-1.5">
            {confidence && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">신뢰도:</span>
                <span className={`font-medium ${confidence === 'high' ? 'text-green-600' : confidence === 'medium' ? 'text-amber-600' : 'text-red-500'}`}>
                  {confidence === 'high' ? '높음' : confidence === 'medium' ? '중간' : '낮음'}
                </span>
              </div>
            )}
            {rationale && <div><span className="text-slate-500">추론 근거:</span><p className="text-slate-700 mt-0.5">{rationale}</p></div>}
            {evidence.length > 0 && (
              <div>
                <span className="text-slate-500">대화 인용:</span>
                <ul className="mt-0.5 space-y-0.5">{evidence.map((e, i) => <li key={i} className="text-slate-600 italic">"{e}"</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {/* 필드 입력 */}
        {isArray ? (
          (() => {
            const textValue = Array.isArray(value) ? value.join(', ') : (value || '');
            const parsedTags = textValue.split(',').map(s => s.trim()).filter(s => s);
            
            return (
              <>
                {parsedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {parsedTags.map((item, index) => (
                      <Badge key={index} variant="secondary"
                        className={isConfirmed || !isInferred ? "bg-teal-100 text-teal-700 border-teal-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
                        {item}
                      </Badge>
                    ))}
                  </div>
                )}
                <Textarea value={textValue} onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="min-h-[60px] bg-white border-slate-200 whitespace-pre-wrap"
                  placeholder={FIELD_PLACEHOLDERS[field.id] || "Separate with commas (,)"} />
              </>
            );
          })()
        ) : field.type === 'text' ? (
          <Input value={stringValue} onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={FIELD_PLACEHOLDERS[field.id] || field.description}
            className="bg-white border-slate-200" />
        ) : (
          <Textarea value={stringValue} onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className="min-h-[80px] bg-white border-slate-200 whitespace-pre-wrap"
            placeholder={FIELD_PLACEHOLDERS[field.id] || field.description} />
        )}

        {/* Assessment 필드에 DDx 리스트 */}
        {field.id === 'assessment' && fieldValue?.ddxList && fieldValue.ddxList.length > 0 && (
          renderDDxList(fieldValue.ddxList)
        )}
      </div>
    );
  };

  // 섹션 렌더링
  const renderSection = (title: string, fields: ChartField[], icon: React.ReactNode, highlight: boolean = false) => {
    if (fields.length === 0) return null;
    
    return (
      <div className={`rounded-2xl p-4 ${highlight ? 'bg-gradient-to-br from-teal-50 to-cyan-50 border-2 border-teal-200' : 'bg-slate-50/50'}`}>
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h4 className="text-sm font-bold text-slate-700">{title}</h4>
        </div>
        <div className="space-y-3">
          {fields.map(field => renderField(field, typingFields.has(field.id)))}
        </div>
      </div>
    );
  };

  const hasAnyData = Object.keys(editableData).length > 0;

  return (
    <>
      <style>{chartAnimationStyles}</style>
      
      <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-none px-5 py-4 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">AI 차트</h3>
                <p className="text-xs text-slate-500">
                  {isGenerating ? 'AI가 대화를 분석 중...' : isRecording ? '녹음 중 - 실시간 업데이트' : 'AI가 대화를 분석하여 차트를 작성합니다'}
                </p>
              </div>
            </div>
            {hasAnyData && (
              <Button variant="outline" size="sm" onClick={handleCopyChart}
                className="h-8 text-xs border-teal-200 text-teal-700 hover:bg-teal-50">
                {isCopied ? <><Check className="w-3 h-3 mr-1.5" />복사됨</> : <><Copy className="w-3 h-3 mr-1.5" />EMR 복사</>}
              </Button>
            )}
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden" ref={scrollAreaRef}>
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="relative w-16 h-16 mb-4">
                    <div className="absolute inset-0 rounded-2xl border-2 border-teal-200 animate-spin" style={{ animationDuration: '3s' }} />
                    <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg">
                      <Sparkles className="w-7 h-7 text-white animate-pulse" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl chart-shimmer pointer-events-none" />
                  </div>
                  <p className="text-slate-700 font-semibold mb-1">AI 차트 생성 중...</p>
                  <p className="text-sm text-slate-500">대화를 분석하고 있습니다</p>
                  <div className="flex items-center gap-1.5 mt-4">
                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              ) : (
                <>
                  {/* S - Subjective */}
                  {renderSection('S - Subjective', subjectiveFields, <span className="text-lg">📋</span>)}
                  
                  {/* History */}
                  {renderSection('History', historyFields, <span className="text-lg">📚</span>)}
                  
                  {/* O - Objective */}
                  {renderSection('O - Objective', objectiveFields, <span className="text-lg">🔬</span>)}
                  
                  {/* A - Assessment (하이라이트) */}
                  {renderSection('A - Assessment', assessmentFields, <span className="text-lg">🎯</span>, true)}
                  
                  {/* P - Plan (하이라이트) */}
                  {renderSection('P - Plan', planFields, <span className="text-lg">📝</span>, true)}
                  
                  {/* 기타 필드 */}
                  {otherFields.length > 0 && renderSection('Other', otherFields, <span className="text-lg">📎</span>)}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
