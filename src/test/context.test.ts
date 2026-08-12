import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectContext, redactConfig } from "../context.js";

test("collects known instruction hints without an adapter schema", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agentctl-context-"));
  await mkdir(path.join(cwd, ".codex"));
  await writeFile(path.join(cwd, "AGENTS.md"), "agent notes");
  await writeFile(path.join(cwd, ".codex/instructions.md"), "codex notes");
  const context = await collectContext(cwd);
  assert.match(context, /agent notes/);
  assert.match(context, /codex notes/);
});

test("redacts quoted JSON, loose config, and env secrets", () => {
  const json = redactConfig('{"apiKey":"secret-one", "token": "secret-two", password=secret-three}');
  assert.doesNotMatch(json, /secret-(?:one|two|three)/);
  assert.equal(redactConfig("OPENROUTER_API_KEY=secret\n# note\nTOKEN=other", true), "OPENROUTER_API_KEY=<redacted>\nTOKEN=<redacted>");
});
