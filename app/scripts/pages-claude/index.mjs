// The Claude a published map's page talks to (components/claude-web.tsx): a Lambda behind a
// streaming function URL, answering from the map and the code it cites, on Bedrock. The page
// holds no credentials; this function's role may call one model and nothing else, and every
// limit below bounds what one stranger's question can cost.
//
// Packed with map.json and source.json beside it (scripts/pages-claude/pack.sh).
import { readFileSync } from "node:fs";
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

// Sonnet 5.5 is not enabled on the account yet; 4.5 is the Sonnet it can call.
const MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const MAX_TOKENS = 1500;
/** Tool rounds per question: enough to open a few files, not to wander the repo. */
const MAX_ROUNDS = 5;
const MAX_CHARS = 4000;
const MAX_MESSAGES = 16;
const MAX_LINES = 300;

const map = JSON.parse(readFileSync(new URL("map.json", import.meta.url), "utf8"));
const source = JSON.parse(readFileSync(new URL("source.json", import.meta.url), "utf8"));
const bedrock = new BedrockRuntimeClient({});

/** The map as an outline: every level's title, what it is, and the lines it cites. */
function outline() {
  const out = [];
  const o = map.OVERVIEW ?? {};
  out.push(`${map.RUN.repo}: ${o.sub ?? ""}`, o.detail ?? "", o.explain?.body ?? "");
  for (const t of o.glossary ?? []) out.push(`Term — ${t.term}: ${t.meaning}`);
  const walk = (n, depth) => {
    const refs = (n.code ?? []).map((c) => `${c.file}:${c.start}-${c.end}`).join(", ");
    out.push(`${"  ".repeat(depth)}- ${n.title} — ${n.sub}${n.detail ? `. ${n.detail}` : ""}${refs ? ` [${refs}]` : ""}`);
    for (const c of n.children ?? []) walk(c, depth + 1);
  };
  for (const n of map.AUTHORED) walk(n, 0);
  return out.filter(Boolean).join("\n");
}

const SYSTEM = `You are Claude, in a terminal beside a map of the codebase ${map.RUN.repo} (commit ${map.RUN.commit}), on a public web page. Readers ask you about this code.

Answer in plain text for a terminal: short paragraphs, \`code\` in backticks, no headings or tables. Be concise. Cite code as path:line. Read a file with read_file before saying what it does; never guess at code you have not read. You can only read the files listed below, and cannot run anything or change anything. If asked about something outside this codebase, say briefly that you are here to explain this code.

Files: ${Object.keys(source).join(", ")}

The map:
${outline()}`;

const TOOLS = {
  tools: [
    {
      toolSpec: {
        name: "read_file",
        description: `Read lines of one of the codebase's files, numbered. At most ${MAX_LINES} lines per call.`,
        inputSchema: {
          json: {
            type: "object",
            properties: {
              path: { type: "string", description: "Repo-relative path, from the file list." },
              start: { type: "integer", description: "First line, from 1." },
              end: { type: "integer", description: "Last line, inclusive." },
            },
            required: ["path"],
          },
        },
      },
    },
  ],
};

function readFile({ path, start = 1, end }) {
  const text = source[path];
  if (text === undefined) return `No file ${path}. Files: ${Object.keys(source).join(", ")}`;
  const lines = text.split("\n");
  const from = Math.max(1, start);
  const to = Math.min(lines.length, end ?? from + MAX_LINES - 1, from + MAX_LINES - 1);
  return lines.slice(from - 1, to).map((l, i) => `${from + i}\t${l}`).join("\n") + (to < lines.length ? `\n(${lines.length} lines in all)` : "");
}

/** The conversation as the page sent it, or why it is refused. */
function parse(event) {
  if (event.requestContext?.http?.method !== "POST") return "POST only";
  let body;
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body);
  } catch {
    return "bad JSON";
  }
  const msgs = body?.messages;
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > MAX_MESSAGES) return `1-${MAX_MESSAGES} messages`;
  for (const [i, m] of msgs.entries()) {
    if (m?.role !== (i % 2 ? "assistant" : "user") || typeof m.text !== "string" || !m.text.trim()) return "messages alternate, user first, each with text";
    if (m.text.length > MAX_CHARS) return `each message at most ${MAX_CHARS} characters`;
  }
  if (msgs.length % 2 === 0) return "the last message is the reader's";
  const at = typeof body.at === "string" ? body.at.slice(0, 300) : "";
  return { at, messages: msgs.map((m) => ({ role: m.role, content: [{ text: m.text }] })) };
}

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  const send = (t, v) => stream.write(JSON.stringify({ t, v }) + "\n");
  const req = parse(event);
  stream = awslambda.HttpResponseStream.from(stream, {
    statusCode: typeof req === "string" ? 400 : 200,
    headers: { "content-type": "application/x-ndjson" },
  });
  if (typeof req === "string") {
    send("error", req);
    return stream.end();
  }
  // The whole prompt is the same for every reader, so it is cached; where the reader is comes after.
  const system = [{ text: SYSTEM }, { cachePoint: { type: "default" } }];
  if (req.at) system.push({ text: `The reader has open: ${req.at}` });
  const messages = req.messages;
  try {
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const res = await bedrock.send(
        new ConverseStreamCommand({
          modelId: MODEL,
          system,
          messages,
          // The last round has no tools, so it must answer with what it has read.
          ...(round < MAX_ROUNDS ? { toolConfig: TOOLS } : {}),
          inferenceConfig: { maxTokens: MAX_TOKENS },
        }),
      );
      const blocks = [];
      let stop;
      for await (const e of res.stream) {
        if (e.contentBlockStart?.start?.toolUse) {
          const { toolUseId, name } = e.contentBlockStart.start.toolUse;
          blocks[e.contentBlockStart.contentBlockIndex] = { toolUse: { toolUseId, name, input: "" } };
        } else if (e.contentBlockDelta) {
          const i = e.contentBlockDelta.contentBlockIndex;
          const d = e.contentBlockDelta.delta;
          if (d.text !== undefined) {
            blocks[i] ??= { text: "" };
            blocks[i].text += d.text;
            send("text", d.text);
          } else if (d.toolUse) blocks[i].toolUse.input += d.toolUse.input;
        } else if (e.messageStop) stop = e.messageStop.stopReason;
      }
      const content = blocks.filter(Boolean).map((b) => (b.toolUse ? { toolUse: { ...b.toolUse, input: JSON.parse(b.toolUse.input || "{}") } } : b));
      messages.push({ role: "assistant", content });
      if (stop !== "tool_use") break;
      const results = content
        .filter((b) => b.toolUse)
        .map(({ toolUse: { toolUseId, input } }) => {
          const end = input.end ?? (input.start ?? 1) + MAX_LINES - 1;
          send("tool", `Read ${input.path}:${input.start ?? 1}-${end}`);
          return { toolResult: { toolUseId, content: [{ text: readFile(input) }] } };
        });
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    send("error", e.name === "ThrottlingException" ? "Too many people are asking at once. Try again in a minute." : "Claude could not answer just now.");
    console.error(e);
  }
  stream.end();
});
