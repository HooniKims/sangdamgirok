# Sangdam Note - 프로젝트 작업 기록

## 📌 프로젝트 개요

**Sangdam Note**는 선생님을 위한 스마트한 상담 관리 시스템입니다.  
학생 상담 내용을 기록하고, AI를 활용하여 요약하며, 통계를 확인할 수 있는 웹 애플리케이션입니다.

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|------|------|
| **프레임워크** | Next.js 16 (React 19) |
| **스타일링** | 순수 CSS (Pure CSS) - Tailwind CSS 미사용 |
| **인증** | Firebase Authentication (Email/Password) |
| **데이터베이스** | Firebase Firestore |
| **AI** | 로컬 LLM API (Ollama OpenAI 호환 엔드포인트) |
| **폰트** | Google Fonts - Outfit |
| **아이콘** | Lucide React |
| **언어** | TypeScript |

---

## 📁 프로젝트 구조

```
sangdam/
├── app/
│   ├── api/
│   │   └── summarize/
│   │       └── route.ts          # AI 요약 API 엔드포인트
│   ├── globals.css               # 순수 CSS 디자인 시스템
│   ├── layout.tsx                # 루트 레이아웃
│   ├── page.tsx                  # 메인 페이지
│   └── favicon.ico
├── components/
│   ├── auth-guard.tsx            # 인증 가드 컴포넌트
│   └── dashboard.tsx             # 메인 대시보드 컴포넌트
├── lib/
│   └── firebase.ts               # Firebase 설정
├── types/
│   └── index.ts                  # TypeScript 타입 정의
├── firestore.rules               # Firestore 보안 규칙
├── .env.local                    # 환경 변수 (Firebase, Ollama API 키)
└── package.json
```

---

## ✅ 구현된 기능

### 1. 인증 시스템 (AuthGuard)
- [x] Firebase 이메일/비밀번호 회원가입
- [x] Firebase 이메일/비밀번호 로그인
- [x] 회원가입 시 `users/{uid}` 교사 프로필 생성 (`role: "teacher"`)
- [x] Firebase 세션 기반 자동 로그인 상태 유지 (`onAuthStateChanged`)
- [x] 깔끔한 로그인 UI

### 2. 캘린더 뷰
- [x] 월별 캘린더 표시
- [x] 날짜 선택 기능
- [x] "오늘" 버튼 (pill 형태, 보라색 배경)
- [x] 상담이 있는 날짜에 점(dot) 표시
- [x] 일요일/공휴일 빨간색, 토요일 파란색 표시
- [x] 한국 공휴일 지원 (설날, 추석, 어린이날 등)

### 3. 상담 관리
- [x] 상담 내용 등록 (시간, 학번, 이름, 주제, 내용)
- [x] 상담 목록 조회
- [x] 상담 삭제 기능
- [x] 검색 기능 (학생 이름, 상담 내용, 주제)
- [x] 교사 계정별 상담 데이터 분리 (`teacherId` 기준 조회/저장)

### 4. AI 요약 기능
- [x] Ollama OpenAI 호환 API 연동
- [x] 상담 내용 자동 정리 (포멀한 문체로 변환)
- [x] 마크다운 미사용 - 가독성 높은 특수 기호 사용
- [x] 출력 형식:
  - 【상담 개요】 상담 주제 한 줄 정리
  - 【상담 내용】 원본을 포멀하게 정돈
- [x] 사용 기호: 【】 제목, 「」 강조, • 불릿, → 화살표

### 5. 학생 목록
- [x] 상담 기록이 있는 학생 목록 표시
- [x] 학생 클릭 시 상담 내역 펼침/접기 (아코디언)
- [x] 개별 상담 삭제
- [x] 학생 데이터 전체 삭제 기능

### 6. 통계
- [x] 총 상담 건수
- [x] AI 요약 활용 건수
- [x] 상담 학생 수
- [x] 월별 상담 추이 차트 (최근 6개월, 실제 데이터 기반)

### 7. 네비게이션
- [x] 상담 관리 / 학생 목록 / 통계 탭 전환
- [x] 로고 클릭 시 상담 관리로 이동
- [x] 로그아웃 기능

---

## 🎨 디자인 시스템 (Pure CSS)

### CSS Variables
```css
:root {
  --primary: #6366f1;        /* 보라색 - 메인 컬러 */
  --primary-hover: #4f46e5;
  --primary-light: #eef2ff;
  
  --secondary: #f59e0b;      /* 노란색 - AI 요약 */
  --secondary-light: #fffbeb;
  
  --danger: #ef4444;         /* 빨간색 - 삭제, 경고 */
  
  --background: #f9fafb;     /* 배경 */
  --surface: #ffffff;        /* 카드 배경 */
  --border: #e5e7eb;         /* 테두리 */
}
```

### 주요 컴포넌트 클래스
- `.card` - 카드 컴포넌트 (둥근 모서리, 그림자)
- `.btn`, `.btn-primary`, `.btn-ghost` - 버튼 스타일
- `.input-field` - 입력 필드
- `.badge`, `.badge-primary` - 뱃지
- `.calendar-day`, `.calendar-day.selected` - 캘린더 날짜

