// 차트 설정 및 생성 서비스

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// ==================== 설정 타입 ====================

export interface ChartField {
  id: string;
  name: string;        // 필드명 (예: "주호소", "현병력")
  nameEn?: string;     // 영문명 (예: "Chief Complaint")
  type: 'text' | 'textarea' | 'list' | 'tags';
  required: boolean;
  description?: string; // GPT에게 제공할 설명
}

export interface DepartmentPreset {
  id: string;
  name: string;        // 과 이름 (예: "내과", "피부과")
  fields: ChartField[];
  promptContext?: string; // 과별 추가 컨텍스트
}

export interface ChartSettings {
  selectedDepartment: string;
  activeFields: ChartField[];     // 현재 사용 중인 필드들 (순서/삭제 가능)
  customFields: ChartField[];     // 사용자가 추가한 커스텀 필드들 (deprecated, 호환성용)
  additionalPrompt: string;       // 사용자 추가 지시사항
  includeSOAP: boolean;           // SOAP 형식 포함 여부
}

// ==================== 기본 프리셋 ====================

export const DEFAULT_FIELDS: ChartField[] = [
  { id: 'chiefComplaint', name: '주호소', nameEn: 'Chief Complaint', type: 'textarea', required: true, description: '환자가 방문한 주된 이유' },
  { id: 'historyOfPresentIllness', name: '현병력', nameEn: 'History of Present Illness', type: 'textarea', required: true, description: '증상의 시작, 경과, 특징' },
  { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: '의사의 임상적 판단' },
  { id: 'plan', name: '치료계획', nameEn: 'Plan', type: 'textarea', required: true, description: '검사, 처방, 추적관찰 계획' },
  { id: 'diagnosis', name: '진단명', nameEn: 'Diagnosis', type: 'tags', required: false, description: '진단명 목록' },
  { id: 'medications', name: '처방약물', nameEn: 'Medications', type: 'tags', required: false, description: '약물명, 용량, 용법' },
  { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: '특이사항, 다음 내원일정, 주의사항 등' },
];

