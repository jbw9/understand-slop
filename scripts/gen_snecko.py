"""Write ui/lib/snecko.ts: the snecko map, with every quote pulled verbatim
from ~/projects/snecko at its current commit. The narrative is authored here;
the code, line numbers and signatures are read from disk, never retyped.

    python3 scripts/gen_snecko.py

Re-run after snecko changes. A quote whose line range no longer starts at the
declaration it names fails an assert rather than shipping the wrong code."""
import json, os, re, subprocess, sys

REPO = os.path.expanduser("~/projects/snecko")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "ui", "lib", "snecko.ts")
COMMIT = subprocess.check_output(["git", "-C", REPO, "rev-parse", "--short", "HEAD"], text=True).strip()
FILES = len(subprocess.check_output(["git", "-C", REPO, "ls-files"], text=True).splitlines())
_cache = {}

def lines(f):
    if f not in _cache:
        _cache[f] = open(os.path.join(REPO, f)).read().split("\n")
    return _cache[f]

def text(f, a, b):
    return "\n".join(lines(f)[a - 1 : b])

class Code(str):
    pass

def signature(body):
    """Same normalisation as readSignature in ui/components/edits.tsx."""
    ls = body.split("\n")
    k = next((i for i, l in enumerate(ls) if re.search(r"\{\s*$", l)), 0)
    head = "\n".join(ls[: k + 1])
    head = re.sub(r"\{\s*$", "", head)
    head = re.sub(r"\s+", " ", head)
    head = re.sub(r"\(\s+", "(", head)
    head = re.sub(r",\s*\)", ")", head)
    return head.strip()

def src(f, a, b, why=None):
    d = {"kind": "source", "file": f, "start": a, "code": Code(text(f, a, b))}
    if why:
        d["why"] = why
    return d

def unit(id, name, sub, f, a, b, detail=None, state="derived", alarm=False, kind="function", children=None):
    body = text(f, a, b)
    sig = signature(body)
    first = body.split("\n")[0]
    assert name.split(".")[-1] in first or name in body.split("\n")[1], (id, first)
    last = body.rstrip().split("\n")[-1].strip()
    assert last in ("}", "};", "},", ");", "}, []);", "})", "),"), (id, last)
    n = {
        "id": id,
        "kind": kind,
        "title": name,
        "sub": sub,
        "state": state,
    }
    if alarm:
        n["alarm"] = True
    if detail:
        n["detail"] = detail
    n["evidence"] = f"{f}:{a}"
    n["unit"] = {
        "lang": f.rsplit(".", 1)[1],
        "file": f,
        "start": a,
        "end": b,
        "signature": sig,
        "body": Code(body),
        "complete": True,
    }
    if children:
        n["children"] = children
    return n

def node(id, kind, title, sub, state="derived", **kw):
    n = {"id": id, "kind": kind, "title": title, "sub": sub, "state": state}
    for k in ("alarm", "ghost", "detail", "evidence", "anatomy", "edges", "children"):
        if k in kw and kw[k] is not None:
            n[k] = kw[k]
    return n

def flow(*steps):
    return {"kind": "flow", "rows": [{"n": i + 1, "title": t, "detail": d, "state": s} for i, (t, d, s) in enumerate(steps)]}

def facts(*rows):
    return {"kind": "facts", "rows": [{"label": l, "value": v, "state": s} for l, v, s in rows]}

def mapping(caption, *rows):
    return {"kind": "map", "caption": caption, "rows": [{"from": a, "to": b, "state": s} for a, b, s in rows]}

def edge(a, b, label=None, state="derived", alarm=False):
    e = {"from": a, "to": b, "state": state}
    if alarm:
        e["alarm"] = True
    if label:
        e["label"] = label
    return e

# ── the tree ────────────────────────────────────────────────────

APP, VAULT, FH, STORE = "src/App.tsx", "src/lib/vault.ts", "src/lib/fileHandler.ts", "src/utils/store.ts"
LP, MS, ED, CMH = "src/lib/livePreview.ts", "src/lib/markdownStyle.ts", "src/components/editor.tsx", "src/lib/contextMenuHandler.ts"

