"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { MANDATORY, can, checkRoute, fmtDate, insertStep, levels, perm, removeStep, stepOf } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, Input, Page, Pill, Result, Select } from "@/components/ui";

export default function OrdersPage() {
  const { state, ctx } = useStore();
  const ids = Object.keys(state.orders).sort((a, b) => (state.orders[b].priority === "Rush") - (state.orders[a].priority === "Rush"));
  const [sel, setSel] = useState("A-2610-01");
  const o = state.orders[sel];
  return (
    <Page title="Screen 1 · Order process configuration" sub="Planner picks the processes for each order, marks type, sets what each step depends on and its required time." rules="R1–R4, R12, R13">
      <div className="mb-3 flex flex-wrap gap-2">
        {ids.map((id) => {
          const x = state.orders[id];
          return (
            <button key={id} onClick={() => setSel(id)} className={`rounded border px-3 py-1.5 text-left text-sm ${sel === id ? "border-teal-600 bg-teal-50" : "border-slate-300 bg-white"}`}>
              <b>{x.name}</b> {id} <Pill>{ctx.orderStatus(id)}</Pill> {x.priority === "Rush" && <Pill>Rush</Pill>}
              <div className="text-xs text-slate-500">{x.style} · {x.qty} pcs · ship {fmtDate(x.shipDate)}</div>
            </button>
          );
        })}
      </div>
      <OrderEditor key={`${sel}-${o.routeVersion}-${o.status}`} order={o} />
      <AddProcess />
    </Page>
  );
}

