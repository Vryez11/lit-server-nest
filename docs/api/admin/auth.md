# 관리자 인증·계정 API (F-019)

> **기준 PRD**: [`docs/README.md`](../../README.md) §3 F-019 · **상태**: 구현 예정 · **독자**: 백엔드 구현자, 어드민 프론트 개발자
>
> 이 문서는 관리자 계정의 생성·로그인·토큰 규칙과 구현 가이드를 정의한다. 통과/실패 판정 기준(`✅`)은
> PRD가 단일 진실 공급원(SSOT)이며, 둘이 어긋나면 PRD를 기준으로 이 문서를 고친다.
> 매장 운영 현황 API(F-018)는 [`store-operations.md`](store-operations.md)에 있고, 이 문서의 `AdminAuthGuard`에 의존한다.

---

## 1. 목적·범위

- 플랫폼 관리자가 **개인 계정**으로 로그인해 관리자 API(F-014 피드백, F-018 매장 운영 현황)를 호출한다. 누가 호출했는지(`adminId`)가 요청마다 식별된다.
- 가입 API는 두지 않는다. 계정 발급·회수는 운영자가 서버에서 CLI로 수행한다.
- 기존 `X-Admin-Token` 정적 토큰(`ADMIN_FEEDBACK_TOKEN`)은 **제거**한다. 전환기 병행 없음.
- **제외**: 관리자 권한 등급(super/viewer), 관리자 초대 API, 2FA, 감사 로그 테이블. 필요해지면 v2.

설계 원칙: 점주 인증(F-001, `src/modules/auth/`)과 고객 인증(F-002, `src/modules/customer-auth/`)의 규칙·코드를 최대한 재사용한다. 잠금 정책, refresh 토큰 저장 방식, 에러코드, DTO 형태를 그대로 따른다.

---

## 2. 데이터 모델

### 2.1 `schema.prisma` 추가분

```prisma
model admins {
  id                   String                 @id @db.VarChar(255)   // adm_<uuid>
  email                String                 @unique(map: "uniq_admin_email") @db.VarChar(255)
  password_hash        String                 @db.VarChar(255)
  name                 String?                @db.VarChar(100)
  is_active            Boolean                @default(true)
  login_count          Int                    @default(0)            // 연속 실패 횟수 (stores.login_count와 같은 의미)
  login_locked_until   DateTime?              @db.DateTime(0)
  last_login_at        DateTime?              @db.DateTime(0)
  created_at           DateTime?              @default(now()) @db.Timestamp(0)
  updated_at           DateTime?              @default(now()) @db.Timestamp(0)
  admin_refresh_tokens admin_refresh_tokens[]
}

model admin_refresh_tokens {
  id         Int       @id @default(autoincrement())
  admin_id   String    @db.VarChar(255)
  token      String    @db.VarChar(500)
  expires_at DateTime  @db.Timestamp(0)
  created_at DateTime? @default(now()) @db.Timestamp(0)
  admins     admins    @relation(fields: [admin_id], references: [id], onDelete: Cascade, onUpdate: NoAction, map: "admin_refresh_tokens_ibfk_1")

  @@index([admin_id], map: "idx_admin")
  @@index([expires_at], map: "idx_expires_at")
  @@index([token(length: 255)], map: "idx_token")
}
```

`customer_refresh_tokens`와 같은 꼴이다(관리자 ↔ 고객만 다름). 기존 테이블은 건드리지 않는다.

### 2.2 마이그레이션 SQL

```sql
-- prisma/migrations/<timestamp>_add_admins/migration.sql
CREATE TABLE `admins` (
  `id`                 VARCHAR(255) NOT NULL,
  `email`              VARCHAR(255) NOT NULL,
  `password_hash`      VARCHAR(255) NOT NULL,
  `name`               VARCHAR(100) NULL,
  `is_active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `login_count`        INT          NOT NULL DEFAULT 0,
  `login_locked_until` DATETIME     NULL,
  `last_login_at`      DATETIME     NULL,
  `created_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_email` (`email`)
);

