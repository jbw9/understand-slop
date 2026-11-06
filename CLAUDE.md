# bluprint

## Commits

Write every commit with the `commit` skill (`.claude/skills/commit/`).

## Demo GIFs

After you push a commit that changes what a person sees in Bluprint (`app/`) or on the landing page (`landing/`), run the `demo-gif` skill (`.claude/skills/demo-gif/`). Do not wait to be asked. Skip commits that change only logic. The skill says how to decide.

## Mapping version

Bump `MAPPER_VERSION` in `app/scripts/generate/version.ts` in the same commit as any change under `app/scripts/generate/` that changes what a run does or produces (prompts, models, stages, checks). The admin dashboard (blpr.dev/admin) compares runs by it.
