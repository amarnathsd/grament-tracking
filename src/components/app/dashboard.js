"use client";
// Dashboard: where the time goes (required vs actual), analytics per process, and ideas to optimise.
import { useState } from "react";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/rules";
import { Top, useNav } from "./App";
import { useOrderData, sortedOrderIds } from "./hooks";
import { Card, Chip, Choice, Icon, Progress, Section, Svg } from "./kit";

// Colour follows the process (fixed by its place in the process master), never its rank.
function useColor() {
  const { state } = useStore();
  return (p) => {
    const i = state.processes.findIndex((m) => m.p === p);
    return i >= 0 && i < 8 ? `var(--color-series-${i + 1})` : "var(--color-muted)";
  };
}

const hrs = (h) => (h == null ? "-" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

export function DashboardScreen() {
  const { state, ctx } = useStore();
  const ids = sortedOrderIds(state).filter((id) => state.orders[id].route.length);
  const [orderId, setOrderId] = useState(ids.find((id) => ctx.orderStatus(id) === "Active") || ids[0]);
  return (
    <>
      <Top title="Dashboard" sub="Time, analytics and ideas per process" back={false} />
      <div className="px-4">
        <AtRisk ids={ids} orderId={orderId} setOrderId={setOrderId} />
        <OrderDashboard key={orderId} orderId={orderId} />
      </div>
    </>
  );
}

function AtRisk({ ids, orderId, setOrderId }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {ids.map((id) => <OrderPill key={id} id={id} active={id === orderId} onClick={() => setOrderId(id)} />)}
    </div>
  );
}

function OrderPill({ id, active, onClick }) {
  const { order, S } = useOrderData(id);
  return (
    <button onClick={onClick} className={`shrink-0 rounded-2xl px-4 py-2 text-left ${active ? "bg-ink text-white" : "bg-surface"}`}>
      <div className="text-sm font-bold">{order.name}</div>
      <div className={`text-[11px] ${active ? "text-white/70" : S.lateDays > 0 ? "text-err" : "text-ok"}`}>
        {S.lateDays > 0 ? `${Math.ceil(S.lateDays)}d late` : "On time"} · ship {fmtDate(order.shipDate)}
      </div>
    </button>
  );
}

