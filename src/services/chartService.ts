// 차트 설정 및 생성 서비스 (Korean hospital style, mixed Korean + abbreviations)
// - 변수/함수 이름 유지
// - CC/PI는 한국어(PI는 서술형)
// - Assessment/Plan: 한국어 기반 + 영어 약어 섞기 (r/o, c/w, DDx, f/u, PRN, PO...)
// - Dx를 "확정/언급" vs "AI추론"으로 분리
// - 추론은 허용된 필드에서만 수행 + 근거/신뢰도 표시

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

// ==================== 설정 타입 ====================

export interface ChartField {
  id: string;
  name: string;
  nameEn?: string;
  type: 'text' | 'textarea' | 'list' | 'tags';
  required: boolean;
  description?: string;
}

export interface DepartmentPreset {
  id: string;
  name: string;
  fields: ChartField[];
  promptContext?: string;
}

export interface ChartSettings {
  selectedDepartment: string;
  activeFields: ChartField[];
  customFields: ChartField[];
  additionalPrompt: string;
  includeSOAP: boolean;
}

// ==================== 기본 프리셋 ====================
// ✅ 한국 병원 외래 EMR에 가까운 구성
// - Dx 2트랙: diagnosisConfirmed(의사 언급) / diagnosisInferred(AI 추론)
// - PI(현병력)는 한국어 서술형
// - Assessment/Plan 한국어 + 약어

export const DEFAULT_FIELDS: ChartField[] = [
  // S - Korean
  { id: 'chiefComplaint', name: '주호소', nameEn: 'CC', type: 'textarea', required: true, description: '한국어. 환자 표현 그대로 인용.' },
  { id: 'historyOfPresentIllness', name: '현병력(PI)', nameEn: 'PI', type: 'textarea', required: true, description: '한국어 서술형. 3-6문장. 없는 내용 금지.' },
  { id: 'pertinentROS', name: 'ROS(관련 +/-)', nameEn: 'ROS (pertinent +/-)', type: 'textarea', required: false, description: '영어 약어. N/V(+), fever(-), CP(-) 형식.' },

  // Background - English/abbreviations
  { id: 'pastMedicalHistory', name: '과거력(PMH)', nameEn: 'PMH', type: 'tags', required: false, description: '영어. HTN, DM, s/p appendectomy.' },
  { id: 'pastSurgicalHistory', name: '수술력(PSH)', nameEn: 'PSH', type: 'tags', required: false, description: '영어. 언급된 것만.' },
  { id: 'medications', name: '복용약', nameEn: 'Meds', type: 'tags', required: false, description: '영어. 용량 포함.' },
  { id: 'allergies', name: '알레르기', nameEn: 'Allergies', type: 'tags', required: false, description: '영어. NKDA if none.' },
  { id: 'socialHistory', name: '사회력', nameEn: 'SHx', type: 'textarea', required: false, description: '영어. Smoking/EtOH/occupation.' },
  { id: 'familyHistory', name: '가족력', nameEn: 'FHx', type: 'textarea', required: false, description: '영어. 언급된 것만.' },

  // O - English
  { id: 'vitalSigns', name: '활력징후(VS)', nameEn: 'VS', type: 'text', required: false, description: '영어. BP/HR/BT/RR/SpO2.' },
  { id: 'physicalExam', name: '진찰(PE)', nameEn: 'PE', type: 'textarea', required: false, description: '영어. 언급된 소견만.' },
  { id: 'labResults', name: '검사(Labs)', nameEn: 'Labs', type: 'textarea', required: false, description: '영어. 언급된 결과만.' },
  { id: 'imaging', name: '영상(Imaging)', nameEn: 'Imaging', type: 'textarea', required: false, description: '영어. 언급된 것만.' },

  // A - English (Korean connectors OK)
  { id: 'assessment', name: '평가(A)', nameEn: 'A', type: 'textarea', required: true, description: '영어 중심. [Summary] [Provider Impression] [AI DDx] 3단 구조.' },

  // Dx - English only
  { id: 'diagnosisConfirmed', name: '진단(의사 언급)', nameEn: 'Dx (stated)', type: 'tags', required: false, description: '영어. 의사가 말한 Dx만.' },
  { id: 'diagnosisInferred', name: '진단(AI 요약)', nameEn: 'Dx (AI)', type: 'textarea', required: false, description: 'ENGLISH. ONE LINE ONLY. Problem-oriented impression using "r/o X vs Y". Do NOT list.' },

  // P - English orders
  { id: 'plan', name: '계획(P)', nameEn: 'P', type: 'textarea', required: true, description: '영어. 오더만. [Orders] [AI Suggestions optional]. 설명문 금지.' },
  { id: 'followUp', name: '추적(F/U)', nameEn: 'F/U', type: 'textarea', required: false, description: '영어. 언급 없으면 비움. 일반적 문구 금지.' },

  { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: '메모.' },
];

