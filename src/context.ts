import { access, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const FILES = ["AGENTS.md", "CLAUDE.md", ".codex/instructions.md", ".hermes/instructions.md"];

export function redactConfig(content: string, envFile = false): string {
  if (envFile) return content.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#")).map(line => `${line.split("=", 1)[0]}=<redacted>`).join("\n");
  return content
    .replace(/(["']?(?:api[_-]?key|token|secret|password)["']?\s*[=:]\s*)["']([^"']*)["']/gi, "$1\"<redacted>\"")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,}\]]+/gi, "$1<redacted>");
}

export async function collectContext(cwd: string): Promise<string> {
  const chunks: string[] = [];
  for (const relative of FILES) {
    const file = path.join(cwd, relative);
    try { await access(file); chunks.push(`## ${relative}\n${(await readFile(file, "utf8")).slice(0, 100_000)}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const commands = ["node", "npm", "pnpm", "yarn", "bun", "python3", "pip3", "git", "docker", "claude", "codex", "hermes"];
  const exec = promisify(execFile);
  const states = await Promise.all(commands.map(async command => {
    try {
      const located = await exec(process.platform === "win32" ? "where" : "sh", process.platform === "win32" ? [command] : ["-lc", `command -v ${command}`], { timeout: 1500 });
      let version = "";
      try { version = (await exec(command, ["--version"], { timeout: 2000 })).stdout.trim().split("\n")[0]; } catch (e) { version = `version-error: ${(e as Error).message.split("\n")[0]}`; }
      return `${command}: ${located.stdout.trim()} | ${version}`;
    } catch { return `${command}: not found`; }
  }));
  const configFiles = [
    path.join(os.homedir(), ".claude/settings.json"), path.join(os.homedir(), ".claude.json"),
    path.join(cwd, ".claude/settings.json"), path.join(cwd, ".claude/settings.local.json"), path.join(cwd, ".mcp.json"),
    path.join(os.homedir(), ".codex/config.toml"), path.join(cwd, ".codex/config.toml"),
    path.join(os.homedir(), ".hermes/config.yaml"), path.join(os.homedir(), ".hermes/.env")
  ];
  const configs = await Promise.all(configFiles.map(async file => {
    try { const content = await readFile(file, "utf8"); return `${file}: exists\n${redactConfig(content, file.endsWith(".env")).slice(0, 20_000)}`; }
    catch (e) { return `${file}: ${(e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : `error ${(e as Error).message}`}`; }
  }));
  chunks.push(`## Runtime\nOS: ${os.platform()} ${os.release()}\nArch: ${os.arch()}\nShell: ${process.env.SHELL || "unknown"}\nPATH: ${process.env.PATH || ""}\n${states.join("\n")}`);
  chunks.push(`## Agent configuration state\n${configs.join("\n")}`);
  return chunks.join("\n\n");
}

export const SAFETY_CONTEXT = `You have unrestricted shell, file, and network access. Treat these as operational hints, not fixed adapters: Claude Code official install is https://claude.ai/install.sh with config at ~/.claude/settings.json and ~/.claude.json; Codex official install is https://chatgpt.com/codex/install.sh with config at ~/.codex/config.toml; Hermes official install is https://hermes-agent.nousresearch.com/install.sh with config at ~/.hermes/config.yaml and ~/.hermes/.env. Prefer official sources and diagnose from actual command output. Preserve unrelated configuration, verify outcomes beyond exit codes, and explain failures plus the next concrete step. Before deleting data, overwriting material user data or credentials, changing history, destroying infrastructure, revoking access, or incurring material cost, obtain explicit confirmation for the exact action. Do not treat the initial request as confirmation for an unshown destructive command.`;
