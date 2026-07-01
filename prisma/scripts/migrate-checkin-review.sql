-- 체크인/체크아웃 + 리뷰 파이프라인 마이그레이션 (2026-07-02)
-- 실행: mysql -h <host> -u <user> -p <db> < prisma/scripts/migrate-checkin-review.sql

-- 1) 예약 상태에 no_show 추가
ALTER TABLE reservations MODIFY COLUMN status
  ENUM('pending','pending_approval','confirmed','rejected','in_progress','completed','cancelled','no_show')
  DEFAULT 'pending';

-- 2) 예약(그룹 대표)당 리뷰 1개 강제. NULL은 중복 허용됨(MySQL unique 특성) — 레거시 행 안전
ALTER TABLE reviews DROP INDEX reservation_id;
ALTER TABLE reviews ADD UNIQUE INDEX uniq_review_reservation (reservation_id);
