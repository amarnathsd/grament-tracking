"use client";
// Shared reads for the app screens. All numbers come from the central rules (orderStats) and store.
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { fmtDate, orderStats } from "@/lib/rules";

export function useOrderData(orderId) {
  const { state, ctx } = useStore();
  return useMemo(() => {
    const order = state.orders[orderId];
    const list = ctx.garmentsOf(orderId).map((g) => ({ g, gs: ctx.gs(g.no) }));
    const set = new Set(list.map((x) => x.g.no));
    const evs = state.events.filter((e) => set.has(e.g));
    const S = orderStats(order, list, evs, ctx.now);
    const by = (k) => S.by[k] || 0;
    return { order, list, S, by, status: ctx.orderStatus(orderId) };
  }, [state, ctx, orderId]);
}

export function sortedOrderIds(state) {
  const rank = (o) => (o.priority === "Rush" ? 0 : 1) + (o.status === "Draft" ? 2 : 0);
  return Object.keys(state.orders).sort((a, b) => rank(state.orders[a]) - rank(state.orders[b]));
}

// Alerts for one order. Each alert can point to the place in the flow where it is fixed.
export function orderAlerts({ order, S, by, status }) {
  const a = [];
  const add = (tone, title, text, go) => a.push({ tone, title, text, go, orderId: order.id });
  if (status === "On hold" || status === "Cancelled") add("warn", `${order.name} is ${status}`, "Scans are blocked for this order.");
  if (S.lateDays > 0) add("err", `${order.name} may ship late`, `Est. ${fmtDate(S.estFinish)} vs ship ${fmtDate(order.shipDate)} (${Math.ceil(S.lateDays)}d late).`, { step: [...S.steps].sort((x, y) => y.days - x.days)[0].p });
  const bott = S.steps.find((s) => s.bottleneck);
  if (bott) add("warn", `Bottleneck at ${bott.p}`, `${bott.ready} garments waiting.`, { step: bott.p });
  S.gates.forEach((gt) => gt.counts.some((c) => c.done !== gt.lag.done) &&
    add("warn", `Merge gate before ${gt.p}`, `${gt.counts.map((c) => `${c.p} ${c.done}`).join(" · ")}. Only ${gt.both} can go on.`, { step: gt.lag.p }));
  if (by("In rework")) add("warn", `${by("In rework")} in rework`, Object.entries(S.reworkBack).map(([k, v]) => `${v} back to ${k}`).join(", "), { step: Object.keys(S.reworkBack)[0] });
  if (S.repeatRework.length) add("err", "Repeated rework", `${S.repeatRework.join(", ")} reworked 3+ times.`, { garment: S.repeatRework[0] });
  S.idleBatches.forEach((b) => add("warn", `Batch ${b.b} is quiet`, `${b.wip} in progress, no scan for ${b.hours.toFixed(1)} h.`));
  if (S.vendorLate) add("vendor", "Vendor is late", `${S.vendorLate} garments past the expected days.`, { step: S.steps.find((s) => s.vendor)?.p });
  if (by("Missing")) add("err", `${by("Missing")} missing`, "Marked missing at count check.");
  if (S.shortfall > 0) add("err", `Short by ${S.shortfall}`, `Against buyer quantity ${order.qty}.`);
  if (order.flagged?.length) add("warn", "Plan changed", `${order.flagged.length} garments were already past the new step.`);
  return a;
}
