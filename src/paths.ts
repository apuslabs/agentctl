import os from "node:os";
import path from "node:path";

export function dataHome(env = process.env): string {
  return env.AGENTCTL_HOME || path.join(env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "agentctl");
}

export function paths(env = process.env) {
  const root = dataHome(env);
  return {
    root,
    config: path.join(root, "config.json"),
    credentials: path.join(root, "credentials.json"),
    sessions: path.join(root, "sessions.jsonl"),
    logs: path.join(root, "logs"),
    backups: path.join(root, "backups")
  };
}
