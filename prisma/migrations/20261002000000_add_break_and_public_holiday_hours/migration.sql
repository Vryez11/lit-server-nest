-- 브레이크타임(요일별 {월:{start,end}}) + 공휴일 전용 영업시간({isOperating,openTime,closeTime})
ALTER TABLE `store_operating_hours`
  ADD COLUMN `break_times` JSON NULL AFTER `holiday_end_date`,
  ADD COLUMN `public_holiday_hours` JSON NULL AFTER `break_times`;
