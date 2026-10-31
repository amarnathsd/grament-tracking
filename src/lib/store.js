"use client";
// Central store. All screens read from here and every write goes through one of the commands below,
// which use the rules in rules.js. Data is saved in the browser so the demo survives a refresh.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { seed } from "./data";
import {
  BULK_LIMIT, CLOCK_FLAG_MIN, MIN, REWORK_LIMIT, can, checkRoute, downstream, garmentState, normalizeNo,
  orderStatus, perm, stepOf, validateScan,
} from "./rules";

const KEY = "garment-tracking-wireframe-v1";

// Read helpers over a state. Garment status is calculated on demand and cached.
export function makeCtx(state) {
  const gIndex = new Map(state.garments.map((g) => [g.no, g]));
  const evByG = new Map();
  for (const e of state.events) {
    if (!evByG.has(e.g)) evByG.set(e.g, []);
    evByG.get(e.g).push(e);
  }
  const gsCache = new Map();
  const osCache = new Map();
  const byOrder = new Map();
  const ctx = {
    state,
    now: Date.now(),
    orders: state.orders,
    user: (id) => state.users.find((u) => u.id === id),
    garment: (no) => gIndex.get(no),
    events: (no) => evByG.get(no) || [],
    gs: (no) => {
      if (!gsCache.has(no)) {
        const g = gIndex.get(no);
        gsCache.set(no, garmentState(state.orders[g.order], evByG.get(no) || []));
      }
      return gsCache.get(no);
    },
    garmentsOf: (orderId) => {
      if (!byOrder.has(orderId)) byOrder.set(orderId, state.garments.filter((g) => g.order === orderId));
      return byOrder.get(orderId);
    },
    orderStatus: (orderId) => {
      if (!osCache.has(orderId)) osCache.set(orderId, orderStatus(state.orders[orderId], ctx.garmentsOf(orderId).map((g) => ctx.gs(g.no))));
      return osCache.get(orderId);
    },
    // used inside commands only
    _add(e) {
      state.events.push(e);
      if (!evByG.has(e.g)) evByG.set(e.g, []);
      evByG.get(e.g).push(e);
      gsCache.delete(e.g);
      osCache.clear();
    },
    _addGarment(g) {
      gIndex.set(g.no, g);
      byOrder.clear();
    },
  };
  return ctx;
}

function begin(s) {
  const d = {
    ...s,
    events: [...s.events], audit: [...s.audit], requests: [...s.requests], shipments: [...s.shipments],
    recon: [...s.recon], queue: [...s.queue], garments: [...s.garments], batches: [...s.batches],
    processes: [...s.processes], orders: { ...s.orders }, settings: { ...s.settings },
  };
  const tx = { d, ctx: makeCtx(d), now: Date.now() };
  tx.user = tx.ctx.user(d.settings.userId);
  tx.ev = (e) => {
    const full = { id: ++d.seq, ok: true, t: "complete", u: tx.user.id, d: tx.user.device, ts: tx.now, sync: tx.now, m: "qr", ...e };
    tx.ctx._add(full);
    return full;
  };
  tx.log = (a) => d.audit.push({ id: d.audit.length + 1, ts: tx.now, user: tx.user.id, approver: "-", old: "-", new: "-", ...a });
  tx.request = (type, payload, text) => {
    d.requests.push({ id: d.requests.length + 1, ts: tx.now, type, by: tx.user.id, status: "Open", payload, text });
    return { requested: true, msg: `Request sent to supervisor: ${text}` };
  };
  tx.setOrder = (id, patch) => {
    d.orders[id] = { ...d.orders[id], ...patch };
    tx.ctx = makeCtx(d);
  };
  return tx;
}

// ---------------- Commands ----------------

function doScan(tx, { no, p, method = "qr", override, overrideReason, note, user = tx.user, ts, sync }) {
  no = normalizeNo(no);
  const offset = tx.d.settings.clockOffset * MIN;
  const scanTs = ts ?? tx.now + offset;
  const syncTs = sync ?? tx.now;
  let v = validateScan(tx.ctx, { no, p, user });
  let isOverride = false;
  if (!v.ok && override && v.overridable && can(user, "override") && overrideReason) {
    v = { ...v, ok: true, msg: "Saved with supervisor override" };
    isOverride = true;
    tx.log({ type: "Override", object: no, old: v.missing.join(", ") + " not done", new: `${p} recorded`, reason: overrideReason });
  }
  const e = tx.ev({
    g: no, p, u: user.id, d: user.device, ts: scanTs, sync: syncTs, ok: v.ok, why: v.ok ? undefined : v.msg, m: method,
    override: isOverride || undefined, note, clockFlag: Math.abs(syncTs - scanTs) > CLOCK_FLAG_MIN * MIN || undefined,
  });
  return { ...v, event: e, gsAfter: v.garment ? tx.ctx.gs(no) : null };
}

