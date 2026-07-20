// app/dashboard/page.tsx
"use client";

import { useSession } from "@/context/SessionContext";
import Image from "next/image";

// Mock data — swap for a real API call once available.
const UPCOMING_EXAMS = [
  {
    id: "demo-exam",
    title: "Advanced Systems Architecture — Midterm",
    course: "CS 4410",
    date: "Jul 22, 2026",
    time: "10:00 AM",
    duration: "45 min",
  },
  {
    id: "networks-final",
    title: "Computer Networks — Final",
    course: "CS 3315",
    date: "Jul 28, 2026",
    time: "2:00 PM",
    duration: "90 min",
  },
  {
    id: "algo-quiz-3",
    title: "Algorithms — Quiz 3",
    course: "CS 2210",
    date: "Aug 3, 2026",
    time: "9:00 AM",
    duration: "30 min",
  },
];

const RECENT_HISTORY = [
  { id: "algo-quiz-2", title: "Algorithms — Quiz 2", date: "Jul 10, 2026", score: 92, flags: 0 },
  { id: "networks-mid", title: "Computer Networks — Midterm", date: "Jun 28, 2026", score: 78, flags: 1 },
  { id: "os-final", title: "Operating Systems — Final", date: "Jun 12, 2026", score: 85, flags: 0 },
];

function scoreColor(score: number) {
  if (score >= 85) return "text-accent";
  if (score >= 70) return "text-primary";
  return "text-destructive";
}

export default function StudentDashboardPage() {
  const { session } = useSession();

  const initials = (session?.name || session?.studentId || "?").slice(0, 2).toUpperCase();
  const avgScore = Math.round(
    RECENT_HISTORY.reduce((sum, h) => sum + h.score, 0) / RECENT_HISTORY.length
  );
  const totalFlags = RECENT_HISTORY.reduce((sum, h) => sum + h.flags, 0);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-body-sm text-muted-foreground">
        Please log in first.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      {/* Top app bar */}
      <header className="fixed top-0 z-50 flex h-16 w-full items-center border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-container-max-width items-center justify-between px-margin-mobile md:px-margin-desktop">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Image
                src="/logo-only-removebg-preview.png"
                alt="Proctoria Logo"
                width={28}
                height={28}
                className="h-7 w-7 rounded-full"
              />
              <span className="font-display text-headline-md font-bold text-foreground">Proctoria Student Terminal</span>
            </div>
            <nav className="hidden items-center gap-gutter md:flex">
              <a href="/dashboard" className="border-b-2 border-primary pb-1 font-mono text-label-md font-bold text-primary">
                Dashboard
              </a>
              <a href="/exams" className="ml-6 font-mono text-label-md text-muted-foreground transition-opacity hover:text-primary">
                Exams
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-gutter">
            <div className="flex items-center gap-4">
              <button className="rounded bg-destructive/20 px-4 py-2 font-mono text-label-md text-destructive transition-all hover:brightness-110 active:scale-95">
                End Session
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted font-mono text-label-sm text-foreground">
                {initials}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto flex min-h-screen w-full max-w-container-max-width flex-col px-margin-mobile pb-16 pt-24 md:px-margin-desktop">
        <div className="mb-10">
          <p className="font-mono text-label-sm uppercase tracking-widest text-accent">Welcome back</p>
          <h1 className="mt-1 font-display text-headline-lg text-foreground">
            {session.name || session.studentId}
          </h1>
        </div>

        {/* Stat cards */}
        <div className="mb-10 grid grid-cols-2 gap-gutter lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="material-symbols-outlined text-primary">calendar_month</span>
            </div>
            <p className="font-mono text-label-sm text-muted-foreground">Upcoming Exams</p>
            <p className="font-display text-headline-md text-foreground">{UPCOMING_EXAMS.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="material-symbols-outlined text-accent">task_alt</span>
            </div>
            <p className="font-mono text-label-sm text-muted-foreground">Completed</p>
            <p className="font-display text-headline-md text-foreground">{RECENT_HISTORY.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="material-symbols-outlined text-primary">bar_chart</span>
            </div>
            <p className="font-mono text-label-sm text-muted-foreground">Average Score</p>
            <p className={`font-display text-headline-md ${scoreColor(avgScore)}`}>{avgScore}%</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="material-symbols-outlined text-destructive">flag</span>
            </div>
            <p className="font-mono text-label-sm text-muted-foreground">Integrity Flags</p>
            <p className={`font-display text-headline-md ${totalFlags > 0 ? "text-destructive" : "text-accent"}`}>
              {totalFlags}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter">
          {/* Upcoming exams */}
          <div className="col-span-12 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-label-md uppercase tracking-widest text-muted-foreground">
                Upcoming Exams
              </h2>
              <a href="/exams" className="font-mono text-label-sm text-primary hover:underline">
                View all
              </a>
            </div>
            <div className="flex flex-col gap-3">
              {UPCOMING_EXAMS.map(function renderExam(exam) {
                const examHref = "/exam/" + exam.id + "/sit";
                return (
                  <div
                    key={exam.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined mt-0.5 shrink-0 text-primary">school</span>
                      <div>
                        <p className="font-mono text-label-sm uppercase tracking-widest text-muted-foreground">
                          {exam.course}
                        </p>
                        <h3 className="font-display text-body-lg font-semibold text-foreground">{exam.title}</h3>
                        <p className="mt-1 font-mono text-label-sm text-muted-foreground">
                          {exam.date} • {exam.time} • {exam.duration}
                        </p>
                      </div>
                    </div>
                    <a
                      href={examHref}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-mono text-label-md font-bold text-primary-foreground transition-all hover:brightness-105 active:scale-95"
                    >
                      Enter Terminal
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent history + integrity */}
          <div className="col-span-12 flex flex-col gap-gutter lg:col-span-5">
            <div className="rounded-lg border border-border bg-card/50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-accent">history</span>
                <h3 className="font-mono text-label-md uppercase tracking-widest text-accent">Recent Results</h3>
              </div>
              <div className="space-y-4">
                {RECENT_HISTORY.map(function renderHistory(h) {
                  return (
                    <div key={h.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-body text-body-sm text-foreground">{h.title}</p>
                        <p className="font-mono text-label-sm text-muted-foreground">{h.date}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`font-display text-body-lg font-bold ${scoreColor(h.score)}`}>{h.score}%</span>
                        {h.flags > 0 && (
                          <span className="font-mono text-label-sm text-destructive">
                            {h.flags} flag{h.flags === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
                <h3 className="font-mono text-label-md uppercase tracking-widest text-primary">Integrity Standing</h3>
              </div>
              <p className="font-body text-body-sm text-muted-foreground">
                Your account is in good standing. Flags are reviewed by course staff and do not
                automatically affect your grade.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}