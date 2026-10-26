import s from "./landing.module.css";

const STEPS = [
  {
    title: "Download the app.",
    body: "For macOS. It works through the Claude Code you already use, signed in with your Claude plan.",
  },
  {
    title: "Import a folder.",
    body: "Any git repository on your Mac. Your Claude Code makes its map right away: about 20 minutes for a mid-sized repo, counted against your plan's usage.",
  },
  {
    title: "Open it.",
    body: "Start at the steps and go down to the code. The map stays on your Mac, in the app's own folder.",
  },
];

const QUESTIONS = [
  {
    q: "Does my code leave my Mac?",
    a: "Only the way it does whenever you use Claude Code: your own Claude Code reads the files it needs to make the map. The map itself is saved on your Mac and nowhere else.",
  },
  {
    q: "What do I need?",
    a: "A Mac, and Claude Code signed in with a Claude plan. Making a map counts against that plan's usage, like any other Claude Code session.",
  },
  {
    q: "Which languages does it read?",
    a: "TypeScript, JavaScript, Python, Go, Ruby, Rust, Java, Kotlin, Scala, Swift, PHP, C# and Elixir, along with Vue, Svelte and Astro components, and the SQL, Prisma, GraphQL and protobuf files around them.",
  },
  {
    q: "How do I tell what's proven from what's a guess?",
    a: "A solid line or a plain card came from the code. Anything the map couldn't prove is marked: a dashed line, or a card labelled partial or inferred. Sentences that failed the check are taken out before you see them.",
  },
  {
    q: "What happens when the code changes?",
    a: "An update finds the files that changed since the map last looked, redoes only the sections whose code they touch, and moves every other line reference along with the code, so the rest stays true.",
  },
];

/** How to get a map of your own repository, then what people ask before they do. */
export function LandingStart({ github }: { github: string }) {
  return (
    <>
      <section id="start" className={s.section} aria-labelledby="start-title">
        <h2 id="start-title">Map your own repo.</h2>
        <ol className={s.steps}>
          {STEPS.map((st, i) => (
            <li key={st.title}>
              <i aria-hidden>{i + 1}</i>
              <b>{st.title}</b>
              <p>{st.body}</p>
            </li>
          ))}
        </ol>
        <p className={s.cap}>
          Or build it yourself from <a href={github}>the source on GitHub</a>.
        </p>
      </section>
      <section id="questions" className={s.section} aria-labelledby="questions-title">
        <h2 id="questions-title">Questions.</h2>
        <div className={s.faq}>
          {QUESTIONS.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