// ==================== 과별 프리셋 ====================

const BASE_CHARTING_STYLE = `
You are a clinician in a Korean hospital writing an outpatient EMR note after listening to a doctor-patient conversation.

CORE PHILOSOPHY:
- Documentation is selection → interpretation → editing into clinically meaningful information.
- Keep it concise and realistic for Korean EMR.
- Do NOT invent facts. If not mentioned, leave blank.

=== LANGUAGE BALANCE (STRICT - MOST IMPORTANT) ===
| Section           | Language                              |
|-------------------|---------------------------------------|
| CC                | Korean (환자 표현 그대로)              |
| PI                | Korean (서술형)                       |
| Pertinent +/-     | English abbreviations (N/V(+), CP(-)) |
| PMH / Meds / SHx  | English / abbreviations              |
| PE                | English                              |
| Assessment (A)    | ENGLISH (Korean connectors only)     |
| DDx / r/o         | ENGLISH 100%                         |
| Dx                | ENGLISH 100%                         |
| Plan (P)          | ENGLISH orders                       |
| F/U               | English or leave empty               |

- Do NOT translate diagnoses into Korean.
- DDx, r/o, Dx terms must remain in English.
- Korean may be used ONLY for short connectors in Assessment (e.g., "~로 판단됨").

=== PI QUALITY RULES ===
- Korean narrative (서술형), NOT a checklist.
- 3-6 sentences max.
- Use only relevant OLDCARTS elements if present.
- Include pertinent positives/negatives only if asked/answered.
- If missing, do NOT fill.

=== DDx RULES (STRICT) ===
- Limit DDx to top 1-2 most likely causes (max 3).
- Use "r/o" or "DDx" style ONLY.
- Avoid vague terms (e.g., "cardiac problem" ❌, "brain issue" ❌).
- Each DDx MUST include a brief rationale (1 line).
- Format: "r/o [diagnosis] - [brief reason]" or "DDx: [diagnosis] (reason)"

=== Dx (AI) RULES (STRICT) ===
- Do NOT repeat DDx as a comma-separated list.
- Summarize into ONE problem-oriented line.
- Use "r/o" or "vs" format ONLY.
- Good: "Syncope, r/o hypoglycemia vs neurologic cause"
- Bad: "저혈당, 뇌혈관 사고, 심장 문제"

=== ROLE SEPARATION (IMPORTANT) ===
- Put DDx/r/o list ONLY inside Assessment under [AI DDx/r/o].
- Put ONE-LINE impression ONLY in diagnosisInferred (Dx AI). Do NOT duplicate DDx list there.

=== ASSESSMENT STRUCTURE (3-PART) ===
[Summary]
(1-2 sentences in English, Korean connectors OK)

[Provider Impression]
(What the doctor seemed to think - can infer from ordered tests)
(If doctor said nothing, infer cautiously from orders)

[AI DDx/r/o]
- r/o [diagnosis] - [reason]

=== PROVIDER IMPRESSION INFERENCE ===
- You may infer provider impression based on ordered tests.
- This must be cautious and directly tied to the orders.
- Do NOT invent diagnoses.
- Example: If doctor ordered brain CT → "Provider considering neurologic cause"

=== PLAN RULES (STRICT) ===
- Order-oriented ONLY. No explanatory sentences.
- Prioritize provider orders.
- AI suggestions are OPTIONAL:
  - Omit if not strongly justified
  - Max 1-2 lines if included
  - Must have clear rationale

[Orders]
- [test/medication]

[AI Suggestions] (optional)
- [suggestion] - if [condition]

=== FOLLOW-UP RULE ===
- Do NOT write generic follow-up statements.
- Leave F/U empty if not explicitly discussed.
- Bad: "검사 결과에 따라 f/u 결정" ❌
- Good: "f/u 1wk" or leave empty

=== FORMATTING RULES ===
- If you use bullets (-), ALWAYS insert a blank line between items.
- Keep it readable like Korean hospital EMR.

GOOD:
- Blood glucose

- Brain CT

BAD:
- Blood glucose
- Brain CT
`.trim();

