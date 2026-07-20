// app/monitor/[studentId]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { useGazeMonitor } from "@/hooks/useGazeMonitor";
import { useProctorSocket } from "@/hooks/useProctorSocket";
import type { DetectionResult } from "@/lib/gaze";

interface LogEntry {
  id: number;
  time: string;
  msg: string;
}

let logIdCounter = 0;

export default function StudentMonitorPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const { session } = useSession();

  const { registerStudent, sendStatus, sendFlag, connected } = useProctorSocket(studentId);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 0, time: "--:--:--", msg: "Initial verification complete. Proctoring engine engaged." },
  ]);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [syncLabel, setSyncLabel] = useState("Live Syncing…");
  const [result, setResult] = useState<DetectionResult>({
    state: "ok",
    title: "Verified",
    sub: "Face detected • Attention confirmed",
    faceDetected: true,
    gazeLabel: "camera",
    confidence: 1,
  });
  const [flagCount, setFlagCount] = useState(0);

  const { videoRef, canvasRef, modelStatus, running, start, errorMsg } = useGazeMonitor({
    drawOverlay: true,
    onStatus: (status) => {
      setResult(status.result);
      setFlagCount(status.flagCount);
      sendStatus(studentId, {
        result: status.result,
        metrics: status.metrics,
        flagCount: status.flagCount,
        awayTime: status.awayTime,
        sessionTime: status.sessionTime,
      });
    },
    onFlag: (flag) => {
      logIdCounter += 1;
      setLogs((prev) =>
        [{ id: logIdCounter, time: new Date().toLocaleTimeString([], { hour12: false }), msg: flag.message }, ...prev].slice(0, 60)
      );
      sendFlag(studentId, flag.message, flag.timestamp);
    },
  });

  useEffect(() => {
    if (connected) registerStudent();
  }, [connected, registerStudent]);

  // Decorative "live" sync-label flicker, mirrors the mockup's simulated activity.
  useEffect(() => {
    const id = setInterval(() => {
      setSyncLabel((prev) => (prev === "Live Syncing…" ? "Data Encrypted" : "Live Syncing…"));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Tab-switch counter for the biometric stream panel.
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setTabSwitches((n) => n + 1);
        logIdCounter += 1;
        setLogs((prev) =>
          [
            { id: logIdCounter, time: new Date().toLocaleTimeString([], { hour12: false }), msg: "Browser window lost focus." },
            ...prev,
          ].slice(0, 60)
        );
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const stateColor =
    result.state === "ok" ? "text-accent" : result.state === "warn" ? "text-primary" : "text-destructive";

  const initials = (session?.name || studentId || "?").slice(0, 2).toUpperCase();
  const sessionCode = `PRX-${studentId.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || "0000"}`;

  function downloadIncidentReport() {
    const report = {
      studentId,
      sessionCode,
      generatedAt: new Date().toISOString(),
      flagCount,
      tabSwitches,
      lastResult: result,
      log: logs,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proctoria-incident-report-${studentId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background font-body text-foreground">
      {/* Top app bar */}
      <header className="z-50 flex h-16 w-full shrink-0 items-center justify-between border-b border-border bg-background px-margin-mobile md:px-margin-desktop">
        <div className="flex items-center gap-base">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            security
          </span>
          <h1 className="font-display text-headline-md font-bold text-foreground">Proctoria Student Terminal</h1>
        </div>
        <nav className="hidden items-center gap-gutter md:flex">
          <a href="#" className="font-mono text-label-md text-muted-foreground transition-opacity hover:text-primary">
            Dashboard
          </a>
          <a href="#" className="border-b-2 border-primary pb-1 font-mono text-label-md font-bold text-primary">
            My Feed
          </a>
        </nav>
        <div className="flex items-center gap-gutter">
          <span
            className={`material-symbols-outlined transition-colors ${connected ? "text-accent" : "text-muted-foreground"}`}
          >
            wifi_tethering
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted font-mono text-label-sm">
            {initials}
          </div>
          <button className="rounded bg-destructive px-4 py-2 font-mono text-label-md text-background transition-all hover:opacity-90 active:scale-95">
            End Session
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto flex min-h-0 w-full max-w-container-max-width flex-1 flex-col md:flex-row">
        {/* Left: mirrored camera feed */}
        <section className="flex w-full flex-col gap-gutter border-b border-border bg-surface-container-lowest p-margin-mobile md:w-7/12 md:border-b-0 md:border-r md:p-margin-desktop"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-base">
              <span className={`h-3 w-3 rounded-full ${running ? "animate-pulse bg-accent" : "bg-muted-foreground"}`} />
              <span className="font-mono text-label-md uppercase tracking-widest text-accent">
                {running ? "Live Monitoring Active" : modelStatus || "Starting monitor…"}
              </span>
            </div>
            <div className="font-mono text-label-md text-muted-foreground">
              Session ID: <span className="text-foreground">{sessionCode}</span>
            </div>
          </div>

          {/* Video feed container */}
          <div className="group relative flex-grow overflow-hidden rounded-xl border border-border bg-black">
            {!running && (
              <button
                onClick={start}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-body-sm text-muted-foreground"
              >
                <span>{modelStatus}</span>
                <span className="font-mono text-label-md text-primary underline">Click to start camera</span>
              </button>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`mirrored absolute inset-0 h-full w-full object-cover ${running ? "" : "hidden"}`}
            />
            <canvas ref={canvasRef} className={`mirrored absolute inset-0 h-full w-full ${running ? "" : "hidden"}`} />

            {/* Scanline effect */}
            {running && (
              <div className="pointer-events-none absolute left-0 top-0 h-0.5 w-full animate-[scan_4s_linear_infinite] bg-primary/10" />
            )}

            {/* Gaze detection overlay */}
            {running && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-48 w-48 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite] items-center justify-center rounded-full border border-primary/30">
                  <div className="h-12 w-12 rounded-full border-2 border-primary opacity-50" />
                </div>

                <div className="absolute left-base top-base rounded border border-border bg-card/80 p-base backdrop-blur-md">
                  <p className="mb-1 font-mono text-label-sm uppercase text-primary">Gaze Metric</p>
                  <p className="font-display text-headline-md text-foreground">{result.gazeLabel ?? "Centered"}</p>
                </div>
                <div className="absolute bottom-base right-base rounded border border-border bg-card/80 p-base backdrop-blur-md">
                  <p className="mb-1 font-mono text-label-sm uppercase text-primary">Status</p>
                  <p className={`font-display text-headline-md ${stateColor}`}>{result.title}</p>
                </div>
              </div>
            )}

            <div className="absolute right-4 top-4 font-mono text-label-sm italic text-foreground/40">
              Mirrored Feed (Local Only)
            </div>
          </div>

          {errorMsg && <p className="text-body-sm text-destructive">{errorMsg}</p>}

          {/* Transparency logs / incident report export */}
          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-surface-container-high p-gutter sm:flex-row sm:items-center">
            <div>
              <h3 className="font-display text-headline-md text-foreground">Transparency Logs</h3>
              <p className="font-body text-body-sm text-muted-foreground">
                Download a JSON record of your captured metrics and flags for your own reference.
              </p>
            </div>
            <button
              onClick={downloadIncidentReport}
              className="flex shrink-0 items-center gap-base rounded-lg bg-primary px-6 py-3 font-mono text-label-md text-primary-foreground shadow-lg transition-all hover:brightness-110"
            >
              <span className="material-symbols-outlined">description</span>
              Full Incident Report
            </button>
          </div>
        </section>

        {/* Right: real-time metrics & flag history */}
        <aside className="flex min-h-0 w-full flex-col bg-surface-container-low md:w-5/12">
          {/* Biometric & activity stream */}
          <div className="border-b border-border p-margin-mobile md:p-margin-desktop">
            <h2 className="mb-gutter font-mono text-label-md uppercase tracking-widest text-muted-foreground">
              Biometric &amp; Activity Stream
            </h2>
            <div className="grid grid-cols-2 gap-gutter">
              <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:scale-[1.02]">
                <div className="mb-2 flex items-start justify-between">
                  <span className="material-symbols-outlined text-primary">visibility</span>
                  <span className={`font-mono text-label-sm ${stateColor}`}>
                    {Math.round((result.confidence ?? 0) * 100)}% Match
                  </span>
                </div>
                <p className="font-mono text-label-sm text-muted-foreground">Eye Tracking</p>
                <p className="font-display text-headline-md text-foreground">
                  {result.state === "ok" ? "Stabilized" : result.state === "warn" ? "Deviating" : "Lost"}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:scale-[1.02]">
                <div className="mb-2 flex items-start justify-between">
                  <span className="material-symbols-outlined text-primary">mic</span>
                  <span className="font-mono text-label-sm text-muted-foreground">n/a</span>
                </div>
                <p className="font-mono text-label-sm text-muted-foreground">Audio Floor</p>
                <p className="font-display text-headline-md text-foreground">Not monitored</p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:scale-[1.02]">
                <div className="mb-2 flex items-start justify-between">
                  <span className="material-symbols-outlined text-primary">tab_unselected</span>
                  <span className={`font-mono text-label-sm ${tabSwitches > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {tabSwitches > 0 ? "Flagged" : "Locked"}
                  </span>
                </div>
                <p className="font-mono text-label-sm text-muted-foreground">Tab Switches</p>
                <p className="font-display text-headline-md text-foreground">
                  {tabSwitches === 0 ? "Zero" : tabSwitches}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:scale-[1.02]">
                <div className="mb-2 flex items-start justify-between">
                  <span className="material-symbols-outlined text-primary">person</span>
                  <span className={`font-mono text-label-sm ${result.faceDetected ? "text-accent" : "text-destructive"}`}>
                    {result.faceDetected ? "Verified" : "Missing"}
                  </span>
                </div>
                <p className="font-mono text-label-sm text-muted-foreground">Face Count</p>
                <p className="font-display text-headline-md text-foreground">
                  {result.faceDetected ? "1 Detected" : "0 Detected"}
                </p>
              </div>
            </div>

            <p className="mt-gutter font-mono text-label-sm text-muted-foreground">
              Flags this session: <span className="text-foreground">{flagCount}</span>
            </p>
          </div>

          {/* Scrolling flag history */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-end justify-between p-margin-mobile pb-4 md:p-margin-desktop md:pb-4">
              <h2 className="font-mono text-label-md uppercase tracking-widest text-muted-foreground">
                Flag History Log
              </h2>
              <span className="font-body text-body-sm text-muted-foreground">{syncLabel}</span>
            </div>
            <div className="scrollbar-thin flex-1 space-y-base overflow-y-auto px-margin-mobile pb-margin-mobile md:px-margin-desktop md:pb-margin-desktop">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-gutter rounded-r-lg border-l-4 border-primary bg-card p-4"
                >
                  <div className="shrink-0 rounded bg-primary/10 p-2">
                    <span className="material-symbols-outlined text-primary">eye_tracking</span>
                  </div>
                  <div className="min-w-0 flex-grow">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono text-label-md text-primary">Flag</span>
                      <span className="shrink-0 font-mono text-label-sm text-muted-foreground">{l.time}</span>
                    </div>
                    <p className="break-words font-body text-body-sm text-foreground">{l.msg}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <style jsx global>{`
        .mirrored {
          transform: scaleX(-1);
        }
        @keyframes scan {
          from {
            top: 0;
          }
          to {
            top: 100%;
          }
        }
        @keyframes pulse-ring {
          0%,
          100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}