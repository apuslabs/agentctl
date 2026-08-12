import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, loadKey, restoreExternalSnapshot, restoreLastConfig, saveConfig, saveKey, snapshotExternalConfig } from "../store.js";

test("stores credentials privately and restores prior config", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "agentctl-test-"));
  const env = { AGENTCTL_HOME: home } as NodeJS.ProcessEnv;
  await saveKey("secret", env);
  assert.equal((await stat(path.join(home, "credentials.json"))).mode & 0o777, 0o600);
  assert.equal(await loadKey(env), "secret");
  const first = { version: 1 as const, provider: "openrouter" as const, openRouterBaseUrl: "https://one", model: "a", createdAt: "1", updatedAt: "1" };
  await saveConfig(first, env);
  await saveConfig({ ...first, model: "b", updatedAt: "2" }, env);
  await restoreLastConfig(env);
  assert.deepEqual(await loadConfig(env), first);
});

test("external restore restores content and removes files absent at snapshot", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "agentctl-home-")); const cwd = await mkdtemp(path.join(os.tmpdir(), "agentctl-cwd-"));
  const oldHome = process.env.HOME; process.env.HOME = home;
  try {
    await mkdir(path.join(cwd, ".codex")); await writeFile(path.join(cwd, ".codex/config.toml"), "old", { mode: 0o640 });
    const env = { AGENTCTL_HOME: path.join(home, "data") }; const id = await snapshotExternalConfig(cwd, env);
    await writeFile(path.join(cwd, ".codex/config.toml"), "new"); await mkdir(path.join(cwd, ".claude")); await writeFile(path.join(cwd, ".claude/settings.json"), "created");
    await restoreExternalSnapshot(id, env); assert.equal(await readFile(path.join(cwd, ".codex/config.toml"), "utf8"), "old");
    await assert.rejects(access(path.join(cwd, ".claude/settings.json")));
  } finally { if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome; }
});

test("environment key takes precedence", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "agentctl-test-"));
  await writeFile(path.join(home, "unused"), "");
  assert.equal(await loadKey({ AGENTCTL_HOME: home, OPENROUTER_API_KEY: "env-key" }), "env-key");
});
