-- 리뷰 2항목 평가: 매장 서비스·할인 별점 컬럼 (2026-07-03)
-- 실행: mysql -h <host> -u <user> -p <db> < prisma/scripts/migrate-review-service-rating.sql
--
-- ⚠️ 코드 배포 **전에** 실행할 것 (reviews.create가 service_rating 컬럼에 의존)
-- ⚠️ 이미 적용됐는지 확인:
--   SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'service_rating';

-- 매장 서비스·할인 별점 (1~5, NULL = 미이용/미평가. 기존 rating = 짐 보관 별점)
ALTER TABLE reviews ADD COLUMN service_rating INT NULL AFTER rating;
