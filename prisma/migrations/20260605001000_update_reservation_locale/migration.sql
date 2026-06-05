UPDATE reservations
SET locale = CASE
  WHEN locale IN ('ko', 'ko-KR') THEN 'ko'
  WHEN locale IN ('en', 'en-US') THEN 'en'
  WHEN locale IN ('ja', 'ja-JP') THEN 'ja'
  WHEN locale IN ('zh', 'zh-CN', 'zh-TW') THEN 'zh'
  ELSE 'ko'
END;

ALTER TABLE reservations
  MODIFY COLUMN locale VARCHAR(5) NOT NULL DEFAULT 'ko' AFTER customer_email;