function doReverse(tx, { eventId, reason }) {
  const e = tx.d.events.find((x) => x.id === eventId);
  if (!reason) return { ok: false, msg: "A reason is required." };
  if (!e || !e.ok || !["complete", "received", "sent_out"].includes(e.t)) return { ok: false, msg: "Only saved scans can be reversed." };
  if (tx.d.events.some((x) => x.ok && x.t === "reversal" && x.ref === e.id)) return { ok: false, msg: "Already reversed." };
  if (perm(tx.user, "reverse") === "request") return tx.request("reversal", { eventId, reason }, `Reverse ${e.p} scan of ${e.g} (${reason})`);
  if (!can(tx.user, "reverse")) return { ok: false, msg: "Only a supervisor can reverse entries." };
  const g = tx.ctx.garment(e.g);
  const gs = tx.ctx.gs(e.g);
  const later = [...downstream(tx.d.orders[g.order].route, e.p)].filter((p) => gs.done.has(p));
  if (later.length) return { ok: false, later, msg: `Cannot reverse: later steps already done (${later.join(", ")}). Reverse those first, or cancel.` };
  tx.ev({ g: e.g, p: e.p, t: "reversal", ref: e.id, reason });
  tx.log({ type: "Reversal", object: `${e.g} / ${e.p}`, old: "Recorded", new: "Reversed", reason });
  return { ok: true, msg: `Reversed. ${e.g} now needs ${e.p} again.` };
}

function doRework(tx, { no, foundAt, back, reason, note }) {
  no = normalizeNo(no);
  const g = tx.ctx.garment(no);
  if (!g) return { ok: false, msg: "Unknown garment number." };
  const gs = tx.ctx.gs(no);
  if (gs.status === "Shipped") return { ok: false, msg: "Already shipped. Handle as a buyer return." };
  if (gs.status === "Scrapped") return { ok: false, msg: "Garment is scrapped." };
  if (!gs.done.has(back)) return { ok: false, msg: `${back} is not done for this garment, so it cannot be sent back there.` };
  if (perm(tx.user, "rework") === "request")
    return tx.request("rework", { no, foundAt, back, reason, note }, `Rework ${no}: ${reason}, send back to ${back}`);
  if (!can(tx.user, "rework")) return { ok: false, msg: "Not allowed for your role." };
  const route = tx.d.orders[g.order].route;
  const reopened = [back, ...downstream(route, back)].filter((p) => gs.done.has(p));
  const wasPacked = gs.done.has("Packing");
  tx.ev({ g: no, p: foundAt, t: "rework", back, reason, note });
  tx.log({ type: "Rework", object: no, old: gs.status, new: `In rework → ${back}`, reason: `${reason}${note ? ": " + note : ""}` });
  const count = gs.reworkCount + 1;
  return {
    ok: true, reopened, wasPacked, count, flagged: count >= REWORK_LIMIT,
    msg: `Sent to rework. Re-opened: ${reopened.join(", ")}.${wasPacked ? " Removed from the packed lot (packed count -1)." : ""}${count >= REWORK_LIMIT ? ` Flagged: reworked ${count} times.` : ""}`,
  };
}

function doScrap(tx, { no, reason }) {
  no = normalizeNo(no);
  const g = tx.ctx.garment(no);
  if (!g) return { ok: false, msg: "Unknown garment number." };
  if (!can(tx.user, "scrap")) return { ok: false, msg: "Only a supervisor can scrap a garment." };
  if (!reason) return { ok: false, msg: "A reason is required." };
  const gs = tx.ctx.gs(no);
  if (gs.status === "Shipped" || gs.status === "Scrapped") return { ok: false, msg: `Garment is already ${gs.status}.` };
  tx.ev({ g: no, p: gs.rework?.foundAt || "Sewing", t: "scrap", reason });
  tx.log({ type: "Scrap", object: no, old: gs.status, new: "Scrapped", reason });
  return { ok: true, msg: "Scrapped. Expected quantity for the order is reduced by 1." };
}

