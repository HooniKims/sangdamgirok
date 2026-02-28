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
| **폰트** | Google Fonts - Noto Sans KR |
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
│   └── icon.svg
├── components/
│   ├── auth-guard.tsx            # 인증 가드 컴포넌트
│   └── dashboard.tsx             # 메인 대시보드 컴포넌트
├── lib/
│   └── firebase.ts               # Firebase 설정
├── utils/
│   ├── authLock.ts               # 로그인 잠금 키/정규화 유틸
│   └── behaviorRecordPrompt.ts   # 행발 프롬프트/검증 유틸
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
- [x] 상담 수정 기능 (시간/학번/이름/주제/내용)
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
- [x] 학생 목록 상담 수정 기능 (학생 카드 내부)
- [x] 개별 상담 삭제
- [x] 날짜별 상담 삭제 버튼 UI 개선 (텍스트+아이콘 버튼)
- [x] 학생 데이터 전체 삭제 기능
- [x] 학생별 그룹화(학생명+학번 기준) 및 그룹 내 날짜 최신순 정렬
- [x] 학생 목록 정렬 옵션 추가 (날짜순 기본, 학번 오름/내림차순)
- [x] 일괄 삭제 옵션 추가 (선택 학생/전체 상담)
- [x] 삭제 시 2단계 확인 팝업 적용
- [x] 학생별 행발 반영 상담 체크박스 선택 기능

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

### 15. 학생 목록 그룹/정렬/일괄 삭제 기능 확장 (2026-02-27)
- **문제**: 학생 목록에서 그룹/정렬/삭제 선택지가 제한적이라 상담 기록 관리가 비효율적임
- **해결**:
  - `dashboard.tsx`: 학생 목록을 `학생명+학번` 기준으로 그룹화하고, 그룹 내 상담 내역을 날짜/시간 최신순으로 정렬
  - `dashboard.tsx`: 학생 목록 정렬 옵션 추가 (`날짜순(기본)`, `학번 오름차순`, `학번 내림차순`)
  - `dashboard.tsx`: 일괄 삭제 모드 추가 (`선택 학생`, `전체 상담`) 및 전체 선택 체크박스 제공
  - `dashboard.tsx`: 개별/학생별/일괄 삭제 모두 2단계 확인 팝업 적용

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
  - 학생 목록을 학생별 그룹(학생명+학번)으로 정비하고 날짜 최신순 기본 정렬 적용
  - 학생 목록 정렬 옵션(날짜 기본, 학번 오름/내림) 및 일괄 삭제(선택 학생/전체) 추가
  - 삭제 동작 전 2단계 확인 팝업을 공통 적용
  - 작업 완료 후 `tasks.md` 기록 업데이트 반영
  - 새 세션 시작 시 `tasks.md`를 먼저 확인하는 시작 절차를 `AGENTS.md`에 반영

---

## ⚠️ 주의사항

1. **Firestore 보안 규칙**: `firestore.rules`를 Firebase Console/CLI로 반드시 배포해야 실제 보호가 적용됩니다.
2. **인증 시스템**: 현재 이메일/비밀번호 + Google 로그인 기반입니다. Firebase Console에서 Google 로그인 Provider가 활성화되어 있어야 합니다.
3. **로그인 잠금 컬렉션**: `loginLocks` 컬렉션은 비로그인 상태에서도 접근이 필요하므로, 운영 시 Cloud Functions/서버 검증 방식으로 강화하는 것을 권장합니다.
4. **환경 변수**: `.env.local` 파일은 Git에 커밋하지 않도록 주의.
5. **작업 기록 관리**: 기능 수정/추가 작업이 끝나면 `tasks.md`에 변경 내역을 반드시 업데이트.
6. **세션 시작 규칙**: 새로운 세션 시작 시 작업 전에 `tasks.md`를 먼저 확인한 후 진행.

---

## 📌 향후 개선 사항

- [ ] 상담 기록 내보내기 (PDF, Excel)
- [x] 로그인 잠금 로직 서버 사이드 검증(Cloud Functions/Next API)으로 강화
- [x] 다크 모드 지원
- [x] 모바일 반응형 최적화
- [ ] PWA 지원

---

## 2026-02-27 추가 변경

- `components/dashboard.tsx`: 학번 입력 필드를 숫자만 입력되도록 수정 (`replace(/\D/g, "")`).
- `components/dashboard.tsx`: 학번 placeholder를 `10101`에서 `1234`로 변경.

---

## 2026-02-27 다크모드 구현 + 로그인 잠금 서버사이드 강화

