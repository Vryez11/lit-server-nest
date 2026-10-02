# 관리자 매장 운영 현황 API (F-018)

> **기준 PRD**: [`docs/README.md`](../../README.md) §3 F-018 · **상태**: 구현 예정 · **독자**: 백엔드 구현자, 어드민 프론트 개발자
>
> 이 문서는 "어떻게 호출하고 무엇이 돌아오는가"와 구현 가이드를 정의한다. 통과/실패 판정 기준(`✅`)은
> PRD가 단일 진실 공급원(SSOT)이며, 둘이 어긋나면 PRD를 기준으로 이 문서를 고친다.

---

## 1. 목적·범위

- 플랫폼 관리자가 어드민 페이지에서 **매장별·플랫폼 전체 매출·예약·노쇼**를 기간 단위로 보고, 일/주/월 추이와 로케일 분포로 "어느 매장에 예약이 몰리고 어느 매장이 비는지"를 한눈에 파악한다.
- 이 저장소는 API만 제공한다. 어드민 페이지(프론트)는 별도 저장소에서 이 API를 호출한다.
- **1차 범위의 규모 가정**: 현재 예약은 랜딩(비회원)에서만 들어오고 월 60건 안팎이다. 그래서 일별 매장 추이는 대부분 0~1이고, 매장 단위 비율은 표본이 작다. 주/월 추이, 플랫폼 합계, 건수 중심 노출을 우선하고 성능 최적화(집계 인덱스·기간 상한)는 두지 않는다.
- **클라이언트 책임**: 순위 번호(`sortBy` 정렬 결과의 인덱스), 직전 기간 대비 증감(같은 API를 기간만 바꿔 2회 호출), 표본 부족 표시(건수가 적을 때 비율 경고)는 서버가 계산하지 않는다. 단, 플랫폼 전체 추이는 매장별 호출 N회가 레이트리밋(60 req/min)에 걸리므로 서버가 한 번에 준다(4.5).
- **제외(v2 후보)**: 관리자 쓰기 작업(매장 정지, 강제 상태 변경, 정산 지급), 정산 테이블(`settlement_*`) 읽기, `daily_statistics`(코드에서 미사용), 이용일(`start_time`) 기준 보기·요일/시간대 분포, 휴면·급감 매장 알림, 승인 소요시간, 회원/비회원 분포(현재 전부 비회원), 재방문율. 점주 앱 배포 후 데이터가 쌓이면 추가한다.

---

## 2. 인증·레이트리밋

### 2.1 인증 — 관리자 JWT (`AdminAuthGuard`)

인증·계정 명세는 [`docs/api/admin/auth.md`](auth.md)(F-019)에 있다. 이 문서의 모든 엔드포인트는 그 가드를 그대로 쓴다.

| 항목 | 결정 |
|---|---|
| 헤더 | `Authorization: Bearer <관리자 access 토큰>` |
| 가드 | `AdminAuthGuard` (`src/modules/admin-auth/guards/admin-auth.guard.ts`). 서명 검증(`JWT_ADMIN_ACCESS_TOKEN_SECRET`) → `admins` 행 조회(존재·`is_active`) → `request.admin`/`request.adminId` 주입 |
| 주입 | `@CurrentAdmin()`, `@CurrentAdminId()` (`src/modules/admin-auth/decorators/current-admin.decorator.ts`) |
| 실패 | Bearer 누락 401 `AUTHENTICATION_REQUIRED` · 서명/만료/페이로드 불량 401 `TOKEN_INVALID` · 관리자 없음 401 `ADMIN_NOT_FOUND` · 비활성 401 `ADMIN_INACTIVE` |
| 타 액터 토큰 | 점주·고객 토큰은 시크릿이 달라 서명 단계에서 `TOKEN_INVALID` |
| 선행 | F-019(auth.md §9 PR-1)가 머지되어야 이 문서의 엔드포인트를 보호할 수 있다 |

### 2.2 기존 피드백 admin 이관

- `src/modules/feedbacks/admin-feedbacks.controller.ts`의 `AdminFeedbackTokenGuard` → `AdminAuthGuard`로 교체.
- `src/modules/feedbacks/guards/admin-feedback-token.guard.ts` + `.spec.ts` 삭제, `feedbacks.module.ts` provider 제거, `ADMIN_FEEDBACK_TOKEN` 환경변수 삭제(Joi, `.env.example`).
- 동작 동일(F-014). 이 작업은 auth.md §9 PR-1에 포함된다.

### 2.3 레이트리밋·Swagger

- 컨트롤러 레벨 `@UseGuards(AuthThrottlerGuard, AdminAuthGuard)` + `@Throttle({ default: { limit: 60, ttl: 60_000 } })`.
  **가드 순서 중요**: 스로틀러가 먼저여야 401 실패 시도도 카운트된다. 초과 시 429 `RATE_LIMIT_EXCEEDED`.
