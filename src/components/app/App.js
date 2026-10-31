"use client";
// Phone app shell: bottom tabs, a screen stack per tab (push / back), one bottom sheet and a toast.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Icon, Svg } from "./kit";
import { Home, OrderScreen, StepScreen } from "./screens";
import { ScanScreen } from "./scan";
import { AlertsScreen, MeScreen } from "./more";
import { DashboardScreen } from "./dashboard";
import { RouteScreen } from "./route";
import { SHEETS } from "./sheets";

const SCREENS = { order: OrderScreen, step: StepScreen, route: RouteScreen, scan: ScanScreen };
const TABS = [
  { id: "home", label: "Home", icon: Icon.home, root: Home },
  { id: "scan", label: "Scan", icon: Icon.scan, root: ScanScreen },
  { id: "dash", label: "Dashboard", icon: Icon.chart, root: DashboardScreen },
  { id: "alerts", label: "Alerts", icon: Icon.bell, root: AlertsScreen },
  { id: "me", label: "Me", icon: Icon.user, root: MeScreen },
];

const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);

export default function App() {
  const { state } = useStore();
  const [tab, setTab] = useState("home");
  const [stacks, setStacks] = useState({ home: [], scan: [], dash: [], alerts: [], me: [] });
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const scroller = useRef(null);

  const notify = useCallback((r) => {
    if (!r?.msg) return;
    setToast(r);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const nav = useMemo(() => ({
    tab,
    push: (screen, props = {}) => {
      setStacks((s) => ({ ...s, [tab]: [...s[tab], { screen, props, key: Math.random() }] }));
      scroller.current?.scrollTo(0, 0);
    },
    back: () => setStacks((s) => ({ ...s, [tab]: s[tab].slice(0, -1) })),
    // jump to a tab, optionally opening a screen there
    go: (t, screen, props = {}) => {
      setTab(t);
      setStacks((s) => ({ ...s, [t]: screen ? [{ screen, props, key: Math.random() }] : [] }));
    },
    sheet: (name, props = {}) => setSheet({ name, props }),
    closeSheet: () => setSheet(null),
    notify,
  }), [tab, notify]);

  const stack = stacks[tab];
  const top = stack.at(-1);
  const Screen = top ? SCREENS[top.screen] : TABS.find((t) => t.id === tab).root;
  const Sheet = sheet && SHEETS[sheet.name];
  const open = state.requests.filter((r) => r.status === "Open").length;

  return (
    <NavCtx.Provider value={nav}>
      <div className="mx-auto flex h-dvh max-w-[430px] flex-col bg-bg sm:my-4 sm:h-[calc(100dvh-2rem)] sm:overflow-hidden sm:rounded-[2.5rem] sm:border-8 sm:border-ink sm:shadow-2xl">
        <div ref={scroller} className="no-scrollbar relative flex-1 overflow-y-auto">
          <div key={top?.key || tab} className="animate-push min-h-full pb-6">
            <Screen {...(top?.props || {})} />
          </div>
        </div>

        <nav className="grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => (t.id === tab ? setStacks((s) => ({ ...s, [t.id]: [] })) : setTab(t.id))}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${tab === t.id ? "text-brand" : "text-muted"}`}>
              <Svg d={t.icon} className="h-6 w-6" />
              {t.label}
              {t.id === "alerts" && open > 0 && <span className="absolute right-[30%] top-1.5 h-2 w-2 rounded-full bg-err" />}
            </button>
          ))}
        </nav>
      </div>

      {Sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <div className="animate-fade absolute inset-0 bg-ink/40" onClick={nav.closeSheet} />
          <div className="animate-sheet relative max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[1.75rem] bg-surface px-5 pb-8 pt-3">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <Sheet key={`${sheet.name}-${JSON.stringify(sheet.props)}`} {...sheet.props} />
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className={`animate-fade max-w-[400px] rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.requested ? "bg-warn" : toast.ok ? "bg-ok" : "bg-err"}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </NavCtx.Provider>
  );
}

// Screen header with optional back button.
export function Top({ title, sub, right, back = true }) {
  const nav = useNav();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 bg-bg/90 px-4 pb-2 pt-4 backdrop-blur">
      {back && (
        <button onClick={nav.back} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-sm">
          <Svg d={Icon.back} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}
