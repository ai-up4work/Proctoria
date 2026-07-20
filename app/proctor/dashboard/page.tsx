// app/proctor/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Eye,
  EyeOff,
  History,
  Info,
  Loader2,
  Menu,
  MessageCircle,
  RotateCcw,
  Send,
  SwitchCamera,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useProctorSocket } from "@/hooks/useProctorSocket";
import { FLAG_CATEGORY_META, FlagCategory, FlagSeverity } from "@/lib/gaze";
import { useNavDrawer } from "../layout";

const QUICK_ALERT_MESSAGE = "Please keep your eyes on the screen and remain in frame.";

// All known flag categories, in the order we want them to appear as filter chips.
const ALL_CATEGORIES: FlagCategory[] = [
  "no_face",
  "multiple_faces",
  "gaze_away",
  "head_away",
  "tab_switch",
  "tab_away_prolonged",
  "clipboard",
  "system",
];

const SEVERITY_FILTERS: { value: "all" | FlagSeverity; label: string }[] = [
  { value: "all", label: "All Events" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

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
  tab_away_prolonged: AlertTriangle,
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
  // The nav sidebar itself now lives in app/proctor/layout.tsx (shared
  // across every /proctor/* page). This page only needs a way to open it
  // from its own header's hamburger button.
  const { setNavOpen } = useNavDrawer();

  // Proctors need a stable clientId too, since Ably tokens are per-clientId.
  const { registerProctor, connected, connectionError, roster, events, sendAlert } = useProctorSocket(
    session ? `proctor-${session.studentId}` : null
  );
  const [alertDrafts, setAlertDrafts] = useState<Record<string, string>>({});
  const [justSent, setJustSent] = useState<Record<string, boolean>>({});
  // Tracks which event-feed entries the proctor has clicked open to read in
  // full. Keyed by studentId+timestamp (stable across re-renders) rather
  // than array index, since new events are prepended and would otherwise
  // shift which card a given index points at.
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Event feed filters
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | FlagSeverity>("all");
  const [categoryFilters, setCategoryFilters] = useState<Set<FlagCategory>>(new Set());
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);

  // Below the lg breakpoint the event feed becomes a slide-in drawer
  // instead of a permanent column — there isn't horizontal room for both
  // fixed panels on a phone. The nav drawer's open state lives in the
  // shared layout instead (see useNavDrawer above).
  const [feedOpen, setFeedOpen] = useState(false);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Auto-open the feed drawer the first time a critical event comes in, so
  // a proctor glancing at the student grid on mobile doesn't miss it just
  // because the drawer happened to be closed. Only fires once per session
  // — if the proctor closes it again afterward, we don't keep re-opening it
  // on every subsequent critical event.
  const hasAutoOpenedFeedRef = useRef(false);
  const prevEventsLengthRef = useRef(0);

  useEffect(() => {
    if (events.length > prevEventsLengthRef.current) {
      // New events are prepended, so the newly-arrived ones are at the front.
      const newEvents = events.slice(0, events.length - prevEventsLengthRef.current);
      const hasCritical = newEvents.some((e) => FLAG_CATEGORY_META[e.category].severity === "critical");
      if (hasCritical && !hasAutoOpenedFeedRef.current) {
        setFeedOpen(true);
        hasAutoOpenedFeedRef.current = true;
      }
    }
    prevEventsLengthRef.current = events.length;
  }, [events]);

  useEffect(() => {
    if (connected) registerProctor();
  }, [connected, registerProctor]);

  // Lock body scroll while the event feed drawer is open on mobile.
  useEffect(() => {
    if (feedOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [feedOpen]);

  // Let proctors dismiss the feed drawer with Escape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFeedOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  function toggleCategory(category: FlagCategory) {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function toggleEventExpanded(key: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setStudentFilter("all");
    setSeverityFilter("all");
    setCategoryFilters(new Set());
  }

  // Jumping to a student's feed from their card is far more useful on
  // mobile if it also opens the drawer — otherwise the filter is applied
  // invisibly behind a closed panel.
  function filterFeedForStudent(studentId: string) {
    setStudentFilter(studentId);
    setFeedOpen(true);
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground text-sm px-6 text-center">
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

  const flaggedCount = roster.reduce((sum, s) => sum + s.flagCount, 0);

  const visibleEvents = events.filter(function passesFilter(e) {
    if (studentFilter !== "all" && e.studentId !== studentFilter) return false;
    const meta = FLAG_CATEGORY_META[e.category];
    if (severityFilter !== "all" && meta.severity !== severityFilter) return false;
    if (categoryFilters.size > 0 && !categoryFilters.has(e.category)) return false;
    return true;
  });

  const activeFilterCount =
    (studentFilter !== "all" ? 1 : 0) + (severityFilter !== "all" ? 1 : 0) + categoryFilters.size;

  return (
    <>
      {/* Backdrop for the event feed drawer only — the nav drawer's own
          backdrop lives in the shared layout. */}
      {feedOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={() => setFeedOpen(false)}
        />
      )}

      {/* Header — spans the full width of this page's content area. The
          shared layout already reserves lg:ml-64 for the sidebar, so this
          only needs to sit flush against that at lg+; on mobile it's full
          width with a hamburger that opens the shared sidebar. */}
      <header className="min-h-16 lg:h-20 fixed top-0 left-0 lg:left-64 right-0 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 lg:px-10 py-2 lg:py-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="p-2 -ml-1 text-muted-foreground hover:text-foreground lg:hidden shrink-0 touch-manipulation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="font-display text-sm sm:text-lg lg:text-[length:var(--text-headline-md)] font-bold text-foreground truncate">
              Active Session Monitoring
            </h1>
            <div className="flex items-center gap-2 sm:gap-3 mt-0.5 sm:mt-1 flex-wrap">
              <span className="flex items-center gap-1.5 sm:gap-2 text-accent text-[10px] sm:text-xs font-bold uppercase tracking-widest whitespace-nowrap">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full bg-accent ${
                      connected ? "animate-ping opacity-75" : "opacity-0"
                    }`}
                  />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                </span>
                {connected ? "Live" : "Connecting…"}
              </span>
              <span className="text-muted-foreground text-[10px] sm:text-xs">•</span>
              <span className="text-muted-foreground text-[10px] sm:text-xs whitespace-nowrap">
                {roster.length} student{roster.length === 1 ? "" : "s"}
              </span>
              {flaggedCount > 0 && (
                <>
                  <span className="text-muted-foreground text-[10px] sm:text-xs">•</span>
                  <span className="text-destructive text-[10px] sm:text-xs font-bold whitespace-nowrap">
                    {flaggedCount} flag{flaggedCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-6 lg:gap-8 shrink-0">
          <div className="hidden md:flex gap-6">
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
          <div className="hidden md:block h-10 w-px bg-border" />

          {/* Feed toggle — only meaningful below lg, where the Event Feed is
              a drawer rather than an always-visible column. */}
          <button
            type="button"
            onClick={() => setFeedOpen(true)}
            aria-label={`Open event feed${flaggedCount > 0 ? ` (${flaggedCount} flags)` : ""}`}
            className="relative p-2.5 text-muted-foreground hover:text-primary transition-colors lg:hidden touch-manipulation"
          >
            <Bell className="h-5 w-5" />
            {flaggedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-background text-[10px] font-bold leading-none flex items-center justify-center border-2 border-background">
                {flaggedCount > 99 ? "99+" : flaggedCount}
              </span>
            )}
          </button>

          <button className="hidden lg:block p-2 text-muted-foreground hover:text-primary transition-colors">
            <Wifi className="h-5 w-5" />
          </button>
          <button className="bg-destructive/20 text-destructive px-2.5 sm:px-6 py-2 rounded-lg font-bold text-xs sm:text-sm hover:brightness-110 transition-all active:scale-95 whitespace-nowrap touch-manipulation">
            <span className="sm:hidden">End</span>
            <span className="hidden sm:inline">End Session</span>
          </button>
        </div>
      </header>

      {/* Main Content — no lg:ml-64 here: the shared layout already applies
          that margin around {children}, so adding it again would double
          the offset and push this whole page off past the sidebar. */}
      <main className="min-h-screen flex flex-col relative pt-[4.5rem] lg:pt-20 lg:mr-80">
        {/* Bento Grid of Student Cards */}
        <section className="p-3 sm:p-6 lg:p-10 overflow-y-auto scrollbar-thin flex-1">
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {roster.map(function renderStudentCard(s) {
              const state = s.lastStatus?.result?.state;
              const severity = severityOf(state);
              const styles = SEVERITY_STYLES[severity];
              const CardIcon = styles.icon;
              const flagCount = s.flagCount;
              const monitorHref = "/monitor/" + s.studentId;

              return (
                <div
                  key={s.studentId}
                  className={`bg-card/60 backdrop-blur-md border ${styles.border} rounded-xl overflow-hidden transition-all group`}
                >
                  <div className="relative h-24 sm:h-32 bg-muted flex items-center justify-center">
                    <div
                      className={`h-12 w-12 sm:h-16 sm:w-16 rounded-full flex items-center justify-center text-base sm:text-xl font-bold ${styles.badgeBg} ${styles.badgeText}`}
                    >
                      {(s.name || s.studentId).slice(0, 2).toUpperCase()}
                    </div>
                    <div
                      className={`absolute top-2.5 left-2.5 sm:top-3 sm:left-3 ${styles.badgeBg} ${styles.badgeText} px-2 py-1 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-tight max-w-[70%] truncate`}
                    >
                      {s.lastStatus?.result?.title ?? "No data yet"}
                    </div>
                    <span
                      className={`absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded-md backdrop-blur-md ${
                        s.connected ? "bg-accent/20 text-accent" : "bg-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {s.connected ? "● online" : "○ offline"}
                    </span>
                  </div>

                  <div className="p-3 sm:p-4 bg-card">
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-foreground truncate">{s.name || s.studentId}</h3>
                        <p className="text-xs text-muted-foreground truncate">ID {s.studentId}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={`font-mono font-bold text-sm ${styles.dot}`}>
                          {flagCount} Flag{flagCount === 1 ? "" : "s"}
                        </span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{styles.label}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <CardIcon className={`h-4 w-4 shrink-0 ${styles.dot}`} />
                      <a
                        href={monitorHref}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent underline flex items-center gap-0.5 py-1 touch-manipulation"
                      >
                        Open live feed <ChevronRight className="h-3 w-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => filterFeedForStudent(s.studentId)}
                        className="ml-auto text-[10px] font-mono text-muted-foreground underline decoration-dotted hover:text-accent py-1 touch-manipulation"
                      >
                        Filter feed
                      </button>
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
                        className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-2 sm:py-1.5 text-xs outline-none focus:border-accent text-foreground placeholder:text-muted-foreground"
                      />
                      <button
                        type="submit"
                        aria-label="Send alert"
                        className="rounded-md bg-primary text-primary-foreground px-3 py-2 sm:px-2.5 sm:py-1.5 hover:brightness-110 active:scale-95 transition-all shrink-0 touch-manipulation"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => quickAlert(s.studentId)}
                        className="flex items-center justify-center gap-2 bg-destructive/15 text-destructive py-2.5 sm:py-2 rounded-lg text-xs font-bold hover:bg-destructive/25 transition-colors active:scale-95 touch-manipulation"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {justSent[s.studentId] ? "Sent!" : "Alert"}
                      </button>
                      <button
                        type="button"
                        onClick={() => focusMessageInput(s.studentId)}
                        className="flex items-center justify-center gap-2 bg-muted text-foreground py-2.5 sm:py-2 rounded-lg text-xs font-bold hover:bg-muted/70 transition-colors active:scale-95 touch-manipulation"
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
      </main>

      {/* Right Sidebar: Live Event Feed — permanent column at lg+ (sits
          below the header there), slide-in drawer covering full height
          (including under the header) below lg. This one is dashboard-
          specific, so it stays local to this page rather than moving to
          the shared layout. */}
      <aside
        className={`w-full sm:max-w-sm lg:w-80 fixed right-0 top-0 lg:top-20 h-[100dvh] lg:h-[calc(100vh-5rem)] bg-sidebar border-l border-sidebar-border flex flex-col z-40 transform transition-transform duration-300 ease-out ${
          feedOpen ? "translate-x-0" : "translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="p-4 sm:p-6 border-b border-sidebar-border bg-sidebar/50 backdrop-blur-md space-y-4 overflow-y-auto scrollbar-thin shrink-0 max-h-[70vh] lg:max-h-none">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
              Event Feed
            </h2>
            <div className="flex items-center gap-2">
              <span className="bg-destructive/20 text-destructive text-[10px] font-mono px-2 py-0.5 rounded-full">
                LIVE
              </span>
              <button
                type="button"
                onClick={() => setFeedOpen(false)}
                aria-label="Close event feed"
                className="p-2 -mr-2 text-muted-foreground hover:text-foreground lg:hidden touch-manipulation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Student filter */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Student
            </label>
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-2 sm:py-1.5 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="all">All Students</option>
              {roster.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.name || s.studentId}
                </option>
              ))}
            </select>
          </div>

          {/* Severity filter */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Severity
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITY_FILTERS.map((sf) => (
                <button
                  key={sf.value}
                  type="button"
                  onClick={() => setSeverityFilter(sf.value)}
                  className={`text-[10px] font-bold uppercase py-1.5 px-2 rounded border transition-colors touch-manipulation ${
                    severityFilter === sf.value
                      ? sf.value === "critical"
                        ? "bg-destructive/15 text-destructive border-destructive/50"
                        : sf.value === "warning"
                        ? "bg-secondary/15 text-secondary border-secondary/50"
                        : "bg-muted text-foreground border-border"
                      : "border-transparent text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {sf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter — multi-select chips, collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setCategoryPanelOpen((prev) => !prev)}
              className="mb-1 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors py-1 touch-manipulation"
            >
              <span className="flex items-center gap-1.5">
                Category
                {categoryFilters.size > 0 && (
                  <span className="rounded-full bg-accent/15 text-accent px-1.5 py-0.5 text-[9px] font-mono normal-case tracking-normal">
                    {categoryFilters.size}
                  </span>
                )}
              </span>
              {categoryPanelOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
            {categoryPanelOpen && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ALL_CATEGORIES.map((cat) => {
                  const meta = FLAG_CATEGORY_META[cat];
                  const CatIcon = CATEGORY_ICONS[cat];
                  const active = categoryFilters.has(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-1 text-[10px] font-bold uppercase py-1.5 px-2 rounded border transition-colors touch-manipulation ${
                        active
                          ? "bg-accent/15 text-accent border-accent/50"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <CatIcon className="h-3 w-3" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-destructive py-1 touch-manipulation"
            >
              <X className="h-3 w-3" />
              Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 min-h-0">
          {visibleEvents.map(function renderEvent(e, i) {
            const meta = FLAG_CATEGORY_META[e.category];
            const styles = SEVERITY_FEED_STYLES[meta.severity];
            const EventIcon = CATEGORY_ICONS[e.category];
            const key = `${e.studentId}-${e.timestamp}-${i}`;
            const isLong = e.message.length > 90;
            const expanded = expandedEvents.has(key);
            const displayMessage = isLong && !expanded ? e.message.slice(0, 90).trimEnd() + "…" : e.message;
            return (
              <div
                key={key}
                onClick={() => isLong && toggleEventExpanded(key)}
                className={`p-3 ${styles.bg} border-l-4 ${styles.border} rounded-r-lg transition-colors touch-manipulation ${
                  isLong ? "cursor-pointer" : "cursor-default"
                }`}
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
                <p className="text-xs text-muted-foreground leading-tight break-words">{displayMessage}</p>
                {isLong && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggleEventExpanded(key);
                    }}
                    className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${styles.text} underline decoration-dotted py-1 touch-manipulation`}
                  >
                    {expanded ? "Show less" : "Click to view full text"}
                  </button>
                )}
              </div>
            );
          })}
          {visibleEvents.length === 0 && events.length > 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground text-xs text-center px-4">
              <Info className="h-4 w-4" />
              No events match the current filters.
              <button type="button" onClick={clearFilters} className="text-accent underline touch-manipulation">
                Clear filters
              </button>
            </div>
          )}
          {events.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              No events yet.
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 border-t border-sidebar-border shrink-0">
          <button className="w-full py-3 bg-muted text-foreground font-bold text-sm rounded-lg border border-border hover:bg-muted/70 transition-all flex items-center justify-center gap-2 touch-manipulation">
            <History className="h-4 w-4" />
            <span>Session Archive</span>
          </button>
        </div>
      </aside>
    </>
  );
}