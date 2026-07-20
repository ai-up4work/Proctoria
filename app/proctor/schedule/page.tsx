// app/proctor/schedule/page.tsx
"use client";

import { CalendarDays, Clock, Radio, Users } from "lucide-react";

interface ScheduledExam {
  id: string;
  title: string;
  course: string;
  date: string;
  time: string;
  duration: string;
  enrolled: number;
  status: "live" | "upcoming" | "completed";
}

// Mock data — replace with a real scheduling API once available.
const EXAMS: ScheduledExam[] = [
  { id: "demo-exam", title: "Advanced Systems Architecture — Midterm", course: "CS 4410", date: "Jul 20, 2026", time: "10:00 AM", duration: "45 min", enrolled: 42, status: "live" },
  { id: "networks-final", title: "Computer Networks — Final", course: "CS 3315", date: "Jul 28, 2026", time: "2:00 PM", duration: "90 min", enrolled: 38, status: "upcoming" },
  { id: "algo-quiz-3", title: "Algorithms — Quiz 3", course: "CS 2210", date: "Aug 3, 2026", time: "9:00 AM", duration: "30 min", enrolled: 55, status: "upcoming" },
  { id: "os-final", title: "Operating Systems — Final", course: "CS 3300", date: "Jun 12, 2026", time: "10:00 AM", duration: "90 min", enrolled: 40, status: "completed" },
];

const STATUS_STYLES: Record<ScheduledExam["status"], { label: string; className: string }> = {
  live: { label: "Live Now", className: "bg-destructive text-background" },
  upcoming: { label: "Upcoming", className: "bg-secondary text-secondary-foreground" },
  completed: { label: "Completed", className: "bg-accent text-accent-foreground" },
};

export default function ExamSchedulePage() {
  const liveCount = EXAMS.filter((e) => e.status === "live").length;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-10 sticky top-0 z-30">
        <div className="flex flex-col">
          <h1 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
            Exam Schedule
          </h1>
          <span className="text-muted-foreground text-xs mt-1">
            {EXAMS.length} exams tracked • {liveCount} live right now
          </span>
        </div>
      </header>

      <section className="p-10 flex-1 space-y-4">
        {EXAMS.map(function renderExam(exam) {
          const styles = STATUS_STYLES[exam.status];
          return (
            <div
              key={exam.id}
              className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono">
                      {exam.course}
                    </p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${styles.className}`}>
                      {styles.label}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-foreground">{exam.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {exam.date} • {exam.time} • {exam.duration}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {exam.enrolled} enrolled
                    </span>
                  </div>
                </div>
              </div>

              {exam.status === "live" ? (
                <a
                  href="/proctor/dashboard"
                  className="flex items-center justify-center gap-2 bg-destructive text-background px-5 py-2.5 rounded-lg text-xs font-bold hover:brightness-110 active:scale-95 transition-all shrink-0"
                >
                  <Radio className="h-3.5 w-3.5" /> Monitor Live
                </a>
              ) : exam.status === "upcoming" ? (
                <button className="flex items-center justify-center gap-2 bg-muted text-foreground px-5 py-2.5 rounded-lg text-xs font-bold hover:bg-muted/70 active:scale-95 transition-all shrink-0">
                  Edit Schedule
                </button>
              ) : (
                <button className="flex items-center justify-center gap-2 border border-border text-foreground px-5 py-2.5 rounded-lg text-xs font-bold hover:bg-muted active:scale-95 transition-all shrink-0">
                  View Summary
                </button>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}