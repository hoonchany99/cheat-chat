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
    animation: fieldHighlight 1.5s ease-out;
  }
  
  .typing-cursor::after {
    content: '|';
    animation: blink 0.8s step-end infinite;
    color: #14b8a6;
    font-weight: bold;
  }
  
  @keyframes blink {
    0%, 50% { border-color: transparent; }
    51%, 100% { border-color: #14b8a6; }
  }
  
  .chart-shimmer {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
`;

// 필드별 placeholder
const FIELD_PLACEHOLDERS: Record<string, string> = {
  chiefComplaint: "환자 표현 + onset (e.g., 의식이 없어요. (onset: 오늘 아침))",
  historyOfPresentIllness: "상환은 + ~함 체 (e.g., 상환은 금일 아침 의식 소실 발생함. 유사 증상 과거력 없음.)",
  pertinentROS: "English (+/-) (e.g., N/V(-), LOC(+), fever(-), CP(-))",
  pastMedicalHistory: "Abbrev + duration (e.g., DM (since childhood), HTN (x3y))",
  pastSurgicalHistory: "s/p surgery (year) (e.g., s/p appendectomy (2020))",
  medications: "Drug + dose if mentioned (e.g., metformin 500mg)",
  allergies: "\"None\" if no allergies (NOT NKDA)",
  socialHistory: "English (+/-) (e.g., Smoking (-), Alcohol (-))",
  familyHistory: "Korean style (e.g., 부: DM, 모: 특이사항 없음)",
  vitalSigns: "BP/HR/BT/RR/SpO2",
  physicalExam: "\"None\" or full (+/-) findings (e.g., Mental status: drowsy)",
  labResults: "Mentioned results only",
  imaging: "Mentioned findings only",
  assessment: "# Confirmed Dx (의사 확정 시만)\n\nr/o DDx는 아래 리스트로 자동 표시",
  diagnosisConfirmed: "# Confirmed Dx (DDx 확정 시 추가)",
  plan: "[Orders]\n- Blood glucose\n\n[AI Suggestions]\n- Brain CT (LOC + Hx)",
  followUp: "Specific only (e.g., f/u 1wk) or leave empty",
  notes: "Additional notes",
};

// Assessment/Plan 필드 ID
const FIXED_FIELDS = ['assessment', 'diagnosisConfirmed', 'plan', 'followUp'];

export interface ChartData {
  [key: string]: ChartFieldValue;
}

interface ChartingResultProps {
  chartData: ChartData | null;
  isGenerating: boolean;
  recordingProgress: number;
  isRecording: boolean;
  /** 'compact': 기본, 'wide': 3열 레이아웃용 (내부 2열) */
  layout?: 'compact' | 'wide';
}

export function ChartingResult({
  chartData,
  isGenerating,
  isRecording,
  layout = 'compact'
}: ChartingResultProps) {
  const [editableData, setEditableData] = useState<ChartData>({});
  const [isCopied, setIsCopied] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [typingFields, setTypingFields] = useState<Set<string>>(new Set());
  const [previousValues, setPreviousValues] = useState<Record<string, string>>({});
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 기본 필드 목록
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

  // 스크롤 영역 필드 vs 고정 영역 필드 분리
  const { scrollFields, fixedFields } = useMemo(() => {
    const scroll = baseFields.filter(f => !FIXED_FIELDS.includes(f.id));
    const fixed = baseFields.filter(f => FIXED_FIELDS.includes(f.id));
    return { scrollFields: scroll, fixedFields: fixed };
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
        
        if (newValue !== oldValue && newValue.length > 0) {
          newTypingFields.add(fieldId);
          
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
        setTimeout(() => setTypingFields(new Set()), 1500);
      }
      
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
      [fieldId]: { ...prev[fieldId], isConfirmed: true, source: 'stated' as const }
    }));
    toast.success('확정되었습니다');
  }, []);

  const handleUnconfirmField = useCallback((fieldId: string) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], isConfirmed: false, source: 'inferred' as const }
    }));
    toast.info('확정이 취소되었습니다');
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
    const allFields = [...scrollFields, ...fixedFields];
    
    const chartText = allFields.map(field => {
      const fieldValue = editableData[field.id];
      if (!fieldValue) return null;
      
      const value = fieldValue.value;
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      if (!displayValue) return null;
      
      const fieldLabel = field.nameEn && field.nameEn !== field.name ? field.nameEn : field.name;
      const source = fieldValue.source || 'stated';
      const statusMarker = fieldValue.isConfirmed ? '' : source === 'inferred' ? ' (AI)' : ' (?)';
      return `[${fieldLabel}]${statusMarker}\n${displayValue}`;
    }).filter(Boolean).join('\n\n');
      
    navigator.clipboard.writeText(chartText);
    setIsCopied(true);
    toast.success('차트가 클립보드에 복사되었습니다');
    setTimeout(() => setIsCopied(false), 2000);
  }, [editableData, scrollFields, fixedFields]);

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

  // 필드 렌더링 (컴팩트 버전)
  const renderField = (field: ChartField, isTyping: boolean = false, compact: boolean = false) => {
    const fieldValue = editableData[field.id];
    const value = fieldValue?.value ?? '';
    const isConfirmed = fieldValue?.isConfirmed ?? false;
    const source = fieldValue?.source ?? 'stated';
    const isInferred = source === 'inferred';
    const rationale = fieldValue?.rationale;
    const evidence = fieldValue?.evidence || [];
    const isExpanded = expandedFields.has(field.id);

    const isArray = field.type === 'tags' || field.type === 'list';
    const stringValue = typeof value === 'string' ? value : '';
    const hasContent = isArray ? (Array.isArray(value) ? value.length > 0 : false) : stringValue.trim().length > 0;
    const hasDetails = isInferred && (rationale || evidence.length > 0);

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
        className={`rounded-lg ${compact ? 'p-2' : 'p-3'} transition-all duration-300 ${bgClass} ${isTyping ? 'field-typing ring-2 ring-teal-400' : ''}`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <label className={`${compact ? 'text-xs' : 'text-sm'} font-semibold flex items-center gap-1.5`}>
            <span className="text-slate-800">
              {field.nameEn && field.nameEn !== field.name ? `${field.nameEn} (${field.name})` : field.name}
            </span>
            {field.required && <span className="text-red-500">*</span>}
            {isTyping && <span className="typing-cursor text-[10px] text-teal-500">입력 중</span>}
          </label>

          <div className="flex items-center gap-1.5">
            {hasContent && (
              <span className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                isConfirmed ? 'bg-teal-100 text-teal-700' : isInferred ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {isConfirmed ? <><CheckCircle2 className="w-2.5 h-2.5" />확정</> : isInferred ? <><Sparkles className="w-2.5 h-2.5" />AI</> : <><AlertCircle className="w-2.5 h-2.5" />?</>}
              </span>
            )}
            {hasContent && !isConfirmed && field.id !== 'chiefComplaint' && field.id !== 'historyOfPresentIllness' && (
              <Button variant="outline" size="sm" onClick={() => handleConfirmField(field.id)} className="h-5 text-[10px] px-1.5 bg-white">확정</Button>
            )}
            {hasContent && isConfirmed && field.id !== 'chiefComplaint' && field.id !== 'historyOfPresentIllness' && (
              <Button variant="ghost" size="sm" onClick={() => handleUnconfirmField(field.id)} className="h-5 text-[10px] px-1.5 text-slate-400">취소</Button>
            )}
          </div>
        </div>

        {hasContent && hasDetails && (
          <button onClick={() => toggleFieldDetails(field.id)} className="text-[10px] text-amber-600 mb-1.5 flex items-center gap-0.5 hover:text-amber-700">
            <Sparkles className="w-2.5 h-2.5" />
            {isExpanded ? '닫기' : '근거'}
          </button>
        )}

        {hasContent && hasDetails && isExpanded && (
          <div className="chart-details-animate mb-2 p-2 bg-white/60 rounded text-[10px] space-y-1">
            {rationale && <div><span className="text-slate-500">근거:</span> <span className="text-slate-700">{rationale}</span></div>}
            {evidence.length > 0 && <div><span className="text-slate-500">인용:</span> {evidence.map((e, i) => <span key={i} className="text-slate-600 italic"> "{e}"</span>)}</div>}
          </div>
        )}

        {isArray ? (
          (() => {
            const textValue = Array.isArray(value) ? value.join(', ') : (value || '');
            const parsedTags = textValue.split(',').map(s => s.trim()).filter(s => s);
            return (
              <>
                {parsedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {parsedTags.map((item, index) => (
                      <Badge key={index} variant="secondary" className={`text-[10px] ${isConfirmed || !isInferred ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>{item}</Badge>
                    ))}
                  </div>
                )}
                <Textarea value={textValue} onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className={`${compact ? 'min-h-[40px] text-xs' : 'min-h-[50px] text-sm'} bg-white border-slate-200 whitespace-pre-wrap`}
                  placeholder={FIELD_PLACEHOLDERS[field.id] || ""} />
              </>
            );
          })()
        ) : field.type === 'text' ? (
          <Input value={stringValue} onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={FIELD_PLACEHOLDERS[field.id] || ""}
            className={`bg-white border-slate-200 ${compact ? 'text-xs h-7' : 'text-sm'}`} />
        ) : (
          <Textarea value={stringValue} onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className={`${compact ? 'min-h-[40px] text-xs' : 'min-h-[60px] text-sm'} bg-white border-slate-200 whitespace-pre-wrap`}
            placeholder={FIELD_PLACEHOLDERS[field.id] || ""} />
        )}

        {field.id === 'assessment' && fieldValue?.ddxList && fieldValue.ddxList.length > 0 && renderDDxList(fieldValue.ddxList)}
      </div>
    );
  };

  const hasAnyData = Object.keys(editableData).length > 0;

  // Wide 레이아웃 (데스크톱 3열용)
  if (layout === 'wide') {
    return (
      <>
        <style>{chartAnimationStyles}</style>
        <div className="flex h-full gap-4">
          {/* 좌측: S/O 필드들 */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex-none px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-800">S/O</h3>
                    <p className="text-[10px] text-slate-500">Subjective & Objective</p>
                  </div>
                </div>
              </div>
            </div>
            {isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Sparkles className="w-8 h-8 text-slate-400 animate-pulse mb-2" />
                <p className="text-sm text-slate-500">분석 중...</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {scrollFields.map(field => renderField(field, typingFields.has(field.id), false))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* 우측: Assessment & Plan (고정) */}
          <div className="w-[320px] flex-none flex flex-col bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border-2 border-teal-200 shadow-sm overflow-hidden">
            <div className="flex-none px-4 py-3 border-b border-teal-200 bg-white/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                    <span className="text-white text-sm">🎯</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-teal-800">A/P</h3>
                    <p className="text-[10px] text-teal-600">
                      {isGenerating ? '분석 중...' : isRecording ? '실시간' : 'Assessment & Plan'}
                    </p>
                  </div>
                </div>
                {hasAnyData && (
                  <Button variant="outline" size="sm" onClick={handleCopyChart} className="h-6 text-[10px] border-teal-300 text-teal-700 bg-white">
                    {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                )}
              </div>
            </div>
            {isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="relative w-12 h-12 mb-2">
                  <div className="absolute inset-0 rounded-xl border-2 border-teal-300 animate-spin" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-1 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                </div>
                <p className="text-sm text-teal-700 font-medium">DDx 분석 중...</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {fixedFields.map(field => renderField(field, typingFields.has(field.id), true))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </>
    );
  }

  // Compact 레이아웃 (기본, 모바일)
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
                  {isGenerating ? '분석 중...' : isRecording ? '녹음 중' : '대화 분석 → 차트 작성'}
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
        
        {isGenerating ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative w-14 h-14 mb-3">
              <div className="absolute inset-0 rounded-xl border-2 border-teal-200 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-1 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white animate-pulse" />
              </div>
            </div>
            <p className="text-slate-700 font-semibold text-sm">AI 차트 생성 중...</p>
            <div className="flex items-center gap-1 mt-3">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : (
          <>
            {/* 스크롤 영역 - 일반 필드들 */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-2">
                  {scrollFields.map(field => renderField(field, typingFields.has(field.id), false))}
                </div>
              </ScrollArea>
            </div>
            
            {/* 고정 영역 - Assessment & Plan */}
            <div className="flex-none border-t-2 border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50">
              <div className="px-3 py-2 border-b border-teal-100">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🎯</span>
                  <span className="text-xs font-bold text-teal-700">Assessment & Plan</span>
                </div>
              </div>
              <ScrollArea className="h-[200px]">
                <div className="p-3 space-y-2">
                  {fixedFields.map(field => renderField(field, typingFields.has(field.id), true))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </div>
    </>
  );
}
