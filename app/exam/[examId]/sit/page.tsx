// app/exam/[examId]/sit/page.tsx
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useGazeMonitor } from "@/hooks/useGazeMonitor";
import { useProctorSocket } from "@/hooks/useProctorSocket";

// Replace with your real question set / API call.
const MOCK_QUESTIONS = [
  { id: "q1", text: "What is the time complexity of binary search?", options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"] },
  { id: "q2", text: "Which HTTP method is idempotent?", options: ["POST", "PUT", "PATCH", "CONNECT"] },
  { id: "q3", text: "React hooks must be called…", options: ["Conditionally", "Inside loops", "At the top level", "Inside classes"] },
];

export default function ExamSitPage() {
  const { session } = useSession();
  const { registerStudent, sendStatus, sendFlag, connected, alert, clearAlert } = useProctorSocket(
    session?.studentId ?? null
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [banner, setBanner] = useState<{ message: string; timestamp: number } | null>(null);

  const { videoRef, start, running, modelReady } = useGazeMonitor({
    // drawOverlay left false — this page never shows the feed to the student
    onStatus: (status) => {
      if (session) {
        sendStatus(session.studentId, {
          result: status.result,
          metrics: status.metrics,
          flagCount: status.flagCount,
          awayTime: status.awayTime,
          sessionTime: status.sessionTime,
        });
      }
    },
    onFlag: (flag) => {
      if (session) sendFlag(session.studentId, flag.message, flag.timestamp);
    },
  });

  // Register with the hub and auto-start monitoring once both the socket
  // and the model are ready.
  useEffect(() => {
    if (session && connected) registerStudent(session.name);
  }, [session, connected, registerStudent]);

  useEffect(() => {
    if (modelReady && !running) start();
  }, [modelReady, running, start]);

  // Surface only alerts addressed to *this* student (server already filters
  // by studentId before it reaches this client at all).
  useEffect(() => {
    if (alert) {
      setBanner(alert);
      clearAlert();
    }
  }, [alert, clearAlert]);

  // Tab-switch / window-blur detection — flagged the same way as gaze events.
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && session) {
        sendFlag(session.studentId, "Student switched tabs or minimized the window.", Date.now());
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [session, sendFlag]);

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center text-slate-300 bg-slate-950">Please log in first.</div>;
  }

  const question = MOCK_QUESTIONS[current];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hidden video element — camera runs, nothing rendered to the student. */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      <header className="border-b border-cyan-500/20 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Exam in progress</p>
          <p className="text-xs text-slate-400">
            {session.name} · ID {session.studentId} · monitoring {running ? "active" : "starting…"}
          </p>
        </div>
        <a href={`/monitor/${session.studentId}`} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 underline">
          View my monitoring feed ↗
        </a>
      </header>

      {/* Alert banner — visible to this student only, when the proctor sends one. */}
      {banner && (
        <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{banner.message}</span>
          </div>
          <button onClick={() => setBanner(null)} aria-label="Dismiss alert">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-xs uppercase tracking-wide text-cyan-400 mb-2">
          Question {current + 1} of {MOCK_QUESTIONS.length}
        </p>
        <h2 className="text-xl font-semibold mb-6">{question.text}</h2>

        <div className="space-y-3">
          {question.options.map((opt) => (
            <label
              key={opt}
              className={`block cursor-pointer rounded-lg border px-4 py-3 text-sm ${
                answers[question.id] === opt ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                className="mr-3"
                checked={answers[question.id] === opt}
                onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: opt }))}
              />
              {opt}
            </label>
          ))}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            disabled={current === 0}
            onClick={() => setCurrent((c) => c - 1)}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <button
            disabled={current === MOCK_QUESTIONS.length - 1}
            onClick={() => setCurrent((c) => c + 1)}
            className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}