#!/usr/bin/env bash
# Report on the ingest archive. DELETES NOTHING.
#
# The client's instruction (25 Aug 2026) is that uploaded files are kept
# PERMANENTLY, even once their readings are in the database. So there is no
# prune: `archive/` and `quarantine/` grow forever by design.
#
# This exists because "never delete" and "the disk never fills" are not the same
# promise. A full disk stops ingestion in a way that looks exactly like the
# station going quiet, so the growth is reported loudly and early — and a human
# decides what to do about it. Nothing here removes a file.
set -euo pipefail

ROOT="${OBSERVATOR_ROOT_DIR:-/home/wxstation}"
WARN_PCT="${OBSERVATOR_DISK_WARN_PCT:-80}"

archive_files=$(find "$ROOT/archive" -type f -name '*.csv' 2>/dev/null | wc -l)
archive_size=$(du -sh "$ROOT/archive" 2>/dev/null | cut -f1 || echo '0')
quarantine_files=$(find "$ROOT/quarantine" -type f -name '*.csv' 2>/dev/null | wc -l)
oldest=$(find "$ROOT/archive" -type f -name '*.csv' -printf '%T+ %p\n' 2>/dev/null | sort | head -1 | cut -d' ' -f1 || echo 'none')

used_pct=$(df --output=pcent "$ROOT" 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0)
avail=$(df -h --output=avail "$ROOT" 2>/dev/null | tail -1 | tr -d ' ' || echo '?')

echo "archive:    ${archive_files} files, ${archive_size} (oldest ${oldest}) — retained permanently"
echo "quarantine: ${quarantine_files} files — retained permanently, needs a human"
echo "disk:       ${used_pct}% used, ${avail} free"

if [ "${used_pct:-0}" -ge "$WARN_PCT" ]; then
  echo "WARNING: disk is ${used_pct}% full. Ingestion stops when it fills." >&2
  echo "         Move older archive/ folders to cold storage — do not delete them." >&2
  exit 1
fi