### 유틸리티 클래스
- 레이아웃: `.flex`, `.grid`, `.items-center`, `.justify-between`
- 여백: `.p-6`, `.mb-4`, `.gap-4`
- 타이포그래피: `.text-xl`, `.font-bold`, `.text-gray-900`
- 색상: `.bg-primary`, `.text-white`, `.border`

---

## 📝 환경 변수 (.env.local)

```
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Ollama API
NEXT_PUBLIC_OLLAMA_API_URL=https://api.alluser.site
NEXT_PUBLIC_OLLAMA_API_KEY=your_ollama_api_key
```

---

## 🐛 해결된 이슈

### 1. Firestore 복합 색인 오류
- **문제**: `orderBy("date")` + `orderBy("time")` 사용 시 복합 색인 필요
- **해결**: `orderBy("date")만` 사용하고, 시간 정렬은 클라이언트에서 처리

### 2. AI 요약 가독성 문제
- **문제**: AI 요약 결과가 텍스트 덩어리로 표시되어 읽기 어려움
- **해결**: 
  - AI 프롬프트 개선 (마크다운 형식 강제)
  - `MarkdownRenderer` 컴포넌트 구현 (마크다운 → HTML 변환)

### 3. Tailwind CSS 의존성 문제
- **문제**: 순수 CSS 프로젝트인데 Tailwind 지시어 포함
- **해결**: `@tailwind` 지시어 제거, 모든 유틸리티 클래스 직접 정의

### 4. 파일 삭제 사고
- **문제**: 백그라운드 프로세스 충돌로 주요 파일 삭제됨
- **해결**: 모든 파일 재생성 (`layout.tsx`, `page.tsx`, `globals.css`, `auth-guard.tsx`, `dashboard.tsx`, `firebase.ts`, `types/index.ts`)

### 5. AI 요약 API 404 오류 (2025-12-09)
- **문제**: `/api/summarize` 엔드포인트가 404 반환
- **원인**: `app/api/summarize/route.ts` 파일이 누락됨
- **해결**: API 라우트 파일 재생성

### 6. 캘린더 헤더 레이아웃 문제 (2025-12-09)
- **문제**: "2025년 12월"에서 "월"자가 다음 줄로 내려감
- **해결**: `whiteSpace: 'nowrap'` 스타일 적용

### 7. 검색 버튼 툴팁 위치 문제 (2025-12-09)
- **문제**: 툴팁이 위쪽에 표시되어 헤더 밖으로 나가 안 보임
- **해결**: `data-tooltip-bottom` 클래스 추가하여 아래쪽에 표시

### 8. AI 요약 결과 위치 오류 (2025-12-09)
- **문제**: AI 요약 결과 박스가 왼쪽으로 치우침
- **원인**: `fadeIn` 애니메이션에 `translateX(-50%)`가 포함되어 있음
- **해결**: 애니메이션에서 `translateX` 제거, 툴팁용 애니메이션 별도 분리

### 9. 교사 계정 분리 요구 대응 (2026-02-26)
- **문제**: 공용 비밀번호 방식이라 교사별 데이터 분리가 불가능함
- **해결**:
  - Firebase Auth 이메일 회원가입/로그인으로 전환
  - 상담 문서에 `teacherId`, `teacherEmail` 저장
  - 조회를 `where("teacherId", "==", uid)`로 제한
  - `firestore.rules` 추가로 본인 데이터만 읽기/쓰기 허용

---

## 🚀 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 브라우저에서 접속
http://localhost:3000
```

---

## 📅 작업 일자

- **2025-12-09 (오전)**: 프로젝트 복구 및 Pure CSS 디자인 시스템 재구축, MarkdownRenderer 구현
- **2025-12-09 (심야)**: 
  - AI 요약 API 복구 (`/api/summarize` 엔드포인트 재생성)
  - 알림 기능 제거 (Bell 아이콘 삭제)
  - UI 개선: 캘린더 헤더 레이아웃, 툴팁 위치, "오늘" 버튼 크기 조정
  - AI 프롬프트 개선: 마크다운 미사용, "상담교사" 용어 금지, 원본 내용만 정리
  - CSS 애니메이션 버그 수정 (AI 요약 결과 위치 오류)
- **2026-02-26**:
  - Firebase 이메일 회원가입/로그인 도입 (`AuthGuard` 전면 교체)
  - 교사 프로필(`users/{uid}`) 생성 로직 추가
  - 상담 데이터 교사별 분리(`teacherId`) 적용
  - `firestore.rules` 파일 추가 및 규칙 템플릿 반영

---

## ⚠️ 주의사항

1. **Firestore 보안 규칙**: `firestore.rules`를 Firebase Console/CLI로 반드시 배포해야 실제 보호가 적용됩니다.
2. **인증 시스템**: 현재 이메일/비밀번호 기반입니다. 운영 환경에서는 비밀번호 정책 강화 및 계정 잠금 정책 추가를 권장합니다.
3. **환경 변수**: `.env.local` 파일은 Git에 커밋하지 않도록 주의.

---

## 📌 향후 개선 사항

- [ ] 상담 수정 기능
- [ ] 상담 기록 내보내기 (PDF, Excel)
- [ ] Google 소셜 로그인
- [ ] 로그인 실패 누적/계정 잠금 관리
- [ ] 다크 모드 지원
- [ ] 모바일 반응형 최적화
- [ ] PWA 지원
