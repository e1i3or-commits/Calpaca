#!/usr/bin/env bash
# Independent verification gate. The agent is forbidden from editing this
# file, and loop.sh additionally hash-checks it. It runs the task's own
# acceptance command when present, plus repo-wide invariants.
set -uo pipefail
TASK_FILE="${1:-}"

fail() { echo "VERIFY FAIL: $*"; exit 1; }

# 1. Repo-wide gate: typecheck, lint, tests. Tolerate absence only before
#    task 01 has created the scripts.
if [[ -f package.json ]] && grep -q '"typecheck"' package.json; then
  bun run typecheck || fail "typecheck"
  bun run lint      || fail "lint"
  bun test          || fail "tests"
fi

# 2. Task acceptance command, extracted from the task file's ## Acceptance
#    fenced block, run verbatim.
if [[ -n "$TASK_FILE" && -f "$TASK_FILE" ]]; then
  ACCEPT=$(awk '/^## Acceptance/{flag=1;next}/^## /{flag=0}flag' "$TASK_FILE" \
           | sed -n '/^```/,/^```/p' | sed '1d;$d')
  if [[ -n "$ACCEPT" ]]; then
    bash -c "$ACCEPT" || fail "task acceptance command"
  fi
fi

# 3. Anti-gaming invariants.
# Test files must not shrink: assertion count can only grow or hold.
if git rev-parse HEAD >/dev/null 2>&1 && [[ -d tests ]]; then
  before=$(git show HEAD -- tests/ 2>/dev/null | grep -c "expect(" || true)
  after=$(grep -rc "expect(" tests/ 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
  removed=$(git diff HEAD -- tests/ 2>/dev/null | grep -c "^-.*expect(" || true)
  added=$(git diff HEAD -- tests/ 2>/dev/null | grep -c "^+.*expect(" || true)
  if (( removed > added )); then
    fail "net removal of test assertions ($removed removed vs $added added)"
  fi
fi
# No skipped or focused tests slipped in.
if [[ -d tests ]]; then
  grep -rn "\.skip(\|\.only(\|todo(" tests/ 2>/dev/null && fail "skipped/focused tests present"
fi

echo "VERIFY PASS"
