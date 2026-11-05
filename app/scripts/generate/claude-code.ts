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

/* eslint-disable @typescript-eslint/no-explicit-any -- Claude Code's stream events */
import spawn from "cross-spawn";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cacheFile, chargeUsage, slot, type Message, type Reply, type Tool } from "./bedrock";

/** Bedrock profile → the name Claude Code takes for the same model. */
const CC_MODEL: Record<string, string> = {
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": "claude-haiku-4-5-20251001",
  "global.anthropic.claude-sonnet-4-6": "claude-sonnet-4-6",
  "global.anthropic.claude-opus-4-6-v1": "claude-opus-4-6",
};
const ccModel = (model: string) => CC_MODEL[model] ?? model;

/**
 * Where Claude Code keeps the sessions of runs started in `dir`: the agent
 * loop's calls must keep theirs (a nudge `--resume`s it), and each run's
 * scratch is a new path, so nothing would ever read or remove them.
 */
const SESSIONS = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
const sessionsOf = (dir: string) => join(SESSIONS, dir.replace(/[^a-zA-Z0-9]/g, "-"));

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/**
 * What runs that could not clean up left: killed outright (Windows' taskkill
 * runs no handlers, nor does SIGKILL), or from before sessions were removed.
 * A scratch whose owner is gone goes; a scratch without an owner file is left,
 * as it may be a run of an older build still going. Sessions go once their
 * scratch is gone.
 */
function sweepStale() {
  const live = new Set<string>();
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith("slop-cc-")) continue;
      const dir = join(tmpdir(), name);
      let owner: number | undefined;
      try {
        owner = Number(readFileSync(join(dir, "owner"), "utf8"));
      } catch {
        /* no owner file */
      }
      if (owner && !alive(owner)) rmSync(dir, { recursive: true, force: true });
      else live.add(name.slice("slop-cc-".length));
    }
    if (!existsSync(SESSIONS)) return;
    for (const name of readdirSync(SESSIONS)) {
      const m = /-slop-cc-([a-zA-Z0-9]+)(?:-work)?$/.exec(name);
      if (m && !live.has(m[1])) rmSync(join(SESSIONS, name), { recursive: true, force: true });
    }
  } catch {
    /* tidying only: a run never fails over it */
  }
}

/**
 * The run's scratch directory: an empty `work` folder to run in (no project
 * CLAUDE.md, no repository for Claude Code's own tools to wander) and, beside
 * it, the system prompts handed over as files.
 */
let scratchDir: string | undefined;
const scratch = () => {
  if (scratchDir) return scratchDir;
  sweepStale();
  scratchDir = mkdtempSync(join(tmpdir(), "slop-cc-"));
  writeFileSync(join(scratchDir, "owner"), String(process.pid));
  mkdirSync(join(scratchDir, "work"));
  // Claude Code names its sessions folder from the real path (macOS's tmpdir is a symlink).
  const work = realpathSync(join(scratchDir, "work"));
  // Removed however the run ends: done, failed, or stopped by the app (SIGTERM).
  const remove = () => {
    rmSync(scratchDir!, { recursive: true, force: true });
    rmSync(sessionsOf(work), { recursive: true, force: true });
  };
  process.once("exit", remove);
  for (const sig of ["SIGTERM", "SIGINT"] as const)
    process.once(sig, () => {
      remove();
      process.kill(process.pid, sig);
    });
  return scratchDir;
};
const cwd = () => join(scratch(), "work");

/**
 * A system prompt as a file. On the command line the author's (rules and
 * exemplar, ~43k characters) passes Windows' 32,767-character limit and the
 * spawn fails with ENAMETOOLONG.
 */
function systemFile(system: string): string {
  const file = join(scratch(), `system-${createHash("sha256").update(system).digest("hex").slice(0, 16)}.md`);
  if (!existsSync(file)) writeFileSync(file, system);
  return file;
}

interface Result {
  is_error: boolean;
  subtype: string;
  result?: string;
  structured_output?: unknown;
  session_id: string;
  num_turns: number;
  modelUsage?: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>;
}

type Usage = Reply["usage"];

/**
 * One reply of an agent, timed: what a root's minutes went on. `wait` runs
 * from the previous reply's end (or the process's start) to this one's first
 * token: the tool call, Claude Code's own overhead and the model reading its
 * context. `think` is until the first block that is not thinking, `write`
 * the rest. `did` names its tool calls; a submit of a whole tree is `submit`,
 * one that sends only fixes is `fix`.
 */