CREATE TABLE `admin_refresh_tokens` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `admin_id`   VARCHAR(255) NOT NULL,
  `token`      VARCHAR(500) NOT NULL,
  `expires_at` TIMESTAMP    NOT NULL,
  `created_at` TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin` (`admin_id`),
  KEY `idx_expires_at` (`expires_at`),
  KEY `idx_token` (`token`(255)),
  CONSTRAINT `admin_refresh_tokens_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
);
```

적용 순서(스키마 우선 프로젝트): 운영 DB에 SQL 선반영 → `npm run prisma:pull`로 `schema.prisma` 동기화(위 정의와 일치 확인) → 마이그레이션 파일 커밋. 테이블 추가만이라 기존 기능 영향 없음, 롤백은 `DROP TABLE` 두 개.

---

## 3. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `JWT_ADMIN_ACCESS_TOKEN_SECRET` | 필수, 32자 이상 | 관리자 access 토큰 서명 키. 점주·고객용 `JWT_ACCESS_TOKEN_SECRET`과 **반드시 다른 값** |
| `JWT_ADMIN_REFRESH_TOKEN_SECRET` | 필수, 32자 이상 | 관리자 refresh 토큰 서명 키 |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` / `JWT_REFRESH_TOKEN_EXPIRES_IN` | 기존 | 만료는 점주와 공유(1h / 30d). 별도 변수 추가하지 않음 |
| `AUTH_RATE_LIMIT_TTL` / `AUTH_RATE_LIMIT_LIMIT` | 기존 | 로그인 레이트리밋 공유(15분 / 5회) |
| `ADMIN_FEEDBACK_TOKEN` | **삭제** | Joi 스키마·`.env.example`·`test/setup-env.ts`에서 제거 |

- `src/config/env.validation.ts`에 두 시크릿을 `Joi.string().min(32).required()`로 추가한다. **배포 전에 운영 환경변수를 먼저 넣어야 부팅된다.**
- `test/setup-env.ts`에 두 시크릿의 더미값(32자 이상)을 추가한다(e2e 부팅용).
- 시크릿을 분리하는 이유: 점주 토큰 시크릿이 유출되어도 관리자 토큰을 위조할 수 없게 한다. 점주·고객은 같은 시크릿을 쓰고 페이로드 형태로만 구분하는데(`role`/`storeId` 검사), 관리자는 권한이 커서 암호학적으로 분리한다.

---

## 4. 토큰

### 4.1 페이로드

```ts
// src/modules/auth/types/admin-token-payload.type.ts
export type AdminAccessTokenPayload = {
  adminId: string;
  email: string;
  role: 'admin';
  type: 'access';
};

export type AdminRefreshTokenPayload = {
  adminId: string;
  email: string;
  role: 'admin';
  type: 'refresh';
};
```

### 4.2 `TokenService` 확장 (`src/modules/auth/services/token.service.ts`)

고객 토큰 메서드와 같은 자리에 4개를 추가한다. 시크릿 키 이름만 다르다.

| 메서드 | 시크릿 | 검증 조건 | 실패 코드 |
|---|---|---|---|
| `generateAdminAccessToken(adminId, email)` | `JWT_ADMIN_ACCESS_TOKEN_SECRET` | — | — |
| `generateAdminRefreshToken(adminId, email)` | `JWT_ADMIN_REFRESH_TOKEN_SECRET` | — | — |
| `verifyAdminAccessToken(token)` | `JWT_ADMIN_ACCESS_TOKEN_SECRET` | `type === 'access' && role === 'admin' && adminId` 비어있지 않음 | 401 `TOKEN_INVALID` |
| `verifyAdminRefreshToken(token)` | `JWT_ADMIN_REFRESH_TOKEN_SECRET` | `type === 'refresh' && role === 'admin' && adminId` 비어있지 않음 | 401 `TOKEN_INVALID` |

만료 계산은 기존 `getAccessTokenExpiresInSeconds()` / `getRefreshTokenExpiresAt()`를 그대로 쓴다.

### 4.3 refresh 토큰 저장

점주와 동일하게 refresh JWT 문자열 자체를 `admin_refresh_tokens.token`에 저장한다. 회전(rotation)은 하지 않는다 — `refresh`는 access 토큰만 재발급하고 refresh 토큰은 만료까지 유지한다(점주 `AuthService.refresh`와 동일). 로그아웃·비밀번호 변경·비활성화 시 삭제한다.

---

