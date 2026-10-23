/**
 * The same calls as bedrock.ts, made through the reader's own Claude Code
 * (`claude -p`) instead of an AWS account — so someone with a Claude plan maps
 * a repository without a second bill. SLOP_BACKEND=claude-code selects it.
 *
 * Parity with the API path is the point, so the request is held to the same
 * shape: the same model, the same system prompt (replacing Claude Code's own),
 * no built-in tools, no settings, CLAUDE.md or memory from this machine. A
 * structured answer is `--json-schema` with the tool's schema. An agent's tools
 * are the very functions the API path runs, served to Claude Code over MCP by
 * this process, so the checker that accepts a root is the same code either way.
 *
 * Claude Code runs the agent loop itself; what comes back is the final answer
 * and the token count, which is priced with the API table so the two backends'
 * bills compare. Replies are cached on disk like the API's.
 */

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheFile, chargeUsage, slot, type Message, type Tool } from "./bedrock";

/** Bedrock profile → the name Claude Code takes for the same model. */
const CC_MODEL: Record<string, string> = {
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": "claude-haiku-4-5-20251001",
  "global.anthropic.claude-sonnet-4-6": "claude-sonnet-4-6",
  "global.anthropic.claude-opus-4-6-v1": "claude-opus-4-6",
};
const ccModel = (model: string) => CC_MODEL[model] ?? model;

/** An empty working directory: no project CLAUDE.md, no repository for Claude Code's own tools to wander. */
let emptyDir: string | undefined;
const cwd = () => (emptyDir ??= mkdtempSync(join(tmpdir(), "slop-cc-")));

interface Result {
  is_error: boolean;
  subtype: string;
  result?: string;
  structured_output?: unknown;
  session_id: string;
  num_turns: number;
  modelUsage?: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>;
}

/** What one `claude -p` run used, summed over every model it called. */
type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
function usageOf(r: Result): Usage {
  const u = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (const m of Object.values(r.modelUsage ?? {})) {
    u.input_tokens += m.inputTokens;
    u.output_tokens += m.outputTokens;
    u.cache_read_input_tokens += m.cacheReadInputTokens;
    u.cache_creation_input_tokens += m.cacheCreationInputTokens;
  }
  return u;
}
const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = /overloaded|529|500|502|503|rate.?limit|429|ECONNRESET|timed? ?out/i;

/** One `claude -p` run, prompt on stdin, retried on transient failures. */
async function claude(args: string[], prompt: string, stage: string): Promise<Result> {
  return slot(async () => {
    for (let attempt = 0; ; attempt++) {
      const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
        // Not a nested session of whatever Claude Code launched this script.
        const env = { ...process.env };
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        // No effort means no thinking, as on the API path; with one, thinking is capped (see ccEffort).
        env.MAX_THINKING_TOKENS = args.includes("--effort") ? THINKING : "0";
        const p = spawn(process.env.SLOP_CLAUDE || "claude", ["-p", "--output-format", "json", "--setting-sources", "", "--strict-mcp-config", ...args], { cwd: cwd(), env });
        let stdout = "", stderr = "";
        p.stdout.on("data", (d) => (stdout += d));
        p.stderr.on("data", (d) => (stderr += d));
        p.on("close", (code) => resolve({ code, stdout, stderr }));
        p.stdin.end(prompt);
      });
      let r: Result | null = null;
      try { r = JSON.parse(out.stdout); } catch { /* reported below */ }
      if (r && !r.is_error) return r;
      const msg = (r?.result ?? out.stderr ?? out.stdout).slice(0, 500);
      // A plan's usage window does not reopen in minutes; retrying only spends the wait.
      if (/usage limit|limit reached|resets? (at|in)/i.test(msg)) throw new Error(`${stage}: Claude plan usage limit reached — ${msg}`);
      if (r?.subtype === "error_max_turns") return r;
      if (attempt >= 5 || !RETRYABLE.test(msg)) throw new Error(`${stage}: claude -p failed (${r?.subtype ?? `exit ${out.code}`}): ${msg}`);
      await sleep(Math.min(60_000, 3000 * 2 ** attempt) * (0.5 + Math.random()));
    }
  });
}

