// Sample data. Generated the same way every time, relative to "now", so the demo always looks live.
import { DAY, HOUR, MIN } from "./rules";

export const YYMM = "2610";

// Process master (A3). seq decides where a step sits; same seq = can run in parallel.
// sam = Standard Allowed Minutes per garment (suggested; each order can change it).
export const PROCESSES = [
  { p: "Cutting", seq: 1, mandatory: true, outsourceable: false, active: true, sam: 1.0 },
  { p: "Embroidery", seq: 2, mandatory: false, outsourceable: true, active: true, sam: 3.5 },
  { p: "Printing", seq: 2, mandatory: false, outsourceable: true, active: true, sam: 2.0 },
  { p: "Sewing", seq: 3, mandatory: true, outsourceable: false, active: true, sam: 14 },
  { p: "Washing", seq: 4, mandatory: false, outsourceable: true, active: true, sam: 4 },
  { p: "Finishing", seq: 5, mandatory: true, outsourceable: false, active: true, sam: 3 },
  { p: "Packing", seq: 6, mandatory: true, outsourceable: false, active: true, sam: 1.2 },
];

export const USERS = [
  { id: "priya", name: "Priya", role: "planner", device: "Laptop 1", procs: [] },
  { id: "asha", name: "Asha", role: "operator", device: "Phone 2", procs: ["Cutting", "Packing"] },
  { id: "ravi", name: "Ravi", role: "operator", device: "Phone 3", procs: ["Embroidery"] },
  { id: "meena", name: "Meena", role: "operator", device: "Phone 5", procs: ["Printing"] },
  { id: "kiran", name: "Kiran", role: "operator", device: "Phone 4", procs: ["Sewing"] },
  { id: "sunil", name: "Sunil", role: "operator", device: "Phone 6", procs: ["Finishing"] },
  { id: "rahul", name: "Rahul", role: "supervisor", device: "Tablet 1", procs: PROCESSES.map((x) => x.p) },
  { id: "shah", name: "Mr. Shah", role: "owner", device: "Laptop 2", procs: [] },
];

const OP = { Cutting: "asha", Embroidery: "ravi", Printing: "meena", Sewing: "kiran", Washing: "rahul", Finishing: "sunil", Packing: "asha" };
const DEV = Object.fromEntries(USERS.map((u) => [u.id, u.device]));
const pad = (n) => String(n).padStart(4, "0");
const SIZES = ["S", "M", "L", "XL"];

