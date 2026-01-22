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
  Loader2, 
  CheckCircle2, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { ChartField, DEPARTMENT_PRESETS } from '@/services/chartService';

export interface ChartData {
  [key: string]: {
    value: string | string[];
    isConfirmed: boolean;
  };
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

  useEffect(() => {
    if (chartData) {
      setEditableData(chartData);
    }
  }, [chartData]);

  const handleFieldChange = useCallback((fieldId: string, value: string | string[]) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        value,
        isConfirmed: prev[fieldId]?.isConfirmed || false
      }
    }));
  }, []);

  const handleConfirmField = useCallback((fieldId: string) => {
    setEditableData(prev => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        isConfirmed: true
      }
    }));
    toast.success('필드가 확정되었습니다');
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
    const chartText = displayFields.map(field => {
      const fieldValue = editableData[field.id];
      if (!fieldValue) return null;
      
      const value = fieldValue.value;
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      if (!displayValue) return null;
      
      const fieldLabel = field.nameEn && field.nameEn !== field.name 
        ? field.nameEn 
        : field.name;
      // 추측 필드에는 (?) 표시 추가
      const uncertainMarker = fieldValue.isConfirmed ? '' : ' (?)';
      return `[${fieldLabel}] ${displayValue}${uncertainMarker}`;
    }).filter(Boolean).join('\n');

    navigator.clipboard.writeText(chartText);
    setIsCopied(true);
    toast.success('차트가 클립보드에 복사되었습니다');
    setTimeout(() => setIsCopied(false), 2000);
  }, [editableData, displayFields]);

  const renderField = (field: ChartField) => {
    const fieldValue = editableData[field.id];
    if (!fieldValue) return null;

    const value = fieldValue.value;
    const isConfirmed = fieldValue.isConfirmed;
    const isArray = field.type === 'tags' || field.type === 'list';
    const arrayValue = Array.isArray(value) ? value : [];
    const stringValue = typeof value === 'string' ? value : '';
    const hasContent = isArray ? arrayValue.length > 0 : stringValue.trim().length > 0;

    return (
      <div
        key={field.id}
        className={`rounded-xl p-4 transition-all ${
          !hasContent
            ? 'bg-slate-50 border border-dashed border-slate-200'
            : isConfirmed
              ? 'bg-teal-50 border border-teal-200'
              : 'bg-amber-50 border border-amber-200 border-dashed'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-semibold flex items-center gap-2">
            {hasContent && (
              isConfirmed ? (
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              ) : (
                <HelpCircle className="w-4 h-4 text-amber-600" />
              )
            )}
            <span className="text-slate-800">
              {field.nameEn && field.nameEn !== field.name 
                ? `${field.nameEn} (${field.name})`
                : field.name
              }
            </span>
            {field.required && <span className="text-red-500">*</span>}
          </label>

          {hasContent && !isConfirmed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConfirmField(field.id)}
              className="h-7 text-xs px-3 border-amber-300 text-amber-700 hover:bg-amber-100 bg-white"
            >
              <Check className="w-3 h-3 mr-1" />
              확정
            </Button>
          )}
        </div>

        {hasContent && !isConfirmed && (
          <p className="text-xs text-amber-600 mb-2.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            AI 추측 - 확정이 필요합니다
          </p>
        )}

        {isArray ? (
          <>
            {arrayValue.filter(item => item).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {arrayValue.filter(item => item).map((item, index) => (
                  <Badge
                    key={index}
                    variant={isConfirmed ? "secondary" : "outline"}
                    className={isConfirmed 
                      ? "bg-teal-100 text-teal-700 border-teal-200" 
                      : "border-amber-300 text-amber-700 bg-white"
                    }
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            )}
            <Textarea
              value={arrayValue.join(', ')}
              onChange={(e) => {
                // 입력 중에는 빈 문자열 유지 (콤마 입력 허용)
                const items = e.target.value.split(',').map(s => s.trim());
                handleFieldChange(field.id, items);
              }}
              onBlur={(e) => {
                // 포커스 해제 시 빈 문자열 제거
                const items = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                handleFieldChange(field.id, items);
              }}
              className="min-h-[60px] bg-white border-slate-200"
              placeholder="콤마(,)로 구분하여 입력"
            />
          </>
        ) : field.type === 'text' ? (
          <Input
            value={stringValue}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.description}
            className="bg-white border-slate-200"
          />
        ) : (
          <Textarea
            value={stringValue}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className="min-h-[80px] bg-white border-slate-200"
            placeholder={field.description}
          />
        )}
      </div>
    );
  };

  const hasChartData = chartData && Object.keys(chartData).length > 0;

  return (
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
              <p className="text-xs text-slate-500">자동 생성 결과</p>
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
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mb-4 animate-pulse">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <p className="text-slate-700 font-medium mb-2">AI 차트 생성 중...</p>
                <p className="text-sm text-slate-500">잠시만 기다려주세요</p>
                <div className="w-48 h-1.5 bg-slate-100 rounded-full mt-4 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-300"
                    style={{ width: `${recordingProgress}%` }}
                  />
                </div>
              </div>
            ) : hasChartData ? (
              <div className="space-y-3">
                {displayFields.map(renderField)}
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
  );
}
