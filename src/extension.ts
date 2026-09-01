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
const beginnerHelp =
  "agentctl is ready. I can help you set up providers, inspect status, switch models, and manage sessions.\n\n" +
  "Try /agentctl help, /agentctl setup, /agentctl providers, or /agentctl status.\n" +
  "You can also ask naturally, for example: \"How do I set up agentctl?\" or \"Show my providers\".\n\n" +
  "Before risky actions such as deleting files, resetting Git, or changing credentials, I will show you the command and ask for confirmation.";

export function isDestructiveCommand(command: string): boolean { return destructive.some(pattern => pattern.test(command)) || approvedDestructive.some(pattern => pattern.test(command)); }
export function isSensitiveWrite(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== "edit" && toolName !== "write") return false;
  return sensitivePath.test(String(input.path || input.file_path || input.file || ""));
}

export default function (pi: ExtensionAPI) {
  const selectModel = async (ctx: Parameters<Parameters<ExtensionAPI["on"]>[1]>[1]) => {
    if (!ctx.hasUI) return;
    const available = ctx.modelRegistry.getAvailable();
    const free = available.filter(model =>
      (model.cost.input === 0 && model.cost.output === 0) || model.provider === "opencode"
    );
    const models = free.length ? free : available;
    if (!models.length) {
      ctx.ui.notify("No available models found", "error");
      return;
    }
    const labels = models.map(model => `${model.name} (${model.provider}/${model.id})`);
    const selected = await ctx.ui.select(free.length ? "Select a free model" : "Select a model", labels);
    if (!selected) return;
    const model = models[labels.indexOf(selected)];
    if (!model) {
      ctx.ui.notify("Selected model is no longer available", "error");
      return;
    }
    const success = await pi.setModel(model);
    ctx.ui.notify(
      success ? `Using ${model.name} (${model.provider}/${model.id})` : `Could not use ${model.name}; provider authentication may be required`,
      success ? "info" : "error"
    );
  };

  const selectProvider = async (ctx: Parameters<Parameters<ExtensionAPI["on"]>[1]>[1]) => {
    if (!ctx.hasUI) return;
    const freeOpenCode = "Free OpenCode models (already available)";
    const moreProviders = "More providers";
    const selected = await ctx.ui.select("Choose a provider option", [freeOpenCode, moreProviders]);
    if (selected === freeOpenCode) {
      ctx.ui.notify("Free OpenCode models are already available. Use /agentctl model to select one.", "info");
    } else if (selected === moreProviders) {
      ctx.ui.setEditorText("/login");
      ctx.ui.notify("Press Enter to continue", "info");
    }
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.notify(beginnerHelp, "info");
    }
  });

  pi.registerCommand("agentctl", {
    description: "Ask the agent to use the agentctl CLI (for example: /agentctl help)",
    getArgumentCompletions: (prefix) => {
      const commands = ["help", "setup", "status", "providers", "sessions", "doctor", "model", "login", "new"];
      return commands.filter(command => command.startsWith(prefix)).map(command => ({ value: command, label: command }));
    },
    handler: async (args, ctx) => {
      const request = args.trim() || "help";
      const [command] = request.split(/\s+/);
      if (command === "model") {
        await selectModel(ctx);
        return;
      }
      if (command === "login" || command === "providers") {
        await selectProvider(ctx);
        return;
      }
      if (command === "new") {
        await ctx.newSession();
        return;
      }
      if (command === "help" && ctx.hasUI) {
        ctx.ui.notify(beginnerHelp, "info");
        return;
      }
      pi.sendUserMessage(`Use the agentctl CLI to handle this request: ${request}. Inspect the repository and report the result; preserve the configured safety checks.`);
    }
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension" || event.text.startsWith("/")) return { action: "continue" };
    const normalized = event.text.trim().toLowerCase();
    const intents: Array<[RegExp, string]> = [
      [/^(?:how do i )?set ?up agentctl\??$/, "setup"],
      [/^(?:show|check) agentctl (?:status|health)\??$/, "status"],
      [/^(?:list|show) agentctl providers\??$/, "providers"],
      [/^(?:list|show) agentctl sessions\??$/, "sessions"],
      [/^(?:run )?agentctl doctor\??$/, "doctor"],
      [/^(?:change|switch|set) (?:the )?model(?: to .+)?\??$/, "model"],
      [/^(?:switch|change) (?:the )?provider\??$/, "login"],
      [/^(?:sign in|signin|log in|login)(?: to (?:a )?provider)?\??$/, "login"],
      [/^(?:what can you do|what do you do|help)(?: me)?\??$/, "help"],
      [/^(?:start over|start again|reset this session)\??$/, "new"]
    ];
    const match = intents.find(([pattern]) => pattern.test(normalized));
    if (!match) return { action: "continue" };
    const intent = match[1];
    if (intent === "model") {
      await selectModel(ctx);
      return { action: "handled" };
    }
    if (intent === "login" || intent === "providers") {
      await selectProvider(ctx);
      return { action: "handled" };
    }
    if (intent === "new") {
      if (ctx.hasUI) {
        ctx.ui.setEditorText("/new");
        ctx.ui.notify("Press Enter to continue", "info");
      }
      return { action: "handled" };
    }
    if (intent === "help" && ctx.hasUI) {
      ctx.ui.notify(beginnerHelp, "info");
      return { action: "handled" };
    }
    return { action: "transform", text: `Use /agentctl ${intent} and explain the result.` };
  });

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
