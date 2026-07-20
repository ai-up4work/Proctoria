// app/proctor/flags/page.tsx
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Flag, Tally1 } from "lucide-react";

type Severity = "critical" | "moderate" | "minor";

interface ViolationFlag {
  id: string;
  studentId: string;
  studentName: string;
  message: string;
  severity: Severity;
  timestamp: string;
  exam: string;
}

// Mock data — replace with real flag history from the event stream once available.
const FLAGS: ViolationFlag[] = [
  { id: "f1", studentId: "S1024812", studentName: "Kavindu Perera", message: "Gaze away from screen for 12+ seconds.", severity: "critical", timestamp: "10:41:02", exam: "Advanced Systems — Midterm" },
  { id: "f2", studentId: "S1024812", studentName: "Kavindu Perera", message: "Attempted copy/paste while in terminal mode.", severity: "moderate", timestamp: "10:38:47", exam: "Advanced Systems — Midterm" },
  { id: "f3", studentId: "S1025901", studentName: "Nethmi Wickrama", message: "Browser window lost focus.", severity: "minor", timestamp: "09:52:14", exam: "Networks Midterm" },
  { id: "f4", studentId: "S1024812", studentName: "Kavindu Perera", message: "Face not detected in frame.", severity: "critical", timestamp: "10:29:33", exam: "Advanced Systems — Midterm" },
  { id: "f5", studentId: "S1026318", studentName: "Ishara Gunasekara", message: "Student switched tabs or minimized window.", severity: "moderate", timestamp: "Jun 12, 11:04", exam: "Operating Systems Final" },
  { id: "f6", studentId: "S1026318", studentName: "Ishara Gunasekara", message: "Multiple faces detected in frame.", severity: "critical", timestamp: "Jun 12, 10:58", exam: "Operating Systems Final" },
];

const SEVERITY_STYLES: Record<Severity, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-destructive text-background" },
  moderate: { label: "Moderate", className: "bg-secondary text-secondary-foreground" },
  minor: { label: "Minor", className: "bg-muted text-muted-foreground" },
};

const FILTERS: { label: string; value: "all" | Severity }[] = [
  { label: "All", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "Moderate", value: "moderate" },
  { label: "Minor", value: "minor" },
];

export default function ViolationFlagsPage() {
  const [filter, setFilter] = useState<"all" | Severity>("all");

  const filtered = useMemo(
    () => (filter === "all" ? FLAGS : FLAGS.filter((f) => f.severity === filter)),
    [filter]
  );

  const criticalCount = FLAGS.filter((f) => f.severity === "critical").length;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-10 sticky top-0 z-30">
        <div className="flex flex-col">
          <h1 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
            Violation Flags
          </h1>
          <span className="text-muted-foreground text-xs mt-1">
            {FLAGS.length} flags logged • {criticalCount} critical
          </span>
        </div>

        <div className="flex gap-2 rounded-xl border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <section className="p-10 flex-1 space-y-3">
        {filtered.map(function renderFlag(f) {
          const styles = SEVERITY_STYLES[f.severity];
          const monitorHref = "/monitor/" + f.studentId;
          return (
            <div
              key={f.id}
              className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-5 flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <AlertTriangle className={`h-4 w-4 ${f.severity === "critical" ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${styles.className}`}>
                      {styles.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{f.timestamp}</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">{f.studentName}</p>
                  <p className="text-xs text-muted-foreground">{f.message}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                    <Tally1 className="h-2.5 w-2.5" /> {f.exam}
                  </p>
                </div>
              </div>

              <a
                href={monitorHref}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-accent underline shrink-0 mt-1"
              >
                <Eye className="h-3.5 w-3.5" /> View feed
              </a>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-xs">
            <Flag className="h-5 w-5 opacity-40" />
            No flags at this severity level.
          </div>
        )}
      </section>
    </main>
  );
}