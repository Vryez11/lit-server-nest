# lit-server-nest

Life Is Travel 서비스의 NestJS 백엔드 API 서버입니다. 매장 앱과 고객 앱에서 사용하는 인증, 매장 설정, 보관함, 예약, 쿠폰, 대시보드 API를 제공합니다.

이 문서는 로컬 개발뿐 아니라 프로덕션 배포와 장애 대응까지 빠르게 확인할 수 있도록 작성되었습니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| Runtime | Node.js |
| Framework | NestJS 11 |
| Language | TypeScript |
| Database | MariaDB / MySQL |
| ORM | Prisma 7, `@prisma/adapter-mariadb` |
| Auth | JWT |
| Validation | `class-validator`, `class-transformer`, Joi |
| API Docs | Swagger |
| Test | Jest |

## 주요 기능

- 매장 회원 인증, 고객 인증, JWT 토큰 갱신
- 이메일 인증 코드 발송 및 검증
- 매장 프로필, PIN, 영업 상태, 설정 관리
- 보관함 조회, 생성, 수정, 삭제
- 매장/고객/비회원 예약 관리
- 고객 쿠폰, 비회원 쿠폰, 매장 쿠폰 정책 관리
- 대시보드 통계, 요약, 실시간 현황 조회
- Health Check 및 Swagger API 문서 제공

## 프로젝트 구조

```text
src/
  common/
    database/        Prisma Client 설정
    decorators/      공통 데코레이터
    filters/         전역 예외 필터
    guards/          인증/인가 가드
    interceptors/    API 응답 래핑 인터셉터
    pipes/           검증 예외 변환
    transformers/    레거시 입력값 호환 변환기
  config/            환경변수 검증, Swagger 설정
  modules/
    auth/            매장 인증, 토큰, 이메일 인증
    customer-auth/   고객 인증
    customer-stores/ 고객용 매장 조회
    stores/          매장 프로필, 설정, 상태, PIN
    storages/        보관함 관리
    reservations/    예약 관리
    coupons/         쿠폰 정책 및 쿠폰 발급/조회
    dashboard/       대시보드 통계
    health/          서버 상태 확인
prisma/
  schema.prisma      Prisma DB 스키마
```

## 실행 환경

권장 버전은 아래와 같습니다.

| 항목 | 버전 |
| --- | --- |
| Node.js | 22.x |
| npm | 10.x 이상 |
| MariaDB / MySQL | 운영 DB 기준 |
| Prisma | 7.8.x |

## 환경 변수

환경 변수는 `.env.example`을 기준으로 설정합니다. 실제 운영 값은 README에 기록하지 않고, 배포 플랫폼의 Secret 또는 Environment 설정에서 관리합니다.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `NODE_ENV` | 선택 | `development`, `test`, `production` 중 하나. 기본값은 `development` |
| `PORT` | 선택 | 서버 포트. 기본값은 `4000` |
| `DATABASE_URL` | 필수 | MariaDB/MySQL 연결 문자열 |
| `JWT_ACCESS_TOKEN_SECRET` | 필수 | Access Token 서명 키. 최소 32자 |
| `JWT_REFRESH_TOKEN_SECRET` | 필수 | Refresh Token 서명 키. 최소 32자 |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | 선택 | Access Token 만료 시간. 기본값은 `1h` |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | 선택 | Refresh Token 만료 시간. 기본값은 `30d` |
| `CORS_ORIGIN` | 선택 | 요청을 허용할 프론트엔드 Origin |
| `SWAGGER_ENABLED` | 선택 | Swagger 활성화 여부 |
| `SWAGGER_PATH` | 선택 | Swagger 경로. 기본값은 `docs` |
| `AUTH_RATE_LIMIT_TTL` | 선택 | 인증 API rate limit TTL(ms) |
| `AUTH_RATE_LIMIT_LIMIT` | 선택 | 인증 API rate limit 허용 횟수 |
| `EMAIL_HOST` | 선택 | SMTP 호스트 |
| `EMAIL_PORT` | 선택 | SMTP 포트 |
| `EMAIL_SECURE` | 선택 | SMTP secure 사용 여부 |
| `EMAIL_USER` | 선택 | SMTP 사용자 |
| `EMAIL_PASSWORD` | 선택 | SMTP 비밀번호 |
| `EMAIL_FROM` | 선택 | 발신자 표시값 |
| `EMAIL_VERIFICATION_CODE_LENGTH` | 선택 | 이메일 인증 코드 길이 |
| `EMAIL_VERIFICATION_CODE_EXPIRES_IN` | 선택 | 이메일 인증 코드 만료 시간(초) |
| `EMAIL_VERIFICATION_MAX_ATTEMPTS` | 선택 | 이메일 인증 최대 시도 횟수 |

