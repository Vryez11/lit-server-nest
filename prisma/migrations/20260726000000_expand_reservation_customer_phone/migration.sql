-- AlterTable
-- customer_phone 확장: 이메일 예약(외국인)은 customer_phone에 이메일을 저장하는데
-- VARCHAR(20)로는 20자 초과 이메일이 1406(Data too long) 오류로 예약 생성이 실패함.
-- 폭만 늘리는 변경이라 기존 데이터 안전. (id+customer_phone 복합 인덱스도
-- utf8mb4 기준 2040바이트로 InnoDB 인덱스 한도 3072바이트 이내)
ALTER TABLE `reservations` MODIFY COLUMN `customer_phone` VARCHAR(255) NOT NULL;
