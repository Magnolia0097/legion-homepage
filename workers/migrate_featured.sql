ALTER TABLE gallery ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gallery ADD COLUMN music_key TEXT;
ALTER TABLE gallery ADD COLUMN hero_title TEXT;
ALTER TABLE gallery ADD COLUMN hero_desc TEXT;
UPDATE gallery SET is_featured = 1 WHERE description LIKE '%이달의 모델%';