### 다크모드
- `app/globals.css`: `html.dark` 셀렉터로 다크모드 CSS 변수 오버라이드 추가
- `components/ThemeProvider.tsx`: [신규] 테마 상태 관리 Context (useSyncExternalStore 기반, localStorage 연동, 시스템 설정 감지)
- `app/layout.tsx`: ThemeProvider 래핑 추가
- `components/dashboard.tsx`: Sun/Moon 테마 토글 버튼 추가, 인라인 색상을 CSS 변수로 전환
- `components/auth-guard.tsx`: 로그인 화면 다크모드 대응

### 로그인 잠금 서버사이드 검증 강화
- `lib/firebase-admin.ts`: [신규] Firebase Admin SDK 동적 초기화 모듈
- `app/api/auth/check-lock/route.ts`: [신규] 로그인 잠금 상태 확인 API
- `app/api/auth/record-failure/route.ts`: [신규] 로그인 실패 기록 API (트랜잭션 처리)
- `components/auth-guard.tsx`: Firestore 직접 접근을 서버 API 호출로 교체
- `firestore.rules`: `loginLocks` 컬렉션 클라이언트 접근 제한

---

## 2026-02-27 회원탈퇴 기능 + 모바일 반응형 최적화

### 회원탈퇴
- `components/dashboard.tsx`: User 아이콘 클릭 시 프로필 팝업 (이름, 아이디, 가입일, 로그아웃, 회원탈퇴)
- `components/dashboard.tsx`: 탈퇴 확인 모달 + 탈퇴 완료 안내 모달
- `components/dashboard.tsx`: Firestore 상담 데이터 삭제 + users 문서 삭제 + Firebase Auth 계정 삭제

### 모바일 반응형 최적화
- `components/dashboard.tsx`: 모바일 햄버거 메뉴 + 네비게이션 드로어 추가
- `app/globals.css`: `md:hidden-util` 모바일 전용 유틸리티 클래스
- `app/globals.css`: 모바일에서 헤더 높이 축소(56px), 패딩/간격/텍스트 크기 조절

---

## 2026-02-27 행발 초안 기능

- `components/dashboard.tsx`: 학생 탭에 행발 초안 생성 패널 추가 (범위: 선택 학생 / 전체 학생).
- `components/dashboard.tsx`: 선택한 AI 모델을 행발 생성에도 재사용하고, 학생별 초안 편집 및 재생성 흐름 추가.
- `utils/behaviorRecordPrompt.ts`: 행발 초안 생성을 위한 프롬프트 빌더 모듈 추가(추후 프롬프트 문구 교체 용이).
- `components/dashboard.tsx` + `xlsx`: 생성된 행발 초안 엑셀 내보내기 기능 추가.
- `components/dashboard.tsx`: 학번 입력은 숫자만 허용하고 `placeholder="1234"` 유지.

---

## 2026-02-27 행발 프롬프트 업데이트

- `utils/behaviorRecordPrompt.ts`: 최신 생활기록부 행발 작성 규칙(주어 생략, 인성/공동체 역량 근거, 성장 서사, 긍정 전환, 단일 문단 명사형 종결, 본문만 출력)을 반영해 프롬프트 교체.
- `utils/behaviorRecordPrompt.ts`: `evidenceMode`, `lengthGuide` 입력을 반영해 전체 기록 기반 작성과 선택 근거 기반 작성을 함께 지원.
- `utils/behaviorRecordPrompt.ts`: 상담 기록에서 행발 작성에 필요한 학생 행동관찰 근거를 내부적으로 추출·재구성한 뒤 반영하도록 규칙 및 추출 지시 추가.
- `components/dashboard.tsx`: 행발 작성 패널에 근거 모드 선택(`전체 기록` / `체크한 상담만`)을 추가.
- `components/dashboard.tsx`: 학생별 상담 체크박스 선택 상태를 프롬프트 생성에 연결하고, `체크한 상담만` 모드의 필수 선택 검증 추가.

---

## 2026-02-27 UI 한글/폰트 복구

- `components/dashboard.tsx`: 깨진 문자열(`????`) 및 영어 UI 문구를 한국어로 복구하고, 경고/확인/빈 상태/관리자 패널 문구를 일관된 한국어로 정리.
- `components/dashboard.tsx`: 공휴일명, 요일, 통계/학생/행발 초안 패널 텍스트를 한국어 기준으로 정리.
- `app/layout.tsx`: 전역 폰트를 `Outfit`에서 `Noto Sans KR`로 교체해 한글 가독성/호환성 개선.
- `app/globals.css`: 전역 fallback 폰트 스택을 한글 우선(`Noto Sans KR`, `Apple SD Gothic Neo`, `Malgun Gothic`)으로 조정.

