"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can, fmtTime, normalizeNo } from "@/lib/rules";
import { Banner, Btn, Card, Edge, Field, Input, Page, Pill, Result, Select, Stat, Table } from "@/components/ui";

export default function ShippingPage() {
  const { state, ctx, api, user } = useStore();
  const ids = Object.keys(state.orders).filter((id) => state.orders[id].route.length);
  const [orderId, setOrderId] = useState("B-2610-02");
  const [count, setCount] = useState(50);
  const [nos, setNos] = useState("");
  const [res, setRes] = useState(null);
  const order = state.orders[orderId];
  const list = useMemo(() => ctx.garmentsOf(orderId).map((g) => ({ g, gs: ctx.gs(g.no) })), [ctx, orderId]);
  const ready = list.filter((x) => x.gs.status === "Ready to ship");
  const shipped = list.filter((x) => x.gs.status === "Shipped").length;
  const scrapped = list.filter((x) => x.gs.status === "Scrapped").length;
  const remaining = list.length - shipped - scrapped;
  const status = ctx.orderStatus(orderId);

  return (
    <Page title="Screen 10 · Completion and shipping" sub="A garment is Ready to ship when every step in its own route is done. Orders complete when every garment is shipped or scrapped." rules="R7, R13, 4.7">
      <Field label="Order" className="max-w-sm">
        <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} options={ids.map((id) => ({ value: id, label: `${state.orders[id].name} · ${state.orders[id].style}` }))} />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="Order quantity" value={order.qty} />
        <Stat label="Ready to ship" value={ready.length} tone="green" />
        <Stat label="Shipped" value={shipped} tone="green" />
        <Stat label="Remaining (not shipped)" value={remaining} />
        <Stat label="Scrapped" value={scrapped} tone="red" sub={order.qty - (list.length - scrapped) > 0 ? `short by ${order.qty - (list.length - scrapped)}` : ""} />
        <Stat label="Order status" value={status} tone={status === "Complete" ? "green" : "slate"} />
      </div>
      {!can(user, "ship") && <Banner kind="warn" className="mt-3">Only a supervisor creates shipments. Switch to Rahul.</Banner>}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Card n={1} title="Create shipment">
          <div className="flex items-end gap-2">
            <Field label="Add ready garments by count"><Input type="number" value={count} onChange={(e) => setCount(e.target.value)} className="w-24" /></Field>
            <Btn kind="primary" disabled={!ready.length} onClick={() => setRes(api.ship({ orderId, nos: ready.slice(0, Number(count)).map((x) => x.g.no) }))}>
              Ship {Math.min(Number(count), ready.length)}
            </Btn>
          </div>
          <Field label="Or scan / type garment numbers (comma separated)" className="mt-3">
            <Input value={nos} onChange={(e) => setNos(e.target.value)} className="font-mono" placeholder={list.find((x) => x.gs.status === "In progress")?.g.no} />
          </Field>
          <Btn className="mt-2" onClick={() => setRes(api.ship({ orderId, nos: nos.split(/[\s,]+/).map(normalizeNo).filter(Boolean) }))}>Ship typed numbers</Btn>
          <Result r={res} />
          <Edge id={24}>Partial shipment: ship 50 of the ready garments. The order shows shipped and remaining.</Edge>
          <Edge>Shipment includes a garment not ready: type an In-progress number (placeholder). It is blocked with the missing step.</Edge>
          <Edge>Packing scanned but an earlier step missing: blocked by the dependency check on the scan screen (supervisor override with reason).</Edge>
        </Card>
        <Card n={2} title="Shipments">
          <Table cols={["Shipment", "Order", "Date", "Garments", "By"]} rows={[...state.shipments].reverse().map((s) => [s.id, state.orders[s.order].name, fmtTime(s.ts), s.garments.length, ctx.user(s.by)?.name])} />
          <p className="mt-2 text-xs text-slate-500">When every garment is shipped or scrapped the order becomes <Pill>Complete</Pill> and scans are blocked.</p>
        </Card>
      </div>
    </Page>
  );
}
