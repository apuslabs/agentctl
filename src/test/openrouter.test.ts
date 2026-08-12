import assert from "node:assert/strict";
import test from "node:test";
import { discoverFreeModels, discoverOpenCodeModels } from "../openrouter.js";

test("discovers and sorts only zero-cost models", async () => {
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://example.test/api/v1/models");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
    return new Response(JSON.stringify({ data: [
      { id: "z/free", pricing: { prompt: "0", completion: "0" } },
      { id: "a/free", pricing: { prompt: "0.0", completion: "0" } },
      { id: "paid", pricing: { prompt: "0.1", completion: "0" } }
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual((await discoverFreeModels("https://example.test/api/v1/", "secret", fakeFetch)).map(m => m.id), ["a/free", "z/free"]);
});

test("OpenCode anonymous catalog keeps only public free model IDs", async () => {
  const models = await discoverOpenCodeModels(async () => new Response(JSON.stringify({ data: [
    { id: "alpha-free" }, { id: "big-pickle" }, { id: "paid-model" }
  ] }), { status: 200 }));
  assert.deepEqual(models.map(model => model.id), ["alpha-free", "big-pickle"]);
});

test("reports provider failure without leaking credentials", async () => {
  await assert.rejects(discoverFreeModels("https://example.test", "very-secret", async () => new Response("no", { status: 503 })), /503/);
});
