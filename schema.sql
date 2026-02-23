-- 공지사항 테이블
CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  is_pinned  INTEGER DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now')),
  updated_at TEXT    DEFAULT (datetime('now'))
);

-- 사진 메타데이터 테이블
CREATE TABLE IF NOT EXISTS gallery (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_key    TEXT    NOT NULL,
  description TEXT,
  taken_date  TEXT    NOT NULL,
  uploader    TEXT    NOT NULL,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- 레기온 멤버 테이블
CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname   TEXT    NOT NULL,
  role       TEXT    NOT NULL,
  joined_at  TEXT,
  is_active  INTEGER DEFAULT 1
);
