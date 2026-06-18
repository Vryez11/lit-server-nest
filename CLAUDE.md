# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 따라야 하는 규칙과 기본 정보를 정의한다.

## 프로젝트 개요

`lit-server-nest`는 **Life Is Travel(여행객 대상 짐 보관 예약 SaaS)**의 NestJS 백엔드 API 서버다.
Express 레거시에서 NestJS로 이관 중이며, 매장 앱·고객 앱에서 쓰는 인증/매장/보관함/예약/쿠폰/대시보드
API를 제공한다. 결제·알림톡·정산은 DB 스키마만 존재한다.

- 상세 사용자/공개 README: [`README.md`](README.md)
- 현행 구현 명세(PRD, SSOT): [`docs/README.md`](docs/README.md)

## 기술 스택

- **Framework**: NestJS 11 / TypeScript / Node.js 22.x
- **DB**: MariaDB·MySQL + Prisma 7 (`@prisma/adapter-mariadb`)
- **Auth**: JWT (`@nestjs/jwt`), bcryptjs, `@nestjs/throttler`(레이트리밋)
- **Validation**: `class-validator`, `class-transformer`, Joi
- **Docs**: Swagger (`/docs`)
- **Test**: Jest (`*.spec.ts`), supertest(e2e)

## 자주 쓰는 명령

```bash
npm run start:dev      # 개발 서버(watch)
npm run build          # 빌드 (prebuild에서 prisma generate 자동 실행)
npm run lint           # ESLint --fix
npm run format         # Prettier
npm test               # 단위 테스트(jest, *.spec.ts)
npm run test:cov       # 커버리지
npm run test:e2e       # e2e 테스트(test/jest-e2e.json)
npm run prisma:generate  # Prisma Client 생성
npm run prisma:studio    # Prisma Studio
```

> `prebuild`/`pretest`에서 `prisma generate`가 자동 실행되므로, 스키마 변경 후 별도 generate 없이도
> build/test가 최신 클라이언트를 사용한다.

## 프로젝트 구조

```text
src/
  common/        database(Prisma) · decorators · filters · guards · interceptors · pipes · transformers(레거시 호환)
  config/        환경변수 검증(Joi) · Swagger 설정
  modules/
    auth/            매장 인증 · 토큰 · 이메일 인증
    customer-auth/   고객(소셜) 인증
    customer-stores/ 고객용 매장 조회·검색
    stores/          매장 프로필 · 설정 · 상태 · PIN
    storages/        보관함 관리
    reservations/    예약(매장/고객/비회원, 멀티타입, 가격 계산)
    coupons/         쿠폰 정책 · 발급 · 조회
    dashboard/       대시보드 통계
    health/          헬스체크
prisma/
  schema.prisma  Prisma DB 스키마
```

## 작업 시 규약

- **DB는 코드 우선이 아니라 스키마 우선**: 운영 DB에서 `prisma db pull`로 동기화하는 흐름이므로
  `schema.prisma`를 임의로 재설계하지 말고, 변경이 필요하면 영향 범위를 먼저 확인한다.
- **레거시 호환 유지**: Flutter 모바일 앱이 snake_case 필드를 사용한다. `common/transformers`의
  입출력 호환 변환을 깨뜨리지 않는다.
- **응답/예외 포맷**: 전역 인터셉터·예외 필터를 통한 공통 응답 래핑 규칙을 따른다(직접 응답 구조를 바꾸지 않음).
- **테스트**: 동작을 바꾸면 해당 모듈의 `*.spec.ts`를 함께 수정/추가한다. 기존에 깨져 있던 테스트는
  메모리(MEMORY.md) 참고.
- **Git 워크플로우**: PR은 `Vryez11` fork → `life-is-travel` upstream `main`으로 생성한다.

## PRD 우선 워크플로우 (필수)

이 프로젝트의 PRD는 [`docs/README.md`](docs/README.md)에 있다. 이 PRD는 **현행(as-is) 구현
PRD** — 즉 "이미 구현된 동작"을 기준으로 작성된 단일 진실 공급원(SSOT)이다.

**기능을 새로 구현하거나 기존 동작을 수정할 때는, 코드를 건드리기 전에 먼저 `docs/README.md`(PRD)에
변경 내용을 반영한다.** 순서는 항상 다음과 같다.

1. **PRD 먼저 수정** — `docs/README.md`에 추가/변경/삭제할 동작을 반영한다.
   - 새 기능: §2 기능 목록에 `F-0XX` ID를 새로 부여하고, §3에 유저 스토리 + `✅` 수용 기준을 추가한다.
   - 기존 기능 변경: 해당 `F-0XX`의 수용 기준(`✅` 문장)을 실제로 바뀔 동작에 맞게 고친다.
   - 범위 제외/제거: 해당 항목을 §5(미구현 로드맵) 또는 제외 범위로 이동한다.
2. **사용자에게 PRD 변경안을 보여주고 합의**한 뒤 코드 작업을 시작한다.
3. **코드 구현** — PRD에 적힌 수용 기준을 충족하도록 구현/수정한다.
4. **검증** — 수용 기준(`✅`)이 실제 동작과 일치하는지 테스트로 확인한다. 구현 결과가 PRD와 달라지면
   PRD를 다시 동기화한다(PRD와 코드는 항상 일치해야 한다).

> PRD는 "구현 완료된 동작"만 Must로 기록한다. 아직 구현 전이라면 수용 기준을 "구현 예정"이 아니라
> 최종적으로 동작할 명세로 쓰되, 구현·검증이 끝난 뒤에 상태를 확정한다.

### 예외

- 버그 수정으로 **동작 명세가 바뀌지 않는** 경우(PRD의 `✅` 기준은 그대로 옳고 코드만 틀렸던 경우)는
  PRD 수정 없이 코드만 고친다.
- 리팩터링·포맷팅·주석·테스트 보강 등 **외부 동작이 변하지 않는** 변경은 PRD를 건드리지 않는다.
- 문서/설정 변경 등 기능과 무관한 작업도 제외.

판단이 애매하면 "이 변경으로 §3의 `✅` 수용 기준 중 하나라도 바뀌는가?"를 기준으로 삼는다. 바뀐다면
PRD 먼저.