- `ThrottlerModule`이 `AuthModule`(15분/5회)과 `FeedbacksModule`(30초/1회) 두 곳에서 `forRoot`되어 전역 기본값이 모호하므로 **admin 컨트롤러에는 반드시 명시적 `@Throttle`**을 둔다. `AdminFeedbacksController`에도 같은 데코레이터를 적용한다(현재 스로틀 없음).
- `AdminModule`은 `imports: [AuthModule, AdminAuthModule]`로 `AuthThrottlerGuard`와 `AdminAuthGuard`를 받는다.
- Swagger: `@ApiTags('Admin Stores')`, `@ApiBearerAuth()`(기존 `addBearerAuth()` 스킴 재사용).

---

## 3. 공통 규약

### 3.1 날짜 범위 (`AdminDateRangeQueryDto`)

| 파라미터 | 타입 | 기본값 | 검증 |
|---|---|---|---|
| `from` | `YYYY-MM-DD` (KST 일자) | `to` − 29일 | `@IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)` |
| `to` | `YYYY-MM-DD` (KST 일자) | 오늘(KST) | 동일 |

- 서비스에서 `getKstDateRange({ from, to }, 30)`(`src/modules/dashboard/utils/kst-date-range.util.ts`) 호출 → `{ start, endExclusive, dates[] }`. 기본 30일 창(대시보드 util 기본 7일과 다름 — 운영 화면은 월 단위가 자연스러움).
- 타임존: `from=2026-09-01` → `start = 2026-08-31T15:00:00.000Z`, `to=2026-09-30` → `endExclusive = 2026-09-30T15:00:00.000Z`. 응답의 `range`는 KST 문자열을 그대로 echo.

### 3.2 에러코드

| HTTP | `code` | 조건 |
|---|---|---|
| 401 | `AUTHENTICATION_REQUIRED` / `TOKEN_INVALID` / `ADMIN_NOT_FOUND` / `ADMIN_INACTIVE` | Bearer 누락 / 토큰 불량·만료·타 액터 토큰 / 관리자 없음 / 비활성 (auth.md 참조) |
| 400 | `VALIDATION_ERROR` | DTO 검증 실패(형식 불량 날짜, enum 외 값, `limit > 100`, 미정의 쿼리 키 등) |
| 400 | `INVALID_DATE` | 형식은 맞지만 달력에 없는 날(`2026-02-30`) — util |
| 400 | `INVALID_DATE_RANGE` | `from > to` — util |
| 400 | `DATE_RANGE_TOO_LARGE` | 366일 초과 — util |
| 404 | `STORE_NOT_FOUND` | `:storeId` 부재(4.2~4.4). 메시지 `'점포를 찾을 수 없습니다.'`(`dashboard-store.service.ts`와 동일) |
| 429 | `RATE_LIMIT_EXCEEDED` | 60 req/min 초과 |

### 3.3 응답 래핑

전역 `ApiResponseInterceptor`가 `{ success: true, data: <아래 Response>, timestamp }`로 감싼다. 아래 JSON은 모두 `data` 내부다.

### 3.4 `metrics` 공통 객체 (`StoreOpsMetricsDto`)

목록 아이템·요약·`meta.totals`에서 같은 객체를 재사용한다.

```jsonc
{
  "reservationRevenue": 1250000, // 예약 기준 매출(원). Σ total_amount, payment_status=paid, created_at ∈ 기간
  "paymentRevenue": 980000,      // PG 결제 기준 총매출(원). Σ payments.amount_total, paid_at ∈ 기간
  "refundedAmount": 30000,       // PG 환불·취소액(원). canceled_at ∈ 기간
  "paymentCount": 41,            // paymentRevenue 집계 대상 결제 건수
  "reservationCount": 73,        // 예약 그룹 수(대표 행 기준)
  "pendingCount": 2,             // pending + pending_approval (status NULL 포함)
  "activeCount": 5,              // confirmed + in_progress
  "completedCount": 55,
  "cancelledCount": 6,
  "rejectedCount": 1,
  "noShowCount": 4,
  "noShowRate": 6.8,             // %, 소수 1자리. 분모 0 → null
  "completionRate": 75.3,        // %, 소수 1자리. 분모 0 → null
  "cancellationRate": 9.6        // %, 소수 1자리. 분모 0 → null
}
```

**불변식**: `reservationCount === pendingCount + activeCount + completedCount + cancelledCount + rejectedCount + noShowCount` (테스트로 고정).

---

## 4. 엔드포인트

베이스 `api/admin/stores`. 전부 `GET`, 전부 `AdminAuthGuard`. 총 5개.
**라우트 선언 순서**: 정적 경로 `GET timeseries`(4.5)를 `GET :storeId/...` 라우트보다 **먼저** 선언한다. 현재는 `:storeId` 단독 라우트가 없어 충돌하지 않지만, 이후 `GET :storeId`가 추가되면 `timeseries`가 `storeId`로 잡히는 것을 막기 위한 정적 경로 우선 원칙이다.

### 4.1 `GET /api/admin/stores` — 매장별 운영 현황 목록 (메인 테이블)

**Query** (`AdminStoreListQueryDto extends AdminDateRangeQueryDto`)

