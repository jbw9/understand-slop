import { LandingInstall } from "./landing-install";
import s from "./landing.module.css";

const STEPS = [
  {
    title: "Install the app.",
    body: "One line in a terminal, on macOS or Linux. It builds Mira from source, and works through the Claude Code you already use, signed in with your Claude plan.",
  },
  {
    title: "Import a folder.",
    body: "Any git repository on your computer. Your Claude Code makes its map right away: about 20 minutes for a mid-sized repo, counted against your plan's usage.",
  },
  {
    title: "Open it.",
    body: "Start at the steps and go down to the code. The map stays on your computer, in the app's own folder.",
  },
];

const QUESTIONS = [
  {
    q: "Is this an IDE?",
    a: "No. Keep the editor you use. An editor shows one file at a time and an agent panel one message at a time; Mira shows how the whole repository fits together and what a change did to it. It opens the code where you need it, and hands your questions to the agent beside it.",
  },
  {
    q: "Does my code leave my computer?",
    a: "Only the way it does whenever you use Claude Code: your own Claude Code reads the files it needs to make the map. The map itself is saved on your computer and nowhere else.",
  },
  {
    q: "What do I need?",
    a: "A Mac or a Linux desktop, and Claude Code signed in with a Claude plan. Making a map counts against that plan's usage, like any other Claude Code session.",
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
        <p className={`${s.eyebrow} ${s.reveal}`}>Your repo</p>
        <h2 id="start-title" className={s.reveal}>Map your own repo.</h2>
        <ol className={s.steps}>
          {STEPS.map((st, i) => (
            <li key={st.title} className={s.reveal} style={{ "--i": i } as React.CSSProperties}>
              <i aria-hidden>{i + 1}</i>
              <b>{st.title}</b>
              <p>{st.body}</p>
            </li>
          ))}
        </ol>
        <div className={`${s.startInstall} ${s.reveal}`}>
          <LandingInstall />
        </div>
        <p className={`${s.cap} ${s.reveal}`}>
          It needs git, Node 20 or newer, Rust and CMake, and tells you if one is missing. The script is{" "}
          <a href={`${github}/blob/main/install.sh`}>install.sh</a>, in <a href={github}>the source on GitHub</a>.
        </p>
      </section>
      <section id="questions" className={s.section} aria-labelledby="questions-title">
        <h2 id="questions-title" className={s.reveal}>Questions.</h2>
        <div className={`${s.faq} ${s.reveal}`}>
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
