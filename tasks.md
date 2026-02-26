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
| **인증** | Firebase Authentication (Email/Password + Google) |
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
├── utils/
│   └── authLock.ts               # 로그인 잠금 키/정규화 유틸
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
- [x] Firebase Google 로그인/가입 (Popup)
- [x] 회원가입 시 `users/{uid}` 교사 프로필 생성 (`role: "teacher"`)
- [x] Google/이메일 로그인 공통 `users/{uid}` 프로필 upsert
- [x] 비밀번호 10회 실패 시 계정 잠금 (`loginLocks`)
- [x] 관리자(admin) 계정 잠금 해제 기능
- [x] 비밀번호 재설정 메일 발송 기능
- [x] Firebase 세션 기반 자동 로그인 상태 유지 (`onAuthStateChanged`)
- [x] 로그인 폼 간격/여백 조정 (입력칸-버튼 간격 개선)
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
- [x] 모델 선택 기능 (`glm-4.7-flash` 포함)
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
- [x] 관리자 로그인 시 헤더 방패(Shield) 아이콘 노출
- [x] 관리자 전용 탭(Admin) 진입 및 권한 패널 표시
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

### 10. 로그인 UI 간격 및 Google 로그인 반영 (2026-02-26)
- **문제**: 비밀번호 입력칸과 로그인 버튼 간격이 좁고, Google 로그인 반영 필요
- **해결**:
  - 로그인 폼을 `flex + gap` 구조로 조정해 입력칸/버튼 간격 재정렬
  - Firebase `GoogleAuthProvider` 추가 및 `prompt: select_account` 설정
  - 로그인/회원가입 모드 모두 `Google` 버튼 노출 (`Google로 로그인` / `Google로 가입하기`)
  - Google 로그인 성공 시 `users/{uid}` 교사 프로필 upsert 처리

### 11. 로그인 실패 잠금/해제 및 비밀번호 재설정 (2026-02-26)
- **문제**: 비밀번호 반복 실패 시 계정 보호와 복구 수단이 필요함
- **해결**:
  - `utils/authLock.ts` 추가: 이메일 정규화 + SHA-256 잠금 키 생성
  - 이메일/비밀번호 로그인 실패 누적 10회 시 `loginLocks` 문서 잠금 처리
  - 잠긴 계정은 로그인 차단 및 안내 메시지 노출
  - 로그인 화면에 `비밀번호 재설정 메일 보내기` 추가
  - admin 전용 탭에서 `관리자 잠금 해제` UI 제공
  - `firestore.rules`에 admin 사용자 문서 접근 + `loginLocks` 규칙 반영

### 12. 관리자 진입 UX 개선 (2026-02-26)
- **문제**: 관리자 기능이 일반 통계 화면에 섞여 있어 접근성이 떨어짐
- **해결**:
  - 헤더 우측에 admin 전용 방패 아이콘 추가
  - 네비게이션에 admin 탭 추가
  - admin 탭에서 계정 권한 상태와 잠금 해제 기능을 분리 제공

### 13. 관리자 권한 실시간 반영 보완 (2026-02-27)
- **문제**: 로그인 후 Firestore에서 role 값을 `admin`으로 변경해도, 새로고침 전에는 방패 아이콘/관리자 탭이 바로 보이지 않음
- **해결**:
  - `components/dashboard.tsx`의 역할 조회를 1회 `getDoc`에서 `onSnapshot` 실시간 구독으로 변경
  - `users/{uid}` 문서의 `role` 변경 시 헤더 방패 아이콘 및 관리자 탭 노출 상태 즉시 갱신
  - 로그아웃 또는 역할 문서 구독 오류 시 기본 권한을 `teacher`로 안전하게 폴백

### 14. 관리자 권한 인식 및 비밀번호 재설정 UI 개선 (2026-02-27)
- **문제**: Auth 콘솔에서 직접 생성한 계정은 Firestore 문서가 없어 관리자 권한(role) 설정이 불가능하고, 비밀번호 재설정 버튼 디자인이 투박함
- **해결**:
  - `auth-guard.tsx`: 로그인 성공 시 Firestore에 프로필 문서가 없으면 자동 생성하도록 보완
  - `dashboard.tsx`: `role` 판별 시 대소문자 무관하게 처리하도록 개선 (`toLowerCase`)
  - `auth-guard.tsx`: 비밀번호 재설정 버튼을 "비밀번호를 잊으셨나요?" 링크 스타일로 세련되게 변경

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
  - Google 로그인(Popup) 및 `GoogleAuthProvider` 적용
  - 회원가입 탭 `Google로 가입하기` 버튼 추가
  - 로그인 폼 간격/여백 조정 (입력칸과 버튼 간격 개선)
  - 로컬 LLM 모델 목록에 `glm-4.7-flash` 추가
  - 비밀번호 10회 실패 잠금 로직(`loginLocks`) 적용
  - 관리자(admin) 잠금 해제 기능 및 비밀번호 재설정 메일 기능 추가
  - 관리자 헤더 방패 아이콘/관리자 전용 탭(Admin) 추가
- **2026-02-27**:
  - 관리자 role 판별 로직을 실시간 구독(`onSnapshot`)으로 변경해 Firestore role 변경이 UI에 즉시 반영되도록 보완
  - Auth 콘솔 생성 계정 대응을 위한 로그인 시 프로필 자동 생성 로직 추가
  - 관리자 권한 대소문자 구분 제거 및 비밀번호 재설정 UI 디자인 개선

---

## ⚠️ 주의사항

1. **Firestore 보안 규칙**: `firestore.rules`를 Firebase Console/CLI로 반드시 배포해야 실제 보호가 적용됩니다.
2. **인증 시스템**: 현재 이메일/비밀번호 + Google 로그인 기반입니다. Firebase Console에서 Google 로그인 Provider가 활성화되어 있어야 합니다.
3. **로그인 잠금 컬렉션**: `loginLocks` 컬렉션은 비로그인 상태에서도 접근이 필요하므로, 운영 시 Cloud Functions/서버 검증 방식으로 강화하는 것을 권장합니다.
4. **환경 변수**: `.env.local` 파일은 Git에 커밋하지 않도록 주의.

---

## 📌 향후 개선 사항

- [ ] 상담 수정 기능
- [ ] 상담 기록 내보내기 (PDF, Excel)
- [ ] 로그인 잠금 로직 서버 사이드 검증(Cloud Functions/Next API)으로 강화
- [ ] 다크 모드 지원
- [ ] 모바일 반응형 최적화
- [ ] PWA 지원