function OrderDashboard({ orderId }) {
  const color = useColor();
  const { order, S, by } = useOrderData(orderId);
  const [view, setView] = useState("required");
  const [active, setActive] = useState(null);
  const steps = S.steps;

  // required = work content still in the order (SAM × all garments); actual = average wait + work per garment
  const parts = steps.map((s) => ({
    key: s.p,
    color: color(s.p),
    value: view === "required" ? (s.sam * S.total) / 60 : s.leadH ?? 0,
    sub: view === "required" ? `${s.sam} min/pc` : s.leadH == null ? "first step" : "avg per garment",
  })).filter((x) => x.value > 0);
  const total = parts.reduce((a, x) => a + x.value, 0);
  const totalSam = steps.reduce((a, s) => a + s.sam, 0);
  const totalLead = steps.reduce((a, s) => a + (s.leadH || 0), 0);
  const ideas = buildIdeas(order, S);
  const act = parts.find((x) => x.key === active);

  return (
    <>
      <Card className="mt-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Big label="Est. finish" value={fmtDate(S.estFinish)} tone={S.lateDays > 0 ? "text-err" : "text-ok"} />
          <Big label="Work per garment" value={`${totalSam.toFixed(1)} min`} />
          <Big label="Time in factory" value={hrs(totalLead)} tone="text-warn" />
        </div>
        <p className="mt-3 rounded-2xl bg-bg px-3 py-2 text-[11px] text-muted">
          A garment needs <b className="text-ink">{totalSam.toFixed(0)} min</b> of work but spends about <b className="text-ink">{hrs(totalLead)}</b> moving through the factory.
          {totalLead > 0 && <> Only <b className="text-ink">{((totalSam / 60 / totalLead) * 100).toFixed(1)}%</b> of that time is work; the rest is waiting.</>}
        </p>
      </Card>

      <Section title="Where the time goes">
        <Card>
          <Choice options={[{ value: "required", label: "Required (SAM × pieces)" }, { value: "actual", label: "Actual (wait + work)" }]} value={view} onChange={(v) => { setView(v); setActive(null); }} />
          <div className="mt-4 flex justify-center">
            <Donut parts={parts} total={total} active={active} setActive={setActive}
              center={act ? { big: hrs(act.value), small: act.key } : { big: hrs(total), small: view === "required" ? "total work" : "door to door" }} />
          </div>
          <ul className="mt-4 divide-y divide-line">
            {parts.map((x) => (
              <li key={x.key}>
                <button onClick={() => setActive(active === x.key ? null : x.key)} onMouseEnter={() => setActive(x.key)}
                  className={`flex w-full items-center gap-3 py-2 text-left ${active && active !== x.key ? "opacity-40" : ""}`}>
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: x.color }} />
                  <span className="flex-1 text-sm font-semibold">{x.key}<span className="ml-1 text-[11px] font-normal text-muted">{x.sub}</span></span>
                  <span className="text-sm font-bold">{hrs(x.value)}</span>
                  <span className="w-10 text-right text-xs text-muted">{Math.round((x.value / total) * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            {view === "required" ? "Hours of work the whole order needs at each step. The biggest slice needs the most people." : "Average time from the earlier step finishing to this step finishing. A big slice with small SAM means garments sit waiting."}
          </p>
        </Card>
      </Section>

      <Section title={`Ideas to speed up ${order.name}`}>
        <div className="space-y-2">
          {ideas.length === 0 && <Card><p className="text-xs text-muted">No issues found. Flow is balanced.</p></Card>}
          {ideas.map((x, i) => (
            <Card key={i} className="!p-3">
              <div className="flex gap-3">
                <span className="text-xl">{x.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{x.title}</div>
                  <div className="text-xs text-muted">{x.text}</div>
                  {x.gain && <Chip tone="ok" className="mt-1.5">{x.gain}</Chip>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Process analytics" action={<span className="text-xs text-muted">tap to open</span>}>
        <div className="space-y-3">
          {steps.map((s) => <ProcessCard key={s.p} s={s} orderId={orderId} color={color(s.p)} total={S.total} />)}
        </div>
      </Section>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
        <Card className="!p-2"><div className="text-base font-bold text-warn">{by("In rework")}</div>in rework</Card>
        <Card className="!p-2"><div className="text-base font-bold">{S.idleBatches.length}</div>quiet batches</Card>
        <Card className="!p-2"><div className="text-base font-bold text-err">{S.shortfall > 0 ? S.shortfall : 0}</div>short</Card>
      </div>
    </>
  );
}

function Big({ label, value, tone = "" }) {
  return (
    <div>
      <div className={`text-base font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

// Donut with a 2px surface gap between slices; tap or hover a slice to read it.
function Donut({ parts, total, active, setActive, center, size = 200 }) {
  const R = 90, r = 58, c = 100;
  const pt = (rad, a) => [c + rad * Math.sin(a), c - rad * Math.cos(a)];
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((a, x) => a + (x.value / total) * Math.PI * 2, 0));
  const arcs = parts.map((x, i) => {
    const sweep = (x.value / total) * Math.PI * 2;
    const a0 = starts[i];
    const a1 = a0 + Math.min(sweep, Math.PI * 2 - 0.0001);
    const large = sweep > Math.PI ? 1 : 0;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
    const d = `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
    return { ...x, d };
  });
  return (
    <div className="relative" style={{ width: size, height: size }} onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Time split by process">
        {arcs.map((x) => (
          <path key={x.key} d={x.d} fill={x.color} stroke="var(--color-surface)" strokeWidth="2"
            className="cursor-pointer transition-opacity" opacity={active && active !== x.key ? 0.3 : 1}
            onMouseEnter={() => setActive(x.key)} onClick={() => setActive(active === x.key ? null : x.key)}>
            <title>{`${x.key}: ${hrs(x.value)} (${Math.round((x.value / total) * 100)}%)`}</title>
          </path>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-bold">{center.big}</div>
        <div className="text-[11px] text-muted">{center.small}</div>
      </div>
    </div>
  );
}

function ProcessCard({ s, orderId, color, total }) {
  const nav = useNav();
  const workMin = s.sam;
  const leadMin = s.leadH == null ? null : s.leadH * 60;
  const waitMin = leadMin == null ? 0 : Math.max(0, leadMin - workMin);
  const workPct = leadMin ? Math.max(2, (workMin / leadMin) * 100) : 100;
  const starved = s.eff != null && s.eff < 45 && s.ready < 20 && s.p !== "Cutting";
  const tag = s.vendor ? ["vendor", "Outsourced"] : s.bottleneck ? ["warn", "Bottleneck"] : starved ? ["muted", "Starved"] : s.eff != null && s.eff < 45 ? ["err", "Slow"] : ["ok", "Healthy"];
  const insight = s.vendor
    ? `${s.atVendor} at vendor. Vendor turnaround is ${hrs(s.leadH)} per garment.`
    : s.bottleneck ? `${s.ready} garments queue here. Adding operators here speeds the whole order.`
    : starved ? `Only ${s.ready} waiting. People here are idle because an earlier step is slow.`
    : s.eff != null && s.eff < 45 ? "Low output with work waiting: check method, machines or training."
    : "Output matches the plan.";

  return (
    <Card onClick={() => nav.push("step", { orderId, p: s.p })} className="!p-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
        <span className="flex-1 text-sm font-bold">{s.p}</span>
        <Chip tone={tag[0]}>{tag[1]}</Chip>
        <Svg d={Icon.chev} className="h-4 w-4 text-muted" />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        <Mini label="Done" value={`${Math.round((s.done / total) * 100)}%`} />
        <Mini label="Queue" value={s.ready} />
        <Mini label="Days left" value={s.days.toFixed(1)} />
        <Mini label="Rework/100" value={s.dhu.toFixed(1)} tone={s.dhu > 2 ? "text-err" : ""} />
      </div>

      {s.eff != null && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px]"><span className="text-muted">Efficiency (24h)</span><b>{s.eff}% <span className="font-normal text-muted">· target 55–70%</span></b></div>
          <Progress value={s.eff} max={100} tone={s.eff < 45 ? "err" : s.eff < 55 ? "warn" : "ok"} className="mt-1" />
          <div className="mt-1 text-[11px] text-muted">Output {s.lastHour}/h now · target {s.targetHour}/h · {s.ops} operators</div>
        </div>
      )}

      {leadMin != null && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px]"><span className="text-muted">Work vs waiting per garment</span><b>{hrs(s.leadH)}</b></div>
          <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full">
            <div className="h-full rounded-full" style={{ width: `${workPct}%`, background: color }} />
            <div className="h-full flex-1 rounded-full bg-line" />
          </div>
          <div className="mt-1 text-[11px] text-muted">work {s.vendor ? "at vendor" : `${workMin} min`} · waiting {hrs(waitMin / 60)}</div>
        </div>
      )}
      <p className="mt-2 text-xs">{insight}</p>
    </Card>
  );
}

function Mini({ label, value, tone = "" }) {
  return (
    <div className="rounded-xl bg-bg py-1.5">
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      <div className="text-[9px] text-muted">{label}</div>
    </div>
  );
}

// Optimisation ideas computed from the same numbers: rebalance people, fix the merge gate, rework, vendor, waiting.
function buildIdeas(order, S) {
  const ideas = [];
  const inHouse = S.steps.filter((s) => !s.vendor && s.p !== "Cutting");
  const slow = [...S.steps].sort((a, b) => b.days - a.days)[0];
  const donor = inHouse.filter((s) => s.p !== slow?.p && s.ops > 1 && s.eff != null && s.eff < 45 && s.ready < 50).sort((a, b) => a.eff - b.eff)[0];
  if (slow && !slow.vendor && donor) {
    const k = Math.min(2, donor.ops - 1);
    const newDays = (slow.days * slow.ops) / (slow.ops + k);
    ideas.push({
      icon: "👥", title: `Move ${k} operator${k > 1 ? "s" : ""} from ${donor.p} to ${slow.p}`,
      text: `${donor.p} is at ${donor.eff}% with only ${donor.ready} waiting. ${slow.p} is the slowest step (${slow.days.toFixed(1)} days left).`,
      gain: `${slow.p}: ${slow.days.toFixed(1)} → ${newDays.toFixed(1)} days`,
    });
  } else if (slow && !slow.vendor && S.lateDays > 0) {
    const need = Math.ceil((slow.days * slow.ops) / Math.max(0.5, slow.days - S.lateDays) - slow.ops);
    ideas.push({ icon: "➕", title: `Add ${need} operator${need > 1 ? "s" : ""} or overtime at ${slow.p}`, text: `${slow.p} needs ${slow.days.toFixed(1)} more days and sets the finish date.`, gain: "Ship on time" });
  }
  S.gates.forEach((g) => {
    const lagStep = S.steps.find((s) => s.p === g.lag.p);
    const gap = Math.max(...g.counts.map((c) => c.done)) - g.lag.done;
    if (gap > 20 && lagStep) {
      const days = (gap * lagStep.sam) / ((lagStep.ops || 1) * 480 * order.eff);
      const fast = (gap * lagStep.sam) / (((lagStep.ops || 1) + 1) * 480 * order.eff);
      ideas.push({ icon: "🔀", title: `${g.lag.p} is holding ${g.p}`, text: `${gap} garments have the other parallel step done and wait only for ${g.lag.p}.`, gain: `+1 at ${g.lag.p}: ${days.toFixed(1)} → ${fast.toFixed(1)} days to close the gap` });
    }
  });
  const rw = [...S.steps].sort((a, b) => b.dhu - a.dhu)[0];
  if (rw && rw.dhu > 1) ideas.push({ icon: "🧵", title: `Rework found at ${rw.p}: ${rw.dhu.toFixed(1)} per 100`, text: "Check stitching training, machine tension and the inline QC before this step." });
  const v = S.steps.find((s) => s.vendor);
  if (v && S.vendorLate) ideas.push({ icon: "🚚", title: `${S.vendorLate} garments late at ${v.vendor}`, text: `Turnaround is ${hrs(v.leadH)} vs ${v.vendorDays || 3} day(s) promised. Chase the vendor or split the lot.` });
  const waitiest = [...S.steps].filter((s) => s.leadH && !s.vendor).sort((a, b) => b.leadH * 60 / b.sam - a.leadH * 60 / a.sam)[0];
  if (waitiest) ideas.push({ icon: "⏳", title: `Garments wait ${hrs(waitiest.leadH)} before ${waitiest.p} finishes them`, text: `The work itself is ${waitiest.sam} min. Smaller bundles and moving them sooner cut this waiting.` });
  S.idleBatches.forEach((b) => ideas.push({ icon: "📦", title: `Batch ${b.b} has not moved for ${b.hours.toFixed(1)} h`, text: "Check whether the bundle is lost or stuck between processes." }));
  return ideas;
}
