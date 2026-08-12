# Agent Notes

- Requires Node.js 22.19+ and npm.
- Install with `npm install`; build with `npm run build`.
- Run all checks with `npm test && npm run typecheck`.
- Run offline orchestration validation with `sh scripts/scenario.sh`.
- Run the 30-task fake benchmark with `AGENTCTL_PI_CLI=$PWD/scripts/fake-pi.sh scripts/benchmark.sh`.
- Run the Debian/Ubuntu Docker matrix with `./scripts/test-docker.sh`; it includes the external official-install smoke by default.
- Keep provider URLs configurable and discover model IDs at runtime.
- Never print or persist API keys outside the mode-0600 credentials file.
- Session files, logs, and benchmark reports must redact known provider keys.
- Pi is the execution runtime; do not add command allowlists or fixed agent adapters.
- Preserve the distinction between fake/offline orchestration results and real provider or official installer results.
- If an external provider or installer fails, report the failure rather than converting it to a pass.