function applyRouteChange(tx, { orderId, route, reason, approver }) {
  const o = tx.d.orders[orderId];
  const added = route.filter((s) => !stepOf(o.route, s.p)).map((s) => s.p);
  const removed = o.route.filter((s) => !stepOf(route, s.p)).map((s) => s.p);
  // garments already past a newly added step are flagged for the supervisor to decide
  const flagged = tx.ctx.garmentsOf(orderId).filter((g) => {
    const gs = tx.ctx.gs(g.no);
    return gs.status !== "Shipped" && added.some((a) => [...downstream(route, a)].some((p) => gs.done.has(p)));
  }).map((g) => g.no);
  tx.setOrder(orderId, { route, routeVersion: o.routeVersion + 1, routeFrom: tx.now, flagged });
  tx.log({
    type: "Route change", object: o.name, old: `v${o.routeVersion}`, new: `v${o.routeVersion + 1}${added.length ? " +" + added.join(",") : ""}${removed.length ? " -" + removed.join(",") : ""}`,
    reason, approver: approver || tx.user.id,
  });
  return { ok: true, flagged, msg: `Route v${o.routeVersion + 1} applies from now. Work already done stays valid.${flagged.length ? ` ${flagged.length} garments are already past the new step and are flagged.` : ""}` };
}

function doBatch(tx, { orderId, count }) {
  const o = tx.d.orders[orderId];
  const pm = perm(tx.user, "createBatch");
  if (pm === "no" || (pm === "cutting" && !tx.user.procs.includes("Cutting"))) return { ok: false, msg: "Only the cutting operator or supervisor can create batches." };
  if (tx.ctx.orderStatus(orderId) !== "Active") return { ok: false, msg: `Order is ${tx.ctx.orderStatus(orderId)}. Publish the route first: no labels can be printed.` };
  count = Number(count);
  if (!(count > 0 && count <= 1000)) return { ok: false, msg: "Enter a garment count between 1 and 1000." };
  const d = new Date(tx.now);
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const n = Math.max(0, ...tx.d.batches.filter((b) => b.ym === ym).map((b) => Number(b.b.slice(1)))) + 1;
  const b = `B${String(n).padStart(3, "0")}`;
  tx.d.batches.push({ b, order: orderId, count, ym, ts: tx.now });
  for (let i = 1; i <= count; i++) {
    const g = { no: `${ym}-${b}-${String(i).padStart(4, "0")}`, order: orderId, batch: b, size: ["S", "M", "L", "XL"][i % 4] };
    tx.d.garments.push(g);
    tx.ctx._addGarment(g);
  }
  tx.log({ type: "Batch created", object: `${b} (${o.name})`, new: `${count} numbers ${ym}-${b}-0001 to ${String(count).padStart(4, "0")}`, reason: "Cutting" });
  return { ok: true, batch: b, msg: `Batch ${b} created with ${count} garment numbers. Print labels, then scan Cutting.` };
}

function doQty(tx, { orderId, qty, reason }) {
  const o = tx.d.orders[orderId];
  if (!reason) return { ok: false, msg: "A reason is required." };
  if (perm(tx.user, "adjustQty") === "request") return tx.request("qty_adjust", { orderId, qty, reason }, `Change ${o.name} quantity ${o.qty} → ${qty} (${reason})`);
  if (!can(tx.user, "adjustQty")) return { ok: false, msg: "Not allowed for your role." };
  tx.log({ type: "Quantity adjustment", object: o.name, old: o.qty, new: qty, reason });
  tx.setOrder(orderId, { qty: Number(qty) });
  return { ok: true, msg: `Quantity changed to ${qty}.` };
}

function doReprint(tx, { no, reason }) {
  no = normalizeNo(no);
  if (!tx.ctx.garment(no)) return { ok: false, msg: "Unknown garment number. Find it in the batch list." };
  if (perm(tx.user, "reprint") === "request") return tx.request("reprint", { no, reason }, `Reprint label ${no} (${reason})`);
  if (!can(tx.user, "reprint")) return { ok: false, msg: "Not allowed for your role." };
  tx.log({ type: "Reprint", object: no, old: "Label damaged", new: "Same number reprinted", reason });
  return { ok: true, msg: `Label ${no} reprinted. Same number, no new garment created.` };
}