export const DEPARTMENT_PRESETS: DepartmentPreset[] = [
  {
    id: 'general',
    name: '일반',
    fields: DEFAULT_FIELDS,
    promptContext: `You are a General Practitioner documenting an outpatient encounter.
Use standard medical terminology in English. Write professionally as a physician.
Example terms: dyspepsia, malaise, URI symptoms, NSAID, PO, PRN, f/u`,
  },
  {
    id: 'internal',
    name: '내과',
    fields: [
      ...DEFAULT_FIELDS,
      { id: 'vitalSigns', name: '활력징후', nameEn: 'Vital Signs', type: 'text', required: false, description: 'BP, HR, BT, RR, SpO2' },
      { id: 'labResults', name: '검사결과', nameEn: 'Lab Results', type: 'textarea', required: false, description: 'CBC, LFT, RFT, lipid panel, imaging findings' },
    ],
    promptContext: `You are an Internal Medicine physician (Internist) documenting a clinical encounter.
Use proper medical terminology: HTN, DM, CKD, GERD, dyslipidemia, hepatic steatosis, etc.
Include relevant lab values with units when mentioned. Use abbreviations: BP, HR, BT, CBC, LFT, RFT.
Example: "Pt presents with epigastric pain, r/o GERD vs PUD. Plan: EGD, PPI therapy."`,
  },
  {
    id: 'dermatology',
    name: '피부과',
    fields: [
      { id: 'chiefComplaint', name: '주호소', nameEn: 'Chief Complaint', type: 'textarea', required: true, description: '피부 증상의 주된 호소' },
      { id: 'lesionDescription', name: '병변 기술', nameEn: 'Lesion Description', type: 'textarea', required: true, description: 'Morphology, distribution, configuration' },
      { id: 'duration', name: '발생 시기', nameEn: 'Duration', type: 'text', required: true, description: 'Onset timing' },
      { id: 'symptoms', name: '동반 증상', nameEn: 'Associated Symptoms', type: 'tags', required: false, description: 'pruritus, pain, burning' },
      { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: 'DDx' },
      { id: 'plan', name: '치료계획', nameEn: 'Plan', type: 'textarea', required: true, description: 'Topical/systemic treatment plan' },
      { id: 'diagnosis', name: '진단명', nameEn: 'Diagnosis', type: 'tags', required: false, description: 'Dermatologic diagnosis' },
      { id: 'medications', name: '처방약물', nameEn: 'Medications', type: 'tags', required: false, description: 'Topical agents, oral medications' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: 'F/U schedule, precautions, special instructions' },
    ],
    promptContext: `You are a Dermatologist documenting a skin examination.
Use morphological terms: macule, papule, plaque, vesicle, bulla, pustule, nodule, patch.
Describe: location, size (cm), shape, border (well-defined/ill-defined), color, surface.
Example: "Erythematous scaly plaque, 3x4cm, well-demarcated border on R forearm. DDx: psoriasis vs nummular eczema."`,
  },
  {
    id: 'orthopedics',
    name: '정형외과',
    fields: [
      { id: 'chiefComplaint', name: '주호소', nameEn: 'Chief Complaint', type: 'textarea', required: true, description: 'Pain location and character' },
      { id: 'injuryMechanism', name: '손상 기전', nameEn: 'Mechanism of Injury', type: 'textarea', required: false, description: 'MOI details' },
      { id: 'painScale', name: '통증 정도', nameEn: 'Pain Scale', type: 'text', required: false, description: 'NRS 0-10' },
      { id: 'physicalExam', name: '이학적 검사', nameEn: 'Physical Exam', type: 'textarea', required: true, description: 'ROM, special tests, neurovascular status' },
      { id: 'imaging', name: '영상검사', nameEn: 'Imaging', type: 'textarea', required: false, description: 'X-ray, MRI findings' },
      { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: 'Clinical impression' },
      { id: 'plan', name: '치료계획', nameEn: 'Plan', type: 'textarea', required: true, description: 'Conservative vs operative management' },
      { id: 'diagnosis', name: '진단명', nameEn: 'Diagnosis', type: 'tags', required: false, description: 'Orthopedic diagnosis' },
      { id: 'medications', name: '처방약물', nameEn: 'Medications', type: 'tags', required: false, description: 'Analgesics, NSAIDs, muscle relaxants' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: 'F/U schedule, PT plan, precautions' },
    ],
    promptContext: `You are an Orthopedic Surgeon documenting a musculoskeletal examination.
Use anatomical terms: ACL, PCL, meniscus, rotator cuff, TFCC, MCP, PIP, DIP.
Document ROM in degrees, special tests by name (McMurray, Lachman, Phalen, etc).
Example: "R knee pain, NRS 6/10. (+) McMurray test, ROM 0-110°. MRI: medial meniscus tear. Plan: arthroscopic meniscectomy."`,
  },
  {
    id: 'psychiatry',
    name: '정신건강의학과',
    fields: [
      { id: 'chiefComplaint', name: '주호소', nameEn: 'Chief Complaint', type: 'textarea', required: true, description: 'Presenting complaint' },
      { id: 'historyOfPresentIllness', name: '현병력', nameEn: 'History of Present Illness', type: 'textarea', required: true, description: 'Course of illness' },
      { id: 'mentalStatusExam', name: '정신상태검사', nameEn: 'Mental Status Exam', type: 'textarea', required: true, description: 'Appearance, behavior, mood, affect, thought, cognition' },
      { id: 'riskAssessment', name: '위험성 평가', nameEn: 'Risk Assessment', type: 'textarea', required: false, description: 'SI/HI assessment' },
      { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: 'Diagnostic impression' },
      { id: 'plan', name: '치료계획', nameEn: 'Plan', type: 'textarea', required: true, description: 'Pharmacotherapy, psychotherapy plan' },
      { id: 'diagnosis', name: '진단명', nameEn: 'Diagnosis', type: 'tags', required: false, description: 'DSM-5 diagnosis' },
      { id: 'medications', name: '처방약물', nameEn: 'Medications', type: 'tags', required: false, description: 'Psychotropic medications' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: 'F/U schedule, therapy notes, safety plan' },
    ],
    promptContext: `You are a Psychiatrist documenting a psychiatric evaluation.
Use DSM-5 terminology. Document MSE systematically: Appearance, Behavior, Speech, Mood/Affect, Thought Process/Content, Perception, Cognition, Insight/Judgment.
Use terms: euthymic, dysphoric, anhedonia, insomnia, SI (suicidal ideation), HI (homicidal ideation).
Example: "MSE: Cooperative, psychomotor retardation, dysphoric mood, congruent flat affect, no SI/HI. Dx: MDD, recurrent, moderate."`,
  },
  {
    id: 'pediatrics',
    name: '소아청소년과',
    fields: [
      { id: 'chiefComplaint', name: '주호소', nameEn: 'Chief Complaint', type: 'textarea', required: true, description: 'Parental concern' },
      { id: 'historyOfPresentIllness', name: '현병력', nameEn: 'History of Present Illness', type: 'textarea', required: true, description: 'Symptom course' },
      { id: 'developmentHistory', name: '발달력', nameEn: 'Development History', type: 'textarea', required: false, description: 'Developmental milestones' },
      { id: 'vaccinationHistory', name: '예방접종력', nameEn: 'Vaccination History', type: 'text', required: false, description: 'Immunization status' },
      { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: 'Clinical assessment' },
      { id: 'plan', name: '치료계획', nameEn: 'Plan', type: 'textarea', required: true, description: 'Management plan' },
      { id: 'diagnosis', name: '진단명', nameEn: 'Diagnosis', type: 'tags', required: false, description: 'Diagnosis' },
      { id: 'medications', name: '처방약물', nameEn: 'Medications', type: 'tags', required: false, description: 'Age-appropriate dosing' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: 'F/U schedule, growth chart notes, parent education' },
    ],
    promptContext: `You are a Pediatrician documenting a pediatric encounter.
Include age-appropriate context. Use terms: febrile, afebrile, URI, AOM, AGE, bronchiolitis.
Note growth parameters when relevant. Document immunization status.
Example: "18mo male with 3-day h/o fever, rhinorrhea, cough. PE: TM erythematous, bulging. Dx: AOM. Plan: Amoxicillin 45mg/kg/day div BID x10d."`,
  },
  {
    id: 'dentistry',
    name: '치과',
    fields: [
      { id: 'chiefComplaint', name: '주호소', nameEn: 'Chief Complaint', type: 'textarea', required: true, description: 'Dental complaint' },
      { id: 'dentalHistory', name: '치과병력', nameEn: 'Dental History', type: 'textarea', required: true, description: 'Previous dental treatments, last visit' },
      { id: 'oralExam', name: '구강검사', nameEn: 'Oral Examination', type: 'textarea', required: true, description: 'Tooth number, lesion description, periodontal status' },
      { id: 'radiographicFindings', name: '방사선소견', nameEn: 'Radiographic Findings', type: 'textarea', required: false, description: 'X-ray, panorama findings' },
      { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: 'Dental diagnosis' },
      { id: 'plan', name: '치료계획', nameEn: 'Plan', type: 'textarea', required: true, description: 'Treatment plan' },
      { id: 'diagnosis', name: '진단명', nameEn: 'Diagnosis', type: 'tags', required: false, description: 'Dental diagnosis' },
      { id: 'procedures', name: '시행술식', nameEn: 'Procedures', type: 'tags', required: false, description: 'Procedures performed' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: 'F/U schedule, post-op instructions, oral hygiene advice' },
    ],
    promptContext: `You are a Dentist documenting a dental encounter.
Use FDI tooth numbering (11-48) or Universal numbering. Document tooth-specific findings.
Terms: caries, pulpitis, periodontitis, gingivitis, occlusion, TMJ, BOP (bleeding on probing), CAL (clinical attachment loss).
Procedures: scaling, SRP, RCT (root canal treatment), extraction, filling, crown, implant.
Example: "#36 deep caries w/ pulp exposure, (+) percussion tenderness. Dx: Irreversible pulpitis. Plan: RCT #36, temp filling today, f/u 1wk."`,
  },
  {
    id: 'custom',
    name: '커스텀',
    fields: DEFAULT_FIELDS,
    promptContext: 'Use appropriate medical terminology in English.',
  },
];

