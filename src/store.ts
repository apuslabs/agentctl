import { chmod, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Config, SessionRecord } from "./types.js";
import { paths } from "./paths.js";

async function atomicWrite(file: string, value: string, mode = 0o600): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, value, { mode });
  await rename(temp, file);
  await chmod(file, mode);
}

export async function loadConfig(env = process.env): Promise<Config | undefined> {
  try { return JSON.parse(await readFile(paths(env).config, "utf8")) as Config; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function saveConfig(config: Config, env = process.env): Promise<void> {
  const p = paths(env);
  await mkdir(p.backups, { recursive: true, mode: 0o700 });
  try {
    await stat(p.config);
    await copyFile(p.config, path.join(p.backups, `config-${Date.now()}.json`));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await atomicWrite(p.config, `${JSON.stringify(config, null, 2)}\n`);
}

export async function saveKey(key: string | undefined, env = process.env): Promise<void> {
  if (!key) { await rm(paths(env).credentials, { force: true }); return; }
  await atomicWrite(paths(env).credentials, `${JSON.stringify({ openRouterApiKey: key })}\n`);
}

export async function loadKey(env = process.env): Promise<string | undefined> {
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  try { return (JSON.parse(await readFile(paths(env).credentials, "utf8")) as { openRouterApiKey: string }).openRouterApiKey; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

export async function appendSession(record: SessionRecord, env = process.env): Promise<void> {
  const p = paths(env);
  await mkdir(p.root, { recursive: true, mode: 0o700 });
  await writeFile(p.sessions, `${JSON.stringify(record)}\n`, { flag: "a", mode: 0o600 });
}

export async function readSessions(env = process.env): Promise<SessionRecord[]> {
  try { return (await readFile(paths(env).sessions, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

export async function restoreLastConfig(env = process.env): Promise<string> {
  const p = paths(env);
  const files = (await readdir(p.backups)).filter(f => /^config-\d+\.json$/.test(f)).sort().reverse();
  if (!files[0]) throw new Error("No configuration backup found");
  await copyFile(path.join(p.backups, files[0]), p.config);
  await chmod(p.config, 0o600);
  return files[0];
}

export async function snapshotExternalConfig(cwd: string, env = process.env): Promise<string> {
  const p = paths(env); const id = `external-${Date.now()}`; const root = path.join(p.backups, id);
  const candidates = [path.join(os.homedir(), ".pi/agent/settings.json"), path.join(os.homedir(), ".claude/settings.json"), path.join(os.homedir(), ".claude.json"), path.join(os.homedir(), ".codex/config.toml"), path.join(os.homedir(), ".hermes/config.yaml"), path.join(os.homedir(), ".hermes/.env"), path.join(cwd, ".claude/settings.json"), path.join(cwd, ".claude/settings.local.json"), path.join(cwd, ".codex/config.toml"), path.join(cwd, ".mcp.json")];
  const manifest: Array<{ source: string; existed: boolean; backup?: string; mode?: number }> = [];
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const source of candidates) try { const info = await stat(source); const backup = `${manifest.length}.bak`; await copyFile(source, path.join(root, backup)); manifest.push({ source, existed: true, backup, mode: info.mode & 0o777 }); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") manifest.push({ source, existed: false }); else throw e; }
  await atomicWrite(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2)); return id;
}

export async function restoreExternalSnapshot(id: string, env = process.env): Promise<void> {
  if (!/^external-\d+$/.test(id)) throw new Error("Invalid snapshot ID");
  const root = path.join(paths(env).backups, id); const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Array<{ source: string; existed: boolean; backup?: string; mode?: number }>;
  for (const item of manifest) { if (!item.existed) { await rm(item.source, { force: true }); continue; } await mkdir(path.dirname(item.source), { recursive: true }); await copyFile(path.join(root, item.backup!), item.source); if (item.mode !== undefined) await chmod(item.source, item.mode); }
}

export async function restoreLastExternal(env = process.env): Promise<string> {
  const files = (await readdir(paths(env).backups)).filter(f => /^external-\d+$/.test(f)).sort().reverse();
  if (!files[0]) throw new Error("No external configuration snapshot found"); await restoreExternalSnapshot(files[0], env); return files[0];
}