## 5. 엔드포인트

베이스 `api/admin/auth`. 컨트롤러 레벨 `@UseGuards(AuthThrottlerGuard)`(점주 `AuthController`와 동일). `me`·`password`는 추가로 `@UseGuards(AdminAuthGuard)`.

### 5.1 `POST /api/admin/auth/login`

**Request** (`AdminLoginDto` — 점주 `LoginDto`와 동일 검증)

```jsonc
{ "email": "ops@lifeistravel.kr", "password": "••••••••" }
```

**Response** (`AdminAuthTokenResponseDto`)

```jsonc
{
  "token": "<access jwt>",
  "refreshToken": "<refresh jwt>",
  "expiresIn": 3600,
  "admin": {
    "id": "adm_7f3c…",
    "email": "ops@lifeistravel.kr",
    "name": "운영팀",
    "lastLoginAt": "2026-10-01T02:11:00.000Z"   // 이번 로그인 이전 값, 최초면 null
  }
}
```

점주 응답의 `user_info`(snake_case, Flutter 호환)와 달리 관리자는 레거시 클라이언트가 없으므로 camelCase `admin`을 쓴다.

**동작** (점주 `AuthService.login`과 동일 흐름)

1. `email`을 trim + 소문자로 정규화해 `admins.findUnique`.
2. 없음 → 401 `AUTHENTICATION_FAILED`(계정 존재 여부를 노출하지 않음).
3. `login_locked_until > now` → 401 `ACCOUNT_LOCKED` `{ details: { lockedUntil } }`.
4. `is_active === false` → 401 `ADMIN_INACTIVE`. (비밀번호 검사보다 먼저 — 비활성 계정에 대한 비밀번호 추측 자체를 막는다.)
5. bcrypt 비교 실패 → `login_count + 1`. 5회째면 `login_locked_until = now + 10분`으로 잠그고 `ACCOUNT_LOCKED`, 아니면 `AUTHENTICATION_FAILED { details: { remainingAttempts } }`.
6. 성공 → access/refresh 발급, `admin_refresh_tokens.create`, `login_count = 0`, `login_locked_until = null`, `last_login_at = now`.

상수는 점주와 같은 값(`MAX_LOGIN_FAILURES = 5`, `LOGIN_LOCK_MINUTES = 10`)이며 `admin-auth.service.ts`에 같은 이름으로 둔다.

### 5.2 `POST /api/admin/auth/refresh`

**Request** `{ "refreshToken": "<refresh jwt>" }` (`RefreshTokenDto` 재사용 가능)
**Response** `{ "token": "<access jwt>", "expiresIn": 3600 }` (`RefreshAccessTokenResponseDto` 재사용)

1. `verifyAdminRefreshToken` 실패 → 401 `TOKEN_INVALID`.
2. `admin_refresh_tokens.findFirst({ token })` 없음 → 401 `TOKEN_NOT_FOUND`.
3. `expires_at <= now` → 행 삭제 후 401 `TOKEN_EXPIRED`.
4. `admins.findUnique(adminId)` 없음 또는 `payload.adminId !== row.admin_id` → 401 `ADMIN_NOT_FOUND`. `is_active === false` → 401 `ADMIN_INACTIVE`.
5. access 토큰만 재발급.

### 5.3 `POST /api/admin/auth/logout`

**Request** `{ "refreshToken": "<refresh jwt>" }` → `admin_refresh_tokens.deleteMany({ token })`. 삭제 0건 → 404 `TOKEN_NOT_FOUND`. 성공 → `{ "message": "로그아웃이 완료되었습니다." }`.

### 5.4 `GET /api/admin/auth/me` (AdminAuthGuard)

```jsonc
{
  "id": "adm_7f3c…",
  "email": "ops@lifeistravel.kr",
  "name": "운영팀",
  "isActive": true,
  "lastLoginAt": "2026-10-02T00:30:00.000Z",
  "createdAt": "2026-09-20T05:00:00.000Z"
}
```

### 5.5 `PATCH /api/admin/auth/password` (AdminAuthGuard)

**Request** (`ChangePasswordDto` 재사용) `{ "currentPassword": "…", "newPassword": "…" }` — 새 비밀번호 최소 8자.

