#!/usr/bin/env bash
# Overnight task loop for Claude Code.
# One task per invocation, independent verification, commit on green,
# blocked-folder on 3 strikes, hard stops on wall clock and consecutive blocks.
set -uo pipefail

REPO_DIR="${REPO_DIR:-/work}"
QUEUE="$REPO_DIR/tasks/queue"
DONE="$REPO_DIR/tasks/done"
BLOCKED="$REPO_DIR/tasks/blocked"
LOGS="$REPO_DIR/logs"
MAX_ATTEMPTS=3
MAX_CONSECUTIVE_BLOCKS=3
WALL_CLOCK_HOURS="${WALL_CLOCK_HOURS:-8}"
MAX_TURNS="${MAX_TURNS:-80}"

mkdir -p "$DONE" "$BLOCKED" "$LOGS"
cd "$REPO_DIR"
DEADLINE=$(( $(date +%s) + WALL_CLOCK_HOURS * 3600 ))
SUMMARY="$LOGS/loop-summary.md"
echo "# Overnight run $(date -u +%FT%TZ)" > "$SUMMARY"
consecutive_blocks=0

log() { echo "[$(date -u +%T)] $*" | tee -a "$LOGS/loop.log"; }

# Snapshot the harness so tampering is detectable regardless of instructions.
harness_hash() {
  cat scripts/verify.sh scripts/loop.sh CLAUDE.md 2>/dev/null | sha256sum | cut -d' ' -f1
}
HARNESS_BASELINE=$(harness_hash)

while true; do
  if (( $(date +%s) >= DEADLINE )); then
    log "Wall clock cap reached. Stopping."
    echo "- STOPPED: wall clock cap" >> "$SUMMARY"; break
  fi
  if (( consecutive_blocks >= MAX_CONSECUTIVE_BLOCKS )); then
    log "$MAX_CONSECUTIVE_BLOCKS consecutive blocked tasks. Environment likely broken. Stopping."
    echo "- STOPPED: $MAX_CONSECUTIVE_BLOCKS consecutive blocks" >> "$SUMMARY"; break
  fi

  TASK=$(ls "$QUEUE"/*.md 2>/dev/null | sort | head -n 1)
  if [[ -z "${TASK:-}" ]]; then
    log "Queue empty. Night's work complete."
    echo "- COMPLETE: queue empty" >> "$SUMMARY"; break
  fi
  TASK_NAME=$(basename "$TASK" .md)
  log "=== Task $TASK_NAME ==="

  passed=false
  for attempt in $(seq 1 $MAX_ATTEMPTS); do
    if (( $(date +%s) >= DEADLINE )); then break; fi
    log "Attempt $attempt/$MAX_ATTEMPTS"
    git stash --include-untracked -q 2>/dev/null; git stash drop -q 2>/dev/null || true

    ATTEMPT_LOG="$LOGS/${TASK_NAME}-attempt${attempt}.jsonl"
    RETRY_CONTEXT=""
    PREV="$LOGS/${TASK_NAME}-attempt$((attempt-1))-failure.txt"
    [[ -f "$PREV" ]] && RETRY_CONTEXT="A previous attempt failed verification. Failure output:
$(tail -c 4000 "$PREV")
Fix the root cause; do not paper over it."

    PROMPT="Read CLAUDE.md and follow its autonomous session rules exactly.
Complete ONLY the task below. Definition of done is its acceptance command
passing. Do not commit. Do not touch tests/ unless the task says to,
and never edit scripts/, tasks/, or CLAUDE.md.
$RETRY_CONTEXT
--- TASK FILE ($TASK_NAME) ---
$(cat "$TASK")"

    timeout 45m claude -p "$PROMPT" \
      --permission-mode bypassPermissions \
      --max-turns "$MAX_TURNS" \
      --output-format stream-json \
      >> "$ATTEMPT_LOG" 2>&1
    CLAUDE_RC=$?
    log "claude exited $CLAUDE_RC"

    # Harness integrity: hard fail if the agent touched the harness.
    if [[ "$(harness_hash)" != "$HARNESS_BASELINE" ]]; then
      log "HARNESS MODIFIED. Reverting and blocking task."
      git checkout -- scripts/verify.sh scripts/loop.sh CLAUDE.md 2>/dev/null
      echo "harness modified by agent" > "$LOGS/${TASK_NAME}-attempt${attempt}-failure.txt"
      continue
    fi

    # Independent verification (Claude did not write this and cannot edit it).
    if bash scripts/verify.sh "$TASK" > "$LOGS/${TASK_NAME}-attempt${attempt}-verify.txt" 2>&1; then
      git add -A
      git commit -q -m "feat(${TASK_NAME}): complete via overnight loop (attempt ${attempt})"
      mv "$TASK" "$DONE/"
      git add -A && git commit -q -m "chore: move ${TASK_NAME} to done"
      echo "- PASS: $TASK_NAME (attempt $attempt)" >> "$SUMMARY"
      log "PASS. Committed."
      passed=true; consecutive_blocks=0
      break
    else
      cp "$LOGS/${TASK_NAME}-attempt${attempt}-verify.txt" \
         "$LOGS/${TASK_NAME}-attempt${attempt}-failure.txt"
      log "Verification failed."
      git checkout -q -- . 2>/dev/null; git clean -qfd --exclude=logs 2>/dev/null
    fi
  done

  if [[ "$passed" != true ]]; then
    mv "$TASK" "$BLOCKED/"
    echo "- BLOCKED: $TASK_NAME after $MAX_ATTEMPTS attempts (see logs)" >> "$SUMMARY"
    log "BLOCKED: $TASK_NAME"
    consecutive_blocks=$((consecutive_blocks + 1))
  fi
done

log "Run finished. Summary at $SUMMARY"
