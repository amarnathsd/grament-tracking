"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { DAY, can, fmtDur, fmtTime, normalizeNo } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, GLink, Input, Page, Result, Select, Stat, Table } from "@/components/ui";

export default function OutsourcePage() {
  const { state, ctx, api, user } = useStore();
  const steps = Object.values(state.orders).flatMap((o) => o.route.filter((s) => s.vendor).map((s) => ({ o, s })));
  const [key, setKey] = useState(steps[0] ? `${steps[0].o.id}|${steps[0].s.p}` : "");
  const [count, setCount] = useState(20);
  const [nos, setNos] = useState("");
  const [ovr, setOvr] = useState("");
  const [res, setRes] = useState(null);
  const now = ctx.now;
  const sel = steps.find((x) => `${x.o.id}|${x.s.p}` === key);

  const data = useMemo(() => {
    if (!sel) return null;
    const list = ctx.garmentsOf(sel.o.id).map((g) => ({ g, gs: ctx.gs(g.no) }));
    const sent = new Set();
    const recv = new Set();
    for (const { g } of list) for (const e of ctx.events(g.no)) {
      if (e.ok && e.p === sel.s.p && e.t === "sent_out") sent.add(g.no);
      if (e.ok && e.p === sel.s.p && e.t === "received") recv.add(g.no);
    }
    const atVendor = list.filter((x) => x.gs.atVendor?.p === sel.s.p).sort((a, b) => a.gs.atVendor.ts - b.gs.atVendor.ts);
    const late = atVendor.filter((x) => now - x.gs.atVendor.ts > (sel.s.vendorDays || 3) * DAY);
    const readyToSend = list.filter((x) => (x.gs.status === "In progress" || x.gs.rework?.back === sel.s.p) && x.gs.pending.includes(sel.s.p));
    return { sent, recv, atVendor, late, readyToSend };
  }, [ctx, sel, now]);

  if (!sel) return <Page title="Screen 8 · Outsourced process"><Banner>No order has an outsourced step. Set a vendor on a step in Screen 1.</Banner></Page>;
  const parse = () => nos.split(/[\s,]+/).map(normalizeNo).filter(Boolean);

  return (
    <Page title="Screen 8 · Outsourced process" sub="Garments leaving the factory are scanned Sent out, and Received back on return. Received back completes the step." rules="4.8">
      <Field label="Outsourced step" className="max-w-md">
        <Select value={key} onChange={(e) => setKey(e.target.value)} options={steps.map(({ o, s }) => ({ value: `${o.id}|${s.p}`, label: `${o.name} · ${s.p} · ${s.vendor}` }))} />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Sent out" value={data.sent.size} />
        <Stat label="Received back" value={data.recv.size} tone="green" />
        <Stat label="At vendor now (gap)" value={data.atVendor.length} tone="violet" />
        <Stat label={`Late (> ${sel.s.vendorDays || 3} day)`} value={data.late.length} tone="red" />
        <Stat label="Ready to send" value={data.readyToSend.length} />
      </div>
      {!can(user, "outsource") && <Banner kind="warn" className="mt-3">Only a supervisor records sent out / received back. Switch to Rahul.</Banner>}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Card n={1} title="Sent out">
          <div className="flex items-end gap-2">
            <Field label="Next ready garments"><Input type="number" value={count} onChange={(e) => setCount(e.target.value)} className="w-24" /></Field>
            <Btn kind="primary" onClick={() => setRes(api.sendOut({ nos: data.readyToSend.slice(0, Number(count)).map((x) => x.g.no), p: sel.s.p, vendor: sel.s.vendor }))}>
              Send {Math.min(Number(count), data.readyToSend.length)} to {sel.s.vendor}
            </Btn>
          </div>
          <p className="mt-1 text-xs text-slate-500">Each garment still runs the checks (earlier steps done, not already sent).</p>
        </Card>
        <Card n={2} title="Received back">
          <div className="flex flex-wrap items-end gap-2">
            <Btn kind="primary" disabled={!data.atVendor.length} onClick={() => setRes(api.receive({ nos: data.atVendor.slice(0, Number(count)).map((x) => x.g.no), p: sel.s.p }))}>
              Receive {Math.min(Number(count), data.atVendor.length)} oldest
            </Btn>
          </div>
          <Field label="Or scan / type numbers (comma separated)" className="mt-2">
            <Input value={nos} onChange={(e) => setNos(e.target.value)} placeholder={data.readyToSend[0]?.g.no} className="font-mono" />
          </Field>
          <Field label="Override reason (supervisor, if never sent out)" className="mt-1"><Input value={ovr} onChange={(e) => setOvr(e.target.value)} /></Field>
          <Btn className="mt-2" onClick={() => setRes(api.receive({ nos: parse(), p: sel.s.p, overrideReason: ovr }))}>Receive typed numbers</Btn>
          <Edge>Garment returned without being sent out: blocked. Type a ready garment number above to try it; a supervisor can override with a reason.</Edge>
        </Card>
      </div>
      <Result r={res} />
      <Card title="Gap by garment number (sent, not yet received)" className="mt-4">
        <Table max cols={["Garment", "Sent out", "At vendor for", "Status"]} rows={data.atVendor.slice(0, 100).map((x) => [
          <GLink key={x.g.no} no={x.g.no} />, fmtTime(x.gs.atVendor.ts), fmtDur(now - x.gs.atVendor.ts),
          now - x.gs.atVendor.ts > (sel.s.vendorDays || 3) * DAY ? <span key="l" className="text-red-700">Late</span> : "On time",
        ])} />
        <Edge id={26}>Quantity sent differs from received: the gap is listed by garment number. The supervisor chases the vendor or marks garments lost / scrapped.</Edge>
        <Edge>Vendor delay: garments at the vendor longer than the expected days are flagged here and on the dashboard. Defects on return go to rework (Screen 5).</Edge>
      </Card>
    </Page>
  );
}
