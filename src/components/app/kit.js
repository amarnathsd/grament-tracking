"use client";
// Small UI kit for the phone app. Colours come only from the tokens in globals.css.

const TONES = {
  brand: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  err: "bg-err-soft text-err",
  warn: "bg-warn-soft text-warn",
  vendor: "bg-vendor-soft text-vendor",
  muted: "bg-bg text-muted",
};

// Garment / step / order status → tone
export const STATUS_TONE = {
  "Ready to ship": "ok", Shipped: "ok", Done: "ok", Active: "ok", Complete: "ok",
  "In progress": "brand", "Not started": "muted", Pending: "brand", Waiting: "muted", Draft: "muted",
  "In rework": "warn", "On hold": "warn", "At vendor": "vendor",
  Scrapped: "err", Missing: "err", Cancelled: "err", Rush: "err",
};

export function Chip({ tone = "muted", children, className = "" }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}
export const StatusChip = ({ s }) => <Chip tone={STATUS_TONE[s] || "muted"}>{s}</Chip>;

export function Card({ children, className = "", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`block w-full rounded-card bg-surface p-4 text-left shadow-[0_1px_2px_rgba(20,24,33,0.06)] ${onClick ? "active:scale-[0.99] transition" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

const BTN = {
  primary: "bg-brand text-white active:bg-brand-dark",
  soft: "bg-brand-soft text-brand",
  ghost: "bg-surface text-ink border border-line",
  danger: "bg-err-soft text-err",
  warn: "bg-warn text-white",
  ok: "bg-ok text-white",
};
export function Button({ kind = "primary", size = "md", className = "", ...p }) {
  const sz = size === "lg" ? "h-14 text-base" : size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm";
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:opacity-40 ${sz} ${BTN[kind]} ${className}`} />;
}

export function Progress({ value, max, tone = "brand", className = "" }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const c = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", vendor: "bg-vendor", err: "bg-err" }[tone];
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-line ${className}`}>
      <div className={`h-full rounded-full ${c} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, max, size = 64, label }) {
  const pct = max ? Math.min(1, value / max) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-line" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-brand" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{label ?? `${Math.round(pct * 100)}%`}</div>
    </div>
  );
}

export function Stat({ label, value, tone }) {
  const t = { ok: "text-ok", err: "text-err", warn: "text-warn", vendor: "text-vendor", brand: "text-brand" }[tone] || "text-ink";
  return (
    <div className="min-w-0 flex-1 rounded-2xl bg-bg px-3 py-2">
      <div className={`text-lg font-bold ${t}`}>{value}</div>
      <div className="truncate text-[11px] text-muted">{label}</div>
    </div>
  );
}

export function Section({ title, action, children, className = "" }) {
  return (
    <section className={`mt-5 ${className}`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
export function TextInput(p) {
  return <input {...p} className={`h-12 w-full rounded-2xl border border-line bg-surface px-4 text-sm outline-none focus:border-brand ${p.className || ""}`} />;
}

// Pick one of a few options as chips.
export function Choice({ options, value, onChange, tone = "brand" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button key={v} onClick={() => onChange(v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${value === v ? (tone === "warn" ? "border-warn bg-warn-soft text-warn" : "border-brand bg-brand-soft text-brand") : "border-line bg-surface text-muted"}`}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1 }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - step))} className="h-9 w-9 rounded-full bg-bg text-lg font-bold">−</button>
      <span className="min-w-12 text-center text-base font-bold">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} className="h-9 w-9 rounded-full bg-bg text-lg font-bold">+</button>
    </div>
  );
}

export function Toggle({ on, onChange, disabled }) {
  return (
    <button disabled={disabled} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-brand" : "bg-line"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

// Result of a command, shown inside sheets and screens.
export function Notice({ r, className = "" }) {
  if (!r) return null;
  const tone = r.requested ? "bg-warn-soft text-warn" : r.ok ? "bg-ok-soft text-ok" : "bg-err-soft text-err";
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${tone} ${className}`}>
      {r.msg}
      {r.rejected?.length > 0 && <ul className="mt-1 max-h-24 list-disc overflow-auto pl-4 text-xs font-normal">{r.rejected.slice(0, 10).map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}

export const Icon = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chev: <path d="M9 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  wifi: <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />,
};
export function Svg({ d, className = "h-5 w-5" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>;
}