// ==================== 기본 설정 ====================

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  selectedDepartment: 'general',
  activeFields: [...DEFAULT_FIELDS], // 기본 필드로 초기화
  customFields: [],
  additionalPrompt: '',
  includeSOAP: true,
};

// ==================== 설정 저장/불러오기 (localStorage) ====================

const SETTINGS_KEY = 'cheat-chat-chart-settings';

export function saveChartSettings(settings: ChartSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadChartSettings(): ChartSettings {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // activeFields가 없으면 (이전 버전 호환) 프리셋에서 가져오기
      if (!parsed.activeFields || parsed.activeFields.length === 0) {
        const preset = DEPARTMENT_PRESETS.find(p => p.id === parsed.selectedDepartment);
        parsed.activeFields = preset ? [...preset.fields] : [...DEFAULT_FIELDS];
      }
      return { ...DEFAULT_CHART_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_CHART_SETTINGS;
    }
  }
  return DEFAULT_CHART_SETTINGS;
}

// 진료과 변경 시 해당 프리셋의 필드로 activeFields 초기화
export function getFieldsForDepartment(departmentId: string): ChartField[] {
  const preset = DEPARTMENT_PRESETS.find(p => p.id === departmentId);
  return preset ? [...preset.fields] : [...DEFAULT_FIELDS];
}

