// app/proctor/layout.tsx
"use client";

import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Flag,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";

const NAV_ITEMS = [
  { label: "Live Proctoring", icon: Radio, href: "/proctor/dashboard" },
  { label: "Student Directory", icon: Users, href: "/proctor/students" },
  { label: "Exam Schedule", icon: CalendarDays, href: "/proctor/schedule" },
  { label: "Violation Flags", icon: Flag, href: "/proctor/flags" },
  { label: "System Status", icon: Settings2, href: "/proctor/system" },
];

export default function ProctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <aside className="h-screen w-64 fixed left-0 top-0 border-r border-sidebar-border bg-sidebar flex flex-col py-2 z-40">
        <div className="px-6 py-4 flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-sidebar-primary" strokeWidth={2} />
          <div className="flex flex-col">
            <span className="font-display text-[length:var(--text-headline-md)] font-bold text-sidebar-primary leading-tight">
              Proctoria
            </span>
            <span className="text-[10px] tracking-widest text-sidebar-foreground/60 uppercase">
              Enterprise Hub
            </span>
          </div>
        </div>

        <nav className="mt-8 flex-1 px-3 space-y-1">
          {NAV_ITEMS.map(function renderNavItem(item) {
            const isActive = pathname === item.href || (pathname ? pathname.startsWith(item.href + "/") : false);
            const ItemIcon = item.icon;
            const linkClassName = isActive
              ? "flex items-center gap-4 px-4 py-3 rounded-lg text-sidebar-primary font-bold border-r-4 border-sidebar-primary bg-sidebar-accent/10 transition-colors"
              : "flex items-center gap-4 px-4 py-3 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground transition-colors active:scale-[0.98]";

            return (
              <a key={item.label} href={item.href} className={linkClassName}>
                <ItemIcon className="h-4 w-4" />
                <span className="text-sm">{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="px-3 py-6 space-y-1 border-t border-sidebar-border">
          <button className="w-full flex items-center gap-3 px-4 py-2 mb-4 bg-sidebar-primary text-sidebar-primary-foreground rounded-xl font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all">
            <Plus className="h-4 w-4" />
            <span className="text-sm">Add Monitor</span>
          </button>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground/80">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent/20 flex items-center justify-center text-sidebar-accent text-xs font-bold">
              {(session?.studentId || "P").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-sidebar-foreground">Proctor</span>
              <span className="text-[10px] text-sidebar-foreground/60">
                ID {session?.studentId ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="ml-64">{children}</div>
    </div>
  );
}