export interface Turn {
  wait: number;
  think: number;
  write: number;
  out: number;
  thinking: number;
  did: string[];
  /** The part of a split root it belongs to, or `join`. */
  part?: string;
}

const secs = (ms: number) => Math.round(ms / 100) / 10;

/** A tool call as `did` names it. */
function kindOf(name: string, json: string): string {
  const tool = name.replace(/^mcp__slop__/, "");
  if (tool !== "submit") return tool;
  try {
    return JSON.parse(json || "{}").root ? "submit" : "fix";
  } catch {
    return "submit";
  }
}

/** Reads Claude Code's raw stream events (--include-partial-messages) into turns as they arrive. */
function turnReader(log: Turn[]) {
  let last = Date.now();
  let cur: { start: number; firstOut: number; out: number; thinking: number; did: string[] } | null = null;
  const blocks = new Map<number, { name: string; json: string }>();
  return (e: any) => {
    if (e?.type !== "stream_event") return;
    const ev = e.event, now = Date.now();
    if (ev.type === "message_start") {
      cur = { start: now, firstOut: 0, out: 0, thinking: 0, did: [] };
      blocks.clear();
    } else if (!cur) return;
    else if (ev.type === "content_block_start") {
      if (ev.content_block?.type !== "thinking" && ev.content_block?.type !== "redacted_thinking" && !cur.firstOut) cur.firstOut = now;
      if (ev.content_block?.type === "tool_use") blocks.set(ev.index, { name: ev.content_block.name, json: "" });
    } else if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
      const b = blocks.get(ev.index);
      if (b) b.json += ev.delta.partial_json;
    } else if (ev.type === "content_block_stop") {
      const b = blocks.get(ev.index);
      if (b) cur.did.push(kindOf(b.name, b.json));
    } else if (ev.type === "message_delta") {
      cur.out = ev.usage?.output_tokens ?? cur.out;
      cur.thinking = ev.usage?.output_tokens_details?.thinking_tokens ?? cur.thinking;
    } else if (ev.type === "message_stop") {
      const first = cur.firstOut || now;
      log.push({ wait: secs(cur.start - last), think: secs(first - cur.start), write: secs(now - first), out: cur.out, thinking: cur.thinking, did: cur.did });
      last = now;
      cur = null;
    }
  };
}

/** What `claude -p` runs used, summed over every run and every model each called. */
function usageOf(...runs: Result[]): Usage {
  const u = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (const m of runs.flatMap((r) => Object.values(r.modelUsage ?? {}))) {
    u.input_tokens += m.inputTokens;
    u.output_tokens += m.outputTokens;
    u.cache_read_input_tokens += m.cacheReadInputTokens;
    u.cache_creation_input_tokens += m.cacheCreationInputTokens;
  }
  return u;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = /overloaded|529|500|502|503|rate.?limit|429|ECONNRESET|timed? ?out/i;

/**
 * Claude Code's effort for the API path's. The same word does not buy the same
 * thinking through both doors: at "high", ky's authors through Claude Code
 * thought for up to 43k tokens in one reply (13 minutes) where the API never
 * passed 10k. Claude Code (2.1.310) gives models with adaptive thinking, Opus
 * among them, no budget: MAX_THINKING_TOKENS only turns thinking on or off, so
 * effort is the one bound, and callers pick a lower one than the API path's.
 * SLOP_CC_EFFORT overrides it for every call.
 */
const ccEffort = (effort?: string) => (effort ? process.env.SLOP_CC_EFFORT ?? effort : undefined);

/**
 * One `claude -p` run, prompt on stdin, retried on transient failures. No
 * effort means no thinking, as on the API path. Given a `log`, the run is
 * streamed and each of its replies timed into it (turnReader).
 */
async function claude(args: string[], prompt: string, stage: string, effort?: string, log?: Turn[]): Promise<Result> {
  const format = log ? ["--output-format", "stream-json", "--verbose", "--include-partial-messages"] : ["--output-format", "json"];
  const flags = [...args, ...(effort ? ["--effort", effort] : [])];
  return slot(async () => {
    for (let attempt = 0; ; attempt++) {
      const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
        // Not a nested session of whatever Claude Code launched this script.
        const env = { ...process.env };
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        env.MAX_THINKING_TOKENS = effort ? "16000" : "0";
        const p = spawn(process.env.SLOP_CLAUDE || "claude", ["-p", ...format, "--setting-sources", "", "--strict-mcp-config", ...flags], { cwd: cwd(), env, windowsHide: true }) as ChildProcessWithoutNullStreams;
        let stdout = "", stderr = "";
        if (log) {
          // Read line by line as it comes, so each turn is timed when it happens; stdout keeps only the result.
          const read = turnReader(log);
          let rest = "";
          p.stdout.on("data", (d) => {
            const lines = (rest + d).split("\n");
            rest = lines.pop()!;
            for (const line of lines) {
              let e: any;
              try {
                e = JSON.parse(line);
              } catch {
                continue;
              }
              if (e?.type === "result") stdout = line;
              else read(e);
            }
          });
        } else p.stdout.on("data", (d) => (stdout += d));
        p.stderr.on("data", (d) => (stderr += d));
        // A missing binary emits "error", not "close"; unheard, it crashes the run.
        p.on("error", (e) => resolve({ code: null, stdout: "", stderr: String(e) }));
        p.on("close", (code) => resolve({ code, stdout, stderr }));
        p.stdin.end(prompt);
      });
      let r: Result | null = null;
      try { r = JSON.parse(out.stdout); } catch { /* reported below */ }
      if (r && !r.is_error) return r;
      const msg = (r?.result || out.stderr || out.stdout).slice(0, 500);
      // A plan's usage window does not reopen in minutes; retrying only spends the wait.
      if (/usage limit|limit reached|resets? (at|in)/i.test(msg)) throw new Error(`${stage}: Claude plan usage limit reached — ${msg}`);
      if (r?.subtype === "error_max_turns") return r;
      if (attempt >= 5 || !RETRYABLE.test(msg)) throw new Error(`${stage}: claude -p failed (${r?.subtype ?? `exit ${out.code}`}): ${msg}`);
      await sleep(Math.min(60_000, 3000 * 2 ** attempt) * (0.5 + Math.random()));
    }
  });
}

