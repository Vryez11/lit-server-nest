-- 24시간 운영 + 알림톡 추가 수신자 컬럼 마이그레이션 (schema.prisma b032c54, 2026-06-27분)
-- 실행: mysql -h <host> -u <user> -p <db> < prisma/scripts/migrate-owner-notification-fields.sql
--
-- ⚠️ 이 스크립트는 코드 배포 **전에** 실행할 것
--    (예약 생성/취소 알림 fan-out이 stores.notification_phones select에 의존 —
--     컬럼 없이 코드가 먼저 배포되면 게스트 예약 생성이 500)
--
-- ⚠️ 이미 적용됐는지 먼저 확인 (있으면 해당 ALTER는 건너뛸 것):
--   SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE()
--     AND ((TABLE_NAME = 'stores' AND COLUMN_NAME = 'notification_phones')
--       OR (TABLE_NAME = 'store_operating_hours' AND COLUMN_NAME = 'is_24_hours'));

-- 1) 알림톡 추가 수신자 (lit-store 기본정보 탭 → PUT /api/store)
ALTER TABLE stores ADD COLUMN notification_phones JSON NULL;

-- 2) 24시간 운영 플래그
ALTER TABLE store_operating_hours ADD COLUMN is_24_hours TINYINT(1) NULL DEFAULT 0;
