# PRD — lit-server-nest (Life Is Travel 짐 보관 예약 플랫폼 백엔드)

> 문서 유형: **현행(as-is) 구현 PRD** · 독자: 개발팀/QA(기술 명세 + 회귀 검증 기준)
> 기준 코드: branch `feat/multi-type-reservation` (커밋 `e05d32e`)
> 관점: 이미 구현된 동작을 기준으로 작성한다. **Must = 구현 완료 기능**, **수용 기준 = 현재
> 실제 동작(QA 회귀 테스트 기준)**, **이번 버전 제외 범위 = DB·스키마만 존재하고 로직이 없는 영역**.
> 성공 지표의 목표 수치는 `(제안/TBD)`로 표기 — 코드에 없는 제안값임을 의미한다.

`lit-server-nest`는 Express 기반 레거시에서 NestJS로 이관 중인 **여행객 대상 짐 보관(수하물 보관)
예약 SaaS**의 백엔드 API다. 예약·매장·보관함·쿠폰·대시보드 도메인이 동작하며, 결제·알림톡·정산은
DB 스키마만 존재한다. 이 PRD는 현재 구현을 정확히 문서화하여 온보딩·QA·로드맵의 공통 기준을 제공한다.

---

## 1. 프로덕트 개요 (목표, 성공 지표)

### 1.1 한 줄 정의
점주(보관소 운영자)가 짐 보관 슬롯을 등록·운영하고, 고객/비회원이 시간/타입 단위로 짐 보관을
예약·결제·수령하는 **멀티테넌트 예약 플랫폼**.

### 1.2 목표 / 핵심 가치
- **진입 장벽 최소화**: 비회원도 전화번호만으로 예약·조회·취소 가능.
- **멀티타입 동시 예약**: 한 번에 여러 보관 타입(소/중/대 등)을 한 요청으로 예약.
- **점주 실시간 운영**: 예약 승인·체크인·대시보드로 매장 운영을 한 화면에서 처리.
- **클라이언트 호환**: 웹(점주 콘솔) + Flutter 모바일 앱(레거시 snake_case 필드 호환 유지).

### 1.3 사용자(액터)

| 액터 | 인증 | 핵심 권한 |
|------|------|-----------|
| **점주(Store)** | JWT(이메일+비밀번호, 이메일 인증코드) | 매장/보관함/설정/PIN, 예약 승인·거절·체크인, 쿠폰 정책, 대시보드 |
| **로그인 고객(Customer)** | JWT(소셜: kakao 구현, naver/apple 스키마만) | 예약 생성·조회·체크아웃, 쿠폰 신청·사용, 프로필/알림 설정 |
| **비회원(Guest)** | 무인증 + 전화번호/토큰 검증, Throttle | 예약 생성·조회·취소, 쿠폰 조회·사용 |
| **관리자(Admin)** | 관리자 JWT(이메일+비밀번호, 가입 API 없음·CLI로 생성, F-019 구현 예정. 현재는 `X-Admin-Token` 정적 토큰) | 피드백 조회·응답(F-014), 매장 운영 현황 조회(F-018, 구현 예정) |

### 1.4 성공 지표 (제안)

> 아래 목표값은 모두 제안/TBD이며, 사업팀과 합의 후 확정한다. `daily_statistics` 테이블은 코드에서 읽거나
> 쓰지 않으므로 측정 출처가 아니다. 측정 출처가 `reservations` 집계(F-018)인 항목은 관리자 매장 운영 현황
> API로 산출 가능하고, 그 외는 별도 계측이 필요하다.

| 지표 | 정의 | 목표값(제안/TBD) | 측정 출처 |
|------|------|------------------|-----------|
| 비회원→예약 완료 전환율 | 예약 생성 시도 대비 결제·확정 완료 비율 | ≥ 60% (TBD) | 예약 로그/`reservations` |
| 예약 완료율 | `completedCount` / `reservationCount`(그룹 단위, F-018 `completionRate`) | ≥ 85% (TBD) | `reservations` 집계(F-018) |
| 평균 점주 승인 소요시간 | `pending`→`confirmed` 평균 경과시간 | ≤ 10분 (TBD) | `reservations` 타임스탬프 |
| 매장당 일 예약 수 | 활성 매장 1곳의 일 평균 예약 건수 | ≥ 5건 (TBD) | `reservations` 집계(F-018 `timeseries`) |
| 보관함 점유율 | 활성 보관함 대비 사용 중 비율 | ≥ 40% (TBD) | `storages.status` 집계(F-012) |
| 멀티타입 예약 비중 | 2개 이상 타입 그룹 예약 / 전체 예약 그룹 | ≥ 15% (TBD) | `reservation_group_id` 집계 |
| 예약 취소율 | (`cancelledCount`+`rejectedCount`) / `reservationCount`(F-018 `cancellationRate`) | ≤ 10% (TBD) | `reservations` 집계(F-018) |
| 노쇼율 | `noShowCount` / (`completedCount`+`noShowCount`)(F-018 `noShowRate`) | ≤ 5% (TBD) | `reservations` 집계(F-018) |

---

## 2. 기능 목록 (MoSCoW)

ID는 `F-001`부터 부여. `F-018`·`F-019`를 제외한 기능은 모두 **구현 완료** 상태다(두 기능은 PRD 선행 작성 후
구현 예정, 미구현 로드맵은 §5 참조).
MoSCoW 우선순위는 제품 핵심성을 기준으로 한 분류다.

