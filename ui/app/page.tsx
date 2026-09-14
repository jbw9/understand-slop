"use client";

import { useState } from "react";
import { Canvas } from "@/components/canvas";
import { DetailPane } from "@/components/detail";
import { Chip, Panel, PanelHead, Row } from "@/components/panel";
import { Eyebrow, Ident, StateChip } from "@/components/state";
import { WireLegend } from "@/components/wires";
import { DETAIL, RADIUS, RUN, UNRESOLVED, VERDICT } from "@/lib/data";

export default function Home() {
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const detail = selected ? (DETAIL[selected] ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>{RUN.command}</Eyebrow>
          <h1 className="mt-2 max-w-[46ch] text-[22px] font-semibold leading-snug tracking-[-0.02em] text-ink md:text-[26px]">
            {VERDICT.lead}
            <span className="text-clay-ink"> — {VERDICT.hot}</span>
            <StateChip state={VERDICT.state} className="ml-2 align-middle" />
          </h1>
          <p className="mt-2 text-[13px] text-muted-slate">
            <Ident>{RUN.prompt}</Ident> · {RUN.files} files · +{RUN.added} −
            {RUN.removed} · {RUN.commit} · {RUN.elapsed}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip emphasis="strong">{RADIUS.direct} direct</Chip>
          <Chip>{RADIUS.transitive} transitive</Chip>
          <Chip emphasis="muted">{RADIUS.unresolved} unresolved</Chip>
        </div>
      </header>

      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Canvas
            open={open}
            selected={selected}
            onOpen={setOpen}
            onSelect={setSelected}
          />
          <WireLegend />
        </div>

        <div className="flex w-full shrink-0 flex-col gap-5 lg:w-[380px]">
          <div className="min-h-[300px] flex-1">
            <DetailPane detail={detail} onClose={() => setSelected(null)} />
          </div>

          <Panel flush>
            <PanelHead
              title="What could not be proven"
              note="Five places the analysis stopped. Each one is a question for whoever ran the agent."
            />
            {UNRESOLVED.map((u) => (
              <Row
                key={u.at}
                tone="plain"
                active={selected === u.node}
                onClick={() => {
                  setSelected(u.node);
                  setOpen(null);
                }}
                className="flex-col items-start gap-1"
              >
                <div className="flex w-full items-center gap-2">
                  <Eyebrow>{u.kind}</Eyebrow>
                  <span className="ml-auto truncate font-mono text-[10.5px] text-faint">
                    {u.at}
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-on-surface-variant">
                  {u.text}
                </p>
              </Row>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