| 파라미터 | 타입 | 기본 | 검증·의미 |
|---|---|---|---|
| `search` | string | — | `@IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(100)`. `business_name contains`. MySQL collation이 대소문자를 무시하므로 `mode: 'insensitive'`는 쓰지 않는다(MySQL 미지원) |
| `hasCompletedSetup` | boolean | —(전체) | `@Transform(optionalBoolean) @IsBoolean()`. `true` → `has_completed_setup = true`, `false` → `false OR NULL` |
| `sortBy` | enum | `reservationRevenue` | `reservationRevenue \| paymentRevenue \| reservationCount \| noShowCount \| noShowRate \| cancellationRate \| completionRate \| businessName \| createdAt` |
| `sortOrder` | enum | `desc` | `asc \| desc` |
| `page` | int | 1 | `@Transform(optionalNumber) @IsInt() @Min(1)` |
| `limit` | int | 20 | `@Min(1) @Max(100)` |

정렬: 1차 `sortBy`, 2차 `businessName asc`, 3차 `storeId asc`(결정적). 비율 `null`은 **정렬 방향과 무관하게 항상 마지막**.

**Response** (`AdminStoreListResponseDto`)

```jsonc
{
  "items": [
    {
      "storeId": "store_abc",
      "businessName": "홍대 짐보관소",
      "email": "owner@example.com",
      "businessType": "CAFE",                      // stores_business_type | null
      "hasCompletedSetup": true,                   // boolean (NULL → false)
      "storeStatus": "open",                       // store_status 최신 행. 없으면 "closed"
      "createdAt": "2026-01-10T03:00:00.000Z",
      "lastLoginAt": "2026-09-30T01:12:00.000Z",   // null 가능
      "metrics": { /* StoreOpsMetricsDto */ }
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 137,                                    // 필터(search/hasCompletedSetup) 적용 후 매장 수(데이터 유무 무관)
  "meta": {
    "range": { "from": "2026-09-01", "to": "2026-09-30" },
    "totals": { /* StoreOpsMetricsDto — 필터에 걸린 전체 매장 합. 현재 페이지 합이 아님 */ },
    "activeStoreCount": 9,                         // 필터 적용 후 매장 중 기간 내 reservationCount ≥ 1 인 매장 수. 예약 없는 매장 수 = total − activeStoreCount
    "localeBreakdown": [                           // 필터 적용 전체 매장, 그룹 단위, reservationCount desc → locale asc. 예약 없으면 []
      { "locale": "en", "reservationCount": 31 },
      { "locale": "ko", "reservationCount": 18 },
      { "locale": "ja", "reservationCount": 9 },
      { "locale": "zh", "reservationCount": 2 }
    ]
  }
}
```

`meta.totals`의 비율은 합산 분자/분모로 재계산(가중 평균)한다. 매장별 비율의 단순 평균이 아니다.
`localeBreakdown`의 `locale`은 `reservations.locale`(VarChar(5), 기본 `ko`) 저장값 그대로이며 서버가 값을 정규화·제한하지 않는다. 합계는 `meta.totals.reservationCount`와 같다.

**"적게 들어오는 매장" 보기**: `sortBy=reservationCount&sortOrder=asc`. 예약 0건 매장도 목록에 포함되므로(지표 0, 비율 `null`) 별도 필터 없이 맨 앞에 온다.

### 4.2 `GET /api/admin/stores/:storeId/summary` — 매장 상세 요약

**Query**: `AdminDateRangeQueryDto` (`from`, `to`).

**Response** (`AdminStoreSummaryResponseDto`)

```jsonc
{
  "store": {
    "id": "store_abc",
    "businessName": "홍대 짐보관소",
    "email": "owner@example.com",
    "businessType": "CAFE",
    "businessNumber": "123-45-67890",   // null 가능
    "representativeName": "홍길동",     // null 가능
    "address": "서울 마포구 ...",        // null 가능
    "phoneNumber": "010-0000-0000",     // 점주 개인 번호 — 관리자 화면이므로 노출
    "storePhoneNumber": "02-000-0000",  // null 가능
    "hasCompletedSetup": true,
    "storeStatus": "open",
    "createdAt": "2026-01-10T03:00:00.000Z",
    "lastLoginAt": "2026-09-30T01:12:00.000Z"
  },
  "range": { "from": "2026-09-01", "to": "2026-09-30" },
  "metrics": { /* StoreOpsMetricsDto */ }
}
```

구현: `AdminStoreService.getStoreOrThrow(storeId)` → 404. 이후 4.1과 **같은 집계 함수**를 `storeIds = [storeId]`로 호출한다(`AdminStoreMetricsService.aggregateByStore(range, { storeIds })`). 목록과 요약이 같은 코드 경로를 타므로 숫자 불일치가 생길 수 없다.

### 4.3 `GET /api/admin/stores/:storeId/timeseries` — 추이(차트)

**Query** (`AdminStoreTimeseriesQueryDto extends AdminDateRangeQueryDto`)

