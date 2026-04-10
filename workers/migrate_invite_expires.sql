-- 기간제 초대 링크 지원: expires_at 컬럼 추가
ALTER TABLE invite_tokens ADD COLUMN expires_at TEXT;