function doBulk(tx, { batch, from, to, p, confirm }) {
  if (!can(tx.user, "bulk")) return { ok: false, msg: "Bulk entry needs a supervisor." };
  const b = tx.d.batches.find((x) => x.b === batch);
  from = Number(from); to = Number(to);
  const count = to - from + 1;
  if (!b || !(from >= 1 && to <= b.count && count > 0)) return { ok: false, msg: "Range is outside the batch." };
  if (count > BULK_LIMIT) return { ok: false, msg: `Bulk entry is limited to ${BULK_LIMIT} garments.` };
  if (Number(confirm) !== count) return { ok: false, msg: `Count confirmation does not match (${count} in range). Count the garments physically.` };
  let saved = 0;
  const rejected = [];
  for (let i = from; i <= to; i++) {
    const no = `${b.ym}-${b.b}-${String(i).padStart(4, "0")}`;
    const r = doScan(tx, { no, p, method: "bulk" });
    if (r.ok) saved++;
    else rejected.push(`${no}: ${r.msg}`);
  }
  tx.log({ type: "Bulk entry", object: `${batch} ${from}-${to} / ${p}`, new: `${saved} saved, ${rejected.length} rejected`, reason: "Count confirmed" });
  return { ok: saved > 0, msg: `${saved} saved, ${rejected.length} rejected.`, rejected };
}

function doSendOut(tx, { nos, p, vendor }) {
  if (!can(tx.user, "outsource")) return { ok: false, msg: "Only a supervisor records sent out / received back." };
  tx.ctx.allowVendorStep = true;
  let saved = 0;
  const rejected = [];
  for (const no of nos) {
    const v = validateScan(tx.ctx, { no, p, user: tx.user });
    if (!v.ok) { rejected.push(`${no}: ${v.msg}`); continue; }
    tx.ev({ g: no, p, t: "sent_out", vendor });
    saved++;
  }
  tx.ctx.allowVendorStep = false;
  return { ok: saved > 0, msg: `${saved} sent out to ${vendor}. ${rejected.length} blocked.`, rejected };
}

function doReceive(tx, { nos, p, overrideReason }) {
  if (!can(tx.user, "outsource")) return { ok: false, msg: "Only a supervisor records sent out / received back." };
  let saved = 0;
  const rejected = [];
  for (const no of nos) {
    const g = tx.ctx.garment(no);
    if (!g) { rejected.push(`${no}: unknown number`); continue; }
    const gs = tx.ctx.gs(no);
    if (gs.atVendor?.p === p) {
      tx.ev({ g: no, p, t: "received", vendor: gs.atVendor.vendor });
      saved++;
    } else if (overrideReason && !gs.done.has(p) && stepOf(tx.d.orders[g.order].route, p)) {
      const vendor = stepOf(tx.d.orders[g.order].route, p).vendor;
      tx.ev({ g: no, p, t: "sent_out", vendor, override: true, note: overrideReason });
      tx.ev({ g: no, p, t: "received", vendor, override: true, note: overrideReason });
      tx.log({ type: "Override", object: no, old: "Not sent out", new: `Received back at ${p}`, reason: overrideReason });
      saved++;
    } else rejected.push(`${no}: ${gs.done.has(p) ? "already received" : "was never sent out. Record Sent out first (supervisor can override with a reason)."}`);
  }
  return { ok: saved > 0, msg: `${saved} received back. ${rejected.length} blocked.`, rejected };
}

function doShip(tx, { orderId, nos }) {
  if (!can(tx.user, "ship")) return { ok: false, msg: "Only a supervisor creates shipments." };
  const ok = [];
  const rejected = [];
  for (const no of nos) {
    const g = tx.ctx.garment(no);
    if (!g || g.order !== orderId) { rejected.push(`${no}: not in this order`); continue; }
    const gs = tx.ctx.gs(no);
    if (gs.status !== "Ready to ship") {
      const miss = [...gs.pending, ...gs.waiting];
      rejected.push(`${no}: ${gs.status}${miss.length ? ", missing " + miss.join(", ") : ""}`);
      continue;
    }
    ok.push(no);
  }
  if (!ok.length) return { ok: false, msg: "Nothing to ship.", rejected };
  const id = `SH-${String(tx.d.shipments.length + 1).padStart(3, "0")}`;
  ok.forEach((no) => tx.ev({ g: no, p: "Packing", t: "ship", ship: id }));
  tx.d.shipments.push({ id, order: orderId, ts: tx.now, garments: ok, by: tx.user.id });
  tx.log({ type: "Shipment", object: id, new: `${ok.length} garments`, reason: tx.d.orders[orderId].name });
  return { ok: true, msg: `${id} created with ${ok.length} garments. ${rejected.length} blocked.`, rejected };
}