| 파라미터 | 타입 | 기본 | 검증 |
|---|---|---|---|
| `granularity` | enum | `day` | `day \| week \| month` |

**Response** (`AdminStoreTimeseriesResponseDto`)

```jsonc
{
  "storeId": "store_abc",
  "granularity": "day",
  "range": { "from": "2026-09-01", "to": "2026-09-30" },
  "buckets": [
    {
      "date": "2026-09-01",        // day: YYYY-MM-DD, week: 해당 주 월요일 YYYY-MM-DD, month: YYYY-MM
      "reservationRevenue": 120000,
      "paymentRevenue": 90000,
      "refundedAmount": 0,
      "reservationCount": 7,
      "completedCount": 5,
      "cancelledCount": 1,
      "rejectedCount": 0,
      "noShowCount": 1
    }
  ]
}
```

- 범위 내 모든 버킷을 **0으로 채워** 반환한다(`range.dates` 사용; `week`는 `dates.map(kstWeekStart)` 유니크, `month`는 `dates.map(d => d.slice(0, 7))` 유니크). 최대 366개(day) / 53개(week) / 13개(month).
- **주 규칙**: 월요일 시작(KST). `kstWeekStart('YYYY-MM-DD')`는 `Date.UTC`로 파싱해 `(getUTCDay() + 6) % 7`일을 빼 월요일 일자를 돌려주는 순수 함수다(타임존 영향 없음). 예: `2026-09-02`(수) → `2026-08-31`(월).
- 비율은 버킷에 넣지 않는다(일 단위 분모가 작아 노이즈가 큼. 필요하면 클라이언트가 합산 후 계산).
- 양끝 주·월은 부분 주·부분 월일 수 있다(범위에 포함된 일자만 합산). 예: `from=2026-09-02`이면 첫 주 버킷 `2026-08-31`은 9/2~9/6만 합산.

### 4.4 `GET /api/admin/stores/:storeId/reservations` — 매장 예약 목록(관리자)

**Query** (`AdminStoreReservationsQueryDto`)

| 파라미터 | 타입 | 기본 | 의미 |
|---|---|---|---|
| `status` | `reservations_status` | — | `no_show` 포함 8개 전부 허용 |
| `from`, `to` | `YYYY-MM-DD` | —(미지정 시 기간 필터 없음) | 하나라도 주어지면 `getKstDateRange(q, 30)`으로 보완 후 **`created_at`** 범위 적용. 지표 코호트와 같은 기준이므로 "위 노쇼 4건 보기" 드릴다운이 정확히 맞아떨어진다 |
| `search` | string ≤100 | — | `OR: [{ customer_name: { contains } }, { customer_phone: { contains } }, { id: { equals } }]` |
| `page` / `limit` | int | 1 / 20 (max 100) | |

**Response**: 기존 `ReservationListResponseDto` 그대로 — `{ items: ReservationResponseDto[], page, limit, total }`. 행 단위 N건 + `groupId` 노출(F-009 "점주·고객 API는 그룹 멤버를 N건 개별 노출" 규칙 유지). `orderBy: created_at desc`.

구현: `ReservationQueryService`는 모듈 외부로 export되지 않으므로 export를 늘리지 않고, admin 서비스에서 Prisma를 직접 조회한 뒤 `toReservationResponse`(`src/modules/reservations/mappers/reservation.mapper.ts`, 순수 함수)를 import해 매핑한다. 매장 존재 확인은 `getStoreOrThrow` → 404.

### 4.5 `GET /api/admin/stores/timeseries` — 플랫폼 전체 추이

전체 매장 합계의 추이를 **한 번의 호출**로 준다. 매장별 `timeseries`를 매장 수만큼 호출하면 60 req/min 제한에 걸리고 서버 부하도 매장 수배가 되기 때문이다.

**Query**: `AdminDateRangeQueryDto`(`from`, `to`) + `granularity`(`day | week | month`, 기본 `day`). 필터(`search`, `hasCompletedSetup`)는 받지 않는다 — 항상 전체 매장 합산이며, 미정의 쿼리 키는 `forbidNonWhitelisted`로 400 `VALIDATION_ERROR`.

**Response** (`AdminPlatformTimeseriesResponseDto`)

```jsonc
{
  "granularity": "week",
  "range": { "from": "2026-09-01", "to": "2026-09-30" },
  "buckets": [ /* 4.3과 동일한 버킷 객체. 전체 매장 합계 */ ]
}
```

- 버킷 키·0 채움·부분 주/월 규칙은 4.3과 동일하다. 응답에 `storeId`는 없다.
- 집계 술어는 5장과 같고 `store_id` 조건만 없다. 같은 기간 4.1 `meta.totals`(필터 없음)의 `reservationCount`·`reservationRevenue` 등은 버킷 합계와 일치해야 한다(테스트로 고정).
- 구현은 4.3의 버킷 누적 로직을 `storeId` 없이 재사용한다(7.4).

> 플랫폼 합계(필터 없음)는 4.1 `meta.totals`로도 얻을 수 있으나, 추이(버킷)는 이 엔드포인트만 제공한다.

