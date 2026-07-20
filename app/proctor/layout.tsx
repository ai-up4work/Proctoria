// app/proctor/layout.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Flag,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";

const NAV_ITEMS = [
  { label: "Live Proctoring", icon: Radio, href: "/proctor/dashboard" },
  { label: "Student Directory", icon: Users, href: "/proctor/students" },
  { label: "Exam Schedule", icon: CalendarDays, href: "/proctor/schedule" },
  { label: "Violation Flags", icon: Flag, href: "/proctor/flags" },
  { label: "System Status", icon: Settings2, href: "/proctor/system" },
];

// Exposes the nav-drawer open/close state to any page under /proctor, so a
// page's own header can put a hamburger button that opens THIS sidebar,
// instead of every page re-implementing its own copy of the sidebar.
type NavDrawerContextValue = {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
};
const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export function useNavDrawer() {
  const ctx = useContext(NavDrawerContext);
  if (!ctx) {
    throw new Error("useNavDrawer must be used within the /proctor route tree (ProctorLayout)");
  }
  return ctx;
}

export default function ProctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer on route change so it doesn't stay open over the next page.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (navOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [navOpen]);

  // Let Escape close the drawer too.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <NavDrawerContext.Provider value={{ navOpen, setNavOpen }}>
      <div className="min-h-screen bg-background text-foreground font-body">
        {/* Backdrop for the mobile nav drawer only — each page is
            responsible for its own backdrop for any drawer it owns
            (e.g. the dashboard's event feed). */}
        {navOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* Sidebar Navigation — permanent column at lg+, slide-in drawer below it. */}
        <aside
          className={`h-screen w-[min(20rem,85vw)] sm:w-64 fixed left-0 top-0 border-r border-sidebar-border bg-sidebar flex flex-col py-2 z-40 transform transition-transform duration-300 ease-out ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0`}
        >
          <div className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="h-7 w-7 text-sidebar-primary shrink-0" strokeWidth={2} />
              <div className="flex flex-col min-w-0">
                <span className="font-display text-[length:var(--text-headline-md)] font-bold text-sidebar-primary leading-tight truncate">
                  Proctoria
                </span>
                <span className="text-[10px] tracking-widest text-sidebar-foreground/60 uppercase">
                  Enterprise Hub
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="p-2 -mr-2 text-sidebar-foreground/60 hover:text-sidebar-foreground lg:hidden touch-manipulation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="mt-6 sm:mt-8 flex-1 px-3 space-y-1 overflow-y-auto scrollbar-thin">
            {NAV_ITEMS.map(function renderNavItem(item) {
              const isActive =
                pathname === item.href || (pathname ? pathname.startsWith(item.href + "/") : false);
              const ItemIcon = item.icon;
              const linkClassName = isActive
                ? "flex items-center gap-4 px-4 py-3.5 sm:py-3 rounded-lg text-sidebar-primary font-bold border-r-4 border-sidebar-primary bg-sidebar-accent/10 transition-colors touch-manipulation"
                : "flex items-center gap-4 px-4 py-3.5 sm:py-3 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground transition-colors active:scale-[0.98] touch-manipulation";

              return (
                <a key={item.label} href={item.href} className={linkClassName}>
                  <ItemIcon className="h-4 w-4 shrink-0" />
                  <span className="text-sm">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="px-3 py-6 space-y-1 border-t border-sidebar-border">
            <button className="w-full flex items-center gap-3 px-4 py-3 sm:py-2 mb-4 bg-sidebar-primary text-sidebar-primary-foreground rounded-xl font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all touch-manipulation">
              <Plus className="h-4 w-4" />
              <span className="text-sm">Add Monitor</span>
            </button>
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground/80">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent/20 flex items-center justify-center text-sidebar-accent text-xs font-bold shrink-0">
                {(session?.studentId || "P").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-sidebar-foreground">Proctor</span>
                <span className="text-[10px] text-sidebar-foreground/60 truncate">
                  ID {session?.studentId ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Only offset content at lg+ where the sidebar is a permanent
            column. On mobile the sidebar is a drawer sitting above
            everything, so content stays full-width. */}
        <div className="lg:ml-64">{children}</div>
      </div>
    </NavDrawerContext.Provider>
  );
}