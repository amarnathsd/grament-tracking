"use client";
// Low-fidelity wireframe building blocks. Grey boxes, numbered markers, green/red/amber banners.
import Link from "next/link";

export function Page({ title, sub, children, rules }) {
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      {sub && <p className="mb-4 text-sm text-slate-500">{sub}</p>}
      {children}
      {rules && <p className="mt-6 text-xs text-slate-400">Rules used: {rules}</p>}
    </div>
  );
}

export function N({ n }) {
  return <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-400 text-[11px] font-bold text-white">{n}</span>;
}

export function Card({ title, n, children, className = "", right }) {
  return (
    <section className={`rounded border border-slate-300 bg-white p-3 ${className}`}>
      {(title || n) && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center text-sm font-semibold text-slate-700">{n && <N n={n} />}{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const BTN = {
  default: "border-slate-400 bg-slate-100 text-slate-700 hover:bg-slate-200",
  primary: "border-teal-700 bg-teal-600 text-white hover:bg-teal-700",
  danger: "border-red-400 bg-red-50 text-red-700 hover:bg-red-100",
  warn: "border-amber-500 bg-amber-400 text-white hover:bg-amber-500",
  link: "border-transparent bg-transparent text-teal-700 underline px-0",
};
export function Btn({ kind = "default", className = "", ...p }) {
  return <button {...p} className={`rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${BTN[kind]} ${className}`} />;
}

const BAN = {
  ok: "border-green-500 bg-green-50 text-green-800",
  err: "border-red-500 bg-red-50 text-red-800",
  warn: "border-amber-500 bg-amber-50 text-amber-800",
  info: "border-slate-300 bg-slate-50 text-slate-700",
};
export function Banner({ kind = "info", children, className = "" }) {
  return <div className={`rounded border px-3 py-2 text-sm ${BAN[kind]} ${className}`}>{children}</div>;
}
// Shows the result of any command.
export function Result({ r }) {
  if (!r) return null;
  return (
    <Banner kind={r.requested ? "warn" : r.ok ? "ok" : "err"} className="mt-2">
      <b>{r.requested ? "Requested. " : r.ok ? "" : "Blocked. "}</b>{r.msg}
      {r.rejected?.length > 0 && (
        <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-xs">{r.rejected.slice(0, 30).map((x) => <li key={x}>{x}</li>)}</ul>
      )}
    </Banner>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`block text-xs text-slate-500 ${className}`}>
      {label}
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </label>
  );
}
export const inputCls = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
export function Input(p) {
  return <input {...p} className={`${inputCls} ${p.className || ""}`} />;
}
export function Select({ options, ...p }) {
  return (
    <select {...p} className={`${inputCls} ${p.className || ""}`}>
      {options.map((o) => (typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Table({ cols, rows, empty = "Nothing here", max }) {
  return (
    <div className={`overflow-auto ${max ? "max-h-96" : ""}`}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0">
          <tr>{cols.map((c) => <th key={c} className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-left text-xs font-semibold text-slate-600">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-2 py-3 text-center text-xs text-slate-400">{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i} className="border-b border-slate-100">{r.map((c, j) => <td key={j} className="px-2 py-1 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

const TONE = {
  "Ready to ship": "bg-green-100 text-green-800", Done: "bg-green-100 text-green-800", Shipped: "bg-slate-700 text-white", Active: "bg-green-100 text-green-800",
  "In rework": "bg-amber-100 text-amber-800", Pending: "bg-sky-100 text-sky-800", "At vendor": "bg-violet-100 text-violet-800", "On hold": "bg-amber-100 text-amber-800",
  Scrapped: "bg-red-100 text-red-700", Missing: "bg-red-100 text-red-700", Cancelled: "bg-red-100 text-red-700", Rush: "bg-red-100 text-red-700",
  Waiting: "bg-slate-100 text-slate-500", "Not applicable": "bg-white text-slate-300 border border-dashed", Draft: "bg-slate-100 text-slate-600",
};
export function Pill({ children, tone }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${TONE[tone || children] || "bg-slate-100 text-slate-700"}`}>{children}</span>;
}

// Dashed note on the wireframe naming an edge case and how to try it.
export function Edge({ id, children }) {
  return (
    <div className="mt-2 rounded border border-dashed border-orange-300 bg-orange-50/50 px-2 py-1 text-xs text-slate-600">
      <b className="text-orange-600">Edge case{id ? ` #${id}` : ""}:</b> {children}
    </div>
  );
}

export function GLink({ no }) {
  return <Link href={`/journey?g=${no}`} className="font-mono text-teal-700 underline">{no}</Link>;
}

export function Bar({ value, max, tone = "teal" }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const c = { teal: "bg-teal-600", amber: "bg-amber-400", red: "bg-red-400", violet: "bg-violet-400" }[tone];
  return <div className="h-3 w-full rounded bg-slate-200"><div className={`h-3 rounded ${c}`} style={{ width: `${pct}%` }} /></div>;
}

export function Stat({ label, value, tone = "slate", sub }) {
  const c = { slate: "bg-slate-50", green: "bg-green-50", amber: "bg-amber-50", red: "bg-red-50", violet: "bg-violet-50" }[tone];
  return (
    <div className={`rounded border border-slate-300 p-2 ${c}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// Placeholder QR pattern made from the number (a real build would use any free QR library).
export function FakeQR({ text, size = 64 }) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = 15;
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if ((x < 5 && y < 5) || (x > n - 6 && y < 5) || (x < 5 && y > n - 6)) continue;
      h = (h * 1103515245 + 12345) >>> 0;
      if ((h >> 16) & 1) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  const finder = (x, y) => (
    <g key={`f${x}${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width="3" height="3" fill="none" stroke="black" strokeWidth="1" />
      <rect x={x + 1.5} y={y + 1.5} width="1" height="1" />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} className="bg-white">
      {cells}
      {finder(0, 0)}{finder(n - 4, 0)}{finder(0, n - 4)}
    </svg>
  );
}
