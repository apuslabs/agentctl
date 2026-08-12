import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const destructive = [
  /\brm\s+(?:[^\n]*\s)?-(?:[^\s]*r[^\s]*f|[^\s]*f[^\s]*r)\b/i,
  /\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*f|push\s+[^\n]*--force)\b/i,
  /\b(?:mkfs|fdisk|shutdown|reboot)\b/i,
  /\b(?:kubectl\s+delete|terraform\s+destroy|docker\s+(?:system\s+prune|volume\s+rm))\b/i,
  /\b(?:chmod|chown)\s+(?:[^\n]*\s)?(?:\/|~)\b/i,
  /(?:>|tee\s+)(?:\s*)(?:\/etc\/|\/dev\/)/i
];
const approvedDestructive = [
  /\bsudo\b/i, /\b(?:npm|pnpm|yarn)\s+(?:uninstall|remove)\b/i, /\bbrew\s+uninstall\b/i,
  /\b(?:apt|dnf|yum|pacman)\s+(?:remove|uninstall)\b/i, /\bpip(?:3)?\s+uninstall\b/i
];
const sensitivePath = /(?:\.hermes[\\/]\.env|agentctl[\\/]credentials\.json|(?:\.claude|\.codex)[\\/].*(?:auth|token|key|secret|credential)|(?:^|[\\/])\.env(?:$|[\\/]))/i;

export function isDestructiveCommand(command: string): boolean { return destructive.some(pattern => pattern.test(command)) || approvedDestructive.some(pattern => pattern.test(command)); }
export function isSensitiveWrite(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== "edit" && toolName !== "write") return false;
  return sensitivePath.test(String(input.path || input.file_path || input.file || ""));
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const input = event.input as Record<string, unknown>;
    const command = String(input.command || "");
    if (event.toolName !== "bash" && !isSensitiveWrite(event.toolName, input)) return;
    if (event.toolName === "bash" && !isDestructiveCommand(command)) return;
    if (!ctx.hasUI) return { block: true, reason: "Destructive shell command blocked because confirmation UI is unavailable" };
    const allowed = await ctx.ui.confirm(event.toolName === "bash" ? "Destructive operation" : "Sensitive credential/config overwrite", command || String(input.path || input.file_path));
    if (!allowed) return { block: true, reason: "Destructive shell command rejected by user" };
  });
}
