# understand-slop

## Commits

Every commit is a title only, in the form `area: summary`. This applies in every directory and on every branch.

- `area` is the lowercase product part the commit changes: `app`, `canvas`, `terminal`, `tabs`, `projects`, `generate`, `preview`, `workspace`, `landing`.
- `summary` is lowercase and short. It says what the product does after the commit, not what code changed. No trailing period.
- No body and no co-author line.
- Example: `terminal: click a file to open it in an editor tab`.

## Demo GIFs

After you push a commit that changes what a person sees in Mira (`app/`) or on the landing page (`landing/`), run the `demo-gif` skill (`.claude/skills/demo-gif/`). Do not wait to be asked. Skip commits that change only logic. The skill says how to decide.