---

## 5. 지표 정의 (SQL 술어)

표기: `R = reservations`, `P = payments`, `[start, end)` = `getKstDateRange`의 `start`/`endExclusive`, `:s` = store_id.
`REP := (R.reservation_group_id IS NULL OR R.reservation_group_id = R.id)` — 대표 행.

| 지표 | 정의 | 비고 |
|---|---|---|
| `reservationRevenue` | `SUM(R.total_amount) WHERE R.store_id=:s AND R.payment_status='paid' AND R.created_at >= start AND R.created_at < end` | **모든 행**(멤버 포함). 멀티타입은 행별 `total_amount` 합 = 그룹 총액. 예약 상태 무관(F-012 동일) |
| `paymentRevenue` | `SUM(P.amount_total) WHERE P.store_id=:s AND P.status IN ('SUCCESS','CANCELED','REFUNDED') AND P.paid_at >= start AND P.paid_at < end` | 총매출(gross). `paid_at`은 불변이라 과거 월 수치가 환불로 소급 변동하지 않음 |
| `refundedAmount` | `SUM(P.amount_total) WHERE P.store_id=:s AND P.status IN ('CANCELED','REFUNDED') AND P.canceled_at >= start AND P.canceled_at < end` | 부분 환불 금액 컬럼이 없어 전액으로 간주. 순매출 = `paymentRevenue − refundedAmount`(클라이언트) |
| `paymentCount` | `COUNT(*)` of `paymentRevenue` 술어 | |
| `reservationCount` | `COUNT(*) WHERE R.store_id=:s AND REP AND R.created_at ∈ [start, end)` | 그룹 수 |
| `<status>Count` | 위 + `AND COALESCE(R.status, 'pending') = '<status>'` | 그룹 상태 = **대표 행**의 status |
| `pendingCount` | `pending + pending_approval` | |
| `activeCount` | `confirmed + in_progress` | `ACTIVE_RESERVATION_STATUSES`와 동일 |
| `noShowRate` | `noShowCount / (completedCount + noShowCount) × 100`, 분모 0 → `null` | "결과가 확정된 예약 중 미방문 비율". cancelled/rejected는 노쇼 기회 자체가 없었고, pending/active는 결과 미확정이라 제외 → 최근 구간에서도 과소평가되지 않음 |
| `completionRate` | `completedCount / reservationCount × 100`, 분모 0 → `null` | F-012 `completionRate`와 같은 식(단위만 그룹) |
| `cancellationRate` | `(cancelledCount + rejectedCount) / reservationCount × 100`, 분모 0 → `null` | PRD §1.4 "예약 취소율"과 일치 |

반올림: `Number((num / den * 100).toFixed(1))` (`dashboard-stats.service.ts`와 동일).

### 5.1 F-012(매장 대시보드) 대비 의도적 차이

1. 건수 단위가 **행 → 그룹**. 대시보드는 멀티타입 s+m+l을 3건으로 세고, 관리자 화면은 1건. 매출은 양쪽 동일.
2. `no_show`·`rejected`·`pending`·`active`를 명시 노출(대시보드는 `total`에만 숨김).
3. 비율 분모 0일 때 `0` 대신 `null`.
4. `status NULL` 행을 `pending`으로 간주(대시보드는 `total`에만 포함).
5. PG 결제 매출을 별도 축으로 노출. `paymentRevenue ≤ reservationRevenue`가 정상 — 차이 ≈ 현장결제(`payments` 행 없음, 체크인 시 `paid` 전환; `owner-actions.service.ts`) + 결제/예약 생성 시각 차.

### 5.2 날짜 컬럼 선택 근거

조회 기간은 **예약 생성일(`created_at`, KST) 코호트**다. 3월에 생성돼 4월에 노쇼된 예약은 3월 집계에 포함된다. 매장 대시보드와 같은 기준이며, 분자·분모가 같은 코호트여야 비율이 성립한다. `no_show_at` 컬럼이 없고 `updated_at`은 이후 갱신에 덮이므로 노쇼 시점 집계는 불가하다. 이용일(`start_time`) 기준 보기는 v2(`dateBasis` 파라미터) 후보.

---

## 6. 엣지 케이스

