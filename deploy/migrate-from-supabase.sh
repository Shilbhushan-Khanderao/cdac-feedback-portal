#!/usr/bin/env bash
# ==============================================================================
# C-DAC Feedback Portal: Supabase Cloud to On-Campus PostgreSQL Migration Script
# ==============================================================================
set -euo pipefail

OLD_DB_URL="${OLD_SUPABASE_DB_URL:-}"
TARGET_DB_URL="${TARGET_DB_URL:-postgresql://feedback:feedback_secure_pass@localhost:5432/cdac_feedback}"
TEMP_DUMP_DIR="/tmp/cdac_migration_$(date +%Y%m%d_%H%M%S)"

if [[ -z "$OLD_DB_URL" ]]; then
  echo "Error: OLD_SUPABASE_DB_URL environment variable is required."
  echo "Example: export OLD_SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres'"
  exit 1
fi

echo "===================================================================="
echo " Starting Data Migration: Supabase Cloud -> C-DAC Campus PostgreSQL"
echo "===================================================================="

mkdir -p "$TEMP_DUMP_DIR"
trap 'rm -rf "$TEMP_DUMP_DIR"' EXIT

TABLES=(
  "batches"
  "centres"
  "courses"
  "modules"
  "questions"
  "faculty"
  "staff_roster"
  "student_roster"
  "feedback_sessions"
  "submissions"
  "responses"
)

echo "[1/4] Testing database connections..."
psql "$OLD_DB_URL" -c "SELECT 1" > /dev/null
psql "$TARGET_DB_URL" -c "SELECT 1" > /dev/null
echo "✓ Both database connections active."

echo "[2/4] Exporting data from Supabase Cloud (schema-only retained on-campus)..."
for tbl in "${TABLES[@]}"; do
  echo "  - Exporting table: public.$tbl"
  pg_dump "$OLD_DB_URL" \
    --table="public.$tbl" \
    --data-only \
    --no-owner \
    --no-privileges \
    --column-inserts \
    --file="$TEMP_DUMP_DIR/$tbl.sql"
done
echo "✓ All tables successfully exported."

echo "[3/4] Importing data into On-Campus PostgreSQL..."
for tbl in "${TABLES[@]}"; do
  if [[ -s "$TEMP_DUMP_DIR/$tbl.sql" ]]; then
    echo "  - Importing data into: public.$tbl"
    psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$TEMP_DUMP_DIR/$tbl.sql" > /dev/null
  else
    echo "  - Table public.$tbl has no records to import (skipping)."
  fi
done
echo "✓ Data import completed."

echo "[4/4] Validating row counts between source and target..."
printf "%-20s | %-12s | %-12s | %-8s\n" "Table" "Supabase" "Campus DB" "Status"
echo "----------------------------------------------------------------"

ALL_MATCH=true
for tbl in "${TABLES[@]}"; do
  SRC_COUNT=$(psql -t -A "$OLD_DB_URL" -c "SELECT count(*) FROM public.$tbl;" 2>/dev/null || echo "0")
  TGT_COUNT=$(psql -t -A "$TARGET_DB_URL" -c "SELECT count(*) FROM public.$tbl;" 2>/dev/null || echo "0")
  
  if [[ "$SRC_COUNT" -eq "$TGT_COUNT" ]]; then
    STATUS="MATCH"
  else
    STATUS="MISMATCH"
    ALL_MATCH=false
  fi
  printf "%-20s | %-12s | %-12s | %-8s\n" "$tbl" "$SRC_COUNT" "$TGT_COUNT" "$STATUS"
done

echo "----------------------------------------------------------------"
if [[ "$ALL_MATCH" == "true" ]]; then
  echo "✓ Data migration succeeded with 100% record parity!"
else
  echo "⚠ Warning: Row count discrepancies detected. Review tables above."
  exit 1
fi
