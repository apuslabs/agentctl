#!/bin/sh
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temp_config=""
if [ -z "${DOCKER_CONFIG:-}" ] && ! command -v docker-credential-desktop >/dev/null 2>&1; then
  temp_config=$(mktemp -d)
  printf '%s\n' '{"auths":{}}' > "$temp_config/config.json"
  export DOCKER_CONFIG="$temp_config"
  trap 'rm -rf "$temp_config"' EXIT
fi
for pair in "debian:12-slim agentctl-test-debian" "ubuntu:24.04 agentctl-test-ubuntu"; do
  set -- $pair
  docker build --build-arg BASE="$1" -t "$2" -f "$repo_dir/Dockerfile.test" "$repo_dir"
  report_dir=$(mktemp -d)
  docker run --rm -u 10001:10001 -v "$report_dir:/tmp/agentctl-report" "$2" sh -c 'node dist/cli.js --help >/tmp/agentctl-report/help.txt && sh scripts/scenario.sh >/tmp/agentctl-report/scenario.jsonl && AGENTCTL_PI_CLI=/app/scripts/fake-pi.sh AGENTCTL_BENCHMARK_ARTIFACT_DIR=/tmp/agentctl-report/artifacts scripts/benchmark.sh >/tmp/agentctl-report/benchmark.jsonl'
  grep -q '"failed":0' "$report_dir/scenario.jsonl"
  grep -q '"status":"pass"' "$report_dir/benchmark.jsonl"
  test -s "$report_dir/benchmark.jsonl"
  test -s "$report_dir/artifacts/summary.json"
  if [ "${AGENTCTL_INSTALL_SMOKE:-1}" = 1 ]; then
    if ! docker run --rm -u 10001:10001 -v "$report_dir:/tmp/agentctl-report" "$2" sh /app/scripts/install-smoke.sh >"$report_dir/install-smoke.jsonl"; then
      echo "Install smoke failed; report retained at: $report_dir" >&2
      exit 1
    fi
  fi
  rm -rf "$report_dir"
done