현재 비밀번호 불일치 → 401 `AUTHENTICATION_FAILED`. 성공 → `password_hash` 갱신 + 본인 `admin_refresh_tokens` 전부 삭제(다른 기기 세션 무효화, 점주 F-001과 동일) → `{ "message": "비밀번호가 변경되었습니다." }`.

### 5.6 에러코드 요약

| HTTP | `code` | 어디서 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | DTO 검증(이메일 형식, 빈 비밀번호, 8자 미만 새 비밀번호) |
| 401 | `AUTHENTICATION_FAILED` | login 이메일/비밀번호 불일치, password 현재 비밀번호 불일치. `details.remainingAttempts` 포함 가능 |
| 401 | `ACCOUNT_LOCKED` | 5회 연속 실패, `details.lockedUntil` |
| 401 | `ADMIN_INACTIVE` | `is_active = false` (login, refresh, 가드) |
| 401 | `ADMIN_NOT_FOUND` | 토큰의 adminId에 해당하는 행 없음 (refresh, 가드) |
| 401 | `AUTHENTICATION_REQUIRED` | 가드: `Authorization: Bearer` 누락·형식 불량 |
| 401 | `TOKEN_INVALID` | 서명·만료·페이로드 불량(타 액터 토큰 포함) |
| 401 | `TOKEN_NOT_FOUND` | refresh: DB에 없음 |
| 401 | `TOKEN_EXPIRED` | refresh: `expires_at` 경과(행 삭제) |
| 404 | `TOKEN_NOT_FOUND` | logout: 삭제할 행 없음 |
| 429 | `RATE_LIMIT_EXCEEDED` | 15분 / 5회 초과 |

---

## 6. `AdminAuthGuard`

