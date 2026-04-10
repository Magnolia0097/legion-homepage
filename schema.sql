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

-- 일반 사용자 테이블 (최고 관리자가 등록한 구글 계정)
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  nickname   TEXT    NOT NULL,
  added_by   TEXT    NOT NULL,
  created_at TEXT    DEFAULT (datetime('now'))
);

-- 댓글 테이블 (공지사항·이벤트·사진첩)
CREATE TABLE IF NOT EXISTS comments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type      TEXT    NOT NULL CHECK(target_type IN ('notice', 'event', 'gallery')),
  target_id        INTEGER NOT NULL,
  author_email     TEXT    NOT NULL,
  author_nickname  TEXT    NOT NULL,
  content          TEXT    NOT NULL,
  created_at       TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);

-- 도둑잡기 게임 방 테이블
CREATE TABLE IF NOT EXISTS game_rooms (
  id          TEXT    PRIMARY KEY,
  host_email  TEXT    NOT NULL,
  host_name   TEXT    NOT NULL,
  max_players INTEGER DEFAULT 10,
  status      TEXT    DEFAULT 'waiting' CHECK(status IN ('waiting', 'playing', 'finished')),
  state       TEXT    DEFAULT '{}',
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- 게임 참가자 테이블
CREATE TABLE IF NOT EXISTS game_players (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id   TEXT    NOT NULL,
  player_id TEXT    NOT NULL,
  nickname  TEXT    NOT NULL,
  is_ai     INTEGER DEFAULT 0,
  joined_at TEXT    DEFAULT (datetime('now')),
  UNIQUE(room_id, player_id)
);

-- 구슬 인벤토리 테이블
CREATE TABLE IF NOT EXISTS marble_inventory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner      TEXT    NOT NULL,
  marble_type TEXT   NOT NULL DEFAULT 'glass',
  count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(owner, marble_type)
);

-- 구슬치기 방 테이블
CREATE TABLE IF NOT EXISTS marble_rooms (
  id          TEXT    PRIMARY KEY,
  host_email  TEXT    NOT NULL,
  host_name   TEXT    NOT NULL,
  max_players INTEGER DEFAULT 4,
  bet_amount  INTEGER DEFAULT 1,
  status      TEXT    DEFAULT 'waiting' CHECK(status IN ('waiting', 'playing', 'finished')),
  state       TEXT    DEFAULT '{}',
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- 구슬치기 참가자 테이블
CREATE TABLE IF NOT EXISTS marble_players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT    NOT NULL,
  player_id  TEXT    NOT NULL,
  nickname   TEXT    NOT NULL,
  marble_type TEXT   NOT NULL DEFAULT 'glass',
  is_ai      INTEGER DEFAULT 0,
  joined_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(room_id, player_id)
);

-- RPG 플레이어 위치 (멀티플레이어 유령 시스템)
CREATE TABLE IF NOT EXISTS rpg_positions (
  email      TEXT    PRIMARY KEY,
  nickname   TEXT    NOT NULL,
  map_id     TEXT    NOT NULL DEFAULT 'village',
  tile_x     INTEGER NOT NULL DEFAULT 19,
  tile_y     INTEGER NOT NULL DEFAULT 13,
  direction  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    DEFAULT (datetime('now'))
);

-- RPG 세이브 데이터
CREATE TABLE IF NOT EXISTS rpg_saves (
  email      TEXT    PRIMARY KEY,
  save_data  TEXT    NOT NULL DEFAULT '{}',
  updated_at TEXT    DEFAULT (datetime('now'))
);