AUTHORED = [
    node(
        "titlebar", "element", "The title bar", "Frameless window, custom controls",
        detail="The operating system's frame is switched off and replaced by a 32px bar: a drag region with a label, and minimise, maximise and close buttons wired straight to the Tauri window.",
        evidence="src/components/titlebar.tsx",
        anatomy=[
            facts(
                ("Window frame", "decorations: false", "derived"),
                ("Dragging", "data-tauri-drag-region", "derived"),
                ("Label", '"app", hard-coded', "partial"),
                ("Size at launch", "800 × 600", "derived"),
            ),
            src("src/components/titlebar.tsx", 26, 32,
                why="The label is a placeholder. The product name, snecko, is set in tauri.conf.json but never reaches the window, so every user sees the word 'app'."),
        ],
    ),
    node(
        "sidebar", "element", "The sidebar", "Resizable · holds the vaults and the tree",
        detail="A column down the left that holds the vault switcher and the file tree. Its right edge is a 4px handle you can drag, and right-clicking its empty space opens the New Note / New Folder menu.",
        evidence="src/components/sidebar.tsx",
        children=[
            node(
                "sb-resize", "flow", "Dragging its edge", "Width follows the mouse · floor 200px",
                state="partial", alarm=True,
                detail="The width has a minimum and no maximum: the sidebar can be dragged across the whole window, over the editor.",
                evidence="src/components/sidebar.tsx:27",
                anatomy=[flow(
                    ("Press on the handle", "A 4px strip on the right edge sets a resizing flag. Nothing moves yet.", "derived"),
                    ("Width follows the pointer", "Every mousemove on the window sets the width to the pointer's x, but never below 200px.", "derived"),
                    ("No upper bound", "The clamp is Math.min with a single argument, which returns that argument — so there is no maximum.", "partial"),
                    ("Release anywhere", "mouseup on the window clears the flag.", "derived"),
                )],
                children=[
                    unit("sb-resize-fn", "resize", "Math.min with one argument", "src/components/sidebar.tsx", 27, 35,
                         detail="`Math.min(Math.max(e.clientX, minWidth))` — the outer Math.min was meant to take a maximum as its second argument, and has none.",
                         state="partial", alarm=True),
                ],
            ),
        ],
    ),
    node(
        "vault-switcher", "element", "The vault switcher", "Pick, add or remove a vault",
        detail="A vault is just a folder. The switcher lists the ones you've added, opens one on click, adds one through a folder picker, and shows a remove button on every vault except the open one.",
        evidence="src/components/vaultSwitcher.tsx",
        edges=[
            edge("vs-add", "vs-open", "then opens"),
            edge("vs-startup", "vs-open", "opens"),
            edge("vs-remove", "vs-startup", "breaks", alarm=True),
        ],
        children=[
            node(
                "vs-add", "flow", "Adding a vault", "Folder picker → vaults.json → open",
                state="partial", alarm=True,
                detail="The new vault is opened straight away, but it is never remembered as the last vault: restart the app and the previous one opens instead.",
                evidence="src/App.tsx:130",
                anatomy=[flow(
                    ("A folder picker opens", "pickDir asks Tauri for one directory. Cancelling returns nothing and nothing happens.", "derived"),
                    ("Added to vaults.json", "addVault skips a folder that is already listed, and names the vault after the folder's last path segment.", "derived"),
                    ("Opened straight away", "openVault reads the folder's whole tree and shows it.", "derived"),
                    ("Not remembered as the last vault", "openVault looks the path up in `vaults` — the React state from before this add, which does not contain it yet — so setLastVault is skipped.", "partial"),
                )],
                children=[
                    unit("app-add-vault", "handleAddVault", "Picker, store, open", APP, 130, 141),
                    unit("fh-pick-dir", "pickDir", "One directory, or nothing", FH, 41, 52),
                    unit("vault-add", "addVault", "Appends to vaults.json", VAULT, 19, 34),
                ],
            ),
            node(
                "vs-open", "flow", "Opening a vault", "The whole folder tree, read up front",
                detail="Opening a vault reads every folder and note in it before anything is shown, however deep the tree goes.",
                evidence="src/App.tsx:102",
                anatomy=[flow(
                    ("Every folder is read", "readDir walks the tree recursively, one directory listing per folder, skipping any name that starts with a dot.", "derived"),
                    ("The tree is replaced", "The result replaces the file tree in one go; folders start collapsed even though their contents are already loaded.", "derived"),
                    ("Remembered as the last vault", "Only if the path is found in the vault list held in React state at that moment.", "partial"),
                )],
                children=[
                    unit("app-open-vault", "openVault", "Read tree, remember vault", APP, 102, 111,
                         detail="`vaults` here is the state captured when this function was created. Called right after setVaults — on add, and at startup — it still sees the old list.",
                         state="partial", alarm=True),
                    unit("fh-read-dir", "readDir", "Recursive, skips dot-names", FH, 18, 39),
                ],
            ),
            node(
                "vs-remove", "flow", "Removing a vault", "Never clears the remembered vault",
                state="partial", alarm=True,
                detail="Removing a vault is meant to forget it if it was the last one opened. It never does: the check compares an object with a string.",
                evidence="src/lib/vault.ts:36",
                anatomy=[flow(
                    ("Only for vaults that aren't open", "The switcher shows a check mark, not a remove button, on the open vault — so App's branch for removing the open vault can't be reached from the UI.", "derived"),
                    ("Dropped from vaults.json", "removeVault filters it out of the list.", "derived"),
                    ("Meant to forget it as the last vault", "It reads lastVault as a string and compares it with the path, but setLastVault stores a {path, name} object. The comparison is never true, so lastVault is never cleared and a new one is never chosen.", "partial"),
                    ("Next launch opens nothing", "If the removed vault was the remembered one, startup finds it missing from the list and opens no vault at all.", "partial"),
                )],
                children=[
                    unit("vault-remove", "removeVault", "Compares an object with a string", VAULT, 36, 57,
                         detail="`store.get<string>(\"lastVault\")` — but lastVault is written by setLastVault as a Vault object. The type argument is a cast, not a check, so `lastVault === path` is always false.",
                         state="partial", alarm=True),
                    unit("app-remove-vault", "handleRemoveVault", "Unreachable branch for the open vault", APP, 113, 128),
                    unit("vault-set-last", "setLastVault", "Stores the whole Vault object", VAULT, 60, 63),
                ],
            ),
            node(
                "vs-startup", "flow", "Coming back where you left off", "Last vault, then last note",
                detail="On launch the app reopens the last vault, then the last note — but only if the note's path is inside that vault.",
                evidence="src/App.tsx:76",
                anatomy=[
                    flow(
                        ("Vaults and the last vault are read", "Both come from vaults.json.", "derived"),
                        ("The last vault reopens", "Only if it is still in the vault list.", "derived"),
                        ("The last note reopens", "Only if its path starts with the vault's path; otherwise the editor stays empty.", "derived"),
                    ),
                    src(APP, 75, 99),
                ],
                children=[
                    unit("vault-get-last", "getLastVault", "Vault or null", VAULT, 65, 69),
                    unit("vault-get-last-file", "getLastFile", "File or null", VAULT, 76, 80),
                    unit("vault-get-all", "getVaults", "Empty list if none", VAULT, 13, 17),
                ],
            ),
        ],
    ),
    node(
        "file-tree", "element", "The file tree", "Folders first, then A–Z",
        detail="Every folder and note in the vault except dot-names, folders first and then alphabetical, shown without file extensions. Folders expand on click — but their contents were already read when the vault opened.",
        evidence="src/components/fileTree.tsx",
        edges=[edge("ft-sort", "ft-open", "then")],
        children=[
            node(
                "ft-sort", "flow", "Ordering and naming", "Folders first · extensions hidden",
                detail="Each level is sorted on every render: folders before notes, then by name. Names are shown without their extension.",
                evidence="src/components/fileTree.tsx:80",
                anatomy=[facts(
                    ("Order", "folders, then name A–Z (localeCompare)", "derived"),
                    ("Shown name", "extension stripped (splitFileName)", "derived"),
                    ("Sorting", "in place on the array it was given, then copied", "partial"),
                )],
                children=[
                    unit("ft-sort-fn", "sortEntries", "Sorts its input in place", "src/components/fileTree.tsx", 80, 90,
                         detail="`entries.sort(...)` reorders the array App holds in state before the copy is made. Harmless today, because nothing else reads that order — but it mutates React state outside setState.",
                         state="partial"),
                    unit("fh-split-name", "splitFileName", "name → {file, ext}", FH, 64, 69),
                ],
            ),
            node(
                "ft-open", "flow", "Opening a note", "Flush, read, show, remember",
                detail="Clicking a note first writes any save still waiting for the note you're leaving, then loads the new one.",
                evidence="src/App.tsx:143",
                anatomy=[flow(
                    ("A pending save is flushed", "If a save timer is still running, it is cancelled and the current note is written immediately.", "derived"),
                    ("The note is read", "The whole file is read as text.", "derived"),
                    ("It replaces the editor's text", "The editor swaps its entire document for the new text.", "derived"),
                    ("Remembered as the last note", "setLastFile writes {name, path} to vaults.json.", "derived"),
                )],
                children=[
                    unit("app-open-file", "handleOpenFile", "Flush, read, remember", APP, 143, 161),
                    unit("vault-set-last-file", "setLastFile", "Writes lastFile", VAULT, 71, 74),
                ],
            ),
        ],
    ),
    node(
        "context-menu", "element", "The right-click menu", "On a note, or on the sidebar",
        detail="The browser's own menu is switched off for the whole window, and this one replaces it. Right-click a note for Open in new tab, Rename and Delete; right-click empty sidebar for New Note and New Folder.",
        evidence="src/lib/contextMenuHandler.ts, src/main.tsx:6",
        anatomy=[src("src/main.tsx", 5, 8, why="Global and unconditional: no right-click anywhere in the window — the editor included — shows the browser menu, so copy and paste are keyboard-only.")],
        edges=[edge("cm-file", "cm-delete", "Delete")],
        children=[
            node(
                "cm-file", "flow", "On a note", "Two of three items do nothing",
                state="partial", alarm=True,
                detail="Open in new tab and Rename are in the menu with empty handlers. Only Delete does anything.",
                evidence="src/lib/contextMenuHandler.ts:40",
                anatomy=[mapping("menu item → what happens",
                    ("Open in new tab", "nothing — onClick is empty", "partial"),
                    ("Rename", "nothing — onClick is empty, and App passes onRename: () => {}", "partial"),
                    ("Delete", "asks to confirm, then removes it from disk", "derived"),
                )],
                children=[unit("cmh-file-menu", "handleFileContextMenu", "Three items, one wired", CMH, 40, 60, state="partial", alarm=True)],
            ),
            node(
                "cm-delete", "flow", "Deleting", "Confirm, remove, re-read",
                detail="A native confirm, then the file — or the folder and everything in it — is removed from disk. If the open note was inside, the editor is cleared.",
                evidence="src/App.tsx:197",
                anatomy=[flow(
                    ("Confirm", "A blocking browser confirm: 'This cannot be undone.'", "derived"),
                    ("Removed from disk", "Recursively for a folder. There is no trash or undo.", "derived"),
                    ("The editor is cleared", "If the open note was the one deleted, or lived inside the deleted folder.", "derived"),
                    ("The whole vault is re-read", "The tree is rebuilt from disk.", "derived"),
                )],
                children=[
                    unit("app-delete", "handleDelete", "Confirm, remove, clear, re-read", APP, 197, 215),
                    unit("fh-delete", "deleteEntry", "Recursive for folders", FH, 115, 117),
                ],
            ),
            node(
                "cm-sidebar", "flow", "On the sidebar", "New Note · New Folder, at the vault root",
                detail="Both create at the top of the vault, never inside a folder: the sidebar menu always passes the vault's own path, and the note menu has no 'new here'.",
                evidence="src/lib/contextMenuHandler.ts:62",
                anatomy=[mapping("menu item → what it creates",
                    ("New Note", "Untitled.md, or Untitled N.md — then opens it", "derived"),
                    ("New Folder", "Untitled, or Untitled N", "derived"),
                )],
                children=[
                    unit("cmh-sidebar-menu", "handleSidebarContextMenu", "Always the vault root", CMH, 62, 80),
                    unit("app-create-file", "handleCreateFile", "Create, re-read, open", APP, 178, 186),
                    unit("fh-new-note", "newNote", "An empty .md file", FH, 87, 99),
                    unit("fh-free-name", "getAvailableFileName", "Untitled, Untitled 1, …", FH, 71, 85),
                    unit("app-create-folder", "handleCreateFolder", "Create, re-read", APP, 188, 195),
                    unit("fh-new-dir", "newDir", "An empty folder", FH, 101, 113),
                ],
            ),
        ],
    ),
    node(
        "editor", "element", "The note editor", "Markdown with live preview",
        detail="A CodeMirror editor that hides markdown's marks except on the line you're typing on, saves as you type, and shows the note's name as a button you click to rename it.",
        evidence="src/components/editor.tsx",
        edges=[edge("ed-save", "ed-preview", "redraws")],
        children=[
            node(
                "ed-save", "flow", "Typing and saving", "Whole file, 10ms after you stop",
                detail="Every change is written back to disk 10 milliseconds after the last keystroke — in practice, at almost every pause — as a full overwrite of the file.",
                evidence="src/App.tsx:59",
                anatomy=[
                    flow(
                        ("CodeMirror reports a change", "Its update listener passes the whole document text up on every edit.", "derived"),
                        ("App takes the text", "It becomes `content` in App's state.", "derived"),
                        ("A 10ms timer restarts", "Each keystroke cancels the previous timer, so a write happens 10ms after you stop.", "derived"),
                        ("The whole file is overwritten", "writeTextFile replaces the note on disk with the full text.", "derived"),
                    ),
                    src(ED, 119, 130, why="The other direction: when App's `content` changes — opening another note — the editor's whole document is replaced. Typing doesn't trigger it, because the text already matches."),
                ],
                children=[unit("app-content-change", "handleContentChange", "Debounced write, 10ms", APP, 59, 71)],
            ),
            node(
                "ed-preview", "flow", "Live preview", "Marks hidden off the cursor's line",
                detail="Headings, bold, italic and inline code are styled where they stand; their #, * and ` marks are hidden on every line except the one the cursor is on.",
                evidence="src/lib/livePreview.ts",
                anatomy=[flow(
                    ("Rebuilt on change", "On every edit, scroll or cursor move.", "derived"),
                    ("Only what's on screen", "The markdown syntax tree is walked within the visible ranges only.", "derived"),
                    ("Styled in place", "Headings 1–6, bold, italic and inline code get a class each.", "derived"),
                    ("Marks hidden", "#, *, _ and ` are replaced with nothing — unless the cursor is on that line.", "derived"),
                )],
                children=[
                    unit("lp-plugin", "markdownLivePreview", "A ViewPlugin class", LP, 142, 163, kind="class",
                         detail="An anonymous class handed to ViewPlugin.fromClass. It holds the current decorations and rebuilds them when the document, viewport or selection changes.",
                         children=[
                             unit("lp-ctor", "constructor", "Builds once on mount", LP, 146, 148),
                             unit("lp-update", "update", "Rebuilds on edit, scroll, cursor", LP, 150, 158),
                         ]),
                    unit("lp-build", "buildDecorations", "Walks the visible syntax tree", LP, 41, 140),
                ],
            ),
            node(
                "ed-style", "flow", "Markdown styling", "Configurable in code, not in the app",
                state="partial",
                detail="Heading sizes, weights and code styling come from one config object turned into a CodeMirror theme. The editor can swap it live, but nothing in the app ever changes it.",
                evidence="src/lib/markdownStyle.ts, src/App.tsx:54",
                anatomy=[
                    facts(
                        ("Headings", "bold · 2.0 / 1.7 / 1.4 / 1.2 / 1.1 / 1.0 em", "derived"),
                        ("Inline code", "monospace · faint background · 3px radius", "derived"),
                        ("Changed by", "nothing — setMarkdownStyle is never called", "partial"),
                    ),
                    src(APP, 54, 55),
                ],
                children=[unit("ms-theme", "buildMarkdownTheme", "Config → CodeMirror theme", MS, 25, 48)],
            ),
            node(
                "ed-rename", "flow", "Renaming a note", "Click the name · extension kept",
                detail="The note's name above the editor is a button. Click it, type, and press Enter or click away; the extension is kept and the file is renamed on disk.",
                evidence="src/components/editor.tsx:135",
                anatomy=[flow(
                    ("Click the name", "It turns into a text field with the name, minus its extension.", "derived"),
                    ("Enter or click away", "Either submits; Escape cancels.", "derived"),
                    ("Extension put back", "An unchanged or empty name does nothing.", "derived"),
                    ("Renamed on disk", "Then the whole vault is re-read and lastFile is updated to the new path.", "derived"),
                )],
                children=[
                    unit("ed-rename-fn", "handleRename", "Editor: trim, keep extension", ED, 135, 142),
                    unit("app-rename", "handleRename", "App: rename, re-read, remember", APP, 163, 176),
                    unit("fh-rename", "rename", "Same folder, new name", FH, 54, 62),
                ],
            ),
        ],
    ),
    node(
        "vault-store", "store", "vaults.json", "Beside the executable · 3 keys",
        state="partial",
        detail="Tauri's store plugin, loaded once and shared. The file sits next to the app's executable, which is found by a one-line Rust command because the JavaScript path API didn't work (the comment in lib.rs says so).",
        evidence="src/utils/store.ts, src-tauri/src/lib.rs",
        anatomy=[facts(
            ("vaults", "Vault[] — {path, name}", "derived"),
            ("lastVault", "Vault — written as an object, read once as a string", "partial"),
            ("lastFile", "File — {path, name}", "derived"),
            ("Saving", "autoSave on every set", "derived"),
            ("Writable once installed?", "not guaranteed — install folders are often read-only", "inferred"),
        )],
        children=[
            unit("store-load", "loadStore", "Loaded once, shared", STORE, 9, 17),
            unit("rs-exe-dir", "get_exe_dir", "Rust: the executable's folder", "src-tauri/src/lib.rs", 3, 7,
                 detail="A #[tauri::command] — the only Rust code the app adds. The comment above it: 'executableDir doesnt work so this is a workaround'."),
        ],
    ),
    node(
        "disk", "store", "Your notes on disk", "Plain files, read and written in place",
        detail="Notes are ordinary .md files in the vault folder, read and written whole. The app's file permissions allow reading, writing, renaming, creating and deleting anywhere on disk.",
        evidence="src-tauri/capabilities/default.json",
        anatomy=[
            facts(
                ("Format", ".md text, whole file per save", "derived"),
                ("Permission scope", "any path (**)", "derived"),
            ),
            src("src-tauri/capabilities/default.json", 21, 32,
                why="Every file permission is scoped to `**`, not to the vaults you've added. The webview can touch any file the user can."),
        ],
    ),
]