위치 `src/modules/admin-auth/guards/admin-auth.guard.ts`. 고객 가드(`customer-auth.guard.ts`)를 본떠 **매 요청 DB 조회**한다(관리자 트래픽은 작고, 비활성화를 즉시 반영해야 한다).

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
  const token = this.extractBearerToken(request);            // 없으면 401 AUTHENTICATION_REQUIRED
  const payload = this.tokenService.verifyAdminAccessToken(token); // 실패 시 401 TOKEN_INVALID
  const admin = await this.prisma.admins.findUnique({
    where: { id: payload.adminId },
    select: { id: true, is_active: true },
  });
  if (!admin) throw new UnauthorizedException({ code: 'ADMIN_NOT_FOUND', message: '관리자를 찾을 수 없습니다.' });
  if (!admin.is_active) throw new UnauthorizedException({ code: 'ADMIN_INACTIVE', message: '비활성화된 관리자입니다.' });
  request.admin = payload;
  request.adminId = payload.adminId;
  return true;
}
```

- 데코레이터: `@CurrentAdmin()`(페이로드), `@CurrentAdminId()`(문자열) — `current-store.decorator.ts`와 같은 `createParamDecorator` 패턴.
- `AdminAuthModule`이 `AdminAuthGuard`를 `exports`해 `FeedbacksModule`·`AdminModule`(F-018)이 가져다 쓴다.

---

## 7. 파일 배치

```
prisma/migrations/<ts>_add_admins/migration.sql                          # §2.2
prisma/schema.prisma                                                     # admins, admin_refresh_tokens
scripts/admin-cli.ts                                                     # §8
package.json                                                             # "admin": "ts-node -r tsconfig-paths/register scripts/admin-cli.ts"
src/config/env.validation.ts                                             # JWT_ADMIN_* 필수 추가, ADMIN_FEEDBACK_TOKEN 삭제
.env.example                                                             # 동일
test/setup-env.ts                                                        # JWT_ADMIN_* 더미값
src/modules/auth/types/admin-token-payload.type.ts                       # §4.1
src/modules/auth/services/token.service.ts                               # §4.2 메서드 4개
src/modules/admin-auth/admin-auth.module.ts                              # imports: AuthModule(TokenService·PasswordService·AuthThrottlerGuard)
src/modules/admin-auth/admin-auth.controller.ts                          # §5
src/modules/admin-auth/admin-auth.service.ts (+ .spec.ts)                # §5 동작
src/modules/admin-auth/guards/admin-auth.guard.ts (+ .spec.ts)           # §6
src/modules/admin-auth/decorators/current-admin.decorator.ts
src/modules/admin-auth/dto/admin-auth.dto.ts                             # AdminLoginDto, AdminAuthTokenResponseDto, AdminInfoDto
src/modules/admin-auth/mappers/admin.mapper.ts                           # toAdminInfo (snake → camel)
src/app.module.ts                                                        # AdminAuthModule 등록
src/modules/feedbacks/admin-feedbacks.controller.ts                      # AdminAuthGuard로 교체 + @ApiBearerAuth
src/modules/feedbacks/feedbacks.module.ts                                # imports에 AdminAuthModule, 구 가드 provider 제거
src/modules/feedbacks/guards/admin-feedback-token.guard(.spec).ts        # 삭제
```

`AuthModule`은 이미 `TokenService`, `PasswordService`, `AuthThrottlerGuard`를 export하므로 그대로 import한다. `PasswordService.hash/compare`를 재사용한다.

---

## 8. 관리자 CLI (`scripts/admin-cli.ts`)

가입 API 대신 서버에서 실행하는 스크립트. `PrismaClient`(+ `@prisma/adapter-mariadb`, `src/common/database/prisma.service.ts`와 같은 초기화)와 `bcryptjs`를 직접 사용하고 Nest 컨테이너는 띄우지 않는다.

```bash
npm run admin -- create --email ops@lifeistravel.kr --name "운영팀"     # 비밀번호는 프롬프트(입력 숨김)로 2회 입력
echo "$PW" | npm run admin -- create --email ops@lifeistravel.kr --password-stdin   # 비대화형(배포 스크립트용)
npm run admin -- reset-password --email ops@lifeistravel.kr          # 새 비밀번호 프롬프트, refresh 토큰 전부 삭제
npm run admin -- deactivate --email ops@lifeistravel.kr              # is_active=false + refresh 토큰 전부 삭제
npm run admin -- activate --email ops@lifeistravel.kr                # is_active=true, login_count/잠금 초기화
npm run admin -- list                                                # id, email, name, is_active, last_login_at 표
```

규칙:
- `create`: 이메일 소문자 정규화, 중복이면 종료 코드 1 + "이미 존재하는 관리자입니다". 비밀번호 최소 8자, 두 입력 불일치 시 재입력. `id = adm_<uuid>`.
- 비밀번호는 절대 인자(`--password`)로 받지 않는다(셸 히스토리에 남음). 프롬프트 또는 stdin만.
- 모든 명령은 결과를 한 줄로 출력하고 `prisma.$disconnect()` 후 종료한다.
- 운영 서버에서는 `npx ts-node -r tsconfig-paths/register scripts/admin-cli.ts <cmd>`로 실행하거나, `tsconfig.build.json`의 `include`에 `scripts/**/*`를 넣어 `node dist/scripts/admin-cli.js`로 실행한다(둘 중 하나를 PR-1에서 확정).
- 환경변수는 `.env.local`/`.env`를 `dotenv`로 읽는다(`DATABASE_URL`만 필요).

---

## 9. 구현 순서 (PR 분할)

F-018 명세 §9의 **PR-1**에 해당한다. 아래 셋으로 나눠도 되고 한 PR로 묶어도 된다.

| 순서 | 단위 | 내용 | 비고 |
|---|---|---|---|
| 1a | 스키마·CLI | §2 마이그레이션 + `schema.prisma`, §8 CLI, `package.json` 스크립트 | 운영 DB 선반영 후 `prisma:pull`. 다른 코드와 독립 |
| 1b | 인증 모듈 | §3 환경변수, §4 `TokenService` 확장, `admin-auth` 모듈(§5·§6·§7), 스펙 | 1a의 Prisma 타입 필요 |
| 1c | 정적 토큰 제거 | feedbacks 컨트롤러를 `AdminAuthGuard`로 교체, 구 가드·`ADMIN_FEEDBACK_TOKEN` 삭제, `@Throttle 60/min` 추가 | 1b 이후. **배포 전에 관리자 1명 이상을 CLI로 생성**해야 피드백 어드민이 잠기지 않는다 |

배포 체크리스트: ① 운영 DB에 §2.2 SQL 적용 → ② 운영 환경변수에 `JWT_ADMIN_ACCESS_TOKEN_SECRET`/`JWT_ADMIN_REFRESH_TOKEN_SECRET` 추가, `ADMIN_FEEDBACK_TOKEN` 제거 → ③ 배포 → ④ CLI로 관리자 생성 → ⑤ 로그인 확인.

---

## 10. 테스트 기대치

저장소 관례(`createXxxService()` 팩토리 + Prisma mock, `as never`)를 따른다. 점주 `auth.service.spec.ts`·`store-auth.guard.spec.ts`를 템플릿으로 삼는다.

| 스펙 파일 | 검증 항목 |
|---|---|
| `src/modules/auth/services/token.service.spec.ts` | 관리자 access/refresh 발급·검증 라운드트립 / 점주 시크릿으로 서명한 토큰은 `verifyAdminAccessToken`에서 `TOKEN_INVALID` / `role !== 'admin'` 페이로드 거부 / 관리자 토큰을 `verifyAccessToken`(점주)에 넣으면 거부 |
| `src/modules/admin-auth/admin-auth.service.spec.ts` | login 성공(토큰 2종, refresh 저장, 카운트 초기화, `last_login_at`) / 이메일 없음·비밀번호 불일치 `AUTHENTICATION_FAILED` + `remainingAttempts` / 5회째 `ACCOUNT_LOCKED` + `lockedUntil` / 잠금 중 거부 / `is_active=false` → `ADMIN_INACTIVE`(비밀번호 검사 전) / refresh: `TOKEN_NOT_FOUND`·`TOKEN_EXPIRED`(행 삭제)·`ADMIN_INACTIVE`·정상 재발급 / logout 404 / password: 불일치 401, 성공 시 refresh 전부 삭제 |
| `src/modules/admin-auth/guards/admin-auth.guard.spec.ts` | 정상 → `request.admin`/`adminId` 주입 / 헤더 없음 `AUTHENTICATION_REQUIRED` / `Bearer` 아님 / 검증 실패 `TOKEN_INVALID` / 행 없음 `ADMIN_NOT_FOUND` / `is_active=false` `ADMIN_INACTIVE` |
| `src/modules/admin-auth/mappers/admin.mapper.spec.ts` | snake→camel, `password_hash` 미노출 |
| `src/modules/feedbacks/guards/admin-feedback-token.guard.spec.ts` | **삭제** |
| (선택) `test/admin-auth.e2e-spec.ts` | login → me 200, 잘못된 토큰 401. DB 필요하면 보류 |

CLI는 단위 테스트 대상에서 제외하되, `create` 후 `login`이 되는지 수동 확인을 PR 체크리스트에 넣는다.

---

## 11. 엣지 케이스

| 케이스 | 규칙 |
|---|---|
| 이메일 대소문자 | 저장·조회 모두 trim + 소문자. `uniq_admin_email`은 소문자 기준 |
| 비활성 관리자의 기존 access 토큰 | 가드가 매 요청 `admins` 조회 → 다음 요청부터 `ADMIN_INACTIVE`. 만료 전이라도 즉시 차단 |
| 비활성 관리자의 refresh | `refresh`에서 `ADMIN_INACTIVE`. CLI `deactivate`가 refresh 행을 삭제하므로 보통 `TOKEN_NOT_FOUND`가 먼저 |
| 관리자 행 삭제 | 하지 않는다(비활성화만). 감사 추적을 위해 행 유지. 삭제가 필요하면 DB에서 직접 — `ON DELETE CASCADE`로 refresh 행 정리 |
| 잠금 카운터 | 관리자별 `login_count`. 성공 시 0. `activate`도 0으로 초기화 |
| 점주 토큰으로 관리자 API | 시크릿이 달라 `TOKEN_INVALID`. 반대도 동일 |
| 토큰 공유 | 관리자 토큰은 개인 식별자이므로 공유 금지. 어드민 프론트는 로그인 화면을 두고 토큰을 사용자별로 보관 |
| `JWT_ADMIN_*` 미설정 | Joi 부팅 실패(fail-closed). 배포 체크리스트 ② 선행 |
| 관리자 0명 상태로 1c 배포 | 피드백 어드민 API에 아무도 접근 불가. 배포 체크리스트 ④ 선행 |
