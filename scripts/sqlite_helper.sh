#!/bin/bash
# sqlite_helper.sh - Thin wrapper for Claude Code skills to interact with SQLite
# Usage:
#   ./scripts/sqlite_helper.sh query "SELECT * FROM topics"
#   ./scripts/sqlite_helper.sh exec "INSERT INTO topics (id, name) VALUES ('1', 'test')"
#   ./scripts/sqlite_helper.sh json "SELECT * FROM topics"  (output as JSON array)

set -euo pipefail

DB_PATH="${DB_PATH:-$(dirname "$0")/../database.sqlite}"

case "${1:-}" in
  query|json)
    sqlite3 -json -header "$DB_PATH" "$2"
    ;;
  exec)
    sqlite3 "$DB_PATH" "$2"
    ;;
  get)
    sqlite3 -json -header "$DB_PATH" "$2"
    ;;
  *)
    echo "Usage: $0 {query|exec|json|get} SQL" >&2
    exit 1
    ;;
esac
