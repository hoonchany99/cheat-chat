# 🩺 Cheat Chat AI - 자동 차팅 웹 서비스

진료 대화를 **실시간으로 텍스트로 변환**하고, **AI가 자동으로 의무 기록 차트**를 생성하는 웹 서비스입니다.

## 📋 주요 기능

- **실시간 음성 인식** - Deepgram 스트리밍 STT로 대화를 즉시 텍스트로 변환
- **AI 화자 분류** - GPT-4o가 의사/환자 발화를 자동 구분
- **자동 차트 생성** - 진료과별 맞춤 차트 템플릿으로 의무 기록 자동 생성
- **확실/추측 구분** - 대화에서 직접 언급된 내용과 AI 추측을 명확히 분리

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              사용자 브라우저                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │
│   │  VoiceRecorder  │───▶│TranscriptViewer │    │ ChartingResult  │       │
│   │   (녹음 UI)     │    │ (대화 표시)     │    │  (차트 표시)    │       │
│   └────────┬────────┘    └────────▲────────┘    └────────▲────────┘       │
│            │                      │                      │                 │
│            │ 오디오 청크          │ 실시간 세그먼트       │ 생성된 차트     │
│            ▼                      │                      │                 │
│   ┌────────────────────────────────────────────────────────────────┐      │
│   │                         App.tsx                                 │      │
│   │                      (상태 관리)                                │      │
│   └────────┬─────────────────────────────────────────────┬─────────┘      │
│            │                                             │                 │
└────────────┼─────────────────────────────────────────────┼─────────────────┘
             │                                             │
             ▼                                             ▼
┌────────────────────────────┐              ┌────────────────────────────┐
│     deepgramService.ts     │              │      chartService.ts       │
│  ┌──────────────────────┐  │              │  ┌──────────────────────┐  │
│  │ DeepgramRealtime     │  │              │  │  generateChart()     │  │
│  │ Transcriber          │  │              │  │                      │  │
│  │ - WebSocket 연결     │  │              │  │  - 진료과별 프리셋   │  │
│  │ - 발화 수집          │  │              │  │  - GPT 프롬프트      │  │
│  │ - 배치 화자 분류     │  │              │  │  - 확실/추측 구분    │  │
│  └──────────┬───────────┘  │              │  └──────────┬───────────┘  │
└─────────────┼──────────────┘              └─────────────┼──────────────┘
              │                                           │
              ▼                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              외부 API                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────┐       ┌─────────────────────────────────┐   │
│   │       Deepgram          │       │           OpenAI                 │   │
│   │   (실시간 STT)          │       │                                  │   │
│   │                         │       │  ┌─────────────────────────────┐│   │
│   │  • Nova-2 모델          │       │  │ GPT-4o                      ││   │
│   │  • 한국어 지원          │       │  │ • 실시간 화자 분류          ││   │
│   │  • WebSocket 스트리밍   │       │  │ • 최종 화자 분류            ││   │
│   │  • VAD (발화 감지)      │       │  │ • 차트 생성                 ││   │
│   │                         │       │  └─────────────────────────────┘│   │
│   └─────────────────────────┘       └─────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 데이터 흐름

### 1️⃣ 녹음 → 실시간 전사 (Deepgram)

```
마이크 입력
    │
    ▼ MediaRecorder (250ms 청크)
    │
    ▼ WebSocket
    │
    ▼ Deepgram Nova-2 (한국어)
    │
    ▼ 실시간 텍스트 반환
    │
    └──▶ utterances[] 배열에 추가
```

### 2️⃣ 실시간 화자 분류 (GPT-4o)

```
새 발화 추가
    │
    ▼ 2초 디바운스
    │
    ▼ 최근 5개 발화 추출
    │
    ▼ GPT-4o API 호출
    │
    ├──▶ 번호 기반 화자 분류 (D/P)
    │    "1. 어디가 아프세요?" → D
    │    "2. 머리가 아파요" → P
    │
    ▼ 인덱스 기반 병합
    │
    └──▶ classifiedSegments[] 업데이트
         (이전 세그먼트 유지 + 새 분류 추가)
```

### 3️⃣ 녹음 종료 → 최종 화자 분류

```
녹음 종료
    │
    ▼ WebSocket 닫기
    │
    ▼ 전체 utterances[] → GPT-4o
    │
    ▼ 정확한 화자 분류 (분리 포함)
    │    예: "감사합니다 원장님 불편하시면 오세요"
    │    → [P: "감사합니다 원장님"] + [D: "불편하시면 오세요"]
    │
    └──▶ 최종 SpeakerSegment[] 반환
```

### 4️⃣ 차트 자동 생성 (GPT-4o)

