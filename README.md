# agentctl

`agentctl` is a local coding-agent launcher for macOS and Linux. It uses
[Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) as the
execution runtime, so the selected model can use shell, filesystem, and network
tools in the current project. OpenCode anonymous is the default provider;
OpenRouter is available with an API key.

This project is an orchestration layer, not a sandbox and not a replacement for
Claude Code, Codex CLI, or Hermes. It does not provide fixed agent adapters or a
command allowlist.

## Install

Requires Node.js 22.19+ and npm. The local-source installer bootstraps Node when
needed; clone or download the repository before running it.

The one-line installer downloads the latest `main` source from GitHub, installs
the package, and launches an interactive conversation:

```sh
curl -fsSL https://raw.githubusercontent.com/apuslabs/agentctl/main/install.sh | sh
```

To install without launching (for CI or unattended use), set
`AGENTCTL_NO_LAUNCH=1`. You can also clone the repository and run the script
locally.

```sh
./install.sh
```

If `agentctl` is not found after installation, add the printed npm global bin
directory to your `PATH`, then run `agentctl` to start a conversation. On first
run it configures the provider and model as needed.

Setup defaults to currently available anonymous OpenCode models and stores no
credential. Choose OpenRouter when you already have a key created at
<https://openrouter.ai/keys>; only then is the key stored with mode `0600`.
Model catalogs are fetched at setup/runtime. Setup performs a minimal
tool-capable provider validation unless `AGENTCTL_PROVIDER_VALIDATION=skip` is
set for an offline fixture. A failed validation leaves the selected config on
disk and reports the failure; it does not silently claim the provider works.
Set `AGENTCTL_HOME` to move local state. For CI or other unattended runs,
provide
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, and `AGENTCTL_MODEL` for unattended
setup.

## Use

Start the normal interactive conversation with:

```sh
agentctl
```

## Advanced

For non-interactive tasks and session management:

```sh
agentctl run "inspect this repository and fix the failing tests"
agentctl run --model provider/model "explain the architecture"
agentctl continue
agentctl models
agentctl history
agentctl config restore-last
agentctl config restore-last-external
agentctl backup
agentctl restore external-TIMESTAMP
```

With no command, `agentctl` configures the first run if necessary and starts an
interactive Pi session. `agentctl continue` resumes the previous Pi session.
`agentctl run` is the non-interactive task form. `agentctl backup` snapshots
known Pi, Claude Code, Codex, and Hermes configuration locations; use
`agentctl restore SNAPSHOT` or `agentctl config restore-last-external` to recover
an external snapshot.

Prompts include any `AGENTS.md`, `CLAUDE.md`, `.codex/instructions.md`, and
`.hermes/instructions.md` found in the working directory. Pi runs in that
directory. A Pi extension blocks recognized destructive shell actions until the
user confirms them, and fails closed without an interactive confirmation UI.
This is not an OS sandbox and cannot classify every possible shell program.

Local state includes mode-restricted credentials, configuration backups (including
known Pi, Claude Code, Codex, and Hermes configuration files), session history,
Pi session files, and per-run logs. `OPENROUTER_API_KEY` takes precedence over
stored credentials. Stored credentials, logs, session transcripts, prompts, and
reports are redacted where the configured key is known; do not treat this as a
guarantee against secrets emitted by arbitrary tools or provider responses.

## Safety Boundary

Pi has unrestricted project shell, file, and network capabilities. The bundled
extension asks for confirmation before recognized destructive shell commands
and sensitive credential/config writes, and blocks them when no confirmation UI
is available. This is a fail-closed confirmation layer, not an OS sandbox:
arbitrary programs and novel shell syntax cannot be classified perfectly.
Review the exact command and its side effects before confirming.

## Development

```sh
npm install
npm test
npm run typecheck
```

The Docker matrix/smoke test targets Debian 12 and Ubuntu 24.04 as non-root
containers. It runs unit tests, typecheck, the offline scenario matrix, and the
fake-Pi benchmark with bind-mounted reports. By default it also runs the real
official installer smoke for Claude Code, Codex CLI, and Hermes. That installer
gate requires external network access and can fail when an official endpoint,
installer, or service is unavailable; set `AGENTCTL_INSTALL_SMOKE=0` only when
you explicitly want to skip that external gate.

```sh
./scripts/test-docker.sh
```

`scripts/scenario.sh` runs a deterministic offline matrix against a fake Pi
executable. It covers orchestration behavior, not real model quality; provider
smoke still requires credentials and network access.

Run `AGENTCTL_BENCHMARK_PROVIDER=opencode scripts/benchmark.sh` for the
30-task benchmark. OpenCode uses its anonymous public access by default;
OpenRouter accepts `AGENTCTL_BENCHMARK_API_KEY` or `OPENROUTER_API_KEY`.
Each task runs in a fresh temporary project and reports exit code, task-specific
assertions, independently detected tool-call evidence, and verified status as
JSONL. A timeout or non-zero exit is a failure even when an artifact exists.
Use `AGENTCTL_BENCHMARK_TIMEOUT` to change the per-task timeout and
`AGENTCTL_BENCHMARK_ARTIFACT_DIR` to retain task projects, state, logs, and a
summary. Missing OpenRouter credentials produce `skipped`; keys are never
included in reports. The fake-Pi result is orchestration coverage, not model
quality. Real provider success rates are external smoke results and are not
fabricated when a provider fails.

## Official Installer Smoke

`scripts/install-smoke.sh` downloads and runs the official install entrypoints
in an isolated `HOME`, then verifies binaries with `--version`:

- Claude Code: `https://claude.ai/install.sh`
- Codex CLI: `https://chatgpt.com/codex/install.sh`
- Hermes: `https://hermes-agent.nousresearch.com/install.sh`

The smoke test uses non-interactive settings and never accepts a host-installed
binary. A 403, network failure, missing binary, or failed version check is a
real failure and is reported as JSON. It does not use fake shims.

## Known Limitations

- Real provider inference, tool-call quality, latency, and model availability
  depend on external services and credentials.
- OpenCode anonymous model availability is dynamic; the catalog is filtered to
  the currently supported public free-model naming convention.
- Configuration snapshots cover known agent paths, not every file an arbitrary
  tool may modify.
- Confirmation patterns cannot prove that an unknown program is harmless.
- The remote one-line installer is not published until a release URL/domain is
  available; the current installer is for a local source checkout.
