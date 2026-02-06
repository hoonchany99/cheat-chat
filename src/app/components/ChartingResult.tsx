import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';
import { 
  FileText, 
  Copy, 
  Check,
  Mic,
  Sparkles
} from 'lucide-react';
import { ChartField, DdxItem, ChartFieldValue, DEFAULT_FIELDS, DEPARTMENT_PRESETS } from '@/services/chartService';

export type { DdxItem, ChartFieldValue };

// 차트 애니메이션 스타일
const chartAnimationStyles = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .chart-fade-in {
    animation: fadeIn 0.2s ease-out forwards;
  }
  
  @keyframes dotPulse {
    0%, 80%, 100% { opacity: 0.3; }
    40% { opacity: 1; }
  }
  
  .status-dot {
    display: inline-block;
    animation: dotPulse 1.4s ease-in-out infinite;
  }
  
  .status-dot:nth-child(1) { animation-delay: 0s; }
  .status-dot:nth-child(2) { animation-delay: 0.2s; }
  .status-dot:nth-child(3) { animation-delay: 0.4s; }
`;

// Assessment, Plan, Notes는 별도로 순서 제어하므로 제외
const AP_FIELDS = ['assessment', 'plan', 'notes'];

export interface ChartData {
  [key: string]: ChartFieldValue;
}

interface ChartingResultProps {
  chartData: ChartData | null;
  isRecording: boolean;
  /** 차트 생성 중 여부 */
  isTyping?: boolean;
  /** 'compact': 기본, 'wide': 3열 레이아웃용 (내부 2열) */
  layout?: 'compact' | 'wide';
  /** 선택된 과 ID */
  department?: string;
  /** 사용자 커스텀 필드 (차트 설정에서 수정된 필드) */
  activeFields?: ChartField[];
  /** 환자명 */
  patientName?: string;
  /** 환자 메모 */
  patientMemo?: string;
  /** 세션 시작 시간 */
  sessionStartTime?: Date | null;
  /** 자유 편집 텍스트 */
  freeText?: string;
  /** 자유 편집 텍스트 변경 콜백 */
  onFreeTextChange?: (text: string) => void;
  /** 세션 ID (세션 전환 감지용) */
  sessionId?: string | null;
}

export function ChartingResult({
  chartData,
  isRecording,
  isTyping = false,
  layout = 'compact',
  department = 'general',
  activeFields,
  patientName = '',
  patientMemo = '',
  sessionStartTime = null,
  freeText: externalFreeText = '',
  onFreeTextChange,
  sessionId = null
}: ChartingResultProps) {
  const [isCopied, setIsCopied] = useState(false);
  
  // 자유 편집 가능한 텍스트 상태 (외부 제어 가능)
  const [internalFreeText, setInternalFreeText] = useState<string>('');
  const freeText = onFreeTextChange ? externalFreeText : internalFreeText;
  const setFreeText = onFreeTextChange ? onFreeTextChange : setInternalFreeText;
  
  const [isUserEditing, setIsUserEditing] = useState(false);
  const lastAiTextRef = useRef<string>('');
  const isUpdatingRef = useRef(false);
  
  const typingTimeoutRef = useRef<number | null>(null);

  // 사용자 커스텀 필드가 있으면 사용, 없으면 과별 기본 필드
  const baseFields = useMemo(() => {
    if (activeFields && activeFields.length > 0) {
      return activeFields;
    }
    const preset = DEPARTMENT_PRESETS.find(p => p.id === department);
    return preset?.fields || DEFAULT_FIELDS;
  }, [department, activeFields]);

  // 차트 필드 (A/P 제외)
  const chartFields = useMemo(() => {
    return baseFields.filter(f => !AP_FIELDS.includes(f.id));
  }, [baseFields]);

  // 값을 안전하게 문자열로 변환
  const safeStringValue = useCallback((val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.filter(v => typeof v === 'string').join(', ');
    if (typeof val === 'object') return '';
    return String(val);
  }, []);

  // AI가 생성한 텍스트 계산 (S/O + A + P + Notes)
  const generateAiText = useCallback(() => {
    if (!chartData) return '';
    
    // 필드 값을 포맷팅하는 헬퍼 함수
    const formatField = (fieldId: string): string | null => {
      const field = baseFields.find(f => f.id === fieldId);
      if (!field) return null;
      const fieldValue = chartData[fieldId];
      if (!fieldValue) return null;
      const value = safeStringValue(fieldValue.value);
      if (!value.trim()) return null;
      const label = field.nameEn || field.name;
      return `[${label}]\n${value}`;
    };

    // "None", "없음" 등 실질적으로 빈 값인지 체크
    const isEmptyValue = (val: string): boolean => {
      const normalized = val.trim().toLowerCase();
      return !normalized || 
        normalized === 'none' || 
        normalized === '없음' || 
        normalized === 'n/a' ||
        normalized === '-';
    };

    // S/O 필드 생성 (Assessment, Plan, Notes 제외)
    const soText = chartFields
      .map(field => {
        const fieldValue = chartData[field.id];
        if (!fieldValue) return null;
        const value = safeStringValue(fieldValue.value);
        // PE 필드는 "None" 등 빈 값이면 출력 안 함
        if (!value.trim() || (field.id === 'physicalExam' && isEmptyValue(value))) return null;
        const label = field.nameEn || field.name;
        return `[${label}]\n${value}`;
      })
      .filter(Boolean)
      .join('\n\n');

    // Assessment (DDx) 생성
    const ddxList = chartData?.assessment?.ddxList || [];
    const confirmedDx = ddxList.filter(d => d.isConfirmed && !d.isRemoved);
    const ruleOuts = ddxList.filter(d => !d.isConfirmed && !d.isRemoved);
    
    let assessmentText = '';
    if (confirmedDx.length > 0 || ruleOuts.length > 0) {
      const lines: string[] = [];
      
      // 확정 진단 (Dx)
      confirmedDx.forEach(dx => {
        lines.push(`# ${dx.diagnosis}`);
      });
      
      // 감별 진단 (r/o)
      ruleOuts.forEach(dx => {
        lines.push(`r/o ${dx.diagnosis}`);
      });
      
      if (lines.length > 0) {
        assessmentText = `[Assessment]\n${lines.join('\n')}`;
      }
    }

    // Plan 생성
    const planText = formatField('plan');

    // Notes 생성
    const notesText = formatField('notes');

    // S/O → Assessment → Plan → Notes 순서로 합치기
    return [soText, assessmentText, planText, notesText].filter(Boolean).join('\n\n');
  }, [chartData, chartFields, baseFields, safeStringValue]);

  // chartData가 비워질 때 초기화
  useEffect(() => {
    if (!chartData) {
      setFreeText('');
      setIsUserEditing(false);
      lastAiTextRef.current = '';
    }
  }, [chartData]);

  // 세션 전환 감지용 - sessionId가 변경되면 세션 전환
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      // 세션이 전환됨 - 내부 상태 초기화
      // freeText가 AI 생성 텍스트와 다르면 사용자가 수정한 것이므로 isUserEditing 유지
      const aiText = generateAiText();
      const wasEdited = !!(externalFreeText && aiText && externalFreeText !== aiText);
      
      lastAiTextRef.current = aiText || '';
      setIsUserEditing(wasEdited);
      prevSessionIdRef.current = sessionId;
    }
  }, [sessionId, externalFreeText, generateAiText]);

  // AI 데이터 변경 시 처리
  useEffect(() => {
    if (!chartData || isUserEditing) return;
    
    const aiText = generateAiText();
    
    // 새로운 AI 텍스트가 있고, 이전과 다르면 업데이트
    if (aiText && aiText !== lastAiTextRef.current) {
      isUpdatingRef.current = true;
      
      // 타이핑 효과 (짧은 딜레이 후 텍스트 업데이트)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = window.setTimeout(() => {
        setFreeText(aiText);
        lastAiTextRef.current = aiText;
        isUpdatingRef.current = false;
      }, 300);
    }
  }, [chartData, generateAiText, isUserEditing]);

  // 컴포넌트 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // 사용자가 텍스트를 직접 편집할 때
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (onFreeTextChange) {
      onFreeTextChange(newValue);
    } else {
      setInternalFreeText(newValue);
    }
    setIsUserEditing(true);
  }, [onFreeTextChange]);

  // 녹음이 시작되면 사용자 편집 모드 해제 (새 세션)
  useEffect(() => {
    if (isRecording) {
      setIsUserEditing(false);
    }
  }, [isRecording]);

  // 복사 핸들러 - 환자 정보 + 차트 텍스트 + DDx 복사
  const handleCopyChart = useCallback(() => {
    let copyText = '';
    
    // 환자 정보 헤더
    if (patientName || patientMemo || sessionStartTime) {
      const headerParts = [];
      if (patientName) headerParts.push(`환자: ${patientName}`);
      if (sessionStartTime) {
        headerParts.push(`일시: ${sessionStartTime.toLocaleDateString('ko-KR')} ${sessionStartTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`);
      }
      if (patientMemo) headerParts.push(`메모: ${patientMemo}`);
      
      if (headerParts.length > 0) {
        copyText = headerParts.join(' | ') + '\n' + '─'.repeat(40) + '\n\n';
      }
    }
    
    copyText += freeText;
    
    navigator.clipboard.writeText(copyText);
    setIsCopied(true);
    toast.success('차트가 클립보드에 복사되었습니다');
    setTimeout(() => setIsCopied(false), 2000);
  }, [freeText, patientName, patientMemo, sessionStartTime, chartData]);

  const hasAnyData = freeText.trim().length > 0;

  // 활성 상태 (녹음 중 또는 생성 중)
  const isActive = isRecording || isTyping;

  // Wide 레이아웃 (데스크톱용 - 풀 레이아웃)
  if (layout === 'wide') {
    return (
      <>
        <style>{chartAnimationStyles}</style>
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-none px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <Mic className="w-4 h-4 text-red-500 animate-pulse" />
                ) : isTyping ? (
                  <Sparkles className="w-4 h-4 text-violet-500 animate-pulse" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-600" />
                )}
                <h3 className="font-medium text-sm text-slate-800">
                  {isRecording ? (
                    <>기록중입니다<span className="status-dot">.</span><span className="status-dot">.</span><span className="status-dot">.</span></>
                  ) : isTyping ? (
                    <>정리중입니다<span className="status-dot">.</span><span className="status-dot">.</span><span className="status-dot">.</span></>
                  ) : '진료 기록'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {hasAnyData && (
                  <Button variant="outline" size="sm" onClick={handleCopyChart} className="h-7 text-xs border-slate-300 text-slate-600 hover:bg-slate-100">
                    {isCopied ? <><Check className="w-3 h-3 mr-1" />복사됨</> : <><Copy className="w-3 h-3 mr-1" />복사</>}
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* Content - 자유 편집 가능한 텍스트 영역 */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white p-3 relative">
            {/* Empty State 가이드 */}
            {!freeText && !isActive && (
              <div className="absolute inset-3 flex flex-col items-center justify-center text-center pointer-events-none z-10">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                  <Mic className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-slate-500 text-sm font-medium mb-1">녹음을 시작해보세요</p>
                <p className="text-slate-400 text-xs">마이크 버튼을 눌러 진료를 시작하면<br/>AI가 자동으로 차트를 작성합니다</p>
              </div>
            )}
            <Textarea
              value={freeText}
              onChange={handleTextChange}
              readOnly={isActive}
              className={`flex-1 text-sm bg-white whitespace-pre-wrap leading-relaxed resize-none transition-colors duration-300 focus:ring-1 focus:ring-blue-100 ${
                isActive ? 'border-blue-400 focus:border-blue-400 cursor-default' : 'border-slate-200 focus:border-blue-400'
              } ${!freeText && !isActive ? 'bg-transparent' : ''}`}
              placeholder=""
            />
          </div>
        </div>
      </>
    );
  }

  // Compact 레이아웃 (기본, 모바일)
  return (
    <>
      <style>{chartAnimationStyles}</style>
      
      <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-none px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRecording ? (
                <Mic className="w-4 h-4 text-red-500 animate-pulse" />
              ) : isTyping ? (
                <Sparkles className="w-4 h-4 text-violet-500 animate-pulse" />
              ) : (
                <FileText className="w-4 h-4 text-slate-600" />
              )}
              <h3 className="font-medium text-sm text-slate-800">
                {isRecording ? (
                  <>기록중입니다<span className="status-dot">.</span><span className="status-dot">.</span><span className="status-dot">.</span></>
                ) : isTyping ? (
                  <>정리중입니다<span className="status-dot">.</span><span className="status-dot">.</span><span className="status-dot">.</span></>
                ) : '진료 기록'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {hasAnyData && (
                <Button variant="outline" size="sm" onClick={handleCopyChart} className="h-7 text-xs border-slate-300 text-slate-600 hover:bg-slate-100">
                  {isCopied ? <><Check className="w-3 h-3 mr-1" />복사됨</> : <><Copy className="w-3 h-3 mr-1" />복사</>}
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Content - 자유 편집 가능한 텍스트 영역 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white p-3 relative">
          {/* Empty State 가이드 */}
          {!freeText && !isActive && (
            <div className="absolute inset-3 flex flex-col items-center justify-center text-center pointer-events-none z-10">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <Mic className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-slate-500 text-sm font-medium mb-1">녹음을 시작해보세요</p>
              <p className="text-slate-400 text-xs">마이크 버튼을 눌러 진료를 시작하면<br/>AI가 자동으로 차트를 작성합니다</p>
            </div>
          )}
          <Textarea
            value={freeText}
            onChange={handleTextChange}
            readOnly={isActive}
            className={`flex-1 text-sm bg-white whitespace-pre-wrap leading-relaxed resize-none transition-colors duration-300 focus:ring-1 focus:ring-blue-100 ${
              isActive ? 'border-blue-400 focus:border-blue-400 cursor-default' : 'border-slate-200 focus:border-blue-400'
            } ${!freeText && !isActive ? 'bg-transparent' : ''}`}
            placeholder=""
          />
        </div>
      </div>
    </>
  );
}