E0 = [
    edge("sidebar", "vault-switcher", "holds"),
    edge("vault-switcher", "file-tree", "fills"),
    edge("file-tree", "context-menu", "right-click"),
    edge("sidebar", "context-menu", "right-click"),
    edge("file-tree", "editor", "opens in"),
    edge("vault-switcher", "vault-store", "remembered in"),
    edge("file-tree", "vault-store", "remembers last note"),
    edge("file-tree", "disk", "reads"),
    edge("context-menu", "disk", "creates · deletes"),
    edge("editor", "disk", "autosaves to"),
]

LINKS = [
    ("vs-add", 2, "vault-store", "vaults", "writes", "derived", False),
    ("vs-add", 4, "vault-store", "lastVault", "skips", "partial", True),
    ("vs-open", 3, "vault-store", "lastVault", "writes", "derived", False),
    ("vs-remove", 3, "vault-store", "lastVault", "never clears", "partial", True),
    ("ft-open", 4, "vault-store", "lastFile", "writes", "derived", False),
    ("ed-save", 4, "disk", "Format", "overwrites", "derived", False),
]

# ── emit ────────────────────────────────────────────────────────

def tpl(s):
    return "`" + s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${") + "`"

def emit(v, ind=0):
    pad = "  " * ind
    if isinstance(v, Code):
        return tpl(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        if not v:
            return "[]"
        return "[\n" + "".join(f"{pad}  {emit(x, ind + 1)},\n" for x in v) + f"{pad}]"
    if isinstance(v, dict):
        return "{\n" + "".join(f"{pad}  {k}: {emit(x, ind + 1)},\n" for k, x in v.items()) + f"{pad}}}"
    raise TypeError(v)

def place(nodes):
    for i, n in enumerate(nodes):
        n.setdefault("col", 0)
        n.setdefault("row", i)
        place(n.get("children", []))
    # keep col/row ahead of the bulky fields
    for n in nodes:
        for k in ("detail", "evidence", "unit", "anatomy", "edges", "children"):
            if k in n:
                n[k] = n.pop(k)

# ── calls: which units each unit calls ─────────────────────────
# Matched by name: `name(` in a unit's verbatim body, against the names of the
# other units in this map. A unit's own name is skipped, and a name two units
# share (the two handleRenames) is skipped as ambiguous. Exact for a repo this
# size; a parser replaces it.

def units_in(ns):
    for n in ns:
        if "unit" in n:
            yield n
        yield from units_in(n.get("children", []))

UNITS = list(units_in(AUTHORED))
# A class's methods are reached through the class ("methods ›"), never as
# calls — and their names (constructor, update) match their own definitions.
METHODS = {c["id"] for u in UNITS if u["kind"] == "class" for c in u.get("children", [])}
BY_NAME = {}
for u in UNITS:
    if u["id"] not in METHODS:
        BY_NAME.setdefault(u["title"], []).append(u["id"])
for u in UNITS:
    body = u["unit"]["body"]
    found = []
    for name, ids in BY_NAME.items():
        if len(ids) != 1 or ids[0] == u["id"] or name == u["title"]:
            continue
        m = re.search(r"(?<![\w.])" + re.escape(name) + r"\s*\(", body)
        if m:
            found.append((m.start(), ids[0]))
    if found:
        u["unit"]["calls"] = [i for _, i in sorted(found)]
        if os.environ.get("SHOW_CALLS"):
            print(f"  {u['id']} -> {', '.join(u['unit']['calls'])}")

place(AUTHORED)
ids = []
def walk(ns):
    for n in ns:
        ids.append(n["id"]); walk(n.get("children", []))
walk(AUTHORED)
assert len(ids) == len(set(ids)), "duplicate ids"

links = ",\n".join(
    f'  {{ from: rowId("{a}", {json.dumps(k)}), to: rowId("{b}", {json.dumps(r)}), state: "{s}", '
    + ("alarm: true, " if al else "") + f'label: "{lab}" }}'
    for a, k, b, r, lab, s, al in LINKS
)

out = f'''/**
 * snecko — a real repository, read at ~/projects/snecko, commit {COMMIT}.
 *
 * GENERATED by scripts/gen_snecko.py, which holds the narrative and pulls
 * every quote, line number and signature verbatim from the source, so the
 * code here cannot drift from the file it names. Edit the generator, not
 * this file.
 *
 * A Tauri desktop app for markdown notes: vaults (folders) in a sidebar, a
 * file tree, and a CodeMirror editor with live preview that saves as you
 * type. Cut the same way as every map here: the surface you see, the data
 * flow behind each part of it, and the functions and classes that do it.
 */

import type {{ Edge, Link, Node }} from "@/lib/data";
import {{ rowId }} from "@/lib/data";
import {{ makeMap }} from "@/lib/tree";

export const RUN = {{
  command: "understand-slop map .",
  repo: "snecko",
  commit: "{COMMIT}",
  files: {FILES},
  elapsed: "—",
}};

const AUTHORED: Node[] = {emit(AUTHORED)};

/** Edges between the surface cards, read top to bottom in the first column. */
export const E0: Edge[] = {emit(E0)};

/* ── row-level links ─────────────────────────────────────────── */

export const LINKS: Link[] = [
{links},
];

export const {{ L0, nodeAt, levelAt, pathTo, edgesOf, allNodes }} = makeMap(AUTHORED, E0);
'''
open(OUT, "w").write(out)
print("nodes:", len(ids), "units:", sum(1 for _ in re.finditer(r"\bunit: \{", out)))
