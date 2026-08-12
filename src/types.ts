export interface Config {
  version: 1;
  provider: "opencode" | "openrouter";
  openRouterBaseUrl: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  cwd: string;
  model: string;
  promptPreview: string;
  exitCode?: number;
  logFile: string;
}

export interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}
