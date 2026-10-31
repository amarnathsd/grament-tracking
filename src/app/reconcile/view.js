"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can, fmtTime } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, GLink, Input, Page, Result, Select, Table } from "@/components/ui";

export default function ReconcilePage() {
  const { state, ctx, api, user } = useStore();
  const ids = Object.keys(state.orders).filter((id) => state.orders[id].route.length);
  const [orderId, setOrderId] = useState("A-2610-01");
  const order = state.orders[orderId];
  const [p, setP] = useState("Sewing");
  const step = order.route.find((s) => s.p === p) ? p : order.route[1]?.p;
  const [batch, setBatch] = useState("All");
  const [physical, setPhysical] = useState("");
  const [marks, setMarks] = useState({});
  const [res, setRes] = useState(null);

  // expected at this process: earlier steps done, this step not done, not blocked
  const expected = useMemo(() => ctx.garmentsOf(orderId).filter((g) => {
    const gs = ctx.gs(g.no);
    return (gs.status === "In progress" || gs.status === "Not started" || gs.rework?.back === step) && gs.pending.includes(step);
  }), [ctx, orderId, step]);
  const missing = useMemo(() => ctx.garmentsOf(orderId).filter((g) => ctx.gs(g.no).status === "Missing"), [ctx, orderId]);
  const shown = expected.filter((g) => batch === "All" || g.batch === batch);
  const late = Object.keys(marks).filter((k) => marks[k] === "late");
  const miss = Object.keys(marks).filter((k) => marks[k] === "missing");
  const diff = physical === "" ? null : Number(physical) - expected.length;
  const batches = [...new Set(ctx.garmentsOf(orderId).map((g) => g.batch))];

  return (
    <Page title="Screen 9 · End-of-shift reconciliation" sub="Compare what the system expects at a process with what is physically on the floor. Fix gaps with late scans or by marking garments missing." rules="4.9">
      {!can(user, "reconcile") && <Banner kind="warn" className="mb-3">Only a supervisor reconciles (owner can view). Switch to Rahul to save.</Banner>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card n={1} title="Process and count">
          <Field label="Order"><Select value={orderId} onChange={(e) => { setOrderId(e.target.value); setMarks({}); }} options={ids.map((id) => ({ value: id, label: state.orders[id].name }))} /></Field>
          <Field label="Process" className="mt-2"><Select value={step} onChange={(e) => { setP(e.target.value); setMarks({}); }} options={order.route.filter((s) => s.p !== "Cutting" && !s.vendor).map((s) => s.p)} /></Field>
          <div className="mt-3 rounded border border-slate-300 p-2 text-sm">System expects <b>{expected.length}</b> garments at {step} (earlier steps done, {step} not done).</div>
          <Field label="Physical count on the floor" className="mt-2"><Input type="number" value={physical} onChange={(e) => setPhysical(e.target.value)} /></Field>
          {diff != null && (
            <Banner kind={diff === 0 ? "ok" : "warn"} className="mt-2">
              {diff === 0 ? "Counts match." : diff < 0 ? `${-diff} fewer on the floor. Either they were done and not scanned (late scan) or they are missing.` : `${diff} more on the floor than expected: check for garments from another process or order.`}
            </Banner>
          )}
          <div className="mt-3 text-sm">Marked: {late.length} late scan · {miss.length} missing</div>
          <Btn kind="primary" className="mt-2" disabled={physical === ""} onClick={() => { setRes(api.reconcile({ orderId, p: step, expected: expected.length, physical, late, missing: miss })); setMarks({}); }}>
            Save reconciliation
          </Btn>
          <Result r={res} />
          <Edge id={13}>Forgotten scan: a garment that is done but was not scanned. Mark it &quot;late scan&quot;; it is saved with a late-scan note.</Edge>
          <Edge id={27}>Dashboard differs from the floor: this list shows exactly which garment numbers differ.</Edge>
        </Card>
        <Card n={2} title={`Garments expected at ${step} (${shown.length})`} className="lg:col-span-2"
          right={<Select value={batch} onChange={(e) => setBatch(e.target.value)} options={["All", ...batches]} className="w-28" />}>
          <Table max cols={["Garment", "Batch", "Last scan", "Mark"]} rows={shown.slice(0, 60).map((g) => {
            const gs = ctx.gs(g.no);
            return [
              <GLink key={g.no} no={g.no} />, g.batch, gs.last ? `${fmtTime(gs.last.ts)} ${gs.last.p}` : "-",
              <div key="m" className="flex gap-1">
                {["", "late", "missing"].map((m) => (
                  <button key={m} onClick={() => setMarks({ ...marks, [g.no]: m })}
                    className={`rounded border px-1.5 text-xs ${(marks[g.no] || "") === m ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}>
                    {m === "" ? "on floor, not done" : m === "late" ? "done, late scan" : "missing"}
                  </button>
                ))}
              </div>,
            ];
          })} />
          {shown.length > 60 && <p className="text-xs text-slate-400">Showing 60. Filter by batch.</p>}
        </Card>
        <Card title="Missing garments (alert panel)" className="lg:col-span-2">
          <Table cols={["Garment", "Batch", "Action"]} rows={missing.map((g) => [<GLink key={g.no} no={g.no} />, g.batch,
            <Btn key="f" className="text-xs" disabled={!can(user, "reconcile")} onClick={() => setRes(api.found(g.no))}>Found it</Btn>])} empty="No missing garments" />
          <p className="mt-1 text-xs text-slate-500">Not found within the agreed time → handled as lost or scrapped (Screen 5). Batches with no scan for 2+ hours also alert on the dashboard.</p>
        </Card>
        <Card title="Past reconciliations">
          <Table cols={["Time", "Process", "System", "Floor", "Late", "Missing"]} rows={[...state.recon].reverse().map((r) => [fmtTime(r.ts), `${state.orders[r.orderId].name} ${r.p}`, r.expected, r.physical, r.late, r.missing])} empty="None yet" />
          <p className="mt-1 text-xs text-slate-500">Count differs repeatedly at one process → review training or layout.</p>
        </Card>
      </div>
    </Page>
  );
}
