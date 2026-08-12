# Contributing

## Development

Use Node.js 22.19 or newer.

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
```

For deterministic offline coverage:

```sh
sh scripts/scenario.sh
AGENTCTL_PI_CLI=$PWD/scripts/fake-pi.sh scripts/benchmark.sh
```

The Docker matrix validates Debian 12 and Ubuntu 24.04 as non-root containers:

```sh
./scripts/test-docker.sh
```

The Docker command includes an external official installer smoke for Claude
Code, Codex CLI, and Hermes. It requires network access and may fail when an
official endpoint is unavailable. Set `AGENTCTL_INSTALL_SMOKE=0` only when that
external gate is intentionally out of scope for a local run.

## Security and Scope

Do not add provider API keys, session transcripts, or generated reports to git.
Keep provider URLs and model IDs runtime-discoverable. Do not introduce fixed
agent adapters, command allowlists, or an OS-sandbox claim. Changes to shell
confirmation, credential handling, snapshots, or report redaction require
focused tests.

Offline fake-Pi results validate orchestration and artifact assertions only.
They are not evidence of model quality or provider availability. Real provider
failures must remain failures in benchmark output.
