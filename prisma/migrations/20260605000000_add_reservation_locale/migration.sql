ALTER TABLE reservations
  ADD COLUMN locale VARCHAR(20) NULL DEFAULT 'ko-KR' AFTER customer_email;
