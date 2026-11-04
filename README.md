# Mira

A visual map of a codebase. Start with the product's features, then go deeper, down to the line of code.

## Why

Code gets written faster than anyone can read it. Asking an assistant "how does this work?" answers one question but loses the big picture. Mira lets you explore instead.

## Getting started

```bash
cd app
npm install
npm run dev
```

Open http://localhost:3000.

### Use Mira while working on it (macOS)

```bash
cd app
npm run app:install   # build the checkout as it is now into /Applications/Mira.app
```

Open Mira like any app. It starts its own server and stops it when you quit. Work on Mira with `npm run app:dev`, which opens a second window that can rebuild and restart without touching the installed one. When you want the new version, run `npm run app:install` again, then quit and reopen Mira.

## Layout

- `app/` - the app (Next.js)
- `landing/` - the landing page (`npm run dev`, port 3001)