function doReconcile(tx, { orderId, p, expected, physical, late, missing }) {
  if (!can(tx.user, "reconcile")) return { ok: false, msg: "Only a supervisor reconciles." };
  let lateSaved = 0;
  const rejected = [];
  for (const no of late) {
    const r = doScan(tx, { no, p, method: "late", note: "Late scan (reconciliation)" });
    if (r.ok) lateSaved++;
    else rejected.push(`${no}: ${r.msg}`);
  }
  missing.forEach((no) => tx.ev({ g: no, p, t: "missing", note: "Not found on floor at reconciliation" }));
  tx.d.recon.push({ id: tx.d.recon.length + 1, ts: tx.now, orderId, p, expected, physical: Number(physical), late: lateSaved, missing: missing.length, by: tx.user.id });
  tx.log({ type: "Reconciliation", object: `${tx.d.orders[orderId].name} / ${p}`, old: `system ${expected}`, new: `floor ${physical}`, reason: `${lateSaved} late scans, ${missing.length} missing` });
  return { ok: true, msg: `Saved. ${lateSaved} late scans, ${missing.length} marked missing.`, rejected };
}

function doApprove(tx, { id, approve }) {
  const r = tx.d.requests.find((x) => x.id === id);
  if (!can(tx.user, "override")) return { ok: false, msg: "Only a supervisor approves." };
  const idx = tx.d.requests.indexOf(r);
  if (!approve) {
    tx.d.requests[idx] = { ...r, status: "Rejected", decidedBy: tx.user.id };
    return { ok: true, msg: "Request rejected." };
  }
  const P = r.payload;
  let res;
  if (r.type === "route_change") res = applyRouteChange(tx, { ...P, approver: tx.user.id });
  else if (r.type === "qty_adjust") res = doQty(tx, P);
  else if (r.type === "reversal") res = doReverse(tx, P);
  else if (r.type === "rework") res = doRework(tx, P);
  else if (r.type === "reprint") res = doReprint(tx, P);
  if (res.ok) {
    tx.d.requests[idx] = { ...r, status: "Approved", decidedBy: tx.user.id };
    const last = tx.d.audit.at(-1);
    if (last) Object.assign(last, { user: r.by, approver: tx.user.id });
  }
  return res;
}