| 케이스 | 규칙 |
|---|---|
| 1일 범위(`from = to`) | 정상(1 버킷). 0일 이하는 util이 `INVALID_DATE_RANGE` |
| 예약 0건 매장 | 목록에 포함, 숫자 0, 비율 `null` |
| `has_completed_setup` false/NULL | 기본 포함, `hasCompletedSetup: false`로 노출, 필터로 제외 가능 |
| `status NULL` | `pending`으로 집계 |
| `reservation_group_id NULL` | 자기 자신이 대표(1건 그룹) — F-009 규칙 |
| 그룹 내 상태 불일치(일부 멤버만 pending) | 대표 행 status 채택. 비회원 API의 "최저 진행도" 규칙과 다름을 PRD에 명시. 노쇼/취소는 그룹 일괄 전이라 대표=멤버 |
| 대표가 없는 고아 멤버(레거시) | 건수 집계 제외(미미), 매출에는 포함(행 기준) |
| `created_at NULL` 레거시 행 | 범위 필터에 걸리지 않아 제외 |
| 366일 초과 / `from > to` / 달력에 없는 날 | 400 `DATE_RANGE_TOO_LARGE` / `INVALID_DATE_RANGE` / `INVALID_DATE` |
| 형식 불량(`2026/09/01`, `2026-09-01T00:00Z`) | 400 `VALIDATION_ERROR`(DTO `@Matches`) |
| paid + cancelled/no_show | `reservationRevenue`에 **포함**(F-012 동일). 환불 로직 미구현이라 `payment_status`는 `paid` 유지. 환불 구현 시 `refunded`로 바뀌면 자동 제외 |
| `payment_status = refunded` | 제외(술어가 `= 'paid'`) |
| `paid_at NULL`인 SUCCESS 행 | 제외(데이터 오류로 간주) |
| `canceled_at NULL`인 CANCELED/REFUNDED | `refundedAmount` 제외 |
| 자동 완료 크론(6h 유예, confirmed→completed) | 점주가 노쇼 처리하지 않은 미방문이 `completed`로 잡힘 → `noShowRate` 과소 가능(PRD 한계 항목) |
| `page` 범위 초과 | `items: []`, `total` 유지 |
| 정렬 동률 | `businessName asc, storeId asc` |
| 관리자 비활성화 | 가드가 매 요청 `admins`를 조회하므로 비활성화 즉시 다음 요청부터 401 `ADMIN_INACTIVE`. refresh 토큰은 비활성화 시 CLI가 삭제 |
| BigInt 직렬화 | `payments.id`(BigInt)는 어떤 응답에도 넣지 않는다(합계는 `amount_total` Int) |

---

## 7. 구현 가이드

### 7.1 파일 배치

```
src/modules/admin/admin.module.ts                                        # 신규 (imports: AuthModule, AdminAuthModule)
src/modules/admin/admin-stores.controller.ts                             # 신규
src/modules/admin/dto/admin-store-ops.dto.ts                             # 신규 (Query/Response DTO 전부)
src/modules/admin/services/admin-store.service.ts                        # 매장 조회/404, store_status 최신값
src/modules/admin/services/admin-store-metrics.service.ts                # 목록 + 요약 (DB groupBy)
src/modules/admin/services/admin-store-timeseries.service.ts             # 추이 4.3(매장)·4.5(플랫폼) 공용 (행 조회 → 메모리 버킷, storeId 선택)
src/modules/admin/services/admin-store-reservations.service.ts           # 예약 목록
src/modules/admin/utils/store-ops-metrics.util.ts (+ .spec.ts)           # 순수 함수: 대표행 where, 비율, 버킷 키
src/app.module.ts                                                        # AdminModule 등록
```

인증·계정(F-019) 관련 파일(`admin-auth` 모듈, 스키마·마이그레이션, CLI, 환경변수, feedbacks 이관)은 auth.md §7에 있다.

### 7.2 목록/요약 쿼리 전략 (N+1 없음, 요청당 최대 7쿼리, 모두 `Promise.all`)

1. `stores.findMany({ where: { search, setup 필터 }, select: { id, business_name, email, business_type, has_completed_setup, created_at, last_login_at } })` — 필터된 전체 매장. 정렬 키가 집계값이므로 페이지 슬라이스 전에 전부 필요(매장 수는 수백 규모 가정).
2. `store_status.findMany({ where: { store_id: { in: ids } }, orderBy: { updated_at: 'desc' } })` → 메모리에서 매장별 첫 행.
3. `reservations.groupBy({ by: ['store_id'], where: { payment_status: 'paid', created_at: { gte, lt }, ...storeScope }, _sum: { total_amount: true } })`
4. `reservations.groupBy({ by: ['store_id', 'status'], where: { created_at: { gte, lt }, ...REPRESENTATIVE, ...storeScope }, _count: { _all: true } })`
5. `payments.groupBy({ by: ['store_id'], where: { status: { in: ['SUCCESS', 'CANCELED', 'REFUNDED'] }, paid_at: { gte, lt }, ...storeScope }, _sum: { amount_total: true }, _count: { _all: true } })`
6. `payments.groupBy({ by: ['store_id'], where: { status: { in: ['CANCELED', 'REFUNDED'] }, canceled_at: { gte, lt }, ...storeScope }, _sum: { amount_total: true } })`
7. (목록만, 요약은 생략) `reservations.groupBy({ by: ['locale'], where: { created_at: { gte, lt }, ...REPRESENTATIVE, ...storeScope }, _count: { _all: true } })` → `meta.localeBreakdown`(`reservationCount desc, locale asc`).

`meta.activeStoreCount`는 4번 결과 맵에서 `reservationCount ≥ 1`인 매장 수를 세어 얻는다(추가 쿼리 없음).

