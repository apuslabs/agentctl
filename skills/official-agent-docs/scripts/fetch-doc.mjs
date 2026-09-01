#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 5;
const ALLOWED = new Map([
  ["claude.ai", [url => url.pathname === "/install.sh"]],
  ["docs.anthropic.com", [url => url.pathname.startsWith("/")]],
  ["chatgpt.com", [url => url.pathname === "/codex/install.sh"]],
  ["developers.openai.com", [url => url.pathname === "/codex" || url.pathname.startsWith("/codex/")]],
  ["platform.openai.com", [url => url.pathname.startsWith("/")]],
  ["hermes-agent.nousresearch.com", [url => url.pathname === "/install.sh" || url.pathname.startsWith("/")]],
]);

export function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`invalid URL: ${value}`); }
  const rules = ALLOWED.get(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || !rules?.some(rule => rule(url))) {
    throw new Error(`URL is not an allowed official HTTPS source: ${url.href}`);
  }
  return url;
}

export function validateRedirect(location, currentUrl) {
  return validateUrl(new URL(location, currentUrl).href);
}

function cacheDirectory() {
  if (process.env.AGENTCTL_HOME) return join(process.env.AGENTCTL_HOME, "cache");
  if (process.env.XDG_CACHE_HOME) return join(process.env.XDG_CACHE_HOME, "agentctl");
  return join(homedir(), ".cache", "agentctl");
}

function isTextContentType(value) {
  const type = value.split(";", 1)[0].trim().toLowerCase();
  return type.startsWith("text/") || ["application/json", "application/javascript", "application/xml", "application/xhtml+xml", "application/x-sh", "application/x-shellscript"].includes(type) || type.endsWith("+json") || type.endsWith("+xml");
}

export async function fetchAllowed(url, redirects = 0) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "text/plain, text/html, application/json, application/xml;q=0.9, */*;q=0.1" },
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= MAX_REDIRECTS) throw new Error(`too many redirects (more than ${MAX_REDIRECTS})`);
    const location = response.headers.get("location");
    if (!location) throw new Error(`redirect from ${url.href} has no Location header`);
    return fetchAllowed(validateRedirect(location, url), redirects + 1);
  }
  if (!response.ok) throw new Error(`request failed with HTTP ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  if (!isTextContentType(contentType)) throw new Error(`refusing non-text Content-Type: ${contentType || "missing"}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) throw new Error(`response exceeds ${MAX_BYTES} bytes`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error(`response exceeds ${MAX_BYTES} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

async function main() {
  if (process.argv.length !== 3) throw new Error("usage: fetch-doc.mjs <official-https-url>");
  const url = validateUrl(process.argv[2]);
  const directory = cacheDirectory();
  const cachePath = join(directory, `${createHash("sha256").update(url.href).digest("hex")}.json`);
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8"));
    if (cached.url === url.href && Date.now() - cached.fetchedAt < CACHE_TTL_MS && typeof cached.body === "string") {
      process.stdout.write(cached.body);
      return;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  const body = await fetchAllowed(url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(cachePath, JSON.stringify({ url: url.href, fetchedAt: Date.now(), body }), { mode: 0o600 });
  process.stdout.write(body);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const detail = error?.name === "TimeoutError" ? "request timed out after 10 seconds" : error?.message || String(error);
    console.error(`fetch-doc: ${detail}`);
    process.exitCode = 1;
  });
}
