"use client";
import Link from "next/link";
import { Card, Page, Table } from "@/components/ui";

const FLOW = [
  ["Planner", "Creates the order, picks the route (mandatory / optional, depends on, SAM). Checks pass → publish → Active.", "/orders"],
  ["Supervisor / cutting", "Creates a batch. System generates numbers YYMM-Bbbb-GGGG and prints QR labels.", "/batches"],
  ["Operator", "Picks the process once per shift, scans each garment. 5 checks → green saved / red blocked.", "/scan"],
  ["Inspector", "Defect found → send back to an earlier step (later steps re-open) or scrap.", "/rework"],
  ["Supervisor", "Reverses wrong scans with a reason, approves requests. Nothing is deleted.", "/log"],
  ["Supervisor", "Outsourced step: Sent out → Received back. Gaps and vendor delays shown.", "/outsource"],
  ["Supervisor", "End of shift: system list vs floor count → late scans or missing.", "/reconcile"],
  ["Supervisor", "Ready to ship → shipment (partial allowed). All shipped/scrapped → order Complete.", "/shipping"],
  ["Owner", "Dashboard: progress per step, merge gate, bottleneck, rework, time estimate vs ship date.", "/dashboard"],
];

// Appendix 8.1 plus the extra cases from the flow tables, each with where to try it.
const EDGES = [
  [1, "Circular dependency in route", "Order C → set Embroidery depends on Sewing", "/orders"],
  [2, "Dead-end step", "Order C → untick Printing from Sewing's depends-on", "/orders"],
  [3, "Route change after production starts", "Order B as Priya → change → request; Rahul approves", "/orders"],
  [4, "Buyer spec change (add Washing)", "Order B as Rahul → tick Washing → garments past it are flagged", "/orders"],
  [5, "Parallel steps at different speeds", "Dashboard Order A: merge gate Embroidery vs Printing", "/dashboard"],
  [6, "Skipped process scanned by mistake", "Scan: Order B garment at Washing (as Rahul)", "/scan"],
  [7, "Garment out of order", "Scan 2610-B014-0412 at Sewing → blocked; Rahul can override", "/scan"],
  [8, "Same number printed twice", "Numbers only from system; reprint keeps the same number", "/batches"],
  [9, "Cut quantity differs from order", "Batch screen → quantity adjustment (planner requests)", "/batches"],
  [10, "Label lost / unreadable / burned", "Scan → type the number; batch list search; reprint", "/batches"],
  [11, "Duplicate scan", "Scan 2610-B014-0237 at Sewing", "/scan"],
  [12, "Wrong process selected", "As Kiran pick Washing (not assigned)", "/scan"],
  [13, "Forgotten scan", "Reconciliation → late scan", "/reconcile"],
  [14, "No network", "Scan → go offline → scans queue → sync re-checks", "/scan"],
  [15, "Phone dies / app crashes", "Each scan saved on confirm; queue is kept after refresh", "/scan"],
  [16, "Two operators scan at once", "Offline → queue a garment → 'another phone' → sync = duplicate", "/scan"],
  [17, "Late entry / wrong phone clock", "Scan → set phone clock wrong → log shows clock flag", "/scan"],
  [18, "Bulk scan misuse", "Scan as Rahul → bulk entry with count confirmation, max 300", "/scan"],
  [19, "Rework, several steps back", "Send a packed garment back to Sewing", "/rework"],
  [20, "Scrapped garment", "Rework screen as Rahul → scrap; dashboard shortfall", "/rework"],
  [21, "Rework after Packing", "Pick a 'Ready to ship' garment → rework", "/rework"],
  [22, "Unauthorised correction", "Log as Kiran → reverse becomes a request", "/log"],
  [23, "Reversal breaks later steps", "Log as Rahul → reverse Cutting of a sewn garment", "/log"],
  [24, "Partial shipment", "Shipping → ship 50 of the ready garments", "/shipping"],
  [25, "Order on hold / cancelled / rush", "Route config → Hold → scans blocked; Rush sorts first", "/orders"],
  [26, "Outsourced quantity gap", "Outsourcing Order A Washing: sent vs received by number", "/outsource"],
  [27, "Dashboard differs from floor", "Reconciliation → enter physical count", "/reconcile"],
  ["+", "Repeated rework (3+ flagged)", "Dashboard alert; journey of the flagged garment", "/dashboard"],
  ["+", "Garment scanned forward while in rework", "Scan a garment 'In rework' at Finishing", "/scan"],
  ["+", "Defect at one parallel step only", "Rework → send back to Printing: Embroidery stays done", "/rework"],
  ["+", "Order confirmed but route not set", "Order C is Draft → no batch, no scans", "/batches"],
  ["+", "Mandatory step removed", "Cutting, Sewing, Finishing, Packing cannot be unticked", "/orders"],
  ["+", "Received back without sent out", "Outsourcing → receive a garment never sent", "/outsource"],
  ["+", "Vendor delay", "Dashboard / outsourcing: at vendor longer than expected days", "/outsource"],
  ["+", "Batch lost between processes", "Dashboard Order B: batch B019 no scan for 2h+", "/dashboard"],
  ["+", "Shipment includes a garment not ready", "Shipping → add an In-progress garment number", "/shipping"],
  ["+", "Shortfall against order quantity", "Dashboard: 'short by N' after scraps", "/dashboard"],
  ["+", "New process added by admin", "Route config → add process (e.g. Quality check)", "/orders"],
];

const TIME = [
  ["Required time (SAM)", "Minutes per garment for each step, set per order in route config"],
  ["Estimate", "Remaining × SAM ÷ (operators × 480 × efficiency) → days left, est. finish vs ship date"],
  ["Actual time", "Time between steps per garment (journey) and average per step (dashboard)"],
  ["Efficiency %", "Pieces today × SAM ÷ minutes worked by the step's operators"],
  ["Hourly output", "Target per hour vs actual last hour, per step"],
  ["DHU / rework rate", "Reworks found at a step per 100 done"],
  ["Delay alert", "Estimated finish later than ship date"],
];

export default function Home() {
  return (
    <Page title="How the flow works" sub="Every screen reads and writes the same data through one rules engine (src/lib/rules.js). Status is always calculated from scans.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Flow (who does what)">
          <ol className="space-y-1 text-sm">
            {FLOW.map(([who, what, href], i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 shrink-0 font-bold text-slate-400">{i + 1}</span>
                <span><b>{who}:</b> {what} <Link href={href} className="text-teal-700 underline">open</Link></span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Time features">
          <Table cols={["Feature", "How"]} rows={TIME} />
          <p className="mt-2 text-xs text-slate-500">
            Future: operator incentive report, WIP limit alerts, machine downtime log, on-time delivery %, delay prediction from scan history.
          </p>
        </Card>
      </div>
      <Card title="Edge case checklist: where to try each one" className="mt-4">
        <Table
          cols={["#", "Edge case", "How to try", ""]}
          rows={EDGES.map(([n, e, how, href]) => [n, e, how, <Link key={n + e} href={href} className="text-teal-700 underline">open</Link>])}
        />
        <p className="mt-2 text-xs text-slate-500">Use the &quot;Acting as&quot; switch in the header to see each role&apos;s permissions (3.5). &quot;Reset demo data&quot; restores the sample.</p>
      </Card>
    </Page>
  );
}
