"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useSearchParams } from "next/navigation";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { raw } from "hast-util-raw";
import { defaultSchema, sanitize } from "hast-util-sanitize";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Root } from "hast";
import { useMap } from "@/components/map-context";
import { Eyebrow } from "@/components/state";
import { Button } from "@/components/button";
import { STATIC_MAP, readSource } from "@/lib/source";
import type { Doc } from "@/lib/docs";
import { cn } from "@/lib/utils";

/**
 * The docs reader: a project's Markdown (README, design notes, decision logs)
 * and HTML pages, read in place of the open level, rendered for reading. It lives in the URL
 * like a level does — `?doc=<path>`, with `&line=` to land on a passage the
 * map cites — so Back closes it, and walking anywhere on the map leaves it.
 * The text comes through `/api/source`, behind the same containment check as
 * the code. HTML in a doc is drawn after GitHub's cleaning — never run — and
 * its images come through `/api/image`, which keeps web ones for offline use.
 */

/** Opens a doc over the open level, which stays in the URL to come back to. */
export function openDoc(file: string, at?: { line?: number; heading?: string }) {
  const q = new URLSearchParams(window.location.search);
  q.set("doc", file);
  q.delete("line");
  if (at?.line) q.set("line", String(at.line));
  window.history.pushState(null, "", `?${q}${at?.heading ? `#${at.heading}` : ""}`);
}

/** Back to the level the doc was opened over. */
export function closeDoc() {
  const q = new URLSearchParams(window.location.search);
  q.delete("doc");
  q.delete("line");
  window.history.pushState(null, "", q.size ? `?${q}` : window.location.pathname);
}

/** The doc open in the URL, if any. */
export function useOpenDoc(): { file: string; line?: number } | null {
  const params = useSearchParams();
  const file = params.get("doc");
  const line = Number(params.get("line")) || undefined;
  return file ? { file, line } : null;
}

const lists = new Map<string, Promise<Doc[]>>();

/** The open map's docs, fetched once per map. Null while loading. */
export function useDocList(): Doc[] | null {
  const { name } = useMap();
  const [docs, setDocs] = useState<{ map: string; list: Doc[] } | null>(null);
  useEffect(() => {
    if (!lists.has(name))
      lists.set(
        name,
        fetch(`/api/docs?map=${encodeURIComponent(name)}`)
          .then((r) => r.json())
          .then((r: { docs?: Doc[] }) => r.docs ?? [])
          .catch(() => {
            lists.delete(name);
            return [];
          }),
      );
    let live = true;
    void lists.get(name)!.then((list) => live && setDocs({ map: name, list }));
    return () => {
      live = false;
    };
  }, [name]);
  return docs?.map === name ? docs.list : null;
}

/* ── links and headings ──────────────────────────────────────── */

/** GitHub's heading anchors, so links written for GitHub land here too. */
function slug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

type Hast = { type: string; value?: string; children?: Hast[]; position?: { start: { line: number } } };
/** What a block override is handed: its syntax node, for the line it starts on, and what it holds. */
type Rendered = { node?: Hast; children?: React.ReactNode; align?: string };
const textOf = (n: Hast | undefined): string => (n?.value ?? "") + (n?.children ?? []).map(textOf).join("");

/** `href` from a doc at `from`, resolved against the repo root; null for one that leaves it. */
function resolve(from: string, href: string): string | null {
  const parts = href.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const seg of href.replace(/^\//, "").split("/")) {
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** The doc being read, for anything inside it that names another file. */
const Reading = createContext<{ map: string; file: string }>({ map: "", file: "" });

/**
 * Where an image in a doc is fetched from (app/api/image): a path in the
 * repository through the same containment as the code, a web image through
 * the offline cache. A published page has no server, so it keeps what the
 * doc says.
 */
function imageSrc(at: { map: string; file: string }, src: string | undefined): string | undefined {
  if (!src || STATIC_MAP || src.startsWith("data:")) return src;
  if (/^https?:\/\//i.test(src)) return `/api/image?url=${encodeURIComponent(src)}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return undefined;
  const path = resolve(at.file, decodeURIComponent(src.split(/[?#]/)[0]));
  return path ? `/api/image?map=${encodeURIComponent(at.map)}&file=${encodeURIComponent(path)}` : undefined;
}

/** A `srcset`'s candidates, each URL through imageSrc and its descriptor kept. */
const imageSet = (at: { map: string; file: string }, set: string | undefined) =>
  set
    ?.split(",")
    .map((c) => {
      const [url, ...rest] = c.trim().split(/\s+/);
      const to = imageSrc(at, url);
      return to ? [to, ...rest].join(" ") : "";
    })
    .filter(Boolean)
    .join(", ");

/** Docs that are a page of HTML rather than Markdown. */
export const isHtml = (file: string) => /\.html?$/i.test(file);
/** Docs the reader opens: Markdown, and HTML pages. */
const isDoc = (path: string) => /\.(mdx?|html?)$/i.test(path);

function scrollToHeading(root: HTMLElement | null, id: string) {
  const el = root?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  el?.scrollIntoView({ block: "start", behavior: "smooth" });
  return Boolean(el);
}

/**
 * How the doc's Markdown is drawn, beyond plain elements. Fixed at module
 * level, so a re-render of the reader never remounts the text. Blocks carry
 * the line they start on, which is how a passage the map cites is found
 * again; headings carry their slug, and the reader numbers repeats and makes
 * them anchors once the page is drawn. Links read the doc they are in off
 * the article (`data-file`).
 */
const heading = (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
  function Heading({ node, children, align }: Rendered) {
    return (
      // `align` is what a README centres its logo and title with; the cleaning keeps it.
      <Tag data-slug={slug(textOf(node))} data-line={node?.position?.start.line} {...(align ? { align: align as "center" } : {})}>
        {children}
      </Tag>
    );
  };
const lined = (Tag: "p" | "li" | "pre" | "blockquote" | "table") =>
  function Lined({ node, children, align }: Rendered) {
    return (
      <Tag data-line={node?.position?.start.line} {...(align ? { align: align as "center" } : {})}>
        {children}
      </Tag>
    );
  };

const COMPONENTS: Components = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  h5: heading("h5"),
  h6: heading("h6"),
  p: lined("p"),
  li: lined("li"),
  pre: lined("pre"),
  blockquote: lined("blockquote"),
  table: lined("table"),
  a({ href = "", children }) {
    if (/^(https?:|mailto:)/i.test(href))
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    if (href.startsWith("#"))
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            scrollToHeading(e.currentTarget.closest("article"), decodeURIComponent(href.slice(1)));
          }}
        >
          {children}
        </a>
      );
    // Another file in the repository: a doc opens here, resolved against the
    // doc it is in; anything else is named, since this reader shows only docs.
    const [path, hash] = href.split("#");
    if (!isDoc(path)) return <span title={href}>{children}</span>;
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          const from = e.currentTarget.closest("article")?.dataset.file ?? "";
          const target = resolve(from, decodeURIComponent(path));
          if (target) openDoc(target, { heading: hash });
        }}
      >
        {children}
      </a>
    );
  },
  img: function Img({ src, srcSet, alt, title, width, height, align }: React.ImgHTMLAttributes<HTMLImageElement> & { align?: string }) {
    const at = useContext(Reading);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a doc's own image, at the size it asks for
      <img
        src={imageSrc(at, typeof src === "string" ? src : undefined)}
        srcSet={imageSet(at, srcSet)}
        alt={alt ?? ""}
        title={title}
        width={width}
        height={height}
        {...(align ? { align } : {})}
        loading="lazy"
      />
    );
  },
  source: function Source({ srcSet, media, type }: React.SourceHTMLAttributes<HTMLSourceElement>) {
    return <source srcSet={imageSet(useContext(Reading), srcSet)} media={media} type={type} />;
  },
};

/* ── the reader ──────────────────────────────────────────────── */

type Text = { text: string } | { failed: true } | null;
const PLUGINS = [remarkGfm];
// HTML written into the Markdown (a centred logo, a badge row) is drawn, not
// printed, and cleaned the way GitHub cleans it: no script, no styles, no
// event handlers, only the tags and attributes a README may use.
const REHYPE = [rehypeRaw, [rehypeSanitize, defaultSchema]] as NonNullable<React.ComponentProps<typeof Markdown>["rehypePlugins"]>;

/** A doc that is an HTML page: parsed, cleaned the same way, and drawn with the same parts. */
function HtmlDoc({ html }: { html: string }) {
  const tree = useMemo(
    () => sanitize(raw({ type: "root", children: [{ type: "raw", value: html }] } as unknown as Root), defaultSchema) as Root,
    [html],
  );
  return toJsxRuntime(tree, { Fragment, jsx, jsxs, passNode: true, components: COMPONENTS as never });
}

export function DocView({ file, line }: { file: string; line?: number }) {
  const { name: map } = useMap();
  const [loaded, setLoaded] = useState<{ file: string; text: Text }>({ file, text: null });
  const text = loaded.file === file ? loaded.text : null;
  const article = useRef<HTMLElement>(null);
  const [outline, setOutline] = useState<{ id: string; label: string; depth: number }[]>([]);

  useEffect(() => {
    const ctl = new AbortController();
    readSource({ map, file, start: 1, end: 1_000_000 }, ctl.signal)
      .then((r) => setLoaded({ file, text: "slice" in r ? { text: r.slice.code } : { failed: true } }))
      .catch(() => !ctl.signal.aborted && setLoaded({ file, text: { failed: true } }));
    return () => ctl.abort();
  }, [map, file]);

  // The outline is read off the rendered headings, so its anchors are the
  // ones the page actually has. Then the reader lands where they asked: a
  // heading named in the hash, else the passage at `line`, lit once.
  useLayoutEffect(() => {
    const root = article.current;
    if (!root || !text || !("text" in text)) return;
    // GitHub's anchors, numbered on a repeat, so links written for GitHub land here.
    const seen = new Map<string, number>();
    for (const h of root.querySelectorAll<HTMLElement>("[data-slug]")) {
      const base = h.dataset.slug!;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      h.id = n ? `${base}-${n}` : base;
    }
    setOutline(
      [...root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]")].map((h) => ({
        id: h.id,
        label: h.textContent ?? "",
        depth: Number(h.tagName[1]),
      })),
    );
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && scrollToHeading(root, hash)) return;
    if (!line) return;
    const at = [...root.querySelectorAll<HTMLElement>("[data-line]")].filter((el) => Number(el.dataset.line) <= line).pop();
    if (!at) return;
    at.scrollIntoView({ block: "start" });
    const ring = getComputedStyle(document.documentElement).getPropertyValue("--color-mint-success").trim();
    at.animate([{ backgroundColor: ring }, { backgroundColor: "transparent" }], { duration: 2400, easing: "ease-out" });
  }, [text, line]);


  return (
    <>
      <header className="mb-8 border-b border-border-gray pb-6">
        <div className="mb-4">
          <Button onClick={closeDoc}>‹ Back to the map</Button>
        </div>
        <Eyebrow>Doc</Eyebrow>
        <h1 className="mt-2 font-mono text-[22px] font-semibold tracking-[-0.01em] text-ink">{file}</h1>
      </header>
      {text === null ? (
        <p className="text-[13px] text-faint">Reading…</p>
      ) : "failed" in text ? (
        <p className="text-[13px] text-clay-ink">Could not read this doc from the repository.</p>
      ) : (
        <div className="flex items-start gap-12">
          <article ref={article} data-file={file} className="doc-prose min-w-0 max-w-[760px] flex-1">
            <Reading.Provider value={{ map, file }}>
              {isHtml(file) ? (
                <HtmlDoc html={text.text} />
              ) : (
                <Markdown remarkPlugins={PLUGINS} rehypePlugins={REHYPE} components={COMPONENTS}>
                  {text.text}
                </Markdown>
              )}
            </Reading.Provider>
          </article>
          {outline.length > 2 ? (
            <nav aria-label="Outline" className="sticky top-4 hidden max-h-[calc(100vh-10rem)] w-[240px] shrink-0 overflow-auto xl:block">
              <Eyebrow>On this page</Eyebrow>
              <ul className="mt-3 flex flex-col gap-0.5">
                {outline.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToHeading(article.current, h.id);
                      }}
                      className={cn(
                        "block truncate rounded-[4px] py-1 text-[12.5px] text-muted-slate hover:text-ink",
                        h.depth === 3 && "pl-3 text-[12px]",
                      )}
                      title={h.label}
                    >
                      {h.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      )}
    </>
  );
}

/** A small page, for the palette and the title bar: a doc. */
export function DocIcon() {
  return (
    <>
      <path d="M4 1.5h5.5L12 4v10.5H4z" />
      <path d="M6 7h4M6 9.5h4M6 12h2.5" />
    </>
  );
}