export const DEPARTMENT_PRESETS: DepartmentPreset[] = [
  {
    id: 'general',
    name: '일반',
    fields: DEFAULT_FIELDS,
    promptContext: `
${BASE_CHARTING_STYLE}

GENERAL OP NOTE:
- Keep PI concise (3–6 sentences typical).
- Plan should be order-oriented.
`.trim(),
  },
  {
    id: 'internal',
    name: '내과',
    fields: [
      ...DEFAULT_FIELDS,
      { id: 'problemList', name: '문제목록', nameEn: 'Problem List', type: 'list', required: false, description: '언급된 문제만 1) 2) 형태. 항목 간 한 줄 띄움.' },
    ],
    promptContext: `
${BASE_CHARTING_STYLE}

INTERNAL MEDICINE EMPHASIS:
- If chronic diseases are mentioned, reflect briefly (HTN/DM/thyroid etc).
- If labs are mentioned, you may interpret minimally in Assessment (without creating new values).
- Use cautious language: "r/o", "DDx", "c/w" as appropriate.
`.trim(),
  },
  {
    id: 'dermatology',
    name: '피부과',
    fields: [
      { id: 'chiefComplaint', name: '주호소', nameEn: 'CC', type: 'textarea', required: true, description: '한국어. 환자 표현 그대로 인용.' },
      { id: 'historyOfPresentIllness', name: '현병력(PI)', nameEn: 'PI', type: 'textarea', required: true, description: '한국어 서술형. 3-6문장. 발생시기/경과/악화요인/동반증상.' },
      { id: 'lesionDescription', name: '병변 기술', nameEn: 'Lesion', type: 'textarea', required: false, description: 'ENGLISH. Morphology/distribution mentioned only. No guessing.' },
      { id: 'pertinentROS', name: 'ROS(관련 +/-)', nameEn: 'ROS (pertinent +/-)', type: 'textarea', required: false, description: 'ENGLISH. pruritus(+/-), pain(+/-), oozing(+/-), fever(-) etc.' },
      { id: 'pastMedicalHistory', name: '과거력(PMH)', nameEn: 'PMH', type: 'tags', required: false, description: 'ENGLISH. Atopic dermatitis, eczema etc. if mentioned.' },
      { id: 'medications', name: '복용약', nameEn: 'Meds', type: 'tags', required: false, description: 'ENGLISH. Mentioned meds only.' },
      { id: 'allergies', name: '알레르기', nameEn: 'Allergies', type: 'tags', required: false, description: 'ENGLISH. NKDA if none.' },
      { id: 'physicalExam', name: '진찰(PE)', nameEn: 'PE', type: 'textarea', required: false, description: 'ENGLISH. Mentioned skin findings only.' },
      { id: 'assessment', name: '평가(A)', nameEn: 'A', type: 'textarea', required: true, description: 'ENGLISH 중심. [Summary] [Provider Impression] [AI DDx/r/o]. Korean connectors only.' },
      { id: 'diagnosisConfirmed', name: '진단(의사 언급)', nameEn: 'Dx (stated)', type: 'tags', required: false, description: 'ENGLISH. Provider-stated Dx only.' },
      { id: 'diagnosisInferred', name: '진단(AI 요약)', nameEn: 'Dx (AI)', type: 'textarea', required: false, description: 'ENGLISH. ONE LINE ONLY. "r/o X vs Y" impression. Do NOT list.' },
      { id: 'plan', name: '계획(P)', nameEn: 'P', type: 'textarea', required: true, description: 'ENGLISH. Orders only. [Orders] + optional [AI Suggestions]. No explanatory sentences.' },
      { id: 'followUp', name: '추적(F/U)', nameEn: 'F/U', type: 'textarea', required: false, description: 'ENGLISH. If not discussed, leave empty.' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: 'Notes.' },
    ],
    promptContext: `
${BASE_CHARTING_STYLE}

DERM NOTES:
- Do not hallucinate morphology. Only document what is described.
- If the provider names a diagnosis, put it into diagnosisConfirmed (ENGLISH).
- AI DDx goes to Assessment [AI DDx/r/o] section. ONE-LINE summary goes to diagnosisInferred.
`.trim(),
  },
  {
    id: 'custom',
    name: '커스텀',
    fields: DEFAULT_FIELDS,
    promptContext: BASE_CHARTING_STYLE,
  },
];

