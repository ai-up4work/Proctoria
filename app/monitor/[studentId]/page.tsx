// app/monitor/[studentId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
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

  const { registerStudent, sendStatus, sendFlag, connected } = useProctorSocket(studentId);
  const [logs, setLogs] = useState<LogEntry[]>([]);
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
      setLogs((prev) => [{ id: logIdCounter, time: new Date().toLocaleTimeString([], { hour12: false }), msg: flag.message }, ...prev].slice(0, 60));
      sendFlag(studentId, flag.message, flag.timestamp);
    },
  });

  useEffect(() => {
    if (connected) registerStudent();
  }, [connected, registerStudent]);

  const palette =
    result.state === "ok"
      ? { text: "text-green-400", Icon: CheckCircle2 }
      : result.state === "warn"
      ? { text: "text-amber-400", Icon: AlertCircle }
      : { text: "text-red-400", Icon: AlertCircle };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-lg font-bold">Your monitoring feed</h1>
          <p className="text-xs text-slate-400">Student ID {studentId} · for your own reference during the exam</p>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-2xl border border-cyan-500/30 bg-black">
          {!running && (
            <button onClick={start} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
              <span>{modelStatus}</span>
              <span className="text-cyan-400 underline">Click to start camera</span>
            </button>
          )}
          <video ref={videoRef} autoPlay playsInline muted className={`mirrored absolute inset-0 w-full h-full object-cover ${running ? "" : "hidden"}`} />
          <canvas ref={canvasRef} className={`mirrored absolute inset-0 w-full h-full ${running ? "" : "hidden"}`} />
        </div>

        {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

        <div className="flex items-center justify-between rounded-xl border border-cyan-500/30 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2">
            <palette.Icon className={`h-5 w-5 ${palette.text}`} />
            <div>
              <p className={`text-sm font-semibold ${palette.text}`}>{result.title}</p>
              <p className="text-xs text-slate-400">{result.sub}</p>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            Flags: <b className="text-slate-100">{flagCount}</b>
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Event log</p>
          <div className="h-40 space-y-1 overflow-y-auto text-xs text-slate-400">
            {logs.map((l) => (
              <div key={l.id}>
                <span className="text-slate-600">{l.time}</span> {l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .mirrored {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
}