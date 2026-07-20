// app/exam/[examId]/sit/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { useGazeMonitor } from "@/hooks/useGazeMonitor";
import { useProctorSocket } from "@/hooks/useProctorSocket";

import { MOCK_QUESTIONS } from "@/lib/mockQuestions";
import { FlagCategory } from "@/lib/gaze";

const SESSION_SECONDS = 45 * 60;

// Escalation ladder for a student who stays away from the exam tab.
// The longer the absence runs, the more severe the category (which drives
// the dashboard's red/amber coloring) and the tighter the re-flag interval
// — a 5-second glance away shouldn't read the same as a 2-minute absence.
// Intervals are chosen well above the browser's ~1s background-timer clamp
// so they fire reliably even while the tab is backgrounded.
const AWAY_TIERS: { afterSeconds: number; intervalMs: number; category: FlagCategory }[] = [
  { afterSeconds: 0, intervalMs: 10000, category: "tab_switch" },
  { afterSeconds: 30, intervalMs: 7000, category: "tab_away_prolonged" },
  { afterSeconds: 90, intervalMs: 4000, category: "tab_away_prolonged" },
];

function tierFor(awaySeconds: number) {
  let tier = AWAY_TIERS[0];
  for (const t of AWAY_TIERS) {
    if (awaySeconds >= t.afterSeconds) tier = t;
  }
  return tier;
}