// ==================== 기본 설정 ====================

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  selectedDepartment: 'general',
  activeFields: [...DEFAULT_FIELDS],
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

export function getFieldsForDepartment(departmentId: string): ChartField[] {
  const preset = DEPARTMENT_PRESETS.find(p => p.id === departmentId);
  return preset ? [...preset.fields] : [...DEFAULT_FIELDS];
}

// ==================== 차트 생성 ====================

// 개별 필드 값 (확실/추측 구분 + 추론 메타데이터)
export interface ChartFieldValue {
  value: string | string[];
  isConfirmed: boolean; // true: 대화에서 직접 언급됨
  source?: 'stated' | 'inferred'; // stated=발화 기반, inferred=AI 추론
  confidence?: 'low' | 'medium' | 'high'; // inferred일 때 필수
  rationale?: string; // inferred: 1-2줄
  evidence?: string[]; // 1-2개의 짧은 인용
}

export interface GeneratedChart {
  [fieldId: string]: ChartFieldValue;
}

export interface GeneratedChartSimple {
  [fieldId: string]: string | string[];
}

export interface SpeakerSegment {
  speaker: 'doctor' | 'patient' | 'pending';
  text: string;
}

// 문자열 값 정리
function cleanStringValue(value: string): string {
  let cleaned = value;
  if (cleaned.startsWith('\\"') && cleaned.endsWith('\\"')) cleaned = cleaned.slice(2, -2);
  if (cleaned.startsWith('""') && cleaned.endsWith('""')) cleaned = cleaned.slice(2, -2);
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/\\"/g, '"').replace(/""/g, '"');
  return cleaned.trim();
}

function hasValue(value: string | string[]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

function normalizeArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v)).map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string') {
    const parts = value.split('\n').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeEvidence(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v)).map(v => v.trim()).filter(Boolean).slice(0, 2);
  if (typeof value === 'string') {
    const parts = value.split('\n').map(s => s.trim()).filter(Boolean);
    return parts.slice(0, 2);
  }
  return [];
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  const v = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'low';
}

