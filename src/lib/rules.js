// Central rules engine. Every screen uses these functions; no screen has its own copy of a rule.
// Status is never stored: it is always calculated from saved scan events (R8).

export const MIN = 60e3;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const SHIFT_MIN = 480; // one 8-hour shift
export const MANDATORY = ["Cutting", "Sewing", "Finishing", "Packing"];
export const REWORK_LIMIT = 3;
export const CLOCK_FLAG_MIN = 30; // phone vs server time difference that gets flagged
export const BATCH_IDLE_HOURS = 2; // batch with work in progress but no scan for this long
export const BULK_LIMIT = 300;

export const REASONS = ["Stitching defect", "Print defect", "Wash shade", "Measurement", "Other"];

// 3.5 Roles and permissions. "request" means the user can ask, a supervisor approves.
const PERMS = {
  configureRoute: { planner: "yes", supervisor: "yes" },
  changeRoute: { planner: "request", supervisor: "yes" },
  createBatch: { supervisor: "yes", operator: "cutting" },
  scan: { operator: "yes", supervisor: "yes" },
  rework: { operator: "request", supervisor: "yes" },
  scrap: { supervisor: "yes" },
  reverse: { operator: "request", supervisor: "yes" },
  adjustQty: { planner: "request", supervisor: "yes" },
  reprint: { operator: "request", supervisor: "yes" },
  ship: { supervisor: "yes" },
  outsource: { supervisor: "yes" },
  reconcile: { supervisor: "yes" },
  orderStatus: { planner: "yes", supervisor: "yes" },
  bulk: { supervisor: "yes" },
  override: { supervisor: "yes" },
};
export const perm = (user, action) => PERMS[action]?.[user.role] || "no";
export const can = (user, action) => perm(user, action) === "yes";

// ---------- Route ----------

export const stepOf = (route, p) => route.find((s) => s.p === p);
const uniq = (a) => [...new Set(a)];

// Steps that depend (directly or through others) on p.
export function downstream(route, p) {
  const out = new Set();
  const stack = [p];
  while (stack.length) {
    const x = stack.pop();
    for (const s of route) {
      if (s.deps.includes(x) && !out.has(s.p)) {
        out.add(s.p);
        stack.push(s.p);
      }
    }
  }
  return out;
}

// Rows of steps for the route preview. Steps on the same row run in parallel. null = circular.
export function levels(route) {
  const lvl = {};
  const visiting = new Set();
  const get = (p) => {
    if (lvl[p] != null) return lvl[p];
    if (visiting.has(p)) throw new Error("cycle");
    visiting.add(p);
    const deps = (stepOf(route, p)?.deps || []).filter((d) => stepOf(route, d));
    lvl[p] = deps.length ? 1 + Math.max(...deps.map(get)) : 0;
    visiting.delete(p);
    return lvl[p];
  };
  try {
    route.forEach((s) => get(s.p));
  } catch {
    return null;
  }
  const rows = [];
  route.forEach((s) => (rows[lvl[s.p]] ||= []).push(s.p));
  return rows.filter(Boolean);
}

// 4.1 step 6: route checks. Publish stays disabled until all pass.
export function checkRoute(route) {
  const has = (p) => !!stepOf(route, p);
  const usedBy = (p) => route.some((s) => s.deps.includes(p));
  const out = [];
  const add = (ok, label, fail) => out.push({ ok, label: ok ? label : fail });

  const missing = MANDATORY.filter((p) => !has(p));
  add(!missing.length, "All mandatory steps included", `Mandatory step missing: ${missing.join(", ")}`);
  const bad = route.flatMap((s) => s.deps.filter((d) => !has(d)).map((d) => `${s.p} depends on ${d}, which is not in the route`));
  add(!bad.length, "Every link points to a step in the route", bad.join("; "));
  const cyc = route.filter((s) => downstream(route, s.p).has(s.p)).map((s) => s.p);
  add(!cyc.length, "No circular links", `Circular link: ${cyc.join(" ↔ ")}`);
  const roots = route.filter((s) => !s.deps.length).map((s) => s.p);
  add(roots.length === 1 && roots[0] === "Cutting", "Cutting first", `Only Cutting can start with no earlier step. Now: ${roots.join(", ") || "none"}`);
  add(has("Packing") && !usedBy("Packing"), "Packing last", "Packing must be the last step");
  const dead = route.filter((s) => s.p !== "Packing" && !usedBy(s.p)).map((s) => `${s.p} leads nowhere`);
  add(!dead.length, "Every step has a way forward", dead.join("; "));
  const noSam = route.filter((s) => !(s.sam > 0)).map((s) => s.p);
  add(!noSam.length, "Every step has a required time (SAM)", `SAM missing for ${noSam.join(", ")}`);
  return out;
}