export function seed(now = Date.now()) {
  let id = 0;
  const events = [];
  const ev = (e) => {
    const u = e.u || OP[e.p];
    events.push({ id: ++id, ok: true, t: "complete", u, d: DEV[u], sync: e.ts + 45e3, m: "qr", ...e });
  };

  const orders = {
    "A-2610-01": {
      id: "A-2610-01", name: "Order A", style: "Polo shirt", buyer: "Northwind Apparel", qty: 1000, priority: "Normal",
      status: "Active", shipDate: now + 5 * DAY, eff: 0.55, routeVersion: 1, flagged: [],
      route: [
        { p: "Cutting", type: "Mandatory", deps: [], sam: 1.5, ops: 1 },
        { p: "Embroidery", type: "Optional", deps: ["Cutting"], sam: 3.5, ops: 2 },
        { p: "Printing", type: "Optional", deps: ["Cutting"], sam: 2.0, ops: 1 },
        { p: "Sewing", type: "Mandatory", deps: ["Embroidery", "Printing"], sam: 14, ops: 7 },
        { p: "Washing", type: "Optional", deps: ["Sewing"], sam: 4, ops: 0, vendor: "AquaWash Pvt Ltd", vendorDays: 1, vendorPerDay: 250 },
        { p: "Finishing", type: "Mandatory", deps: ["Washing"], sam: 3, ops: 3 },
        { p: "Packing", type: "Mandatory", deps: ["Finishing"], sam: 1.2, ops: 2 },
      ],
    },
    "B-2610-02": {
      id: "B-2610-02", name: "Order B", style: "Crew T-shirt", buyer: "Bluebird Retail", qty: 800, priority: "Rush",
      status: "Active", shipDate: now + 3 * DAY, eff: 0.55, routeVersion: 1, flagged: [],
      route: [
        { p: "Cutting", type: "Mandatory", deps: [], sam: 0.8, ops: 1 },
        { p: "Embroidery", type: "Optional", deps: ["Cutting"], sam: 3, ops: 2 },
        { p: "Sewing", type: "Mandatory", deps: ["Embroidery"], sam: 8, ops: 3 },
        { p: "Finishing", type: "Mandatory", deps: ["Sewing"], sam: 2.5, ops: 1 },
        { p: "Packing", type: "Mandatory", deps: ["Finishing"], sam: 1, ops: 1 },
      ],
    },
    "C-2610-03": {
      id: "C-2610-03", name: "Order C", style: "Hoodie", buyer: "Lakeside Co", qty: 500, priority: "Normal",
      status: "Draft", shipDate: now + 20 * DAY, eff: 0.55, routeVersion: 0, flagged: [], route: [],
    },
  };

  const garments = [];
  const batches = [];

  // ----- Order A: 1000 garments, batches B013 and B014 -----
  const T0 = now - 6 * DAY;
  batches.push({ b: "B013", order: "A-2610-01", count: 500, ym: YYMM, ts: T0 }, { b: "B014", order: "A-2610-01", count: 500, ym: YYMM, ts: T0 });
  const rank = Array.from({ length: 1000 }, (_, k) => (k * 379) % 1000);
  const swap = (k, r) => {
    const k2 = rank.indexOf(r);
    [rank[k], rank[k2]] = [rank[k2], rank[k]];
  };
  swap(736, 450); // 2610-B014-0237: sewn, then rework loop (journey example)
  swap(911, 800); // 2610-B014-0412: Embroidery done, Printing missing
  const A = [["Cutting", 1000], ["Embroidery", 900], ["Printing", 700], ["Sewing", 500], ["Washing", 300], ["Finishing", 200], ["Packing", 100]];
  const endA = now - 10 * MIN;
  const tsA = (s, r, count) => {
    const start = T0 + s * 0.7 * DAY;
    return Math.round(start + ((r + 0.5) / count) * (endA - start));
  };

  for (let k = 0; k < 1000; k++) {
    const batch = k < 500 ? "B013" : "B014";
    const no = `${YYMM}-${batch}-${pad((k % 500) + 1)}`;
    garments.push({ no, order: "A-2610-01", batch, size: SIZES[k % 4] });
    const r = rank[k];
    let sewTs = 0;
    A.forEach(([p, count], s) => {
      if (p === "Washing") {
        const vendor = "AquaWash Pvt Ltd";
        if (r < count) {
          const recv = tsA(s, r, count);
          ev({ g: no, p, t: "sent_out", vendor, ts: sewTs + Math.min(HOUR, (recv - sewTs) / 2), u: "rahul" });
          ev({ g: no, p, t: "received", vendor, ts: recv, u: "rahul" });
        } else if (r < 420) ev({ g: no, p, t: "sent_out", vendor, ts: Math.min(sewTs + HOUR, now - 5 * MIN), u: "rahul" });
        return;
      }
      if (r < count) {
        const ts = tsA(s, r, count);
        if (p === "Sewing") sewTs = ts;
        ev({ g: no, p, ts });
      }
    });
    // 12 garments failed Finishing inspection and went back to Sewing
    if (r >= 210 && r < 222) {
      const t = Math.min(tsA(4, r, 300) + 2 * HOUR, now - 20 * MIN);
      ev({ g: no, p: "Finishing", t: "rework", back: "Sewing", reason: "Stitching defect", ts: t, u: "sunil" });
      if (r === 210) {
        // repeat offender: 3 reworks -> flagged
        ev({ g: no, p: "Sewing", ts: t + 2 * MIN });
        ev({ g: no, p: "Sewing", t: "rework", back: "Sewing", reason: "Stitching defect", ts: t + 4 * MIN, u: "rahul" });
        ev({ g: no, p: "Sewing", ts: t + 6 * MIN });
        ev({ g: no, p: "Sewing", t: "rework", back: "Sewing", reason: "Measurement", ts: t + 8 * MIN, u: "rahul" });
      }
    }
    if (r >= 460 && r < 463) ev({ g: no, p: "Sewing", t: "scrap", reason: "Fabric hole, cannot repair", ts: Math.min(sewTs + HOUR, now - 5 * MIN), u: "rahul" });
    if (k === 736) {
      ev({ g: no, p: "Sewing", t: "complete", ok: false, why: "Already recorded (duplicate)", ts: sewTs + 60e3 });
      ev({ g: no, p: "Sewing", t: "rework", back: "Sewing", reason: "Stitching defect", note: "Open seam on left sleeve (end-line QC)", ts: sewTs + 80 * MIN, u: "sunil" });
      ev({ g: no, p: "Sewing", ts: sewTs + 160 * MIN });
    }
  }

  // ----- Order B: 800 garments, batches B018 and B019. No Printing, no Washing. -----
  const TB = now - 5 * DAY;
  batches.push({ b: "B018", order: "B-2610-02", count: 400, ym: YYMM, ts: TB }, { b: "B019", order: "B-2610-02", count: 400, ym: YYMM, ts: TB });
  const B = [["Cutting", 800], ["Embroidery", 650], ["Sewing", 400], ["Finishing", 300], ["Packing", 150]];
  const tsB = (s, r, count, p) => {
    const start = TB + s * 0.8 * DAY;
    const end = p === "Cutting" || p === "Embroidery" ? now - 3 * HOUR : now - 15 * MIN; // batch B019 goes quiet
    return Math.round(start + ((r + 0.5) / count) * (end - start));
  };
  const shipped = [];
  for (let k = 0; k < 800; k++) {
    const batch = k < 400 ? "B018" : "B019";
    const no = `${YYMM}-${batch}-${pad((k % 400) + 1)}`;
    garments.push({ no, order: "B-2610-02", batch, size: SIZES[k % 4] });
    B.forEach(([p, count], s) => k < count && ev({ g: no, p, ts: tsB(s, k, count, p) }));
    if (k < 100) {
      ev({ g: no, p: "Packing", t: "ship", ship: "SH-001", ts: now - 2 * HOUR, u: "rahul" });
      shipped.push(no);
    }
  }

  // a scan from a phone with a wrong clock (flagged)
  ev({ g: `${YYMM}-B019-0300`, p: "Sewing", t: "complete", ok: false, why: "Blocked: Embroidery not done", ts: now - 5 * HOUR, sync: now - 2 * HOUR, clockFlag: true, u: "kiran" });

  const audit = [
    { id: 1, ts: T0 - DAY, type: "Route published", object: "Order A", old: "-", new: "v1 (7 steps)", reason: "Order confirmed", user: "priya", approver: "-" },
    { id: 2, ts: TB - DAY, type: "Route published", object: "Order B", old: "-", new: "v1 (5 steps)", reason: "Order confirmed", user: "priya", approver: "-" },
    { id: 3, ts: now - 2 * HOUR, type: "Shipment", object: "SH-001", old: "-", new: "100 garments", reason: "Partial shipment, Order B", user: "rahul", approver: "-" },
  ];

  return {
    v: 1,
    seq: id,
    processes: PROCESSES,
    users: USERS,
    orders,
    batches,
    garments,
    events,
    shipments: [{ id: "SH-001", order: "B-2610-02", ts: now - 2 * HOUR, garments: shipped, by: "rahul" }],
    requests: [
      { id: 1, ts: now - 40 * MIN, type: "reprint", by: "kiran", status: "Open", payload: { no: `${YYMM}-B014-0118`, reason: "Label torn at Sewing" }, text: "Reprint label 2610-B014-0118 (label torn at Sewing)" },
    ],
    audit,
    recon: [],
    queue: [],
    settings: { userId: "kiran", online: true, clockOffset: 0 },
  };
}
