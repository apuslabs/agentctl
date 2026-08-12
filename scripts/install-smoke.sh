#!/bin/sh
set -u
home=${HOME:-/tmp/agentctl-install-home}; mkdir -p "$home/bin" "$home/.local/bin"; export HOME="$home" PATH="$home/bin:$home/.local/bin:/usr/local/bin:/usr/bin:/bin" CI=1 CODEX_NON_INTERACTIVE=1
failed=0
run_timeout() { if command -v timeout >/dev/null 2>&1; then timeout "$@"; else shift; "$@"; fi; }
run() {
  name=$1; url=$2; bin=$3; script="$(mktemp)"; status=fail; detail=download-failed
  if run_timeout 60 curl -fsSL -o "$script" "$url"; then
    detail=install-failed
    if run_timeout 120 sh "$script" </dev/null >/tmp/agentctl-install.log 2>&1; then
      detail=binary-missing
      candidate=""
      for possible in "$home/bin/$bin" "$home/.local/bin/$bin" "$home/.hermes/$bin"; do if [ -x "$possible" ]; then candidate=$possible; break; fi; done
      if [ -n "$candidate" ] && run_timeout 20 "$candidate" --version </dev/null >/tmp/agentctl-version.log 2>&1; then status=pass; detail=version-ok; fi
    fi
  fi
  rm -f "$script"
  printf '{"tool":"%s","status":"%s","detail":"%s"}\n' "$name" "$status" "$detail"
  [ "$status" = pass ] || failed=$((failed + 1))
}
run claude https://claude.ai/install.sh claude
run codex https://chatgpt.com/codex/install.sh codex
run hermes https://hermes-agent.nousresearch.com/install.sh hermes
printf '{"summary":{"failed":%s,"status":"%s"}}\n' "$failed" "$([ "$failed" -eq 0 ] && printf pass || printf fail)"
exit "$failed"
