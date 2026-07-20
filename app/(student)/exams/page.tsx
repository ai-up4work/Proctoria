// app/exams/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";

type ExamStatus = "upcoming" | "in-progress" | "completed";

interface MockExam {
  id: string;
  title: string;
  course: string;
  date: string;
  time: string;
  duration: string;
  status: ExamStatus;
  score?: number;
}

// Mock data — swap for a real API call once available.
const EXAMS: MockExam[] = [
  {
    id: "demo-exam",
    title: "Advanced Systems Architecture — Midterm",
    course: "CS 4410",
    date: "Jul 22, 2026",
    time: "10:00 AM",
    duration: "45 min",
    status: "upcoming",
  },
  {
    id: "networks-final",
    title: "Computer Networks — Final",
    course: "CS 3315",
    date: "Jul 28, 2026",
    time: "2:00 PM",
    duration: "90 min",
    status: "upcoming",
  },
  {
    id: "algo-quiz-3",
    title: "Algorithms — Quiz 3",
    course: "CS 2210",
    date: "Aug 3, 2026",
    time: "9:00 AM",
    duration: "30 min",
    status: "upcoming",
  },
  {
    id: "algo-quiz-2",
    title: "Algorithms — Quiz 2",
    course: "CS 2210",
    date: "Jul 10, 2026",
    time: "9:00 AM",
    duration: "30 min",
    status: "completed",
    score: 92,
  },
  {
    id: "networks-mid",
    title: "Computer Networks — Midterm",
    course: "CS 3315",
    date: "Jun 28, 2026",
    time: "2:00 PM",
    duration: "60 min",
    status: "completed",
    score: 78,
  },
  {
    id: "os-final",
    title: "Operating Systems — Final",
    course: "CS 3300",
    date: "Jun 12, 2026",
    time: "10:00 AM",
    duration: "90 min",
    status: "completed",
    score: 85,
  },
];

const FILTERS: { label: string; value: "all" | ExamStatus }[] = [
  { label: "All", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "In Progress", value: "in-progress" },
  { label: "Completed", value: "completed" },
];

function statusBadge(status: ExamStatus) {
  switch (status) {
    case "upcoming":
      return { label: "Upcoming", className: "bg-primary/15 text-primary" };
    case "in-progress":
      return { label: "In Progress", className: "bg-destructive/15 text-destructive" };
    case "completed":
      return { label: "Completed", className: "bg-accent/15 text-accent" };
  }
}

function scoreColor(score: number) {
  if (score >= 85) return "text-accent";
  if (score >= 70) return "text-primary";
  return "text-destructive";
}

export default function ExamsListPage() {
  const { session } = useSession();
  const [filter, setFilter] = useState<"all" | ExamStatus>("all");

  const initials = (session?.name || session?.studentId || "?").slice(0, 2).toUpperCase();

  const filteredExams = useMemo(
    () => (filter === "all" ? EXAMS : EXAMS.filter((e) => e.status === filter)),
    [filter]
  );

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
            <span className="font-display text-headline-md font-bold text-foreground">Proctoria Student Terminal</span>
            <nav className="hidden items-center gap-gutter md:flex">
              <a href="/dashboard" className="font-mono text-label-md text-muted-foreground transition-opacity hover:text-primary">
                Dashboard
              </a>
              <a href="/exams" className="ml-6 border-b-2 border-primary pb-1 font-mono text-label-md font-bold text-primary">
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
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-label-sm uppercase tracking-widest text-accent">All Exams</p>
            <h1 className="mt-1 font-display text-headline-lg text-foreground">Exam Schedule</h1>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 rounded-xl border border-border bg-card p-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded-lg px-4 py-2 font-mono text-label-sm transition-all ${
                  filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {filteredExams.map(function renderExam(exam) {
            const badge = statusBadge(exam.status);
            const examHref = "/exam/" + exam.id + "/sit";
            return (
              <div
                key={exam.id}
                className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-primary">school</span>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-mono text-label-sm uppercase tracking-widest text-muted-foreground">
                        {exam.course}
                      </p>
                      <span className={`rounded px-2 py-0.5 font-mono text-label-sm ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="font-display text-body-lg font-semibold text-foreground">{exam.title}</h3>
                    <p className="mt-1 font-mono text-label-sm text-muted-foreground">
                      {exam.date} • {exam.time} • {exam.duration}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  {exam.status === "completed" && exam.score !== undefined && (
                    <span className={`font-display text-headline-md font-bold ${scoreColor(exam.score)}`}>
                      {exam.score}%
                    </span>
                  )}
                  {exam.status === "upcoming" && (
                    <a
                      href={examHref}
                      className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-mono text-label-md font-bold text-primary-foreground transition-all hover:brightness-105 active:scale-95"
                    >
                      Enter Terminal
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </a>
                  )}
                  {exam.status === "in-progress" && (
                    <a
                      href={examHref}
                      className="flex items-center justify-center gap-2 rounded-lg bg-destructive/20 px-5 py-2.5 font-mono text-label-md font-bold text-destructive transition-all hover:brightness-110 active:scale-95"
                    >
                      Resume
                      <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    </a>
                  )}
                  {exam.status === "completed" && (
                    <button className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 font-mono text-label-md text-foreground transition-all hover:bg-muted active:scale-95">
                      View Report
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredExams.length === 0 && (
            <p className="py-10 text-center font-mono text-label-md text-muted-foreground">
              No exams in this category.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}