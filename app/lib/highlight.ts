/**
 * Syntax colouring for the code the drawer reads off disk.
 *
 * The viewer used to draw every line in one ink, which is the one place the
 * app asked a reader to do work a code editor does for free: find the string,
 * find the comment, find where the call starts. The map is supposed to make
 * code legible, so its own code pane cannot be the least legible pane in the
 * product.
 *
 * Deliberately a tokenizer, not a parser, and deliberately no dependency:
 * the maps cite nine languages (.ts/.tsx/.py/.java/.go/.js/.scala/.vue/.sql
 * and friends), and shipping a grammar per language to colour a 14-line slice
 * costs more than it returns. Everything here is the lexical layer those
 * languages share — strings, comments, numbers, keywords, call sites — which
 * is the part that carries the reading.
 *
 * It is told the LANGUAGE, never asked to guess: the file's extension is
 * already known at every call site.
 */

export type Kind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "call"
  | "punct"
  | "annotation";

export interface Token {
  text: string;
  kind: Kind;
}

/** A language the tokenizer has been told about, resolved from a file path. */
export type Lang = "c" | "python" | "sql" | "markup" | "plain";

/**
 * Keywords by family. One list per family rather than per language: a Java
 * keyword highlighted in a Scala file is a word that really is a keyword in
 * Scala too, almost always, and the cost of being wrong is one word tinted
 * that should not have been.
 */
const C_KEYWORDS = new Set([
  // shared control flow
  "if", "else", "for", "while", "do", "switch", "case", "default", "break",
  "continue", "return", "goto", "try", "catch", "finally", "throw", "throws",
  // declarations
  "class", "interface", "enum", "struct", "record", "trait", "object", "type",
  "function", "func", "fun", "def", "val", "var", "let", "const", "static",
  "final", "abstract", "sealed", "override", "implements", "extends", "package",
  "import", "export", "from", "as", "public", "private", "protected", "internal",
  "namespace", "declare", "readonly", "implicit", "given", "using", "with",
  // values and operators that read as words
  "new", "delete", "typeof", "instanceof", "in", "of", "is", "await", "async",
  "yield", "this", "self", "super", "null", "nil", "none", "true", "false",
  "undefined", "void", "throw", "defer", "go", "chan", "select", "range",
  "map", "make", "synchronized", "volatile", "transient", "native", "assert",
  "match", "when", "lazy", "suspend", "operator", "data", "sealed", "satisfies",
  "keyof", "infer", "extends", "module", "require",
]);

const PY_KEYWORDS = new Set([
  "def", "class", "return", "yield", "if", "elif", "else", "for", "while",
  "break", "continue", "pass", "import", "from", "as", "with", "try", "except",
  "finally", "raise", "assert", "lambda", "global", "nonlocal", "del", "in",
  "is", "not", "and", "or", "async", "await", "True", "False", "None", "self",
  "cls", "match", "case",
]);

const SQL_KEYWORDS = new Set([
  "select", "from", "where", "join", "left", "right", "inner", "outer", "on",
  "group", "order", "by", "having", "limit", "offset", "insert", "into",
  "values", "update", "set", "delete", "create", "table", "alter", "drop",
  "index", "view", "primary", "key", "foreign", "references", "not", "null",
  "default", "unique", "constraint", "and", "or", "as", "distinct", "union",
  "all", "case", "when", "then", "else", "end", "with", "returning", "cascade",
]);

/** Which family a file is read as. Unknown extensions get no colour at all. */
export function langOf(file: string): Lang {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  if (["py", "pyi"].includes(ext)) return "python";
  if (["sql", "prisma"].includes(ext)) return "sql";
  if (["html", "vue", "svelte", "xml"].includes(ext)) return "markup";
  if (
    ["ts", "tsx", "js", "jsx", "mjs", "cjs", "java", "go", "scala", "kt", "kts",
      "c", "h", "cpp", "hpp", "cs", "rs", "swift", "php", "css", "scss", "json"].includes(ext)
  ) {
    return "c";
  }
  return "plain";
}

const KEYWORDS: Record<Lang, Set<string>> = {
  c: C_KEYWORDS,
  python: PY_KEYWORDS,
  sql: SQL_KEYWORDS,
  markup: new Set(),
  plain: new Set(),
};

