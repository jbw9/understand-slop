/**
 * A small syntax highlighter for the languages the maps quote: TypeScript,
 * TSX and Rust. Not a parser — a single left-to-right scan that knows
 * comments, strings (including template strings and multi-line ones),
 * numbers, keywords, capitalised names (types, components) and names followed
 * by `(` (calls). That is enough to make code legible at a glance, and it
 * never changes the text: joining every token's `text` gives back the input.
 */

export type Tok = "plain" | "keyword" | "string" | "number" | "comment" | "type" | "fn";
export interface Token {
  text: string;
  tok: Tok;
}

const TS = new Set(
  (
    "abstract as async await break case catch class const continue debugger default delete do else enum " +
    "export extends false finally for from function get if implements import in instanceof interface is " +
    "keyof let new null of private protected public readonly return satisfies set static super switch this " +
    "throw true try type typeof undefined var void while with yield"
  ).split(" "),
);
const RS = new Set(
  (
    "as async await break const continue crate else enum extern false fn for if impl in let loop match mod " +
    "move mut pub ref return self Self static struct super trait true type unsafe use where while Ok Err Some None"
  ).split(" "),
);

/** The language a file is in, from its name. */
export function langOf(file: string): "ts" | "tsx" | "rs" | "text" {
  const ext = file.slice(file.lastIndexOf(".") + 1);
  if (ext === "ts" || ext === "tsx" || ext === "rs") return ext;
  if (ext === "js" || ext === "jsx" || ext === "mjs") return "ts";
  return "text";
}

/** Tokenise `code`, then split the tokens on newlines into one array per line. */
export function highlightLines(code: string, lang: string): Token[][] {
  const tokens = lang === "text" ? [{ text: code, tok: "plain" as Tok }] : scan(code, lang === "rs" ? RS : TS, lang === "rs");
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, tok: t.tok });
    });
  }
  return lines;
}

function scan(src: string, keywords: Set<string>, rust: boolean): Token[] {
  const out: Token[] = [];
  const push = (text: string, tok: Tok) => {
    const last = out[out.length - 1];
    if (last && last.tok === tok) last.text += text;
    else out.push({ text, tok });
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      const j = end < 0 ? src.length : end;
      push(src.slice(i, j), "comment");
      i = j;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const j = end < 0 ? src.length : end + 2;
      push(src.slice(i, j), "comment");
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      // Rust's 'a lifetimes and char literals: only a quote that closes on
      // the same short run counts as a string.
      if (rust && c === "'" && src[i + 2] !== "'" && src[i + 3] !== "'") {
        push(c, "plain");
        i++;
        continue;
      }
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        else if (c !== "`" && src[j] === "\n") break;
        j++;
      }
      j = Math.min(src.length, j + 1);
      push(src.slice(i, j), "string");
      i = j;
    } else if (/[0-9]/.test(c) && !/[\w$]/.test(src[i - 1] ?? "")) {
      const m = /^[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?[a-z0-9]*/.exec(src.slice(i))!;
      push(m[0], "number");
      i += m[0].length;
    } else if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))!;
      const word = m[0];
      const after = src.slice(i + word.length).match(/^\s*(\(|!\()/);
      const tok: Tok = keywords.has(word)
        ? "keyword"
        : after
          ? "fn"
          : /^[A-Z]/.test(word)
            ? "type"
            : "plain";
      push(word, tok);
      i += word.length;
    } else {
      push(c, "plain");
      i++;
    }
  }
  return out;
}

/** Tailwind classes per token kind, from the `--color-code-*` tokens. */
export const TOK_CLASS: Record<Tok, string> = {
  plain: "text-on-surface",
  keyword: "text-code-keyword",
  string: "text-code-string",
  number: "text-code-number",
  comment: "text-code-comment italic",
  type: "text-code-type",
  fn: "text-code-fn font-semibold",
};
