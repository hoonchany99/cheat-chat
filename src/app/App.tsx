import { useState, useRef, useEffect } from 'react';
import { VoiceRecorder } from '@/app/components/VoiceRecorder';
import { TranscriptViewer } from '@/app/components/TranscriptViewer';
import { ChartingResult } from '@/app/components/ChartingResult';
import { ChartSettingsModal } from '@/app/components/ChartSettingsModal';
import { Stethoscope, RotateCcw } from 'lucide-react';
import { Toaster } from '@/app/components/ui/sonner';
import { toast } from 'sonner';
import { type SpeakerSegment } from '@/services/deepgramService';
import {
  generateChart,
  loadChartSettings,
  getFieldsForSettings,
  type ChartSettings,
  type GeneratedChart,
  type ChartField,
  DEPARTMENT_PRESETS,
} from '@/services/chartService';

function App() {
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]); // 최종 화자분리 결과
  const [realtimeSegments, setRealtimeSegments] = useState<SpeakerSegment[]>([]); // 실시간 화자 추정
  const [chartingData, setChartingData] = useState<GeneratedChart | null>(null);
  const [chartFields, setChartFields] = useState<ChartField[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false); // 화자분리 처리 중
  const [isGeneratingChart, setIsGeneratingChart] = useState(false);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(loadChartSettings);
  const [recordingTime, setRecordingTime] = useState(0); // 녹음 시간 (초)
  const [audioLevel, setAudioLevel] = useState(0); // 오디오 레벨 (0-1)
  const [realtimeText, setRealtimeText] = useState(''); // 실시간 전사 텍스트
  
  // 차트 생성용 참조 (최신 세그먼트 유지)
  const speakerSegmentsRef = useRef<SpeakerSegment[]>([]);

  // 설정 변경 시 필드 업데이트
  useEffect(() => {
    setChartFields(getFieldsForSettings(chartSettings));
  }, [chartSettings]);

  // 현재 선택된 진료과 이름
  const selectedDepartmentName = DEPARTMENT_PRESETS.find(p => p.id === chartSettings.selectedDepartment)?.name || '일반';

  // 호환성용 (사용 안 함)
  const handleTranscriptUpdate = (_text: string) => {};

  // 새 발화 추가 (처음에는 pending 상태)
  const handleRealtimeSegment = (segment: SpeakerSegment) => {
    setRealtimeSegments(prev => [...prev, segment]);
  };

  // 전체 세그먼트 업데이트 (GPT-4o-mini 배치 분류 후)
  const handleRealtimeSegmentsUpdate = (segments: SpeakerSegment[]) => {
    setRealtimeSegments(segments);
  };

  // 최종 화자 분리 결과 (녹음 종료 후 GPT에서 반환)
  const handleFullUpdate = (segments: SpeakerSegment[]) => {
    speakerSegmentsRef.current = segments;
    setSpeakerSegments([...segments]); // GPT 정확한 화자분리 결과
    setIsProcessingAudio(false); // 화자분리 처리 완료
  };

  const handleRecordingStart = () => {
    setIsRecording(true);
    setIsProcessingAudio(false);
    setSpeakerSegments([]);
    setRealtimeSegments([]); // 실시간 세그먼트 초기화
    setChartingData(null);
    speakerSegmentsRef.current = [];
    setRecordingTime(0);
    setAudioLevel(0);
    setRealtimeText('');
  };

  // 녹음 진행 상황 업데이트
  const handleRecordingProgress = (time: number, level: number, text: string) => {
    setRecordingTime(time);
    setAudioLevel(level);
    setRealtimeText(text);
  };

  // 녹음 종료 후 화자분리 처리 시작
  const handleProcessingStart = () => {
    setIsRecording(false);
    setIsProcessingAudio(true);
  };

  const handleRecordingComplete = async () => {
    // isRecording은 handleProcessingStart에서 이미 false로 설정됨
    // isProcessingAudio는 handleFullUpdate에서 false로 설정됨
    
    const segments = speakerSegmentsRef.current;
    console.log('녹음 완료! 세그먼트:', segments.length, '개');
    
    // 대화 내용이 없으면 차트 생성 스킵
    if (segments.length === 0 || segments.every(s => s.speaker === 'pending')) {
      toast.warning('대화 내용이 없어 차트를 생성할 수 없습니다.');
      return;
    }
    
    // 차트 자동 생성 (설정 기반)
    setIsGeneratingChart(true);
    toast.loading(`AI가 ${selectedDepartmentName} 차트를 생성하고 있습니다...`, { id: 'chart-gen' });
    
    try {
      const chart = await generateChart(segments, chartSettings);
      
      if (chart) {
        setChartingData(chart);
        setChartFields(getFieldsForSettings(chartSettings));
        toast.success('차트가 생성되었습니다!', { id: 'chart-gen' });
      } else {
        toast.error('차트 생성에 실패했습니다. 다시 시도해주세요.', { id: 'chart-gen' });
      }
    } catch (error) {
      console.error('차트 생성 오류:', error);
      toast.error('차트 생성 중 오류가 발생했습니다.', { id: 'chart-gen' });
    } finally {
      setIsGeneratingChart(false);
    }
  };


  // 전체 리셋 (대화 + 차트 초기화)
  const handleReset = () => {
    if (isRecording) {
      toast.warning('녹음 중에는 리셋할 수 없습니다.');
      return;
    }
    
    setSpeakerSegments([]);
    setChartingData(null);
    speakerSegmentsRef.current = [];
    toast.success('초기화되었습니다.');
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Cheat Chat AI</h1>
                <p className="text-sm text-muted-foreground">
                  진료 대화를 자동으로 기록하고 차팅합니다
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">
                📋 {selectedDepartmentName}
              </span>
              <ChartSettingsModal
                settings={chartSettings}
                onSettingsChange={setChartSettings}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Recording + Usage Guide Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recording Card */}
          <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between">
            <VoiceRecorder
              onTranscriptUpdate={handleTranscriptUpdate}
              onRealtimeSegment={handleRealtimeSegment}
              onRealtimeSegmentsUpdate={handleRealtimeSegmentsUpdate}
              onFullUpdate={handleFullUpdate}
              onRecordingStart={handleRecordingStart}
              onProcessingStart={handleProcessingStart}
              onRecordingComplete={handleRecordingComplete}
              onRecordingProgress={handleRecordingProgress}
              department={chartSettings.selectedDepartment}
            />
            <button
              onClick={handleReset}
              disabled={isRecording || isGeneratingChart}
              className="p-2 rounded-lg border bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="초기화"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
                </div>

          {/* Usage Guide Card */}
          <div className="lg:col-span-2 bg-muted/50 border rounded-lg p-4">
            <h3 className="font-medium text-sm mb-2">사용 방법</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                <p className="text-muted-foreground">왼쪽 <span className="text-foreground font-medium">마이크 버튼</span>을 클릭하여 진료 녹음을 시작하세요.</p>
                </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                <p className="text-muted-foreground">의사-환자 대화가 <span className="text-foreground font-medium">실시간으로 텍스트</span>로 변환됩니다.</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                <p className="text-muted-foreground">녹음 종료 시 AI가 <span className="text-foreground font-medium">차트</span>를 자동 생성합니다.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-end">
          {/* Left Column - Transcript */}
          <div className="h-[600px]">
            <TranscriptViewer 
              segments={speakerSegments}
              realtimeSegments={realtimeSegments}
              isRecording={isRecording}
              isProcessing={isProcessingAudio}
              recordingTime={recordingTime}
              audioLevel={audioLevel}
              realtimeText={realtimeText}
            />
              </div>

          {/* Right Column - Charting Result */}
          <div className="h-[600px]">
                <ChartingResult 
                  data={chartingData} 
              fields={chartFields}
              settings={chartSettings}
              isLoading={isGeneratingChart}
                />
              </div>
            </div>
      </main>
    </div>
  );
}

export default App;