예시:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL="mysql://root:password@localhost:3306/lit_test"
JWT_ACCESS_TOKEN_SECRET="change-this-access-secret-to-at-least-32-characters"
JWT_REFRESH_TOKEN_SECRET="change-this-refresh-secret-to-at-least-32-characters"
CORS_ORIGIN="http://localhost:3000"
SWAGGER_ENABLED=true
SWAGGER_PATH="docs"
```

## 로컬 실행

의존성을 설치합니다.

```bash
npm install
```

Prisma Client를 생성합니다.

```bash
npm run prisma:generate
```

개발 서버를 실행합니다.

```bash
npm run start:dev
```

기본 포트는 `.env`의 `PORT` 값을 사용합니다. 별도 설정이 없으면 `4000`입니다.

## Prisma

이 프로젝트는 `prisma/schema.prisma`를 기준으로 Prisma Client를 생성합니다.

```bash
npm run prisma:generate
```

DB 스키마를 현재 데이터베이스에서 다시 가져와야 할 때는 아래 명령을 사용합니다.

```bash
npm run prisma:pull
```

스키마 유효성을 확인합니다.

```bash
npm run prisma:validate
```

주의:

- 현재 저장소에는 `prisma/migrations` 디렉터리가 없습니다.
- 운영 배포에서 무조건 `prisma migrate deploy`를 실행하지 않습니다.
- DB 변경이 필요한 작업은 운영 DB 영향도와 롤백 방법을 먼저 정리한 뒤 진행합니다.

## 테스트

전체 테스트:

```bash
npm test -- --runInBand
```

특정 테스트:

```bash
npm test -- --runInBand src/modules/stores/dto/store-settings.dto.spec.ts
```

커버리지:

```bash
npm run test:cov
```

E2E 테스트:

```bash
npm run test:e2e -- --runInBand
```

## 빌드와 실행

프로덕션 빌드:

```bash
npm run build
```

빌드 결과 실행:

```bash
npm run start:prod
```

`npm run build` 실행 전에는 `prebuild` 스크립트에 의해 `prisma generate`가 먼저 실행됩니다.

## API 문서

Swagger가 활성화되어 있으면 아래 경로에서 API 문서를 확인할 수 있습니다.

```text
/{SWAGGER_PATH}
```

기본값:

```text
/docs
```

운영 환경에서 Swagger를 공개하지 않아야 하는 경우 `SWAGGER_ENABLED=false`로 설정합니다.

## Health Check

서버 상태 확인:

```text
GET /health
```

배포 후 최소한 이 엔드포인트가 정상 응답하는지 확인합니다.

## 주요 API Prefix

| 영역 | Prefix |
| --- | --- |
| 매장 인증 | `/api/auth` |
| 고객 인증 | `/api/customer/auth` |
| 고객 매장 조회 | `/api/customer/stores` |
| 매장 관리 | `/api/store` |
| 보관함 | `/api/storages` |
| 예약 | `/api/reservations` |
| 고객 예약 | `/api/customer/reservations` |
| 비회원 예약 | `/api/guest/reservations` |
| 대시보드 | `/api/dashboard` |
| 쿠폰 정책 | `/api/store/coupons/policies` |
| 고객 쿠폰 | `/api/customer/coupons` |
| 비회원 쿠폰 | `/api/guest/coupons` |

## API 응답 포맷

전역 `ApiResponseInterceptor`가 응답을 공통 포맷으로 감쌉니다. 클라이언트는 일반적으로 `data` 필드의 값을 사용합니다.

성공 응답 예시:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-05-11T00:00:00.000Z"
}
```

검증 실패 응답 예시:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청값이 올바르지 않습니다.",
    "details": []
  },
  "timestamp": "2026-05-11T00:00:00.000Z"
}
```

## Flutter 앱 호환성 주의사항

이 서버는 기존 Express API와 Flutter 앱의 payload를 함께 고려합니다. DTO를 수정할 때는 다음을 확인합니다.

- Flutter `toJson()` 결과가 Nest DTO 검증을 통과하는지
- `class-transformer`의 암묵 변환으로 객체 배열이 변형되지 않는지
- API 응답의 `data` 구조가 앱 모델의 `fromJson()`과 호환되는지
- 기존 Express API에서 허용하던 레거시 필드를 Nest DTO가 처리할 수 있는지

특히 매장 설정 `categories`는 Flutter에서 `List<CategoryItem>`으로 파싱합니다. 서버 응답은 아래처럼 객체 배열이어야 합니다.

```json
[
  {
    "id": "coffee",
    "name": "COFFEE",
    "items": []
  }
]
```

`[[]]`, `{}`, 문자열 배열 등은 앱 파싱 또는 저장 흐름에서 문제를 만들 수 있습니다.

## 배포 체크리스트

배포 전:

- `npm run build` 성공
- `npm test -- --runInBand` 성공
- `.env.example` 대비 운영 환경 변수 누락 없음
- `DATABASE_URL`이 올바른 운영 DB를 바라보는지 확인
- `NODE_ENV=production` 설정 확인
- `CORS_ORIGIN`이 실제 앱/웹 Origin과 일치하는지 확인
- DB 스키마 변경 여부와 롤백 방법 확인
- Swagger 공개 여부 확인

배포 후:

- 서버 부팅 로그 확인
- Prisma Client 생성 및 DB 연결 성공 확인
- `GET /health` 정상 응답 확인
- 로그인, 설정 저장, 예약 생성 등 핵심 smoke test 수행
- 서버 에러 로그 확인
- Flutter 앱에서 주요 화면의 응답 파싱 오류가 없는지 확인

## 브랜치 전략

권장 브랜치 규칙:

| 브랜치 | 용도 |
| --- | --- |
| `main` | 프로덕션 배포 기준 브랜치 |
| `feat/*` | 기능 개발 |
| `fix/*` | 버그 수정 |
| `docs/*` | 문서 수정 |
| `chore/*` | 설정, 빌드, 의존성 관리 |
| `refactor/*` | 동작 변경 없는 구조 개선 |

## 라이선스

이 저장소는 private 프로젝트이며, `package.json` 기준 라이선스는 `UNLICENSED`입니다.