// ==================== 차트 생성 ====================

// 개별 필드 값 (확실/추측 구분)
export interface ChartFieldValue {
  value: string | string[];
  isConfirmed: boolean; // true: 대화에서 직접 언급됨, false: AI 추측/추천
}

// 생성된 차트 (각 필드가 ChartFieldValue)
export interface GeneratedChart {
  [fieldId: string]: ChartFieldValue;
}

// 레거시 호환용 (단순 값만)
export interface GeneratedChartSimple {
  [fieldId: string]: string | string[];
}

export interface SpeakerSegment {
  speaker: 'doctor' | 'patient' | 'pending';
  text: string;
}

// 문자열 값 정리 헬퍼
function cleanStringValue(value: string): string {
  let cleaned = value;
  // "\"text\"" 패턴 제거
  if (cleaned.startsWith('\\"') && cleaned.endsWith('\\"')) {
    cleaned = cleaned.slice(2, -2);
  }
  // ""text"" 패턴 제거
  if (cleaned.startsWith('""') && cleaned.endsWith('""')) {
    cleaned = cleaned.slice(2, -2);
  }
  // "text" 패턴 제거 (앞뒤 따옴표)
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2) {
    cleaned = cleaned.slice(1, -1);
  }
  // 이스케이프된 따옴표 정리
  cleaned = cleaned.replace(/\\"/g, '"').replace(/""/g, '"');
  return cleaned.trim();
}

// 값이 있는지 확인 헬퍼
function hasValue(value: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value.trim().length > 0;
}

