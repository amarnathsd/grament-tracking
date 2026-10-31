"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export const SCREENS = [
  { href: "/", label: "Flow & edge cases" },
  { href: "/orders", label: "1 Route config" },
  { href: "/batches", label: "2 Batch & labels" },
  { href: "/scan", label: "3 Process tracking" },
  { href: "/dashboard", label: "4 Dashboard" },
  { href: "/rework", label: "5 Rework" },
  { href: "/log", label: "6 Scan log & approvals" },
  { href: "/journey", label: "7 Garment journey" },
  { href: "/outsource", label: "8 Outsourcing" },
  { href: "/reconcile", label: "9 Reconciliation" },
  { href: "/shipping", label: "10 Shipping" },
];

export default function Nav() {
  const path = usePathname();
  const { state, api, user } = useStore();
  const open = state.requests.filter((r) => r.status === "Open").length;
  return (
    <header className="border-b border-slate-300 bg-slate-800 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2">
        <b className="text-sm">Company management · Garment tracking (wireframe)</b>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-slate-300">Acting as</span>
          <select
            value={user.id}
            onChange={(e) => api.settings({ userId: e.target.value })}
            className="rounded bg-slate-700 px-2 py-1 text-white"
          >
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}{u.role === "operator" ? ` (${u.procs.join(", ")})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => confirm("Reset all demo data to the starting sample?") && api.reset()}
            className="rounded border border-slate-500 px-2 py-1 hover:bg-slate-700"
          >
            Reset demo data
          </button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 pb-2">
        {SCREENS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`rounded px-2 py-1 text-xs ${path === s.href ? "bg-white text-slate-800" : "text-slate-200 hover:bg-slate-700"}`}
          >
            {s.label}
            {s.href === "/log" && open > 0 && <span className="ml-1 rounded bg-amber-400 px-1 text-slate-900">{open}</span>}
          </Link>
        ))}
      </nav>
    </header>
  );
}
