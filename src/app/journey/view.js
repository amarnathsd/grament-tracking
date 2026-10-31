"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { fmtDur, fmtTime, normalizeNo, stepOf } from "@/lib/rules";
import { Banner, Btn, Card, Input, Page, Pill } from "@/components/ui";

export default function JourneyPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading…</div>}>
      <Journey />
    </Suspense>
  );
}

const LABEL = { complete: "Done", received: "Received back", sent_out: "Sent out", rework: "Rework", scrap: "Scrapped", ship: "Shipped", reversal: "Reversed", missing: "Missing", found: "Found" };

function Journey() {
  const q = useSearchParams().get("g") || "2610-B014-0237";
  return <JourneyView key={q} q={q} />;
}

function JourneyView({ q }) {
  const { state, ctx } = useStore();
  const [no, setNo] = useState(normalizeNo(q));
  const [input, setInput] = useState(no);
  const g = ctx.garment(no);
  if (!g) {
    return (
      <Page title="Screen 7 · Garment journey">
        <Search input={input} setInput={setInput} go={() => setNo(normalizeNo(input))} />
        <Banner kind="err" className="mt-2">Unknown garment number {no}.</Banner>
      </Page>
    );
  }
  const order = state.orders[g.order];
  const gs = ctx.gs(no);
  const evs = [...ctx.events(no)].sort((a, b) => a.ts - b.ts);
  const reversed = new Set(evs.filter((e) => e.ok && e.t === "reversal").map((e) => e.ref));
  // time since the previous completed step, per event
  const gaps = new Map();
  evs.reduce((prev, e) => {
    if (!e.ok || (e.t !== "complete" && e.t !== "received")) return prev;
    if (prev) gaps.set(e.id, e.ts - prev);
    return e.ts;
  }, null);
  const todo = order.route.map((s) => s.p).filter((p) => !gs.done.has(p));
  const totalLead = gs.done.size > 1 ? Math.max(...[...gs.done.values()].map((e) => e.ts)) - Math.min(...[...gs.done.values()].map((e) => e.ts)) : 0;
  const totalSam = order.route.filter((s) => gs.done.has(s.p)).reduce((a, s) => a + s.sam, 0);

  return (
    <Page title="Screen 7 · Garment journey" sub="Every event for one garment in time order, including rejected and reversed ones. Reads only.">
      <Search input={input} setInput={setInput} go={() => setNo(normalizeNo(input))} />
      <div className="mt-3 rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
        Garment journey | {no} | {order.name} | {order.style}, size {g.size} | batch {g.batch}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card n={1} title="Timeline" className="lg:col-span-2 rounded-t-none">
          <ol className="relative ml-3 border-l-2 border-slate-300">
            {evs.map((e) => {
              const gap = gaps.get(e.id) ?? null;
              const sam = stepOf(order.route, e.p)?.sam;
              const dot = !e.ok || reversed.has(e.id) ? "bg-slate-300" : e.t === "rework" ? "bg-amber-400" : e.t === "scrap" || e.t === "missing" ? "bg-red-500" : e.t === "sent_out" ? "bg-violet-400" : "bg-teal-600";
              return (
                <li key={e.id} className={`mb-2 ml-4 text-sm ${!e.ok || reversed.has(e.id) ? "text-slate-400" : ""}`}>
                  <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ${dot}`} />
                  <div className="grid grid-cols-[110px_130px_110px_1fr] gap-2">
                    <b>{fmtTime(e.ts)}</b>
                    <span className="font-semibold text-slate-700">{e.p}</span>
                    <span>{ctx.user(e.u)?.name}</span>
                    <span>
                      {!e.ok ? <span className="text-red-600">Rejected: {e.why}</span>
                        : reversed.has(e.id) ? <s>{LABEL[e.t]}</s>
                        : e.t === "rework" ? <span className="text-amber-700">Rework: {e.reason}{e.note ? ` (${e.note})` : ""}, sent to {e.back}</span>
                        : e.t === "reversal" ? `Reversal: ${e.reason}`
                        : `${LABEL[e.t]}${e.vendor ? ` · ${e.vendor}` : ""}${e.override ? " · override" : ""}${e.note ? ` · ${e.note}` : ""}`}
                      {gap != null && <span className="ml-2 text-xs text-slate-400">+{fmtDur(gap)} since last step (SAM {sam} min)</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 inline-block rounded border border-slate-300 px-3 py-1 text-sm">
            {todo.length ? `Still to do: ${todo.join(", ")}` : gs.status}
          </div>
        </Card>
        <div className="space-y-4">
          <Card n={2} title="Route status for this garment">
            <div className="space-y-1">
              {state.processes.map((m) => {
                const s = gs.steps.find((x) => x.p === m.p);
                return (
                  <div key={m.p} className="flex items-center justify-between text-sm">
                    <span>{m.p}</span>
                    <Pill tone={s ? s.st : "Not applicable"}>{s ? (s.st === "Waiting" ? `Waiting: ${s.missingDeps.join(", ")}` : s.st) : "Not applicable"}</Pill>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-sm">Status: <Pill>{gs.status}</Pill> · reworked {gs.reworkCount}×{gs.reworkCount >= 3 ? " (flagged)" : ""}</div>
          </Card>
          <Card title="Time for this garment">
            <div className="text-sm">Required work time (SAM, steps done): <b>{totalSam.toFixed(1)} min</b></div>
            <div className="text-sm">Actual time in factory so far: <b>{fmtDur(totalLead)}</b></div>
            <p className="mt-1 text-xs text-slate-500">The gap is waiting time between steps: the real cause of delay, and where to look first.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Search({ input, setInput, go }) {
  const samples = ["2610-B014-0237", "2610-B014-0412", "2610-B018-0001"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} className="max-w-xs font-mono" />
      <Btn kind="primary" onClick={go}>Open</Btn>
      {samples.map((s) => <Btn key={s} kind="link" onClick={() => { setInput(s); }}>{s}</Btn>)}
    </div>
  );
}
