---
name: slop-map
description: Write or update the understand-slop map for the current repo (.slop/story.json) — cards for the user journey, the data flow behind it, and the code that does it — then validate it with `slop check`. Use when the user asks to map, chart or "slop" a codebase, or to refresh an existing map after the code changed.
---

# Map this repo for understand-slop

You are writing `.slop/story.json`, the story half of a map that `slop` shows as layered cards. The other half, the code, is machine-made: `slop index` reads every function, class and method from the repo. **You never write code into the story.** You point at code by symbol id, and the viewer quotes it verbatim from the files.

If `slop` is not on PATH, stop and tell the user to run `npm link` in their understand-slop checkout.

## Steps

1. **Index.** Run `slop index`. It writes `.slop/index.json` and keeps it out of git.
2. **Learn the format.** Run `slop schema` and read it. It is the exact JSON Schema your file must match.
3. **See the code.** Run `slop symbols` (or `slop symbols . <text>` to filter) for the full list of units:
   ```
   <id>  <kind>  <start>-<end>  <signature>
   ```
   Then read the repo itself, starting from its entry points: the router or pages, `main`/`App`, the server routes, the stores. Read enough to be right. A card that guesses must say so (see "Honesty").
4. **Write `.slop/story.json`.** If one exists, update it in place (see "Updating").
5. **Check.** Run `slop check` and fix every `error`. Warnings are drift: code the story names that is gone, or an anchor that matches more than one place. Fix those too, unless the code really is gone and the card should say so. Repeat until it is clean.
6. **Report.** Give the card count, the cards you marked `partial` or `alarm` and why, and tell the user to run `slop` to open it.

## The shape: three layers, any depth

`nodes` is a flat list. `parent` builds the tree, and `null` marks a root.

- **Roots are the surface: what a person sees and does.** Use pages, visible UI elements, and the journey between them (`kind: "page" | "element" | "journey"`). Persistent stores can sit at the root too (`kind: "store"`). Aim for 5–9 roots. Never make a root out of a file or a folder.
- **One level down is the data flow behind that surface** (`kind: "flow" | "store"`). Use what happens when the user does the thing, as numbered steps (`anatomy: [{kind: "flow", rows: [...]}]`), and where the data goes.
- **Below that is the code** (`kind: "module" | "class" | "function"`). It usually needs no card of its own: a node's `code` array names the units that do that step, and each becomes a code card.
  - Go deeper only where a branch earns it. A four-line function can be a whole finding.
  - Keep each level to about 8 children. Group with a `module` card rather than listing 30 functions.

**Edges** (`edges`) connect siblings only: both ends must have the same `parent`, and the edge carries that `parent`.
- Give each a short verb label: "holds", "opens in", "writes".
- Root edges (`parent: null`) are the map's main flow, so order and label them to read as the journey.

**Links** (`links`) connect a ROW of one card to a row of another, anywhere in the map, e.g. "step 2 of adding a vault writes the `vaults` key of the store". A row is named by:

| block | row name |
|---|---|
| `flow` | `n`, as a string: `"2"` |
| `facts` / `chips` / `bars` / `parts` | `label` |
| `schema` | column `name` |
| `routes` | `"METHOD /path"` |
| `map` | `from` |
| `source` | `"source"` |

## Pointing at code

- A `code` entry is a symbol id copied **exactly** from `slop symbols`, like `"src/lib/vault.ts#removeVault"`. To add narrative, use an object:
  ```json
  { "symbol": "src/lib/vault.ts#removeVault", "id": "vault-remove",
    "sub": "Compares an object with a string", "detail": "…", "state": "partial", "alarm": true }
  ```
  A class's methods become its child cards automatically. `methods: [...]` only adds ids and narrative to some of them.
- **Never invent an id.** If the unit you want isn't listed (an object-literal method, a Rust or Python file), quote it with a `source` block instead.
- A `source` block quotes code inside a card's anatomy, with a `why`. It takes exactly one of:
  - `"symbol": "<id>"`, for a whole unit;
  - `"file": "path", "at": "<the first line, trimmed>", "lines": N`, for anything else (a config block, a few lines of a long function). If that first line isn't unique in the file, `slop check` says so; put more lines in `at`, joined by `\n`.

## Honesty

Every node, row, edge and link has a `state`:
- **`derived`:** you read the code and it says so.
- **`partial`:** true as far as you could see, but something is missing or uncertain: a dynamic call, a branch you couldn't follow, a value set elsewhere.
- **`inferred`:** a reasonable guess you did not verify (a UI you didn't open, a caller you assume).

Rules for marking:
- `alarm: true` is for a real defect you can point at in the code, such as a comparison that is never true or a write that is never read. Say what it is in `detail`. Do not use it for style opinions.
- `ghost: true` marks something the product implies but the code doesn't have.
- `sub` is one plain-English line saying what the card IS, not what it does in general.
- `detail` is a few sentences for someone who has never seen the repo.
- `evidence` is the file, or `file:line`, the claim rests on.

## Ids and updating

- Node ids are short, stable and kebab-case (`vault-switcher`, `vs-remove`). They are the URLs people bookmark and share. Code-card ids default to `<owner>~<name>`; set `id` when you want a nicer one.
- **Updating an existing story:** keep every id that still means the same thing.
  - Rewrite narrative that has gone stale, and add cards for new features.
  - Delete cards whose code is gone, or keep them with `state: "partial"` and say what changed.
  - Run `slop check` first, because its warnings list exactly the code the old story names that no longer exists.
- `repo.name` is the project's name. Leave `commit` and `files` out; `slop` fills them in.

## A minimal story

```json
{
  "version": 1,
  "repo": { "name": "snecko" },
  "nodes": [
    { "id": "vault-switcher", "parent": null, "kind": "element", "title": "The vault switcher",
      "sub": "Pick, add or remove a vault", "state": "derived",
      "evidence": "src/components/vaultSwitcher.tsx" },
    { "id": "vs-remove", "parent": "vault-switcher", "kind": "flow", "title": "Removing a vault",
      "sub": "Never clears the remembered vault", "state": "partial", "alarm": true,
      "detail": "Meant to forget the vault if it was the last one opened. It never does: the check compares an object with a string.",
      "anatomy": [ { "kind": "flow", "rows": [
        { "n": 1, "title": "Dropped from vaults.json", "detail": "removeVault filters it out.", "state": "derived" },
        { "n": 2, "title": "Meant to forget it as the last vault", "detail": "lastVault is read as a string but stored as an object.", "state": "partial" }
      ] } ],
      "code": [ { "symbol": "src/lib/vault.ts#removeVault", "id": "vault-remove", "sub": "Compares an object with a string", "state": "partial", "alarm": true },
                "src/App.tsx#handleRemoveVault" ] }
  ],
  "edges": [],
  "links": []
}
```
