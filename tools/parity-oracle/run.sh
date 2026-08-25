#!/usr/bin/env bash
#
# Compiles and runs the legacy schedule search over a .schedb export.
#
#   ./run.sh [--out-of-grid-open] <schedb> <course set> [<course set> ...]
#
# A course set is comma-separated, e.g. "CS2102" or "CS1004,MA1020". Without
# --out-of-grid-open the search behaves exactly as the deployed old app does.
set -euo pipefail

ORACLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v javac > /dev/null; then
  echo "No javac on PATH. The oracle needs a JDK (17 or newer); it is not part of pnpm test." >&2
  exit 1
fi

mkdir -p "$ORACLE_DIR/classes"
find "$ORACLE_DIR/src" -name '*.java' > "$ORACLE_DIR/sources.txt"
javac -nowarn -d "$ORACLE_DIR/classes" "@$ORACLE_DIR/sources.txt"

java -cp "$ORACLE_DIR/classes" oracle.ParityOracle "$@"