/** The flags every run shares: the model, its effort, and our system prompt in place of Claude Code's. */
/**
 * Claude Code's effort for the API path's. The same word does not buy the same
 * thinking through both doors: at "high", ky's authors through Claude Code
 * thought for up to 43k tokens in one reply (13 minutes) where the API never
 * passed 10k. A 16k cap per reply kept the effort and the maps' quality and
 * halved the time. SLOP_CC_EFFORT and SLOP_CC_THINKING recalibrate; both are
 * part of the cache key.
 */
const THINKING = process.env.SLOP_CC_THINKING ?? "16000";
const ccEffort = (effort?: string) => (effort ? `${process.env.SLOP_CC_EFFORT ?? effort}/${THINKING}` : undefined);

function base(model: string, system: string, effort?: string): string[] {
  return ["--model", ccModel(model), "--system-prompt", system, ...(effort ? ["--effort", effort.split("/")[0]] : [])];
}

/** A conversation as one prompt. The API path's retries carry the previous answer and what was wrong with it; so does this. */
function transcript(messages: Message[]): string {
  return messages
    .map((m) => {
      const parts = typeof m.content === "string" ? [m.content] : m.content.map((b) => (b.type === "text" ? b.text : b.type === "tool_use" ? JSON.stringify(b.input) : b.type === "tool_result" ? b.content : ""));
      const text = parts.filter(Boolean).join("\n\n");
      return m.role === "assistant" ? `## Your previous answer\n${text}` : text;
    })
    .join("\n\n");
}

const systemText = (system: string | { type: string; text?: string }[]) => (typeof system === "string" ? system : system.map((b) => b.text ?? "").join("\n\n"));

/** A cached run: the answer and what it cost, so a replay reports the same size and price. */
function cached<T>(key: string, stage: string, model: string): (T & { usage: Usage }) | null {
  const file = cacheFile(key);
  if (!file || !existsSync(file)) return null;
  const hit = JSON.parse(readFileSync(file, "utf8")) as T & { usage: Usage };
  chargeUsage(stage, model, hit.usage, true);
  return hit;
}
function store(key: string, value: object) {
  const file = cacheFile(key, false);
  if (file) writeFileSync(file, JSON.stringify(value));
}
const keyOf = (...parts: string[]) => createHash("sha256").update(["claude-code", ...parts].join("\n")).digest("hex");

/** One structured answer, shaped by the tool's schema. */
export async function ccAsk<T>(req: { model: string; system: string | { type: string; text?: string }[]; messages: Message[]; tool: Tool; effort?: string; stage: string }): Promise<T> {
  const system = systemText(req.system);
  const prompt = `${transcript(req.messages)}\n\nAnswer with the ${req.tool.name} structure: ${req.tool.description}`;
  const schema = JSON.stringify(req.tool.input_schema);
  const effort = ccEffort(req.effort);
  const key = keyOf(req.model, effort ?? "", system, prompt, schema);
  const hit = cached<{ value: T }>(key, req.stage, req.model);
  if (hit) return hit.value;
  // Two built-in turns at least: the answer, then the structured-output call.
  const r = await claude([...base(req.model, system, effort), "--tools", "", "--json-schema", schema, "--max-turns", "4", "--no-session-persistence"], prompt, req.stage);
  if (r.structured_output === undefined) throw new Error(`${req.stage}: claude -p returned no structured output (${r.subtype})`);
  const usage = usageOf(r);
  chargeUsage(req.stage, req.model, usage, false);
  store(key, { value: r.structured_output, usage });
  return r.structured_output as T;
}

/* ── agents: our tools, served over MCP to Claude Code ───────── */

