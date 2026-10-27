import { cn } from "@/lib/utils";

/** The header every settings-style panel opens with. */
export function PanelHead({
  title,
  note,
  right,
  className,
}: {
  title: string;
  note?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start gap-4 border-b border-border-gray bg-surface px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {note ? (
          <p className="mt-1 text-[13px] leading-snug text-muted-slate">{note}</p>
        ) : null}
      </div>
      {right}
    </header>
  );
}