/** The CSS colour each kind is drawn in. Theme tokens, so dark mode follows. */
export const TOKEN_COLOR: Record<Kind, string> = {
  plain: "var(--color-code-plain)",
  comment: "var(--color-code-comment)",
  string: "var(--color-code-string)",
  number: "var(--color-code-number)",
  keyword: "var(--color-code-keyword)",
  type: "var(--color-code-type)",
  call: "var(--color-code-call)",
  punct: "var(--color-code-punct)",
  annotation: "var(--color-code-annotation)",
};

const WORD = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
const PUNCT = new Set("{}()[];,.:?!<>=+-*/%&|^~@#".split(""));

/**
 * One slice of code, tokenized line by line.
 *
 * Block comments and template/triple-quoted strings run across lines, so the
 * whole slice is scanned once and the result cut at newlines — a per-line pass
 * would restart inside a `/* ... *\/` and colour its body as code.
 */
export function highlight(code: string, lang: Lang): Token[][] {
  if (lang === "plain") return code.split("\n").map((l) => [{ text: l, kind: "plain" as const }]);

  const tokens: Token[] = [];
  const push = (text: string, kind: Kind) => {
    if (text) tokens.push({ text, kind });
  };

  const keywords = KEYWORDS[lang];
  const hash = lang === "python" || lang === "sql";
  let i = 0;
  const n = code.length;

  while (i < n) {
    const c = code[i];

    // ── whitespace and newlines: passed through so lines can be cut later
    if (c === "\n" || c === " " || c === "\t") {
      let j = i;
      while (j < n && (code[j] === "\n" || code[j] === " " || code[j] === "\t")) j++;
      push(code.slice(i, j), "plain");
      i = j;
      continue;
    }

    // ── comments
    const two = code.slice(i, i + 2);
    if (lang !== "sql" && two === "/*") {
      const end = code.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      push(code.slice(i, j), "comment");
      i = j;
      continue;
    }
    if ((two === "//" && lang !== "python") || (hash && c === "#") || (lang === "sql" && two === "--")) {
      let j = code.indexOf("\n", i);
      if (j === -1) j = n;
      push(code.slice(i, j), "comment");
      i = j;
      continue;
    }

    // ── strings. Python's triple quotes first: they contain lone quotes.
    if (lang === "python" && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const q = code.slice(i, i + 3);
      const end = code.indexOf(q, i + 3);
      const j = end === -1 ? n : end + 3;
      push(code.slice(i, j), "string");
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === c) {
          j++;
          break;
        }
        // Only a backtick string may span lines; an unterminated quote ends
        // at the newline rather than swallowing the rest of the slice.
        if (code[j] === "\n" && c !== "`") break;
        j++;
      }
      push(code.slice(i, j), "string");
      i = j;
      continue;
    }

    // ── annotations and decorators: @Override, @property, #[derive]
    if (c === "@") {
      WORD.lastIndex = i + 1;
      const m = WORD.exec(code);
      if (m) {
        push(code.slice(i, WORD.lastIndex), "annotation");
        i = WORD.lastIndex;
        continue;
      }
    }

    // ── numbers
    if (c >= "0" && c <= "9") {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(code);
      if (m) {
        push(m[0], "number");
        i += m[0].length;
        continue;
      }
    }

    // ── words: keyword, type, call, or plain identifier
    WORD.lastIndex = i;
    const w = WORD.exec(code);
    if (w) {
      const text = w[0];
      const lower = lang === "sql" ? text.toLowerCase() : text;
      // What follows decides a call; what precedes decides a member.
      let k = i + text.length;
      while (k < n && (code[k] === " " || code[k] === "\t")) k++;
      const kind: Kind = keywords.has(lower)
        ? "keyword"
        : code[k] === "("
          ? "call"
          : // Capitalised and not a call: a type name, by convention in every
            // language here. SCREAMING_CASE is a constant, which reads as one.
            /^[A-Z]/.test(text)
            ? "type"
            : "plain";
      push(text, kind);
      i += text.length;
      continue;
    }

    // ── punctuation and anything else
    push(c, PUNCT.has(c) ? "punct" : "plain");
    i++;
  }

  return splitLines(tokens);
}

/** Cuts the flat token run at newlines, keeping each line's tokens in order. */
function splitLines(tokens: Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const t of tokens) {
    if (!t.text.includes("\n")) {
      lines[lines.length - 1].push(t);
      continue;
    }
    const parts = t.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: t.kind });
    });
  }
  return lines;
}
