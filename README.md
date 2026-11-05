# bluprint

A visual map of a codebase. Start with the product's features, then go deeper, down to the line of code.

## Why

Code gets written faster than anyone can read it. Asking an assistant "how does this work?" answers one question but loses the big picture. bluprint lets you explore instead.

## Getting started

```bash
cd app
npm install
npm run dev
```

Open http://localhost:3000.

### Use bluprint while working on it (macOS)

```bash
cd app
npm run app:install
```

## Layout

- `app/` - the app (Next.js)
- `landing/` - the landing page (`npm run dev`, port 3001)
