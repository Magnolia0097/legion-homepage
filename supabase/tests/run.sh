#!/usr/bin/env bash
# 마이그레이션을 빈 Postgres에 순서대로 적용하고 권한·멱등성 검증 SQL을 실행한다.
# 운영 DB가 아니라 로컬/CI의 일회용 DB 전용.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run.sh
#
# 사용하는 DB(TEST_DB, 기본 migration_test)는 매번 DROP 후 새로 만든다.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
DB="${TEST_DB:-migration_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"$DB\";" -c "CREATE DATABASE \"$DB\";"

echo "== Supabase 역할 흉내"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_supabase_roles.sql"

for f in "$MIGRATIONS"/[0-9][0-9][0-9]_*.sql; do
    echo "== apply $(basename "$f")"
    "${PSQL[@]}" -d "$DB" -f "$f"
done

for f in "$HERE"/[1-9][0-9]_assert_*.sql; do
    echo "== check $(basename "$f")"
    "${PSQL[@]}" -d "$DB" -o /dev/null -f "$f"   # 결과 행은 버리고 NOTICE(ok …)만 출력
done

echo "ALL CHECKS PASSED"
