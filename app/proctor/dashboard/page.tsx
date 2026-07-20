// app/proctor/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useProctorSocket } from "@/hooks/useProctorSocket";

export default function ProctorDashboardPage() {
  const { session } = useSession();
  // Proctors need a stable clientId too, since Ably tokens are per-clientId.
  const { registerProctor, connected, roster, events, sendAlert } = useProctorSocket(
    session ? `proctor-${session.studentId}` : null
  );
  const [alertDrafts, setAlertDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (connected) registerProctor();
  }, [connected, registerProctor]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-xl font-bold">Proctor dashboard</h1>
          <p className="text-xs text-slate-400">{connected ? "Connected to monitoring hub" : "Connecting…"} · {roster.length} student(s)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roster.map((s) => {
            const state = s.lastStatus?.result?.state ?? "unknown";
            const Icon = state === "ok" ? CheckCircle2 : AlertCircle;
            const color = state === "ok" ? "text-green-400" : state === "warn" ? "text-amber-400" : "text-red-400";

            return (
              <div key={s.studentId} className="rounded-xl border border-cyan-500/30 bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{s.name || s.studentId}</p>
                    <p className="text-xs text-slate-400">ID {s.studentId}</p>
                  </div>
                  <span className={`text-xs ${s.connected ? "text-green-400" : "text-slate-500"}`}>
                    {s.connected ? "● online" : "○ offline"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className={`text-sm ${color}`}>{s.lastStatus?.result?.title ?? "No data yet"}</span>
                </div>

                <p className="text-xs text-slate-400">
                  Flags: <b className="text-slate-200">{s.lastStatus?.flagCount ?? 0}</b>
                </p>

                <a
                  href={`/monitor/${s.studentId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-cyan-400 underline"
                >
                  Open live feed ↗
                </a>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const msg = alertDrafts[s.studentId]?.trim();
                    if (!msg) return;
                    sendAlert(s.studentId, msg);
                    setAlertDrafts((prev) => ({ ...prev, [s.studentId]: "" }));
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={alertDrafts[s.studentId] || ""}
                    onChange={(e) => setAlertDrafts((prev) => ({ ...prev, [s.studentId]: e.target.value }))}
                    placeholder="Send alert to this student…"
                    className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-cyan-400"
                  />
                  <button type="submit" className="rounded-md bg-cyan-500 px-2 py-1 text-slate-950">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            );
          })}
          {roster.length === 0 && <p className="text-sm text-slate-500">No students connected yet.</p>}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Live event feed — all students</p>
          <div className="h-64 overflow-y-auto rounded-xl border border-cyan-500/20 bg-slate-900/40 p-3 text-xs space-y-1.5">
            {events.map((e, i) => (
              <div key={i}>
                <span className="text-slate-500">{new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}</span>{" "}
                <span className="text-cyan-400">{e.studentId}</span> — {e.message}
              </div>
            ))}
            {events.length === 0 && <p className="text-slate-500">No events yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}