export async function generateChart(
  segments: SpeakerSegment[],
  settings: ChartSettings
): Promise<GeneratedChart | null> {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    return null;
  }

  const conversation = segments
    .filter(s => s.speaker !== 'pending')
    .map((s, idx) => `${idx + 1}. ${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`)
    .join('\n');

  if (!conversation.trim()) {
    console.error('❌ 대화 내용이 없습니다.');
    return null;
  }

  const preset = DEPARTMENT_PRESETS.find(p => p.id === settings.selectedDepartment) || DEPARTMENT_PRESETS[0];

  const allFields = settings.activeFields && settings.activeFields.length > 0
    ? settings.activeFields
    : preset.fields;

  // JSON 스키마 (value + 확실표시 + 추론 메타데이터 기본값 포함)
  const jsonSchema: Record<string, any> = {};
  allFields.forEach(field => {
    const isArray = field.type === 'tags' || field.type === 'list';
    jsonSchema[field.id] = {
      value: isArray ? [] : '',
      isConfirmed: false,
      source: 'stated',
      confidence: 'low',
      rationale: '',
      evidence: []
    };
  });

  const fieldDescriptions = allFields.map(f =>
    `- ${f.id}: ${f.nameEn || f.name}${f.description ? ` (${f.description})` : ''}`
  ).join('\n');

  console.log('📋 차트 생성 시작...');
  console.log('🏥 진료과:', preset.name);
  console.log('📝 필드 수:', allFields.length);

  // ✅ Quality-focused system prompt (Korean EMR style)
  const systemPrompt = `
You are an experienced ${preset.name !== '일반' ? preset.name : 'physician'} documenting a Korean hospital outpatient EMR note.

${preset.promptContext || ''}

=== HARD LANGUAGE RULES (MOST IMPORTANT) ===
- CC: KOREAN (patient's exact wording)
- PI: KOREAN narrative (3-6 sentences)
- Assessment/DDx/Dx/Plan: MEDICAL ENGLISH (no Korean diagnoses)
- Korean connectors OK in Assessment (e.g., "~로 판단됨")
- Do NOT translate diagnoses into Korean.

=== HARD DDx/Dx RULES ===
- DDx: Max 1-2 items (at most 3). Use "r/o [diagnosis] - [reason]" format.
- Dx (AI): ONE problem-oriented line. Use "r/o X vs Y" format.
- Do NOT list diagnoses in Korean.
- Avoid vague terms (e.g., "cardiac problem", "brain issue").

=== HARD PLAN RULES ===
- Orders in ENGLISH.
- AI suggestions: OPTIONAL, max 1-2 lines, omit if weak evidence.
- No explanatory sentences.

=== HARD F/U RULE ===
- Leave empty if not discussed.
- No generic statements like "검사 결과에 따라 f/u".

=== FORMATTING ===
- Bullets must have blank line between items.
${settings.additionalPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${settings.additionalPrompt}\n` : ''}

FIELDS TO FILL:
${fieldDescriptions}

CONFIDENCE & INFERENCE:
- isConfirmed=true ONLY if explicitly stated.
- For inferred content (assessment, diagnosisInferred, plan AI suggestions):
  - isConfirmed=false, source="inferred"
  - confidence: low/medium/high
  - rationale: 1-2 short lines
  - evidence: 1-2 quotes from conversation
- For stated content: source="stated"
- If Provider Impression is inferred from orders (not explicitly spoken), set source="inferred" and isConfirmed=false.

OUTPUT FORMAT (PURE JSON ONLY):
${JSON.stringify(jsonSchema, null, 2)}

CRITICAL:
- Output ONLY valid JSON (no markdown)
- Include all keys for every field
- Empty if not mentioned ("" or [])
`.trim();

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
          {
            role: 'user',
            content:
`다음 진료 대화를 바탕으로 한국 병원 외래 EMR처럼 작성해줘.

LANGUAGE:
- CC/PI: 한국어
- Assessment/DDx/Dx/Plan: 영어 (진단명 한국어 번역 금지)

FORMAT:
- DDx: Assessment 안에만. "r/o [diagnosis] - [reason]" (최대 2-3개)
- Dx (AI): diagnosisInferred에 한 줄 요약만. "r/o X vs Y". 리스트 금지.
- Plan: 오더만 (설명문 금지)
- Follow-up: 언급 없으면 비움 (일반적 문구 금지)
- 불릿 항목은 한 줄씩 띄워

