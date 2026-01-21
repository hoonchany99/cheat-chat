import { useState, useEffect } from 'react';
import { Card } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Textarea } from '@/app/components/ui/textarea';
import { Input } from '@/app/components/ui/input';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { FileText, Copy, Check, Loader2, Sparkles, CheckCircle2, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { GeneratedChart, ChartField, ChartSettings, ChartFieldValue } from '@/services/chartService';

interface ChartingResultProps {
  data: GeneratedChart | null;
  fields: ChartField[];
  settings: ChartSettings;
  isLoading?: boolean;
}

export function ChartingResult({ data, fields, settings, isLoading }: ChartingResultProps) {
  const [editableData, setEditableData] = useState<GeneratedChart | null>(data);
  const [copied, setCopied] = useState(false);

  // data prop이 변경되면 editableData 업데이트
  useEffect(() => {
    setEditableData(data);
  }, [data]);

  const handleFieldChange = (fieldId: string, value: string | string[]) => {
    if (editableData) {
      setEditableData({
        ...editableData,
        [fieldId]: {
          ...editableData[fieldId],
          value,
        },
      });
    }
  };

  // 추측 → 확실로 확정
  const handleConfirmField = (fieldId: string) => {
    if (editableData) {
      setEditableData({
        ...editableData,
        [fieldId]: {
          ...editableData[fieldId],
          isConfirmed: true,
        },
      });
      toast.success('확정되었습니다');
    }
  };

  // 확실한 부분만 복사
  const handleCopy = () => {
    if (editableData) {
      const lines = fields
        .filter(field => {
          const fieldValue = editableData[field.id];
          // 확실한 필드만 포함 (값이 있는 경우)
          if (!fieldValue?.isConfirmed) return false;
          const value = fieldValue.value;
          if (Array.isArray(value)) return value.length > 0;
          return value && value.trim().length > 0;
        })
        .map(field => {
          const fieldValue = editableData[field.id];
          const value = fieldValue.value;
          const displayValue = Array.isArray(value) ? value.join(', ') : value;
          return `${field.name}${field.nameEn ? ` (${field.nameEn})` : ''}:\n${displayValue}`;
        });
      
      if (lines.length === 0) {
        toast.warning('확정된 항목이 없습니다. AI 추측 항목을 확정해주세요.');
        return;
      }
      
      const textToCopy = lines.join('\n\n');
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success(`확정된 ${lines.length}개 항목이 복사되었습니다`);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 전체 복사 (확실 + 추측 모두)
  const handleCopyAll = () => {
    if (editableData) {
      const lines = fields
        .filter(field => {
          const fieldValue = editableData[field.id];
          const value = fieldValue?.value;
          if (Array.isArray(value)) return value.length > 0;
          return value && value.trim().length > 0;
        })
        .map(field => {
          const fieldValue = editableData[field.id];
          const value = fieldValue.value;
          const displayValue = Array.isArray(value) ? value.join(', ') : value;
          const prefix = fieldValue.isConfirmed ? '' : '[AI 추측] ';
          return `${prefix}${field.name}${field.nameEn ? ` (${field.nameEn})` : ''}:\n${displayValue}`;
        });
      
      const textToCopy = lines.join('\n\n');
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success('전체 내용이 복사되었습니다');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // SOAP 필드 매핑
  const soapFields = {
    subjective: fields.find(f => f.id === 'chiefComplaint'),
    objective: fields.find(f => f.id === 'historyOfPresentIllness'),
    assessment: fields.find(f => f.id === 'assessment'),
    plan: fields.find(f => f.id === 'plan'),
  };

  // 통계 계산
  const getStats = () => {
    if (!editableData) return { confirmed: 0, inferred: 0 };
    
    let confirmed = 0;
    let inferred = 0;
    
    fields.forEach(field => {
      const fieldValue = editableData[field.id];
      if (!fieldValue) return;
      
      const value = fieldValue.value;
      const hasContent = Array.isArray(value) ? value.length > 0 : value && value.trim().length > 0;
      
      if (hasContent) {
        if (fieldValue.isConfirmed) {
          confirmed++;
        } else {
          inferred++;
        }
      }
    });
    
    return { confirmed, inferred };
  };

  // 로딩 중
  if (isLoading) {
    return (
      <Card className="h-full flex items-center justify-center p-8 overflow-hidden">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <Sparkles className="w-20 h-20 text-primary/30 animate-pulse" />
            <Loader2 className="w-10 h-10 text-primary animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-lg font-medium mb-2">AI가 차트를 생성하고 있습니다</p>
          <p className="text-sm text-muted-foreground">대화 내용을 분석하여 차트로 변환 중...</p>
        </div>
      </Card>
    );
  }

  // 데이터 없음
  if (!editableData) {
    return (
      <Card className="h-full flex items-center justify-center p-8 overflow-hidden">
        <div className="text-center text-muted-foreground">
          <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p>녹음을 완료하면 AI가 자동으로 차팅을 생성합니다</p>
        </div>
      </Card>
    );
  }

  const stats = getStats();

  // 필드 렌더링 함수
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
        className={`rounded-lg p-3 transition-colors ${
          !hasContent 
            ? 'bg-background' 
            : isConfirmed 
              ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900' 
              : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 border-dashed'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium flex items-center gap-2">
            {hasContent && (
              isConfirmed ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )
            )}
            {field.nameEn || field.name}
            <span className="text-muted-foreground font-normal">({field.name})</span>
            {field.required && <span className="text-destructive">*</span>}
          </label>
          
          {/* 추측인 경우 확정 버튼 */}
          {hasContent && !isConfirmed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConfirmField(field.id)}
              className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950"
            >
              <Check className="w-3 h-3 mr-1" />
              확정
            </Button>
          )}
        </div>
        
        {/* 추측 표시 */}
        {hasContent && !isConfirmed && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            ⚠️ AI 추측 - 대화에서 직접 언급되지 않은 내용입니다
          </p>
        )}
        
        {isArray ? (
          <>
            {arrayValue.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {arrayValue.map((item, index) => (
                  <Badge 
                    key={index} 
                    variant={isConfirmed ? "secondary" : "outline"}
                    className={!isConfirmed ? "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400" : ""}
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            )}
            <Textarea
              value={arrayValue.join(', ')}
              onChange={(e) => handleFieldChange(
                field.id, 
                e.target.value.split(',').map(s => s.trim()).filter(s => s)
              )}
              className="min-h-[60px]"
              placeholder="콤마(,)로 구분하여 입력"
            />
          </>
        ) : field.type === 'text' ? (
          <Input
            value={stringValue}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.description}
          />
        ) : (
          <Textarea
            value={stringValue}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className="min-h-[80px]"
            placeholder={field.description}
          />
        )}
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">자동 생성 차트</h3>
          {/* 통계 표시 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3 h-3" />
              {stats.confirmed}
            </span>
            {stats.inferred > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <HelpCircle className="w-3 h-3" />
                {stats.inferred}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyAll}
            className="text-xs"
          >
            전체 복사
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? '복사됨' : '확정만 복사'}
          </Button>
        </div>
      </div>
      
      {/* 범례 */}
      {stats.inferred > 0 && (
        <div className="px-4 py-2 bg-muted/50 border-b text-xs flex items-center gap-4">
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3" />
            확실한 정보 (대화에서 언급됨)
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <HelpCircle className="w-3 h-3" />
            AI 추측 (확정 필요)
          </span>
        </div>
      )}
      
      <Tabs defaultValue="structured" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-4 flex-shrink-0">
          <TabsTrigger value="structured">구조화 양식</TabsTrigger>
          {settings.includeSOAP && (
            <TabsTrigger value="soap">SOAP 형식</TabsTrigger>
          )}
        </TabsList>

        {/* 구조화 양식 탭 - 동적 필드 */}
        <TabsContent value="structured" className="flex-1 p-4 space-y-3 overflow-y-auto min-h-0">
          {fields.map(field => renderField(field))}
        </TabsContent>
        
        {/* SOAP 형식 탭 */}
        {settings.includeSOAP && (
          <TabsContent value="soap" className="flex-1 p-4 space-y-4 overflow-y-auto min-h-0">
            {soapFields.subjective && renderField(soapFields.subjective)}
            {soapFields.objective && renderField(soapFields.objective)}
            {soapFields.assessment && renderField(soapFields.assessment)}
            {soapFields.plan && renderField(soapFields.plan)}
          </TabsContent>
        )}
      </Tabs>
    </Card>
  );
}
