"use client";
// Main flow: Home (orders) → Order (journey) → Step (work at one process).
import { useStore } from "@/lib/store";
import { can, fmtDate, levels, perm, stepOf } from "@/lib/rules";
import { Top, useNav } from "./App";
import { useOrderData, orderAlerts, sortedOrderIds } from "./hooks";
import { Button, Card, Chip, Icon, Progress, Ring, Section, Stat, StatusChip, Svg } from "./kit";

// ---------------- Home ----------------

export function Home() {
  const { state, ctx, user } = useStore();
  const nav = useNav();
  const startOfDay = new Date(ctx.now).setHours(0, 0, 0, 0);
  const today = state.events.filter((e) => e.ok && e.t === "complete" && e.ts >= startOfDay).length;
  return (
    <div className="px-4">
      <div className="flex items-center gap-3 pt-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-base font-bold text-white">{user.name[0]}</div>
        <div className="flex-1">
          <p className="text-xs text-muted">{new Date(ctx.now).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</p>
          <h1 className="text-xl font-bold">Hi {user.name}</h1>
        </div>
        <button onClick={() => nav.go("me")}><Chip tone="brand">{user.role}</Chip></button>
      </div>

      {user.role === "operator" && (
        <Card onClick={() => nav.go("scan")} className="mt-5 !bg-brand text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Svg d={Icon.scan} className="h-7 w-7" /></div>
            <div className="flex-1">
              <div className="text-base font-bold">Start scanning</div>
              <div className="text-xs text-white/80">Your process: {user.procs.join(", ")}</div>
            </div>
            <Svg d={Icon.chev} />
          </div>
        </Card>
      )}

      <div className="mt-5 flex gap-2">
        <Stat label="Scans today" value={today} tone="brand" />
        <Stat label="Orders active" value={Object.keys(state.orders).filter((id) => ctx.orderStatus(id) === "Active").length} />
        <Stat label="Need approval" value={state.requests.filter((r) => r.status === "Open").length} tone="warn" />
      </div>

      <Section title="Orders">
        <div className="space-y-3">
          {sortedOrderIds(state).map((id) => <OrderCard key={id} orderId={id} />)}
        </div>
      </Section>
    </div>
  );
}

function OrderCard({ orderId }) {
  const nav = useNav();
  const { order, S, by, status, list } = useOrderData(orderId);
  const out = by("Ready to ship") + by("Shipped");
  if (status === "Draft") {
    return (
      <Card onClick={() => nav.push("order", { orderId })} className="border-2 border-dashed border-line !shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">{order.id}</div>
            <div className="text-base font-bold">{order.name} · {order.style}</div>
            <div className="text-xs text-muted">{order.buyer} · {order.qty} pcs</div>
          </div>
          <StatusChip s="Draft" />
        </div>
        <div className="mt-3 text-sm font-semibold text-brand">Set up the route to start →</div>
      </Card>
    );
  }
  return (
    <Card onClick={() => nav.push("order", { orderId })}>
      <div className="flex items-start gap-3">
        <Ring value={out} max={order.qty} size={58} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-bold">{order.name}</span>
            {order.priority === "Rush" && <Chip tone="err">Rush</Chip>}
            {status !== "Active" && <StatusChip s={status} />}
          </div>
          <div className="truncate text-xs text-muted">{order.style} · {order.buyer} · {order.qty} pcs</div>
          <div className="mt-2 flex gap-1">
            {S.steps.map((s) => (
              <div key={s.p} title={s.p} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div className={`h-full ${s.vendor ? "bg-vendor" : s.bottleneck ? "bg-warn" : "bg-brand"}`} style={{ width: `${(s.done / Math.max(1, S.total)) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted">{out} of {order.qty} ready · {list.length} cut</span>
        <Chip tone={S.lateDays > 0 ? "err" : "ok"}>{S.lateDays > 0 ? `Late ${Math.ceil(S.lateDays)}d` : "On time"} · ship {fmtDate(order.shipDate)}</Chip>
      </div>
    </Card>
  );
}

// ---------------- Order: the journey ----------------

export function OrderScreen({ orderId }) {
  const nav = useNav();
  const { user } = useStore();
  const data = useOrderData(orderId);
  const { order, S, by, status } = data;
  const out = by("Ready to ship") + by("Shipped");
  const alerts = orderAlerts(data);
  const rows = levels(order.route) || [];
  const canEdit = perm(user, "changeRoute") !== "no";

  return (
    <>
      <Top title={order.name} sub={`${order.id} · ${order.style} · ${order.buyer}`} right={order.priority === "Rush" ? <Chip tone="err">Rush</Chip> : null} />
      <div className="px-4">
        {status === "Draft" ? (
          <Card className="mt-2 text-center">
            <div className="text-4xl">🧵</div>
            <h2 className="mt-2 text-base font-bold">No route yet</h2>
            <p className="mt-1 text-sm text-muted">Pick which processes {order.style} needs. Until the route is published, no labels can be printed and nothing can be scanned.</p>
            <Button className="mt-4 w-full" disabled={!canEdit} onClick={() => nav.push("route", { orderId })}>Set up route</Button>
            {!canEdit && <p className="mt-2 text-xs text-muted">Planner or supervisor only. Switch role in Me.</p>}
          </Card>
        ) : (
          <>
            <Card className="mt-2">
              <div className="flex items-center gap-4">
                <Ring value={out} max={order.qty} size={76} />
                <div className="flex-1">
                  <div className="text-2xl font-bold">{out}<span className="text-sm font-medium text-muted"> / {order.qty}</span></div>
                  <div className="text-xs text-muted">ready or shipped</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusChip s={status} />
                    <Chip tone={S.lateDays > 0 ? "err" : "ok"}>{S.lateDays > 0 ? `Late ${Math.ceil(S.lateDays)}d` : "On time"}</Chip>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-bg px-3 py-2"><span className="text-muted">Ship date</span><div className="font-bold">{fmtDate(order.shipDate)}</div></div>
                <div className="rounded-2xl bg-bg px-3 py-2"><span className="text-muted">Est. finish</span><div className={`font-bold ${S.lateDays > 0 ? "text-err" : "text-ok"}`}>{fmtDate(S.estFinish)}</div></div>
              </div>
            </Card>

            {/* breakpoints off the main flow */}
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {canEdit && <Button kind="ghost" size="sm" onClick={() => nav.push("route", { orderId })}>✎ Change plan</Button>}
              <Button kind="ghost" size="sm" onClick={() => nav.sheet("batch", { orderId })}>✂ Cut & label</Button>
              {by("Ready to ship") > 0 && <Button kind="ok" size="sm" onClick={() => nav.sheet("ship", { orderId })}>🚚 Ship {by("Ready to ship")}</Button>}
              {can(user, "orderStatus") && <Button kind="ghost" size="sm" onClick={() => nav.sheet("hold", { orderId })}>{status === "On hold" ? "▶ Release" : "⏸ Hold / cancel"}</Button>}
            </div>

            <Section title="Journey" action={<span className="text-xs text-muted">tap a step</span>}>
              <div className="relative">
                {rows.map((row, i) => {
                  const merge = row.length === 1 && stepOf(order.route, row[0]).deps.length > 1;
                  return (
                    <div key={i}>
                      {i > 0 && (
                        <div className="flex h-6 items-center justify-center">
                          {merge ? <Chip tone="brand">⬦ waits for both</Chip> : <div className="h-full w-0.5 bg-line" />}
                        </div>
                      )}
                      <div className={`grid gap-2 ${row.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {row.map((p) => <StepNode key={p} s={S.steps.find((x) => x.p === p)} live={S.total} onClick={() => nav.push("step", { orderId, p })} parallel={row.length > 1} />)}
                      </div>
                    </div>
                  );
                })}
                <div className="flex h-6 items-center justify-center"><div className="h-full w-0.5 bg-line" /></div>
                <Card onClick={by("Ready to ship") ? () => nav.sheet("ship", { orderId }) : undefined} className="!bg-ok-soft">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-ok">Ready to ship</div>
                      <div className="text-xs text-muted">{by("Shipped")} already shipped</div>
                    </div>
                    <div className="text-2xl font-bold text-ok">{by("Ready to ship")}</div>
                  </div>
                </Card>
              </div>
            </Section>

            <div className="mt-4 flex gap-2">
              <Stat label="In rework" value={by("In rework")} tone="warn" />
              <Stat label="At vendor" value={by("At vendor")} tone="vendor" />
              <Stat label="Scrapped" value={by("Scrapped")} tone="err" />
            </div>

            {alerts.length > 0 && (
              <Section title="Needs attention">
                <div className="space-y-2">
                  {alerts.map((a, i) => <AlertRow key={i} a={a} />)}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function StepNode({ s, live, onClick, parallel }) {
  const tone = s.vendor ? "vendor" : s.bottleneck ? "warn" : s.done >= live ? "ok" : "brand";
  return (
    <Card onClick={onClick} className={`!p-3 ${s.bottleneck ? "ring-2 ring-warn" : ""}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-sm font-bold">{s.p}</span>
        {s.done >= live ? <Chip tone="ok">✓</Chip> : s.vendor ? <Chip tone="vendor">vendor</Chip> : s.bottleneck ? <Chip tone="warn">slow</Chip> : null}
      </div>
      <Progress value={s.done} max={live} tone={tone} className="mt-2" />
      <div className={`mt-1.5 flex ${parallel ? "flex-col" : "justify-between"} text-[11px] text-muted`}>
        <span><b className="text-ink">{s.done}</b>/{live} done</span>
        <span>{s.atVendor ? `${s.atVendor} at vendor · ` : ""}{s.ready ? `${s.ready} waiting here` : s.p === "Cutting" ? "" : "nothing waiting"}</span>
      </div>
    </Card>
  );
}

export function AlertRow({ a }) {
  const nav = useNav();
  const dot = { err: "bg-err", warn: "bg-warn", vendor: "bg-vendor", brand: "bg-brand" }[a.tone];
  const go = () => {
    if (a.go?.garment) nav.sheet("garment", { no: a.go.garment });
    else if (a.go?.step) nav.push("step", { orderId: a.orderId, p: a.go.step });
  };
  return (
    <Card onClick={a.go ? go : undefined} className="!p-3">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{a.title}</div>
          <div className="text-xs text-muted">{a.text}</div>
        </div>
        {a.go && <Svg d={Icon.chev} className="mt-1 h-4 w-4 text-muted" />}
      </div>
    </Card>
  );
}

// ---------------- Step: work at one process ----------------

export function StepScreen({ orderId, p }) {
  const nav = useNav();
  const { user } = useStore();
  const { order, S, list } = useOrderData(orderId);
  const s = S.steps.find((x) => x.p === p);
  if (!s) return <Top title={p} sub="Not in this order's route anymore" />;
  const flowing = (x) => x.gs.status === "In progress" || x.gs.status === "Not started" || x.gs.rework?.back === p;
  const ready = list.filter((x) => flowing(x) && x.gs.pending.includes(p));
  const reworkHere = list.filter((x) => x.gs.rework?.back === p);
  const atVendor = list.filter((x) => x.gs.atVendor?.p === p);
  const gate = S.gates.find((g) => g.p === p);

  return (
    <>
      <Top title={p} sub={`${order.name} · ${s.type}${s.vendor ? ` · outsourced to ${s.vendor}` : ""}`} />
      <div className="px-4">
        <div className="mt-2 flex gap-2">
          <Stat label="Done" value={s.done} tone="ok" />
          <Stat label="Waiting here" value={s.ready} tone="brand" />
          <Stat label="Not reached" value={s.waiting} />
        </div>

        {s.vendor ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button size="lg" kind="soft" onClick={() => nav.sheet("sendOut", { orderId, p })}>Send out</Button>
            <Button size="lg" onClick={() => nav.sheet("receive", { orderId, p })}>Receive back</Button>
          </div>
        ) : (
          <Button size="lg" className="mt-4 w-full" onClick={() => nav.push("scan", { p, fromStep: true })}>
            <Svg d={Icon.scan} className="h-6 w-6" /> Scan garments
          </Button>
        )}

        {gate && (
          <Card className="mt-4">
            <div className="text-sm font-bold">Merge gate</div>
            <p className="text-xs text-muted">A garment can start {p} only when all of these are done for it.</p>
            <div className="mt-2 space-y-2">
              {gate.counts.map((c) => (
                <div key={c.p}>
                  <div className="flex justify-between text-xs"><span>{c.p}</span><b>{c.done}</b></div>
                  <Progress value={c.done} max={S.total} tone={c.p === gate.lag.p ? "warn" : "brand"} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs"><b>{gate.both}</b> garments have both. {gate.lag.p} is holding the rest.</p>
          </Card>
        )}

        <Section title="Time">
          <Card>
            <div className="grid grid-cols-3 gap-y-3 text-center">
              <TimeCell label="Required (SAM)" value={`${s.sam} min`} />
              <TimeCell label={s.vendor ? "Vendor / day" : "Target / hour"} value={s.vendor ? s.vendorPerDay || "-" : s.targetHour} />
              <TimeCell label="Last hour" value={s.lastHour} />
              <TimeCell label="Efficiency 24h" value={s.eff == null ? "-" : `${s.eff}%`} tone={s.eff == null ? "" : s.eff < 45 ? "text-err" : s.eff >= 60 ? "text-ok" : "text-warn"} />
              <TimeCell label="Days left" value={s.days.toFixed(1)} />
              <TimeCell label="Avg wait + work" value={s.leadH == null ? "-" : `${s.leadH.toFixed(1)} h`} />
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Days left = {s.remaining} remaining × {s.sam} min ÷ ({s.ops || 1} operators × 480 min × {Math.round(order.eff * 100)}%).
              {s.eff != null && s.eff < 45 && s.ready < 20 ? " Low efficiency with little waiting means this step is starved by an earlier one." : ""}
            </p>
          </Card>
        </Section>

        {/* breakpoints */}
        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          {!s.vendor && p !== "Cutting" && <Button kind="ghost" size="sm" onClick={() => nav.sheet("count", { orderId, p })}>🧮 End-of-shift count</Button>}
          {can(user, "bulk") && !s.vendor && <Button kind="ghost" size="sm" onClick={() => nav.sheet("bulk", { p })}>☰ Bulk entry</Button>}
        </div>

        {reworkHere.length > 0 && <GarmentList title={`Back here for rework (${reworkHere.length})`} items={reworkHere} />}
        {atVendor.length > 0 && <GarmentList title={`At vendor (${atVendor.length})`} items={atVendor} />}
        <GarmentList title={`Waiting here (${ready.length})`} items={ready} empty={s.waiting ? `${s.waiting} garments still need an earlier step.` : "Nothing waiting."} />
      </div>
    </>
  );
}

function TimeCell({ label, value, tone = "" }) {
  return (
    <div>
      <div className={`text-base font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

export function GarmentList({ title, items, empty = "None", max = 15 }) {
  const nav = useNav();
  return (
    <Section title={title}>
      <Card className="!p-0">
        {items.length === 0 && <p className="p-4 text-xs text-muted">{empty}</p>}
        {items.slice(0, max).map(({ g, gs }) => (
          <button key={g.no} onClick={() => nav.sheet("garment", { no: g.no })} className="flex w-full items-center justify-between border-b border-line px-4 py-3 text-left last:border-0">
            <div>
              <div className="font-mono text-sm font-semibold">{g.no}</div>
              <div className="text-[11px] text-muted">Size {g.size} · done {gs.doneList.join(", ") || "nothing"}</div>
            </div>
            <StatusChip s={gs.status} />
          </button>
        ))}
        {items.length > max && <p className="px-4 py-2 text-[11px] text-muted">+{items.length - max} more</p>}
      </Card>
    </Section>
  );
}
