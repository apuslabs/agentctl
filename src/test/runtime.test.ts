import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPiArgs, buildPiCommand, buildPiEnv, resolvePiCli, runAgent, validateProvider } from "../runner.js";
import { isDestructiveCommand, isSensitiveWrite } from "../extension.js";

test("resolves the Pi executable and builds provider/session arguments", () => {
  assert.equal(path.basename(resolvePiCli()), "cli.js");
  const args = buildPiArgs("opencode", "big-pickle", "/sessions", "/gate.js", "system", "task", false, false);
  assert.deepEqual(args.slice(0, 6), ["--provider", "opencode", "--model", "big-pickle", "--session-dir", "/sessions"]);
  assert.deepEqual(args.slice(-2), ["-p", "task"]);
});

test("injects only the selected provider credential", () => {
  const base = { PATH: "/bin", OPENROUTER_API_KEY: "stale-router", OPENCODE_API_KEY: "stale-code" };
  const openCode = buildPiEnv("opencode", undefined, base);
  assert.equal(openCode.OPENCODE_API_KEY, "public"); assert.equal(openCode.OPENROUTER_API_KEY, undefined);
  const openRouter = buildPiEnv("openrouter", "actual-secret", base);
  assert.equal(openRouter.OPENROUTER_API_KEY, "actual-secret"); assert.equal(openRouter.OPENCODE_API_KEY, undefined);
});

test("allows an explicit offline Pi CLI fixture", () => {
  const previous = process.env.AGENTCTL_PI_CLI;
  process.env.AGENTCTL_PI_CLI = "/tmp/fake-pi";
  try { assert.equal(resolvePiCli(), "/tmp/fake-pi"); } finally {
    if (previous === undefined) delete process.env.AGENTCTL_PI_CLI; else process.env.AGENTCTL_PI_CLI = previous;
  }
});

test("runs shell fixtures directly and JS Pi through Node", () => {
  assert.equal(buildPiCommand("/tmp/fake-pi.sh", ["-p"]).command, "/tmp/fake-pi.sh");
  assert.equal(buildPiCommand("/tmp/pi-cli.js", ["-p"]).command, process.execPath);
});

test("adds thinking level only when configured", () => {
  const old = process.env.AGENTCTL_PI_THINKING;
  process.env.AGENTCTL_PI_THINKING = "minimal";
  try { assert.deepEqual(buildPiArgs("opencode", "fixture", "/s", "/x.js", "s", "p", false, false).slice(-4), ["-p", "p", "--thinking", "minimal"]); }
  finally { if (old === undefined) delete process.env.AGENTCTL_PI_THINKING; else process.env.AGENTCTL_PI_THINKING = old; }
});

test("provider validation requires the explicit token", async () => {
  const previous = process.env.AGENTCTL_PI_CLI; process.env.AGENTCTL_PI_CLI = "/bin/sh";
  try { assert.equal(await validateProvider("opencode", "fixture", undefined, process.cwd(), { ...process.env, AGENTCTL_PROVIDER_VALIDATION: "skip" }), true); }
  finally { if (previous === undefined) delete process.env.AGENTCTL_PI_CLI; else process.env.AGENTCTL_PI_CLI = previous; }
});

test("redacts nested Pi session JSONL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentctl-pi-redact-"));
  const fake = path.join(root, "fake-pi.js");
  await writeFile(fake, `#!/usr/bin/env node\nimport { mkdir, writeFile } from 'node:fs/promises';\nconst i=process.argv.indexOf('--session-dir'); const d=process.argv[i+1]; await mkdir(d+'/nested',{recursive:true}); await writeFile(d+'/nested/session.jsonl', 'secret-key\\n'); console.log('AGENTCTL_TOOL_CALL');\n`);
  process.env.AGENTCTL_PI_CLI = fake; const env = { AGENTCTL_HOME: root, ...process.env };
  await runAgent("redact", "openrouter", "fixture", "secret-key", root, env);
  const content = await readFile(path.join(root, "pi-sessions/nested/session.jsonl"), "utf8").catch(() => "");
  assert.equal(content.includes("secret-key"), false);
  delete process.env.AGENTCTL_PI_CLI;
});

test("classifies destructive shell operations", () => {
  assert.equal(isDestructiveCommand("rm -rf ./data"), true);
  assert.equal(isDestructiveCommand("git push origin main --force"), true);
  assert.equal(isDestructiveCommand("npm test"), false);
  assert.equal(isDestructiveCommand("sudo apt remove package"), true);
  assert.equal(isDestructiveCommand("pnpm uninstall foo"), true);
  assert.equal(isSensitiveWrite("write", { path: "/tmp/.hermes/.env" }), true);
  assert.equal(isSensitiveWrite("write", { path: "/tmp/project/package.json" }), false);
});
