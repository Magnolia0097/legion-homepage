-- 1회용 초대 링크 토큰 테이블 (신규)
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT    NOT NULL UNIQUE,
  type        TEXT    NOT NULL CHECK(type IN ('user', 'admin')),
  created_by  TEXT    NOT NULL,
  used_by     TEXT,
  used_at     TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- users 테이블: 최초 로그인 시각 + 사용한 초대 토큰 추적 (기존 데이터 유지)
ALTER TABLE users ADD COLUMN first_login_at TEXT;
ALTER TABLE users ADD COLUMN invite_token   TEXT;
