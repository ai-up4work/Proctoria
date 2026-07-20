// app/proctor/students/page.tsx
"use client";

import { useMemo, useState } from "react";
import { Search, ShieldAlert, ShieldCheck, User, Wifi, WifiOff } from "lucide-react";

interface StudentRecord {
  id: string;
  name: string;
  course: string;
  status: "online" | "offline";
  flags: number;
  lastExam: string;
  lastSeen: string;
}

// Mock data — replace with a real roster / API call once available.
const STUDENTS: StudentRecord[] = [
  { id: "S1024567", name: "Amara Fernando", course: "CS 4410", status: "online", flags: 0, lastExam: "Midterm — Advanced Systems", lastSeen: "Active now" },
  { id: "S1024812", name: "Kavindu Perera", course: "CS 4410", status: "online", flags: 3, lastExam: "Midterm — Advanced Systems", lastSeen: "Active now" },
  { id: "S1025901", name: "Nethmi Wickrama", course: "CS 3315", status: "offline", flags: 1, lastExam: "Networks Midterm", lastSeen: "2 hours ago" },
  { id: "S1026044", name: "Dinuka Silva", course: "CS 2210", status: "offline", flags: 0, lastExam: "Algorithms Quiz 2", lastSeen: "1 day ago" },
  { id: "S1026318", name: "Ishara Gunasekara", course: "CS 3300", status: "offline", flags: 2, lastExam: "Operating Systems Final", lastSeen: "3 days ago" },
  { id: "S1027102", name: "Tharindu Jayasuriya", course: "CS 4410", status: "online", flags: 0, lastExam: "Midterm — Advanced Systems", lastSeen: "Active now" },
];

export default function StudentDirectoryPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STUDENTS;
    return STUDENTS.filter(function matchesQuery(s) {
      return (
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.course.toLowerCase().includes(q)
      );
    });
  }, [query]);

  const onlineCount = STUDENTS.filter(function isOnline(s) {
    return s.status === "online";
  }).length;

  const flaggedCount = STUDENTS.filter(function hasFlags(s) {
    return s.flags > 0;
  }).length;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-10 sticky top-0 z-30">
        <div className="flex flex-col">
          <h1 className="font-display text-[length:var(--text-headline-md)] font-bold text-foreground">
            Student Directory
          </h1>
          <span className="text-muted-foreground text-xs mt-1">
            {STUDENTS.length} enrolled • {onlineCount} online now
          </span>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={function handleQueryChange(e) {
              setQuery(e.target.value);
            }}
            placeholder="Search by name, ID, or course…"
            className="rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm w-72 outline-none focus:border-accent text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </header>

      <section className="p-10 flex-1">
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-5">
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono mb-1">Total Students</p>
            <p className="font-display text-2xl font-semibold text-foreground">{STUDENTS.length}</p>
          </div>
          <div className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-5">
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono mb-1">Online Now</p>
            <p className="font-display text-2xl font-semibold text-accent">{onlineCount}</p>
          </div>
          <div className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-5">
            <p className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono mb-1">With Flags</p>
            <p className="font-display text-2xl font-semibold text-destructive">{flaggedCount}</p>
          </div>
        </div>

        <div className="bg-card/60 backdrop-blur-md border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                <th className="px-6 py-3 font-medium">Student</th>
                <th className="px-6 py-3 font-medium">Course</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Flags</th>
                <th className="px-6 py-3 font-medium">Last Exam</th>
                <th className="px-6 py-3 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(function renderStudent(s) {
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-xs">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground">ID {s.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{s.course}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`flex items-center gap-1.5 text-xs font-bold w-fit px-2 py-1 rounded-full ${
                          s.status === "online" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s.status === "online" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {s.status === "online" ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`flex items-center gap-1.5 text-xs font-bold ${
                          s.flags > 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {s.flags > 0 ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {s.flags}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{s.lastExam}</td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{s.lastSeen}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-xs text-muted-foreground">
                    <User className="h-4 w-4 mx-auto mb-2 opacity-40" />
                    No students match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}