| ID | 기능명 | 도메인 / 경로 | MoSCoW | 상태 |
|----|--------|---------------|--------|------|
| F-001 | 점주 인증 | `api/auth` | Must | 구현완료 |
| F-002 | 고객 소셜 인증 | `api/customer/auth` | Must | 구현완료 |
| F-003 | 매장 프로필·영업상태·설정·PIN | `api/store` | Must | 구현완료 |
| F-004 | 보관함 관리 | `api/storages` | Must | 구현완료 |
| F-005 | 고객용 매장 조회·검색 | `api/customer/stores` | Must | 구현완료 |
| F-006 | 비회원 예약 | `api/guest/reservations` | Must | 구현완료 |
| F-007 | 고객 예약 | `api/customer/reservations` | Must | 구현완료 |
| F-008 | 점주 예약 운영(승인/거절/체크인/상태) | `api/reservations` | Must | 구현완료 |
| F-009 | 멀티타입 예약(그룹 분리 + `reservation_group_id`) | 예약 전 도메인 | Must | 구현완료(최신 `e05d32e`) |
| F-010 | 예약 가격 계산(누진·06:00 KST 경계) | `reservation-pricing` | Must | 구현완료 |
| F-011 | 쿠폰 정책·발급·사용 | `*/coupons` | Should | 구현완료 |
| F-012 | 운영 대시보드 | `api/dashboard` | Should | 구현완료 |
| F-013 | 주소 검색/지오코딩 | `api/addresses` | Should | 구현완료 |
| F-014 | 피드백 | `*/feedbacks` | Could | 구현완료 |
| F-015 | 헬스체크 | `health` | Could | 구현완료 |
| F-016 | QR 토큰 기반 체크인/체크아웃 | `api/reservations` | Must | 구현완료(비활성) |
| F-017 | 노쇼 처리 | `api/reservations`, `api/owner-actions` | Must | 구현완료(PR #90) |
| F-018 | 관리자 매장 운영 현황 조회 | `api/admin/stores` | Should | 구현예정(F-019 선행) |
| F-019 | 관리자 인증·계정 | `api/admin/auth` | Must | 구현예정 |

---

## 3. 기능별 유저 스토리 + 수용 기준

> 수용 기준은 모두 `✅` 형식의 QA 검증 문장이다. 각 문장은 통과/실패를 단독으로 판정할 수 있어야 한다.

### F-001 점주 인증 (`api/auth`)
**유저 스토리**: 점주로서 매장을 운영하기 위해 이메일로 가입·로그인하고 토큰을 발급받는다.

- ✅ 인증코드 발송 요청은 1분에 1회로 제한된다(초과 시 거절).
- ✅ 인증코드는 6자리, 유효기간 180초이며 최대 5회 검증 시도 후 만료된다.
- ✅ 이메일 인증을 통과해야만 `register`로 점주 계정을 생성할 수 있다.
- ✅ 로그인 성공 시 access 토큰(1시간)과 refresh 토큰(30일)을 발급한다.
- ✅ 점주 토큰 페이로드는 `{ storeId, email, type }`를 포함한다.
- ✅ 인증 API는 15분 동안 5회를 초과하면 레이트리밋으로 차단된다(`AUTH_RATE_LIMIT_*`).
- ✅ 비밀번호는 평문이 아닌 bcryptjs 해시로 저장된다.
- ✅ 인증된 점주는 `PATCH /api/auth/password`로 현재 비밀번호를 확인받은 뒤 새 비밀번호(최소 8자)로 변경할 수 있다. 현재 비밀번호가 일치하지 않으면 거절된다.
- ✅ 비밀번호 변경에 성공하면 해당 점주의 기존 refresh 토큰(세션)은 모두 무효화된다.
- ✅ 로그인(`login`)에 성공하면 매장의 `last_login_at`이 현재 시각으로 갱신되고, 실패 카운트(`login_count`)와 잠금(`login_locked_until`)이 초기화된다.
- ✅ 로그인 비밀번호를 5회 연속 틀리면 계정이 10분간 잠기고(`login_count`/`login_locked_until`), 잠금 해제 시각 전까지는 비밀번호가 맞아도 로그인이 거부된다(PIN 잠금과 동일 정책).

### F-002 고객 소셜 인증 (`api/customer/auth`)
**유저 스토리**: 고객으로서 빠르게 시작하기 위해 카카오 소셜 로그인으로 가입·로그인한다.

- ✅ `social-login` 시 kakao 토큰을 검증하고, 최초 로그인이면 계정을 자동 생성한다.
- ✅ 탈퇴한 사용자가 동일 소셜로 재로그인하면 재가입이 가능하다.
- ✅ `signup`으로 추가 정보를 입력하면 프로필에 반영된다.
- ✅ 고객 토큰 페이로드는 `{ customerId, role: 'customer', provider?, type }`를 포함한다.
- ✅ `me` 조회·수정, `notification-settings` 조회·수정이 인증 고객에 한해 동작한다.
- ✅ `withdraw` 호출 시 계정이 탈퇴 처리된다.
- ✅ 소셜 로그인 API는 분당 10회를 초과하면 차단된다.
- ✅ naver/apple은 스키마만 존재하며 실제 로그인은 동작하지 않는다.

### F-003 매장 프로필·영업상태·설정·PIN (`api/store`, 점주)
**유저 스토리**: 점주로서 매장을 노출·운영하기 위해 프로필·영업상태·요금/수용량 설정·PIN을 관리한다.

- ✅ 프로필 조회/수정, 영업 상태(open/close/status) 조회/수정이 동작한다.
- ✅ 설정(`settings`)에 보관함 타입별 요금/수용량/활성화 플래그와 알림 on/off 플래그가 포함된다.
- ✅ 전화번호는 `phone_number`(점주 개인) / `store_phone_number`(고객 노출) / `notification_phone`(알림톡 수신) 3종으로 분리 저장된다.
- ✅ 고객 노출 API에는 `store_phone_number`만 노출되며 점주 개인 `phone_number`는 노출되지 않는다.
- ✅ PIN 설정·검증이 동작하고, PIN 검증은 분당 5회로 제한된다.
- ✅ PIN 검증을 5회 연속 실패하면 잠금되고(`store_pin_failed_count`/`store_pin_locked_until`), 잠금 해제 시각까지 검증이 거부된다.

### F-004 보관함 관리 (`api/storages`, 점주)
**유저 스토리**: 점주로서 재고를 관리하기 위해 보관함을 등록·조회·수정·폐기한다.

- ✅ 목록은 `type`/`status` 필터로 조회된다.
- ✅ 보관함 타입은 `s/m/l/xl/special/refrigeration` 중 하나만 허용된다.
- ✅ 보관함 상태는 `available/occupied/maintenance` 중 하나다.
- ✅ `(store_id, number)` 조합은 유니크하며 중복 등록 시 거부된다.
- ✅ 삭제 요청은 물리 삭제가 아니라 `maintenance` 상태 전환으로 처리된다.

### F-005 고객용 매장 조회·검색 (`api/customer/stores`)
**유저 스토리**: 고객으로서 근처 보관소를 찾기 위해 키워드/위치로 매장을 검색하고 상세를 본다.

- ✅ 목록은 키워드 검색과 위치 검색(`lat`/`lng`/`range`)을 지원한다.
- ✅ 노출 필드는 고객 안전 정보로 축약되며 `store_phone_number`만 포함하고 점주 `phone_number`는 포함하지 않는다.
- ✅ 상세 조회가 동작한다.

### F-006 비회원 예약 (`api/guest/reservations`)
**유저 스토리**: 비회원으로서 가입 없이 예약하기 위해 전화번호로 예약을 생성·조회·취소한다.

- ✅ 예약 생성은 단일 타입과 멀티타입(F-009) 입력을 모두 지원한다.
- ✅ 예약 생성 시 그룹의 각 타입 행은 즉시 자동 승인되어 `confirmed`로 전환되고 보관함이 할당된다. 특정 타입에 가용 보관함이 없으면 해당 행만 `pending`으로 남는다.
- ✅ `availability`는 시간대별·타입별 가용 수량을 반환한다.
- ✅ 목록은 `?phoneNumber=`로, 상세는 `?token=`(접근 토큰)으로 조회된다.
- ✅ `/:id/cancel` 취소는 전화번호 검증을 통과해야 동작한다.
- ✅ `cleanup`은 미결제 상태로 30분(TTL) 경과한 비회원 예약을 정리한다. 자동 승인되어 `confirmed`가 된 미결제 예약도 대상이며, 취소 시 점유 중이던 보관함을 반납한다.
- ✅ 비회원 예약 API는 기본 분당 10회, cleanup 3회, availability/상세 30회로 제한된다.

### F-007 고객 예약 (`api/customer/reservations`)
**유저 스토리**: 로그인 고객으로서 내 예약을 관리하기 위해 예약을 생성·조회·체크아웃한다.

- ✅ 예약 생성, 목록(페이지네이션), 상세 조회가 인증 고객에 한해 동작한다.
- ✅ 예약 생성 시 별도 점주 승인 없이 즉시 자동 승인되어 `confirmed`로 생성되고 보관함이 할당된다. 단, 해당 시간대에 가용 보관함이 없으면 예약은 `pending`으로 남고 생성 자체는 성공한다(이후 점주가 수동 `/approve` 가능).
- ✅ `/:id/checkout`으로 짐 수령(체크아웃) 처리를 한다.
- ✅ 각 예약 행에는 `groupId`가 포함된다(멀티타입은 N건 개별 노출).

### F-008 점주 예약 운영 (`api/reservations`, 점주)
**유저 스토리**: 점주로서 예약을 처리하기 위해 승인·거절·취소·상태변경·체크인을 한다.

- ✅ 목록은 `status`/`date` 필터로 조회된다.
- ✅ 점주가 생성한 예약(`POST /api/reservations`)은 생성 즉시 자동 승인되어 `confirmed`로 생성되고 보관함이 할당된다. 가용 보관함이 없으면 `pending`으로 남고 생성은 성공한다.
- ✅ `/approve` 승인 시 보관함이 할당된다. 자동 승인되지 못하고 `pending`으로 남은 예약을 점주가 수동 승인하는 용도로도 사용된다.
- ✅ `/reject` 거절, `/cancel` 취소, `/status` 상태 수정이 동작한다.
- ✅ `/checkin` 체크인 시 짐 사진 업로드가 가능하다.
- ✅ 예약 상태는 `pending → confirmed → in_progress → completed`로 전이하며, 분기 상태는 `rejected`(점주 거절)·`cancelled`(취소)·`no_show`(노쇼: `pending/pending_approval/confirmed`에서 보관 시작 시각 경과 후에만 전이, 상세는 F-017)다.
- ✅ 결제 상태는 `pending / paid / refunded` 중 하나다.
- ✅ `pending_approval` 상태는 호환용으로만 존재하며 실제 흐름에서 생성되지 않는다. 단, 노쇼 전이(F-017)의 선행 상태로는 허용된다.

### F-009 멀티타입 예약 (그룹 분리 + `reservation_group_id`)
**유저 스토리**: 손님으로서 한 번에 여러 보관 타입을 맡기기 위해 한 요청으로 여러 타입을 예약한다.

- ✅ 입력은 단일(`storageType`+`bagCount`) 또는 멀티(`items: [{ storageType, bagCount }]`)를 지원하며, `items` 제공 시 단일 필드는 무시된다.
- ✅ 멀티타입 요청 시 타입별로 `reservations` 행이 분리 생성되고 동일 `reservation_group_id`로 묶인다.
- ✅ 대표 예약은 `id === reservation_group_id`이며, 멤버 예약의 `reservation_group_id`는 대표를 가리킨다.
- ✅ 기존 `reservation_group_id`가 NULL인 행은 자기 자신이 대표인 1건 그룹으로 간주된다.
- ✅ 한 타입이라도 수용량이 부족하면 전체 예약이 CONFLICT로 실패한다(부분 생성 없음, 원자성).
- ✅ 결제는 그룹당 1건이며 대표 예약에만 `payment_id`가 연결되고 멤버는 NULL이다.
- ✅ 비회원 목록·상세는 그룹을 1건으로 머지하여 `groupId`, 합산 `totalAmount`/`bagCount`, `items[]`로 노출한다.
- ✅ 점주·고객 API는 그룹 멤버를 N건 개별 노출하되 각 행에 `groupId`를 포함한다.
- ✅ 접근 토큰(`qr_code`)과 생성 알림 이메일은 그룹이 공유한다.
- ✅ 취소는 그룹 전체 일괄 취소만 허용되며(부분 취소 불가) 응답에 `cancelledCount`를 반환한다.

### F-010 예약 가격 계산 (`reservation-pricing.service`)
**유저 스토리**: 시스템으로서 정확히 과금하기 위해 누진 모델로 타입별 금액을 합산한다.

- ✅ 가격은 일수 기반 누진 모델로 KST 기준 계산된다.
- ✅ 과금 기준일 경계는 자정이 아니라 오전 06:00 KST이며, 심야 마감 매장이 자정을 넘겨도 같은 영업일 요금으로 계산된다.
- ✅ 멀티타입 예약의 총액은 각 타입 금액의 합산이다.

### F-011 쿠폰 정책·발급·사용 (`api/store/coupons/policies`, `api/customer/coupons`, `api/guest/coupons`)
**유저 스토리**: 점주로서 재방문을 유도하기 위해 쿠폰 정책을 만들고, 고객/비회원이 쿠폰을 신청·사용한다.

- ✅ 정책 유형은 `payment_discount`(결제 할인)와 `store_benefit`(매장 특전)을 지원한다.
- ✅ 자동 발급 트리거는 `manual_claim`/`signup`/`checkin_completed`를 지원한다.
- ✅ 쿠폰 유효기간 기본값은 7일이다.
- ✅ 점주는 정책 CRUD를 수행한다.
- ✅ 고객은 신청(`claim`), 목록/통계/상세, 사용(`redeem`, storePin 필요)과 Express 호환 `use`를 수행한다.
- ✅ 비회원은 전화번호 기반으로 쿠폰을 조회·사용한다.

### F-012 운영 대시보드 (`api/dashboard`, 점주)
**유저 스토리**: 점주로서 운영 현황을 파악하기 위해 요약·기간 통계·실시간 수치를 본다.

- ✅ `summary`(Express 호환), `stats`(`period=daily|weekly|monthly|yearly`, 기본 `monthly`), `realtime`(오늘 수치)가 조회된다.
- ✅ 집계는 `reservations`·`storages`·`reviews`를 실시간으로 집계한다. 매출은 `payment_status = paid`인 예약 행의 `total_amount` 합(`created_at` 기준, 예약 `status` 무관)이고, 예약 건수는 상태별 **행** 수(멀티타입은 타입별 행이 각각 1건)다.
- ✅ `daily_statistics` 테이블은 읽기·쓰기 모두 하지 않는다.
- ✅ `stats`의 `reservations.total`에는 `no_show` 행이 포함되지만 별도 필드로 노출되지는 않는다(노쇼 수치는 F-018에서 제공).

### F-013 주소 검색/지오코딩 (`api/addresses`)
**유저 스토리**: 사용자로서 매장 위치를 입력하기 위해 주소를 검색하고 좌표를 얻는다.

- ✅ VWorld API(`VWORLD_API_KEY`) 기반으로 주소 검색/지오코딩이 동작한다.

### F-014 피드백 (`api/feedbacks`, `api/customer/feedbacks`, `api/admin/feedbacks`)
**유저 스토리**: 사용자로서 의견을 전달하고, 관리자로서 피드백에 응답한다.

- ✅ 카테고리는 `feature/issue/praise/other`, 상태는 `reviewing/inProgress/shipped/rejected`다.
- ✅ 익명 IP는 `FEEDBACK_IP_HASH_SECRET`로 해시되어 저장된다(평문 미저장).
- ✅ 관리자 피드백 조회·응답은 현재 `X-Admin-Token`(`ADMIN_FEEDBACK_TOKEN`) 정적 토큰으로 보호된다.
- ✅ F-019 구현 시 정적 토큰·`ADMIN_FEEDBACK_TOKEN`·`AdminFeedbackTokenGuard`는 제거되고, 관리자 JWT(`AdminAuthGuard`)로만 동작한다.

### F-015 헬스체크 (`health`)
**유저 스토리**: 운영자로서 서비스 가용성을 확인하기 위해 헬스 엔드포인트를 호출한다.

- ✅ `GET /health`는 DB 연결 상태를 포함한 점검 결과를 반환한다.

### F-016 QR 토큰 기반 체크인/체크아웃 (`api/reservations`, 점주)
**유저 스토리**: 점주로서 고객의 QR 코드를 스캔하여 빠르게 체크인·체크아웃을 처리한다.

> ⚠️ **현재 비활성**: 매장 앱(lit-store) 미배포로 컨트롤러 엔드포인트가 주석 처리되어 있음. 앱 배포 시 주석 해제로 즉시 활성화 가능.

- ✅ QR 이미지는 앱 프론트엔드에서 생성하며, 예약의 `qr_code` 필드값(토큰)을 인코딩한다.
- ✅ `POST /checkin-by-token` — 토큰으로 예약 조회 후 `in_progress`로 전이한다. 짐 사진(`photoUrls[]`)을 함께 업로드할 수 있다.
- ✅ 체크인 성공 시 `checkin_completed` 트리거 쿠폰 자동 발급이 실행되며, 발급 실패는 체크인을 롤백하지 않는다.
- ✅ `POST /checkout-by-token` — 토큰으로 예약 조회 후 `completed`로 전이하고 보관함을 해제한다.
- ✅ 체크아웃 응답에는 고객의 미사용 쿠폰 존재 여부(`hasUnusedCoupon`)가 포함된다.
- ✅ 토큰 미제공 → 401, 해당 매장에서 예약 미발견 → 404.

### F-017 노쇼 처리 (`api/reservations`, `api/owner-actions`, 점주)
**유저 스토리**: 점주로서 오지 않은 손님의 예약을 정리하기 위해 예약을 노쇼 처리한다.

- ✅ 진입점은 `PUT /api/reservations/:id/no-show`(점주 JWT, 매장 소유권 검증)와 `POST /api/owner-actions/reservations/:id/no-show`(알림톡 점주 링크, HMAC 토큰 `?t=`) 두 개이며, 두 경로는 동일한 `ReservationNoShowService`를 공유한다.
- ✅ `pending`·`pending_approval`·`confirmed` 상태에서만 전이되며 그 외 상태 → 409 `INVALID_TRANSITION`.
- ✅ 대표 예약의 `start_time`이 아직 지나지 않았으면 → 409 `TOO_EARLY_FOR_NO_SHOW`.
- ✅ 그룹 멤버 전체가 한 트랜잭션에서 일괄 `no_show`로 전이되고(compare-and-swap, 경합으로 일부만 갱신되면 전체 거부), 각 멤버의 보관함은 `available`로 반납된다.
- ✅ 응답은 점주 API `{ id, status }`, owner-actions `{ id, status, updatedCount }`다.
- ✅ `no_show`는 종결 상태이며 `payment_status`는 변경하지 않는다. 별도 노쇼 시각 컬럼은 없고 `updated_at`만 갱신된다.
- ✅ 점주 JWT 경로에서 다른 매장의 예약을 지정하면 → 404 `RESERVATION_NOT_FOUND`.
- ✅ owner-actions 요약의 `canMarkNoShow`는 위 전이 허용 조건(허용 상태 + `start_time` 경과)과 같은 규칙으로 계산된다.

### F-018 관리자 매장 운영 현황 조회 (`api/admin/stores`, 관리자)
**유저 스토리**: 플랫폼 관리자로서 매장별 운영 상태를 파악하기 위해 기간별 매출·예약·노쇼 지표를 매장 단위로 조회한다.

> 📄 **API 명세**(요청/응답 JSON, 지표 SQL 술어, 구현 가이드, 병렬 작업 단위): [`docs/api/admin/store-operations.md`](api/admin/store-operations.md)
> 상태: **구현 예정** — 아래 수용 기준은 최종 동작 명세이며, 구현·검증 완료 후 §2 상태를 `구현완료`로 확정한다. 인증은 F-019(관리자 인증·계정)에 의존하므로 F-019가 선행된다.

**인증·공통**
- ✅ 모든 엔드포인트는 `Authorization: Bearer <관리자 access 토큰>`을 `AdminAuthGuard`(F-019)로 검증한다. 헤더 누락 → 401 `AUTHENTICATION_REQUIRED`, 토큰 불량·만료 → 401 `TOKEN_INVALID`, 관리자 미존재 → 401 `ADMIN_NOT_FOUND`, 비활성 관리자 → 401 `ADMIN_INACTIVE`. 점주·고객 토큰은 시크릿이 달라 거부된다.
- ✅ 관리자 API(`api/admin/*`)는 IP당 60 req/min으로 제한되며 초과 시 429 `RATE_LIMIT_EXCEEDED`.
- ✅ 기간은 `from`/`to`(`YYYY-MM-DD`, KST 일자)이고 기본값은 `to`=오늘, `from`=`to`−29일(30일 창). `from > to` → 400 `INVALID_DATE_RANGE`, 366일 초과 → 400 `DATE_RANGE_TOO_LARGE`, 달력에 없는 날짜 → 400 `INVALID_DATE`, 형식 불량 → 400 `VALIDATION_ERROR`(기존 `getKstDateRange` 재사용).
- ✅ 존재하지 않는 `storeId` → 404 `STORE_NOT_FOUND`.

**엔드포인트**
- ✅ `GET /api/admin/stores` — 매장별 지표 목록. 쿼리 `search`(`business_name` 부분일치, ≤100자)·`hasCompletedSetup`(`true|false`)·`sortBy`·`sortOrder`(기본 `desc`)·`page`(기본 1)·`limit`(기본 20, 최대 100). 응답은 `{ items: [{ storeId, businessName, email, businessType, hasCompletedSetup, storeStatus, createdAt, lastLoginAt, metrics }], page, limit, total, meta: { range: { from, to }, totals } }`다.
- ✅ 기간 내 예약이 0건인 매장도 목록에 포함되며 지표는 0, 비율은 `null`이다.
- ✅ `sortBy`는 `reservationRevenue`(기본)·`paymentRevenue`·`reservationCount`·`noShowCount`·`noShowRate`·`cancellationRate`·`completionRate`·`businessName`·`createdAt`를 지원한다. 비율 `null`은 정렬 방향과 무관하게 항상 마지막이고, 동률은 `businessName asc, storeId asc`로 고정된다.
- ✅ `meta.totals`는 필터(`search`/`hasCompletedSetup`) 적용 후 **전체 매장**의 합계이며(현재 페이지 합이 아님) 비율은 합산 분자/분모로 재계산한다.
- ✅ `storeStatus`는 `store_status` 테이블의 최신 행(`updated_at desc`) 값이며 행이 없으면 `closed`다.
- ✅ `GET /api/admin/stores/:storeId/summary` — 매장 정보(`businessName, email, businessType, businessNumber, representativeName, address, phoneNumber, storePhoneNumber, hasCompletedSetup, storeStatus, createdAt, lastLoginAt`)와 기간 `metrics`를 반환한다. 목록과 동일한 집계 함수를 호출하므로 같은 기간의 두 응답 수치는 항상 일치한다.
- ✅ `GET /api/admin/stores/:storeId/timeseries?granularity=day|month`(기본 `day`) — 기간 내 모든 버킷을 0으로 채워 반환한다. 버킷 필드는 `date`(`YYYY-MM-DD` 또는 `YYYY-MM`), `reservationRevenue`, `paymentRevenue`, `refundedAmount`, `reservationCount`, `completedCount`, `cancelledCount`, `rejectedCount`, `noShowCount`이며 비율은 포함하지 않는다. 양끝 월은 기간에 포함된 일자만 합산한 부분 월일 수 있다.
- ✅ `GET /api/admin/stores/:storeId/reservations` — `status`(`no_show`를 포함한 enum 전체)·`from/to`(`created_at` 기준, 미지정 시 기간 필터 없음)·`search`(고객명/전화번호 부분일치 또는 예약 id 일치)·`page/limit`로 조회한다. 응답은 점주 예약 목록 `ReservationListResponseDto`와 동일 형태(그룹 멤버 N건 개별 노출 + `groupId`, `created_at desc`)다.

**지표 정의** (`metrics` 공통 객체, 목록·요약 동일)
- ✅ 모든 예약 지표는 **`created_at`(KST) 코호트**다. 3월에 생성돼 4월에 노쇼된 예약은 3월에 집계된다(F-012와 같은 기준).
- ✅ `reservationRevenue` = `payment_status = paid`인 예약 **행**의 `total_amount` 합(멀티타입은 멤버 행 합산 = 그룹 총액). 예약 `status`는 보지 않으므로 paid 후 취소·노쇼된 건도 포함된다(F-012 동일). 환불 구현 시 `payment_status = refunded`로 바뀐 행은 자동 제외된다.
- ✅ `paymentRevenue` = `payments.status ∈ {SUCCESS, CANCELED, REFUNDED}`이고 `paid_at`이 기간 내인 결제의 `amount_total` 합(총매출). `refundedAmount` = `payments.status ∈ {CANCELED, REFUNDED}`이고 `canceled_at`이 기간 내인 결제의 `amount_total` 합. `paymentCount`는 `paymentRevenue` 대상 결제 건수. 순매출은 클라이언트가 `paymentRevenue − refundedAmount`로 계산한다.
- ✅ 현장결제 예약은 `payments` 행이 없으므로 `paymentRevenue ≤ reservationRevenue`인 것이 정상이다.
- ✅ 예약 건수(`reservationCount`와 상태별 건수)는 **그룹 단위**다. 대표 행(`reservation_group_id IS NULL OR reservation_group_id = id`)만 세고, 그룹 상태는 대표 행의 `status`를 따른다(`NULL`은 `pending`으로 간주). F-012는 행 단위이므로 멀티타입 예약 건수는 두 화면이 다를 수 있다.
- ✅ 상태별 건수는 `pendingCount`(`pending`+`pending_approval`), `activeCount`(`confirmed`+`in_progress`), `completedCount`, `cancelledCount`, `rejectedCount`, `noShowCount`이며 불변식 `reservationCount = 여섯 값의 합`이 항상 성립한다.
- ✅ `noShowRate` = `noShowCount / (completedCount + noShowCount) × 100`, `completionRate` = `completedCount / reservationCount × 100`, `cancellationRate` = `(cancelledCount + rejectedCount) / reservationCount × 100`. 소수 1자리로 반올림하고 분모가 0이면 `null`이다.
- ✅ 정산 테이블(`settlement_*`)과 `daily_statistics`는 읽지 않는다.

> ⚠️ **한계(명시)**: 점주가 노쇼 처리하지 않은 미방문 예약은 자동 완료 크론(6시간 유예)에 의해 `completed`가 되어 `noShowRate`가 과소 집계될 수 있다. 부분 환불 금액 컬럼이 없어 `refundedAmount`는 결제 전액 기준이다. 이용일(`start_time`) 기준 보기는 v2 후보(`dateBasis` 파라미터)로 유보한다.

### F-019 관리자 인증·계정 (`api/admin/auth`, 관리자)
**유저 스토리**: 플랫폼 관리자로서 관리자 API를 안전하게 쓰기 위해 개인 계정으로 로그인해 토큰을 발급받고, 운영자는 관리자 계정을 발급·회수한다.

> 📄 **API 명세**(엔드포인트, 토큰 페이로드, 스키마·마이그레이션, CLI, 구현 가이드): [`docs/api/admin/auth.md`](api/admin/auth.md)
> 상태: **구현 예정** — F-018의 선행 기능이며, 구현·검증 완료 후 §2 상태를 `구현완료`로 확정한다.

**계정**
- ✅ 관리자 가입 API는 없다. 계정은 운영자가 서버에서 CLI(`npm run admin -- create --email <email> [--name <name>]`)로 생성하며, 비밀번호는 프롬프트(또는 `--password-stdin`)로 입력받아 bcryptjs 해시로 저장한다(최소 8자).
- ✅ 같은 CLI로 `deactivate`/`activate`/`reset-password`/`list`를 수행한다. `deactivate`는 `is_active = false`로 바꾸고 해당 관리자의 refresh 토큰을 모두 삭제한다.
- ✅ 저장소는 `admins`(이메일 유니크, `password_hash`, `name`, `is_active`, `login_count`, `login_locked_until`, `last_login_at`)와 `admin_refresh_tokens`(관리자별 refresh 토큰, 만료 시각) 두 테이블이며 마이그레이션 SQL과 함께 운영 DB에 선반영한다.

**로그인·토큰**
- ✅ `POST /api/admin/auth/login` — `{ email, password }` → `{ token, refreshToken, expiresIn, admin: { id, email, name, lastLoginAt } }`. access 토큰 1시간, refresh 토큰 30일(점주와 동일 `JWT_*_EXPIRES_IN`).
- ✅ 이메일 미존재 또는 비밀번호 불일치 → 401 `AUTHENTICATION_FAILED`(`details.remainingAttempts`). 5회 연속 실패 시 10분 잠금 → 401 `ACCOUNT_LOCKED`(`details.lockedUntil`). 로그인 성공 시 실패 카운트·잠금을 초기화하고 `last_login_at`을 갱신한다(F-001과 동일 정책).
- ✅ `is_active = false`인 관리자는 비밀번호가 맞아도 401 `ADMIN_INACTIVE`로 거부된다.
- ✅ 관리자 토큰 페이로드는 `{ adminId, email, role: 'admin', type }`이며 점주·고객 토큰과 **다른 시크릿**(`JWT_ADMIN_ACCESS_TOKEN_SECRET`, `JWT_ADMIN_REFRESH_TOKEN_SECRET`, 각 32자 이상 필수)으로 서명한다. 점주·고객 토큰으로는 관리자 API를 호출할 수 없고, 관리자 토큰으로는 점주·고객 API를 호출할 수 없다.
- ✅ `POST /api/admin/auth/refresh` — `{ refreshToken }` → `{ token, expiresIn }`. 서명 불량 → 401 `TOKEN_INVALID`, DB에 없음 → 401 `TOKEN_NOT_FOUND`, 만료 → 401 `TOKEN_EXPIRED`(해당 행 삭제), 관리자 비활성 → 401 `ADMIN_INACTIVE`.
- ✅ `POST /api/admin/auth/logout` — `{ refreshToken }`을 삭제한다. 미존재 → 404 `TOKEN_NOT_FOUND`.
- ✅ `GET /api/admin/auth/me` — access 토큰으로 본인 정보(`id, email, name, isActive, lastLoginAt, createdAt`)를 조회한다.
- ✅ `PATCH /api/admin/auth/password` — 현재 비밀번호 확인 후 새 비밀번호(최소 8자)로 변경하고, 본인의 refresh 토큰을 모두 삭제한다. 현재 비밀번호 불일치 → 401 `AUTHENTICATION_FAILED`.
- ✅ `AdminAuthGuard`는 매 요청 서명 검증 후 `admins` 행을 조회해 존재·활성 여부를 확인한다(고객 가드와 동일). Bearer 누락 → 401 `AUTHENTICATION_REQUIRED`, 토큰 불량·만료 → 401 `TOKEN_INVALID`, 관리자 없음 → 401 `ADMIN_NOT_FOUND`, 비활성 → 401 `ADMIN_INACTIVE`.
- ✅ `api/admin/auth/*`에는 점주 인증과 같은 레이트리밋(`AUTH_RATE_LIMIT_*`, 15분/5회, 이메일 또는 IP 기준)이 적용된다.
- ✅ 기존 `X-Admin-Token`·`ADMIN_FEEDBACK_TOKEN`·`AdminFeedbackTokenGuard`는 제거되며, 피드백 어드민 API(F-014)도 관리자 JWT로만 동작한다.

---

## 4. 비기능 요구사항 (NFR)

### 4.1 응답 포맷 (ApiResponseInterceptor)
- ✅ 성공 응답은 `{ success: true, data: {...}, timestamp }` 형태다.
- ✅ 실패 응답은 `{ success: false, error: { code, message, details }, timestamp }` 형태다.

### 4.2 입력 검증
- ✅ 모든 입력 DTO는 class-validator로 검증되며, `whitelist + forbidNonWhitelisted`로 미정의 필드는 거부된다.
- ✅ `transform`(암묵 변환)과 커스텀 `createValidationException`이 적용된다.

### 4.3 레이트리밋 (@nestjs/throttler)

| 대상 | 제한 |
|------|------|
| 점주 인증 API | 15분 / 5회 (`AUTH_RATE_LIMIT_*`) |
| 비회원 예약(기본) | 10 req/min |
| 비회원 예약 cleanup | 3 req/min |
| 비회원 availability/상세 | 30 req/min |
| PIN 검증 | 5 req/min |
| 소셜 로그인 | 10 req/min |
| 관리자 로그인·refresh(`api/admin/auth`) | 15분 / 5회 (`AUTH_RATE_LIMIT_*`, F-019 구현 시 적용) |
| 관리자 운영 API(`api/admin/stores`) | 60 req/min (IP, F-018 구현 시 적용) |

### 4.4 보안
- ✅ 비밀번호는 bcryptjs 해시로 저장된다.
- ✅ JWT는 Access 1시간 / Refresh 30일 만료다.
- ✅ 피드백 IP는 `FEEDBACK_IP_HASH_SECRET`로 해시 저장된다.
- ✅ 관리자 비밀번호는 bcryptjs 해시로 저장되고, 관리자 JWT는 점주·고객과 다른 시크릿(`JWT_ADMIN_*_SECRET`)으로 서명된다(F-019 구현 시 적용).

### 4.5 로깅
- ✅ pino 구조화 로그(`LOG_LEVEL`)로 주요 도메인 이벤트를 기록한다.

### 4.6 레거시 호환
- ✅ Flutter/Express 호환을 위해 일부 snake_case·옵션 필드를 유지한다(`common/transformers`).

### 4.7 스택 / 런타임 / 운영
- ✅ 스택: NestJS 11 · TypeScript 5.7 · Prisma 7(MariaDB/MySQL 어댑터) · JWT · class-validator/Joi · Swagger · nestjs-pino · @nestjs/throttler · nodemailer · bcryptjs, Node 22.
- ✅ 계층: Controller(라우팅/검증) → Service(Query/Command 분리) → PrismaService(전역) → MySQL.
- ✅ 전역 prefix는 없으며 경로 prefix(`api/...`)는 각 컨트롤러 데코레이터에서 직접 선언한다.
- ✅ CORS(`CORS_ORIGIN`, credentials), Swagger(`SWAGGER_ENABLED`), 기본 포트 4000.
- ✅ 모듈 11개(`src/app.module.ts`): addresses, auth, customer-auth, customer-stores, coupons, dashboard, feedbacks, health, stores, storages, reservations.
- ✅ DB 스키마는 DB 우선 → `prisma db pull` 동기화로 관리하며, 변경 SQL은 `prisma/migrations/`에 병행 기록한다. 프로덕션 변경 시 영향도/롤백 계획을 필수로 한다.

---

## 5. 이번 버전 제외 범위 (Won't this version)

아래는 DB·스키마(또는 일부 DTO)가 존재하지만 **로직이 구현되지 않은 영역**으로, 이번 버전에서 제외한다.

| 제외 항목 | 사유 / 현재 상태 | 관련 테이블·자원 |
|-----------|------------------|------------------|
| 결제(PG/Toss) 연동 | 스키마만 존재, 로직 없음. (예약 생성→결제링크→웹훅→`payment_status=paid` 흐름 미구현) | `payments`, `payment_webhooks` |
| 알림톡/SMS 발송 | 설정 플래그·수신번호만 존재, 발송 로직 없음 | `notifications`, `stores.notification_phone` |
| 정산(Settlement) | 스키마만 존재(수수료 기본 0.2), 생성·지급 로직 없음. F-018 운영 현황 API도 정산 테이블을 읽지 않음 | `settlement_statements`, `store_settlement_accounts`, `settlement_items/logs/errors` |
| 웹푸시 리마인더 | 구독 스키마만 존재, 발송 로직 없음 | `push_subscriptions.sent_reminder_at` |
| 리뷰·고객센터 노출 | 스키마만 존재, 노출/응답 로직 없음 | `reviews`, `support_tickets/messages` |
| 관리자 쓰기 작업 | 매장 정지·강제 상태 변경·정산 지급 등 관리자 변경 작업. 조회는 F-018, 인증·계정은 F-019로 이동. 관리자 계정 관리 API(초대·비활성화)는 CLI로 대체하고 API는 두지 않음 | (운영 기능 전반) |
| Naver/Apple 소셜 로그인 | enum/스키마만 존재, 검증 로직 없음(kakao만 구현) | `customer_auth_providers` |

---

## 부록: PRD 정확성 검증 방법

이 PRD는 코드 기반 현행 문서이므로 다음으로 정확성을 검증한다.

- **엔드포인트**: 각 `src/modules/**/*.controller.ts`의 `@Controller`/메서드 데코레이터와 §2~§3 경로 대조.
- **데이터 모델·enum**: `prisma/schema.prisma`의 enum/필드와 본문 규칙 대조.
- **동작 규칙**: 멀티타입은 `reservations/services/guest-reservation.service.ts`·`mappers/guest-reservation.mapper.ts`, 가격은 `reservations/pricing/reservation-pricing.service.ts`로 교차 확인.
- **빌드/실행**: `npm run build`, `npm run start:dev`, Swagger(`/docs`)로 실제 노출 스펙 대조. `npm test`로 도메인 규칙 회귀 확인.
