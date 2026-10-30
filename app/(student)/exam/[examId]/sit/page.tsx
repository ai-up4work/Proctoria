// app/exam/[examId]/sit/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useGazeMonitor } from "@/hooks/useGazeMonitor";
import { useProctorSocket } from "@/hooks/useProctorSocket";

import { MOCK_QUESTIONS } from "@/lib/mockQuestions";
import {
  FLAG_CATEGORY_META,
  FlagCategory,
  INCIDENT_GAP_MS,
  INCIDENT_RESTRIKE_MS,
  MAX_STRIKES,
  countsAsStrike,
} from "@/lib/gaze";

const SESSION_SECONDS = 45 * 60;

// The gaze loop runs every animation frame; the dashboard doesn't need that
// many updates. A state change (ok -> warn -> bad) is always sent immediately.
const STATUS_THROTTLE_MS = 700;

// Escalation ladder for a student who stays away from the exam tab.
// The longer the absence runs, the more severe the category (which drives
// the dashboard's red/amber coloring and, for critical ones, strikes) and
// the tighter the re-flag interval. Intervals are chosen well above the
// browser's ~1s background-timer clamp so they fire reliably even while the
// tab is backgrounded.
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
  const { session, initializing, logout } = useSession();
  const params = useParams<{ examId: string }>();
  const examId = params?.examId ?? "default";

  const {
    registerStudent,
    sendStatus,
    sendFlag,
    connected,
    connectionError,
    channelError,
    alert,
    clearAlert,
    controlTick,
  } = useProctorSocket(session?.studentId ?? null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [banner, setBanner] = useState<{ message: string; timestamp: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS);

  // ---- strike / lock state -------------------------------------------------
  // The server (lib/examState.ts) is the source of truth. This client locks
  // itself instantly for UX, reports to the server, and re-reads the server
  // on load, on a proctor nudge, and on a poll.
  const [strikes, setStrikes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [strikeModal, setStrikeModal] = useState<{ strike: number; reason: string; label: string } | null>(
    null
  );

  const strikesRef = useRef(0);
  const lockedRef = useRef(false);
  const lockPendingRef = useRef(false); // local lock the server hasn't confirmed yet
  const redirectingRef = useRef(false); // guards against repeated 401 redirects
  const studentIdRef = useRef<string | null>(null);
  studentIdRef.current = session?.studentId ?? null;
  const lastCriticalAtRef = useRef(0);
  const lastStrikeAtRef = useRef(0);
  const stopMonitorRef = useRef<() => void>(() => {});
  const lastStatusSentAtRef = useRef(0);
  const lastStatusStateRef = useRef<string | null>(null);

  /**
   * The server says we have no valid session cookie. Retrying can't fix that,
   * so stop the camera, show a message, and send the student to log in again.
   * If your SessionContext keeps the session in localStorage, also clear it
   * here (e.g. a `clearSession()` from the context) so /login doesn't bounce
   * the student straight back to this page.
   */
  const handleUnauthorized = useCallback(() => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    setSessionExpired(true);
    stopMonitorRef.current();
    setTimeout(async () => {
      await logout(); // expires the cookie and clears client state, so /login can't bounce back here
      window.location.href = "/login?reason=expired";
    }, 1500);
  }, [logout]);

  const reportToServer = useCallback(
    async (strikesNow: number, lockedNow: boolean) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch("/api/exam/state", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "report", strikes: strikesNow, locked: lockedNow }),
          });
          if (res.ok) return true;
          if (res.status === 401) {
            handleUnauthorized();
            return false; // retrying can't fix an invalid session
          }
        } catch {
          /* retry below */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      return false;
    },
    [handleUnauthorized]
  );

  const applyLock = useCallback((strikesNow: number) => {
    lockedRef.current = true; // set BEFORE stopping so the "Camera stopped" flag is dropped
    strikesRef.current = strikesNow;
    setLocked(true);
    setStrikes(strikesNow);
    setStrikeModal(null);
    stopMonitorRef.current(); // camera tracks + inference loop off
  }, []);

  const lockExam = useCallback(
    (reason: string) => {
      const id = studentIdRef.current;
      if (!id) return;
      sendFlag(
        id,
        `Strike ${MAX_STRIKES}/${MAX_STRIKES} — exam locked. Last incident: ${reason}`,
        Date.now(),
        "exam_locked"
      );
      sendStatus(id, {
        result: {
          state: "bad",
          title: "Exam Locked",
          sub: `Locked after ${MAX_STRIKES} strikes — awaiting proctor`,
          faceDetected: false,
          gazeLabel: "unknown",
          confidence: 0,
        },
      });
      applyLock(MAX_STRIKES);
      lockPendingRef.current = true;
      reportToServer(MAX_STRIKES, true).then((ok) => {
        if (ok) lockPendingRef.current = false;
      });
    },
    [applyLock, reportToServer, sendFlag, sendStatus]
  );

  const issueStrike = useCallback(
    (reason: string, category: FlagCategory) => {
      const id = studentIdRef.current;
      if (!id) return;
      const next = strikesRef.current + 1;
      if (next >= MAX_STRIKES) {
        lockExam(reason);
        return;
      }
      strikesRef.current = next;
      setStrikes(next);
      sendFlag(id, `Strike ${next}/${MAX_STRIKES} issued — ${reason}`, Date.now(), "strike");
      setStrikeModal({ strike: next, reason, label: FLAG_CATEGORY_META[category].label });
      reportToServer(next, false);
    },
    [lockExam, reportToServer, sendFlag]
  );

  /**
   * Single exit point for every flag: sends it to the proctor, then applies
   * the strike policy (critical flags only, one strike per incident).
   */
  const emitFlag = useCallback(
    (message: string, timestamp: number, category: FlagCategory) => {
      const id = studentIdRef.current;
      if (!id || lockedRef.current) return;
      sendFlag(id, message, timestamp, category);
      if (!countsAsStrike(category)) return;

      const now = Date.now();
      const startsNewIncident = now - lastCriticalAtRef.current > INCIDENT_GAP_MS;
      const incidentDraggedOn = now - lastStrikeAtRef.current > INCIDENT_RESTRIKE_MS;
      lastCriticalAtRef.current = now; // any critical flag keeps the current incident alive
      if (!startsNewIncident && !incidentDraggedOn) return;

      lastStrikeAtRef.current = now;
      issueStrike(message, category);
    },
    [issueStrike, sendFlag]
  );

  /** Pull the authoritative state: restores after refresh, applies proctor lock/unlock. */
  const syncFromServer = useCallback(async () => {
    if (redirectingRef.current) return;
    try {
      const res = await fetch("/api/exam/state", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) return;
      const s = (await res.json()) as { locked: boolean; strikes: number };

      if (s.locked) {
        lockPendingRef.current = false;
        if (!lockedRef.current) applyLock(s.strikes);
      } else if (lockedRef.current && !lockPendingRef.current) {
        // The proctor re-enabled this student.
        lockedRef.current = false;
        strikesRef.current = s.strikes;
        lastCriticalAtRef.current = 0;
        lastStrikeAtRef.current = 0;
        setLocked(false);
        setStrikes(s.strikes);
        setStrikeModal(null);
      } else if (s.strikes > strikesRef.current) {
        strikesRef.current = s.strikes;
        setStrikes(s.strikes);
      }
      setStateReady(true);
    } catch {
      /* retried by the poll */
    }
  }, [applyLock, handleUnauthorized]);

  const saveAnswer = useCallback(
    async (questionId: string, answer: string) => {
      try {
        const res = await fetch("/api/exam/answer", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId, questionId, answer }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        // The server says we're locked -> lock the UI to match.
        if (res.status === 423) syncFromServer();
      } catch {
        /* network blip; the next selection will save again */
      }
    },
    [examId, syncFromServer, handleUnauthorized]
  );

  const { videoRef, start, stop, running, modelReady, modelStatus, errorMsg } = useGazeMonitor({
    // drawOverlay left false — this page never shows the feed to the student
    onStatus: (status) => {
      const id = studentIdRef.current;
      // A straggler frame must never overwrite the "Exam Locked" status.
      if (!id || lockedRef.current) return;
      const now = Date.now();
      const stateChanged = status.result.state !== lastStatusStateRef.current;
      if (!stateChanged && now - lastStatusSentAtRef.current < STATUS_THROTTLE_MS) return;
      lastStatusStateRef.current = status.result.state;
      lastStatusSentAtRef.current = now;
      sendStatus(id, {
        result: status.result,
        metrics: status.metrics,
        flagCount: status.flagCount,
        awayTime: status.awayTime,
        sessionTime: status.sessionTime,
      });
    },
    onFlag: (flag) => emitFlag(flag.message, flag.timestamp, flag.category),
  });
  stopMonitorRef.current = stop;

  // Questions and navigation are unusable while monitoring is down, the exam
  // is locked, the server state hasn't been confirmed yet, or the session expired.
  const blocked = Boolean(errorMsg) || locked || !stateReady || sessionExpired;

  // Register with the hub once connected.
  useEffect(() => {
    if (session && connected) registerStudent(session.name);
  }, [session, connected, registerStudent]);

  // Auto-start monitoring once the model and the server state are ready and
  // the exam isn't locked. (After an unlock, `locked` flips false and this
  // restarts the camera.)
  useEffect(() => {
    if (modelReady && stateReady && !locked && !lockedRef.current && !sessionExpired && !running) start();
  }, [modelReady, stateReady, locked, sessionExpired, running, start]);

  // Initial state load + polling. Fast until the first load succeeds, then
  // quick while locked (so an unlock lands fast even if the Ably nudge is
  // missed) and relaxed while the exam is running.
  useEffect(() => {
    if (!session || sessionExpired) return;
    syncFromServer();
    const id = setInterval(syncFromServer, !stateReady ? 2000 : locked ? 4000 : 15000);
    return () => clearInterval(id);
  }, [session, sessionExpired, locked, stateReady, syncFromServer]);

  // Proctor "nudge" over Ably -> re-read the server immediately.
  useEffect(() => {
    if (controlTick > 0) syncFromServer();
  }, [controlTick, syncFromServer]);

  // Surface only alerts addressed to *this* student (the Ably capability
  // already restricts which channel this client can read).
  useEffect(() => {
    if (alert) {
      setBanner(alert);
      clearAlert();
    }
  }, [alert, clearAlert]);

  // Tab-switch / window-blur detection.
  //
  // This is intentionally the *only* signal we trust while the tab is
  // hidden. The gaze loop is driven by requestAnimationFrame, which browsers
  // throttle heavily in background tabs, and most browsers pause video frame
  // decoding for a backgrounded tab, so MediaPipe would keep re-analyzing the
  // last frame it saw. So we treat document.hidden as authoritative: push an
  // immediate "away" status, and keep re-flagging on an interval for as long
  // as the student stays away. Prolonged-absence flags are critical, so they
  // go through emitFlag and can earn strikes.
  useEffect(() => {
    if (!session) return;

    let awayTimeout: ReturnType<typeof setTimeout> | null = null;
    let hiddenSince: number | null = null;

    function scheduleNextCheck() {
      if (hiddenSince === null || !session || lockedRef.current) return;
      const awaySeconds = Math.round((Date.now() - hiddenSince) / 1000);
      const tier = tierFor(awaySeconds);

      emitFlag(awayMessage(awaySeconds), Date.now(), tier.category);
      if (lockedRef.current) return; // this very flag may have just locked the exam

      // Once this crosses into the critical tier, push a status update too,
      // so the student's card on the dashboard itself turns critical.
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
        if (lockedRef.current) return;
        hiddenSince = Date.now();

        emitFlag("Student switched tabs or minimized the window.", Date.now(), "tab_switch");

        // Immediately mark the student as "away" for the dashboard, rather
        // than leaving whatever gaze-loop status was last computed.
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
          emitFlag(`Returned to the exam tab after ${awaySeconds}s away.`, Date.now(), "system");
          hiddenSince = null;
        }
        // The gaze loop's own onStatus callback resumes publishing fresh
        // status on its next processed frame — nothing to do here.
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (awayTimeout) clearTimeout(awayTimeout);
    };
  }, [session, emitFlag, sendStatus]);

  // Session countdown — paused while monitoring is blocked (camera error),
  // while the exam is locked, and until the server state is confirmed, so a
  // student can't run the clock out by denying the camera.
  useEffect(() => {
    if (errorMsg || locked || !stateReady || sessionExpired) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [errorMsg, locked, stateReady, sessionExpired]);

  // Copy/paste restriction inside terminal mode.
  //
  // We listen on the "copy" / "cut" / "paste" events themselves rather than
  // keydown — clipboardData (the actual text) is only exposed on those
  // events, and keydown also misses right-click "Paste". Content is truncated
  // before being sent. Clipboard flags are warnings, so they never cause
  // strikes on their own.
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
      emitFlag(`Attempted to copy while in terminal mode.${preview}`, Date.now(), "clipboard");
    }

    function handleCut(e: ClipboardEvent) {
      if (!session) return;
      e.preventDefault();
      const selected = truncate(window.getSelection()?.toString() ?? "");
      const preview = selected ? ` Captured text: "${selected}"` : " (could not capture selected text.)";
      emitFlag(`Attempted to cut while in terminal mode.${preview}`, Date.now(), "clipboard");
    }

    function handlePaste(e: ClipboardEvent) {
      if (!session) return;
      e.preventDefault();
      const pasted = truncate(e.clipboardData?.getData("text/plain") ?? "");
      const preview = pasted ? ` Captured content: "${pasted}"` : " (clipboard was empty or non-text.)";
      emitFlag(`Attempted to paste while in terminal mode.${preview}`, Date.now(), "clipboard");
    }

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
    };
  }, [session, emitFlag]);

  // Once the server check has finished, no session means "logged out".
  useEffect(() => {
    if (!initializing && !session) window.location.href = "/login";
  }, [initializing, session]);

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
    // start() no-ops if already running, and re-requests getUserMedia on
    // the next call since runningRef will still be false after a failure.
    start();
  }

  if (initializing) return null; // wait for /api/me before deciding

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

      {/* Session expired — the server rejected our cookie (401). */}
      {sessionExpired && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-8 text-center shadow-2xl">
            <span
              className="material-symbols-outlined mb-4 text-4xl text-destructive"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              key_off
            </span>
            <h2 className="mb-2 font-display text-headline-md font-bold text-foreground">Session Expired</h2>
            <p className="mb-4 font-body text-body-sm text-muted-foreground">
              Your login is no longer valid. Redirecting you to sign in again…
            </p>
            <a
              href="/login?reason=expired"
              className="inline-block rounded-lg bg-primary px-6 py-3 font-mono text-label-md font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-95"
            >
              Go to login
            </a>
          </div>
        </div>
      )}

      {/* Loading gate — nothing is usable until the server confirms whether
          this student is locked, so a refresh can't be used to dodge a ban. */}
      {!stateReady && !sessionExpired && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background p-6 text-center text-body-sm text-muted-foreground">
          Checking exam status… If this takes more than a few seconds, log in again.
        </div>
      )}

      {/* Strike popup — blocking, must be acknowledged. */}
      {strikeModal && !locked && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-background/90 p-6 backdrop-blur-md"
        >
          <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-8 text-center shadow-2xl">
            <span
              className="material-symbols-outlined mb-4 text-4xl text-destructive"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              warning
            </span>
            <h2 className="mb-1 font-display text-headline-md font-bold text-foreground">
              Integrity Warning {strikeModal.strike} of {MAX_STRIKES}
            </h2>
            <p className="mb-3 font-mono text-label-sm uppercase tracking-widest text-destructive">
              {strikeModal.label}
            </p>
            <p className="mb-4 font-body text-body-sm text-muted-foreground">{strikeModal.reason}</p>
            <p className="mb-6 font-body text-body-sm text-foreground">
              Your proctor has been notified. {MAX_STRIKES - strikeModal.strike} more warning
              {MAX_STRIKES - strikeModal.strike === 1 ? "" : "s"} and your exam will be locked.
            </p>
            <button
              onClick={() => setStrikeModal(null)}
              className="w-full rounded-lg bg-primary px-6 py-3 font-mono text-label-md font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-95"
            >
              I understand
            </button>
          </div>
        </div>
      )}

      {/* Lock overlay — exam banned until the proctor re-enables it. */}
      {locked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-8 text-center shadow-2xl">
            <span
              className="material-symbols-outlined mb-4 text-4xl text-destructive"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              lock
            </span>
            <h2 className="mb-2 font-display text-headline-md font-bold text-foreground">Exam Locked</h2>
            <p className="mb-4 font-body text-body-sm text-muted-foreground">
              Your exam was locked after {MAX_STRIKES} integrity warnings. Your proctor has been notified,
              your camera has been turned off, and no further answers are being accepted.
            </p>
            <p className="font-mono text-label-sm text-muted-foreground">
              This page resumes automatically if your proctor re-enables your exam. Please stay on this page.
            </p>
          </div>
        </div>
      )}

      {/* Blocking overlay — camera/model failure. The exam is not usable
          until monitoring is restored, so a student can't silently continue
          unproctored. */}
      {errorMsg && !locked && !sessionExpired && (
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
            {/* Strike counter */}
            <div
              className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex ${
                locked
                  ? "border-destructive/30 bg-destructive/10"
                  : strikes > 0
                  ? "border-secondary/30 bg-secondary/10"
                  : "border-border bg-muted"
              }`}
            >
              <span
                className={`font-mono text-label-sm uppercase tracking-widest ${
                  locked ? "text-destructive" : strikes > 0 ? "text-secondary" : "text-muted-foreground"
                }`}
              >
                Strikes {strikes}/{MAX_STRIKES}
              </span>
            </div>

            {/* Monitor status indicator */}
            <div
              className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 sm:flex ${
                connectionError || errorMsg || locked || sessionExpired
                  ? "border-destructive/30 bg-destructive/10"
                  : "border-accent/20 bg-muted"
              }`}
            >
              <span
                className={`material-symbols-outlined text-sm ${
                  connectionError || errorMsg || locked || sessionExpired
                    ? "text-destructive"
                    : "animate-pulse text-accent"
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {sessionExpired
                  ? "key_off"
                  : locked
                  ? "lock"
                  : errorMsg
                  ? "videocam_off"
                  : connectionError
                  ? "wifi_off"
                  : "wifi_tethering"}
              </span>
              <span
                className={`font-mono text-label-sm uppercase tracking-widest ${
                  connectionError || errorMsg || locked || sessionExpired ? "text-destructive" : "text-accent"
                }`}
              >
                {sessionExpired
                  ? "Session Expired"
                  : locked
                  ? "Exam Locked"
                  : errorMsg
                  ? "Camera Error"
                  : connectionError
                  ? "Monitor Offline"
                  : running
                  ? "Monitor Synced"
                  : modelStatus || "Connecting…"}
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

      {/* Dev-only realtime diagnostics: the header can say "Monitor Synced" while
          Ably is down, and strikes still work over HTTP, so surface the truth. */}
      {process.env.NODE_ENV !== "production" && (!connected || channelError) && (
        <div className="fixed bottom-24 left-4 z-[60] max-w-sm rounded-md border border-destructive/40 bg-card/95 p-2 font-mono text-[10px] text-destructive">
          realtime: {connected ? "connected" : connectionError ?? "connecting…"}
          {channelError ? ` · ${channelError}` : ""}
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

        {/* Question area — disabled while monitoring is down or the exam is locked */}
        <div
          className={`grid flex-grow grid-cols-12 gap-gutter transition-opacity ${
            blocked ? "pointer-events-none opacity-40" : ""
          }`}
          aria-hidden={blocked}
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
                        disabled={blocked}
                        onChange={() => {
                          setAnswers((prev) => ({ ...prev, [question.id]: opt }));
                          // The server re-checks the lock and answers 423 if locked.
                          saveAnswer(question.id, opt);
                        }}
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
                <span className={`h-1.5 w-1.5 rounded-full ${locked ? "bg-destructive" : "bg-accent"}`} />
                {locked ? "Exam Locked" : "Lockdown Active"}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-label-sm text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    errorMsg || locked ? "bg-destructive" : running ? "bg-accent" : "bg-muted-foreground"
                  }`}
                />
                Camera {locked ? "Off" : errorMsg ? "Error" : running ? "Active" : "Starting"}
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

      {/* Bottom navigation bar — disabled while monitoring is down or the exam is locked */}
      <footer
        className={`fixed bottom-0 z-50 flex h-20 w-full items-center border-t border-border bg-card/90 backdrop-blur-xl transition-opacity ${
          blocked ? "pointer-events-none opacity-40" : ""
        }`}
        aria-hidden={blocked}
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