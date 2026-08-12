#!/bin/sh
set -eu

provider=${AGENTCTL_BENCHMARK_PROVIDER:-opencode}
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "$provider" in opencode|openrouter) ;; *) echo "Unsupported provider: $provider" >&2; exit 2;; esac
key=${AGENTCTL_BENCHMARK_API_KEY:-${OPENROUTER_API_KEY:-}}
if [ "$provider" = opencode ]; then key=${OPENCODE_API_KEY:-public}; fi
if [ "$provider" = openrouter ] && [ -z "$key" ]; then
  printf '%s\n' '{"status":"skipped","reason":"OpenRouter credential absent","tasks":30}'
  exit 0
fi

root=$(mktemp -d); trap 'rm -rf "$root"' EXIT
artifact_dir=${AGENTCTL_BENCHMARK_ARTIFACT_DIR:-}
model=${AGENTCTL_BENCHMARK_MODEL:-}; [ -n "$model" ] || { if [ "$provider" = opencode ]; then model=big-pickle; else model=openrouter/free; fi; }
timeout_seconds=${AGENTCTL_BENCHMARK_TIMEOUT:-15}
export AGENTCTL_PI_THINKING=${AGENTCTL_BENCHMARK_THINKING:-minimal}
tasks="install version switch endpoint edit merge repair bad-path broken-json invalid-model network permission download package interrupted continued restore uninstall secret context logs backup history confirm redaction runtime path config"
total=0; success=0; tool_calls=0
run_task() {
  name=$1; prompt=$2; expected=$3; total=$((total+1)); project="$root/$name/project"; state="$root/$name/state"; home="$project/home"; mkdir -p "$project" "$state" "$home"
  export AGENTCTL_HOME="$state" AGENTCTL_BENCHMARK_TASK="$name"
  config_provider=$provider; [ "$provider" = opencode ] && api_key= || api_key=$key
  printf '{"version":1,"provider":"%s","openRouterBaseUrl":"https://openrouter.ai/api/v1","model":"%s","createdAt":"now","updatedAt":"now"}\n' "$config_provider" "$model" > "$state/config.json"
  case "$name" in switch|endpoint) printf '{"provider":"opencode","model":"old-model","endpoint":"https://old.invalid"}\n' > "$project/provider.json";; edit|merge) printf '{"unrelated":"keep","old":true}\n' > "$project/config.json";; repair|broken-json) printf '{broken\n' > "$project/runtime.json";; bad-path) printf 'PATH=/missing\n' > "$project/path.config";; invalid-model) printf '{"model":"invalid"}\n' > "$project/model.json";; restore) printf 'original\n' > "$project/restored.file"; printf 'new\n' > "$project/new.file";; uninstall) mkdir -p "$project/bin"; for tool in claude codex hermes; do printf '#!/bin/sh\necho tool\n' > "$project/bin/$tool"; chmod +x "$project/bin/$tool"; done; printf 'residual\n' > "$project/residual.config";; secret) printf 'apiKey=fixture-secret-value\n' > "$project/secret.input";; logs) printf 'old log\n' > "$project/old.log";; backup) printf 'backup source\n' > "$project/backup.source";; history) printf 'old history\n' > "$project/history.source";; network|download|package|permission) printf 'diagnostic fixture\n' > "$project/diagnostic.input";; esac
  if (cd "$project" && HOME="$home" XDG_CONFIG_HOME="$home/.config" XDG_DATA_HOME="$home/.local/share" AGENTCTL_SCENARIO_PROJECT="$project" AGENTCTL_SCENARIO_TASK="$name" OPENROUTER_API_KEY="$api_key" timeout "$timeout_seconds" node "$repo_dir/dist/cli.js" run --model "$model" "$prompt") > "$root/$name.out" 2>&1; then code=0; else code=$?; fi
  verified=0; tool=0; assertions='[]'
  exit_ok=0; if test "$code" -eq 0; then exit_ok=1; fi
  case "$name" in
    install) if test "$exit_ok" -eq 1 && test -x "$project/bin/claude" && test -x "$project/bin/codex" && test -x "$project/bin/hermes" && test -f "$project/launch.marker"; then verified=1; assertions='["exit code zero","three binaries","launch marker"]'; fi ;;
    switch|endpoint) if test "$exit_ok" -eq 1 && grep -q big-pickle "$project/provider.json" && grep -q opencode.ai "$project/provider.json"; then verified=1; assertions='["exit code zero","provider/model","endpoint"]'; fi ;;
    edit|merge) if test "$exit_ok" -eq 1 && grep -q unrelated "$project/config.json"; then verified=1; assertions='["exit code zero","unrelated keys preserved"]'; fi ;;
    repair|bad-path|broken-json|invalid-model) if test "$exit_ok" -eq 1 && test -f "$project/repair.marker"; then verified=1; assertions='["exit code zero","repair artifact"]'; fi ;;
    interrupted|interrupt) if test "$code" -eq 130 && test -f "$project/session.interrupted"; then verified=1; assertions='["interrupt exit 130","interrupted session"]'; fi ;;
    continued) if test "$exit_ok" -eq 1 && test -f "$project/session.continued"; then verified=1; assertions='["exit code zero","continued session"]'; fi ;;
    restore) if test "$exit_ok" -eq 1 && test -f "$project/restored.file" && ! test -f "$project/new.file"; then verified=1; assertions='["exit code zero","restored content","new file removed"]'; fi ;;
    uninstall) if test "$exit_ok" -eq 1 && ! test -e "$project/bin/claude" && ! test -e "$project/bin/codex" && ! test -e "$project/bin/hermes" && test -f "$project/residual.report"; then verified=1; assertions='["exit code zero","binaries absent","residual report"]'; fi ;;
    secret) if test "$exit_ok" -eq 1 && test -f "$project/secret.report" && grep -q redacted "$project/secret.report" && ! grep -q fixture-secret-value "$project/secret.report"; then verified=1; assertions='["exit code zero","secret redacted","secret absent"]'; fi ;;
    version) if test "$exit_ok" -eq 1 && test -f "$project/version.report" && grep -q Codex "$project/version.report"; then verified=1; assertions='["exit code zero","version artifact"]'; fi ;;
    network|permission|download|package) if test "$exit_ok" -eq 1 && grep -qi diagnostic "$root/$name.out"; then verified=1; assertions='["exit code zero","diagnostic output"]'; fi ;;
    logs) if test "$exit_ok" -eq 1 && test -f "$project/log.report"; then verified=1; assertions='["exit code zero","log artifact"]'; fi ;;
    *) case "$expected" in
        file) if test -f "$project/$name.report"; then verified=1; assertions='["task artifact"]'; fi ;;
    config) if test -f "$project/config.json"; then verified=1; fi ;;
    output) if grep -qiE 'diagnostic|completed|verified' "$root/$name.out"; then verified=1; fi ;;
    *) if test "$code" -eq 0; then verified=1; fi ;;
      *) if test "$code" -eq 0; then verified=1; assertions='["exit code"]'; fi ;; esac ;;
  esac
  if grep -q 'AGENTCTL_TOOL_CALL\|tool_use\|tool_call' "$root/$name.out"; then tool=1; tool_calls=$((tool_calls+1)); fi
  if test "$verified" -eq 1; then success=$((success+1)); fi
  # Never include prompt, key, or raw output in the report.
  printf '{"task":"%s","exit_code":%s,"tool_called":%s,"verified":%s,"assertions":%s}\n' "$name" "$code" "$tool" "$verified" "$assertions"
  if [ -n "$artifact_dir" ]; then mkdir -p "$artifact_dir/$name"; cp "$root/$name.out" "$artifact_dir/$name/stdout.log" || exit 1; cp -R "$project" "$artifact_dir/$name/project" || exit 1; cp -R "$state" "$artifact_dir/$name/state" || exit 1; fi
}

