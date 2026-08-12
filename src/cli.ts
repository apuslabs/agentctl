#!/usr/bin/env node
import { discoverFreeModels, discoverOpenCodeModels } from "./openrouter.js";
import { ask } from "./prompt.js";
import { loadConfig, loadKey, readSessions, restoreExternalSnapshot, restoreLastConfig, restoreLastExternal, saveConfig, saveKey, snapshotExternalConfig } from "./store.js";
import { runAgent, validateProvider } from "./runner.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

function usage(): never {
  console.log(`agentctl setup\nagentctl models\nagentctl run [--model ID] [PROMPT...]\nagentctl continue\nagentctl history [--json]\nagentctl backup\nagentctl restore SNAPSHOT\nagentctl config restore-last`);
  process.exit(0);
}

async function setup(): Promise<void> {
  const existing = await loadConfig();
  const choice = process.env.AGENTCTL_PROVIDER || (process.stdin.isTTY ? await ask("Provider: OpenCode anonymous (1) or OpenRouter key (2) [1]: ") : "1");
  const provider = choice === "2" || choice === "openrouter" ? "openrouter" : "opencode";
  if (provider === "openrouter") console.log("Create/manage your key at https://openrouter.ai/keys");
  const key = provider === "openrouter" ? (process.env.OPENROUTER_API_KEY || await ask("OpenRouter API key: ", true)) : "public";
  if (!key) throw new Error("OpenRouter API key is required");
  const base = process.env.OPENROUTER_BASE_URL || existing?.openRouterBaseUrl || DEFAULT_BASE_URL;
  const models = provider === "opencode" ? await discoverOpenCodeModels() : await discoverFreeModels(base, key);
  if (!models.length) throw new Error("No available models were discovered");
  console.log(models.map((m, i) => `${i + 1}. ${m.id}${m.name ? ` - ${m.name}` : ""}`).join("\n"));
  const requested = process.env.AGENTCTL_MODEL || (process.stdin.isTTY ? await ask(`Choose model [1-${models.length}] (1): `) : "1");
  const model = models[Math.max(0, Number(requested || "1") - 1)]?.id;
  if (!model) throw new Error("Invalid model selection");
  const now = new Date().toISOString();
  await saveKey(provider === "openrouter" ? key : undefined);
  await saveConfig({ version: 1, provider, openRouterBaseUrl: base, model, createdAt: existing?.createdAt || now, updatedAt: now });
  if (process.env.AGENTCTL_PROVIDER_VALIDATION !== "skip") {
    const valid = await validateProvider(provider, model, provider === "openrouter" ? key : undefined, process.cwd());
    if (!valid) throw new Error("Provider validation failed after catalog discovery; configuration was saved, retry with AGENTCTL_PROVIDER_VALIDATION=skip");
    console.log(`Provider validation passed: discovered ${models.length} model(s); tool-capable request completed.`);
  } else console.log(`Provider catalog discovery: found ${models.length} available model(s); validation skipped.`);
  console.log(`Configured model: ${model}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help") usage();
  if (!command) {
    let config = await loadConfig(); if (!config) { await setup(); config = await loadConfig(); }
    const key = config?.provider === "openrouter" ? await loadKey() : undefined; if (!config?.model || (config.provider === "openrouter" && !key)) throw new Error("Setup incomplete");
    console.log(`Recovery snapshot: ${await snapshotExternalConfig(process.cwd())}`);
    process.exitCode = await runAgent("Interactive coding session", config.provider, config.model, key, process.cwd(), process.env, process.stdin.isTTY); return;
  }
  if (command === "setup") return setup();
  const config = await loadConfig();
  if (!config) throw new Error("Not configured. Run: agentctl setup");
  if (command === "models") {
    const models = config.provider === "opencode" ? await discoverOpenCodeModels() : await discoverFreeModels(config.openRouterBaseUrl, await loadKey());
    console.log(models.map(m => m.id).join("\n")); return;
  }
  if (command === "history") {
    const sessions = await readSessions();
    if (args.includes("--json")) console.log(JSON.stringify(sessions, null, 2));
    else console.log(sessions.map(s => `${s.startedAt}  ${s.model}  ${s.cwd}  ${s.promptPreview}`).join("\n"));
    return;
  }
  if (command === "config" && args[0] === "restore-last") { console.log(`Restored ${await restoreLastConfig()}`); return; }
  if (command === "config" && args[0] === "restore-last-external") { console.log(`Restored ${await restoreLastExternal()}`); return; }
  if (command === "backup") { console.log(await snapshotExternalConfig(process.cwd())); return; }
  if (command === "restore" && args[0]) { await restoreExternalSnapshot(args[0]); console.log(`Restored ${args[0]}`); return; }
  if (command === "continue") {
    const key = config.provider === "openrouter" ? await loadKey() : undefined; if (!config.model || (config.provider === "openrouter" && !key)) throw new Error("Setup incomplete");
    console.log(`Recovery snapshot: ${await snapshotExternalConfig(process.cwd())}`);
    process.exitCode = await runAgent("Continue prior session", config.provider, config.model, key, process.cwd(), process.env, true, true); return;
  }
  if (command === "run") {
    console.log(`Recovery snapshot: ${await snapshotExternalConfig(process.cwd())}`);
    const index = args.indexOf("--model");
    const model = index >= 0 ? args[index + 1] : config.model;
    if (index >= 0) args.splice(index, 2);
    if (!model) throw new Error("No model selected. Run setup or pass --model ID");
    const key = config.provider === "openrouter" ? await loadKey() : undefined;
    if (config.provider === "openrouter" && !key) throw new Error("OpenRouter key missing. Run: agentctl setup");
    const prompt = args.join(" ") || (process.stdin.isTTY ? await ask("Task: ") : await new Promise<string>(resolve => { let data = ""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => resolve(data.trim())); }));
    if (!prompt) throw new Error("A task prompt is required");
    process.exitCode = await runAgent(prompt, config.provider, model, key, process.cwd()); return;
  }
  usage();
}

main().catch(error => { console.error(`agentctl: ${(error as Error).message}`); process.exitCode = 1; });
