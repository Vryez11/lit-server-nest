# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 따라야 할 가이드다.

## ⚠️ 최우선 규칙: PRD 동기화

**기능을 구현하거나 수정하면 반드시 `docs/README.md`(PRD)를 같은 작업 안에서 함께 갱신한다.**

- `docs/README.md`는 코드 기반 **현행(as-is) 구현 PRD**다. 코드의 실제 동작이 곧 명세이며, 둘은 항상 일치해야 한다.
- 코드 변경 시 함께 갱신할 항목(해당되는 것 모두):
  - **§2 기능 목록(MoSCoW)**: 기능 추가/삭제 시 `F-xxx` 행과 상태 갱신.
  - **§3 기능별 유저 스토리 + 수용 기준**: 동작 변경 시 `✅` 수용 기준 문장(통과/실패 단독 판정 가능하게).
  - **§4 비기능 요구사항(NFR)**: 응답 포맷·검증·레이트리밋·보안·스택 변경 시.
  - **§5 이번 버전 제외 범위**: 미구현 영역을 구현하면 이 표에서 제거하고 §2/§3로 이동.
  - 문서 상단 **기준 코드(branch/커밋)** 표기도 최신으로.
- 새 수용 기준은 기존 스타일을 따른다: `✅`로 시작하고, QA가 단독으로 통과/실패를 판정할 수 있는 한 문장.
- 코드는 바꿨는데 PRD를 안 바꾸면 작업은 **미완료**다. 변경 요약에 PRD 갱신 여부를 명시한다.

## 프로젝트 개요

`lit-server-nest`는 여행객 대상 짐 보관(수하물 보관) 예약 SaaS의 백엔드 API다. Express 레거시에서 NestJS로 이관 중이며, 예약·매장·보관함·쿠폰·대시보드 도메인이 동작한다. 결제·알림톡·정산은 DB 스키마만 존재한다(`docs/README.md` §5 참조).

액터: 점주(Store, JWT) · 로그인 고객(Customer, 소셜 JWT) · 비회원(Guest, 전화번호+토큰) · 관리자(Admin, `X-Admin-Token`).

## 기술 스택

- NestJS 11 · TypeScript 5.7 · Node 22
- Prisma 7 (MariaDB/MySQL 어댑터)
- JWT 인증, class-validator/Joi 검증, Swagger, nestjs-pino 로깅, @nestjs/throttler 레이트리밋, nodemailer, bcryptjs

## 명령어

```bash
npm run start:dev      # 개발 서버 (watch, 기본 포트 4000)
npm run build          # prisma generate + nest build
npm test               # Jest 단위 테스트 (*.spec.ts)
npm run test:e2e       # E2E 테스트
npm run lint           # eslint --fix
npm run format         # prettier
npm run prisma:pull    # DB 스키마 → schema.prisma 동기화
npm run prisma:studio  # Prisma Studio
```

## 아키텍처

- **계층**: Controller(라우팅/검증) → Service(Query/Command 분리) → PrismaService(전역) → MySQL.
- **모듈**: `src/app.module.ts`에 등록된 11개 도메인 모듈 — addresses, auth, customer-auth, customer-stores, coupons, dashboard, feedbacks, health, stores, storages, reservations.
- **경로 prefix**: 전역 prefix 없음. 각 컨트롤러 데코레이터에서 `api/...`를 직접 선언한다.
- **응답 포맷** (`ApiResponseInterceptor`):
  - 성공: `{ success: true, data, timestamp }`
  - 실패: `{ success: false, error: { code, message, details }, timestamp }`
- **입력 검증**: 모든 DTO는 class-validator로 검증. `whitelist + forbidNonWhitelisted`로 미정의 필드 거부, `transform` 적용.
- **레거시 호환**: Flutter/Express 호환을 위해 일부 snake_case·옵션 필드 유지(`src/common/transformers`). 기존 필드를 함부로 제거하지 말 것.

## 디렉터리 구조

```
src/
  common/          # interceptors, pipes, transformers, database(PrismaService), responses
  config/          # env.validation, logger.config, swagger.config
  modules/
    <domain>/
      *.controller.ts
      services/        # Query/Command 분리 서비스
      dto/             # class-validator DTO
      mappers/         # 엔티티 → 응답 매핑 (snake_case 호환 포함)
      guards/ decorators/ types/ utils/
docs/README.md     # 현행 구현 PRD (코드 변경 시 동기화 필수)
prisma/schema.prisma
```

## 데이터베이스

- 스키마 변경은 **DB 우선 → `prisma db pull`로 동기화** 방식이다. 마이그레이션 디렉터리는 사용하지 않는다.
- 프로덕션 스키마 변경 시 영향도/롤백 계획을 함께 검토한다.

## 작업 규칙

- 기존 코드의 컨벤션·네이밍·계층 구조를 따른다. Query/Command 서비스 분리 패턴을 유지한다.
- 도메인 규칙(가격 계산, 멀티타입 예약 등)을 바꿀 때는 관련 `*.spec.ts`도 함께 갱신하고 `npm test`로 회귀를 확인한다.
- 멀티타입 예약 핵심 로직: `reservations/services/guest-reservation.service.ts`, `mappers/guest-reservation.mapper.ts`, 가격은 `reservations/pricing/reservation-pricing.service.ts`.
- 커밋/PR 메시지는 한국어 컨벤셔널 커밋 스타일(`feat:`, `fix:`, `docs:` 등)을 따른다.
