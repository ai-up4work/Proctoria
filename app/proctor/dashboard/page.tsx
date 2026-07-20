// app/proctor/dashboard/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Eye,
  EyeOff,
  Flag,
  History,
  Info,
  Loader2,
  MessageCircle,
  Plus,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  SwitchCamera,
  Users,
  Wifi,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useProctorSocket } from "@/hooks/useProctorSocket";
import { FLAG_CATEGORY_META, FlagCategory, FlagSeverity } from "@/lib/gaze";

const NAV_ITEMS = [
  { label: "Live Proctoring", icon: Radio, active: true, link: "/proctor/dashboard" },
  { label: "Student Directory", icon: Users, active: false, link: "/proctor/students" },
  { label: "Exam Schedule", icon: CalendarDays, active: false, link: "/proctor/schedule" },
  { label: "Violation Flags", icon: Flag, active: false, link: "/proctor/flags" },
  { label: "System Status", icon: Settings2, active: false, link: "/proctor/system" },
];

const QUICK_ALERT_MESSAGE = "Please keep your eyes on the screen and remain in frame.";

type Severity = "critical" | "warning" | "stable";

function severityOf(state: string | undefined): Severity {
  if (state === "warn") return "warning";
  if (state === "ok") return "stable";
  if (!state || state === "unknown") return "stable";
  return "critical";
}

type SeverityStyle = {
  badgeBg: string;
  badgeText: string;
  border: string;
  dot: string;
  label: string;
  icon: typeof CheckCircle2;
};

const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  critical: {
    badgeBg: "bg-destructive",
    badgeText: "text-background",
    border: "border-destructive/40 hover:border-destructive",
    dot: "text-destructive",
    label: "Critical Severity",
    icon: AlertTriangle,
  },
  warning: {
    badgeBg: "bg-secondary",
    badgeText: "text-secondary-foreground",
    border: "border-secondary/40 hover:border-secondary",
    dot: "text-secondary",
    label: "Moderate Severity",
    icon: AlertTriangle,
  },
  stable: {
    badgeBg: "bg-accent",
    badgeText: "text-accent-foreground",
    border: "border-border hover:border-accent",
    dot: "text-accent",
    label: "Stable Session",
    icon: CheckCircle2,
  },
};

// Event Feed color-coding — driven entirely by the FlagCategory each event
// carries (set at the source in useGazeMonitor / the tab-switch & clipboard
// listeners), never by re-parsing the free-text message. This keeps color,
// icon, and label permanently in sync with how the flag was actually
// classified when it fired.
const CATEGORY_ICONS: Record<FlagCategory, typeof Eye> = {
  no_face: EyeOff,
  multiple_faces: Users,
  gaze_away: Eye,
  head_away: RotateCcw,
  tab_switch: SwitchCamera,
  clipboard: Clipboard,
  system: Info,
};

type EventFeedStyle = {
  border: string;
  bg: string;
  text: string;
};

const SEVERITY_FEED_STYLES: Record<FlagSeverity, EventFeedStyle> = {
  critical: {
    border: "border-destructive",
    bg: "bg-destructive/10 hover:bg-destructive/20",
    text: "text-destructive",
  },
  warning: {
    border: "border-secondary",
    bg: "bg-secondary/10 hover:bg-secondary/20",
    text: "text-secondary",
  },
  info: {
    border: "border-border",
    bg: "bg-card/60 hover:bg-card",
    text: "text-muted-foreground",
  },
};