/** The flags every run shares: the model and our system prompt in place of Claude Code's. */
const base = (model: string, system: string) => ["--model", ccModel(model), "--system-prompt-file", systemFile(system)];

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
  const run = (turns: number) => claude([...base(req.model, system), "--tools", "", "--json-schema", schema, "--max-turns", String(turns), "--no-session-persistence"], prompt, req.stage, effort);
  let r = await run(4);
  // An answer that failed the schema until the turns ran out (a root's split
  // cut did, and took the whole run with it) gets one more try with more room.
  if (r.structured_output === undefined && r.subtype === "error_max_turns") r = await run(8);
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
  /** What the run depends on beyond its prompt, such as the hashes of the files it reads; part of the cache key only. */
  salt?: string;
}): Promise<{ value: T | null; turns: number; calls: number; usage: Usage; log: Turn[] }> {
  const system = systemText(req.system);
  const effort = ccEffort(req.effort);
  const key = keyOf(req.model, effort ?? "", system, req.prompt, JSON.stringify(req.tools), ...(req.salt ? [req.salt] : []));
  const hit = cached<{ value: T | null; turns: number; calls: number; log?: Turn[] }>(key, req.stage, req.model);
  // A replay took no time; its turns are the ones it was first made in.
  if (hit) return { ...hit, log: hit.log ?? [] };

  const { port } = await mcp();
  const id = randomUUID();
  const session: Session = { tools: req.tools, handle: req.handle, calls: 0 };
  sessions.set(id, session);
  const config = JSON.stringify({ mcpServers: { slop: { type: "http", url: `http://127.0.0.1:${port}/mcp/${id}` } } });
  const allowed = req.tools.map((t) => `mcp__slop__${t.name}`).join(",");
  const runs: Result[] = [];
  const log: Turn[] = [];
  let turns = 0;
  try {
    let prompt = req.prompt;
    for (let run = 0; run < 3 && session.done === undefined && turns < req.maxTurns; run++) {
      // A nudge continues the same session, reads and all, as the API loop's next turn does.
      const flags = [...base(req.model, system), "--tools", "", "--mcp-config", config, "--allowedTools", allowed, "--max-turns", String(req.maxTurns - turns)];
      const r = await claude([...flags, ...(run === 0 ? ["--session-id", id] : ["--resume", id])], prompt, req.stage, effort, log);
      runs.push(r);
      turns += r.num_turns;
      prompt = req.nudge;
    }
  } finally {
    sessions.delete(id);
  }
  const usage = usageOf(...runs);
  chargeUsage(req.stage, req.model, usage, false);
  const out = { value: (session.done as T | undefined) ?? null, turns, calls: session.calls, usage, log };
  store(key, out);
  return out;
}
