import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function ask(question: string, hidden = false): Promise<string> {
  if (!stdin.isTTY) throw new Error("Interactive input is required. For unattended setup, set AGENTCTL_PROVIDER, AGENTCTL_MODEL, and (for OpenRouter) OPENROUTER_API_KEY.");
  if (hidden) {
    stdout.write(question);
    stdin.setRawMode?.(true);
    let value = "";
    for await (const chunk of stdin) {
      const text = String(chunk);
      if (text === "\r" || text === "\n") break;
      if (text === "\u0003") { stdin.setRawMode?.(false); stdout.write("\n"); process.exit(130); }
      if (text === "\u007f") value = value.slice(0, -1); else value += text;
    }
    stdin.setRawMode?.(false); stdout.write("\n"); return value.trim();
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}
