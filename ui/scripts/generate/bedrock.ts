/**
 * One door to Claude on Bedrock, shaped after VisuLearn's src/lib/bedrock.ts:
 * InvokeModel with the native Anthropic body, default credential chain,
 * AWS_REGION. Adds what a batch pipeline needs and a chat app does not —
 * tools, a global concurrency cap, backoff on throttling, a disk cache, and
 * a running bill.
 *
 * The cache is the reproducibility story. Temperature 0 narrows a fresh sample
 * but does not pin it (and thinking calls cannot use it); the same request
 * served from disk is pinned. A re-run with no code changes is therefore
 * identical, and `--fresh` measures how far a new sample drifts.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What this AWS account can invoke (probed 2026-10-22). The 5.x profiles are
 * listed in us-east-1 but every one answers AccessDeniedException.
 */
export const MODELS = {
  haiku: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  sonnet: "global.anthropic.claude-sonnet-4-6",
  opus: "global.anthropic.claude-opus-4-6-v1",
} as const;

/** The model without its routing prefix: `us.` and `global.` run the same model on the same request. */
const bare = (model: string) => model.replace(/^(us|eu|apac|global)\./, "");

/**
 * $ per million tokens through a `global.` profile, which Bedrock prices at
 * the list price; a geographic one (`us.`) costs about 10% more on input and
 * output. Times the tokens Bedrock reports, this is the bill to within its
 * rounding — Cost Explorer shows the same charge a day later, per service.
 */
const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  [bare(MODELS.haiku)]: { in: 1, out: 5, cacheRead: 0.1 },
  [bare(MODELS.sonnet)]: { in: 3, out: 15, cacheRead: 0.3 },
  [bare(MODELS.opus)]: { in: 5, out: 25, cacheRead: 0.5 },
};
const priceOf = (model: string) => {
  const p = PRICE[bare(model)];
  const k = model.startsWith("global.") ? 1 : 1.1;
  return { in: p.in * k, out: p.out * k, cacheRead: p.cacheRead * k };
};

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

export interface Tool {
  name: string;
  description: string;
  input_schema: object;
  strict?: boolean;
}

export type Block =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "thinking"; [k: string]: unknown };