```
최종 세그먼트
    │
    ▼ 대화 텍스트 포맷팅
    │    "의사: 어디가 아프세요?"
    │    "환자: 머리가 아파요"
    │
    ▼ 진료과별 프리셋 적용
    │    (일반/내과/피부과/정형외과/정신과/소아과/치과)
    │
    ▼ GPT-4o API 호출
    │
    ▼ JSON 차트 생성
    │    {
    │      "chiefComplaint": { "value": "머리가 아파요", "isConfirmed": true },
    │      "assessment": { "value": "Tension headache", "isConfirmed": false }
    │    }
    │
    └──▶ GeneratedChart 반환
         (확실: 대화에서 언급됨 / 추측: AI 판단)
```

---

## 📁 프로젝트 구조

```
cheat-chat/
├── src/
│   ├── app/
│   │   ├── App.tsx                    # 메인 앱 컴포넌트 (상태 관리)
│   │   └── components/
│   │       ├── VoiceRecorder.tsx      # 녹음 UI + MediaRecorder
│   │       ├── TranscriptViewer.tsx   # 실시간/최종 대화 표시
│   │       ├── ChartingResult.tsx     # 생성된 차트 표시/편집
│   │       ├── ChartSettingsModal.tsx # 진료과/필드 설정 모달
│   │       └── ui/                    # shadcn/ui 컴포넌트
│   │
│   ├── services/
│   │   ├── deepgramService.ts         # Deepgram 실시간 STT + GPT 화자 분류
│   │   └── chartService.ts            # 진료과 프리셋 + GPT 차트 생성
│   │
│   └── styles/
│       ├── index.css                  # 글로벌 스타일
│       └── tailwind.css               # Tailwind 설정
│
├── index.html
├── vite.config.ts
├── package.json
└── .env                               # API 키 (VITE_DEEPGRAM_API_KEY, VITE_OPENAI_API_KEY)
```

---

## 🧩 핵심 컴포넌트

### `deepgramService.ts` - 실시간 음성 인식 + 화자 분류

```typescript
class DeepgramRealtimeTranscriber {
  // 상태
  utterances: string[]              // 전체 발화 배열
  classifiedSegments: SpeakerSegment[]  // 분류된 세그먼트
  
  // 메서드
  connect()                         // Deepgram WebSocket 연결
  addChunk(blob)                    // 오디오 청크 전송
  handleNewUtterance(text)          // 새 발화 → 배치 분류 예약
  classifyRecentUtterances()        // GPT-4o 화자 분류 (최근 5개)
  flush()                           // 녹음 종료 → 최종 분류
}
```

**화자 분류 알고리즘**:
- 윈도우 방식: 최근 5개 발화만 GPT에 전송
- 인덱스 기반 병합: `slice(0, startIdx) + newSegments`
- 앞부분 세그먼트 유지 보장

### `chartService.ts` - AI 차트 생성

```typescript
// 진료과별 프리셋
DEPARTMENT_PRESETS = [
  { id: 'general', name: '일반', fields: [...], promptContext: '...' },
  { id: 'internal', name: '내과', ... },
  { id: 'dermatology', name: '피부과', ... },
  // ...
]

// 차트 생성
generateChart(segments, settings): GeneratedChart
  // → { fieldId: { value: string, isConfirmed: boolean } }
```

**확실/추측 구분 기준**:
- `isConfirmed: true` - 대화에서 직접 언급됨 (환자가 말한 증상 등)
- `isConfirmed: false` - AI 추측/추천 (진단, 치료계획 등)

---

## 🚀 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env` 파일 생성:

```env
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key
VITE_OPENAI_API_KEY=your_openai_api_key
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 빌드

```bash
npm run build
```

---

## 🔧 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS 4, Radix UI (shadcn/ui) |
| **음성 인식** | Deepgram Nova-2 (WebSocket 스트리밍) |
| **AI** | OpenAI GPT-4o (화자 분류 + 차트 생성) |
| **상태 관리** | React useState/useRef |

---

## 📊 API 사용량

| 기능 | 모델 | 호출 시점 |
|------|------|-----------|
| 실시간 화자 분류 | GPT-4o | 발화 추가 후 2초 디바운스 |
| 최종 화자 분류 | GPT-4o | 녹음 종료 시 1회 |
| 차트 생성 | GPT-4o | 화자 분류 완료 후 1회 |

---

## 🎯 사용 시나리오

1. **녹음 시작** - 마이크 버튼 클릭
2. **대화 진행** - 의사-환자 대화가 실시간으로 텍스트로 변환
3. **화자 자동 분류** - AI가 의사/환자 발화를 자동 구분 (실시간)
4. **녹음 종료** - 정지 버튼 클릭
5. **차트 자동 생성** - AI가 진료과별 차트 템플릿에 맞춰 작성
6. **확인 및 수정** - 확실한 정보 확인, AI 추측 검토 후 확정
7. **복사** - 확정된 내용만 또는 전체 복사

---

## 📝 라이선스

MIT License
