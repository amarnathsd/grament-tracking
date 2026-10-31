"use client";
// Bottom sheets: the breakpoints that branch off the main flow and come back to it.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { DAY, REASONS, REWORK_LIMIT, can, downstream, fmtDur, fmtTime, normalizeNo, perm } from "@/lib/rules";
import { FakeQR } from "@/components/ui";
import { useNav } from "./App";
import { useOrderData } from "./hooks";
import { Button, Choice, Chip, Field, Notice, StatusChip, Stepper, TextInput, Toggle } from "./kit";

function Head({ title, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

// run a command, toast the result, close the sheet when it worked
function useRun() {
  const nav = useNav();
  const [r, setR] = useState(null);
  const run = (res, keepOpen) => {
    setR(res);
    if (res.ok || res.requested) {
      nav.notify(res);
      if (!keepOpen) nav.closeSheet();
    }
  };
  return [r, run];
}

const LABEL = { complete: "Done", received: "Received back", sent_out: "Sent out", rework: "Rework", scrap: "Scrapped", ship: "Shipped", reversal: "Undone", missing: "Missing", found: "Found" };

function GarmentSheet({ no }) {
  const { state, ctx, api, user } = useStore();
  const nav = useNav();
  const g = ctx.garment(no);
  if (!g) return <Head title="Unknown garment" sub={no} />;
  const gs = ctx.gs(no);
  const order = state.orders[g.order];
  const evs = [...ctx.events(no)].sort((a, b) => b.ts - a.ts);
  const reversed = new Set(evs.filter((e) => e.ok && e.t === "reversal").map((e) => e.ref));
  const doneTs = [...gs.done.values()].map((e) => e.ts);
  const sam = order.route.filter((s) => gs.done.has(s.p)).reduce((a, s) => a + s.sam, 0);
  const active = gs.status !== "Shipped" && gs.status !== "Scrapped";
  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg font-bold">{no}</h2>
          <p className="text-xs text-muted">{order.name} · {order.style} · size {g.size} · batch {g.batch}</p>
        </div>
        <StatusChip s={gs.status} />
      </div>

      <div className="flex gap-1">
        {gs.steps.map((s) => (
          <div key={s.p} className="flex-1 text-center">
            <div className={`h-2 rounded-full ${s.st === "Done" ? "bg-ok" : gs.rework?.back === s.p ? "bg-warn" : s.st === "Pending" ? "bg-brand" : "bg-line"}`} />
            <div className="mt-1 truncate text-[9px] text-muted">{s.p}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Work time (SAM) {sam.toFixed(1)} min · in factory {doneTs.length > 1 ? fmtDur(Math.max(...doneTs) - Math.min(...doneTs)) : "-"}
        {gs.reworkCount ? ` · reworked ${gs.reworkCount}×` : ""}{gs.reworkCount >= REWORK_LIMIT ? " ⚠" : ""}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button kind="soft" size="sm" disabled={!active} onClick={() => nav.sheet("rework", { no })}>Send to rework</Button>
        <Button kind="ghost" size="sm" disabled={!active} onClick={() => nav.sheet("reverse", { no })}>Undo a scan</Button>
        <Button kind="ghost" size="sm" onClick={() => { const r = api.reprint({ no, reason: "Label damaged" }); nav.notify(r); }}>Reprint label</Button>
        {gs.status === "Missing" ? <Button kind="ok" size="sm" disabled={!can(user, "reconcile")} onClick={() => { nav.notify(api.found(no)); nav.closeSheet(); }}>Found it</Button>
          : <Button kind="danger" size="sm" disabled={!active || !can(user, "scrap")} onClick={() => nav.sheet("scrap", { no })}>Scrap</Button>}
      </div>

      <h3 className="mb-2 mt-5 text-sm font-bold">History</h3>
      <ol className="space-y-2 border-l-2 border-line pl-4">
        {evs.slice(0, 12).map((e) => (
          <li key={e.id} className={`relative text-xs ${!e.ok || reversed.has(e.id) ? "text-muted line-through decoration-muted/50" : ""}`}>
            <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${!e.ok ? "bg-err" : e.t === "rework" ? "bg-warn" : e.t === "sent_out" || e.t === "received" ? "bg-vendor" : "bg-ok"}`} />
            <b>{e.p}</b> · {e.ok ? (e.t === "rework" ? `Rework: ${e.reason} → ${e.back}` : e.t === "reversal" ? `Undo: ${e.reason}` : LABEL[e.t]) : `Rejected: ${e.why}`}
            <div className="text-[10px] text-muted">{fmtTime(e.ts)} · {ctx.user(e.u)?.name}{e.override ? " · override" : ""}{e.m === "typed" ? " · typed" : ""}</div>
          </li>
        ))}
      </ol>
    </>
  );
}

function ReworkSheet({ no, foundAt }) {
  const { state, ctx, api, user } = useStore();
  const g = ctx.garment(no);
  const gs = ctx.gs(no);
  const order = state.orders[g.order];
  const done = order.route.map((s) => s.p).filter((p) => gs.done.has(p));
  const [back, setBack] = useState(done.includes("Sewing") ? "Sewing" : done.at(-1));
  const [reason, setReason] = useState(REASONS[0]);
  const [found, setFound] = useState(foundAt || done.at(-1));
  const [note, setNote] = useState("");
  const [r, run] = useRun();
  const reopen = back ? [back, ...downstream(order.route, back)].filter((p) => gs.done.has(p)) : [];
  const request = perm(user, "rework") === "request";
  return (
    <>
      <Head title="Send to rework" sub={`${no} · ${order.name}`} />
      <div className="space-y-4">
        <Field label="Found at"><Choice options={order.route.map((s) => s.p)} value={found} onChange={setFound} /></Field>
        <Field label="What is wrong"><Choice options={REASONS} value={reason} onChange={setReason} /></Field>
        <Field label="Send back to"><Choice options={done} value={back} onChange={setBack} tone="warn" /></Field>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. open seam on left sleeve" />
        {reopen.length > 0 && (
          <p className="rounded-2xl bg-warn-soft px-4 py-2 text-xs text-warn">
            {reopen.join(" → ")} will open again for this garment.{gs.done.has("Packing") ? " It leaves the packed lot." : ""}{gs.reworkCount + 1 >= REWORK_LIMIT ? ` This is rework #${gs.reworkCount + 1}: it will be flagged.` : ""}
          </p>
        )}
        <Button kind="warn" className="w-full" size="lg" disabled={!back} onClick={() => run(api.rework({ no, foundAt: found, back, reason, note }))}>
          {request ? "Ask supervisor to approve" : "Send to rework"}
        </Button>
        <Notice r={r} />
      </div>
    </>
  );
}

function ScrapSheet({ no }) {
  const { api } = useStore();
  const [reason, setReason] = useState("");
  const [r, run] = useRun();
  return (
    <>
      <Head title="Scrap garment?" sub={`${no} · cannot be undone by operators. The order's expected quantity drops by 1.`} />
      <Choice options={["Fabric hole", "Shade mismatch", "Cannot repair stitching", "Print burnt"]} value={reason} onChange={setReason} />
      <Button kind="danger" size="lg" className="mt-4 w-full" disabled={!reason} onClick={() => run(api.scrap({ no, reason }))}>Scrap</Button>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function ReverseSheet({ no }) {
  const { ctx, api, user } = useStore();
  const evs = ctx.events(no);
  const reversed = new Set(evs.filter((e) => e.ok && e.t === "reversal").map((e) => e.ref));
  const list = evs.filter((e) => e.ok && ["complete", "received", "sent_out"].includes(e.t) && !reversed.has(e.id)).reverse();
  const [id, setId] = useState(list[0]?.id);
  const [reason, setReason] = useState("");
  const [r, run] = useRun();
  return (
    <>
      <Head title="Undo a scan" sub="Nothing is deleted: an undo entry is added with your reason." />
      <div className="space-y-2">
        {list.map((e) => (
          <button key={e.id} onClick={() => setId(e.id)} className={`flex w-full justify-between rounded-2xl border px-4 py-3 text-left text-sm ${id === e.id ? "border-brand bg-brand-soft" : "border-line"}`}>
            <span><b>{e.p}</b> · {LABEL[e.t]}</span><span className="text-xs text-muted">{fmtTime(e.ts)} · {ctx.user(e.u)?.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-4"><Choice options={["Wrong garment scanned", "Wrong process", "Scanned before work was done"]} value={reason} onChange={setReason} /></div>
      <Button className="mt-4 w-full" size="lg" disabled={!reason || !id} onClick={() => run(api.reverse({ eventId: id, reason }))}>
        {can(user, "reverse") ? "Undo scan" : "Ask supervisor to undo"}
      </Button>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function BatchSheet({ orderId }) {
  const { state, ctx, api } = useStore();
  const order = state.orders[orderId];
  const [count, setCount] = useState(250);
  const [qty, setQty] = useState(order.qty);
  const [why, setWhy] = useState("");
  const [r, run] = useRun();
  const cut = ctx.garmentsOf(orderId).length;
  const ym = new Date(ctx.now).toISOString().slice(2, 7).replace("-", "");
  return (
    <>
      <Head title="Cut & label" sub={`${order.name}: ${cut} of ${order.qty} cut so far`} />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <span className="text-sm font-semibold">Garments in this batch</span>
        <Stepper value={count} onChange={setCount} min={10} max={1000} step={10} />
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-line p-3">
        <FakeQR text={`${ym}-new`} size={56} />
        <div className="text-xs">
          <div className="font-mono font-bold">{ym}-Bnnn-0001 … {String(count).padStart(4, "0")}</div>
          <div className="text-muted">Year-month · batch · garment. Made by the system, never typed, never reused.</div>
        </div>
      </div>
      <Button size="lg" className="mt-4 w-full" onClick={() => run(api.createBatch({ orderId, count }))}>Generate numbers & print labels</Button>

      <details className="mt-5 rounded-2xl bg-bg px-4 py-3">
        <summary className="text-sm font-semibold">Cut quantity differs from the order?</summary>
        <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted">New order quantity</span><Stepper value={qty} onChange={setQty} step={10} /></div>
        <div className="mt-3"><Choice options={["Fabric shortage", "Extra cut for rejects", "Buyer changed quantity"]} value={why} onChange={setWhy} /></div>
        <Button kind="soft" className="mt-3 w-full" disabled={!why || qty === order.qty} onClick={() => run(api.adjustQty({ orderId, qty, reason: why }))}>Post adjustment</Button>
      </details>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function ShipSheet({ orderId }) {
  const { api } = useStore();
  const { list, by, order } = useOrderData(orderId);
  const ready = list.filter((x) => x.gs.status === "Ready to ship");
  const [count, setCount] = useState(Math.min(50, ready.length));
  const [typed, setTyped] = useState("");
  const [r, run] = useRun();
  return (
    <>
      <Head title="Ship" sub={`${order.name}: ${ready.length} ready · ${by("Shipped")} shipped · ${order.qty - by("Shipped") - by("Scrapped")} still to go`} />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <span className="text-sm font-semibold">Garments in this shipment</span>
        <Stepper value={count} onChange={setCount} min={1} max={ready.length} step={10} />
      </div>
      <p className="mt-2 text-xs text-muted">Partial shipments are fine. The order completes when every garment is shipped or scrapped.</p>
      <Button kind="ok" size="lg" className="mt-4 w-full" disabled={!ready.length} onClick={() => run(api.ship({ orderId, nos: ready.slice(0, count).map((x) => x.g.no) }))}>Create shipment</Button>
      <div className="mt-5 flex gap-2">
        <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or scan one garment number" className="font-mono" />
        <Button kind="ghost" disabled={!typed} onClick={() => run(api.ship({ orderId, nos: [normalizeNo(typed)] }), true)}>Add</Button>
      </div>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function HoldSheet({ orderId }) {
  const { state, ctx, api } = useStore();
  const order = state.orders[orderId];
  const status = ctx.orderStatus(orderId);
  const [why, setWhy] = useState("");
  const [r, run] = useRun();
  return (
    <>
      <Head title="Order status" sub={`${order.name} is ${status}`} />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <div><div className="text-sm font-semibold">Rush order</div><div className="text-xs text-muted">Shown first everywhere</div></div>
        <Toggle on={order.priority === "Rush"} onChange={(v) => run(api.setOrder(orderId, { priority: v ? "Rush" : "Normal" }, "Priority"), true)} />
      </div>
      <div className="mt-4"><Choice options={["Buyer asked to pause", "Fabric not received", "Buyer cancelled"]} value={why} onChange={setWhy} /></div>
      <div className="mt-4 grid gap-2">
        {status === "On hold" ? <Button size="lg" onClick={() => run(api.setOrder(orderId, { status: "Active" }, why || "Released"))}>Release: scanning allowed again</Button>
          : <Button kind="warn" size="lg" disabled={!why || status !== "Active"} onClick={() => run(api.setOrder(orderId, { status: "On hold" }, why))}>Put on hold (blocks scans)</Button>}
        <Button kind="danger" disabled={!why || status === "Cancelled"} onClick={() => run(api.setOrder(orderId, { status: "Cancelled" }, why))}>Cancel order (history kept)</Button>
      </div>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function SendOutSheet({ orderId, p }) {
  const { api } = useStore();
  const { list, order } = useOrderData(orderId);
  const step = order.route.find((s) => s.p === p);
  const ready = list.filter((x) => (x.gs.status === "In progress" || x.gs.rework?.back === p) && x.gs.pending.includes(p));
  const [count, setCount] = useState(Math.min(50, ready.length));
  const [r, run] = useRun();
  return (
    <>
      <Head title={`Send out · ${p}`} sub={`To ${step.vendor}. Expected back in ${step.vendorDays || 3} day(s).`} />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <span className="text-sm font-semibold">{ready.length} ready to send</span>
        <Stepper value={count} onChange={setCount} min={1} max={ready.length} step={10} />
      </div>
      <Button size="lg" className="mt-4 w-full" disabled={!ready.length} onClick={() => run(api.sendOut({ nos: ready.slice(0, count).map((x) => x.g.no), p, vendor: step.vendor }))}>Scan out {count}</Button>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function ReceiveSheet({ orderId, p }) {
  const { ctx, api } = useStore();
  const { list } = useOrderData(orderId);
  const at = list.filter((x) => x.gs.atVendor?.p === p).sort((a, b) => a.gs.atVendor.ts - b.gs.atVendor.ts);
  const late = at.filter((x) => ctx.now - x.gs.atVendor.ts > DAY).length;
  const [count, setCount] = useState(Math.min(50, at.length));
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");
  const [r, run] = useRun();
  return (
    <>
      <Head title={`Receive back · ${p}`} sub={`${at.length} at vendor${late ? ` · ${late} late` : ""}. Receiving completes the step.`} />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <span className="text-sm font-semibold">Oldest first</span>
        <Stepper value={count} onChange={setCount} min={1} max={at.length} step={10} />
      </div>
      <Button size="lg" className="mt-4 w-full" disabled={!at.length} onClick={() => run(api.receive({ nos: at.slice(0, count).map((x) => x.g.no), p }))}>Scan in {count}</Button>
      <details className="mt-5 rounded-2xl bg-bg px-4 py-3">
        <summary className="text-sm font-semibold">Garment came back but was never sent out?</summary>
        <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Garment number" className="mt-3 font-mono" />
        <div className="mt-3"><Choice options={["Sent without scan", "Vendor returned extra"]} value={why} onChange={setWhy} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button kind="ghost" disabled={!typed} onClick={() => run(api.receive({ nos: [normalizeNo(typed)], p }), true)}>Try receive</Button>
          <Button kind="warn" disabled={!typed || !why} onClick={() => run(api.receive({ nos: [normalizeNo(typed)], p, overrideReason: why }), true)}>Override</Button>
        </div>
      </details>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function CountSheet({ orderId, p }) {
  const { api } = useStore();
  const { list } = useOrderData(orderId);
  const expected = list.filter((x) => (x.gs.status === "In progress" || x.gs.status === "Not started" || x.gs.rework?.back === p) && x.gs.pending.includes(p));
  const [physical, setPhysical] = useState(expected.length);
  const [marks, setMarks] = useState({});
  const [r, run] = useRun();
  const diff = physical - expected.length;
  const late = Object.keys(marks).filter((k) => marks[k] === "late");
  const missing = Object.keys(marks).filter((k) => marks[k] === "missing");
  return (
    <>
      <Head title={`End-of-shift count · ${p}`} sub={`System expects ${expected.length} garments waiting at ${p}.`} />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <span className="text-sm font-semibold">Counted on the floor</span>
        <Stepper value={physical} onChange={setPhysical} step={1} />
      </div>
      <p className={`mt-2 rounded-2xl px-4 py-2 text-xs ${diff === 0 ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
        {diff === 0 ? "Counts match." : diff < 0 ? `${-diff} not on the floor: done but not scanned (late scan), or missing. Mark them below.` : `${diff} extra on the floor: check for another order or process.`}
      </p>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
        {expected.slice(0, 25).map(({ g }) => (
          <div key={g.no} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <span className="font-mono text-xs">{g.no}</span>
            <div className="flex gap-1">
              {[["", "Here"], ["late", "Done"], ["missing", "Missing"]].map(([v, l]) => (
                <button key={v} onClick={() => setMarks({ ...marks, [g.no]: v })} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${(marks[g.no] || "") === v ? "bg-ink text-white" : "bg-bg text-muted"}`}>{l}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button size="lg" className="mt-4 w-full" onClick={() => run(api.reconcile({ orderId, p, expected: expected.length, physical, late, missing }))}>
        Save count{late.length ? ` · ${late.length} late scans` : ""}{missing.length ? ` · ${missing.length} missing` : ""}
      </Button>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function BulkSheet({ p }) {
  const { state, api } = useStore();
  const [batch, setBatch] = useState(state.batches.at(-1).b);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(50);
  const [confirm, setConfirm] = useState("");
  const [r, run] = useRun();
  return (
    <>
      <Head title={`Bulk entry · ${p}`} sub="Supervisor only, max 300, and the physical count must match. Every garment is still checked." />
      <Field label="Batch"><Choice options={state.batches.map((b) => b.b)} value={batch} onChange={setBatch} /></Field>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="From"><TextInput type="number" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="number" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Counted"><TextInput type="number" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
      <Button size="lg" className="mt-4 w-full" onClick={() => run(api.bulk({ batch, from, to, p, confirm }), true)}>Save bulk</Button>
      <Notice r={r} className="mt-3" />
    </>
  );
}

function NetworkSheet() {
  const { state, api } = useStore();
  const nav = useNav();
  const [res, setRes] = useState(null);
  const online = state.settings.online;
  return (
    <>
      <Head title="Phone & network" sub="Weak Wi-Fi is normal on a factory floor. Scans are kept on the phone and checked again on sync." />
      <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
        <div><div className="text-sm font-semibold">{online ? "Online" : "Offline"}</div><div className="text-xs text-muted">{state.queue.length} scans waiting on this phone</div></div>
        <Toggle on={online} onChange={(v) => api.settings({ online: v })} />
      </div>
      <Button className="mt-3 w-full" disabled={!state.queue.length} onClick={() => setRes(api.sync())}>Sync now</Button>
      <Button kind="ghost" className="mt-2 w-full" disabled={!state.queue.length} onClick={() => { const q = state.queue.at(-1); nav.notify(api.otherPhone(q.no, q.p)); }}>
        Simulate: another phone scans the last one first
      </Button>
      {res?.map(({ q, r }, i) => (
        <p key={i} className={`mt-2 rounded-xl px-3 py-2 text-xs ${r.ok ? "bg-ok-soft text-ok" : "bg-err-soft text-err"}`}>{q.no} · {q.p}: {r.ok ? "saved" : r.msg}</p>
      ))}
      <Field label="Phone clock">
        <div className="mt-1">
          <Choice options={[{ value: 0, label: "Correct" }, { value: -180, label: "3 h behind" }, { value: 120, label: "2 h ahead" }]} value={state.settings.clockOffset} onChange={(v) => api.settings({ clockOffset: v })} />
        </div>
      </Field>
      <p className="mt-2 text-[11px] text-muted">Scan time and server time are both saved. A gap over 30 min is flagged for the supervisor.</p>
      <div className="mt-3"><Chip tone="muted">Device: {state.users.find((u) => u.id === state.settings.userId).device}</Chip></div>
    </>
  );
}

export const SHEETS = {
  garment: GarmentSheet, rework: ReworkSheet, scrap: ScrapSheet, reverse: ReverseSheet, batch: BatchSheet, ship: ShipSheet,
  hold: HoldSheet, sendOut: SendOutSheet, receive: ReceiveSheet, count: CountSheet, bulk: BulkSheet, network: NetworkSheet,
};