[진료 대화]
${conversation}`
          }
        ],
        max_tokens: 3200,
        temperature: 0.2,
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
      let jsonStr = (content || '')
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      let rawData: Record<string, unknown>;
      try {
        rawData = JSON.parse(jsonStr);
      } catch {
        console.log('⚠️ 1차 파싱 실패, 키 따옴표 추가 시도...');
        jsonStr = jsonStr.replace(/(\s*)(\w+)(\s*):/g, '$1"$2"$3:');
        jsonStr = jsonStr.replace(/""/g, '"');
        rawData = JSON.parse(jsonStr);
      }

      const chartData: GeneratedChart = {};

      allFields.forEach(field => {
        const rawValue = rawData[field.id];
        const isArrayField = field.type === 'tags' || field.type === 'list';

        const base: ChartFieldValue = {
          value: isArrayField ? [] : '',
          isConfirmed: false,
          source: 'stated',
          confidence: 'low',
          rationale: '',
          evidence: [],
        };

        if (rawValue && typeof rawValue === 'object' && 'value' in (rawValue as any)) {
          const fv = rawValue as {
            value: unknown;
            isConfirmed?: boolean;
            source?: 'stated' | 'inferred';
            confidence?: 'low' | 'medium' | 'high';
            rationale?: string;
            evidence?: unknown;
          };

          const source: 'stated' | 'inferred' = fv.source === 'inferred' ? 'inferred' : 'stated';
          const evidence = normalizeEvidence(fv.evidence);
          const rationale = typeof fv.rationale === 'string' ? cleanStringValue(fv.rationale) : '';
          const confidence = normalizeConfidence(fv.confidence);

          if (isArrayField) {
            const arr = normalizeArrayValue(fv.value);
            chartData[field.id] = {
              ...base,
              value: arr,
              isConfirmed: fv.isConfirmed === true,
              source,
              confidence,
              rationale,
              evidence,
            };
          } else {
            const str = typeof fv.value === 'string' ? cleanStringValue(fv.value) : '';
            chartData[field.id] = {
              ...base,
              value: str,
              isConfirmed: fv.isConfirmed === true,
              source,
              confidence,
              rationale,
              evidence,
            };
          }
        } else {
          // 레거시/깨진 형식: value만 받고 나머지는 기본값
          if (isArrayField) {
            chartData[field.id] = { ...base, value: normalizeArrayValue(rawValue) };
          } else {
            chartData[field.id] = { ...base, value: typeof rawValue === 'string' ? cleanStringValue(rawValue) : '' };
          }
        }

        // 안전장치: inferred이면 isConfirmed는 반드시 false
        if (chartData[field.id].source === 'inferred') {
          chartData[field.id].isConfirmed = false;
        }

        // 안전장치: evidence는 최대 2개
        if (chartData[field.id].evidence && chartData[field.id].evidence!.length > 2) {
          chartData[field.id].evidence = chartData[field.id].evidence!.slice(0, 2);
        }

        // 안전장치: confidence는 inferred에서만 의미있음(그래도 UI 편의상 유지)
        if (chartData[field.id].source === 'stated') {
          // stated인데 confidence/high 같은 게 와도 크게 문제는 없지만, 보수적으로 low로 고정하고 싶으면 아래 주석 해제
          // chartData[field.id].confidence = 'low';
        }
      });

      const confirmedFields: string[] = [];
      const inferredFields: string[] = [];

      Object.entries(chartData).forEach(([fieldId, fieldValue]) => {
        if (hasValue(fieldValue.value)) {
          if (fieldValue.isConfirmed) confirmedFields.push(fieldId);
          if (fieldValue.source === 'inferred') inferredFields.push(fieldId);
        }
      });

      console.log(`✅ 차트 생성 완료!`);
      console.log(`   ✓ 확실(isConfirmed=true) (${confirmedFields.length}개): ${confirmedFields.join(', ') || '없음'}`);
      console.log(`   ⚠ AI추론(source=inferred) (${inferredFields.length}개): ${inferredFields.join(', ') || '없음'}`);

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
  if (settings.activeFields && settings.activeFields.length > 0) {
    return settings.activeFields;
  }
  const preset = DEPARTMENT_PRESETS.find(p => p.id === settings.selectedDepartment) || DEPARTMENT_PRESETS[0];
  return [...preset.fields];
}

// 간편 차트 생성 함수 (VoiceRecorder용)
export async function generateChartFromTranscript(
  transcript: string,
  segments: SpeakerSegment[],
  department: string = 'internal'
): Promise<GeneratedChart | null> {
  const settings: ChartSettings = {
    ...DEFAULT_CHART_SETTINGS,
    selectedDepartment: department,
    activeFields: getFieldsForDepartment(department),
  };

  const useSegments = segments.length > 0 ? segments : [{ speaker: 'patient' as const, text: transcript }];

  return generateChart(useSegments, settings);
}

export type ChartData = GeneratedChart;