import type { OpenRouterModel } from "./types.js";

export async function discoverFreeModels(baseUrl: string, apiKey?: string, fetcher: typeof fetch = fetch): Promise<OpenRouterModel[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/models`, { headers });
  if (!response.ok) throw new Error(`OpenRouter model discovery failed (${response.status})`);
  const body = await response.json() as { data?: OpenRouterModel[] };
  if (!Array.isArray(body.data)) throw new Error("OpenRouter returned an invalid models response");
  return body.data.filter(model => Number(model.pricing?.prompt ?? NaN) === 0 && Number(model.pricing?.completion ?? NaN) === 0).sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverOpenCodeModels(fetcher: typeof fetch = fetch): Promise<OpenRouterModel[]> {
  const response = await fetcher("https://opencode.ai/zen/v1/models", { headers: { Authorization: "Bearer public" } });
  if (!response.ok) throw new Error(`OpenCode model discovery failed (${response.status})`);
  const body = await response.json() as { data?: OpenRouterModel[] };
  if (!Array.isArray(body.data)) throw new Error("OpenCode returned an invalid models response");
  return body.data.filter(model => model.id.endsWith("-free") || model.id === "big-pickle").sort((a, b) => a.id.localeCompare(b.id));
}