`storeScope`는 `search`/`hasCompletedSetup`이 있을 때만 `{ store_id: { in: ids } }`, 없으면 생략(전체). 메모리에서 `Map<storeId, …>`로 머지 → 매장당 `metrics` 산출(없으면 0/`null`) → 정렬 → `slice((page-1)*limit, page*limit)`. 요약(4.2)은 같은 함수를 `storeIds = [storeId]`로 호출.

### 7.3 대표 행 where 조각 (raw SQL 없이)

Prisma 7.8은 필드 참조(`prisma.<model>.fields.<column>`)를 지원하므로 `reservation_group_id = id`를 `where`로 표현할 수 있다(`StringNullableFilter.equals`가 `StringFieldRefInput`을 받음 — `node_modules/.prisma/client/index.d.ts`에서 확인).

```ts
// src/modules/admin/utils/store-ops-metrics.util.ts
export const representativeReservationWhere = (
  prisma: PrismaService,
): Prisma.reservationsWhereInput => ({
  OR: [
    { reservation_group_id: null },
    { reservation_group_id: { equals: prisma.reservations.fields.id } },
  ],
});
// 생성 SQL: (reservation_group_id IS NULL OR reservation_group_id = id)
```

행 단위 술어(`isRepresentative(row)`, `isPaidRevenueRow(row)`, `coalesceStatus(row.status)`)도 **같은 파일**에 순수 함수로 두어 7.2(DB where)와 7.4(메모리 필터)의 의미가 갈라지지 않게 한다.

### 7.4 타임시리즈

Prisma `groupBy`는 날짜 절단 표현식을 지원하지 않고, raw SQL은 세션 타임존 의존(`TIMESTAMP` 컬럼 + mariadb 어댑터)이라 KST 경계가 util과 어긋날 위험이 있다. 단일 매장 × ≤366일은 행 수가 유계(1매장 1년 ≈ 수천~1만 행)이므로 **행 조회 → 메모리 버킷**으로 처리한다.

```ts
reservations.findMany({
  where: { store_id, created_at: { gte, lt } },
  select: { id: true, reservation_group_id: true, status: true, payment_status: true, total_amount: true, created_at: true },
});
payments.findMany({
  where: { store_id, status: { in: ['SUCCESS', 'CANCELED', 'REFUNDED'] },
           OR: [{ paid_at: { gte, lt } }, { canceled_at: { gte, lt } }] },
  select: { amount_total: true, status: true, paid_at: true, canceled_at: true },
});
```

버킷 키 = `getKstDateString(row.created_at)`(day) / `kstWeekStart(그 일자)`(week) / `.slice(0, 7)`(month). `range.dates`로 0 채움 후 누적. payments의 `paid_at`·`canceled_at`도 같은 키 함수로 각자의 일자를 버킷에 넣는다.

**플랫폼 추이(4.5)**: 위 두 쿼리에서 `store_id` 조건만 뺀 같은 함수를 호출한다(`storeId?: string`). 전체 매장 × 기간의 행을 읽지만 현재 규모(월 60건 안팎)에서는 문제가 없다. 예약이 월 수만 건 단위로 늘면 일 단위 기간 상한(예: 92일) 또는 DB 집계(raw SQL)를 재검토한다.

### 7.5 예약 목록

`reservations.count` + `findMany({ skip, take, orderBy: { created_at: 'desc' } })`(저장소 관례) → `toReservationResponse` 매핑. `where`는 `store_id` + 선택적 `status` + 선택적 `created_at` 범위 + 선택적 `search OR`.

### 7.6 인덱스 권고 (기능 블로커 아님, 1차 범위에서는 미적용)

현재 예약 규모(월 60건 안팎)에서는 인덱스 없이도 충분하다. 점주 앱 배포 후 예약이 늘어 느려질 때 아래를 적용한다.

- `reservations(store_id, created_at)` — 현재 `created_at` 관련 인덱스 없음(`idx_res_phone_created`는 선행 컬럼이 phone). 4.2/4.3/4.4(단일 매장 + `created_at` 범위)에 직접 적중. 4.1(전 매장 groupBy)은 리딩 컬럼 불일치로 풀스캔이지만 테이블 규모상 허용. 느리면 `(created_at)` 단일 인덱스 추가 검토.
- `payments`는 `(store_id, paid_at)`이 이미 있다. `canceled_at` 인덱스 없음 → 환불 쿼리 스캔(테이블 소규모, 허용).
- 적용 방식: 운영 DB 선반영(DB-first) 후 `prisma db pull`, 그리고 `prisma/migrations/<ts>_add_reservations_store_created_at_index/migration.sql` + `schema.prisma`에 `@@index([store_id, created_at], map: "idx_store_created")` 병행 기록. DBA 조율 필요. 인덱스 없이도 정확성은 동일하다.

```sql
-- prisma/migrations/<timestamp>_add_reservations_store_created_at_index/migration.sql
CREATE INDEX idx_store_created ON reservations (store_id, created_at);
```

### 7.7 성능 메모

