"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { REASONS, REWORK_LIMIT, can, downstream, normalizeNo, perm } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, GLink, Input, Page, Pill, Result, Select } from "@/components/ui";

export default function ReworkPage() {
  const { state, ctx, api, user } = useStore();
  const [no, setNo] = useState("2610-B013-0001");
  const [foundAt, setFoundAt] = useState("Finishing");
  const [back, setBack] = useState("Sewing");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [res, setRes] = useState(null);
  const n = normalizeNo(no);
  const g = ctx.garment(n);
  const gs = g && ctx.gs(n);
  const order = g && state.orders[g.order];
  const doneSteps = gs ? order.route.map((s) => s.p).filter((p) => gs.done.has(p)) : [];
  const backOk = doneSteps.includes(back) ? back : doneSteps.at(-1) || "";
  const reopen = gs && backOk ? [backOk, ...downstream(order.route, backOk)].filter((p) => gs.done.has(p)) : [];

  const pick = (fn) => state.garments.find((x) => fn(ctx.gs(x.no), x))?.no;
  const samples = [
    ["Ready to ship (rework after Packing)", pick((s) => s.status === "Ready to ship")],
    ["Sewn, in progress", pick((s, x) => x.order === "A-2610-01" && s.status === "In progress" && s.done.has("Sewing"))],
    ["Already in rework", pick((s) => s.status === "In rework")],
    [`Reworked ${REWORK_LIMIT}+ times`, pick((s) => s.reworkCount >= REWORK_LIMIT)],
  ];

  return (
    <Page title="Screen 5 · Mark rework / scrap" sub="Inspector finds a defect, picks the reason and the earlier step to send it back to. Steps after that step re-open for this garment only." rules="R10, R11, 4.5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Mark rework (garment ${n})`}>
          <Field label="Garment number"><Input value={no} onChange={(e) => { setNo(e.target.value); setRes(null); }} className="font-mono" /></Field>
          <div className="mt-1 flex flex-wrap gap-1">
            {samples.map(([l, x]) => <Btn key={l} disabled={!x} className="text-xs" onClick={() => { setNo(x); setRes(null); }}>{l}</Btn>)}
          </div>
          {!g && <Banner kind="err" className="mt-2">Unknown garment number.</Banner>}
          {g && (
            <>
              <div className="mt-2 text-xs text-slate-600">
                {order.name} · {order.style} · size {g.size} · <Pill>{gs.status}</Pill> · reworked {gs.reworkCount}× · done: {doneSteps.join(", ") || "none"}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="1 · Found at process"><Select value={foundAt} onChange={(e) => setFoundAt(e.target.value)} options={order.route.map((s) => s.p)} /></Field>
                <Field label="2 · Reason"><Select value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS} /></Field>
                <Field label="2 · Send back to (only done steps in this route)">
                  <Select value={backOk} onChange={(e) => setBack(e.target.value)} options={doneSteps.length ? doneSteps : ["-"]} />
                </Field>
                <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Open seam on left sleeve" /></Field>
              </div>
              {reopen.length > 0 && <p className="mt-2 text-xs text-amber-700">{reopen.join(", ")} will be re-opened for this garment.{gs.done.has("Packing") ? " It is taken out of the packed lot (packed count −1)." : ""}</p>}
              <div className="mt-2 flex gap-2">
                <Btn kind="warn" disabled={!backOk} onClick={() => setRes(api.rework({ no: n, foundAt, back: backOk, reason, note }))}>
                  {perm(user, "rework") === "request" ? "Request rework" : "3 · Send to rework"}
                </Btn>
                <Btn kind="danger" disabled={!can(user, "scrap")} onClick={() => setRes(api.scrap({ no: n, reason: `${reason}${note ? ": " + note : ""}` }))}>Scrap garment (supervisor only)</Btn>
              </div>
              <Result r={res} />
              <p className="mt-2 text-xs">Open journey: <GLink no={n} /></p>
            </>
          )}
        </Card>
        <div className="space-y-3">
          <Card title="What happens next">
            <ol className="list-decimal pl-5 text-sm text-slate-700">
              <li>Garment status becomes In rework.</li>
              <li>The send-back step and every step after it re-open (earlier scans stay in history).</li>
              <li>Dashboard counts it under In rework, not pending.</li>
              <li>Scanning it at a later step is blocked: &quot;In rework: scan at Sewing first&quot;.</li>
              <li>Operator re-scans it at the send-back step after repair, then it flows forward.</li>
              <li>Rework count is kept; {REWORK_LIMIT} or more is flagged to the supervisor.</li>
              <li>Cannot be fixed → supervisor scraps it; the order&apos;s expected quantity reduces and the shortfall shows on the dashboard.</li>
            </ol>
          </Card>
          <Edge id={19}>Send a garment back several steps (e.g. from Finishing to Embroidery): every later step re-opens, including the merge into Sewing.</Edge>
          <Edge>Defect at one parallel step only: send back to Printing. Embroidery stays done; the merge gate holds Sewing until Printing is done again.</Edge>
          <Edge id={21}>Rework after Packing: pick a &quot;Ready to ship&quot; garment. Packing re-opens and the ready-to-ship count drops by one. Shipped garments are blocked.</Edge>
          <Edge id={20}>Scrap needs a supervisor (Rahul). Operators (Sunil at Finishing) can only request rework; Rahul approves on Screen 6.</Edge>
        </div>
      </div>
    </Page>
  );
}
