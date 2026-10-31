"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { can, fmtTime, normalizeNo } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, GLink, Input, Page, Pill, Result, Select, Table } from "@/components/ui";

const TYPE = { complete: "Scan", received: "Received back", sent_out: "Sent out", rework: "Rework", scrap: "Scrap", ship: "Shipped", reversal: "Reversal", missing: "Missing", found: "Found" };

export default function LogPage() {
  const { state, ctx, api, user } = useStore();
  const [f, setF] = useState({ p: "All", u: "All", g: "", r: "All" });
  const [rev, setRev] = useState(null);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState(null);
  const reversed = new Set(state.events.filter((e) => e.t === "reversal" && e.ok).map((e) => e.ref));
  const g = normalizeNo(f.g);
  const rows = [];
  for (let i = state.events.length - 1; i >= 0 && rows.length < 150; i--) {
    const e = state.events[i];
    if (f.p !== "All" && e.p !== f.p) continue;
    if (f.u !== "All" && e.u !== f.u) continue;
    if (g && !e.g.includes(g)) continue;
    if (f.r === "Rejected" && e.ok) continue;
    if (f.r === "Flagged" && !e.clockFlag && !e.override) continue;
    rows.push(e);
  }
  const reversible = (e) => e.ok && ["complete", "received", "sent_out"].includes(e.t) && !reversed.has(e.id);
  const open = state.requests.filter((r) => r.status === "Open");

  return (
    <Page title="Screen 6 · Scan log, corrections and approvals" sub="Every scan is here, including rejected ones. Nothing is deleted: a correction is a new reversal entry with a reason." rules="R8, R9, R14, 4.6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card n={1} title="Filters" className="lg:col-span-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Field label="Process"><Select value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} options={["All", ...state.processes.map((x) => x.p)]} /></Field>
            <Field label="User"><Select value={f.u} onChange={(e) => setF({ ...f, u: e.target.value })} options={[{ value: "All", label: "All" }, ...state.users.map((u) => ({ value: u.id, label: u.name }))]} /></Field>
            <Field label="Garment number"><Input value={f.g} onChange={(e) => setF({ ...f, g: e.target.value })} placeholder="B014-0237" /></Field>
            <Field label="Result"><Select value={f.r} onChange={(e) => setF({ ...f, r: e.target.value })} options={["All", "Rejected", "Flagged"]} /></Field>
          </div>
        </Card>

        <Card n={2} title="Log" className="lg:col-span-2">
          <Table max cols={["Scan time", "Synced", "Garment", "Process", "Type", "User · device", "Result", "Action"]}
            rows={rows.map((e) => [
              fmtTime(e.ts),
              <span key="s" className={e.clockFlag ? "font-bold text-amber-600" : "text-slate-400"}>{fmtTime(e.sync)}{e.clockFlag ? " ⚠ clock" : ""}</span>,
              <GLink key="g" no={e.g} />, e.p, TYPE[e.t] + (e.m === "typed" ? " (typed)" : e.m === "bulk" ? " (bulk)" : e.m === "late" ? " (late)" : ""),
              `${ctx.user(e.u)?.name} · ${e.d}`,
              e.ok ? (reversed.has(e.id) ? <Pill key="r" tone="Cancelled">Reversed</Pill> : <span key="r" className="text-green-700">Recorded{e.override ? " (override)" : ""}{e.t === "reversal" ? `: ${e.reason}` : ""}{e.back ? ` → ${e.back}` : ""}</span>)
                : <span key="r" className="text-red-700">Rejected: {e.why}</span>,
              reversible(e) ? <Btn key="a" className="text-xs" onClick={() => { setRev(e); setRes(null); }}>Reverse entry</Btn> : "-",
            ])} />
          <p className="mt-1 text-xs text-slate-400">Newest first, up to 150 rows. Rejected scans are kept but never change status.</p>
        </Card>

        <div className="space-y-4">
          <Card n={3} title="Reverse entry">
            {!rev ? <p className="text-xs text-slate-400">Pick &quot;Reverse entry&quot; on a row.</p> : (
              <>
                <p className="text-sm">{rev.g} · {rev.p} · {fmtTime(rev.ts)} by {ctx.user(rev.u)?.name}</p>
                <Field label="Reason (required)" className="mt-1">
                  <Select value={reason} onChange={(e) => setReason(e.target.value)} options={["", "Wrong garment scanned", "Wrong process", "Wrong count", "Scanned before work was done"]} />
                </Field>
                <div className="mt-2 flex gap-2">
                  <Btn kind="primary" disabled={!reason} onClick={() => { setRes(api.reverse({ eventId: rev.id, reason })); setRev(null); setReason(""); }}>
                    {can(user, "reverse") ? "Confirm reversal" : "Request reversal"}
                  </Btn>
                  <Btn onClick={() => setRev(null)}>Cancel</Btn>
                </div>
              </>
            )}
            <Result r={res} />
            <Edge id={22}>Only a supervisor can reverse. Operators send a request; planners and owners cannot.</Edge>
            <Edge id={23}>Reversing Cutting of a sewn garment is blocked and the later scans are listed. Reverse those first.</Edge>
            <Edge>Wrong garment / wrong count: reverse it, then scan the right one. Counts are never edited directly.</Edge>
          </Card>

          <Card title={`Approvals (${open.length} open)`}>
            {!can(user, "override") && <Banner kind="info" className="mb-2">Switch to Rahul (supervisor) to approve.</Banner>}
            {open.length === 0 && <p className="text-xs text-slate-400">No open requests.</p>}
            <ul className="space-y-2">
              {open.map((r) => (
                <li key={r.id} className="rounded border border-slate-200 p-2 text-xs">
                  <div><b>{ctx.user(r.by)?.name}</b> · {fmtTime(r.ts)}</div>
                  <div>{r.text}</div>
                  <div className="mt-1 flex gap-1">
                    <Btn kind="primary" className="text-xs" disabled={!can(user, "override")} onClick={() => setRes(api.decide(r.id, true))}>Approve</Btn>
                    <Btn className="text-xs" disabled={!can(user, "override")} onClick={() => setRes(api.decide(r.id, false))}>Reject</Btn>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Audit log (adjustments, reversals, route changes, reprints, overrides)" className="lg:col-span-3">
          <Table max cols={["Time", "Type", "Object", "Old", "New", "Reason", "User", "Approver"]}
            rows={[...state.audit].reverse().map((a) => [fmtTime(a.ts), a.type, a.object, String(a.old), String(a.new), a.reason, ctx.user(a.user)?.name || a.user, ctx.user(a.approver)?.name || a.approver])} />
          <Edge>Someone tries to hide a mistake: nothing can be deleted, and every reversal shows the user and reason here.</Edge>
        </Card>
      </div>
    </Page>
  );
}