function awayMessage(awaySeconds: number) {
  if (awaySeconds < 30) return `Still away from the exam tab (${awaySeconds}s and counting).`;
  if (awaySeconds < 90) return `Prolonged absence — away from the exam tab for ${awaySeconds}s. Escalating.`;
  const m = Math.floor(awaySeconds / 60);
  const s = awaySeconds % 60;
  return `Extended absence — away from the exam tab for ${m}m ${s}s. Immediate review recommended.`;
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ExamSitPage() {
  const { session } = useSession();
  const { registerStudent, sendStatus, sendFlag, connected, connectionError, alert, clearAlert } = useProctorSocket(
    session?.studentId ?? null
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [banner, setBanner] = useState<{ message: string; timestamp: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);

  const { videoRef, start, running, modelReady, modelStatus, errorMsg } = useGazeMonitor({
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
      if (session) sendFlag(session.studentId, flag.message, flag.timestamp, flag.category);
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

  // Tab-switch / window-blur detection.
  //
  // NOTE: this is intentionally the *only* signal we trust while the tab is
  // hidden. The gaze loop (useGazeMonitor) is driven by requestAnimationFrame,
  // which browsers throttle heavily in background tabs — and even if it kept
  // running, most browsers pause video frame decoding for a backgrounded
  // tab, so MediaPipe would just keep re-analyzing the last frame it saw
  // before the switch. That means gaze/face state can silently go stale and
  // keep reporting "Verified" the whole time the student is away. So instead
  // of trying to keep gaze detection alive in the background, we treat
  // document.hidden as authoritative: push an immediate "away" status the
  // moment the tab is hidden (so the proctor dashboard doesn't keep showing
  // stale green), and keep re-flagging on an interval for as long as the
  // student stays away, so a 5-minute absence produces more than one log
  // line. On return, we log how long they were gone and let the gaze loop
  // resume producing real status updates on its own.
  useEffect(() => {
    if (!session) return;

    let awayTimeout: ReturnType<typeof setTimeout> | null = null;
    let hiddenSince: number | null = null;

    function scheduleNextCheck() {
      if (hiddenSince === null || !session) return;
      const awaySeconds = Math.round((Date.now() - hiddenSince) / 1000);
      const tier = tierFor(awaySeconds);

      sendFlag(session.studentId, awayMessage(awaySeconds), Date.now(), tier.category);

      // Once this crosses into the critical tier, push a status update too
      // — not just a feed entry — so the student's card on the dashboard
      // itself turns critical, in case the proctor isn't watching the feed.
      if (tier.category === "tab_away_prolonged") {
        sendStatus(session.studentId, {
          result: {
            state: "bad",
            title: "Prolonged Absence",
            sub: awayMessage(awaySeconds),
            faceDetected: false,
            gazeLabel: "unknown",
            confidence: 0,
          },
        });
      }

      awayTimeout = setTimeout(scheduleNextCheck, tier.intervalMs);
    }

    function handleVisibility() {
      if (!session) return;

      if (document.hidden) {
        hiddenSince = Date.now();

        sendFlag(session.studentId, "Student switched tabs or minimized the window.", Date.now(), "tab_switch");

        // Immediately mark the student as "away" for the dashboard, rather
        // than leaving whatever gaze-loop status was last computed (which
        // will not update again until the tab is visible).
        sendStatus(session.studentId, {
          result: {
            state: "bad",
            title: "Tab Away",
            sub: "Student navigated away from the exam tab",
            faceDetected: false,
            gazeLabel: "unknown",
            confidence: 0,
          },
        });

        awayTimeout = setTimeout(scheduleNextCheck, AWAY_TIERS[0].intervalMs);
      } else {
        if (awayTimeout) {
          clearTimeout(awayTimeout);
          awayTimeout = null;
        }
        if (hiddenSince !== null) {
          const awaySeconds = Math.round((Date.now() - hiddenSince) / 1000);
          sendFlag(
            session.studentId,
            `Returned to the exam tab after ${awaySeconds}s away.`,
            Date.now(),
            "tab_switch"
          );
          hiddenSince = null;
        }
        // The gaze loop's own onStatus callback will resume publishing
        // fresh status on its next processed frame — nothing to do here.
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (awayTimeout) clearTimeout(awayTimeout);
    };
  }, [session, sendFlag, sendStatus]);

  // Session countdown — paused while monitoring is blocked (camera error),
  // so a student can't run the clock out by denying camera access.
  useEffect(() => {
    if (errorMsg) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [errorMsg]);

  // Copy/paste restriction inside terminal mode.
  //
  // We deliberately listen on the "copy" / "paste" events themselves rather
  // than keydown — clipboardData (the actual text) is only exposed on those
  // events, and keydown also misses right-click "Paste" from the context
  // menu. Content is truncated before being sent so a proctor reviewing the
  // flag gets useful context without a giant blob landing in the feed.
  useEffect(() => {
    function truncate(text: string, max = 200) {
      const trimmed = text.trim();
      if (!trimmed) return "";
      return trimmed.length <= max ? trimmed : trimmed.slice(0, max) + "…";
    }

    function handleCopy(e: ClipboardEvent) {
      if (!session) return;
      e.preventDefault();
      const selected = truncate(window.getSelection()?.toString() ?? "");
      const preview = selected ? ` Captured text: "${selected}"` : " (could not capture selected text.)";
      sendFlag(session.studentId, `Attempted to copy while in terminal mode.${preview}`, Date.now(), "clipboard");
    }

    function handleCut(e: ClipboardEvent) {
      if (!session) return;
      e.preventDefault();
      const selected = truncate(window.getSelection()?.toString() ?? "");
      const preview = selected ? ` Captured text: "${selected}"` : " (could not capture selected text.)";
      sendFlag(session.studentId, `Attempted to cut while in terminal mode.${preview}`, Date.now(), "clipboard");
    }

    function handlePaste(e: ClipboardEvent) {
      if (!session) return;
      e.preventDefault();
      const pasted = truncate(e.clipboardData?.getData("text/plain") ?? "");
      const preview = pasted ? ` Captured content: "${pasted}"` : " (clipboard was empty or non-text.)";
      sendFlag(session.studentId, `Attempted to paste while in terminal mode.${preview}`, Date.now(), "clipboard");
    }

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
    };
  }, [session, sendFlag]);

  const question = MOCK_QUESTIONS[current];
  const progressPct = useMemo(() => Math.round(((current + 1) / MOCK_QUESTIONS.length) * 100), [current]);
  const initials = (session?.name || session?.studentId || "?").slice(0, 2).toUpperCase();
  const myFeedHref = session ? "/monitor/" + session.studentId : "/monitor";

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  }

  function goTo(index: number) {
    setCurrent(Math.min(Math.max(index, 0), MOCK_QUESTIONS.length - 1));
  }

  function handleEndSession() {
    if (typeof window !== "undefined" && window.confirm("End this exam session? You won't be able to resume.")) {
      window.location.href = "/login";
    }
  }

  function retryCamera() {
    // start() itself no-ops if already running, and re-requests getUserMedia
    // on the next call since runningRef will still be false after a failure.
    start();
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-body-sm text-muted-foreground">
        Please log in first.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      {/* Hidden video element — camera runs, nothing rendered to the student. */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Blocking overlay — camera/model failure. The exam is not usable
          until monitoring is restored, so a student can't silently continue
          unproctored. */}
      {errorMsg && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6 backdrop-blur-md">
          <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-8 text-center shadow-2xl">
            <span
              className="material-symbols-outlined mb-4 text-4xl text-destructive"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              videocam_off
            </span>
            <h2 className="mb-2 font-display text-headline-md font-bold text-foreground">
              Monitoring Interrupted
            </h2>
            <p className="mb-6 font-body text-body-sm text-muted-foreground">{errorMsg}</p>
            <p className="mb-6 font-mono text-label-sm text-muted-foreground">
              Camera access is required for the duration of this exam. Please allow camera permissions in your
              browser and try again.
            </p>
            <button
              onClick={retryCamera}
              className="w-full rounded-lg bg-primary px-6 py-3 font-mono text-label-md font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-95"
            >
              Retry Camera Access
            </button>
          </div>
        </div>
      )}

      {/* Top app bar */}
      <header className="fixed top-0 z-50 flex h-16 w-full items-center border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-container-max-width items-center justify-between px-margin-mobile md:px-margin-desktop">
          <div className="flex items-center gap-6">
            <span className="font-display text-headline-md font-bold text-foreground">Proctoria Student Terminal</span>
            <nav className="hidden items-center gap-gutter md:flex">
              <a href="/dashboard" className="font-mono text-label-md text-muted-foreground transition-opacity hover:text-primary">
                Dashboard
              </a>
              <a href="/exams" className="ml-6 font-mono text-label-md text-muted-foreground transition-opacity hover:text-primary">
                Exams
              </a>
              <a href={myFeedHref} className="ml-6 border-b-2 border-primary pb-1 font-mono text-label-md font-bold text-primary">
                My Feed
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-gutter">
            {/* Monitor status indicator */}
            <div
              className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex ${
                connectionError || errorMsg ? "border-destructive/30 bg-destructive/10" : "border-accent/20 bg-muted"
              }`}
            >
              <span
                className={`material-symbols-outlined text-sm ${
                  connectionError || errorMsg ? "text-destructive" : "animate-pulse text-accent"
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {errorMsg ? "videocam_off" : connectionError ? "wifi_off" : "wifi_tethering"}
              </span>
              <span
                className={`font-mono text-label-sm uppercase tracking-widest ${
                  connectionError || errorMsg ? "text-destructive" : "text-accent"
                }`}
              >
                {errorMsg ? "Camera Error" : connectionError ? "Monitor Offline" : running ? "Monitor Synced" : modelStatus || "Connecting…"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleEndSession}
                className="rounded bg-destructive/20 px-4 py-2 font-mono text-label-md text-destructive transition-all hover:brightness-110 active:scale-95"
              >
                End Session
              </button>

              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted font-mono text-label-sm text-foreground">
                {initials}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Alert banner — visible to this student only, when the proctor sends one. */}
      {banner && (
        <div className="fixed left-1/2 top-20 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-body-sm text-destructive shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-2">
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px]">warning</span>
              <span>{banner.message}</span>
            </div>
            <button onClick={() => setBanner(null)} aria-label="Dismiss alert">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto flex min-h-screen w-full max-w-container-max-width flex-col px-margin-mobile pb-32 pt-24 md:px-margin-desktop">
        {/* Exam progress header */}
        <div className="mb-12 flex flex-col gap-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-display text-headline-lg text-foreground">
                Advanced Systems Architecture — Midterm
              </h1>
              <p className="mt-1 font-mono text-label-md uppercase tracking-widest text-muted-foreground">
                Question {String(current + 1).padStart(2, "0")} of {String(MOCK_QUESTIONS.length).padStart(2, "0")}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="mb-1 block font-mono text-label-md uppercase text-muted-foreground">
                Session Time Remaining
              </span>
              <span
                className={`font-display text-headline-lg font-bold tabular-nums ${
                  secondsLeft < 300 ? "text-destructive" : "text-primary"
                }`}
              >
                {formatTime(secondsLeft)}
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Question area — disabled while camera monitoring is down */}
        <div
          className={`grid flex-grow grid-cols-12 gap-gutter transition-opacity ${
            errorMsg ? "pointer-events-none opacity-40" : ""
          }`}
          aria-hidden={Boolean(errorMsg)}
        >
          {/* Main question container */}
          <div className="col-span-12 flex flex-col gap-gutter lg:col-span-8">
            <div className="rounded-lg border border-border bg-card p-6 md:p-10">
              <h2 className="mb-8 font-display text-headline-md leading-relaxed text-foreground">
                {question.text}
              </h2>

              <div className="space-y-3">
                {question.options.map((opt) => {
                  const selected = answers[question.id] === opt;
                  return (
                    <label
                      key={opt}
                      className={`flex cursor-pointer items-center gap-3 rounded border px-4 py-3 text-body-sm transition-all ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          selected ? "border-primary" : "border-muted-foreground/50"
                        }`}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <input
                        type="radio"
                        name={question.id}
                        className="sr-only"
                        checked={selected}
                        onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: opt }))}
                      />
                      <span className={selected ? "text-foreground" : ""}>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar: compact integrity indicators + navigation map filling the rest */}
          <aside className="col-span-12 flex flex-col gap-gutter lg:col-span-4">
            {/* Integrity indicators — compact status strip, not a block */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card/50 px-4 py-3">
              <span className="flex items-center gap-1.5 font-mono text-label-sm text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-accent" : "bg-destructive"}`} />
                Network {connected ? "Stable" : "Down"}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-label-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Lockdown Active
              </span>
              <span className="flex items-center gap-1.5 font-mono text-label-sm text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    errorMsg ? "bg-destructive" : running ? "bg-accent" : "bg-muted-foreground"
                  }`}
                />
                Camera {errorMsg ? "Error" : running ? "Active" : "Starting"}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-label-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                Peripherals None
              </span>
            </div>

            {/* Navigation map — fills the remaining height so this column always
                matches the question panel's height, regardless of question count. */}
            <div className="flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card/50 p-6">
              <h3 className="font-mono text-label-sm uppercase tracking-widest text-muted-foreground">
                Navigation Map
              </h3>
              <div className="grid flex-1 auto-rows-fr grid-cols-6 gap-1.5">
                {MOCK_QUESTIONS.map((q, i) => {
                  const isCurrent = i === current;
                  const isFlagged = flagged.has(q.id);
                  const isDone = Boolean(answers[q.id]);

                  let cellClasses =
                    "flex items-center justify-center rounded font-mono text-label-sm transition-all";
                  if (isCurrent) {
                    cellClasses += " scale-105 z-10 bg-primary text-primary-foreground border-2 border-primary shadow-[0_0_10px_hsl(var(--primary)/0.3)]";
                  } else if (isFlagged) {
                    cellClasses += " bg-destructive/15 text-destructive border border-destructive/30";
                  } else if (isDone) {
                    cellClasses += " bg-secondary/15 text-secondary border border-secondary/20";
                  } else {
                    cellClasses += " bg-muted text-muted-foreground opacity-50";
                  }

                  return (
                    <button key={q.id} type="button" onClick={() => goTo(i)} className={cellClasses}>
                      {isFlagged ? (
                        <span
                          className="material-symbols-outlined text-[13px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          flag
                        </span>
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Bottom navigation bar — disabled while camera monitoring is down */}
      <footer
        className={`fixed bottom-0 z-50 flex h-20 w-full items-center border-t border-border bg-card/90 backdrop-blur-xl transition-opacity ${
          errorMsg ? "pointer-events-none opacity-40" : ""
        }`}
        aria-hidden={Boolean(errorMsg)}
      >
        <div className="mx-auto flex w-full max-w-container-max-width items-center justify-between px-margin-mobile md:px-margin-desktop">
          <button
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
            className="group flex items-center gap-2 px-2 py-2 text-muted-foreground transition-all hover:text-primary disabled:opacity-30 md:px-6"
          >
            <span className="material-symbols-outlined transition-transform group-active:-translate-x-1">
              arrow_back
            </span>
            <span className="hidden font-mono text-label-md sm:inline">Previous Question</span>
          </button>

          <div className="flex items-center gap-gutter">
            <button
              type="button"
              onClick={toggleFlag}
              className={`flex items-center gap-2 rounded-full border px-4 py-2.5 transition-all active:scale-95 md:px-6 ${
                flagged.has(question.id)
                  ? "border-destructive/50 bg-destructive/15 text-destructive"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: flagged.has(question.id) ? "'FILL' 1" : "'FILL' 0" }}
              >
                flag
              </span>
              <span className="hidden font-mono text-label-md sm:inline">Flag for Review</span>
            </button>

            <button
              onClick={() => (current === MOCK_QUESTIONS.length - 1 ? undefined : goTo(current + 1))}
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-label-md font-bold text-primary-foreground transition-all hover:brightness-105 hover:shadow-[0_4px_20px_hsl(var(--primary)/0.25)] active:scale-95 md:px-10"
            >
              <span>{current === MOCK_QUESTIONS.length - 1 ? "Submit Exam" : "Save & Next"}</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}