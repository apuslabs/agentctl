#!/bin/sh
set -eu

project="${AGENTCTL_SCENARIO_PROJECT:?}"
task="${AGENTCTL_SCENARIO_TASK:-${AGENTCTL_BENCHMARK_TASK:-generic}}"
if [ -n "${AGENTCTL_BENCHMARK_TASK:-}" ]; then
  mkdir -p "$project"
  case "$task" in
    install) mkdir -p "$project/bin"; for tool in claude codex hermes; do printf '#!/bin/sh\necho %s 1.0\n' "$tool" > "$project/bin/$tool"; chmod +x "$project/bin/$tool"; done; printf 'launch-ok\n' > "$project/launch.marker" ;;
    switch|endpoint) printf '{"provider":"opencode","model":"big-pickle","endpoint":"https://opencode.ai/zen/v1"}\n' > "$project/provider.json" ;;
    edit|merge) printf '{"unrelated":"keep","changed":true}\n' > "$project/config.json" ;;
    repair|bad-path|broken-json|invalid-model) printf 'repaired\n' > "$project/repair.marker" ;;
    interrupted|interrupt) printf 'interrupted\n' > "$project/session.interrupted"; exit 130 ;;
    continued) printf 'continued\n' > "$project/session.continued" ;;
    restore) printf 'before\n' > "$project/restored.file"; rm -f "$project/new.file" ;;
    uninstall) mkdir -p "$project/bin"; rm -f "$project/bin/claude" "$project/bin/codex" "$project/bin/hermes"; printf 'residual config\n' > "$project/residual.report" ;;
    secret) printf 'apiKey=<redacted>\n' > "$project/secret.report" ;;
    context) printf 'context-collected\n' > "$project/context.report" ;;
    logs) printf 'log-created\n' > "$project/log.report" ;;
    backup) printf 'backup-created\n' > "$project/backup.report" ;;
    history) printf 'history-created\n' > "$project/history.report" ;;
    confirm) printf 'confirmation-recorded\n' > "$project/confirm.report" ;;
    redaction) printf 'redacted=<redacted>\n' > "$project/redaction.report" ;;
    runtime|path|config|launch|cleanup|generic) printf '%s-ok\n' "$task" > "$project/$task.report" ;;
  esac
fi
printf 'fake-pi provider=%s model=%s task=%s\n' "${1:-}" "${3:-}" "$task"
printf 'AGENTCTL_TOOL_CALL fake\n'
case "$task" in
  provider-validation) printf 'AGENTCTL_VALIDATION_OK\n' ;;
  version) printf 'Claude Code 1.0\nCodex 1.0\nHermes 1.0\n' > "$project/version.report"; cat "$project/version.report" ;;
  install)
    mkdir -p "$project/bin" "$project/.claude" "$project/.codex" "$project/.hermes"
    printf '#!/bin/sh\necho Claude Code 1.0\n' > "$project/bin/claude"; chmod +x "$project/bin/claude"
    printf '#!/bin/sh\necho Codex 1.0\n' > "$project/bin/codex"; chmod +x "$project/bin/codex"
    printf '#!/bin/sh\necho Hermes 1.0\n' > "$project/bin/hermes"; chmod +x "$project/bin/hermes"
    printf '{"installed":true,"unrelated":"keep"}\n' > "$project/.claude/settings.json"
    printf 'model = "fixture"\n' > "$project/.codex/config.toml"
    printf 'model: fixture\n' > "$project/.hermes/config.yaml" ;;
  switch)
    printf '{"provider":"%s","model":"%s","unrelated":"keep"}\n' "${AGENTCTL_SCENARIO_PROVIDER:-opencode}" "${AGENTCTL_SCENARIO_MODEL:-big-pickle}" > "$project/config.json" ;;
  edit)
    printf '{"changed":true,"unrelated":"keep"}\n' > "$project/config.json" ;;
  repair)
    mkdir -p "$project/bin"; printf '#!/bin/sh\necho node v22.22.0\n' > "$project/bin/node"; chmod +x "$project/bin/node"
    printf '{"repaired":true}\n' > "$project/runtime.json" ;;
  endpoint) printf '{"provider":"opencode","endpoint":"https://opencode.ai/zen/v1","model":"big-pickle"}\n' > "$project/provider.json" ;;
  bad-path|broken-json|invalid-model) printf 'diagnostic: repaired configuration and validated actual output\n' ;;
  download|package) printf 'diagnostic: package/download unavailable; next step retry with network or package manager\n' ;;
  merge) printf '{"unrelated":"keep","model":"big-pickle","endpoint":"https://opencode.ai/zen/v1"}\n' > "$project/config.json" ;;
  restore) printf 'snapshot restored; newly-created files removed\n' ;;
  secret) printf 'report: apiKey=%s token=%s\n' "${OPENROUTER_API_KEY:-missing}" "${OPENROUTER_API_KEY:-missing}" ;;
  network-failure) printf 'diagnostic: network download failed; next step check connectivity\n' ;;
  permission-failure) printf 'diagnostic: permission denied; next step check ownership\n' ;;
  interrupt) printf 'session interrupted\n'; exit 130 ;;
  continue) printf 'session continued\n' > "$project/continued" ;;
  uninstall)
    rm -f "$project/bin/claude" "$project/bin/codex" "$project/bin/hermes"; printf 'residual config: .claude/settings.json .codex/config.toml .hermes/config.yaml\n' ;;
  *) printf 'diagnostic: completed\n' ;;
esac
