import { spawn } from "node:child_process";
import { mkdir, writeFile, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { collectContext, SAFETY_CONTEXT } from "./context.js";
import { paths } from "./paths.js";
import { appendSession } from "./store.js";

export function buildPiArgs(provider: string, model: string, sessionDir: string, extension: string, systemPrompt: string, prompt: string, interactive: boolean, resume: boolean): string[] {
  const skill = fileURLToPath(new URL("../skills/official-agent-docs/SKILL.md", import.meta.url));
  const args = ["--provider", provider, "--model", model, "--session-dir", sessionDir, "--extension", extension, "--skill", skill, "--append-system-prompt", systemPrompt];
  if (!interactive) args.push("-p", prompt); else if (resume) args.push("--continue");
  const thinking = process.env.AGENTCTL_PI_THINKING;
  if (thinking) args.push("--thinking", thinking);
  return args;
}

export function resolvePiCli(): string {
  if (process.env.AGENTCTL_PI_CLI) return process.env.AGENTCTL_PI_CLI;
  const index = import.meta.resolve("@earendil-works/pi-coding-agent");
  return fileURLToPath(new URL("cli.js", index));
}

export function buildPiEnv(provider: string, key: string | undefined, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result = { ...env };
  delete result.OPENROUTER_API_KEY; delete result.OPENCODE_API_KEY;
  if (provider === "opencode") result.OPENCODE_API_KEY = "public";
  if (provider === "openrouter" && key) result.OPENROUTER_API_KEY = key;
  return result;
}
export function buildPiCommand(piCli: string, args: string[]): { command: string; args: string[] } {
  return /\.(?:mjs|cjs|js)$/.test(piCli) ? { command: process.execPath, args: [piCli, ...args] } : { command: piCli, args };
}

export async function validateProvider(provider: string, model: string, key: string | undefined, cwd: string, env = process.env): Promise<boolean> {
  if (env.AGENTCTL_PROVIDER_VALIDATION === "skip") return true;
  const token = "AGENTCTL_VALIDATION_OK";
  const result = await runAgentResult("Perform a minimal tool-capable validation. Reply with the exact token AGENTCTL_VALIDATION_OK after checking the current directory.", provider, model, key, cwd, env);
  return result.code === 0 && result.output.includes(token);
}

export async function runAgentResult(prompt: string, provider: string, model: string, key: string | undefined, cwd: string, env = process.env): Promise<{ code: number; output: string }> {
  const id = randomUUID(); const p = paths(env); await mkdir(p.logs, { recursive: true, mode: 0o700 }); const logFile = path.join(p.logs, `${id}.log`);
  const redact = (value: string) => key ? value.split(key).join("<redacted>") : value;
  const context = await collectContext(cwd); const fullPrompt = `${SAFETY_CONTEXT}\n\n${context ? `Project context:\n${context}\n\n` : ""}User request:\n${prompt}`;
  await appendSession({ id, startedAt: new Date().toISOString(), cwd, model, promptPreview: redact(prompt.slice(0, 200)), logFile }, env);
  const args = buildPiArgs(provider, model, path.join(p.root, "pi-sessions"), fileURLToPath(new URL("./extension.js", import.meta.url)), fullPrompt, prompt, false, false);
  const invocation = buildPiCommand(resolvePiCli(), args); const child = spawn(invocation.command, invocation.args, { cwd, stdio: ["inherit", "pipe", "pipe"], env: buildPiEnv(provider, key, env) }); const chunks: Buffer[] = [];
  child.stdout?.on("data", chunk => { const safe = redact(String(chunk)); process.stdout.write(safe); chunks.push(Buffer.from(safe)); }); child.stderr?.on("data", chunk => { const safe = redact(String(chunk)); process.stderr.write(safe); chunks.push(Buffer.from(safe)); });
  const code = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("close", value => resolve(value ?? 1)); }); const output = Buffer.concat(chunks).toString(); await writeFile(logFile, output, { mode: 0o600 }); return { code, output };
}

async function redactSessionFiles(root: string, key: string | undefined): Promise<void> {
  if (!key) return;
  const secret = key;
  async function walk(dir: string): Promise<void> { for (const name of await readdir(dir)) { const file = path.join(dir, name); const info = await stat(file); if (info.isDirectory()) await walk(file); else { const content = await readFile(file, "utf8"); await writeFile(file, content.split(secret).join("<redacted>"), { mode: info.mode & 0o777 }); } } }
  try { await walk(root); } catch { /* session dir may not exist */ }
}

export async function runAgent(prompt: string, provider: string, model: string, key: string | undefined, cwd: string, env = process.env, interactive = false, resume = false): Promise<number> {
  const id = randomUUID();
  const p = paths(env);
  await mkdir(p.logs, { recursive: true, mode: 0o700 });
  const logFile = path.join(p.logs, `${id}.log`);
  const context = await collectContext(cwd);
  const fullPrompt = `${SAFETY_CONTEXT}\n\n${context ? `Project context:\n${context}\n\n` : ""}User request:\n${prompt}`;
  const redact = (value: string) => key ? value.split(key).join("<redacted>") : value;
  const record = { id, startedAt: new Date().toISOString(), cwd, model, promptPreview: redact(prompt.slice(0, 200)), logFile };
  await appendSession(record, env);
  const args = buildPiArgs(provider, model, path.join(p.root, "pi-sessions"), fileURLToPath(new URL("./extension.js", import.meta.url)), fullPrompt, prompt, interactive, resume);
  const piCli = resolvePiCli();
  const invocation = buildPiCommand(piCli, args);
  const child = spawn(invocation.command, invocation.args, {
    cwd, stdio: ["inherit", "pipe", "pipe"], env: buildPiEnv(provider, key, env)
  });
  if (interactive) {
    const chunks: Buffer[] = []; const redact = (value: string) => key ? value.split(key).join("<redacted>") : value;
    child.stdout?.on("data", chunk => { const safe = redact(String(chunk)); process.stdout.write(safe); chunks.push(Buffer.from(safe)); });
    child.stderr?.on("data", chunk => { const safe = redact(String(chunk)); process.stderr.write(safe); chunks.push(Buffer.from(safe)); });
    return await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("close", async value => { await writeFile(logFile, Buffer.concat(chunks), { mode: 0o600 }); await redactSessionFiles(path.join(p.root, "pi-sessions"), key); resolve(value ?? 1); }); });
  }
  const chunks: Buffer[] = [];
  child.stdout?.on("data", chunk => { const safe = redact(String(chunk)); process.stdout.write(safe); chunks.push(Buffer.from(safe)); });
  child.stderr?.on("data", chunk => { const safe = redact(String(chunk)); process.stderr.write(safe); chunks.push(Buffer.from(safe)); });
  const code = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("close", value => resolve(value ?? 1)); });
  await writeFile(logFile, Buffer.concat(chunks), { mode: 0o600 });
  await redactSessionFiles(path.join(p.root, "pi-sessions"), key);
  await appendSession({ ...record, endedAt: new Date().toISOString(), exitCode: code }, env);
  return code;
}
