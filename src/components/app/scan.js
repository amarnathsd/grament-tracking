"use client";
// Operator scan screen: pick process once, scan, green or red. Breakpoints: override, rework, call supervisor.
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can, fmtTime, nextStepText, stepOf } from "@/lib/rules";
import { Top, useNav } from "./App";
import { Button, Card, Choice, Chip, Icon, Svg, TextInput } from "./kit";

export function ScanScreen({ p: initialP, fromStep }) {
  const { state, ctx, api, user } = useStore();
  const nav = useNav();
  const procs = state.processes.filter((m) => m.active).map((m) => m.p);
  const mine = user.role === "operator" ? user.procs : procs;
  const [p, setP] = useState(initialP || mine[0] || "Sewing");
  const [typed, setTyped] = useState("");
  const [res, setRes] = useState(null);
  const [why, setWhy] = useState("");
  const online = state.settings.online;
  const assigned = mine.includes(p);

  const scan = (no, override = false, method = "qr") => {
    if (!no) return;
    const r = api.scan({ no, p, method, override, overrideReason: why });
    setRes({ ...r, no, at: Date.now() });
    setWhy("");
    setTyped("");
  };

  const startOfDay = new Date(ctx.now).setHours(0, 0, 0, 0);
  const today = state.events.filter((e) => e.ok && e.p === p && e.t === "complete" && e.ts >= startOfDay).length;
  const ready = useMemo(() => state.garments.filter((g) => {
    if (ctx.orderStatus(g.order) !== "Active" || stepOf(state.orders[g.order].route, p)?.vendor) return false;
    const gs = ctx.gs(g.no);
    return (gs.status === "In progress" || gs.status === "Not started" || gs.rework?.back === p) && gs.pending.includes(p);
  }), [ctx, state, p]);
  const recent = state.events.filter((e) => e.d === user.device && e.t === "complete").slice(-4).reverse();

  // demo labels: real garments from the data, one per situation
  const find = (fn) => state.garments.find((g) => fn(ctx.gs(g.no), g))?.no;
  const demo = [
    ["✓ Next ready", ready[0]?.no],
    ["Already scanned", "2610-B014-0237"],
    ["Step missing", "2610-B014-0412"],
    ["Unknown label", "2610-B099-0001"],
    ["Not in route", p === "Washing" ? "2610-B018-0350" : null],
    ["In rework", find((gs) => gs.status === "In rework")],
    ["Scrapped", find((gs) => gs.status === "Scrapped")],
    ["At vendor", find((gs) => gs.status === "At vendor")],
  ].filter(([, no]) => no);

  const g = res?.garment;
  const gs = g && (res.gsAfter || ctx.gs(g.no));
  const order = g && state.orders[g.order];

  return (
    <>
      <Top title="Scan" sub={`${user.name} · ${user.device}`} back={!!fromStep}
        right={
          <button onClick={() => nav.sheet("network")}>
            <Chip tone={online ? "ok" : "warn"}><Svg d={Icon.wifi} className="h-3.5 w-3.5" />{online ? "Online" : `Offline · ${state.queue.length}`}</Chip>
          </button>
        } />
      <div className="px-4">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {procs.map((x) => (
            <button key={x} onClick={() => { setP(x); setRes(null); }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${p === x ? "bg-ink text-white" : mine.includes(x) ? "bg-surface text-ink" : "bg-surface text-muted/60"}`}>
              {!mine.includes(x) && "🔒 "}{x}
            </button>
          ))}
        </div>
        {!assigned && <p className="mt-2 rounded-2xl bg-warn-soft px-4 py-2 text-xs font-medium text-warn">You are not assigned to {p}. Scans will be blocked.</p>}

        {/* viewfinder (simulated camera) */}
        <button onClick={() => scan(demo[0]?.[1])} className="relative mt-3 flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-card bg-ink text-white">
          {["left-4 top-4 border-l-4 border-t-4", "right-4 top-4 border-r-4 border-t-4", "bottom-4 left-4 border-b-4 border-l-4", "bottom-4 right-4 border-b-4 border-r-4"].map((c) => (
            <span key={c} className={`absolute h-8 w-8 rounded-sm border-white/80 ${c}`} />
          ))}
          <span className="absolute inset-x-10 top-1/2 h-0.5 bg-brand shadow-[0_0_12px_2px] shadow-brand" />
          <Svg d={Icon.scan} className="h-10 w-10 opacity-80" />
          <span className="mt-2 text-sm font-semibold">Tap to scan the QR label</span>
          <span className="text-[11px] text-white/60">Process: {p}</span>
        </button>

        <div className="mt-3 flex gap-2">
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan(typed, false, "typed")}
            placeholder="Label damaged? Type number" className="font-mono" />
          <Button onClick={() => scan(typed, false, "typed")} disabled={!typed}>Save</Button>
        </div>

        {res && <ResultCard key={res.at} res={res} g={g} gs={gs} order={order} p={p} why={why} setWhy={setWhy} onOverride={() => scan(res.no, true)} />}

        <div className="mt-4 flex gap-2">
          <Card className="!p-3 text-center"><div className="text-2xl font-bold">{today}</div><div className="text-[11px] text-muted">Scanned today · {p}</div></Card>
          <Card className="!p-3 text-center"><div className="text-2xl font-bold text-brand">{ready.length}</div><div className="text-[11px] text-muted">Ready for {p}</div></Card>
        </div>

        <div className="mt-5">
          <p className="mb-2 px-1 text-xs font-semibold text-muted">Demo labels (tap to scan one)</p>
          <div className="flex flex-wrap gap-2">
            {demo.map(([l, no]) => (
              <button key={l} onClick={() => scan(no)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium">{l}</button>
            ))}
          </div>
        </div>

        {(recent.length > 0 || state.queue.length > 0) && (
          <div className="mt-5">
            <p className="mb-2 px-1 text-xs font-semibold text-muted">This phone</p>
            <Card className="!p-0">
              {state.queue.map((q, i) => (
                <Row key={`q${i}`} left={q.no} sub={`${q.p} · ${fmtTime(q.ts)}`} right={<Chip tone="warn">not synced</Chip>} />
              ))}
              {recent.map((e) => (
                <Row key={e.id} left={e.g} sub={`${e.p} · ${fmtTime(e.ts)}`} right={<Chip tone={e.ok ? "ok" : "err"}>{e.ok ? "saved" : "rejected"}</Chip>}
                  onClick={e.ok ? () => nav.sheet("garment", { no: e.g }) : undefined} />
              ))}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Row({ left, sub, right, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-left last:border-0">
      <div><div className="font-mono text-sm">{left}</div><div className="text-[11px] text-muted">{sub}</div></div>
      {right}
    </Tag>
  );
}

function ResultCard({ res, g, gs, order, p, why, setWhy, onOverride }) {
  const nav = useNav();
  const { user } = useStore();
  const ok = res.ok && !res.queued;
  const tone = res.queued ? "bg-warn-soft text-warn" : ok ? "bg-ok-soft text-ok" : "bg-err-soft text-err";
  return (
    <div className={`animate-fade mt-3 rounded-card p-4 ${tone}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${res.queued ? "bg-warn" : ok ? "bg-ok" : "bg-err"}`}>
          {res.queued ? "⏳" : ok ? "✓" : "✕"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold">{res.queued ? "Saved on phone" : ok ? "Recorded" : "Blocked"}</div>
          <div className="text-sm">{res.queued ? res.msg : ok ? nextStepText(order, gs) : res.msg}</div>
          {!ok && !res.queued && <div className="text-xs opacity-80">Nothing was saved.</div>}
        </div>
      </div>
      {g && (
        <button onClick={() => nav.sheet("garment", { no: g.no })} className="mt-3 w-full rounded-2xl bg-surface/70 px-3 py-2 text-left text-ink">
          <div className="font-mono text-sm font-bold">{g.no}</div>
          <div className="text-[11px] text-muted">{order.name} · {order.style} · size {g.size} · done {gs.doneList.join(", ") || "nothing"}</div>
        </button>
      )}

      {/* breakpoints */}
      {!ok && res.overridable && !res.queued && (
        can(user, "override") ? (
          <div className="mt-3 space-y-2">
            <Choice options={["Work was done, scan was missed", "Urgent buyer request"]} value={why} onChange={setWhy} tone="warn" />
            <Button kind="warn" className="w-full" disabled={!why} onClick={onOverride}>Override and save (logged)</Button>
          </div>
        ) : <Button kind="ghost" className="mt-3 w-full" onClick={() => nav.notify({ ok: true, msg: "Supervisor notified" })}>Call supervisor</Button>
      )}
      {res.code === "rework" && <p className="mt-2 text-xs">Take it to {gs.rework.back} first.</p>}
      {ok && g && p !== "Cutting" && (
        <button onClick={() => nav.sheet("rework", { no: g.no, foundAt: p })} className="mt-2 text-xs font-semibold underline">Found a defect? Send to rework</button>
      )}
    </div>
  );
}