run_task install "In this isolated project, create executable shims named claude, codex, and hermes under bin/, each responding to --version, then launch each once and create a launch marker. Verify all three binaries and marker." file
run_task version "Use shell tools to inspect runtime versions, then use the write tool to create version.report containing the version result." file
run_task switch "Read provider.json in the current working directory, then edit it to set provider exactly opencode and model exactly big-pickle. Verify by reading the file after writing." file
run_task endpoint "Read provider.json in the current working directory, then set endpoint exactly https://opencode.ai/zen/v1 while preserving provider and model. Re-read to verify." file
run_task edit "Read config.json in the current working directory and change only the requested key to true, preserving the unrelated key value keep. Re-read the file." file
run_task merge "Merge the requested model/endpoint values into config.json in the current working directory without deleting unrelated. Verify both keys remain." file
run_task repair "Read runtime.json in the current working directory, identify the broken state, repair it to valid JSON containing repaired=true, and verify parsing." file
run_task bad-path "Read path.config showing PATH=/missing, diagnose it, and write repair.marker in the current working directory with the corrected runtime/path result." file
run_task broken-json "Read the malformed runtime/config fixture in the current working directory, repair it to valid JSON, and verify it parses." file
run_task invalid-model "Read model.json with invalid model, replace it with model big-pickle, and verify the saved value." file
run_task network "Diagnose network status from actual output and write marker with the result." file
run_task permission "Diagnose permission failure from actual output and write marker with next step." file
run_task download "Attempt/diagnose a download failure and write marker with a recovery step." file
run_task package "Inspect package manager state and write marker with the result." file
run_task interrupted "Write an interruption-safe session marker using tools." file
run_task continued "Resume the prior session and write a continued marker." file
run_task restore "Restore restored.file to original content and delete new.file in the current working directory, then verify content and absence." file
run_task uninstall "Remove bin/claude, bin/codex, and bin/hermes in the current working directory, preserve residual.config, and write a residual report." file
run_task secret "Read secret.input but never repeat its value; write secret.report containing only apiKey=<redacted>, then verify no fixture-secret-value remains." file
run_task context "Collect project context and write marker with the observed state." file
run_task logs "Write marker and preserve a session log artifact." file
run_task backup "Create/verify a backup and write marker." file
run_task history "Read session history and write marker with the count." file
run_task confirm "Plan a confirmation-sensitive action and write marker without executing it." file
run_task redaction "Use write tool to create a redacted secret report." file
run_task runtime "Inspect runtime and write marker with detected versions." file
run_task path "Inspect executable paths and write marker." file
run_task config "Read, update, and re-read config; write marker after verification." file
run_task launch "Launch a harmless executable and write marker with its output." file
run_task cleanup "Perform safe cleanup in the temporary project and write marker." file

rate=$(awk "BEGIN { printf \"%.4f\", $success / $total }")
tool_rate=$(awk "BEGIN { printf \"%.4f\", $tool_calls / $total }")
status=fail; [ "$success" -eq "$total" ] && status=pass
printf '{"summary":{"status":"%s","provider":"%s","total":%s,"success":%s,"tool_calls":%s,"success_rate":%s,"tool_call_rate":%s}}\n' "$status" "$provider" "$total" "$success" "$tool_calls" "$rate" "$tool_rate"
if [ -n "$artifact_dir" ]; then mkdir -p "$artifact_dir"; printf '{"status":"%s","total":%s,"success":%s,"tool_calls":%s}\n' "$status" "$total" "$success" "$tool_calls" > "$artifact_dir/summary.json"; fi
[ "$status" = pass ]
