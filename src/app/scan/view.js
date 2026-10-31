"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { BULK_LIMIT, can, fmtTime, nextStepText, stepOf } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, Input, N, Page, Result, Select } from "@/components/ui";

export default function ScanPage() {
  const { state, ctx, api, user } = useStore();
  const procs = state.processes.filter((m) => m.active).map((m) => m.p);
  const [p, setP] = useState(user.procs[0] || "Sewing");
  const [no, setNo] = useState("");
  const [typed, setTyped] = useState(false);
  const [res, setRes] = useState(null);
  const [ovr, setOvr] = useState("");
  const [syncRes, setSyncRes] = useState(null);
  const assigned = user.role !== "operator" || user.procs.includes(p);
  const online = state.settings.online;

  const scan = (num = no, override = false) => {
    const r = api.scan({ no: num, p, method: typed ? "typed" : "qr", override, overrideReason: ovr });
    setRes({ ...r, no: num });
    setOvr("");
  };

  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const today = state.events.filter((e) => e.ok && e.p === p && e.t === "complete" && e.ts >= startOfDay).length;
  const ready = useMemo(() => state.garments.filter((g) => {
    if (ctx.orderStatus(g.order) !== "Active") return false;
    const gs = ctx.gs(g.no);
    return (gs.status === "In progress" || gs.status === "Not started" || gs.rework?.back === p) && gs.pending.includes(p) && !stepOf(state.orders[g.order].route, p)?.vendor;
  }), [ctx, state, p]);
  const recent = state.events.filter((e) => e.d === user.device && e.t === "complete").slice(-5).reverse();

  // sample garments for each case, picked from live data
  const find = (fn) => state.garments.find((g) => fn(ctx.gs(g.no), g))?.no;
  const cases = [
    ["Valid scan (next ready garment)", ready[0]?.no, p],
    ["#11 Duplicate", "2610-B014-0237", "Sewing"],
    ["#7 Earlier step missing", "2610-B014-0412", "Sewing"],
    ["Unknown number", "2610-B099-0001", p],
    ["#6 Not in route (Order B at Washing)", "2610-B018-0350", "Washing"],
    ["Outsourced step (Order A at Washing)", find((gs, g) => g.order === "A-2610-01" && gs.pending.includes("Washing")), "Washing"],
    ["In rework, scanned forward", find((gs) => gs.status === "In rework"), "Finishing"],
    ["Scrapped garment", find((gs) => gs.status === "Scrapped"), "Finishing"],
    ["At vendor", find((gs) => gs.status === "At vendor"), "Finishing"],
    ["Already shipped", find((gs) => gs.status === "Shipped"), "Packing"],
  ];

  const g = res?.garment;
  const gs = res?.gsAfter || (g && ctx.gs(g.no));
  const order = g && state.orders[g.order];
  const remaining = gs ? order.route.map((s) => s.p).filter((x) => !gs.done.has(x) && x !== p) : [];

  return (
    <Page title="Screen 3 · Process tracking (operator phone)" sub="Pick the process once per shift, scan, see green or red. Every scan runs the same checks; only a scan that passes is saved." rules="R5, R6, R8, R13, R14">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* phone */}
        <div className="mx-auto w-full max-w-sm rounded-[2rem] border-4 border-slate-700 bg-white p-3 shadow">
          <div className="mb-2 rounded bg-slate-800 py-2 text-center text-sm font-semibold text-white">
            Process tracking · {user.name} · {user.device}
          </div>
          <div className="space-y-2">
            <div className="flex items-start"><N n={1} />
              <Field label="Process (set once per shift)" className="flex-1">
                <Select value={p} onChange={(e) => { setP(e.target.value); setRes(null); }} options={procs.map((x) => ({ value: x, label: user.role === "operator" && !user.procs.includes(x) ? `${x} (not assigned)` : x }))} />
              </Field>
            </div>
            {!assigned && <Banner kind="warn">You are not assigned to {p}. Scans will be blocked. Ask the supervisor to change your assignment.</Banner>}
            <div className="flex items-start"><N n={2} />
              <div className="flex-1">
                <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder={typed ? "Type the digits on the label" : "Camera reads: 2610-B014-0237"} onKeyDown={(e) => e.key === "Enter" && scan()} className="font-mono" />
                <button onClick={() => scan()} className="mt-1 w-full rounded bg-teal-600 py-5 text-lg font-bold text-white hover:bg-teal-700">
                  {typed ? "SAVE TYPED NUMBER" : "SCAN GARMENT"}
                </button>
              </div>
            </div>

            {g && (
              <div className="flex items-start"><N n={3} />
                <div className="flex-1 rounded border border-slate-300 bg-slate-50 p-2 text-sm">
                  <div className="font-mono font-bold">{g.no}</div>
                  <div className="text-xs text-slate-600">{order.name} | {order.style} | Size {g.size} {order.priority === "Rush" && <b className="text-red-600">RUSH</b>}</div>
                  <div className="text-xs">Done: {gs.doneList.join(", ") || "nothing yet"}</div>
                  {res.ok ? <div className="text-xs font-semibold text-teal-700">Recorded: {p}</div>
                    : res.missing ? <div className="text-xs font-semibold text-red-700">Missing: {res.missing.join(", ")}</div>
                    : <div className="text-xs text-slate-500">Status: {gs.status}</div>}
                  {remaining.length > 0 && <div className="text-xs text-slate-400">Remaining after: {remaining.join(", ")}</div>}
                </div>
              </div>
            )}

            <div className="flex items-start"><N n={4} />
              <div className="grid flex-1 grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded border border-slate-300 p-1">Scanned today<div className="text-lg font-bold">{today}</div></div>
                <div className="rounded border border-slate-300 p-1">Ready for {p}<div className="text-lg font-bold">{ready.length}</div></div>
              </div>
            </div>

            {res && (
              <div className="flex items-start"><N n={5} />
                <div className="flex-1">
                  <Banner kind={res.queued ? (res.ok ? "warn" : "err") : res.ok ? "ok" : "err"} className="text-center font-semibold">
                    {res.queued ? res.msg : res.ok ? `Recorded. ${nextStepText(order, gs)}` : <>{res.msg}<br /><span className="font-normal">Nothing was saved.</span></>}
                  </Banner>
                  {!res.ok && res.overridable && !res.queued && (
                    can(user, "override") ? (
                      <div className="mt-1 flex gap-1">
                        <Input value={ovr} onChange={(e) => setOvr(e.target.value)} placeholder="Override reason (logged)" />
                        <Btn kind="warn" disabled={!ovr} onClick={() => scan(res.no, true)}>Override</Btn>
                      </div>
                    ) : <Btn className="mt-1 w-full">Call supervisor</Btn>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center"><N n={6} />
              <Btn kind="link" onClick={() => setTyped(!typed)}>{typed ? "Back to camera scan" : "Label damaged? Type the number"}</Btn>
            </div>

            <div className="rounded border border-slate-200 p-2 text-xs">
              <div className="mb-1 flex justify-between font-semibold">
                <span>Recent scans (this phone)</span>
                <span className={online ? "text-green-700" : "text-amber-600"}>{online ? "Sync: OK" : `Offline · ${state.queue.length} waiting`}</span>
              </div>
              {recent.map((e) => (
                <div key={e.id} className={e.ok ? "" : "text-red-600"}>
                  {fmtTime(e.ts)} {e.g} {e.p} {e.ok ? "✓" : "✗"} {e.m === "typed" ? "(typed)" : ""}
                </div>
              ))}
              {state.queue.map((q, i) => <div key={i} className="text-amber-600">{fmtTime(q.ts)} {q.no} {q.p} · on phone, not synced</div>)}
            </div>
          </div>
        </div>

        {/* test panel */}
        <div className="space-y-4">
          <Card title="Try a case (fills the scanner)">
            <div className="flex flex-wrap gap-1">
              {cases.map(([label, num, proc]) => (
                <Btn key={label} disabled={!num} onClick={() => { setNo(num); setP(proc); setRes(null); }} className="text-xs">{label}</Btn>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Then press SCAN. Kiran (operator) is assigned only to Sewing, so other processes show #12 &quot;not assigned&quot;. Switch to Rahul (supervisor) in the header to scan any process and to override.
              Put an order on hold in Screen 1 to see scans blocked.
            </p>
            <Edge id={12}>Process list shows all processes but marks the ones not assigned. Choosing one shows a warning and every scan is blocked for operators.</Edge>
          </Card>

          <Card title="Network and phone (edge cases #14–#17)">
            <div className="flex flex-wrap items-center gap-2">
              <Btn kind={online ? "default" : "warn"} onClick={() => api.settings({ online: !online })}>{online ? "Go offline (weak Wi-Fi)" : "Back online"}</Btn>
              <Btn kind="primary" disabled={!state.queue.length} onClick={() => setSyncRes(api.sync())}>Sync now ({state.queue.length})</Btn>
              <Btn disabled={!state.queue.length} onClick={() => { const q = state.queue.at(-1); setRes(api.otherPhone(q.no, q.p)); }}>
                Another phone scans the last queued garment first
              </Btn>
              <Field label="Phone clock">
                <Select value={state.settings.clockOffset} onChange={(e) => api.settings({ clockOffset: Number(e.target.value) })} options={[
                  { value: 0, label: "Correct" }, { value: -180, label: "3 hours behind (wrong)" }, { value: 120, label: "2 hours ahead (wrong)" },
                ]} />
              </Field>
            </div>
            {syncRes && (
              <div className="mt-2 space-y-1">
                {syncRes.map(({ q, r }, i) => (
                  <Banner key={i} kind={r.ok ? "ok" : "err"}>{q.no} {q.p}: {r.ok ? "saved on sync" : `rejected on sync: ${r.msg}`}</Banner>
                ))}
              </div>
            )}
            <Edge id="14, 15">Offline scans are saved on the phone first (kept after refresh) and every check runs again on sync.</Edge>
            <Edge id={16}>Queue a garment offline, then press &quot;Another phone…&quot;. On sync the first saved scan wins; this one is rejected as already recorded.</Edge>
            <Edge id={17}>Scan time and server time are both stored. Reports use scan time. A difference over 30 min is flagged in the scan log.</Edge>
          </Card>

          {can(user, "bulk") ? <Bulk p={p} /> : <Card title="Bulk entry"><p className="text-xs text-slate-500">Bulk &quot;scan all&quot; needs a supervisor (edge case #18). Switch to Rahul.</p></Card>}

          <Card title="The 5 checks on every scan (Figure 2)">
            <ol className="list-decimal pl-5 text-xs text-slate-600">
              <li>Does this number exist? (and is the operator assigned to this process)</li>
              <li>Is the order Active and the process in this order&apos;s route? (outsourced steps use Sent out / Received back)</li>
              <li>Are all earlier steps done for this garment? (merge gate: all of them)</li>
              <li>Already scanned at this process? (shows who and when)</li>
              <li>On hold, scrapped, shipped, at vendor or in rework?</li>
            </ol>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Bulk({ p }) {
  const { state, api } = useStore();
  const [f, setF] = useState({ batch: state.batches.at(-1).b, from: 1, to: 50, confirm: "" });
  const [res, setRes] = useState(null);
  return (
    <Card title={`Bulk entry (supervisor) · ${p}`}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Batch"><Select value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} options={state.batches.map((b) => b.b)} /></Field>
        <Field label="From"><Input type="number" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="w-20" /></Field>
        <Field label="To"><Input type="number" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="w-20" /></Field>
        <Field label="Physical count"><Input type="number" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} className="w-24" /></Field>
        <Btn kind="primary" onClick={() => setRes(api.bulk({ ...f, p }))}>Save bulk</Btn>
      </div>
      <Result r={res} />
      <Edge id={18}>Limited to {BULK_LIMIT} per entry, needs the physical count to match the range, and each garment still runs all checks. Typical use: Cutting for a new batch.</Edge>
    </Card>
  );
}
