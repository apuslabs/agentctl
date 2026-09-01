import assert from "node:assert/strict";
import test from "node:test";

import { validateRedirect, validateUrl } from "./fetch-doc.mjs";

test("allows supported official HTTPS sources", () => {
  const allowed = [
    "https://claude.ai/install.sh",
    "https://docs.anthropic.com/en/docs/claude-code/overview",
    "https://chatgpt.com/codex/install.sh",
    "https://developers.openai.com/codex/cli/reference/",
    "https://platform.openai.com/docs/api-reference/responses",
    "https://hermes-agent.nousresearch.com/docs/",
  ];

  for (const value of allowed) assert.equal(validateUrl(value).href, value);
});

test("rejects non-HTTPS, credentials, unknown hosts, and unsupported paths", () => {
  const rejected = [
    "http://platform.openai.com/docs/",
    "https://user:secret@docs.anthropic.com/",
    "https://example.com/codex/",
    "https://claude.ai/not-the-installer",
    "https://chatgpt.com/codex/",
    "https://developers.openai.com/api/",
  ];

  for (const value of rejected) {
    assert.throws(() => validateUrl(value), /not an allowed official HTTPS source/);
  }
});

test("validates absolute and relative redirect targets", () => {
  assert.equal(
    validateRedirect("../reference/", new URL("https://platform.openai.com/docs/api/overview")).href,
    "https://platform.openai.com/docs/reference/",
  );
  assert.throws(
    () => validateRedirect("https://attacker.example/docs/", new URL("https://platform.openai.com/docs/")),
    /not an allowed official HTTPS source/,
  );
});
