"use client";
// Alerts tab (what needs attention + approvals) and Me tab (role, phone, demo controls).
import Link from "next/link";
import { useStore } from "@/lib/store";
import { can, fmtTime, orderStats } from "@/lib/rules";
import { Top } from "./App";
import { AlertRow } from "./screens";
import { orderAlerts, sortedOrderIds } from "./hooks";
import { Button, Card, Chip, Section } from "./kit";

export function AlertsScreen() {
  const { state, ctx, api, user } = useStore();
  const open = state.requests.filter((r) => r.status === "Open");
  const alerts = sortedOrderIds(state).filter((id) => state.orders[id].route.length).flatMap((id) => {
    const order = state.orders[id];
    const list = ctx.garmentsOf(id).map((g) => ({ g, gs: ctx.gs(g.no) }));
    const set = new Set(list.map((x) => x.g.no));
    const S = orderStats(order, list, state.events.filter((e) => set.has(e.g)), ctx.now);
    return orderAlerts({ order, S, by: (k) => S.by[k] || 0, status: ctx.orderStatus(id) }).map((a) => ({ ...a, title: `${order.name} · ${a.title}` }));
  });

  return (
    <>
      <Top title="Alerts" sub={`${alerts.length} things need attention`} back={false} />
      <div className="px-4">
        <Section title={`Waiting for approval (${open.length})`}>
          {open.length === 0 && <Card><p className="text-xs text-muted">Nothing waiting.</p></Card>}
          <div className="space-y-2">
            {open.map((r) => (
              <Card key={r.id} className="!p-3">
                <div className="flex items-center justify-between text-[11px] text-muted"><span>{ctx.user(r.by)?.name} asked</span><span>{fmtTime(r.ts)}</span></div>
                <div className="mt-1 text-sm font-semibold">{r.text}</div>
                {can(user, "override") ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button kind="ghost" size="sm" onClick={() => api.decide(r.id, false)}>Reject</Button>
                    <Button size="sm" onClick={() => api.decide(r.id, true)}>Approve</Button>
                  </div>
                ) : <p className="mt-1 text-[11px] text-muted">A supervisor decides.</p>}
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Production">
          <div className="space-y-2">{alerts.map((a, i) => <AlertRow key={i} a={a} />)}</div>
        </Section>
      </div>
    </>
  );
}

const ROLE_TEXT = {
  planner: "Sets up orders and routes. Plan changes go to a supervisor.",
  operator: "Scans garments at assigned processes.",
  supervisor: "Fixes, approves, overrides, ships, counts.",
  owner: "Watches progress. Read-only.",
};

export function MeScreen() {
  const { state, api, user } = useStore();
  return (
    <>
      <Top title="Me" sub="Switch role to see each person's view" back={false} />
      <div className="px-4">
        <Section title="Who is using the phone">
          <div className="space-y-2">
            {state.users.map((u) => (
              <Card key={u.id} onClick={() => api.settings({ userId: u.id })} className={`!p-3 ${u.id === user.id ? "ring-2 ring-brand" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${u.id === user.id ? "bg-brand text-white" : "bg-bg text-ink"}`}>{u.name[0]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-bold">{u.name} <Chip tone="brand">{u.role}</Chip></div>
                    <div className="truncate text-[11px] text-muted">{u.role === "operator" ? `Process: ${u.procs.join(", ")}` : ROLE_TEXT[u.role]}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Demo">
          <Card className="space-y-2">
            <Button kind="ghost" className="w-full" onClick={() => confirm("Reset all demo data to the starting sample?") && api.reset()}>Reset demo data</Button>
            <Link href="/home" className="block text-center text-xs font-semibold text-brand underline">Detailed wireframes & edge case list</Link>
          </Card>
        </Section>
      </div>
    </>
  );
}