---

## 2026-02-27 행발 필수규칙 강제 강화

- `utils/behaviorRecordPrompt.ts`: 필수규칙 8을 강화해 "모든 문장"이 명사형 종결어미(받침 ㅁ) + 마침표로 끝나도록 명시하고, 위반 시 실패로 간주하는 규칙 및 자체 점검 규칙을 추가.
- `utils/behaviorRecordPrompt.ts`: `validateBehaviorDraft`, `normalizeBehaviorDraftText`, `buildBehaviorRewritePrompt` 유틸을 추가해 생성 결과를 규칙 기반으로 검증하고 재작성 프롬프트를 자동 생성하도록 보강.
- `utils/behaviorRecordPrompt.ts`: 글자수(400~500자), 주어 표현 금지, 부정 표현 금지, 메타 문구 금지, 문장별 명사형 종결어미(받침 ㅁ) 검증 로직 추가.
- `components/dashboard.tsx`: 행발 초안 생성 시 "생성 → 규칙 검증 → 위반 시 자동 재생성(최대 2회)" 흐름을 적용해 필수규칙 준수율을 높임.

---

## 2026-02-27 상담 수정/행발 체크박스 개선

- `components/dashboard.tsx`: 상담 관리(목록/검색) 카드에서 상담 수정 기능 추가(수정 모드 진입, 저장/취소, Firestore `updateDoc` 반영).
- `components/dashboard.tsx`: 학생 목록의 날짜별 상담 카드에서도 동일한 수정 기능 추가.
- `components/dashboard.tsx`: 행발 패널의 `선택 반영 내용 (선택)` 입력 영역 제거.
- `components/dashboard.tsx`: 학생별 상담 카드에 `행발 반영` 체크박스를 추가하고, 체크된 상담만 행발 생성 근거로 사용하는 로직 구현.
- `components/dashboard.tsx`: 날짜별 삭제 버튼을 주변 스타일과 맞춘 텍스트+아이콘 버튼으로 재디자인.
- `utils/behaviorRecordPrompt.ts`: `selectedContent` 기반 프롬프트 구성을 제거하고, 전달된 상담 목록(전체/체크된 상담) 중심으로 프롬프트 구성 로직 정리.
- 검증: `npm run lint` 통과, `npm run build` 통과.

---

## 2026-02-27 tasks.md 최신화

- `tasks.md`: 기술 스택의 폰트 정보를 현재 코드 기준(`Noto Sans KR`)으로 정리.
- `tasks.md`: 프로젝트 구조를 현재 기준(`app/icon.svg`, `utils/behaviorRecordPrompt.ts` 포함)으로 갱신.
- `tasks.md`: 행발 프롬프트 업데이트 설명을 현재 동작(체크박스 기반 근거 선택)과 일치하도록 정리.

---

## 2026-02-28 추가 버그 수정 및 UI 개선

- `components/dashboard.tsx`: 프로필 팝업 영역 밖 클릭 시 닫히도록 `useRef` 및 마우스 이벤트 리스너 추가.
- `components/dashboard.tsx`: 회원 탈퇴 시 `auth/requires-recent-login` 에러가 발생할 경우를 대비하여 로그인 정보 삭제 전 사용자 프로필을 백업하고, 실패 시 프로필 리스토어(롤백) 기능 및 명확한 에러 안내창 추가.
- `components/dashboard.tsx`: 행발 작성 시 학생 이름 옆 체크박스와 '전체 학생 선택' 체크박스 클릭 시, 하위 모든 상담 내역들의 '행발 반영' 체크 상태가 함께 동기화되도록 수정.
- `utils/behaviorRecordPrompt.ts` / `components/dashboard.tsx`: 행발 초안 생성 시 글자 수 400자 미달이어도 실패 처리하지 않고 내용 그대로 출력한 뒤, 하단에 최종 글자 수를 안내하도록 수정. 주어 포함('학생은', 'OO는' 등) 시 사용자에게 실패 메시지를 띄우는 대신 내부적으로 해당 문구를 치환·삭제하고 처리를 완료하도록 로직 개선.
- `components/dashboard.tsx`: 생성된 행발 초안 텍스트 하단에 복사 기능(`navigator.clipboard.writeText`)이 연결된 **복사하기** 아이콘 버튼을 추가하여 쉽게 나이스에 붙여넣기 할 수 있게 편의성 증대.
