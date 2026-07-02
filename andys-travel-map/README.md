# Andy’s Travel Map v1.8.58 — Vercel 계정 로그인/자동 저장

이 패키지는 기존 HTML 사이트를 기준으로 로그인, 회원가입, 계정별 자동 저장, 관리자 계정 관리 기능을 추가한 Vercel 프로젝트입니다.

## 프로젝트 구조

```txt
/
├─ index.html
├─ admin.html
├─ package.json
├─ vercel.json
├─ api/
│  ├─ register.js
│  ├─ login.js
│  ├─ me.js
│  ├─ load-data.js
│  ├─ save-data.js
│  ├─ logout.js
│  ├─ _lib/
│  │  ├─ github.js
│  │  └─ security.js
│  └─ admin/
│     ├─ login.js
│     ├─ logout.js
│     ├─ users.js
│     └─ users/
│        └─ [userId]/
│           ├─ password.js
│           └─ reset-password.js
└─ scripts/
   ├─ generate-encryption-key.js
   └─ hash-password.js
```

## private GitHub 데이터 저장소 구조

서버리스 함수가 private GitHub repository에 아래 구조로 데이터를 저장합니다.

```txt
/users/index.json
/users/{userId}/profile.json
/data/{userId}/app-data.json
/admin/logs.json
/admin/archive/{userId}-{timestamp}/profile.json
/admin/archive/{userId}-{timestamp}/app-data.json
```

## 필수 환경변수

Vercel 프로젝트 환경변수에 아래 값을 설정하세요.

```txt
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
JWT_SECRET
ADMIN_PASSWORD_HASH
PASSWORD_ENCRYPTION_KEY
```

### PASSWORD_ENCRYPTION_KEY 생성

```bash
node scripts/generate-encryption-key.js
```

출력된 32바이트 base64 문자열을 Vercel 환경변수 `PASSWORD_ENCRYPTION_KEY`에 넣으세요.

### ADMIN_PASSWORD_HASH 생성

```bash
node scripts/hash-password.js "관리자비밀번호"
```

출력된 값을 Vercel 환경변수 `ADMIN_PASSWORD_HASH`에 넣으세요.

## 배포 요약

1. private GitHub repository를 데이터 저장용으로 만듭니다.
2. GitHub token은 해당 private repository 접근에 필요한 최소 권한만 부여합니다.
3. 이 프로젝트를 Vercel에 배포합니다.
4. Vercel Environment Variables에 필수 환경변수를 모두 등록합니다.
5. 환경변수 변경 후에는 Vercel 프로젝트를 다시 배포합니다.
6. 사이트에서 회원가입 후 로그인하면 `/users`와 `/data` 경로가 자동 생성됩니다.
7. 관리자 화면은 `/admin.html`에서 접근합니다.

## localStorage와 클라우드 데이터 충돌 처리

기존 localStorage 기록이 있는 상태에서 로그인하면 다음 선택지를 표시합니다.

1. 현재 기기 데이터를 계정에 업로드
2. 계정 데이터를 불러오기
3. 가능한 경우 병합하기

기존 localStorage 키 `andy-travel-map:data`는 변경하지 않았습니다.

## 보안 주의사항

- GitHub token을 HTML이나 public JavaScript에 넣지 마세요.
- 관리자 비밀번호 원문을 코드나 GitHub에 저장하지 마세요.
- PASSWORD_ENCRYPTION_KEY를 코드에 넣지 마세요.
- JWT_SECRET을 코드에 넣지 마세요.
- 사용자 데이터와 계정 정보는 public repository에 저장하지 마세요.
- private GitHub repository와 Vercel 환경변수를 사용하세요.

## v1.8.55 Vercel Hobby 배포 수정

Vercel Hobby 플랜의 Serverless Functions 개수 제한을 피하기 위해 `/api`의 여러 엔드포인트를 하나의 catch-all 함수 `/api/[...path].js`로 통합했습니다. 기존 프론트엔드 API 주소(`/api/register`, `/api/login`, `/api/admin/users` 등)는 그대로 유지됩니다.

GitHub 저장소에 올릴 때 기존 `/api` 폴더를 먼저 삭제한 뒤, 이 패키지의 새 `/api` 폴더와 `/lib` 폴더를 올려 주세요. 기존 `/api/_lib`, `/api/login.js`, `/api/register.js` 같은 파일이 남아 있으면 함수 개수가 다시 늘어납니다.


## v1.8.58 standard API routing

Vercel rewrite가 적용되지 않아 /api/register에서 HTML이 반환되는 상황을 피하기 위해 프론트엔드 요청을 /api?path=register 형식으로 변경했습니다. /api/index.js 하나만 사용하므로 Hobby 플랜 함수 개수 제한을 피합니다. vercel.json은 {}입니다.


## v1.8.58 변경 사항

- Hobby 플랜 서버리스 함수 개수 제한을 피하면서도 Vercel 표준 API 라우팅을 사용하도록 수정했습니다.
- `/api?path=...` 단일 라우터 방식을 제거하고 `/api/register`, `/api/login`, `/api/me`, `/api/data`, `/api/logout`, `/api/admin`, `/api/health`로 구성했습니다.
- 서버리스 함수 수는 7개입니다.
- 배포 후 `/api/health`에 접속하면 `{ "ok": true }` 형태의 JSON이 나와야 합니다.
