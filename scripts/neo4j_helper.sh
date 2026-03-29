#!/bin/bash
# neo4j_helper.sh - Thin wrapper for Claude Code skills to interact with Neo4j
# Usage:
#   ./scripts/neo4j_helper.sh query "MATCH (n) RETURN n LIMIT 10"
#   ./scripts/neo4j_helper.sh exec "CREATE (n:Entity {name: 'test'})"

set -euo pipefail

NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-password}"

if ! command -v cypher-shell &>/dev/null; then
  echo '{"error": "cypher-shell not found. Install Neo4j tools or use Neo4j HTTP API."}' >&2
  exit 1
fi

case "${1:-}" in
  query)
    cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" --format json "$2"
    ;;
  exec)
    cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$2"
    ;;
  *)
    echo "Usage: $0 {query|exec} CYPHER" >&2
    exit 1
    ;;
esac
