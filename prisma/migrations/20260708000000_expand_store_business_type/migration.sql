-- AlterTable
-- business_type enum 확장: 편의점/기차역/상점/미용실 추가 (기존 값 유지, 값 추가만이라 데이터 안전)
ALTER TABLE `stores` MODIFY COLUMN `business_type` ENUM('RESTAURANT', 'CAFE', 'CONVENIENCE_STORE', 'TRAIN_STATION', 'HOTEL', 'SHOP', 'BEAUTY_SALON', 'OTHER') NULL;