export async function generateChart(
  segments: SpeakerSegment[],
  settings: ChartSettings
): Promise<GeneratedChart | null> {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    return null;
  }

  // 대화 내용 포맷팅
  const conversation = segments
    .filter(s => s.speaker !== 'pending')
    .map(s => `${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`)
    .join('\n');

  if (!conversation.trim()) {
    console.error('❌ 대화 내용이 없습니다.');
    return null;
  }

  // 선택된 프리셋 가져오기
  const preset = DEPARTMENT_PRESETS.find(p => p.id === settings.selectedDepartment) || DEPARTMENT_PRESETS[0];
  
  // 필드 목록 (activeFields 사용)
  const allFields = settings.activeFields && settings.activeFields.length > 0
    ? settings.activeFields
    : preset.fields;

  // JSON 스키마 생성 (확실/추측 구분 포함) - 기본값 false
  const jsonSchema: Record<string, { value: string | string[]; isConfirmed: boolean }> = {};
  allFields.forEach(field => {
    if (field.type === 'tags' || field.type === 'list') {
      jsonSchema[field.id] = { value: [], isConfirmed: false };
    } else {
      jsonSchema[field.id] = { value: '', isConfirmed: false };
    }
  });
  
  // 필드 설명 (별도로 제공)
  const fieldDescriptions = allFields.map(f => 
    `- ${f.id}: ${f.nameEn || f.name}${f.description ? ` (${f.description})` : ''}`
  ).join('\n');

  console.log('📋 차트 생성 시작...');
  console.log('🏥 진료과:', preset.name);
  console.log('📝 필드 수:', allFields.length);

  const systemPrompt = `You are an experienced ${preset.name !== '일반' ? preset.name : 'physician'} documenting a clinical encounter.

${preset.promptContext || ''}

## LANGUAGE RULES:
1. **chiefComplaint**: Write in KOREAN exactly as the patient stated it
2. **ALL OTHER FIELDS**: Write in ENGLISH using medical abbreviations and terminology

## ABBREVIATION STYLE (REQUIRED):
- Duration: "~1wk", "x 2mo", "for 3d" (NOT Korean like "일주일 정도")
- Frequency: "q.d.", "b.i.d.", "t.i.d.", "PRN"
- Route: "PO", "IV", "IM", "topical"
- History: "Hx", "PMHx"
- Diagnosis: "Dx", "DDx", "r/o"
- Treatment: "Tx", "Rx", "f/u"
- Physical: "WNL", "NAD"
- Example: "#36 gingival recession, sensitivity to cold x 1wk. Plan: F- application, f/u 2wk."

${settings.additionalPrompt ? `Additional instructions: ${settings.additionalPrompt}` : ''}

## FIELDS TO FILL:
${fieldDescriptions}

## CONFIDENCE MARKING (VERY IMPORTANT - READ CAREFULLY):
Default is FALSE. Only set TRUE if EXPLICITLY stated in conversation.

**isConfirmed: true** - ONLY when patient/doctor DIRECTLY SAID this exact information
**isConfirmed: false** - Everything else (your inference, recommendation, medical knowledge, standard practice)

### TRUE examples (직접 언급됨):
- Patient: "손이 떨려요" → chiefComplaint = true (patient said it)
- Patient: "3개월 전부터요" → duration mentioned = true
- Doctor: "파킨슨 검사 해봅시다" → plan includes Parkinson test = true

### FALSE examples (추측/추천):
- You write assessment based on symptoms → assessment = FALSE (your clinical judgment)
- You suggest diagnosis not confirmed by doctor → diagnosis = FALSE
- You recommend standard f/u schedule → plan = FALSE (not discussed)
- You suggest medications based on diagnosis → medications = FALSE
- Doctor asked questions but no conclusion → assessment = FALSE

BE STRICT: When in doubt, use FALSE. Most "assessment", "plan", "diagnosis", "medications" should be FALSE unless doctor explicitly stated them.

## OUTPUT FORMAT (PURE JSON ONLY):
${JSON.stringify(jsonSchema, null, 2)}

## CRITICAL:
- Output ONLY valid JSON, no comments, no explanations
- Do NOT add // comments or any text outside JSON
- Do NOT wrap values in extra quotes (wrong: "\"text\"", correct: "text")
- Empty fields: use { "value": "" or [], "isConfirmed": true }
- ALWAYS include both "value" and "isConfirmed" for EVERY field`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `다음 진료 대화를 분석하여 차트를 작성해주세요:\n\n${conversation}` }
        ],
        max_tokens: 3000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 차트 생성 API 오류:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content?.trim();
    
    console.log('🤖 GPT 응답:', content?.slice(0, 200) + '...');

    try {
      // JSON 파싱 (markdown 코드블록 제거)
      let jsonStr = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      console.log('📝 파싱할 JSON:', jsonStr.slice(0, 300) + '...');
      
      let rawData: Record<string, unknown>;
      
      try {
        // 먼저 그대로 파싱 시도
        rawData = JSON.parse(jsonStr);
      } catch {
        // 파싱 실패 시 키에 따옴표 없는 경우 처리
        console.log('⚠️ 1차 파싱 실패, 키 따옴표 추가 시도...');
        jsonStr = jsonStr.replace(/(\s*)(\w+)(\s*):/g, '$1"$2"$3:');
        jsonStr = jsonStr.replace(/""/g, '"');
        rawData = JSON.parse(jsonStr);
      }
      
      // 새 형식으로 변환 (ChartFieldValue)
      const chartData: GeneratedChart = {};
      
      allFields.forEach(field => {
        const rawValue = rawData[field.id];
        const isArrayField = field.type === 'tags' || field.type === 'list';
        
        // 새 형식 (value + isConfirmed 객체)
        if (rawValue && typeof rawValue === 'object' && 'value' in rawValue) {
          const fieldValue = rawValue as { value: unknown; isConfirmed?: boolean };
          let value = fieldValue.value;
          
          // 문자열 정리
          if (typeof value === 'string') {
            value = cleanStringValue(value);
          }
          
          chartData[field.id] = {
            value: isArrayField 
              ? (Array.isArray(value) ? value : []) 
              : (typeof value === 'string' ? value : ''),
            isConfirmed: fieldValue.isConfirmed === true, // 명시적으로 true인 경우만
          };
        } 
        // 레거시 형식 (단순 값) - 모두 추측으로 처리
        else {
          let value = rawValue;
          
          if (typeof value === 'string') {
            value = cleanStringValue(value);
          }
          
          chartData[field.id] = {
            value: isArrayField 
              ? (Array.isArray(value) ? value : []) 
              : (typeof value === 'string' ? value : ''),
            isConfirmed: false, // 기본값 false
          };
        }
      });

      // 확실/추측 통계 및 상세 로그
      const confirmedFields: string[] = [];
      const inferredFields: string[] = [];
      
      Object.entries(chartData).forEach(([fieldId, fieldValue]) => {
        if (hasValue(fieldValue.value)) {
          if (fieldValue.isConfirmed) {
            confirmedFields.push(fieldId);
          } else {
            inferredFields.push(fieldId);
          }
        }
      });
      
      console.log(`✅ 차트 생성 완료!`);
      console.log(`   ✓ 확실 (${confirmedFields.length}개): ${confirmedFields.join(', ') || '없음'}`);
      console.log(`   ⚠ 추측 (${inferredFields.length}개): ${inferredFields.join(', ') || '없음'}`);
      
      return chartData;
    } catch (parseError) {
      console.error('❌ JSON 파싱 오류:', parseError, content);
      return null;
    }
  } catch (error) {
    console.error('❌ 차트 생성 요청 실패:', error);
    return null;
  }
}

// 필드 정보 가져오기 (UI 렌더링용)
export function getFieldsForSettings(settings: ChartSettings): ChartField[] {
  // activeFields가 있으면 그대로 사용
  if (settings.activeFields && settings.activeFields.length > 0) {
    return settings.activeFields;
  }
  
  // 없으면 프리셋에서 가져오기
  const preset = DEPARTMENT_PRESETS.find(p => p.id === settings.selectedDepartment) || DEPARTMENT_PRESETS[0];
  return [...preset.fields];
}
