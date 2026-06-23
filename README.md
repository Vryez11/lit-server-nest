# lit-server-nest

> 여행객 대상 짐 보관 예약 SaaS **Life Is Travel**의 백엔드 API 서버

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-003545?logo=mariadb&logoColor=white)
![Status](https://img.shields.io/badge/status-운영%20중-success)

매장 앱과 고객 앱이 함께 쓰는 인증·매장·보관함·예약·쿠폰·대시보드 API를 한곳에서 제공합니다.
Express 레거시에서 NestJS로 이관 중이며, Flutter 모바일 앱과의 호환을 유지하는 것을 중요하게 생각해요.

---

## 기능

- [x] **인증** — 매장/고객/비회원 인증, JWT 토큰 갱신, 이메일 인증
- [x] **매장 관리** — 프로필 · PIN · 영업 상태 · 설정
- [x] **보관함 관리** — 조회 / 생성 / 수정 / 삭제
- [x] **예약 관리** — 매장 · 고객 · 비회원, 멀티타입 · 가격 계산
- [x] **쿠폰 관리** — 쿠폰 정책 · 발급 · 조회
- [x] **대시보드** — 매장 통계 · 요약 · 실시간 현황
- [ ] 결제 · 알림톡 · 정산 _(DB 스키마만 존재, 미구현)_

---

## 🚀 실행

```bash
# 1. 의존성 설치
npm install

# 2. Prisma Client 생성
npm run prisma:generate

# 3. 개발 서버 실행 (http://localhost:4000)
npm run start:dev
```

> 포트는 `.env`의 `PORT` 값을 따르며, 없으면 `4000`입니다.
> 환경 변수는 `.env.example`을 복사해 채워주세요.

---

## 🧰 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| Framework | NestJS 11 / TypeScript / Node.js 22.x |
| Database | MariaDB · MySQL + Prisma 7 (`@prisma/adapter-mariadb`) |
| Auth | JWT, bcryptjs, `@nestjs/throttler` |
| Validation | `class-validator`, `class-transformer`, Joi |
| Docs | Swagger (`/docs`) |
| Test | Jest, supertest(e2e) |

---

## 📚 더 보기

- 상세 실행 · 배포 · 환경 변수 · API 가이드는 [`docs/README.md`](docs/README.md) (PRD/SSOT) 참고
- API 문서: 서버 실행 후 `/docs` (Swagger)
- Health Check: `GET /health`