export interface Message {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface Reply {
  content: Block[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

export interface Request {
  model: string;
  system: string | Block[];
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
  /** Turns on adaptive thinking at this effort (Sonnet/Opus only). Absent: temperature 0, no thinking. */
  effort?: "low" | "medium" | "high" | "max";
  /** Tags the bill, e.g. "summarize". */
  stage: string;
}

/* ── the bill ───────────────────────────────────────────────── */

/** `usd` is spent this run; `fullUsd` and the token counts are the whole work, replayed calls included, so a replayed map still reports its size and price. */
export const bill: Record<string, { calls: number; cached: number; input: number; output: number; cacheRead: number; usd: number; fullUsd: number }> = {};

function charge(stage: string, model: string, r: Reply, fromCache: boolean) {
  const b = (bill[stage] ??= { calls: 0, cached: 0, input: 0, output: 0, cacheRead: 0, usd: 0, fullUsd: 0 });
  b.calls++;
  const u = r.usage;
  const p = priceOf(model);
  const write = u.cache_creation_input_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const usd = (u.input_tokens * p.in + write * p.in * 1.25 + read * p.cacheRead + u.output_tokens * p.out) / 1e6;
  b.fullUsd += usd;
  // Tokens are the work the map takes, so a replayed call counts too.
  b.input += u.input_tokens + write;
  b.output += u.output_tokens;
  b.cacheRead += read;
  if (fromCache) { b.cached++; return; }
  b.usd += usd;
}

/* ── cache, concurrency, backoff ────────────────────────────── */

let cacheDir: string | null = null;
let fresh = false;
export function cacheIn(dir: string, opts: { fresh?: boolean } = {}) {
  cacheDir = dir;
  fresh = Boolean(opts.fresh);
  mkdirSync(dir, { recursive: true });
}

const LIMIT = Number(process.env.SLOP_CONCURRENCY ?? 8);
let running = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= LIMIT) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

let coolUntil = 0;
/** Seconds of request time spent waiting out throttles, summed over calls — the account's quota, not the work. */
export const throttle = { waits: 0, seconds: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = /Throttling|TooManyRequests|ServiceUnavailable|ModelNotReady|InternalServer|ModelError|timeout|ECONNRESET|socket hang up/i;

export async function invoke(req: Request): Promise<Reply> {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: req.messages,
    ...(req.tools ? { tools: req.tools, tool_choice: { type: "auto" } } : {}),
    ...(req.effort ? { thinking: { type: "adaptive" }, output_config: { effort: req.effort } } : { temperature: 0 }),
  };
  const json = JSON.stringify(body);
  // Keyed on one spelling of the model whatever the routing — the `us.` one
  // the first maps were cached under — so a routing switch replays them.
  const key = createHash("sha256").update(`us.${bare(req.model)}\n${json}`).digest("hex");
  const file = cacheDir ? join(cacheDir, `${key}.json`) : null;
  if (file && !fresh && existsSync(file)) {
    const r = JSON.parse(readFileSync(file, "utf8")) as Reply;
    charge(req.stage, req.model, r, true);
    return r;
  }

  const r = await slot(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        if (coolUntil > Date.now()) await sleep(coolUntil - Date.now());
        const res = await client.send(
          new InvokeModelCommand({ modelId: req.model, contentType: "application/json", accept: "application/json", body: json }),
        );
        return JSON.parse(new TextDecoder().decode(res.body)) as Reply;
      } catch (e) {
        const msg = `${(e as Error).name}: ${(e as Error).message}`;
        const throttled = /Throttling|TooManyRequests/i.test(msg);
        if (attempt >= (throttled ? 12 : 6) || !RETRYABLE.test(msg)) throw new Error(`${req.stage} ${req.model}: ${msg}`);
        const wait = Math.min(60_000, 2000 * 2 ** attempt) * (0.5 + Math.random());
        // A throttle is the account's quota, not this request: every call
        // waits it out, or the rest keep hitting the limit and burn retries.
        if (throttled) {
          coolUntil = Math.max(coolUntil, Date.now() + wait);
          throttle.waits++;
          throttle.seconds += wait / 1000;
        }
        await sleep(wait);
      }
    }
  });
  charge(req.stage, req.model, r, false);
  if (file) writeFileSync(file, JSON.stringify(r));
  return r;
}

/** The text of a reply, thinking dropped. */
export const textOf = (r: Reply) => r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

/** Every tool call in a reply. */
export const callsOf = (r: Reply) =>
  r.content.flatMap((b) => (b.type === "tool_use" ? [b as Extract<Block, { type: "tool_use" }>] : []));

/**
 * One structured answer: the model is asked to call `tool` once and nothing
 * else. Forced tool_choice is a 400 on the 5.5 models, so this asks, checks,
 * and asks again with the reason when the call is missing.
 */
/**
 * What is wrong with a tool answer at the top level, or null. Models now and
 * then send an array as its JSON text (saas-starter's verify stage crashed on
 * one); that is unwrapped in place, anything else goes back as an error.
 */
function shapeOf(tool: Tool, input: Record<string, unknown>): string | null {
  const schema = tool.input_schema as { required?: string[]; properties?: Record<string, { type?: string }> };
  for (const k of schema.required ?? []) if (input?.[k] === undefined) return `Missing required field "${k}".`;
  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    if (p.type !== "array" || input[k] === undefined) continue;
    if (typeof input[k] === "string") {
      try { input[k] = JSON.parse(input[k] as string); } catch { /* reported below */ }
    }
    if (!Array.isArray(input[k])) return `Field "${k}" must be an array, not ${typeof input[k]}.`;
  }
  return null;
}

export async function ask<T>(req: Omit<Request, "tools"> & { tool: Tool }): Promise<T> {
  const messages = [...req.messages];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await invoke({ ...req, messages, tools: [req.tool] });
    const call = callsOf(r).find((c) => c.name === req.tool.name);
    const wrong = call ? shapeOf(req.tool, call.input as Record<string, unknown>) : null;
    if (call && !wrong) return call.input as T;
    messages.push(
      { role: "assistant", content: r.content },
      call
        ? { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `${wrong} Call ${req.tool.name} again with the corrected input.` }] }
        : { role: "user", content: `Answer by calling the ${req.tool.name} tool exactly once. stop_reason was ${r.stop_reason}.` },
    );
  }
  throw new Error(`${req.stage}: no ${req.tool.name} call after 3 attempts`);
}
