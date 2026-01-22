import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Switch } from '@/app/components/ui/switch';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Settings, Plus, GripVertical, Building2, Trash2, RotateCcw, ChevronDown } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  type ChartSettings,
  type ChartField,
  DEPARTMENT_PRESETS,
  getFieldsForDepartment,
  saveChartSettings,
} from '@/services/chartService';

// 드래그 가능한 필드 아이템 컴포넌트
interface SortableFieldItemProps {
  field: ChartField;
  index: number;
  onToggleRequired: (id: string) => void;
  onRemove: (id: string) => void;
}

function SortableFieldItem({ field, index, onToggleRequired, onRemove }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 0,
  };

  const isCustom = field.id.startsWith('custom_');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg border bg-background ${
        isDragging ? 'shadow-lg border-primary ring-2 ring-primary/20' : 'hover:bg-muted/50'
      }`}
    >
      {/* 드래그 핸들 */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      
      {/* 순서 번호 */}
      <span className="text-xs text-muted-foreground w-5 text-center font-mono">
        {index + 1}
      </span>
      
      {/* 필드 정보 */}
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          {field.nameEn || field.name}
          <span className="text-muted-foreground ml-1 text-sm">
            ({field.name})
          </span>
        </span>
        {isCustom && (
          <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-600 border-blue-200">
            커스텀
          </Badge>
        )}
      </div>
      
      {/* 타입 뱃지 */}
      <Badge variant="secondary" className="text-xs hidden sm:flex">
        {field.type === 'text' ? '한줄' : field.type === 'textarea' ? '여러줄' : '태그'}
      </Badge>
      
      {/* 필수 여부 토글 */}
      <Button
        variant={field.required ? "default" : "ghost"}
        size="sm"
        className="h-6 text-xs px-2"
        onClick={() => onToggleRequired(field.id)}
      >
        {field.required ? '필수' : '선택'}
      </Button>
      
      {/* 삭제 버튼 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:bg-destructive/10"
        onClick={() => onRemove(field.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface ChartSettingsModalProps {
  settings: ChartSettings;
  onSettingsChange: (settings: ChartSettings) => void;
  departmentName?: string;
}

export function ChartSettingsModal({ settings, onSettingsChange, departmentName }: ChartSettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<ChartSettings>(settings);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<ChartField['type']>('textarea');

  // dnd-kit 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, open]);

  const handleSave = () => {
    saveChartSettings(localSettings);
    onSettingsChange(localSettings);
    setOpen(false);
  };

  // 진료과 변경 시 해당 프리셋의 필드로 초기화
  const handleDepartmentChange = (departmentId: string) => {
    const presetFields = getFieldsForDepartment(departmentId);
    setLocalSettings(prev => ({
      ...prev,
      selectedDepartment: departmentId,
      activeFields: presetFields,
      customFields: [], // 호환성용 (deprecated)
    }));
  };

  // 필드 추가
  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    
    const newField: ChartField = {
      id: `custom_${Date.now()}`,
      name: newFieldName.trim(),
      type: newFieldType,
      required: false,
    };
    
    setLocalSettings(prev => ({
      ...prev,
      activeFields: [...prev.activeFields, newField],
    }));
    
    setNewFieldName('');
  };

  // 필드 삭제
  const handleRemoveField = (fieldId: string) => {
    setLocalSettings(prev => ({
      ...prev,
      activeFields: prev.activeFields.filter(f => f.id !== fieldId),
    }));
  };

  // 필수 여부 토글
  const handleToggleRequired = (fieldId: string) => {
    setLocalSettings(prev => ({
      ...prev,
      activeFields: prev.activeFields.map(f => 
        f.id === fieldId ? { ...f, required: !f.required } : f
      ),
    }));
  };

  // 드래그 앤 드롭 핸들러
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalSettings(prev => {
        const oldIndex = prev.activeFields.findIndex(f => f.id === active.id);
        const newIndex = prev.activeFields.findIndex(f => f.id === over.id);
        
        return {
          ...prev,
          activeFields: arrayMove(prev.activeFields, oldIndex, newIndex),
        };
      });
    }
  };

  // 기본값으로 복원
  const handleResetToDefault = () => {
    const presetFields = getFieldsForDepartment(localSettings.selectedDepartment);
    setLocalSettings(prev => ({
      ...prev,
      activeFields: presetFields,
    }));
  };

  const selectedPreset = DEPARTMENT_PRESETS.find(p => p.id === localSettings.selectedDepartment);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-all group border border-transparent hover:border-slate-300">
          {departmentName && (
            <span className="text-xs font-medium text-slate-600">{departmentName}</span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            차트 설정
          </DialogTitle>
          <DialogDescription>
            진료과별 차트 양식을 선택하고 필드를 자유롭게 수정하세요
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="department" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="department">진료과 선택</TabsTrigger>
            <TabsTrigger value="fields">필드 관리</TabsTrigger>
            <TabsTrigger value="advanced">고급 설정</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* 진료과 선택 탭 */}
            <TabsContent value="department" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {DEPARTMENT_PRESETS.map(preset => (
                  <Button
                    key={preset.id}
                    variant={localSettings.selectedDepartment === preset.id ? 'default' : 'outline'}
                    className="h-auto py-3 flex flex-col items-start gap-1"
                    onClick={() => handleDepartmentChange(preset.id)}
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-xs opacity-70">
                      {preset.fields.length}개 필드
                    </span>
                  </Button>
                ))}
              </div>

              {selectedPreset && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">{selectedPreset.name} 기본 필드</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPreset.fields.map(field => (
                      <Badge key={field.id} variant="secondary">
                        {field.nameEn || field.name}
                        <span className="text-muted-foreground ml-1">({field.name})</span>
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* 필드 관리 탭 */}
            <TabsContent value="fields" className="mt-0 space-y-4">
              {/* 헤더 + 기본값 복원 버튼 */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">현재 필드 ({localSettings.activeFields.length}개)</h4>
                  <p className="text-xs text-muted-foreground">
                    드래그하여 순서 변경, 휴지통으로 삭제
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetToDefault}
                  className="gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  기본값 복원
                </Button>
              </div>

              {/* 필드 목록 - 드래그 가능 (스크롤 영역) */}
              {localSettings.activeFields.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[280px] overflow-y-auto p-2">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    >
                      <SortableContext
                        items={localSettings.activeFields.map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {localSettings.activeFields.map((field, index) => (
                            <SortableFieldItem
                              key={field.id}
                              field={field}
                              index={index}
                              onToggleRequired={handleToggleRequired}
                              onRemove={handleRemoveField}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <p>필드가 없습니다</p>
                  <p className="text-sm">아래에서 새 필드를 추가하거나 기본값을 복원하세요</p>
                </div>
              )}

              {/* 새 필드 추가 */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">새 필드 추가</h4>
                <div className="flex gap-2">
                  <Input
                    placeholder="필드명 (예: 알레르기 이력)"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
                  />
                  <select
                    className="border rounded-md px-3 py-2 text-sm bg-background"
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as ChartField['type'])}
                  >
                    <option value="text">텍스트 (한 줄)</option>
                    <option value="textarea">텍스트 (여러 줄)</option>
                    <option value="tags">태그 (목록)</option>
                  </select>
                  <Button onClick={handleAddField} disabled={!newFieldName.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* 고급 설정 탭 */}
            <TabsContent value="advanced" className="mt-0 space-y-4">
              {/* SOAP 포함 여부 */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="include-soap">SOAP 형식 탭 포함</Label>
                  <p className="text-sm text-muted-foreground">
                    구조화 양식 외에 SOAP 형식 탭도 표시합니다
                  </p>
                </div>
                <Switch
                  id="include-soap"
                  checked={localSettings.includeSOAP}
                  onCheckedChange={(checked) =>
                    setLocalSettings(prev => ({ ...prev, includeSOAP: checked }))
                  }
                />
              </div>

              {/* 추가 프롬프트 */}
              <div className="space-y-2">
                <Label htmlFor="additional-prompt">추가 지시사항</Label>
                <Textarea
                  id="additional-prompt"
                  placeholder="AI에게 전달할 추가 지시사항을 입력하세요&#10;예: 약물 용량은 반드시 포함해주세요"
                  value={localSettings.additionalPrompt}
                  onChange={(e) =>
                    setLocalSettings(prev => ({ ...prev, additionalPrompt: e.target.value }))
                  }
                  className="min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">
                  차트 생성 시 AI에게 전달되는 추가 지시사항입니다
                </p>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="mt-4 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>
            설정 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
