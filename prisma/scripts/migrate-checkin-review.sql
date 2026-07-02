-- 체크인/체크아웃 + 리뷰 파이프라인 마이그레이션 (2026-07-02)
-- 실행: mysql -h <host> -u <user> -p <db> < prisma/scripts/migrate-checkin-review.sql
--
-- ⚠️ 실행 전 필수 확인 (중복 reservation_id가 있으면 UNIQUE 추가가 실패함):
--   SELECT reservation_id, COUNT(*) FROM reviews
--   WHERE reservation_id IS NOT NULL GROUP BY reservation_id HAVING COUNT(*) > 1;
--   → 결과가 있으면 중복 행 정리 후 실행
-- ⚠️ 이 스크립트는 코드 배포 **전에** 실행할 것 (no_show enum + P2002 방어가 의존)

-- 1) 예약 상태에 no_show 추가
ALTER TABLE reservations MODIFY COLUMN status
  ENUM('pending','pending_approval','confirmed','rejected','in_progress','completed','cancelled','no_show')
  DEFAULT 'pending';

-- 2) 예약(그룹 대표)당 리뷰 1개 강제. NULL은 중복 허용됨(MySQL unique 특성) — 레거시 행 안전
ALTER TABLE reviews DROP INDEX reservation_id;
ALTER TABLE reviews ADD UNIQUE INDEX uniq_review_reservation (reservation_id);