// R4: removing a step links its next steps to its earlier steps.
export function removeStep(route, p) {
  const s = stepOf(route, p);
  return route
    .filter((x) => x.p !== p)
    .map((x) => (x.deps.includes(p) ? { ...x, deps: uniq([...x.deps.filter((d) => d !== p), ...s.deps]) } : x));
}

// Adding a step places it by its master sequence (same sequence = parallel).
export function insertStep(route, proc, processes) {
  const seq = (p) => processes.find((m) => m.p === p)?.seq ?? 99;
  const before = route.filter((s) => seq(s.p) < proc.seq);
  const prevSeq = Math.max(...before.map((s) => seq(s.p)));
  const deps = before.filter((s) => seq(s.p) === prevSeq).map((s) => s.p);
  const after = route.filter((s) => seq(s.p) > proc.seq);
  const nextSeq = Math.min(...after.map((s) => seq(s.p)));
  const next = route.map((s) =>
    seq(s.p) === nextSeq ? { ...s, deps: uniq([...s.deps.filter((d) => !deps.includes(d)), proc.p]) } : s,
  );
  const step = { p: proc.p, type: proc.mandatory ? "Mandatory" : "Optional", deps, sam: proc.sam, ops: 1 };
  return [...next, step].sort((a, b) => seq(a.p) - seq(b.p));
}

// ---------- Garment state (calculated from events only) ----------

export function garmentState(order, events) {
  const route = order.route;
  const reversed = new Set(events.filter((e) => e.ok && e.t === "reversal").map((e) => e.ref));
  const done = new Map();
  const st = { rework: null, reworkCount: 0, scrapped: null, shipped: null, atVendor: null, missing: false, last: null, overrides: 0 };

  for (const e of events) {
    if (!e.ok || e.t === "reversal" || reversed.has(e.id)) continue;
    if (e.t === "complete" || e.t === "received") {
      done.set(e.p, e);
      if (st.rework?.back === e.p) st.rework = null;
      if (e.t === "received") st.atVendor = null;
      if (e.override) st.overrides++;
    } else if (e.t === "sent_out") st.atVendor = { p: e.p, vendor: e.vendor, ts: e.ts };
    else if (e.t === "rework") {
      st.rework = { back: e.back, foundAt: e.p, reason: e.reason, ts: e.ts };
      st.reworkCount++;
      [e.back, ...downstream(route, e.back)].forEach((p) => done.delete(p)); // R10
    } else if (e.t === "scrap") st.scrapped = e;
    else if (e.t === "ship") st.shipped = e;
    else if (e.t === "missing") st.missing = true;
    else if (e.t === "found") st.missing = false;
    st.last = e;
  }

  const steps = route.map((s) => {
    if (done.has(s.p)) return { p: s.p, st: "Done", ev: done.get(s.p) };
    const missingDeps = s.deps.filter((d) => !done.has(d));
    return { p: s.p, st: missingDeps.length ? "Waiting" : "Pending", missingDeps };
  });
  const allDone = steps.every((s) => s.st === "Done");

  let status;
  if (st.shipped) status = "Shipped";
  else if (st.scrapped) status = "Scrapped";
  else if (st.rework) status = "In rework";
  else if (st.missing) status = "Missing";
  else if (st.atVendor) status = "At vendor";
  else if (allDone && route.length) status = "Ready to ship"; // R7
  else if ([...done.keys()].every((p) => p === "Cutting")) status = "Not started";
  else status = "In progress";

  const doneList = steps.filter((s) => s.st === "Done").map((s) => s.p);
  const pending = steps.filter((s) => s.st === "Pending").map((s) => s.p);
  const waiting = steps.filter((s) => s.st === "Waiting").map((s) => s.p);
  return { ...st, done, steps, status, doneList, pending, waiting };
}