export interface Handled {
  content: string;
  isError?: boolean;
  /** Set when this call ends the agent's work: an accepted submit, a final review. */
  done?: unknown;
}
interface Session { tools: Tool[]; handle: (name: string, input: unknown) => Handled; done?: unknown; calls: number }

const sessions = new Map<string, Session>();
let server: Promise<{ port: number; server: Server }> | null = null;

/** A minimal MCP server over streamable HTTP, one path per agent: initialize, tools/list, tools/call. */
function mcp() {
  server ??= new Promise((resolve) => {
    const s = createServer((req, res) => {
      const session = sessions.get((req.url ?? "").split("/").pop() ?? "");
      if (req.method !== "POST" || !session) {
        res.writeHead(req.method === "POST" ? 404 : 405).end();
        return;
      }
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const msg = JSON.parse(body) as { id?: number | string; method: string; params?: { name?: string; arguments?: unknown; protocolVersion?: string } };
        if (msg.id === undefined) {
          res.writeHead(202).end();
          return;
        }
        let result: unknown;
        if (msg.method === "initialize") result = { protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "slop", version: "1" } };
        else if (msg.method === "tools/list") result = { tools: session.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) };
        else if (msg.method === "tools/call") {
          session.calls++;
          const h = session.done !== undefined ? { content: "Already accepted. Stop now." } : session.handle(msg.params!.name!, msg.params!.arguments);
          if (h.done !== undefined) session.done = h.done;
          result = { content: [{ type: "text", text: h.content }], isError: Boolean(h.isError) };
        } else result = {};
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      });
    });
    s.listen(0, "127.0.0.1", () => resolve({ port: (s.address() as { port: number }).port, server: s }));
  });
  return server;
}

/** Closes the MCP server so the process can exit. */
export async function ccClose() {
  if (server) (await server).server.close();
}

/**
 * One agent run: Claude Code drives the loop over our tools until a call
 * reports `done`. A run that stops without it is resumed with `nudge`, as the
 * API loop nudges a turn with no tool call.
 */
export async function ccAgent<T>(req: {
  model: string;
  system: string | { type: string; text?: string }[];
  prompt: string;
  tools: Tool[];
  handle: (name: string, input: unknown) => Handled;
  effort?: string;
  stage: string;
  maxTurns: number;
  nudge: string;
}): Promise<{ value: T | null; turns: number; calls: number; usage: Usage }> {
  const system = systemText(req.system);
  const effort = ccEffort(req.effort);
  const key = keyOf(req.model, effort ?? "", system, req.prompt, JSON.stringify(req.tools));
  const hit = cached<{ value: T | null; turns: number; calls: number }>(key, req.stage, req.model);
  if (hit) return hit;

  const { port } = await mcp();
  const id = randomUUID();
  const session: Session = { tools: req.tools, handle: req.handle, calls: 0 };
  sessions.set(id, session);
  const config = JSON.stringify({ mcpServers: { slop: { type: "http", url: `http://127.0.0.1:${port}/mcp/${id}` } } });
  const allowed = req.tools.map((t) => `mcp__slop__${t.name}`).join(",");
  let usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let turns = 0;
  try {
    let prompt = req.prompt;
    for (let run = 0; run < 3 && session.done === undefined && turns < req.maxTurns; run++) {
      // A nudge continues the same session, reads and all, as the API loop's next turn does.
      const flags = [...base(req.model, system, effort), "--tools", "", "--mcp-config", config, "--allowedTools", allowed, "--max-turns", String(req.maxTurns - turns)];
      const r = await claude(run === 0 ? [...flags, "--session-id", id] : [...flags, "--resume", id], prompt, req.stage);
      usage = addUsage(usage, usageOf(r));
      turns += r.num_turns;
      prompt = req.nudge;
    }
  } finally {
    sessions.delete(id);
  }
  chargeUsage(req.stage, req.model, usage, false);
  const out = { value: (session.done as T | undefined) ?? null, turns, calls: session.calls, usage };
  store(key, out);
  return out;
}