// ---------------- Provider ----------------

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    let s = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) s = JSON.parse(raw);
    } catch {}
    s ||= seed();
    ref.current = s;
    // browser storage only exists on the client, so the saved demo is loaded after mount
    setState(s); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [state]);

  const run = useCallback((fn) => {
    const tx = begin(ref.current);
    const res = fn(tx);
    ref.current = tx.d;
    setState(tx.d);
    return res;
  }, []);

  const api = useMemo(() => ({
    scan: (a) => run((tx) => {
      if (!tx.d.settings.online) {
        const no = normalizeNo(a.no);
        if (tx.d.queue.some((q) => q.no === no && q.p === a.p)) return { ok: false, queued: true, msg: "Already in this phone's queue. Not counted twice." };
        const v = validateScan(tx.ctx, { no, p: a.p, user: tx.user });
        tx.d.queue.push({ no, p: a.p, m: a.method || "qr", u: tx.user.id, ts: tx.now + tx.d.settings.clockOffset * MIN });
        return { ...v, queued: true, msg: v.ok ? "Saved on phone (offline). Will be checked again on sync." : `Saved on phone, but will likely be rejected: ${v.msg}` };
      }
      return doScan(tx, a);
    }),
    sync: () => run((tx) => {
      const results = tx.d.queue.map((q) => ({ q, r: doScan(tx, { no: q.no, p: q.p, method: q.m, user: tx.ctx.user(q.u), ts: q.ts }) }));
      tx.d.queue = [];
      tx.d.settings.online = true;
      return results;
    }),
    otherPhone: (no, p) => run((tx) => doScan(tx, { no, p, user: tx.ctx.user("rahul") })),
    reverse: (a) => run((tx) => doReverse(tx, a)),
    rework: (a) => run((tx) => doRework(tx, a)),
    scrap: (a) => run((tx) => doScrap(tx, a)),
    saveRoute: ({ orderId, route, publish, reason }) => run((tx) => {
      const o = tx.d.orders[orderId];
      if (perm(tx.user, "configureRoute") !== "yes" && perm(tx.user, "changeRoute") !== "request") return { ok: false, msg: "Only planner or supervisor can configure routes." };
      if (o.status === "Draft") {
        if (!publish) { tx.setOrder(orderId, { route }); return { ok: true, msg: "Draft saved. Order stays Draft: no labels, no scans." }; }
        if (!checkRoute(route).every((c) => c.ok)) return { ok: false, msg: "Fix the route checks first." };
        tx.setOrder(orderId, { route, status: "Active", routeVersion: 1, routeFrom: tx.now });
        tx.log({ type: "Route published", object: o.name, new: `v1 (${route.length} steps)`, reason: "Order confirmed" });
        return { ok: true, msg: "Route published. Order is Active and the route is locked for operators." };
      }
      if (!checkRoute(route).every((c) => c.ok)) return { ok: false, msg: "Fix the route checks first." };
      if (!reason) return { ok: false, msg: "Production has started: a reason is required for a route change." };
      if (perm(tx.user, "changeRoute") === "request") return tx.request("route_change", { orderId, route, reason }, `Route change for ${o.name} (${reason})`);
      return applyRouteChange(tx, { orderId, route, reason });
    }),
    setOrder: (orderId, patch, reason) => run((tx) => {
      if (!can(tx.user, "orderStatus")) return { ok: false, msg: "Only planner or supervisor." };
      const o = tx.d.orders[orderId];
      tx.log({ type: "Order update", object: o.name, old: Object.keys(patch).map((k) => o[k]).join(", "), new: Object.values(patch).join(", "), reason: reason || "-" });
      tx.setOrder(orderId, patch);
      return { ok: true, msg: "Saved." };
    }),
    addProcess: (proc) => run((tx) => {
      if (!can(tx.user, "configureRoute")) return { ok: false, msg: "Only planner or supervisor." };
      if (!proc.p || tx.d.processes.some((x) => x.p.toLowerCase() === proc.p.toLowerCase())) return { ok: false, msg: "Name is empty or already exists." };
      tx.d.processes.push({ mandatory: false, active: true, outsourceable: false, ...proc });
      tx.d.processes.sort((a, b) => a.seq - b.seq);
      tx.log({ type: "Process added", object: proc.p, new: `seq ${proc.seq}`, reason: "Master list" });
      return { ok: true, msg: `${proc.p} added to the process master.` };
    }),
    createBatch: (a) => run((tx) => doBatch(tx, a)),
    adjustQty: (a) => run((tx) => doQty(tx, a)),
    reprint: (a) => run((tx) => doReprint(tx, a)),
    bulk: (a) => run((tx) => doBulk(tx, a)),
    sendOut: (a) => run((tx) => doSendOut(tx, a)),
    receive: (a) => run((tx) => doReceive(tx, a)),
    ship: (a) => run((tx) => doShip(tx, a)),
    reconcile: (a) => run((tx) => doReconcile(tx, a)),
    found: (no) => run((tx) => { tx.ev({ g: no, p: "Reconciliation", t: "found" }); return { ok: true, msg: `${no} found.` }; }),
    decide: (id, approve) => run((tx) => doApprove(tx, { id, approve })),
    settings: (patch) => run((tx) => { Object.assign(tx.d.settings, patch); return { ok: true }; }),
    reset: () => {
      const s = seed();
      ref.current = s;
      setState(s);
    },
  }), [run]);

  const ctx = useMemo(() => (state ? makeCtx(state) : null), [state]);
  if (!state) return <div className="p-8 text-sm text-neutral-500">Loading sample factory data…</div>;
  const user = ctx.user(state.settings.userId);
  return <Ctx.Provider value={{ state, ctx, api, user }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
