import { useState, useCallback } from 'react';
import { Button } from '@/app/components/ui/button';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge } from '@/app/components/ui/badge';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Target,
  ClipboardList,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { DdxItem, ChartFieldValue } from '@/services/chartService';

interface AssessmentPlanPanelProps {
  assessmentData: ChartFieldValue | null;
  planData: ChartFieldValue | null;
  followUpData: ChartFieldValue | null;
  diagnosisConfirmedData: ChartFieldValue | null;
  onAssessmentChange: (value: string) => void;
  onPlanChange: (value: string) => void;
  onFollowUpChange: (value: string) => void;
  onDiagnosisConfirmedChange: (value: string[]) => void;
  onConfirmDDx: (ddxId: string) => void;
  onRemoveDDx: (ddxId: string) => void;
  onRestoreDDx: (ddxId: string) => void;
  onUnconfirmDDx: (ddxId: string) => void;
  isGenerating: boolean;
  isRecording: boolean;
  isMiniMode?: boolean;
  onExpand?: () => void;
}

export function AssessmentPlanPanel({
  assessmentData,
  planData,
  followUpData,
  diagnosisConfirmedData,
  onAssessmentChange,
  onPlanChange,
  onFollowUpChange,
  onConfirmDDx,
  onRemoveDDx,
  onRestoreDDx,
  onUnconfirmDDx,
  isGenerating,
  isRecording,
  isMiniMode = false,
  onExpand
}: AssessmentPlanPanelProps) {
  const [expandedDDx, setExpandedDDx] = useState<Set<string>>(new Set());
  const [isCopied, setIsCopied] = useState(false);

  const toggleDDxDetails = useCallback((ddxId: string) => {
    setExpandedDDx(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ddxId)) newSet.delete(ddxId);
      else newSet.add(ddxId);
      return newSet;
    });
  }, []);

  // 확정된 진단 목록
  const confirmedDiagnoses = diagnosisConfirmedData?.value 
    ? (Array.isArray(diagnosisConfirmedData.value) ? diagnosisConfirmedData.value : [diagnosisConfirmedData.value])
    : [];

  // DDx 리스트
  const ddxList = assessmentData?.ddxList || [];
  const visibleDdx = ddxList.filter(item => !item.isRemoved && (item.confidence === 'high' || item.confidence === 'medium'));
  const confirmedDdx = ddxList.filter(item => item.isConfirmed);

  // 복사
  const handleCopy = useCallback(() => {
    let text = '';
    
    if (confirmedDiagnoses.length > 0) {
      text += `# ${confirmedDiagnoses.join(', ')}\n\n`;
    }
    
    visibleDdx.forEach(ddx => {
      if (!ddx.isConfirmed) {
        text += `r/o ${ddx.diagnosis}\n`;
      }
    });
    
    if (planData?.value) {
      text += `\n[Plan]\n${planData.value}`;
    }
    
    if (followUpData?.value) {
      text += `\n\n[F/U]\n${followUpData.value}`;
    }
    
    navigator.clipboard.writeText(text.trim());
    setIsCopied(true);
    toast.success('A/P 복사됨');
    setTimeout(() => setIsCopied(false), 2000);
  }, [confirmedDiagnoses, visibleDdx, planData, followUpData]);

  // 미니 모드 (모바일 하단 바)
  if (isMiniMode) {
    const hasConfirmed = confirmedDiagnoses.length > 0 || confirmedDdx.length > 0;
    const ddxCount = visibleDdx.filter(d => !d.isConfirmed).length;
    
    return (
      <button
        onClick={onExpand}
        className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5" />
          <div className="text-left">
            <div className="text-sm font-semibold">
              {hasConfirmed ? (
                <span># {confirmedDiagnoses[0] || confirmedDdx[0]?.diagnosis}</span>
              ) : (
                <span className="opacity-80">Assessment & Plan</span>
              )}
            </div>
            {ddxCount > 0 && (
              <div className="text-xs opacity-80">
                r/o {ddxCount}개 감별
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRecording && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
          <Maximize2 className="w-4 h-4" />
        </div>
      </button>
    );
  }

  // 전체 모드
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl border-2 border-teal-200 overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-teal-200 bg-white/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-teal-800">Assessment & Plan</h3>
              <p className="text-[10px] text-teal-600">
                {isGenerating ? '분석 중...' : isRecording ? '실시간 업데이트' : '진단 및 계획'}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs border-teal-300 text-teal-700 hover:bg-teal-100 bg-white"
          >
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* 확정 진단 */}
          {confirmedDiagnoses.length > 0 && (
            <div className="bg-teal-100 rounded-xl p-3 border border-teal-300">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-teal-700" />
                <span className="text-xs font-bold text-teal-700">확정 진단</span>
              </div>
              <div className="space-y-1">
                {confirmedDiagnoses.map((dx, i) => (
                  <div key={i} className="text-sm font-semibold text-teal-900">
                    # {dx}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DDx 리스트 */}
          {visibleDdx.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span className="text-[10px] font-semibold text-slate-600">AI DDx (확정 가능)</span>
              </div>
              {visibleDdx.filter(d => !d.isConfirmed).map((item) => {
                const isExpanded = expandedDDx.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg p-2.5 border border-amber-200 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-sm font-medium text-amber-800">r/o {item.diagnosis}</span>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${
                          item.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {item.confidence === 'high' ? '높음' : '중간'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onConfirmDDx(item.id)}
                          className="h-6 text-[10px] px-2 border-teal-300 text-teal-700 bg-white hover:bg-teal-50"
                        >
                          <Check className="w-3 h-3 mr-0.5" />확정
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveDDx(item.id)}
                          className="h-6 text-[10px] px-1.5 text-slate-400 hover:text-slate-600"
                        >
                          제외
                        </Button>
                      </div>
                    </div>
                    {item.reason && (
                      <>
                        <button
                          onClick={() => toggleDDxDetails(item.id)}
                          className="text-[10px] text-slate-500 mt-1 flex items-center gap-0.5"
                        >
                          {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                          근거
                        </button>
                        {isExpanded && (
                          <div className="mt-1.5 p-2 bg-slate-50 rounded text-[10px] text-slate-600">
                            {item.reason}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Assessment 텍스트 (확정 진단이 있을 때만) */}
          {assessmentData?.value && typeof assessmentData.value === 'string' && assessmentData.value.trim() && (
            <div className="bg-white rounded-lg p-2.5 border border-slate-200">
              <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Assessment Note</label>
              <Textarea
                value={assessmentData.value}
                onChange={(e) => onAssessmentChange(e.target.value)}
                className="min-h-[40px] text-xs bg-slate-50 border-slate-200"
                placeholder="# Confirmed Dx"
              />
            </div>
          )}

          {/* Plan */}
          <div className="bg-white rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ClipboardList className="w-3 h-3 text-blue-600" />
              <label className="text-[10px] font-semibold text-slate-600">Plan</label>
            </div>
            <Textarea
              value={typeof planData?.value === 'string' ? planData.value : ''}
              onChange={(e) => onPlanChange(e.target.value)}
              className="min-h-[60px] text-xs bg-slate-50 border-slate-200"
              placeholder="[Orders]&#10;- Blood glucose&#10;&#10;[AI Suggestions]&#10;- Brain CT (LOC + Hx)"
            />
          </div>

          {/* Follow-up */}
          <div className="bg-white rounded-lg p-2.5 border border-slate-200">
            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">F/U</label>
            <Textarea
              value={typeof followUpData?.value === 'string' ? followUpData.value : ''}
              onChange={(e) => onFollowUpChange(e.target.value)}
              className="min-h-[30px] text-xs bg-slate-50 border-slate-200"
              placeholder="f/u 1wk (or leave empty)"
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
