// 차트 설정 및 생성 서비스 (Korean hospital style)
// - CC/PI: 한국어 (PI는 서술형)
// - Past History: 소제목 형식 (PMH/Surgical Hx/Meds/Allergies)
// - Assessment: # 확정Dx + r/o DDx 형식
// - Plan: 영어 중심

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

// DDx 개별 항목 타입
export interface DdxItem {
  id: string;
  diagnosis: string;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  isConfirmed: boolean;  // 사용자가 확정함
  isRemoved: boolean;    // 사용자가 제외함
  source: 'doctor' | 'ai';  // doctor: 의사가 언급, ai: AI 추천
}

// 차트 필드 값 타입
export interface ChartFieldValue {
  value: string | string[];
  source?: 'stated' | 'inferred' | 'user'; // user: 사용자가 직접 수정
  confidence?: 'low' | 'medium' | 'high';
  rationale?: string;
  evidence?: string[];
  ddxList?: DdxItem[]; // Assessment 필드 전용 (isConfirmed는 DDx 아이템에만 있음)
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
// - PI(현병력)는 한국어 서술형
// - Past History: 소제목 형식 (PMH/Surgical Hx/Meds/Allergies)
// - Assessment: # 확정Dx + r/o DDx 형식

export const DEFAULT_FIELDS: ChartField[] = [
  // S - Korean
  { id: 'chiefComplaint', name: '주호소', nameEn: 'CC', type: 'textarea', required: true, description: '한국어. 환자 표현 + (onset: 시점). 예: 의식이 없어요. (onset: 오늘 아침)' },
  { id: 'historyOfPresentIllness', name: '현병력', nameEn: 'PI', type: 'textarea', required: true, description: '"상환은" + "~함 체". 3-6문장. 예: 상환은 금일 의식 소실 발생함.' },
  { id: 'pertinentROS', name: '관련 증상', nameEn: 'ROS (+/-)', type: 'textarea', required: false, description: '영어 (+/-) 형식. N/V(-), fever(-), CP(-), LOC(+).' },

  // Background - Past History (소제목 포함)
  { id: 'pastMedicalHistory', name: '과거력', nameEn: 'Past History', type: 'textarea', required: false, description: '소제목 포함: PMH: DM, HTN / Surgical Hx: s/p appendectomy / Meds: metformin / Allergies: None' },
  { id: 'socialHistory', name: '사회력', nameEn: 'Social History', type: 'textarea', required: false, description: '영어 (+/-). Smoking (-), Alcohol (-). 특이사항만 한국어.' },
  { id: 'familyHistory', name: '가족력', nameEn: 'Family History', type: 'textarea', required: false, description: '한국식. 부: DM, 모: 특이사항 없음.' },

  // O - English (+/-)
  { id: 'physicalExam', name: '진찰소견', nameEn: 'PE', type: 'textarea', required: false, description: '영어. 진찰 안 했으면 비워둘 것. 했으면 전부 (+/-) 기록. 위치/범위 포함.' },

  // A - Assessment (# 확정 + r/o DDx)
  { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: '# 확정Dx (엔터) r/o DDx 형식. 예: # ACS (엔터) r/o NSTEMI (엔터) r/o Unstable angina' },

  // P - English orders
  { id: 'plan', name: '계획', nameEn: 'Plan', type: 'textarea', required: true, description: '영어 오더만. [Orders] + [AI Suggestions] (근거 필수, 0-2줄).' },

  { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: '메모.' },
];

// ==================== 과별 프리셋 ====================

const BASE_CHARTING_STYLE = `
You are a clinician in a Korean hospital writing an outpatient EMR note after listening to a doctor-patient conversation.

CORE PHILOSOPHY:
- Documentation is selection → interpretation → editing into clinically meaningful information.
- Keep it concise and realistic for Korean EMR.
- Do NOT invent facts. If not mentioned, leave blank.
- "안 쓰는 용기" - It is BETTER to leave fields EMPTY than to guess.

=== HALLUCINATION GUARDRAIL (CRITICAL) ===
- NEVER add or reinterpret diseases, medications, or history.
- If information is unclear or garbled, write "Unclear" or leave BLANK. Do NOT guess.
- PI must be written ONLY from clearly stated conversation. If unclear, OMIT.
- Do NOT "complete" or "fix" partial sentences - leave them out entirely.

=== LANGUAGE BALANCE (STRICT - MOST IMPORTANT) ===
| Section           | Language                              |
|-------------------|---------------------------------------|
| CC                | Korean (환자 표현 + onset)             |
| PI                | Korean (~함 체: 호소함, 발생함, 있었음)  |
| ROS (+/-)         | English (+/-): N/V(-), LOC(+), CP(-) |
| Past History      | 소제목 포함 형식 (아래 참조)            |
| SHx               | English (+/-): Smoking (-), Alcohol (-). 특이사항만 한국어 |
| FHx               | Korean style: 부: DM, 모: 특이사항 없음 |
| PE                | English (+/-): 안 했으면 비워둘 것, 했으면 전부 기록 |
| Assessment        | # 확정Dx (줄바꿈) r/o DDx 형식         |
| Plan (P)          | ENGLISH orders                       |

- Do NOT translate diagnoses into Korean.
- DDx, r/o, Dx terms must remain in English.

=== CC RULES (CRITICAL) ===
- Patient's own words in Korean
- MUST include onset if mentioned: "(onset: 오늘 아침)" or "(onset: today AM)"
GOOD: "의식이 없어요. (onset: 오늘 아침)"
BAD: "의식이 없어요." (missing onset)

=== PI RULES (CRITICAL - "~함 체" + "상환은") ===
- Korean narrative using MEDICAL CHART STYLE (~함 / ~되었음 / ~있었음)
- NOT "~합니다 / ~입니다" (too report-like)
- Use "상환은" (NOT "환자는", "~님은", or patient name)
- 3-6 sentences max.

GOOD PI:
"상환은 금일 아침 화장실 다녀온 후 갑자기 의식 소실 발생함. 어제 저녁부터 컨디션 저하 호소함. 유사 증상 과거력 없음."

BAD PI:
"환자는 오늘 아침에 의식을 잃었습니다." (wrong: "환자는" instead of "상환은")
"김서현님은 어제부터 안 좋다고 하셨습니다." (wrong: using patient name)

=== PAST HISTORY RULES (CRITICAL) ===
- Past History 필드에 소제목 형식으로 작성
- 소제목: PMH, Surgical Hx, Meds, Allergies
- 각 소제목은 콜론(:) 뒤에 내용 작성
- 없으면 해당 소제목 생략 가능

FORMAT:
PMH: DM (since childhood), HTN (x3y)
Surgical Hx: s/p appendectomy (2020)
Meds: metformin 500mg bid
Allergies: None

GOOD:
"PMH: DM, HTN (x5y)
Surgical Hx: s/p C-sec (2015)
Meds: metformin, amlodipine
Allergies: PCN"

BAD:
"DM, HTN" (소제목 없음)
"Diabetes mellitus" (약어 미사용)

=== SHx RULES ===
- 안 함/없음 → (-)
- 함/있음 → (+)
- 가끔/특이사항 → 환자 표현 그대로 한국어로!
GOOD:
"Smoking (-), Alcohol (-)"
"Smoking (-), Alcohol(가끔 한 잔 정도)"
"Smoking(예전에 피웠다가 5년 전 끊음), Alcohol (-)"
BAD:
"Alcohol (occasional)" ❌ → "Alcohol(가끔 한 잔 정도)" ✓
"Smoking (quit)" ❌ → "Smoking(끊음, 10년 전)" ✓

=== FHx RULES (KOREAN STYLE) ===
- Use 부/모 format
GOOD:
"부: DM"
"모: 특이사항 없음"
"부: 유사 증상 있음"

=== PE RULES (CRITICAL) ===
- If PE not performed: leave EMPTY (do NOT write "None")
- If ANY PE findings are mentioned, PE must be filled
- If PE performed: document ALL findings with (+/-)
- For positive findings: include location/extent/side
GOOD:
"Mental status: drowsy"
"Abdomen: Tenderness (-), Rebound tenderness (+, RLQ)"
"Neuro: Motor weakness (-)"

BAD:
"NAD" (too vague when PE was performed)

=== ASSESSMENT STRUCTURE (CRITICAL - SIMPLE) ===
Assessment contains ONLY two things:
1. # Confirmed Dx (확정 진단) - ONLY if doctor explicitly stated diagnosis
2. r/o DDx (AI differential) - via ddxList array

NO [Summary], NO [Provider Impression], NO explanations.
Just diagnosis structure.

EXAMPLE OUTPUT:
# Syncope (if doctor confirmed)

r/o Hypoglycemia
r/o Seizure
r/o Vasovagal syncope

RULES:
- "#" prefix = ONLY when doctor explicitly stated diagnosis
- "r/o" prefix = AI differential (always)
- AI can NEVER add "#" - only doctors/users can confirm
- If no confirmed Dx, assessment.value should be EMPTY ""
- ALL r/o items go in assessment.ddxList array

=== DDx RULES (STRICT) ===
- Limit DDx to top 2-3 most likely causes (max 5).
- ONLY include DDx with medium or high confidence.
- Avoid vague terms (e.g., "cardiac problem" ❌, "brain issue" ❌).
- DDx should be clinically meaningful and specific.
- Each ddxList item: {id, diagnosis, reason, confidence, isConfirmed: false, isRemoved: false, source: "doctor"|"ai"}
  - source: "doctor" = 의사가 "의심된다/것 같다"고 언급한 진단
  - source: "ai" = AI가 대화 분석해서 추천 (의사가 언급 안 한 것만)
- Priority: doctor first, then ai (high > medium)

=== ROLE SEPARATION ===
- Do NOT generate diagnosisInferred field. DDx list in Assessment is sufficient.
- assessment.value = confirmed Dx only (or empty)
- assessment.ddxList = AI r/o list

=== PLAN RULES (STRICT) ===
- Write ONLY explicit orders that the doctor actually stated.
- NEVER substitute or "upgrade" orders (e.g., CT -> US). Use exact tests/meds mentioned.
- If NO orders were mentioned, leave Plan EMPTY.
- No explanatory sentences. Orders only.
- AI suggestions: include reason in parentheses, max 1-2 lines
⚠️ Plan에 F/U 내용 절대 포함 금지! (f/u 1wk, 외래 예약 등 → F/U 필드로!)

[Orders]
- [test/medication] (only if stated)

[AI Suggestions]
- Blood glucose check (LOC + DM history)

=== FOLLOW-UP RULE (STRICT) ===
- F/U 내용은 F/U 필드에만! Plan에 넣지 말 것!
- Do NOT write generic follow-up statements.
- Leave F/U EMPTY if not explicitly discussed.
- NEVER write: "검사 결과에 따라 f/u 결정" ❌
- NEVER write: "경과 관찰 후 재평가" ❌
- ONLY write specific F/U if stated: "f/u 1wk" or leave EMPTY

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
      // S - Subjective
      { id: 'chiefComplaint', name: '주호소', nameEn: 'CC', type: 'textarea', required: true, description: '한국어. 환자 표현 + (onset: 시점).' },
      { id: 'historyOfPresentIllness', name: '현병력', nameEn: 'PI', type: 'textarea', required: true, description: '"상환은" + "~함 체". 3-6문장.' },
      { id: 'pertinentROS', name: '관련 증상', nameEn: 'ROS (+/-)', type: 'textarea', required: false, description: '영어 (+/-) 형식.' },
      // Background - Past History (소제목 포함)
      { id: 'pastMedicalHistory', name: '과거력', nameEn: 'Past History', type: 'textarea', required: false, description: '소제목 포함: PMH: DM, HTN / Surgical Hx: s/p appendectomy / Meds: metformin / Allergies: None' },
      { id: 'socialHistory', name: '사회력', nameEn: 'Social History', type: 'textarea', required: false, description: '영어 (+/-). Smoking (-), Alcohol (-).' },
      { id: 'familyHistory', name: '가족력', nameEn: 'Family History', type: 'textarea', required: false, description: '한국식. 부: DM, 모: HTN.' },
      // O - Objective
      { id: 'physicalExam', name: '진찰소견', nameEn: 'PE', type: 'textarea', required: false, description: '영어. 진찰 안 했으면 비워둘 것.' },
      // A - Assessment (# 확정 + r/o DDx)
      { id: 'assessment', name: '평가', nameEn: 'Assessment', type: 'textarea', required: true, description: '# 확정Dx (엔터) r/o DDx 형식.' },
      // P - Plan
      { id: 'plan', name: '계획', nameEn: 'Plan', type: 'textarea', required: true, description: '영어 오더.' },
      { id: 'notes', name: '기타', nameEn: 'Notes', type: 'textarea', required: false, description: '메모.' },
    ],
    promptContext: `
${BASE_CHARTING_STYLE}

INTERNAL MEDICINE EMPHASIS:
- If chronic diseases are mentioned, reflect briefly (HTN/DM/thyroid etc).
- Use cautious language: "r/o", "DDx", "c/w" as appropriate.
`.trim(),
  },
];

// ==================== 기본 설정 ====================

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  selectedDepartment: 'internal',
  activeFields: [...(DEPARTMENT_PRESETS.find(p => p.id === 'internal')?.fields ?? DEFAULT_FIELDS)],
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
      const validPreset = DEPARTMENT_PRESETS.find(p => p.id === parsed.selectedDepartment);
      if (!validPreset) {
        parsed.selectedDepartment = DEFAULT_CHART_SETTINGS.selectedDepartment;
        parsed.activeFields = getFieldsForDepartment(parsed.selectedDepartment);
      }
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
// ChartFieldValue는 위에서 이미 정의됨 (중복 제거)

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

// 값을 안전하게 문자열로 변환 (객체는 빈 문자열)
function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // 객체나 배열은 빈 문자열 반환 (절대 [object Object] 안 나오게)
  return '';
}

function normalizeArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(v => safeString(v))  // 객체면 빈 문자열
      .map(v => v.trim())
      .filter(Boolean);  // 빈 문자열 제거
  }
  if (typeof value === 'string') {
    const parts = value.split('\n').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeEvidence(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(v => safeString(v))
      .map(v => v.trim())
      .filter(Boolean)
      .slice(0, 2);
  }
  if (typeof value === 'string') {
    const parts = value.split('\n').map(s => s.trim()).filter(Boolean);
    return parts.slice(0, 2);
  }
  return [];
}

function normalizeConfidence(value: unknown): 'low' | 'medium' | 'high' {
  const v = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  if (v === 'mid') return 'medium'; // 모델이 "mid" 반환할 경우 처리
  return 'low';
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function sanitizeChartData(
  chartData: GeneratedChart,
  conversation: string,
  fields?: ChartField[]
): GeneratedChart {
  if (!conversation) return chartData;

  const allowSocialHistory = hasAnyPattern(conversation, [
    /\bsmok(ing|er)?\b/i,
    /\btobacco\b/i,
    /\bcigarette(s)?\b/i,
    /\bnicotine\b/i,
    /\balcohol\b/i,
    /\bdrink(s|ing)?\b/i,
    /\bbeer\b/i,
    /\bsoju\b/i,
    /담배/,
    /흡연/,
    /음주/,
    /소주/,
    /맥주/,
    /술(을|은|이|도|만|좀|가끔|자주|전혀|안|못|해서|마신|마셨|마셔|마시)/,
    /술\s*(한|마신|마셨|마시|가끔)/,
  ]);
  const allowFamilyHistory = hasAnyPattern(conversation, [
    /\bfamily history\b/i,
    /\bfamily\b/i,
    /\bfather\b/i,
    /\bmother\b/i,
    /\bparent\b/i,
    /가족력/,
    /가족\s*중/,
    /아버지|어머니|부모/,
  ]);

  const hasSocialField = !fields || fields.some(f => f.id === 'socialHistory');
  const hasFamilyField = !fields || fields.some(f => f.id === 'familyHistory');

  if (!allowSocialHistory && hasSocialField) {
    chartData.socialHistory = {
      value: '',
      source: 'stated',
      confidence: 'low',
      rationale: '',
      evidence: [],
    };
  }

  if (!allowFamilyHistory && hasFamilyField) {
    chartData.familyHistory = {
      value: '',
      source: 'stated',
      confidence: 'low',
      rationale: '',
      evidence: [],
    };
  }

  return chartData;
}

// STT 오류 교정 함수 (UI 업데이트용으로 분리)
export async function correctSTTErrors(segments: SpeakerSegment[]): Promise<SpeakerSegment[]> {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY가 없어 STT 교정 생략');
    return segments;
  }

  const filteredSegments = segments.filter(s => s.speaker !== 'pending');
  if (filteredSegments.length === 0) {
    return segments;
  }

  // 대화 내용 구성
  const rawConversation = filteredSegments
    .map((s, idx) => `${idx + 1}. ${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`)
    .join('\n');

  try {
    console.log('🔧 STT 오류 교정 중...');
    const correctionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `당신은 한국어 의료 대화의 STT(음성-텍스트) 오류를 교정하는 전문가입니다.

엄격한 규칙:
1. 명백한 STT 오류만 교정하세요. 의미가 통하는 문장은 절대 건드리지 마세요.
2. 한두 글자만 바꿔서 말이 되게 만드세요. 문장 전체를 재작성하지 마세요.
3. 의학 용어 교정은 문맥이 강하게 뒷받침할 때만 적용하세요:
   - 예: 의사가 "고혈압, 당뇨 있으세요?"라고 물은 직후 "소아잠도" → "소아당뇨"로 교정 가능
   - 예: 문맥 없이 갑자기 나온 "소아잠도"는 원본 유지
4. 교정 가능한 의학 용어 (문맥 지지 시에만):
   - 소아잠도/소아장도 → 소아당뇨
   - 고혈야/고열압 → 고혈압
   - 뇌경생 → 뇌경색
   - 심근경생 → 심근경색
   - 협식증/협심정 → 협심증
   - 뇌졸증/뇌졸종 → 뇌졸중
5. 확신이 80% 이하면 원본 그대로 두세요.
6. 대화 형식(번호, 의사/환자 표시)은 반드시 그대로 유지하세요.
7. 문장을 추가하거나 삭제하지 마세요.

출력: 교정된 대화 텍스트만 출력. 설명 없이. 원본과 거의 동일해야 함.`
          },
          {
            role: 'user',
            content: rawConversation
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (correctionResponse.ok) {
      const correctionResult = await correctionResponse.json();
      const correctedText = correctionResult.choices[0]?.message?.content?.trim();
      
      if (correctedText) {
        // 안전 검사 1: 교정 결과가 원본 대비 10% 이상 길이 차이나면 원본 사용
        const lengthDiff = Math.abs(correctedText.length - rawConversation.length) / rawConversation.length;
        if (lengthDiff > 0.1) {
          console.warn('⚠️ STT 교정 결과가 원본과 너무 다름 (길이 차이 10% 초과), 원본 사용');
          return segments;
        }

        // 안전 검사 2: 화자 태그("의사:", "환자:") 개수가 일치하는지 확인
        const originalDoctorCount = (rawConversation.match(/의사:/g) || []).length;
        const originalPatientCount = (rawConversation.match(/환자:/g) || []).length;
        const correctedDoctorCount = (correctedText.match(/의사:/g) || []).length;
        const correctedPatientCount = (correctedText.match(/환자:/g) || []).length;
        
        if (originalDoctorCount !== correctedDoctorCount || originalPatientCount !== correctedPatientCount) {
          console.warn('⚠️ STT 교정 결과에서 화자 태그 개수가 변경됨, 원본 사용');
          console.warn(`  원본: 의사 ${originalDoctorCount}개, 환자 ${originalPatientCount}개`);
          console.warn(`  교정: 의사 ${correctedDoctorCount}개, 환자 ${correctedPatientCount}개`);
          return segments;
        }

        // 교정된 텍스트를 파싱하여 segments 업데이트
        const correctedLines = correctedText.split('\n').filter((line: string) => line.trim());
        const updatedSegments = [...segments];
        let filteredIdx = 0;

        for (let i = 0; i < updatedSegments.length && filteredIdx < correctedLines.length; i++) {
          if (updatedSegments[i].speaker === 'pending') continue;
          
          const line = correctedLines[filteredIdx];
          // 파싱: "1. 의사: 내용" 또는 "1. 환자: 내용"
          const match = line.match(/^\d+\.\s*(의사|환자):\s*(.+)$/);
          if (match) {
            const correctedContent = match[2].trim();
            if (correctedContent !== updatedSegments[i].text) {
              console.log(`📝 교정: "${updatedSegments[i].text}" → "${correctedContent}"`);
              updatedSegments[i] = { ...updatedSegments[i], text: correctedContent };
            }
          }
          filteredIdx++;
        }

        console.log('✅ STT 오류 교정 완료');
        return updatedSegments;
      }
    }
    
    console.warn('⚠️ STT 교정 API 실패, 원본 사용');
    return segments;
  } catch (correctionError) {
    console.warn('⚠️ STT 교정 중 오류, 원본 사용:', correctionError);
    return segments;
  }
}

export async function generateChart(
  segments: SpeakerSegment[],
  settings: ChartSettings
): Promise<GeneratedChart | null> {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    return null;
  }

  // 대화 내용 구성 (STT 교정은 이미 완료된 segments 사용)
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

  // JSON 스키마 (value + 추론 메타데이터 기본값 포함)
  const jsonSchema: Record<string, any> = {};
  allFields.forEach(field => {
    const isArray = field.type === 'tags' || field.type === 'list';
    const baseSchema = {
      value: isArray ? [] : '',
      source: 'stated',
      confidence: 'low',
      rationale: '',
      evidence: []
    };
    
    // assessment 필드에는 ddxList 추가 (DDx의 isConfirmed는 유지)
    if (field.id === 'assessment') {
      jsonSchema[field.id] = {
        ...baseSchema,
        ddxList: [
          {
            id: "ddx_1",
            diagnosis: "Diagnosis name in English",
            reason: "Brief reason for this DDx",
            confidence: "high|medium|low",
            isConfirmed: false,
            isRemoved: false,
            source: "doctor|ai"
          }
        ]
      };
    } else {
      jsonSchema[field.id] = baseSchema;
    }
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
- CC: KOREAN (patient's exact wording) + (onset: 시점) if mentioned
- PI: KOREAN "~함 체" narrative (호소함, 발생함, 있었음) - Use "상환은" (NOT "환자는" or patient name)
- PMH: English abbreviations + duration (DM (since childhood), HTN (x3y))
- Allergies: "None" if no allergies (NOT "NKDA")
- SHx: English (+/-) - Smoking (-), Alcohol (-)
- FHx: Korean style - 부: DM, 모: 특이사항 없음
- PE: Leave EMPTY if not performed, otherwise FULL (+/-) documentation
- Assessment/DDx/Dx/Plan: MEDICAL ENGLISH (no Korean diagnoses)
- Do NOT translate diagnoses into Korean.

=== HARD ASSESSMENT RULES (CRITICAL) ===
Assessment contains ONLY:
1. # Confirmed Dx (ONLY if doctor explicitly stated)
2. r/o DDx list (via ddxList array)

NO Summary, NO Provider Impression, NO explanations.
- assessment.value = "#" + confirmed diagnosis (or EMPTY if none)
- assessment.ddxList = array of r/o items
- AI can NEVER add "#" - only for doctor-confirmed diagnoses

=== HARD DDx RULES ===
- DDx: Max 2-3 items. Each goes into assessment.ddxList array.
- Each item: {id, diagnosis, reason, confidence, isConfirmed: false, isRemoved: false}
- Avoid vague terms (e.g., "cardiac problem", "brain issue").

=== HARD PLAN RULES ===
- Orders in ENGLISH.
- AI suggestions: Include reason in parentheses. Max 1-2 lines.
- Example: "Blood glucose check (LOC + DM history)"
- No explanatory sentences.

=== HARD F/U RULE ===
- Leave empty if not discussed.
- No generic statements like "검사 결과에 따라 f/u".

=== FORMATTING ===
- Bullets must have blank line between items.
${settings.additionalPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${settings.additionalPrompt}\n` : ''}

FIELDS TO FILL:
${fieldDescriptions}

RECORD vs AI INFERENCE:
- 차트는 기본적으로 "기록"임. 대화에서 나온 내용 = source="stated"
- AI 추론 = source="inferred"

RULES:
- CC, PI, ROS, PMH, Meds, Allergies, SHx, FHx, VS, PE, Labs, Imaging:
  - 대화에서 언급된 내용 → source="stated"
  - "없다/없어요" 답변 → "None" 기록 (예: PMH: None, Meds: None, Allergies: None)
  - 아예 질문/언급 안됨 → 비워둠 ("" or [])
- Assessment: 
  - value = "# Dx" ONLY if doctor confirmed (otherwise EMPTY)
  - ddxList = AI DDx 추천 (isConfirmed는 DDx에만 적용)
- Plan:
  - [Orders] 의사가 언급한 오더 → source="stated"
  - [AI Suggestions] AI 추천 → source="inferred"
- F/U: 의사가 언급한 경우 → source="stated"

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

⚠️ CRITICAL RULES:
1. 대화에서 언급된 내용만 기록! (언급 안 된 내용 임의 추가 금지)
2. 언급된 내용은 빠짐없이 기록!
3. "일반적으로 확인하는 항목"이라고 임의로 추가하지 말 것

FIELD-BY-FIELD RULES:
- CC: 환자 표현 그대로 + (onset: 시점) 필수
- PI: 모든 증상 특성 포함! (quality, location, timing, severity, aggravating/relieving factors)
  예: "조이는 것처럼 아프고 오후에 심해짐" → 반드시 포함
- ROS: 대화에서 언급된 증상만! 의학 약어 사용
  ⚠️ 언급되지 않은 증상 추가 금지 (SOB, chest pain 등 임의 추가 금지)
  예: N/V(-), HA(+), dizziness(+)
  ⚠️ "Nausea (-), Vomiting (-)" 금지 → "N/V(-)" 사용
- PMH: 있으면 약어 + duration (DM (10y), HTN (3y)), 없다고 답변하면 "None"
- Meds: 있으면 모든 약물 + 용량 + 용법, 없다고 답변하면 "None"
- Allergies: 있으면 기록, 없다고 답변하면 "None" (NKDA 금지)
- SHx: 
  - 안 함 → (-)
  - 함 → (+)
  - 가끔/특이사항 → 환자 표현 그대로! 예: Alcohol(가끔 한 잔 정도), Smoking(예전에 피웠다가 끊음)
- FHx: 한국식 (부: DM, HTN / 모: 특이사항 없음)
- SHx/FHx: 대화에서 명시된 경우만 작성. 기본값/추정 금지.
- SHx/FHx: 대화에서 명시된 경우만 작성. 기본값/추정 금지.
- VS: 측정된 모든 값 (BP, HR, BT, RR, SpO2)
- PE: 
  - 안 했으면 비워둘 것 (빈 문자열)
  - 했으면 실제 소견 기록! (예: "Neuro: no focal deficit")
- Labs: 검사 결과 (결과 없으면 비워둠)
- Imaging: 영상 결과/소견 (결과 없으면 비워둠)
- Assessment:
  - assessment.value = "# Dx" (의사가 확정한 경우만: "~입니다", "~이에요")
  - assessment.ddxList = 두 종류:
    1. source: "doctor" = 의사가 언급한 r/o ("의심된다", "것 같다")
    2. source: "ai" = AI가 대화 분석해서 추천하는 DDx
  ⚠️ AI 추천은 의사가 언급하지 않은 가능한 진단만!
- diagnosisConfirmed: 비워둘 것 (Assessment에서 # 표시로 충분)
- Plan: 오더만! (F/U 절대 포함 금지!)
  - 검사 오더: CBC, BMP, Brain CT 등
  - 약 처방/변경: Increase amlodipine, Acetaminophen PRN 등
  - 상담/교육: 등
  - 반드시 의사가 말한 오더 그대로 기입 (CT를 US로 바꾸는 등 금지)
  ⚠️ Plan에 "f/u 1wk", "외래 예약" 등 F/U 내용 넣지 말 것!
- F/U: 구체적 f/u만 (예: "f/u 1wk") - Plan과 완전 분리!

ASSESSMENT FORMAT:
- assessment.value = "# Dx" ONLY if doctor confirmed
- assessment.ddxList = AI DDx 추천

[진료 대화]
${conversation}`
          }
        ],
        max_tokens: 2000,
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

        // 기본값
        const base: ChartFieldValue = {
          value: isArrayField ? [] : '',
          source: 'stated',
          confidence: 'high',
          rationale: '',
          evidence: [],
        };

        if (rawValue && typeof rawValue === 'object' && 'value' in (rawValue as any)) {
          const fv = rawValue as {
            value: unknown;
            source?: 'stated' | 'inferred';
            confidence?: 'low' | 'medium' | 'high';
            rationale?: string;
            evidence?: unknown;
            ddxList?: unknown[];
          };

          const source: 'stated' | 'inferred' = fv.source === 'inferred' ? 'inferred' : 'stated';
          const evidence = normalizeEvidence(fv.evidence);
          const rationale = typeof fv.rationale === 'string' ? cleanStringValue(fv.rationale) : '';
          const confidence = normalizeConfidence(fv.confidence);

          // DDx 리스트 파싱 (assessment 필드용) - DDx의 isConfirmed는 유지
          let ddxList: DdxItem[] | undefined = undefined;
          if (field.id === 'assessment' && fv.ddxList && Array.isArray(fv.ddxList)) {
            // 1. 기본 파싱
            let parsedList = fv.ddxList.map((item: any, index: number) => ({
              id: item.id || `ddx_${index + 1}`,
              diagnosis: typeof item.diagnosis === 'string' ? item.diagnosis : '',
              reason: typeof item.reason === 'string' ? item.reason : '',
              confidence: normalizeConfidence(item.confidence),
              isConfirmed: item.isConfirmed === true,
              isRemoved: item.isRemoved === true,
              source: (item.source === 'doctor' ? 'doctor' : 'ai') as 'doctor' | 'ai',
            })).filter(item => item.diagnosis.trim() !== '');
            
            // 2. confidence >= medium만 포함 (low 제외)
            parsedList = parsedList.filter(item => 
              item.confidence === 'high' || item.confidence === 'medium'
            );
            
            // 3. confidence 순으로 정렬 (high > medium)
            parsedList.sort((a, b) => {
              const order = { high: 0, medium: 1, low: 2 };
              return order[a.confidence] - order[b.confidence];
            });
            
            // 4. 최대 5개로 제한
            ddxList = parsedList.slice(0, 5);
            
            console.log(`📋 DDx 필터링: ${fv.ddxList.length}개 → ${ddxList.length}개 (confidence >= medium)`);
          }

          if (isArrayField) {
            const arr = normalizeArrayValue(fv.value);
            chartData[field.id] = {
              ...base,
              value: arr,
              source,
              confidence,
              rationale,
              evidence,
              ...(ddxList && { ddxList }),
            };
          } else {
            const str = typeof fv.value === 'string' ? cleanStringValue(fv.value) : '';
            chartData[field.id] = {
              ...base,
              value: str,
              source,
              confidence,
              rationale,
              evidence,
              ...(ddxList && { ddxList }),
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

        // 안전장치: evidence는 최대 2개
        if (chartData[field.id].evidence && chartData[field.id].evidence!.length > 2) {
          chartData[field.id].evidence = chartData[field.id].evidence!.slice(0, 2);
        }
      });

      // 후처리: Assessment에서 구조 헤더 제거 (새 구조: # Dx만 또는 빈 값)
      if (chartData.assessment && typeof chartData.assessment.value === 'string') {
        // [Summary], [Provider Impression], [AI DDx] 등 모든 구조 헤더 제거
        chartData.assessment.value = chartData.assessment.value
          .replace(/\[Summary\]/gi, '')
          .replace(/\[Provider Impression\][^\[]*/gi, '')
          .replace(/\[AI DDx[^\]]*\]/gi, '')
          .replace(/\n{2,}/g, '\n')
          .trim();
        
        // 결과가 # 로 시작하지 않으면 (확정 Dx 없으면) 비움
        if (!chartData.assessment.value.startsWith('#')) {
          chartData.assessment.value = '';
        }
      }

      const statedFields: string[] = [];
      const inferredFields: string[] = [];

      Object.entries(chartData).forEach(([fieldId, fieldValue]) => {
        if (hasValue(fieldValue.value)) {
          if (fieldValue.source === 'stated') statedFields.push(fieldId);
          if (fieldValue.source === 'inferred') inferredFields.push(fieldId);
        }
      });

      console.log(`✅ 차트 생성 완료!`);
      console.log(`   ✓ 기록(source=stated) (${statedFields.length}개): ${statedFields.join(', ') || '없음'}`);
      console.log(`   ⚠ AI추론(source=inferred) (${inferredFields.length}개): ${inferredFields.join(', ') || '없음'}`);

      return sanitizeChartData(chartData, conversation, allFields);
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

// Streaming 차트 생성 함수
export async function generateChartFromTranscriptStreaming(
  transcript: string,
  segments: SpeakerSegment[],
  department: string = 'internal',
  onPartialUpdate: (partialChart: GeneratedChart) => void,
  abortSignal?: AbortSignal,
  fastMode: boolean = false,
  patientInfo?: { name?: string; memo?: string }
): Promise<GeneratedChart | null> {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    return null;
  }

  const settings: ChartSettings = {
    ...DEFAULT_CHART_SETTINGS,
    selectedDepartment: department,
    activeFields: getFieldsForDepartment(department),
  };

  const useSegments = segments.length > 0 ? segments : [{ speaker: 'patient' as const, text: transcript }];

  // 환자 정보 구성 (참고용 - 직접 기록 X)
  let patientContext = '';
  if (patientInfo?.name || patientInfo?.memo) {
    const parts = [];
    if (patientInfo.name) parts.push(`환자명: ${patientInfo.name}`);
    if (patientInfo.memo) parts.push(`참고 메모 (직접 기록 금지, DDx/Plan 참고용): ${patientInfo.memo}`);
    patientContext = `[사전 입력 정보 - 차트에 직접 기록하지 말고 DDx 추론 및 Plan 작성 시 참고만 할 것]\n${parts.join('\n')}\n\n`;
  }

  // 대화 내용 구성
  const conversation = useSegments
    .filter(s => s.speaker !== 'pending')
    .map((s, idx) => `${idx + 1}. ${s.speaker === 'doctor' ? '의사' : '환자'}: ${s.text}`)
    .join('\n');

  if (!conversation.trim()) {
    console.error('❌ 대화 내용이 없습니다.');
    return null;
  }

  // 환자 정보 + 대화 내용 합치기
  const fullConversation = patientContext + conversation;

  const preset = DEPARTMENT_PRESETS.find(p => p.id === settings.selectedDepartment) || DEPARTMENT_PRESETS[0];
  const allFields = settings.activeFields && settings.activeFields.length > 0
    ? settings.activeFields
    : preset.fields;

  // JSON 스키마 생성 (기존과 동일)
  const jsonSchema: Record<string, any> = {};
  allFields.forEach(field => {
    const isArray = field.type === 'tags' || field.type === 'list';
    const baseSchema = {
      value: isArray ? [] : '',
      source: 'stated',
      confidence: 'low',
      rationale: '',
      evidence: [],
    };

    if (field.id === 'assessment') {
      jsonSchema[field.id] = {
        ...baseSchema,
        ddxList: [
          {
            id: "ddx_1",
            diagnosis: "Diagnosis name in English",
            reason: "Brief reason for this DDx",
            confidence: "high|medium|low",
            isConfirmed: false,
            isRemoved: false,
            source: "doctor|ai"
          }
        ]
      };
    } else {
      jsonSchema[field.id] = baseSchema;
    }
  });

  // 필드 설명 생성
  const fieldDescriptions = allFields.map(f => {
    const langHint = f.description || '';
    return `- ${f.nameEn || f.name}: ${langHint}`;
  }).join('\n');

  // 시스템 프롬프트 (기존 generateChart와 동일한 상세 규칙 사용)
  const systemPrompt = `
You are an experienced ${preset.name !== '일반' ? preset.name : 'physician'} documenting a Korean hospital outpatient EMR note.

${preset.promptContext || ''}

=== HARD LANGUAGE RULES (MOST IMPORTANT) ===
- CC: KOREAN (patient's exact wording) + (onset: 시점) if mentioned
- PI: KOREAN "~함 체" narrative (호소함, 발생함, 있었음) - Use "상환은" (NOT "환자는" or patient name)
- PMH: English abbreviations + duration (DM (since childhood), HTN (x3y))
- Allergies: "None" if no allergies (NOT "NKDA")
- SHx: English (+/-) - Smoking (-), Alcohol (-)
- FHx: Korean style - 부: DM, 모: 특이사항 없음
- PE: Leave EMPTY if not performed, otherwise FULL (+/-) documentation
- Assessment/DDx/Dx/Plan: MEDICAL ENGLISH (no Korean diagnoses)
- Do NOT translate diagnoses into Korean.

=== HARD ASSESSMENT RULES (CRITICAL) ===
Assessment contains ONLY:
1. # Confirmed Dx (ONLY if doctor explicitly stated)
2. r/o DDx list (via ddxList array)

NO Summary, NO Provider Impression, NO explanations.
- assessment.value = "#" + confirmed diagnosis (or EMPTY if none)
- assessment.ddxList = array of r/o items
- AI can NEVER add "#" - only for doctor-confirmed diagnoses

=== HARD DDx RULES ===
- DDx: Max 2-3 items. Each goes into assessment.ddxList array.
- Each item: {id, diagnosis, reason, confidence, isConfirmed: false, isRemoved: false, source: "doctor"|"ai"}
  - source: "doctor" = 의사가 "의심된다/것 같다"고 언급한 진단
  - source: "ai" = AI가 대화 분석해서 추천 (의사가 언급 안 한 것만)
- Avoid vague terms (e.g., "cardiac problem", "brain issue").
- ⚠️ 사전 입력된 참고 메모(기저질환, 알러지 등)가 있으면 DDx 추론 시 반드시 고려할 것!
  - 예: 메모에 "DM"이 있으면 당뇨 관련 합병증도 DDx로 고려
  - 단, 메모 내용을 PMH/Allergies에 직접 기록하지 말 것 (대화에서 언급된 것만 기록)

=== HARD PLAN RULES ===
- Orders in ENGLISH.
- AI suggestions: Include reason in parentheses. Max 1-2 lines.
- Example: "Blood glucose check (LOC + DM history)"
- No explanatory sentences.
- ⚠️ 사전 입력된 참고 메모(알러지, 복용약물 등)가 있으면 Plan 작성 시 고려할 것!
  - 예: 메모에 "Aspirin 복용 중"이 있으면 약물 상호작용 고려
  - 예: 메모에 "PCN allergy"가 있으면 해당 계열 항생제 회피
⚠️ Plan에 F/U 내용 절대 포함 금지! (f/u 1wk, 외래 예약 등 → F/U 필드로!)

=== HARD F/U RULE ===
- F/U 내용은 F/U 필드에만! Plan에 넣지 말 것!
- Leave empty if not discussed.
- No generic statements like "검사 결과에 따라 f/u".

=== FORMATTING ===
- Bullets must have blank line between items.

FIELDS TO FILL:
${fieldDescriptions}

RECORD vs AI INFERENCE:
- 차트는 기본적으로 "기록"임. 대화에서 나온 내용 = source="stated"
- AI 추론 = source="inferred"

RULES:
- CC, PI, ROS, PMH, Meds, Allergies, SHx, FHx, VS, PE, Labs, Imaging:
  - 대화에서 언급된 내용 → source="stated"
  - "없다/없어요" 답변 → "None" 기록 (예: PMH: None, Meds: None, Allergies: None)
  - 아예 질문/언급 안됨 → 비워둠 ("" or [])
- Assessment:
  - assessment.value = "# Dx" (의사가 확정한 경우만: "~입니다", "~이에요")
  - assessment.ddxList = 두 종류 (isConfirmed는 DDx에만 적용):
    1. source: "doctor" = 의사가 언급한 r/o ("의심된다", "것 같다")
    2. source: "ai" = AI가 대화 분석해서 추천하는 DDx
  ⚠️ AI 추천은 의사가 언급하지 않은 가능한 진단만!
- Plan:
  - [Orders] 의사가 언급한 오더 → source="stated"
  - [AI Suggestions] AI 추천 → source="inferred"
- F/U: 의사가 언급한 경우 → source="stated"

OUTPUT FORMAT (PURE JSON ONLY):
${JSON.stringify(jsonSchema, null, 2)}

CRITICAL:
- Output ONLY valid JSON (no markdown)
- Include all keys for every field
- Empty if not mentioned ("" or [])
`.trim();

  const userPrompt = `다음 진료 대화를 바탕으로 한국 병원 외래 EMR처럼 작성해줘.

⚠️ CRITICAL RULES:
1. 대화에서 언급된 내용만 기록! (언급 안 된 내용 임의 추가 금지)
2. 언급된 내용은 빠짐없이 기록!
3. "일반적으로 확인하는 항목"이라고 임의로 추가하지 말 것

FIELD-BY-FIELD RULES:
- CC: 환자 표현 그대로 + (onset: 시점) 필수
- PI: 모든 증상 특성 포함! (quality, location, timing, severity, aggravating/relieving factors)
  예: "조이는 것처럼 아프고 오후에 심해짐" → 반드시 포함
- ROS: 대화에서 언급된 증상만! 의학 약어 사용
  ⚠️ 언급되지 않은 증상 추가 금지 (SOB, chest pain 등 임의 추가 금지)
  예: N/V(-), HA(+), dizziness(+)
- PMH: 있으면 약어 + duration (DM (10y), HTN (3y)), 없다고 답변하면 "None"
- Meds: 있으면 모든 약물 + 용량 + 용법, 없다고 답변하면 "None"
- Allergies: 있으면 기록, 없다고 답변하면 "None" (NKDA 금지)
- SHx: 
  - 안 함 → (-)
  - 함 → (+)
  - 가끔/특이사항 → 환자 표현 그대로! 예: Alcohol(가끔 한 잔 정도), Smoking(예전에 피웠다가 끊음)
- FHx: 한국식 (부: DM, HTN / 모: 특이사항 없음)
- VS: 측정된 모든 값 (BP, HR, BT, RR, SpO2)
- PE: 
  - 안 했으면 비워둘 것 (빈 문자열)
  - 했으면 실제 소견 기록! (예: "Neuro: no focal deficit")
- Labs: 검사 결과 (결과 없으면 비워둠)
- Imaging: 영상 결과/소견 (결과 없으면 비워둠)
- Assessment:
  - assessment.value = "# Dx" (의사가 확정한 경우만)
  - assessment.ddxList = 의사 r/o + AI 추천 DDx
- Plan: 오더만! (F/U 절대 포함 금지!)
  - 검사 오더: CBC, BMP, Brain CT 등
  - 약 처방/변경: Increase amlodipine, Acetaminophen PRN 등
  - 반드시 의사가 말한 오더 그대로 기입 (CT를 US로 바꾸는 등 금지)
- F/U: 구체적 f/u만 (예: "f/u 1wk") - Plan과 완전 분리!

[진료 대화]
${fullConversation}`;

  try {
    console.log('🚀 Streaming 차트 생성 시작...');
    console.log('📝 대화 내용 (segments:', useSegments.length, '개):', conversation.substring(0, 500) + (conversation.length > 500 ? '...' : ''));
    
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
          { role: 'user', content: userPrompt }
        ],
        max_tokens: fastMode ? 1500 : 2000,
        temperature: 0.2,
        stream: true, // Streaming 활성화!
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Streaming API 오류:', response.status, errorText);
      return null;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error('❌ Response body reader 없음');
      return null;
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let lastValidChart: GeneratedChart | null = null;
    let lastUpdateTime = 0;
    let lastFieldCount = 0;
    let lastContentHash = '';
    const UPDATE_THROTTLE_MS = 1200; // 더 촘촘한 실시간 업데이트

    // 차트 내용 해시 생성 (변경 감지용)
    const getContentHash = (chart: GeneratedChart): string => {
      return Object.keys(chart)
        .sort()
        .map(k => {
          const v = chart[k]?.value;
          return `${k}:${typeof v === 'string' ? v.trim() : JSON.stringify(v)}`;
        })
        .join('|');
    };

    // Streaming 읽기
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            fullContent += delta;

            const now = Date.now();
            const partialChart = tryParsePartialJson(fullContent, allFields, conversation);
            
            if (partialChart && Object.keys(partialChart).length > 0) {
              const fieldCount = Object.keys(partialChart).filter(k => {
                const v = partialChart[k]?.value;
                return v && (typeof v === 'string' ? v.trim() : (v as string[]).length > 0);
              }).length;
              
              const contentHash = getContentHash(partialChart);
              
              // 내용이 실제로 변경되었고, (새 필드 추가 또는 throttle 시간 경과) 
              const contentChanged = contentHash !== lastContentHash;
              const shouldUpdate = contentChanged && (
                fieldCount > lastFieldCount || 
                now - lastUpdateTime > UPDATE_THROTTLE_MS
              );
              
              if (shouldUpdate) {
                console.log(`📊 Streaming 업데이트: ${fieldCount}개 필드 (변경됨)`);
                lastValidChart = partialChart;
                lastFieldCount = fieldCount;
                lastUpdateTime = now;
                lastContentHash = contentHash;
                onPartialUpdate(partialChart);
              }
            }
          } catch {
            // JSON 파싱 실패는 무시 (아직 완성 안됨)
          }
        }
      }
    }

    // 최종 파싱
    console.log('📝 Streaming 완료, 최종 파싱...');
    console.log('📄 GPT 전체 응답:', fullContent.substring(0, 2000) + (fullContent.length > 2000 ? '...(truncated)' : ''));
    const finalChart = parseFullChartJson(fullContent, allFields, conversation);
    
    if (finalChart) {
      onPartialUpdate(finalChart);
      return finalChart;
    }

    return lastValidChart;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('🛑 Streaming 요청 취소됨');
      return lastValidChart;
    }
    console.error('❌ Streaming 오류:', error);
      return null;
  }
}

// 부분 JSON 파싱 시도
function tryParsePartialJson(content: string, fields: ChartField[], conversation: string): GeneratedChart | null {
  try {
    // markdown 코드블록 제거
    let jsonStr = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // 불완전한 JSON 보완 시도
    // 열린 중괄호/대괄호 개수 세기
    const openBraces = (jsonStr.match(/{/g) || []).length;
    const closeBraces = (jsonStr.match(/}/g) || []).length;
    const openBrackets = (jsonStr.match(/\[/g) || []).length;
    const closeBrackets = (jsonStr.match(/]/g) || []).length;

    // 닫히지 않은 문자열 처리 (마지막 미완성 값 제거)
    if (jsonStr.includes('"') && (jsonStr.match(/"/g) || []).length % 2 !== 0) {
      // 마지막 따옴표 이후 제거
      const lastQuoteIndex = jsonStr.lastIndexOf('"');
      const beforeLastQuote = jsonStr.substring(0, lastQuoteIndex);
      const secondLastQuoteIndex = beforeLastQuote.lastIndexOf('"');
      if (secondLastQuoteIndex > 0) {
        jsonStr = jsonStr.substring(0, secondLastQuoteIndex) + '""';
      }
    }

    // 닫는 괄호 추가
    jsonStr += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    jsonStr += '}'.repeat(Math.max(0, openBraces - closeBraces));

    const rawData = JSON.parse(jsonStr);
    return parseRawChartData(rawData, fields, conversation);
  } catch {
    return null;
  }
}

// 최종 JSON 파싱
function parseFullChartJson(content: string, fields: ChartField[], conversation: string): GeneratedChart | null {
  try {
    let jsonStr = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let rawData: Record<string, unknown>;
    try {
      rawData = JSON.parse(jsonStr);
    } catch {
      // 키 따옴표 추가 시도
      jsonStr = jsonStr.replace(/(\s*)(\w+)(\s*):/g, '$1"$2"$3:');
      jsonStr = jsonStr.replace(/""/g, '"');
      rawData = JSON.parse(jsonStr);
    }

    return parseRawChartData(rawData, fields, conversation);
  } catch (error) {
    console.error('❌ 최종 JSON 파싱 실패:', error);
    return null;
  }
}

// rawData를 GeneratedChart로 변환
function parseRawChartData(rawData: Record<string, unknown>, fields: ChartField[], conversation: string): GeneratedChart {
  const chartData: GeneratedChart = {};

  fields.forEach(field => {
    const rawValue = rawData[field.id];
    const isArrayField = field.type === 'tags' || field.type === 'list';

    const base: ChartFieldValue = {
      value: isArrayField ? [] : '',
      source: 'stated',
      confidence: 'high',
      rationale: '',
      evidence: [],
    };

    if (rawValue && typeof rawValue === 'object' && 'value' in (rawValue as any)) {
      const fv = rawValue as any;
      const source: 'stated' | 'inferred' = fv.source === 'inferred' ? 'inferred' : 'stated';
      const evidence = normalizeEvidence(fv.evidence);
      const rationale = typeof fv.rationale === 'string' ? cleanStringValue(fv.rationale) : '';
      const confidence = normalizeConfidence(fv.confidence);

      // DDx 리스트 파싱 (assessment 필드용) - DDx의 isConfirmed는 유지
      let ddxList: DdxItem[] | undefined = undefined;
      if (field.id === 'assessment' && fv.ddxList && Array.isArray(fv.ddxList)) {
        // 1. 기본 파싱
        let parsedList = fv.ddxList.map((item: any, index: number) => ({
          id: item.id || `ddx_${index + 1}`,
          diagnosis: typeof item.diagnosis === 'string' ? item.diagnosis : '',
          reason: typeof item.reason === 'string' ? item.reason : '',
          confidence: normalizeConfidence(item.confidence),
          isConfirmed: item.isConfirmed === true,
          isRemoved: item.isRemoved === true,
          source: (item.source === 'doctor' ? 'doctor' : 'ai') as 'doctor' | 'ai',
        })).filter((item: DdxItem) => item.diagnosis.trim() !== '');
        
        // 2. confidence >= medium만 포함 (low 제외)
        parsedList = parsedList.filter((item: DdxItem) => 
          item.confidence === 'high' || item.confidence === 'medium'
        );
        
        // 3. doctor 먼저, 그 다음 confidence 순으로 정렬 (high > medium)
        parsedList.sort((a: DdxItem, b: DdxItem) => {
          // doctor 소스를 먼저
          if (a.source !== b.source) {
            return a.source === 'doctor' ? -1 : 1;
          }
          // 같은 소스면 confidence 순
          const order = { high: 0, medium: 1, low: 2 };
          return order[a.confidence] - order[b.confidence];
        });
        
        // 4. 최대 5개로 제한
        ddxList = parsedList.slice(0, 5);
        
        console.log(`📋 [Streaming] DDx 필터링: ${fv.ddxList.length}개 → ${ddxList?.length ?? 0}개 (confidence >= medium)`);
      }

      if (isArrayField) {
        const arr = normalizeArrayValue(fv.value);
        chartData[field.id] = {
          ...base,
          value: arr,
          source,
          confidence,
          rationale,
          evidence,
          ...(ddxList && { ddxList }),
        };
      } else {
        const str = typeof fv.value === 'string' ? cleanStringValue(fv.value) : '';
        chartData[field.id] = {
          ...base,
          value: str,
          source,
          confidence,
          rationale,
          evidence,
          ...(ddxList && { ddxList }),
        };
      }
    } else if (rawValue !== undefined && rawValue !== null) {
      // 단순 값인 경우 (객체는 빈 문자열로)
      if (isArrayField) {
        chartData[field.id] = { ...base, value: normalizeArrayValue(rawValue) };
      } else {
        chartData[field.id] = { ...base, value: safeString(rawValue) };
      }
    }
  });

  return sanitizeChartData(chartData, conversation, fields);
}

// 변수 초기화를 위한 임시 변수 (streaming abort용)
let lastValidChart: GeneratedChart | null = null;

export type ChartData = GeneratedChart;
