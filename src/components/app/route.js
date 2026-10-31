"use client";
// Set up or change an order's route. Same rules as everywhere: checks, R4 re-linking, approval once production started.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { MANDATORY, checkRoute, insertStep, levels, perm, removeStep, stepOf } from "@/lib/rules";
import { Top, useNav } from "./App";
import { Button, Card, Choice, Chip, Notice, Section, Stepper, Toggle } from "./kit";

export function RouteScreen({ orderId }) {
  const { state, ctx, api, user } = useStore();
  const nav = useNav();
  const order = state.orders[orderId];
  const draft = ctx.orderStatus(orderId) === "Draft";
  const [route, setRoute] = useState(order.route);
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState("");
  const [r, setR] = useState(null);
  const checks = checkRoute(route);
  const allOk = checks.every((c) => c.ok);
  const changed = JSON.stringify(route) !== JSON.stringify(order.route);
  const request = perm(user, "changeRoute") === "request";

  const patch = (p, k, v) => setRoute(route.map((s) => (s.p === p ? { ...s, [k]: v } : s)));
  const toggle = (m) => setRoute(stepOf(route, m.p) ? removeStep(route, m.p) : insertStep(route, m, state.processes));
  const template = (full) => {
    const src = state.orders["A-2610-01"].route.map((s) => ({ ...s, vendor: undefined }));
    if (full) return setRoute(src);
    const basic = src.filter((s) => MANDATORY.includes(s.p));
    setRoute(basic.map((s, i) => ({ ...s, deps: i ? [basic[i - 1].p] : [] })));
  };
  const save = (publish) => {
    const res = api.saveRoute({ orderId, route, publish, reason });
    setR(res);
    if (res.ok || res.requested) {
      nav.notify(res);
      nav.back();
    }
  };

  return (
    <>
      <Top title={draft ? "Set up route" : "Change plan"} sub={`${order.name} · ${order.style}${draft ? "" : ` · now v${order.routeVersion}`}`} />
      <div className="px-4">
        {draft && route.length === 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Card onClick={() => template(true)}><div className="text-sm font-bold">Like Order A</div><div className="text-xs text-muted">7 steps, print + embroidery in parallel</div></Card>
            <Card onClick={() => template(false)}><div className="text-sm font-bold">Basic</div><div className="text-xs text-muted">Cut → Sew → Finish → Pack</div></Card>
          </div>
        )}
        {!draft && <p className="mt-1 rounded-2xl bg-warn-soft px-4 py-2 text-xs text-warn">Production has started. Work already done stays valid; the new plan applies from now.</p>}

        <Section title="Processes" action={<span className="text-xs text-muted">tap a step for details</span>}>
          <div className="space-y-2">
            {state.processes.filter((m) => m.active).map((m) => {
              const s = stepOf(route, m.p);
              const isOpen = open === m.p && s;
              return (
                <Card key={m.p} className="!p-0">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : m.p)}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${s ? "" : "text-muted"}`}>{m.p}</span>
                        {m.mandatory ? <Chip tone="brand">must</Chip> : <Chip>optional</Chip>}
                        {s?.vendor && <Chip tone="vendor">vendor</Chip>}
                      </div>
                      <div className="truncate text-[11px] text-muted">
                        {s ? `${s.deps.length ? `after ${s.deps.join(" + ")}` : "first step"} · ${s.sam} min/pc` : "Not needed for this order"}
                      </div>
                    </button>
                    <Toggle on={!!s} disabled={m.mandatory && !!s} onChange={() => toggle(m)} />
                  </div>
                  {isOpen && (
                    <div className="space-y-3 border-t border-line px-4 py-3">
                      {m.p !== "Cutting" && (
                        <div>
                          <div className="mb-1 text-xs text-muted">Starts after</div>
                          <div className="flex flex-wrap gap-1.5">
                            {route.filter((x) => x.p !== m.p).map((x) => (
                              <button key={x.p} onClick={() => patch(m.p, "deps", s.deps.includes(x.p) ? s.deps.filter((d) => d !== x.p) : [...s.deps, x.p])}
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${s.deps.includes(x.p) ? "bg-brand text-white" : "bg-bg text-muted"}`}>{x.p}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between"><span className="text-xs text-muted">Required time (SAM, min per piece)</span><Stepper value={s.sam} onChange={(v) => patch(m.p, "sam", Math.round(v * 10) / 10)} min={0.1} step={0.5} /></div>
                      {!s.vendor && <div className="flex items-center justify-between"><span className="text-xs text-muted">Operators</span><Stepper value={s.ops} onChange={(v) => patch(m.p, "ops", v)} min={1} /></div>}
                      {m.outsourceable && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted">Outsourced to a vendor</span>
                          <Toggle on={!!s.vendor} onChange={(v) => setRoute(route.map((x) => (x.p === m.p ? { ...x, vendor: v ? "Partner unit" : undefined, vendorDays: v ? 2 : undefined } : x)))} />
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </Section>

        <Section title="Preview">
          <Card><MiniFlow route={route} /></Card>
        </Section>

        <Section title="Checks">
          <Card className="space-y-1.5">
            {checks.map((c) => (
              <div key={c.label} className={`flex gap-2 text-xs ${c.ok ? "text-ok" : "font-semibold text-err"}`}><span>{c.ok ? "✓" : "✕"}</span><span>{c.label}</span></div>
            ))}
          </Card>
        </Section>

        {!draft && changed && (
          <Section title="Why change?">
            <Choice options={["Buyer added a process", "Buyer removed a process", "Moving to a vendor", "Rebalancing time"]} value={reason} onChange={setReason} />
          </Section>
        )}

        <div className="mt-6 space-y-2">
          {draft ? (
            <>
              <Button size="lg" className="w-full" disabled={!allOk} onClick={() => save(true)}>Publish route & start</Button>
              <Button kind="ghost" className="w-full" onClick={() => save(false)}>Save draft</Button>
            </>
          ) : (
            <Button size="lg" className="w-full" disabled={!allOk || !changed || !reason} onClick={() => save(false)}>
              {request ? "Send for supervisor approval" : "Apply new plan"}
            </Button>
          )}
          <Notice r={r} />
        </div>
      </div>
    </>
  );
}

function MiniFlow({ route }) {
  const rows = levels(route);
  if (!route.length) return <p className="text-xs text-muted">Turn on processes above.</p>;
  if (!rows) return <p className="text-xs font-semibold text-err">Can&apos;t draw: steps wait for each other in a loop.</p>;
  return (
    <div className="flex flex-col items-center gap-1">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col items-center">
          {i > 0 && <span className="text-xs leading-none text-muted">↓</span>}
          <div className="flex gap-1.5">
            {row.map((p) => (
              <span key={p} className={`rounded-full px-3 py-1 text-xs font-semibold ${stepOf(route, p).vendor ? "bg-vendor-soft text-vendor" : MANDATORY.includes(p) ? "bg-brand-soft text-brand" : "bg-warn-soft text-warn"}`}>{p}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