function OrderEditor({ order }) {
  const { state, ctx, api, user } = useStore();
  const [route, setRoute] = useState(order.route);
  const [reason, setReason] = useState("");
  const [res, setRes] = useState(null);
  const [compare, setCompare] = useState(false);
  const status = ctx.orderStatus(order.id);
  const started = status !== "Draft";
  const checks = checkRoute(route);
  const allOk = checks.every((c) => c.ok);
  const changed = JSON.stringify(route) !== JSON.stringify(order.route);
  const editable = perm(user, "configureRoute") === "yes";

  const toggle = (proc) => {
    if (stepOf(route, proc.p)) setRoute(removeStep(route, proc.p));
    else setRoute(insertStep(route, proc, state.processes));
  };
  const patch = (p, k, v) => setRoute(route.map((s) => (s.p === p ? { ...s, [k]: v } : s)));
  const toggleDep = (p, d) => {
    const s = stepOf(route, p);
    patch(p, "deps", s.deps.includes(d) ? s.deps.filter((x) => x !== d) : [...s.deps, d]);
  };
  const template = (name) => {
    const src = name === "A" ? state.orders["A-2610-01"].route : state.orders["A-2610-01"].route.filter((s) => MANDATORY.includes(s.p));
    let r = src.map((s) => ({ ...s, vendor: undefined }));
    if (name !== "A") r = r.map((s, i) => ({ ...s, deps: i ? [r[i - 1].p] : [] }));
    setRoute(r);
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card n={1} title="Order details" className="lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-8">
            <Field label="Order number">{order.id}</Field>
            <Field label="Style">{order.style}</Field>
            <Field label="Buyer">{order.buyer}</Field>
            <Field label="Quantity">{order.qty}</Field>
            <Field label="Ship date">{fmtDate(order.shipDate)}</Field>
            <Field label="Planned efficiency">{Math.round(order.eff * 100)}%</Field>
            <Field label="Status"><Pill>{status}</Pill></Field>
            <Field label="Route version">v{order.routeVersion}</Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn disabled={!can(user, "orderStatus")} onClick={() => setRes(api.setOrder(order.id, { priority: order.priority === "Rush" ? "Normal" : "Rush" }))}>
              {order.priority === "Rush" ? "Set Normal priority" : "Mark Rush"}
            </Btn>
            {order.status === "Active" && <Btn kind="warn" disabled={!can(user, "orderStatus")} onClick={() => setRes(api.setOrder(order.id, { status: "On hold" }, "Buyer asked to pause"))}>Put on hold</Btn>}
            {order.status === "On hold" && <Btn kind="primary" disabled={!can(user, "orderStatus")} onClick={() => setRes(api.setOrder(order.id, { status: "Active" }, "Released"))}>Release hold</Btn>}
            {(order.status === "Active" || order.status === "On hold") && <Btn kind="danger" disabled={!can(user, "orderStatus")} onClick={() => confirm("Cancel order? Work done is kept in history.") && setRes(api.setOrder(order.id, { status: "Cancelled" }, "Buyer cancelled"))}>Cancel order</Btn>}
          </div>
          <Edge id={25}>On hold / Cancelled blocks every scan for this order (R13). Rush moves the order to the top of lists and the dashboard.</Edge>
        </Card>

        <Card n={2} title="Process table" className="lg:col-span-2">
          {!started && route.length === 0 && (
            <Banner kind="info" className="mb-2">
              Order is Draft with no route: no labels can be printed, no scans allowed. Suggested templates for {order.style}:{" "}
              <Btn kind="link" onClick={() => template("A")}>Like Order A (7 steps)</Btn> · <Btn kind="link" onClick={() => template("basic")}>Basic (4 mandatory)</Btn>
            </Banner>
          )}
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs text-slate-600">
                  <th className="p-1">Use</th><th className="p-1">Process</th><th className="p-1">Type</th><th className="p-1">Depends on</th>
                  <th className="p-1">SAM (min)</th><th className="p-1">Operators</th><th className="p-1">Outsourced to</th>
                </tr>
              </thead>
              <tbody>
                {state.processes.filter((m) => m.active).map((m) => {
                  const s = stepOf(route, m.p);
                  return (
                    <tr key={m.p} className={`border-b border-slate-100 ${s ? "" : "text-slate-400"}`}>
                      <td className="p-1">
                        <input type="checkbox" checked={!!s} disabled={!editable || (m.mandatory && !!s)} onChange={() => toggle(m)} title={m.mandatory ? "Mandatory: cannot be removed" : ""} />
                      </td>
                      <td className="p-1">{m.p}</td>
                      <td className="p-1">{s ? <b className={m.mandatory ? "" : "font-normal"}>{s.type}</b> : "Not applicable"}</td>
                      <td className="p-1">
                        {s && (m.p === "Cutting" && !s.deps.length ? <span className="text-xs text-slate-500">(first step)</span> :
                          <div className="flex flex-wrap gap-1">
                            {route.filter((x) => x.p !== m.p).map((x) => (
                              <button key={x.p} disabled={!editable} onClick={() => toggleDep(m.p, x.p)}
                                className={`rounded border px-1 text-xs ${s.deps.includes(x.p) ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-300"}`}>
                                {x.p}
                              </button>
                            ))}
                          </div>)}
                      </td>
                      <td className="p-1">{s && <Input type="number" step="0.1" value={s.sam} disabled={!editable} onChange={(e) => patch(m.p, "sam", Number(e.target.value))} className="w-16" />}</td>
                      <td className="p-1">{s && !s.vendor && <Input type="number" value={s.ops} disabled={!editable} onChange={(e) => patch(m.p, "ops", Number(e.target.value))} className="w-14" />}</td>
                      <td className="p-1">
                        {s && m.outsourceable && <Input placeholder="in-house" value={s.vendor || ""} disabled={!editable} onChange={(e) => patch(m.p, "vendor", e.target.value || undefined)} className="w-32" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Untick a process to remove it from this order: its next step is linked to its earlier step (R4). Steps with the same earlier step run in parallel.
            Mandatory steps are locked. SAM = Standard Allowed Minutes per garment, used for estimates.
          </p>
          <Edge id="1, 2">Click depends-on chips to make a loop (Embroidery depends on Sewing) or a dead end (remove Printing from Sewing). Checks fail and Publish is disabled.</Edge>
          <Edge id="3, 4">On an Active order, changes need a reason. Priya (planner) sends a request; Rahul (supervisor) applies it as a new route version. Add Washing to Order B: garments already past Sewing are flagged.</Edge>
        </Card>

        <div className="space-y-4">
          <Card n={3} title="Route preview" right={<Btn kind="link" onClick={() => setCompare(!compare)}>{compare ? "Hide" : "Compare"} other order</Btn>}>
            <Preview route={route} />
            {compare && (
              <div className="mt-3 border-t pt-2">
                <div className="mb-1 text-xs text-slate-500">{order.id === "B-2610-02" ? "Order A" : "Order B"}</div>
                <Preview route={state.orders[order.id === "B-2610-02" ? "A-2610-01" : "B-2610-02"].route} />
              </div>
            )}
          </Card>
          <Card n={4} title="Route checks">
            <ul className="space-y-0.5 text-sm">
              {checks.map((c) => <li key={c.label} className={c.ok ? "text-green-700" : "text-red-700"}>{c.ok ? "OK" : "FAIL"} {c.label}</li>)}
            </ul>
          </Card>
          <Card n={5} title="Save">
            {!editable && <Banner kind="warn" className="mb-2">{user.name} ({user.role}) can only view routes.</Banner>}
            {started && changed && (
              <Field label="Reason for change (required once production started)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Buyer added Washing" />
              </Field>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {!started && <Btn disabled={!editable} onClick={() => setRes(api.saveRoute({ orderId: order.id, route }))}>Save draft</Btn>}
              <Btn onClick={() => { setRoute(order.route); setRes(null); }}>Cancel</Btn>
              {!started && <Btn kind="primary" disabled={!editable || !allOk} onClick={() => setRes(api.saveRoute({ orderId: order.id, route, publish: true }))}>Publish route</Btn>}
              {started && (
                <Btn kind="primary" disabled={!editable || !allOk || !changed} onClick={() => setRes(api.saveRoute({ orderId: order.id, route, reason }))}>
                  {perm(user, "changeRoute") === "request" ? "Request route change" : "Approve & apply change"}
                </Btn>
              )}
            </div>
            <Result r={res} />
            {order.flagged?.length > 0 && (
              <Banner kind="warn" className="mt-2">
                {order.flagged.length} garments were already past the new step when route v{order.routeVersion} was applied. Supervisor decides: send back via rework, or accept.
                <div className="mt-1 font-mono text-xs">{order.flagged.slice(0, 6).join(", ")}{order.flagged.length > 6 ? "…" : ""}</div>
              </Banner>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Preview({ route }) {
  const rows = levels(route);
  if (!route.length) return <p className="text-xs text-slate-400">No steps yet.</p>;
  if (!rows) return <p className="text-sm text-red-700">Cannot draw: circular link.</p>;
  return (
    <div className="flex flex-col items-center gap-1">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col items-center">
          {i > 0 && <div className="text-xs leading-none text-slate-400">↓</div>}
          <div className="flex items-center gap-2">
            {row.map((p) => {
              const s = stepOf(route, p);
              return (
                <div key={p} className={`rounded border px-3 py-1 text-xs ${s.type === "Mandatory" ? "border-slate-500 bg-slate-100" : "border-amber-500 bg-amber-50"}`}>
                  {p}{s.vendor ? " (vendor)" : ""} <span className="text-slate-400">{s.sam}m</span>
                </div>
              );
            })}
            {row.length > 1 && <span className="text-xs text-teal-700">parallel → merge gate</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddProcess() {
  const { api, user } = useStore();
  const [f, setF] = useState({ p: "", seq: "5.5", sam: "1", outsourceable: false });
  const [res, setRes] = useState(null);
  return (
    <Card title="Process master: add a process (admin)" className="mt-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name"><Input value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} placeholder="Quality check" /></Field>
        <Field label="Position (seq)">
          <Select value={f.seq} onChange={(e) => setF({ ...f, seq: e.target.value })} options={[
            { value: "1.5", label: "After Cutting" }, { value: "2", label: "With Embroidery/Printing (parallel)" }, { value: "3.5", label: "After Sewing" },
            { value: "4.5", label: "After Washing" }, { value: "5.5", label: "After Finishing" },
          ]} />
        </Field>
        <Field label="SAM (min)"><Input type="number" value={f.sam} onChange={(e) => setF({ ...f, sam: e.target.value })} className="w-20" /></Field>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.outsourceable} onChange={(e) => setF({ ...f, outsourceable: e.target.checked })} /> Outsourceable</label>
        <Btn disabled={!can(user, "configureRoute")} onClick={() => setRes(api.addProcess({ p: f.p.trim(), seq: Number(f.seq), sam: Number(f.sam), outsourceable: f.outsourceable }))}>Add</Btn>
      </div>
      <Result r={res} />
      <p className="mt-1 text-xs text-slate-500">New processes are optional by default and appear in every order&apos;s process table. Not hard-coded (A3).</p>
    </Card>
  );
}
