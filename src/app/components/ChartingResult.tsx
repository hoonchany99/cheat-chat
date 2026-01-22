import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ChartField, DEPARTMENT_PRESETS, DdxItem, ChartFieldValue } from '@/services/chartService';

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
  recordingProgress,
  isRecording
}: ChartingResultProps) {
  const [editableData, setEditableData] = useState<ChartData>({});
  const [isCopied, setIsCopied] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set()); // 상세정보 펼침 상태

  useEffect(() => {
    if (chartData) {
      setEditableData(chartData);
    }
  }, [chartData]);

  const handleFieldChange = useCallback((fieldId: string, value: string | string[]) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        value,
      }
    }));
  }, []);

  const handleConfirmField = useCallback((fieldId: string) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        isConfirmed: true,
        source: 'stated' as const, // 확정하면 stated로 변경
      }
    }));
    toast.success('확정되었습니다');
  }, []);

  // 필드 확정 취소
  const handleUnconfirmField = useCallback((fieldId: string) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        isConfirmed: false,
        source: 'inferred' as const, // 취소하면 다시 inferred로
      }
    }));
    toast.info('확정이 취소되었습니다');
  }, []);

  // DDx 개별 항목 확정
  const handleConfirmDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isConfirmed: true } : item
      );
      
      // 확정된 DDx를 diagnosisConfirmed에 추가
      const confirmedDdx = updatedDdxList.find(item => item.id === ddxId);
      const currentConfirmed = prev.diagnosisConfirmed?.value || [];
      const confirmedArray = Array.isArray(currentConfirmed) ? currentConfirmed : [currentConfirmed].filter(Boolean);
      
      return {
        ...prev,
        assessment: {
          ...assessment,
          ddxList: updatedDdxList,
        },
        diagnosisConfirmed: {
          value: confirmedDdx ? [...confirmedArray, confirmedDdx.diagnosis] : confirmedArray,
          isConfirmed: true,
          source: 'stated' as const,
        }
      };
    });
    toast.success('진단이 확정되었습니다');
  }, []);

  // DDx 개별 항목 제외
  const handleRemoveDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isRemoved: true } : item
      );
      
      return {
        ...prev,
        assessment: {
          ...assessment,
          ddxList: updatedDdxList,
        }
      };
    });
    toast.info('DDx가 제외되었습니다');
  }, []);

  // DDx 개별 항목 복구
  const handleRestoreDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isRemoved: false } : item
      );
      
      return {
        ...prev,
        assessment: {
          ...assessment,
          ddxList: updatedDdxList,
        }
      };
    });
    toast.success('DDx가 복구되었습니다');
  }, []);

  // DDx 개별 항목 확정 취소
  const handleUnconfirmDDx = useCallback((ddxId: string) => {
    setEditableData(prev => {
      const assessment = prev.assessment;
      if (!assessment?.ddxList) return prev;
      
      // 해당 DDx 찾기
      const targetDdx = assessment.ddxList.find(item => item.id === ddxId);
      if (!targetDdx) return prev;
      
      // DDx 리스트에서 확정 취소
      const updatedDdxList = assessment.ddxList.map(item =>
        item.id === ddxId ? { ...item, isConfirmed: false } : item
      );
      
      // diagnosisConfirmed에서 해당 진단 제거
      const currentConfirmed = prev.diagnosisConfirmed?.value || [];
      const confirmedArray = Array.isArray(currentConfirmed) ? currentConfirmed : [currentConfirmed].filter(Boolean);
      const filteredConfirmed = confirmedArray.filter(dx => dx !== targetDdx.diagnosis);
      
      return {
        ...prev,
        assessment: {
          ...assessment,
          ddxList: updatedDdxList,
        },
        diagnosisConfirmed: {
          ...prev.diagnosisConfirmed,
          value: filteredConfirmed,
          isConfirmed: filteredConfirmed.length > 0,
        }
      };
    });
    toast.info('확정이 취소되었습니다');
  }, []);

  // DDx 펼침/접기
  const [expandedDDx, setExpandedDDx] = useState<Set<string>>(new Set());
  
  const toggleDDxDetails = useCallback((ddxId: string) => {
    setExpandedDDx(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ddxId)) {
        newSet.delete(ddxId);
      } else {
        newSet.add(ddxId);
      }
      return newSet;
    });
  }, []);

  const toggleFieldDetails = useCallback((fieldId: string) => {
    setExpandedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  }, []);

  // Generate fields from chartData keys, matching with ALL department presets
  const displayFields = useMemo(() => {
    if (!chartData) return [];
    
    // Collect all fields from all department presets
    const allFields: ChartField[] = [];
    DEPARTMENT_PRESETS.forEach(preset => {
      preset.fields.forEach(field => {
        if (!allFields.find(f => f.id === field.id)) {
          allFields.push(field);
        }
      });
    });
    
    const fieldMap = new Map(allFields.map(f => [f.id, f]));
    // Also add lowercase versions for case-insensitive matching
    allFields.forEach(f => {
      fieldMap.set(f.id.toLowerCase(), f);
    });
    
    // Helper function to convert fieldId to Title Case
    const toTitleCase = (str: string) => {
      return str
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, s => s.toUpperCase()) // Capitalize first letter
        .trim();
    };
    
    return Object.keys(chartData).map(fieldId => {
      // Try exact match first, then lowercase match
      const serviceField = fieldMap.get(fieldId) || fieldMap.get(fieldId.toLowerCase());
      if (serviceField) {
        return serviceField;
      }
      // Fallback for unknown fields - convert ID to readable format
      const readableName = toTitleCase(fieldId);
      return {
        id: fieldId,
        name: readableName,
        nameEn: readableName,
        type: Array.isArray(chartData[fieldId]?.value) ? 'tags' : 'textarea',
        required: false,
      } as ChartField;
    });
  }, [chartData]);

  const handleCopyChart = useCallback(() => {
    // 번호/항목 패턴을 줄바꿈으로 포맷팅
    const formatContent = (text: string): string => {
      // 번호 패턴 (1. 2. 등) 또는 대시/불릿 패턴 감지
      const hasNumberedItems = /(?:^|\s)(\d+\.|\-|•)\s/.test(text);
      
      if (hasNumberedItems) {
        // 번호나 대시/불릿 앞에서 줄바꿈 (첫 번째 제외)
        return text
          .replace(/(?<!^)\s*(\d+\.)\s*/g, '\n$1 ')
          .replace(/(?<!^)\s*(\-|•)\s*/g, '\n$1 ')
          .trim();
      }
      return text;
    };

    const chartText = displayFields.map(field => {
      const fieldValue = editableData[field.id];
      if (!fieldValue) return null;
      
      const value = fieldValue.value;
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      if (!displayValue) return null;
      
      const fieldLabel = field.nameEn && field.nameEn !== field.name 
        ? field.nameEn 
        : field.name;
      // 상태 마커: 확정(없음), 불확실(?), AI추론(AI)
      const source = fieldValue.source || 'stated';
      const statusMarker = fieldValue.isConfirmed 
        ? '' 
        : source === 'inferred' 
          ? ' (AI)' 
          : ' (?)'; // stated but not confirmed = 불확실
      // 내용 포맷팅 (번호 항목이면 줄바꿈)
      const formattedContent = formatContent(displayValue);
      // [필드명] 다음에 줄바꿈
      return `[${fieldLabel}]${statusMarker}\n${formattedContent}`;
    }).filter(Boolean).join('\n\n');
      
    navigator.clipboard.writeText(chartText);
    setIsCopied(true);
    toast.success('차트가 클립보드에 복사되었습니다');
    setTimeout(() => setIsCopied(false), 2000);
  }, [editableData, displayFields]);

  // DDx 리스트 렌더링
  const renderDDxList = (ddxList: DdxItem[]) => {
    const visibleItems = ddxList.filter(item => !item.isRemoved);
    const removedItems = ddxList.filter(item => item.isRemoved);
    
    if (visibleItems.length === 0 && removedItems.length === 0) {
      return <p className="text-sm text-slate-400 italic">DDx가 없습니다.</p>;
    }

    return (
      <div className="space-y-2 mt-3">
        {/* 활성 DDx 목록 */}
        {visibleItems.length > 0 && (
          <>
            <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              AI DDx/r/o (개별 확정 가능)
            </div>
            {visibleItems.map((item, idx) => {
              const isExpanded = expandedDDx.has(item.id);
              
              return (
                <div
                  key={item.id}
                  className={`chart-field-animate rounded-lg p-3 transition-all duration-200 hover:shadow-sm ${
                    item.isConfirmed
                      ? 'bg-teal-50 border border-teal-200'
                      : 'bg-amber-50 border border-amber-200'
                  }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  {/* DDx Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.isConfirmed ? (
                        <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                      <span className={`text-sm font-medium ${
                        item.isConfirmed ? 'text-teal-800' : 'text-amber-800'
                      }`}>
                        r/o {item.diagnosis}
                      </span>
                      {/* 신뢰도 뱃지 */}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        item.confidence === 'high' ? 'bg-green-100 text-green-700' :
                        item.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {item.confidence === 'high' ? '높음' : item.confidence === 'medium' ? '중간' : '낮음'}
                      </span>
                    </div>
                    
                    {/* 버튼들 */}
                    <div className="flex items-center gap-1">
                      {!item.isConfirmed ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConfirmDDx(item.id)}
                            className="h-6 text-xs px-2 border-teal-300 text-teal-700 hover:bg-teal-100 bg-white"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            확정
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveDDx(item.id)}
                            className="h-6 text-xs px-2 border-slate-300 text-slate-500 hover:bg-slate-100 bg-white"
                          >
                            제외
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnconfirmDDx(item.id)}
                          className="h-6 text-xs px-2 border-slate-300 text-slate-500 hover:bg-slate-100 bg-white"
                        >
                          취소
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* 근거 토글 */}
                  {item.reason && (
                    <button
                      onClick={() => toggleDDxDetails(item.id)}
                      className="text-xs text-slate-500 mt-1 flex items-center gap-1 hover:text-slate-700 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? '근거 닫기' : '근거 보기'}
                    </button>
                  )}
                  
                  {/* 근거 내용 */}
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

        {/* 제외된 DDx 목록 (접혀있음, 복구 가능) */}
        {removedItems.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-slate-200">
            <div className="text-xs text-slate-400 mb-2">
              제외됨 ({removedItems.length}개) - 복구 가능
            </div>
            <div className="space-y-1.5">
              {removedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg p-2 bg-slate-50 border border-dashed border-slate-200 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <span className="text-xs text-slate-500 line-through">
                    r/o {item.diagnosis}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestoreDDx(item.id)}
                    className="h-5 text-xs px-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50"
                  >
                    복구
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 활성 DDx가 없고 제외만 있는 경우 메시지 */}
        {visibleItems.length === 0 && removedItems.length > 0 && (
          <p className="text-sm text-slate-400 italic mb-2">
            모든 DDx가 제외되었습니다. 위에서 복구할 수 있습니다.
          </p>
        )}
      </div>
    );
  };

  const renderField = (field: ChartField, index: number) => {
    const fieldValue = editableData[field.id];
    if (!fieldValue) return null;

    const value = fieldValue.value;
    const isConfirmed = fieldValue.isConfirmed;
    const source = fieldValue.source || 'stated';
    const isInferred = source === 'inferred';
    const confidence = fieldValue.confidence;
    const rationale = fieldValue.rationale;
    const evidence = fieldValue.evidence || [];
    const isExpanded = expandedFields.has(field.id);

    const isArray = field.type === 'tags' || field.type === 'list';
    const arrayValue = Array.isArray(value) ? value : [];
    const stringValue = typeof value === 'string' ? value : '';
    const hasContent = isArray ? arrayValue.length > 0 : stringValue.trim().length > 0;

    // 상세정보가 있는지 체크 (inferred + rationale 또는 evidence가 있으면)
    const hasDetails = isInferred && (rationale || evidence.length > 0);

    // 배경색: 확정(teal) / AI추론(amber) / 불확실(yellow) / 빈값(slate)
    const bgClass = !hasContent
      ? 'bg-slate-50 border border-dashed border-slate-200'
      : isConfirmed
        ? 'bg-teal-50/50 border border-teal-200'
        : isInferred
          ? 'bg-amber-50/50 border border-amber-200'
          : 'bg-yellow-50/50 border border-yellow-200'; // stated but not confirmed = 불확실

    // 스태거드 애니메이션 딜레이 (각 필드별로 60ms씩 증가)
    const animationDelay = `${index * 60}ms`;

    return (
      <div 
        key={field.id} 
        className={`chart-field-animate rounded-xl p-4 transition-all duration-300 hover:shadow-md ${bgClass}`}
        style={{ animationDelay }}
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
          </label>

          <div className="flex items-center gap-2">
            {/* 소스 표시: 확정됨 / 불확실 / AI 추론 */}
            {hasContent && (
              <span className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded-full ${
                isConfirmed
                  ? 'bg-teal-100 text-teal-700' // 확정됨
                  : isInferred
                    ? 'bg-amber-100 text-amber-700' // AI 추론
                    : 'bg-yellow-100 text-yellow-700' // 불확실 (stated but not confirmed)
              }`}>
                {isConfirmed ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    확정됨
                  </>
                ) : isInferred ? (
                  <>
                    <Sparkles className="w-3 h-3" />
                    AI 추론
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    불확실
                  </>
                )}
              </span>
            )}

            {/* 확정 버튼 (확정 안된 필드 - AI추론 또는 불확실) */}
            {hasContent && !isConfirmed && field.id !== 'chiefComplaint' && field.id !== 'historyOfPresentIllness' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConfirmField(field.id)}
                className={`h-6 text-xs px-2 bg-white ${
                  isInferred 
                    ? 'border-amber-300 text-amber-700 hover:bg-amber-100' 
                    : 'border-yellow-300 text-yellow-700 hover:bg-yellow-100'
                }`}
              >
                <Check className="w-3 h-3 mr-1" />
                확정
              </Button>
            )}
            
            {/* 확정 취소 버튼 (확정된 AI 추론 필드) */}
            {hasContent && isConfirmed && field.id !== 'chiefComplaint' && field.id !== 'historyOfPresentIllness' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUnconfirmField(field.id)}
                className="h-6 text-xs px-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                취소
              </Button>
            )}
          </div>
        </div>

        {/* 상세정보 토글 버튼 (AI 추론이고 상세정보 있을 때만) */}
        {hasContent && hasDetails && (
          <button
            onClick={() => toggleFieldDetails(field.id)}
            className="text-xs text-amber-600 mb-2 flex items-center gap-1 hover:text-amber-700 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            {isExpanded ? '상세정보 닫기' : '추론 근거 보기'}
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {/* 상세정보 (펼쳤을 때만) - 애니메이션 적용 */}
        {hasContent && hasDetails && isExpanded && (
          <div className="chart-details-animate mb-3 p-2.5 bg-white/60 rounded-lg border border-amber-200/50 text-xs space-y-1.5">
            {confidence && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500">신뢰도:</span>
                <span className={`font-medium ${
                  confidence === 'high' ? 'text-green-600' :
                  confidence === 'medium' ? 'text-amber-600' : 'text-red-500'
                }`}>
                  {confidence === 'high' ? '높음' : confidence === 'medium' ? '중간' : '낮음'}
                </span>
              </div>
            )}
            {rationale && (
              <div>
                <span className="text-slate-500">추론 근거:</span>
                <p className="text-slate-700 mt-0.5">{rationale}</p>
              </div>
            )}
            {evidence.length > 0 && (
              <div>
                <span className="text-slate-500">대화 인용:</span>
                <ul className="mt-0.5 space-y-0.5">
                  {evidence.map((e, i) => (
                    <li key={i} className="text-slate-600 italic">"{e}"</li>
                  ))}
                </ul>
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
                      <Badge
                        key={index}
                        variant="secondary"
                        className={isConfirmed || !isInferred
                          ? "bg-teal-100 text-teal-700 border-teal-200" 
                          : "bg-amber-100 text-amber-700 border-amber-200"
                        }
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                )}
                <Textarea
                  value={textValue}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="min-h-[60px] bg-white border-slate-200 whitespace-pre-wrap"
                  placeholder={FIELD_PLACEHOLDERS[field.id] || "Separate with commas (,)"}
                />
              </>
            );
          })()
        ) : field.type === 'text' ? (
          <Input
            value={stringValue}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={FIELD_PLACEHOLDERS[field.id] || field.description}
            className="bg-white border-slate-200"
          />
        ) : (
          <Textarea
            value={stringValue}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className="min-h-[80px] bg-white border-slate-200 whitespace-pre-wrap"
            placeholder={FIELD_PLACEHOLDERS[field.id] || field.description}
          />
        )}

        {/* Assessment 필드에 DDx 리스트가 있으면 표시 */}
        {field.id === 'assessment' && fieldValue.ddxList && fieldValue.ddxList.length > 0 && (
          renderDDxList(fieldValue.ddxList)
        )}
      </div>
    );
  };

  const hasChartData = chartData && Object.keys(chartData).length > 0;

  return (
    <>
      {/* 애니메이션 스타일 주입 */}
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
              <p className="text-xs text-slate-500">AI가 대화를 분석하여 차트를 작성합니다</p>
            </div>
          </div>
          {hasChartData && (
          <Button
            variant="outline"
            size="sm"
              onClick={handleCopyChart}
              className="h-8 text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
          >
              {isCopied ? (
                <>
                  <Check className="w-3 h-3 mr-1.5" />
                  복사됨
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1.5" />
                  EMR 복사
                </>
              )}
          </Button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="relative w-16 h-16 mb-4">
                  {/* 회전하는 외곽 링 */}
                  <div className="absolute inset-0 rounded-2xl border-2 border-teal-200 animate-spin" style={{ animationDuration: '3s' }} />
                  <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg">
                    <Sparkles className="w-7 h-7 text-white animate-pulse" />
                  </div>
                  {/* 빛나는 효과 */}
                  <div className="absolute inset-0 rounded-2xl chart-shimmer pointer-events-none" />
                </div>
                <p className="text-slate-700 font-semibold mb-1">AI 차트 생성 중...</p>
                <p className="text-sm text-slate-500">대화를 분석하고 있습니다</p>
                {/* 로딩 도트 애니메이션 */}
                <div className="flex items-center gap-1.5 mt-4">
                  <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          </div>
            ) : hasChartData ? (
              <div className="space-y-3">
                {displayFields.map((field, index) => renderField(field, index))}
          </div>
            ) : isRecording ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4 border border-red-100">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          </div>
                <p className="text-slate-700 font-medium mb-1">녹음 중...</p>
                <p className="text-sm text-slate-500">녹음이 끝나면 차트가 생성됩니다</p>
                <div className="w-48 h-1.5 bg-slate-100 rounded-full mt-4 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(recordingProgress, 100)}%` }}
            />
          </div>
            </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-slate-400" />
          </div>
                <p className="text-slate-700 font-medium mb-1">차트가 여기에 생성됩니다</p>
                <p className="text-sm text-slate-400">녹음 완료 후 AI가 자동 생성합니다</p>
            </div>
            )}
          </div>
        </ScrollArea>
          </div>
          </div>
    </>
  );
}