export default function ProctorDashboardPage() {
  const { session } = useSession();
  // Proctors need a stable clientId too, since Ably tokens are per-clientId.
  const { registerProctor, connected, connectionError, roster, events, sendAlert } = useProctorSocket(
    session ? `proctor-${session.studentId}` : null
  );
  const [alertDrafts, setAlertDrafts] = useState<Record<string, string>>({});
  const [justSent, setJustSent] = useState<Record<string, boolean>>({});
  const [feedFilter, setFeedFilter] = useState<"all" | "flags">("all");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (connected) registerProctor();
  }, [connected, registerProctor]);

  function flashSent(studentId: string) {
    setJustSent((prev) => ({ ...prev, [studentId]: true }));
    setTimeout(() => setJustSent((prev) => ({ ...prev, [studentId]: false })), 1500);
  }

  function submitDraft(studentId: string) {
    const msg = alertDrafts[studentId]?.trim();
    if (!msg) return;
    sendAlert(studentId, msg);
    setAlertDrafts((prev) => ({ ...prev, [studentId]: "" }));
    flashSent(studentId);
  }

  // "Alert" — fires an immediate canned warning without requiring typed text.
  function quickAlert(studentId: string) {
    sendAlert(studentId, QUICK_ALERT_MESSAGE);
    flashSent(studentId);
  }

  // "Message" — focuses the input so the proctor can type something custom.
  function focusMessageInput(studentId: string) {
    inputRefs.current[studentId]?.focus();
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground text-sm">
        Not logged in —{" "}
        <a href="/login" className="text-accent underline ml-1">
          go to /login
        </a>{" "}
        and sign in as a proctor.
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-destructive text-sm px-6 text-center">
        Realtime connection failed: {connectionError}
        <br />
        Check that ABLY_API_KEY is set and the dev server was restarted after adding it.
      </div>
    );
  }

  const flaggedCount = roster.reduce((sum, s) => sum + (s.lastStatus?.flagCount ?? 0), 0);

  const visibleEvents = events.filter(function passesFilter(e) {
    if (feedFilter === "all") return true;
    return FLAG_CATEGORY_META[e.category].severity !== "info";
  });

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      {/* Sidebar Navigation */}
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
            const NavIcon = item.icon;
            return (
              <a
                key={item.label}
                href={item.link}
                className={
                  item.active
                    ? "flex items-center gap-4 px-4 py-3 rounded-lg text-sidebar-primary font-bold border-r-4 border-sidebar-primary bg-sidebar-accent/10 transition-colors"
                    : "flex items-center gap-4 px-4 py-3 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground transition-colors active:scale-[0.98]"
                }
              >
                <NavIcon className="h-4 w-4" />
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
              {(session.studentId || "P").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-sidebar-foreground">Proctor</span>
              <span className="text-[10px] text-sidebar-foreground/60">ID {session.studentId}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="mr-80 min-h-screen flex flex-col relative">
        <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-10 sticky top-0 z-30">
          <div className="flex flex-col">
            <h1 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
              Active Session Monitoring
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-widest">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full bg-accent ${
                      connected ? "animate-ping opacity-75" : "opacity-0"
                    }`}
                  />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                </span>
                {connected ? "Live Monitoring" : "Connecting…"}
              </span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">
                {roster.length} student{roster.length === 1 ? "" : "s"} in session
              </span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono">
                  Total Students
                </span>
                <span className="font-display text-2xl font-semibold text-foreground">{roster.length}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono">
                  Active Flags
                </span>
                <span className="font-display text-2xl font-semibold text-destructive">{flaggedCount}</span>
              </div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="flex gap-3">
              <button className="p-2 text-muted-foreground hover:text-primary transition-colors">
                <Wifi className="h-5 w-5" />
              </button>
              <button className="bg-destructive/20 text-destructive px-6 py-2 rounded-lg font-bold text-sm hover:brightness-110 transition-all active:scale-95">
                End Session
              </button>
            </div>
          </div>
        </header>

        {/* Bento Grid of Student Cards */}
        <section className="p-10 overflow-y-auto scrollbar-thin flex-1">
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
            {roster.map(function renderStudentCard(s) {
              const state = s.lastStatus?.result?.state;
              const severity = severityOf(state);
              const styles = SEVERITY_STYLES[severity];
              const CardIcon = styles.icon;
              const flagCount = s.lastStatus?.flagCount ?? 0;
              const monitorHref = "/monitor/" + s.studentId;

              return (
                <div
                  key={s.studentId}
                  className={`bg-card/60 backdrop-blur-md border ${styles.border} rounded-xl overflow-hidden transition-all group`}
                >
                  <div className="relative h-32 bg-muted flex items-center justify-center">
                    <div
                      className={`h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold ${styles.badgeBg} ${styles.badgeText}`}
                    >
                      {(s.name || s.studentId).slice(0, 2).toUpperCase()}
                    </div>
                    <div
                      className={`absolute top-3 left-3 ${styles.badgeBg} ${styles.badgeText} px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tight`}
                    >
                      {s.lastStatus?.result?.title ?? "No data yet"}
                    </div>
                    <span
                      className={`absolute bottom-3 right-3 text-[10px] font-mono px-1.5 py-0.5 rounded-md backdrop-blur-md ${
                        s.connected ? "bg-accent/20 text-accent" : "bg-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {s.connected ? "● online" : "○ offline"}
                    </span>
                  </div>

                  <div className="p-4 bg-card">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-sm text-foreground">{s.name || s.studentId}</h3>
                        <p className="text-xs text-muted-foreground">ID {s.studentId}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`font-mono font-bold text-sm ${styles.dot}`}>
                          {flagCount} Flag{flagCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{styles.label}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <CardIcon className={`h-4 w-4 ${styles.dot}`} />
                      <a
                        href={monitorHref}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent underline flex items-center gap-0.5"
                      >
                        Open live feed <ChevronRight className="h-3 w-3" />
                      </a>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitDraft(s.studentId);
                      }}
                      className="flex gap-2 mb-2"
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current[s.studentId] = el;
                        }}
                        value={alertDrafts[s.studentId] || ""}
                        onChange={(e) =>
                          setAlertDrafts((prev) => ({ ...prev, [s.studentId]: e.target.value }))
                        }
                        placeholder="Send alert to this student…"
                        className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-accent text-foreground placeholder:text-muted-foreground"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 hover:brightness-110 active:scale-95 transition-all"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => quickAlert(s.studentId)}
                        className="flex items-center justify-center gap-2 bg-destructive/15 text-destructive py-2 rounded-lg text-xs font-bold hover:bg-destructive/25 transition-colors active:scale-95"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {justSent[s.studentId] ? "Sent!" : "Alert"}
                      </button>
                      <button
                        type="button"
                        onClick={() => focusMessageInput(s.studentId)}
                        className="flex items-center justify-center gap-2 bg-muted text-foreground py-2 rounded-lg text-xs font-bold hover:bg-muted/70 transition-colors active:scale-95"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Message
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {roster.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full">No students connected yet.</p>
            )}
          </div>
        </section>

        {/* Floating Action Button */}
        <button className="fixed bottom-10 right-[calc(320px+40px)] z-50 bg-primary text-primary-foreground w-14 h-14 rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:scale-105">
          <Bell className="h-6 w-6" />
        </button>
      </main>

      {/* Right Sidebar: Live Event Feed */}
      <aside className="w-80 h-screen fixed right-0 top-0 bg-sidebar border-l border-sidebar-border flex flex-col z-40">
        <div className="p-6 border-b border-sidebar-border bg-sidebar/50 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
              Event Feed
            </h2>
            <span className="bg-destructive/20 text-destructive text-[10px] font-mono px-2 py-0.5 rounded-full">
              LIVE
            </span>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setFeedFilter("all")}
              className={`flex-1 text-[10px] font-bold uppercase py-1 px-2 rounded border transition-colors ${
                feedFilter === "all"
                  ? "bg-muted text-foreground border-border"
                  : "border-transparent text-muted-foreground hover:bg-muted/50"
              }`}
            >
              All Events
            </button>
            <button
              type="button"
              onClick={() => setFeedFilter("flags")}
              className={`flex-1 text-[10px] font-bold uppercase py-1 px-2 rounded border transition-colors ${
                feedFilter === "flags"
                  ? "bg-destructive/15 text-destructive border-destructive/50"
                  : "border-transparent text-muted-foreground hover:bg-muted/50"
              }`}
            >
              Only Flags
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {visibleEvents.map(function renderEvent(e, i) {
            const meta = FLAG_CATEGORY_META[e.category];
            const styles = SEVERITY_FEED_STYLES[meta.severity];
            const EventIcon = CATEGORY_ICONS[e.category];
            return (
              <div
                key={i}
                className={`p-3 ${styles.bg} border-l-4 ${styles.border} rounded-r-lg cursor-pointer transition-colors`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-[10px] font-mono uppercase ${styles.text}`}>
                    {new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <EventIcon className={`h-3.5 w-3.5 ${styles.text}`} />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground">{e.studentId}</p>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight ${styles.bg} ${styles.text}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{e.message}</p>
              </div>
            );
          })}
          {visibleEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              No events yet.
            </div>
          )}
        </div>

        <div className="p-6 border-t border-sidebar-border">
          <button className="w-full py-3 bg-muted text-foreground font-bold text-sm rounded-lg border border-border hover:bg-muted/70 transition-all flex items-center justify-center gap-2">
            <History className="h-4 w-4" />
            <span>Session Archive</span>
          </button>
        </div>
      </aside>
    </div>
  );
}