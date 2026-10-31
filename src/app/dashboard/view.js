"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { currentStep, fmtDate, fmtTime, normalizeNo, orderStats } from "@/lib/rules";
import { Bar, Btn, Card, Edge, Field, GLink, Input, Page, Pill, Select, Stat, Table } from "@/components/ui";

const STATUSES = ["All", "In progress", "Not started", "In rework", "At vendor", "Ready to ship", "Shipped", "Scrapped", "Missing"];

export default function DashboardPage() {
  const { state, ctx } = useStore();
  const router = useRouter();
  const ids = Object.keys(state.orders).filter((id) => state.orders[id].route.length)
    .sort((a, b) => (state.orders[b].priority === "Rush") - (state.orders[a].priority === "Rush"));
  const [orderId, setOrderId] = useState("A-2610-01");
  const [filter, setFilter] = useState("All");
  const [find, setFind] = useState("");
  const order = state.orders[orderId];
  const now = ctx.now;

  const list = useMemo(() => ctx.garmentsOf(orderId).map((g) => ({ g, gs: ctx.gs(g.no) })), [ctx, orderId]);
  const evs = useMemo(() => {
    const set = new Set(ctx.garmentsOf(orderId).map((g) => g.no));
    return state.events.filter((e) => set.has(e.g));
  }, [ctx, state.events, orderId]);
  const S = useMemo(() => orderStats(order, list, evs, now), [order, list, evs, now]);
  const by = (k) => S.by[k] || 0;
  const status = ctx.orderStatus(orderId);
  const bott = S.steps.find((s) => s.bottleneck);
  const openReq = state.requests.filter((r) => r.status === "Open").length;

  const alerts = [];
  if (status === "On hold" || status === "Cancelled") alerts.push(["red", `Order is ${status}: scans blocked, work in progress shown as on hold.`]);
  if (order.priority === "Rush") alerts.push(["red", "Rush order: shown first on lists."]);
  if (S.lateDays > 0) alerts.push(["red", `Estimated finish ${fmtDate(S.estFinish)} is ${Math.ceil(S.lateDays)} day(s) after ship date ${fmtDate(order.shipDate)}. Slowest step: ${[...S.steps].sort((a, b) => b.days - a.days)[0].p}.`]);
  if (bott) alerts.push(["amber", `${bott.p}: ${bott.ready} waiting, the biggest queue (bottleneck).`]);
  S.gates.forEach((gt) => gt.counts.length > 1 && gt.counts.some((c) => c.done !== gt.lag.done) &&
    alerts.push(["amber", `Merge gate before ${gt.p}: ${gt.counts.map((c) => `${c.p} ${c.done}`).join(" vs ")}. Only ${gt.both} have both, ${gt.lag.p} is holding it up.`]));
  if (by("In rework")) alerts.push(["amber", `${by("In rework")} garments in rework (${Object.entries(S.reworkBack).map(([k, v]) => `${v} back to ${k}`).join(", ")}).`]);
  if (S.repeatRework.length) alerts.push(["red", `Reworked ${3}+ times: ${S.repeatRework.join(", ")}`]);
  S.idleBatches.forEach((b) => alerts.push(["amber", `Batch ${b.b}: ${b.wip} in progress but no scan for ${b.hours.toFixed(1)} h. Check for a lost bundle.`]));
  if (S.vendorLate) alerts.push(["amber", `${S.vendorLate} garments at vendor longer than the expected days.`]);
  if (by("Missing")) alerts.push(["red", `${by("Missing")} garments marked missing at reconciliation.`]);
  if (S.shortfall > 0) alerts.push(["red", `Short by ${S.shortfall} against buyer quantity ${order.qty} (after ${by("Scrapped")} scrapped).`]);
  if (S.clockFlags) alerts.push(["slate", `${S.clockFlags} scans with phone clock far from server time.`]);
  if (order.flagged?.length) alerts.push(["amber", `${order.flagged.length} garments flagged by route change v${order.routeVersion}.`]);
  if (openReq) alerts.push(["slate", `${openReq} requests waiting for supervisor approval.`]);

  const shown = list.filter((x) => (filter === "All" || x.gs.status === filter) && (!find || x.g.no.includes(normalizeNo(find))));
  const parallelRows = new Set(S.steps.filter((s) => S.steps.some((o) => o.p !== s.p && o.deps.join() === s.deps.join() && s.deps.length)).map((s) => s.p));

  return (
    <Page title="Screen 4 · Production visibility dashboard" sub="Reads saved scans only. Writes nothing." rules="R7, R8">
      <Card n={1} title="Filters">
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Order">
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} options={ids.map((id) => ({ value: id, label: `${state.orders[id].name} · ${state.orders[id].style}${state.orders[id].priority === "Rush" ? " · RUSH" : ""}` }))} />
          </Field>
          <Field label="Status"><Select value={filter} onChange={(e) => setFilter(e.target.value)} options={STATUSES} /></Field>
          <Field label="Find garment number">
            <div className="flex gap-1">
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="2610-B014-0237" />
              <Btn onClick={() => ctx.garment(normalizeNo(find)) && router.push(`/journey?g=${normalizeNo(find)}`)}>Open</Btn>
            </div>
          </Field>
          <Field label="Order">
            <div className="text-xs">{order.buyer} · qty {order.qty} · ship {fmtDate(order.shipDate)} · <Pill>{status}</Pill> · route v{order.routeVersion}</div>
          </Field>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Stat label="Total garments" value={S.total} sub={`order qty ${order.qty}`} />
        <Stat label="In progress" value={by("In progress") + by("Not started")} />
        <Stat label="Ready to ship" value={by("Ready to ship")} tone="green" />
        <Stat label="Shipped" value={by("Shipped")} tone="green" />
        <Stat label="In rework" value={by("In rework")} tone="amber" />
        <Stat label="At vendor" value={by("At vendor")} tone="violet" />
        <Stat label="Scrapped" value={by("Scrapped")} tone="red" sub={S.shortfall > 0 ? `short by ${S.shortfall}` : ""} />
        <Stat label="Est. finish" value={fmtDate(S.estFinish)} tone={S.lateDays > 0 ? "red" : "green"} sub={S.lateDays > 0 ? `late ${Math.ceil(S.lateDays)}d` : `on time · ${S.finishDays.toFixed(1)}d left`} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card n={3} title="Progress by process (completed / required)" className="lg:col-span-2">
          <div className="space-y-1.5">
            {S.steps.map((s) => (
              <div key={s.p} className={`grid grid-cols-[100px_1fr_150px] items-center gap-2 text-sm ${parallelRows.has(s.p) ? "rounded bg-teal-50" : ""}`}>
                <span>{s.p}{parallelRows.has(s.p) && <span className="ml-1 text-[10px] text-teal-700">parallel</span>}</span>
                <Bar value={s.done} max={S.live} tone={s.bottleneck ? "amber" : s.vendor ? "violet" : "teal"} />
                <span className="text-xs">{s.done} / {S.live} {s.ready ? <span className="text-slate-500">· {s.ready} waiting</span> : ""}{s.atVendor ? <span className="text-violet-700"> · {s.atVendor} at vendor</span> : ""}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Teal = on track. Amber = bottleneck (most garments waiting). Violet = outsourced. Steps not in this order&apos;s route are not shown.</p>
          <Edge id={5}>Merge gate: Sewing needs both Embroidery and Printing for the same garment. If 900 have Embroidery and 700 have Printing, at most 700 can be sewn.</Edge>
        </Card>

        <Card n={4} title="Alerts">
          <ul className="space-y-1 text-xs">
            {alerts.length === 0 && <li className="text-slate-400">No alerts</li>}
            {alerts.map(([tone, text], i) => (
              <li key={i} className={{ red: "text-red-700", amber: "text-amber-700", slate: "text-slate-600" }[tone]}>• {text}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card n={5} title="Time: required vs actual, estimate, efficiency" className="mt-3">
        <Table
          cols={["Step", "SAM (min/pc)", "Operators", "Remaining", "Days left", "Target / hr", "Last hour", "Last 24h", "Efficiency (24h)", "Avg wait+work", "Rework / 100"]}
          rows={S.steps.map((s) => [
            s.p, s.sam, s.vendor ? `vendor` : s.ops, s.remaining, s.days.toFixed(1),
            s.targetHour ?? "-", s.lastHour, s.day,
            s.eff == null ? "-" : <span className={s.eff < 45 ? "text-red-700" : s.eff > 70 ? "text-green-700" : ""}>{s.eff}%</span>,
            s.leadH == null ? "-" : `${s.leadH.toFixed(1)} h`, s.dhu.toFixed(1),
          ])}
        />
        <p className="mt-1 text-xs text-slate-500">
          Days left = remaining × SAM ÷ (operators × 480 min × {Math.round(order.eff * 100)}% planned efficiency). Steps run at the same time, so the slowest step sets the finish date.
          Efficiency = pieces in 24h × SAM ÷ (operators × 480 min). Typical factories run 50–60%, good ones 70–80%. Low efficiency with few garments waiting means the step is starved by an earlier step, not slow. Avg wait+work = time from earlier step done to this step done.
        </p>
      </Card>

      <Card n={6} title={`Garment list (${shown.length})`} className="mt-3">
        <Table max cols={["Garment number", "Batch", "Current step", "Status", "Last scan", "Rework", "Open journey"]}
          rows={shown.slice(0, 100).map(({ g, gs }) => [
            <GLink key={g.no} no={g.no} />, g.batch, currentStep(gs),
            <Pill key="s">{gs.status}</Pill>, gs.last ? `${fmtTime(gs.last.ts)} ${ctx.user(gs.last.u)?.name}` : "-",
            gs.reworkCount || "", <GLink key="j" no={g.no} />,
          ])} />
        {shown.length > 100 && <p className="mt-1 text-xs text-slate-400">Showing 100 of {shown.length}. Use the status filter or search.</p>}
      </Card>
    </Page>
  );
}