// "Sewing done", "Waiting: Printing" etc. for lists.
export function currentStep(gs) {
  if (gs.status === "In rework") return `Back to ${gs.rework.back}`;
  if (gs.status === "At vendor") return `${gs.atVendor.p} at ${gs.atVendor.vendor}`;
  const last = [...gs.done.values()].sort((a, b) => b.ts - a.ts)[0];
  return last ? `${last.p} done` : "Not cut yet";
}

// ---------- Scan validation (4.4, Figure 2) ----------

export function normalizeNo(s) {
  return (s || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function orderStatus(order, gsList) {
  if (order.status !== "Active") return order.status;
  if (gsList.length && gsList.every((g) => g.status === "Shipped" || g.status === "Scrapped")) return "Complete";
  return "Active";
}

// Returns { ok, code, msg, garment, gs, overridable }. Nothing is saved here.
export function validateScan(ctx, { no, p, user }) {
  const g = ctx.garment(no);
  if (!g) return { ok: false, code: "unknown", msg: `Unknown number ${no || "(empty)"}. Type it again, or ask the supervisor to reprint the label.` };
  const order = ctx.orders[g.order];
  const gs = ctx.gs(no);
  const base = { garment: g, gs, order };

  if (user.role === "operator" && !user.procs.includes(p))
    return { ...base, ok: false, code: "assigned", msg: `You are not assigned to ${p}. Pick your own process or call the supervisor.` };
  const os = ctx.orderStatus(order.id);
  if (os !== "Active") return { ...base, ok: false, code: "order", msg: `Order ${order.name} is ${os}. Scans are blocked.` };
  if (gs.status === "Scrapped") return { ...base, ok: false, code: "scrapped", msg: "This garment is scrapped. It cannot be scanned." };
  if (gs.status === "Shipped") return { ...base, ok: false, code: "shipped", msg: "This garment is already shipped." };
  if (gs.atVendor) return { ...base, ok: false, code: "vendor", msg: `At vendor (${gs.atVendor.vendor}) for ${gs.atVendor.p}. Receive it back first.` };

  const step = stepOf(order.route, p);
  if (!step) return { ...base, ok: false, code: "route", msg: `${p} is not required for ${order.name}. Nothing to scan here.` };
  if (step.vendor && p === step.p && !ctx.allowVendorStep)
    return { ...base, ok: false, code: "outsourced", msg: `${p} for ${order.name} is outsourced to ${step.vendor}. Use Sent out / Received back.` };
  if (gs.rework && gs.rework.back !== p)
    return { ...base, ok: false, code: "rework", msg: `In rework: scan at ${gs.rework.back} first.` };

  const prev = gs.done.get(p);
  if (prev) {
    const u = ctx.user(prev.u);
    return { ...base, ok: false, code: "duplicate", msg: `Already recorded by ${u?.name} at ${fmtTime(prev.ts)} (${prev.d}). Count not increased.` };
  }
  const missing = step.deps.filter((d) => !gs.done.has(d));
  if (missing.length)
    return { ...base, ok: false, code: "deps", overridable: true, missing, msg: `Blocked: ${missing.join(" and ")} not done.` };
  return { ...base, ok: true, code: "ok", msg: "OK" };
}

// What the operator sees after a good scan.
export function nextStepText(order, gsAfter) {
  if (gsAfter.status === "Ready to ship") return "Ready to ship";
  const pend = gsAfter.pending;
  return pend.length ? `Next step: ${pend.join(" + ")}` : `Waiting for ${gsAfter.waiting[0]}`;
}

// ---------- Order level numbers for the dashboard ----------

export function orderStats(order, list, evs, now) {
  const route = order.route;
  const by = {};
  list.forEach((x) => (by[x.gs.status] = (by[x.gs.status] || 0) + 1));
  const live = list.filter((x) => x.gs.status !== "Scrapped");
  const flowing = (x) => x.gs.status === "In progress" || x.gs.status === "Not started";
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);

  const steps = route.map((s) => {
    const done = list.filter((x) => x.gs.done.has(s.p)).length;
    const ready = list.filter((x) => flowing(x) && x.gs.pending.includes(s.p)).length;
    const waiting = list.filter((x) => flowing(x) && x.gs.waiting.includes(s.p)).length;
    const remaining = Math.max(0, live.length - done);
    const capacity = (s.ops || 1) * SHIFT_MIN * order.eff; // minutes per day
    const days = s.vendor ? remaining / (s.vendorPerDay || 150) : (remaining * s.sam) / capacity;
    const today = evs.filter((e) => e.ok && e.p === s.p && (e.t === "complete" || e.t === "received") && e.ts >= startOfDay).length;
    const day = evs.filter((e) => e.ok && e.p === s.p && (e.t === "complete" || e.t === "received") && e.ts >= now - DAY).length;
    const lastHour = evs.filter((e) => e.ok && e.p === s.p && (e.t === "complete" || e.t === "received") && e.ts >= now - HOUR).length;
    const targetHour = s.vendor ? null : Math.round(((s.ops || 1) * 60 * order.eff) / s.sam);
    // efficiency over the last 24h = earned minutes / available minutes (one shift per operator)
    const eff = s.vendor ? null : Math.round(((day * s.sam) / ((s.ops || 1) * SHIFT_MIN)) * 100);
    const reworks = evs.filter((e) => e.ok && e.t === "rework" && e.p === s.p).length;
    // actual lead time: from all earlier steps done to this step done
    let sum = 0, n = 0;
    for (const x of list) {
      const e = x.gs.done.get(s.p);
      if (!e || !s.deps.length) continue;
      const prev = Math.max(...s.deps.map((d) => x.gs.done.get(d)?.ts || 0));
      if (prev) { sum += e.ts - prev; n++; }
    }
    const atVendor = list.filter((x) => x.gs.atVendor?.p === s.p).length;
    return { ...s, done, ready, waiting, remaining, days, today, day, lastHour, targetHour, eff, reworks, dhu: done ? (reworks / done) * 100 : 0, leadH: n ? sum / n / HOUR : null, atVendor };
  });

  const maxReady = Math.max(0, ...steps.filter((s) => s.p !== "Cutting").map((s) => s.ready));
  steps.forEach((s) => (s.bottleneck = s.p !== "Cutting" && s.ready === maxReady && maxReady >= Math.max(20, live.length * 0.1)));

  const gates = route
    .filter((s) => s.deps.length > 1)
    .map((s) => {
      const counts = s.deps.map((d) => ({ p: d, done: steps.find((x) => x.p === d).done }));
      const both = list.filter((x) => s.deps.every((d) => x.gs.done.has(d))).length;
      const lag = [...counts].sort((a, b) => a.done - b.done)[0];
      return { p: s.p, counts, both, lag };
    });

  const finishDays = Math.max(0, ...steps.map((s) => s.days));
  const estFinish = now + finishDays * DAY;
  const lateDays = (estFinish - order.shipDate) / DAY;
  const shortfall = order.qty - live.length;

  // batches with work in progress and no scan for a while
  const idleBatches = [];
  const byBatch = {};
  list.forEach((x) => (byBatch[x.g.batch] ||= []).push(x));
  for (const [b, xs] of Object.entries(byBatch)) {
    const wip = xs.filter((x) => flowing(x)).length;
    const last = Math.max(...xs.map((x) => x.gs.last?.ts || 0));
    if (wip && now - last > BATCH_IDLE_HOURS * HOUR) idleBatches.push({ b, wip, hours: (now - last) / HOUR });
  }
  const vendorLate = list.filter((x) => {
    if (!x.gs.atVendor) return false;
    const st = stepOf(route, x.gs.atVendor.p);
    return now - x.gs.atVendor.ts > (st?.vendorDays || 3) * DAY;
  }).length;
  const repeatRework = list.filter((x) => x.gs.reworkCount >= REWORK_LIMIT).map((x) => x.g.no);
  const clockFlags = evs.filter((e) => e.clockFlag).length;
  const reworkBack = {};
  list.filter((x) => x.gs.rework).forEach((x) => (reworkBack[x.gs.rework.back] = (reworkBack[x.gs.rework.back] || 0) + 1));

  return { by, total: list.length, live: live.length, steps, gates, finishDays, estFinish, lateDays, shortfall, idleBatches, vendorLate, repeatRework, clockFlags, reworkBack };
}

// ---------- Formatting ----------

export function fmtTime(ts) {
  const d = new Date(ts);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date().toDateString() === d.toDateString();
  return today ? t : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${t}`;
}
export function fmtDur(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
export const fmtDate = (ts) => new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
