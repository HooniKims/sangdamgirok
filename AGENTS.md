# 저장소 가이드라인

## 프로젝트 구조 및 모듈 구성
이 저장소는 TypeScript 기반 Next.js App Router 프로젝트입니다.

- `app/`: 라우트, 레이아웃, 전역 스타일, API 핸들러를 포함합니다 (`app/api/summarize/route.ts`는 현재 사용 중단 상태이며 `410`을 반환합니다).
- `components/`: 클라이언트 UI 컴포넌트입니다 (예: `auth-guard.tsx`, `dashboard.tsx`).
- `lib/`: 공통 서비스 설정입니다 (`lib/firebase.ts`의 Firebase 초기화 포함).
- `utils/`: AI/Ollama API 헬퍼와 텍스트 후처리 로직입니다.
- `types/`: 공용 TypeScript 인터페이스입니다.
- `public/`: 정적 에셋입니다.
- `local-llm-api-guide.md`: 로컬 LLM 연동 노트입니다.

## 빌드, 테스트, 개발 명령어
- `npm install`: 의존성 설치
- `npm run dev`: 로컬 개발 서버 실행 (`http://localhost:3000`)
- `npm run build`: 프로덕션 빌드 생성
- `npm run start`: 로컬에서 프로덕션 빌드 실행
- `npm run lint`: ESLint 실행 (Next.js core-web-vitals + TypeScript 규칙)

## 세션 시작 절차
- 새로운 세션이 시작되면 작업 전 반드시 `tasks.md`를 먼저 확인하고, 최근 변경 내역/주의사항을 파악한 뒤 작업을 시작합니다.

## 코딩 스타일 및 네이밍 규칙
- 언어: `strict` 모드가 활성화된 TypeScript 사용
- import: `@/*` 경로 별칭 사용 (예: `@/lib/firebase`)
- 컴포넌트: 파일명은 kebab-case, 컴포넌트명은 PascalCase
- 유틸리티/함수: camelCase 사용, export 상수는 정말 상수일 때만 UPPER_SNAKE_CASE 사용
- 수정한 파일은 기존 포맷을 따르기 (현재 코드베이스는 주로 4칸 들여쓰기와 큰따옴표 사용)
- PR 열기 전 `npm run lint` 실행

## 테스트 가이드라인
아직 자동화된 테스트 스크립트는 설정되어 있지 않습니다. 현재 기준:
- 최소 품질 게이트로 `npm run lint`를 통과해야 합니다.
- 로그인, 상담 CRUD 흐름, AI 요약 생성 기능에 대해 수동 스모크 테스트를 수행합니다.

테스트를 추가할 때는 `*.test.ts` / `*.test.tsx` 네이밍을 우선 사용하고, 소스 파일 옆이나 `__tests__/`에 배치하세요.

## 커밋 및 PR 가이드라인
최근 커밋 이력은 관례적 접두어(`feat:`, `fix:`, `chore:`)와 간결한 요약을 사용합니다. 아래 형식을 따르세요:
- `type: 짧은 명령형 요약` (예: `feat: model selection dropdown 추가`)

PR에는 다음 내용을 포함해야 합니다:
- 목적과 범위
- 주요 파일/경로 변경 사항
- 환경 변수 변경 사항(있는 경우)
- UI 변경 시 스크린샷/GIF
- 연결된 이슈/작업 및 검증 절차

## 보안 및 설정 팁
- 비밀값은 `.env.local`에만 보관하고 `.env*` 파일은 커밋하지 마세요.
- 로컬 실행 전 Firebase 및 Ollama 관련 필수 `NEXT_PUBLIC_*` 환경 변수가 설정되어 있는지 확인하세요.