- 4.1은 매장 전체를 메모리 정렬한다. 매장 수가 수천을 넘기면 `search` 없는 요청의 `IN` 생략 + 매장 10k 상한 경고 로그 정도로 충분. 캐시는 v1 미도입.
- 4.3·4.5는 `select` 최소 컬럼만 가져온다.

---

## 8. 테스트 기대치

저장소 관례(`createXxxService()` 팩토리 + 손으로 만든 Prisma mock, `as never`)를 따른다. `Test.createTestingModule`은 쓰지 않는다.

| 스펙 파일 | 검증 항목 |
|---|---|
| 인증 관련 스펙(`AdminAuthGuard`, `AdminAuthService`) | auth.md §10 참조 |
| `src/modules/admin/utils/store-ops-metrics.util.spec.ts` | `representativeReservationWhere` 형태 / `rate(0, 0) === null`, `rate(1, 3) === 33.3` / `coalesceStatus(null) === 'pending'` / 버킷 키 KST 경계(`2026-09-01T14:59:59Z → 2026-09-01`, `15:00:00Z → 2026-09-02`) / month 키 / `kstWeekStart`(`2026-09-02` 수 → `2026-08-31`, `2026-08-31` 월 → 자기 자신, `2026-09-06` 일 → `2026-08-31`, `2026-09-07` 월 → `2026-09-07`) |
| `src/modules/admin/services/admin-store-metrics.service.spec.ts` | groupBy 결과 머지 + 데이터 없는 매장 0/`null` 채움 / 불변식(`reservationCount` = 상태 합) / `sortBy` 각 키 + `null` 항상 마지막 / 2차 정렬 / 페이지 슬라이스·`total` / `search` → `business_name contains` + `store_id in` / `where`에 `payment_status: 'paid'`·`created_at` 범위·REP 조각 포함 / `meta.totals` 가중 재계산 / 요약 404 / `DATE_RANGE_TOO_LARGE` 전파 / `storeStatus` 기본 `closed` / `meta.activeStoreCount`(예약 0건 매장 제외, `total − active` = 예약 없는 매장 수) / `meta.localeBreakdown` 그룹 단위 집계·정렬(`count desc, locale asc`)·합계 = `totals.reservationCount`·예약 없으면 `[]` |
| `src/modules/admin/services/admin-store-timeseries.service.spec.ts` | 범위 전체 0 채움(day/week/month) / 주 버킷 키 = 월요일, 양끝 부분 주 합산 / 대표 행만 카운트, 매출은 전 행 / payments `paid_at`·`canceled_at` 분리 집계 / 404(매장별) / **플랫폼 추이**: `storeId` 없이 전 매장 합산, `where`에 `store_id` 조건 없음, 버킷 합계가 `reservationCount`·`reservationRevenue` 총합과 일치, 필터 쿼리 키는 거부 |
| `src/modules/admin/services/admin-store-reservations.service.spec.ts` | `status`/`from,to`(`created_at`)/`search` where 조합 / 범위 미지정 시 `created_at` 필터 없음 / `toReservationResponse` 사용 / `page, limit, total` / 404 |
| (선택) `test/admin-stores.e2e-spec.ts` | Bearer 없이 401, 로그인 후 발급 토큰으로 200. 기존 e2e가 DB 연결을 요구하면 보류 |

---

## 9. 병렬 작업 단위 (PR 분할 제안)

| 순서 | PR | 내용 | 의존 |
|---|---|---|---|
| 1 | PR-1 관리자 인증·계정(F-019) | `admins`·`admin_refresh_tokens` 마이그레이션, `admin-auth` 모듈(login/refresh/logout/me/password + `AdminAuthGuard`), CLI, `JWT_ADMIN_*` 환경변수, feedbacks 이관·정적 토큰 제거. 상세 auth.md §9 | 운영 DB 선반영 필요(선행) |
| 2 | PR-2 뼈대 | `AdminModule`, `admin-stores.controller`(라우트 5개 골격, `timeseries` 정적 경로 먼저 선언), DTO 전부, `store-ops-metrics.util` + spec, `admin-store.service`(404·storeStatus) | PR-1(가드 의존) |
| 3a | PR-3 목록/요약 | `admin-store-metrics.service` + spec, 4.1·4.2 연결 | PR-2 |
| 3b | PR-4 추이 | `admin-store-timeseries.service` + spec, 4.3(매장)·4.5(플랫폼) 연결, `kstWeekStart` util | PR-2 (3a와 병렬) |
| 3c | PR-5 예약 목록 | `admin-store-reservations.service` + spec, 4.4 연결 | PR-2 (3a·3b와 병렬) |
| 4 | PR-6 인덱스 | 7.6 마이그레이션 SQL + `schema.prisma` | DBA 조율 후 별도. **1차 범위에서는 보류**(예약 증가 후) |
| 마감 | PRD 상태 확정 | `docs/README.md` §2 F-018·F-019 `구현예정` → `구현완료`, §1.3·F-014·§4.3·§4.4의 "구현 시 적용"/"현재는 정적 토큰" 문구 정리 | PR-1~5 머지 후 |
