"use client";

import { useEffect, useRef, useState } from "react";
import {
  ScanEye,
  Zap,
  Video,
  Square,
  RotateCcw,
  Camera,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultState = "ok" | "warn" | "bad";
type GazeLabel = "camera" | "away" | "unknown";

interface LogEntry {
  id: number;
  time: string;
  msg: string;
  isFlag: boolean;
}

// ---------------------------------------------------------------------------
// Constants (identical to the original implementation)
// ---------------------------------------------------------------------------

const YAW_LIMIT = 18;
const PITCH_LIMIT = 14;
const EYE_OFFSET_LIMIT = 0.28;
const AWAY_TO_FLAG_MS = 2500;
const WINDOW_MS = 10000;

const LEFT_EYE_CORNERS = [33, 133];
const RIGHT_EYE_CORNERS = [362, 263];
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

let logIdCounter = 0;

export default function ProctoriaPage() {
  // ---- refs to DOM nodes ---------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---- refs to mutable state that must persist across animation frames ----
  const faceLandmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const historyRef = useRef<{ t: number; attentive: boolean }[]>([]);
  const awayStreakStartRef = useRef<number | null>(null);
  const totalAwayMsRef = useRef(0);
  const flagCountRef = useRef(0);
  const lastFlagAtRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);
  const lastTRef = useRef<number | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  // ---- React state for anything rendered in the UI -------------------------
  const [modelStatus, setModelStatus] = useState("loading model…");
  const [modelReady, setModelReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [metrics, setMetrics] = useState({
    yaw: "–",
    pitch: "–",
    eye: "–",
    faces: "–",
  });

  const [result, setResult] = useState<{
    state: ResultState;
    title: string;
    sub: string;
    faceDetected: boolean;
    gazeLabel: GazeLabel;
    confidence: number;
  }>({
    state: "ok",
    title: "Verified",
    sub: "Face detected • Attention confirmed",
    faceDetected: true,
    gazeLabel: "camera",
    confidence: 1,
  });

  const [flagCount, setFlagCount] = useState(0);
  const [awayTime, setAwayTime] = useState("0.0s");
  const [sessionTime, setSessionTime] = useState("0:00");
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function logEvent(msg: string, isFlag = false) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    logIdCounter += 1;
    setLogs((prev) => {
      const next = [{ id: logIdCounter, time, msg, isFlag }, ...prev];
      return next.slice(0, 60);
    });
  }

  function showError(msg: string) {
    setErrorMsg(msg);
  }

  function matrixToEuler(m: Float32Array | number[]) {
    const r13 = m[8];
    const r23 = m[9];
    const r33 = m[10];
    const pitch = Math.asin(Math.max(-1, Math.min(1, -r23)));
    const yaw = Math.atan2(r13, r33);
    return { yaw: (yaw * 180) / Math.PI, pitch: (pitch * 180) / Math.PI };
  }

  function irisOffset(
    landmarks: { x: number; y: number }[],
    corners: number[],
    iris: number[]
  ) {
    const c1 = landmarks[corners[0]];
    const c2 = landmarks[corners[1]];
    const center = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
    const eyeWidth = Math.hypot(c2.x - c1.x, c2.y - c1.y) || 1;
    let ix = 0;
    let iy = 0;
    for (const idx of iris) {
      ix += landmarks[idx].x;
      iy += landmarks[idx].y;
    }
    ix /= iris.length;
    iy /= iris.length;
    return { x: (ix - center.x) / eyeWidth, y: (iy - center.y) / eyeWidth };
  }

  function drawOverlay(landmarks: { x: number; y: number }[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "rgba(34,211,238,0.9)";
    for (const idx of [...LEFT_IRIS, ...RIGHT_IRIS]) {
      const p = landmarks[idx];
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(34,211,238,0.5)";
    ctx.lineWidth = 1;
    for (const idx of [...LEFT_EYE_CORNERS, ...RIGHT_EYE_CORNERS]) {
      const p = landmarks[idx];
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------
  // Detection loop
  // ---------------------------------------------------------------------

  function loop() {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const faceLandmarker = faceLandmarkerRef.current;
    if (!video || !canvas || !faceLandmarker) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    const detection = faceLandmarker.detectForVideo(video, now);
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);

    const faces = detection.faceLandmarks || [];

    let attentive = false;
    let reason = "";
    let gazeLabel: GazeLabel = "unknown";
    let confidence = 0;

    if (faces.length === 0) {
      setMetrics({ yaw: "–", pitch: "–", eye: "–", faces: String(faces.length) });
      setResult({
        state: "bad",
        title: "Not visible",
        sub: "No face detected in frame",
        faceDetected: false,
        gazeLabel: "unknown",
        confidence: 0,
      });
    } else if (faces.length > 1) {
      setMetrics({ yaw: "–", pitch: "–", eye: "–", faces: String(faces.length) });
      setResult({
        state: "bad",
        title: "Flagged",
        sub: "Multiple faces detected in frame",
        faceDetected: true,
        gazeLabel: "unknown",
        confidence: 0,
      });
    } else {
      const landmarks = faces[0];
      const matrix = detection.facialTransformationMatrixes[0].data;
      const { yaw, pitch } = matrixToEuler(matrix);
      const leftOff = irisOffset(landmarks, LEFT_EYE_CORNERS, LEFT_IRIS);
      const rightOff = irisOffset(landmarks, RIGHT_EYE_CORNERS, RIGHT_IRIS);
      const eyeOffsetX = (leftOff.x + rightOff.x) / 2;

      setMetrics({
        yaw: yaw.toFixed(1) + "°",
        pitch: pitch.toFixed(1) + "°",
        eye: eyeOffsetX.toFixed(2),
        faces: String(faces.length),
      });

      const headDev = Math.max(Math.abs(yaw) / YAW_LIMIT, Math.abs(pitch) / PITCH_LIMIT);
      const eyeDev = Math.abs(eyeOffsetX) / EYE_OFFSET_LIMIT;
      const dev = Math.max(headDev, eyeDev);
      confidence = Math.max(0, 1 - dev);
      attentive = dev < 1;
      gazeLabel = attentive ? "camera" : "away";
      reason = headDev > eyeDev ? "Head turned away from camera" : "Eyes directed away from screen";

      setResult({
        state: attentive ? "ok" : "warn",
        title: attentive ? "Verified" : "Flagged",
        sub: attentive ? "Face detected • Attention confirmed" : reason,
        faceDetected: true,
        gazeLabel,
        confidence,
      });

      drawOverlay(landmarks);
    }

    historyRef.current.push({ t: now, attentive });
    historyRef.current = historyRef.current.filter((h) => now - h.t <= WINDOW_MS);

    if (!attentive) {
      if (awayStreakStartRef.current === null) awayStreakStartRef.current = now;
      const streak = now - awayStreakStartRef.current;
      if (
        streak >= AWAY_TO_FLAG_MS &&
        now - lastFlagAtRef.current > AWAY_TO_FLAG_MS
      ) {
        flagCountRef.current += 1;
        lastFlagAtRef.current = now;
        setFlagCount(flagCountRef.current);
        logEvent(
          `⚠ Sustained attention loss (${(streak / 1000).toFixed(1)}s) — ${reason || "no face"}`,
          true
        );
      }
    } else {
      awayStreakStartRef.current = null;
    }

    if (lastTRef.current !== undefined) {
      const dt = now - lastTRef.current;
      if (!attentive) totalAwayMsRef.current += dt;
    }
    lastTRef.current = now;
    setAwayTime((totalAwayMsRef.current / 1000).toFixed(1) + "s");

    if (sessionStartRef.current !== null) {
      const secs = Math.floor((now - sessionStartRef.current) / 1000);
      setSessionTime(Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0"));
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  // Model init (once, on mount)
  // ---------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function initModel() {
      try {
        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO",
          numFaces: 2,
        });
        if (cancelled) return;
        faceLandmarkerRef.current = landmarker;
        setModelStatus("model ready — click to begin");
        setModelReady(true);
      } catch (e: any) {
        if (cancelled) return;
        setModelStatus("model failed to load");
        showError("Could not load the detection model: " + e.message);
      }
    }

    initModel();
    return () => {
      cancelled = true;
    };
  }, []);

  // stop everything on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------

  async function startCamera() {
    if (runningRef.current) return;
    if (!faceLandmarkerRef.current) {
      showError("Model is still loading, try again in a moment.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
    } catch (e: any) {
      showError("Camera access was denied or unavailable: " + e.message);
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    runningRef.current = true;
    setRunning(true);
    sessionStartRef.current = performance.now();
    logEvent("Camera started — monitoring session begun.");
    rafRef.current = requestAnimationFrame(loop);
  }

  function stopCamera() {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRunning(false);
    logEvent("Camera stopped.");
  }

  function resetSession() {
    historyRef.current = [];
    totalAwayMsRef.current = 0;
    flagCountRef.current = 0;
    awayStreakStartRef.current = null;
    lastFlagAtRef.current = 0;
    sessionStartRef.current = performance.now();
    setFlagCount(0);
    setAwayTime("0.0s");
    setLogs([]);
    logEvent("Session reset.");
  }

  // ---------------------------------------------------------------------
  // Derived UI bits
  // ---------------------------------------------------------------------

  const statusPalette: Record<
    ResultState,
    { ring: string; iconColor: string; text: string; Icon: any }
  > = {
    ok: {
      ring: "from-green-500/20 to-cyan-500/20 border-green-500/40",
      iconColor: "text-green-400",
      text: "text-green-400",
      Icon: CheckCircle2,
    },
    warn: {
      ring: "from-amber-500/20 to-orange-500/20 border-amber-500/40",
      iconColor: "text-amber-400",
      text: "text-amber-400",
      Icon: AlertCircle,
    },
    bad: {
      ring: "from-red-500/20 to-orange-500/20 border-red-500/40",
      iconColor: "text-red-400",
      text: "text-red-400",
      Icon: AlertCircle,
    },
  };

  const palette = statusPalette[result.state];
  const confidencePct = Math.round(result.confidence * 100);
  const confidenceBarClass =
    result.confidence > 0.8
      ? "bg-gradient-to-r from-cyan-400 to-blue-500"
      : result.confidence > 0.5
      ? "bg-gradient-to-r from-amber-400 to-orange-500"
      : "bg-gradient-to-r from-red-500 to-orange-600";

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* local styles that Tailwind's default config doesn't provide out of the box */}
      <style jsx global>{`
        html,
        body {
          background: #020617;
        }
        .text-gradient {
          background: linear-gradient(90deg, #22d3ee, #3b82f6);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-up {
          animation: fadeUp 0.6s ease both;
        }
        @keyframes pulseRing {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        .animate-pulse-ring {
          animation: pulseRing 1.4s ease-in-out infinite;
        }
        .mirrored {
          transform: scaleX(-1);
        }
        .mono {
          font-family: "SF Mono", ui-monospace, Consolas, monospace;
        }
        #log-list::-webkit-scrollbar {
          width: 6px;
        }
        #log-list::-webkit-scrollbar-thumb {
          background: #164e63;
          border-radius: 4px;
        }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-8xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <ScanEye className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-wider text-gradient">
                PROCTORIA
              </span>
              <span className="text-xs text-slate-400">AI Exam Monitor</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <Zap className="h-3 w-3 text-cyan-400" />
              <span>On-device detection</span>
            </div>
            <button
              onClick={startCamera}
              disabled={running}
              className="h-8 px-3 rounded-md bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-70"
            >
              {running ? (
                <>
                  <Square className="h-3.5 w-3.5" />
                  Monitoring…
                </>
              ) : (
                <>
                  <Video className="h-3.5 w-3.5" />
                  Start monitoring
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <section className="flex-1 px-6 py-12 sm:py-20">
        <div className="mx-auto max-w-4xl">
          {/* Hero */}
          <div className="mb-16 text-center">
            <div
              className="flex items-center justify-center gap-2 mb-4 animate-fade-up"
            >
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Next-Gen Proctoring
              </p>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500" />
            </div>
            <h1
              className="animate-fade-up mt-6 text-5xl sm:text-7xl font-bold tracking-tight leading-tight"
              style={{ animationDelay: "100ms" }}
            >
              <span className="text-gradient">Face &amp; Gaze</span>
              <br />
              <span>Detection Engine</span>
            </h1>
            <p
              className="animate-fade-up mt-8 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto"
              style={{ animationDelay: "200ms" }}
            >
              Live, on-device AI monitoring for secure interview and exam
              sessions. Detects facial presence and gaze direction in real
              time — nothing is uploaded, the model runs entirely in your
              browser.
            </p>
          </div>

          {/* Stage card */}
          <div
            className="animate-fade-up mb-6 rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-blue-950/40 via-slate-950/30 to-cyan-950/40 p-4 shadow-2xl shadow-cyan-500/10"
            style={{ animationDelay: "300ms" }}
          >
            <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-black aspect-video">
              {/* placeholder state */}
              {!running && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer"
                  onClick={startCamera}
                >
                  <div className="rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-6 border border-cyan-500/30 backdrop-blur-sm">
                    <Camera className="h-10 w-10 text-cyan-400" />
                  </div>
                  <p className="text-2xl font-bold">Start monitoring</p>
                  <p className="text-sm text-slate-400">
                    Click to enable your webcam for live gaze analysis
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{modelStatus}</p>
                </div>
              )}

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`mirrored absolute inset-0 w-full h-full object-cover ${
                  running ? "" : "hidden"
                }`}
              />
              <canvas
                ref={canvasRef}
                className={`mirrored absolute inset-0 w-full h-full ${
                  running ? "" : "hidden"
                }`}
              />

              {running && (
                <div className="flex absolute top-4 right-4 items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500/80 to-blue-500/80 px-4 py-2 backdrop-blur-md border border-cyan-400/50 shadow-lg shadow-cyan-500/20">
                  <div className="h-2 w-2 rounded-full bg-cyan-200 animate-pulse-ring" />
                  <span className="text-xs font-semibold text-white">LIVE</span>
                </div>
              )}

              {running && (
                <div className="absolute bottom-0 left-0 right-0 grid grid-cols-4 gap-px bg-cyan-500/10">
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-2 mono text-[11px] text-slate-400">
                    yaw
                    <b className="block text-slate-100 text-sm">{metrics.yaw}</b>
                  </div>
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-2 mono text-[11px] text-slate-400">
                    pitch
                    <b className="block text-slate-100 text-sm">{metrics.pitch}</b>
                  </div>
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-2 mono text-[11px] text-slate-400">
                    eye offset
                    <b className="block text-slate-100 text-sm">{metrics.eye}</b>
                  </div>
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-2 mono text-[11px] text-slate-400">
                    faces
                    <b className="block text-slate-100 text-sm">{metrics.faces}</b>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {running && (
            <div className="animate-fade-up mb-12 flex gap-3">
              <button
                onClick={stopCamera}
                className="flex-1 h-11 rounded-md border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-950/20 text-slate-100 text-sm font-medium transition-colors"
              >
                Stop monitoring
              </button>
              <button
                onClick={resetSession}
                className="flex-1 h-11 rounded-md gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white text-sm font-semibold shadow-lg shadow-cyan-500/30 flex items-center justify-center"
              >
                Reset session <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="mb-12 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Results card */}
          {running && (
            <div className="animate-fade-up space-y-6 rounded-3xl border border-cyan-500/40 bg-gradient-to-br from-blue-950/50 via-slate-950/40 to-cyan-950/50 p-8 backdrop-blur-md shadow-2xl shadow-cyan-500/20">
              <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-400">
                    Detection Result
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${palette.ring} border animate-pulse-ring`}
                    >
                      <palette.Icon className={`h-6 w-6 ${palette.iconColor}`} />
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${palette.text}`}>
                        {result.title}
                      </p>
                      <p className="text-xs text-slate-400">{result.sub}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-400">Session flags</p>
                  <p className="text-2xl font-bold">{flagCount}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-blue-900/20 to-cyan-900/20 p-5 backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Face Detection
                  </p>
                  <p className="mt-3 text-2xl font-bold">
                    {result.faceDetected ? (
                      <span className="text-green-400">✓ Yes</span>
                    ) : (
                      <span className="text-red-400">✗ No</span>
                    )}
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-blue-900/20 to-cyan-900/20 p-5 backdrop-blur-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Gaze Direction
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {result.gazeLabel === "camera" && (
                      <>
                        <Eye className="h-5 w-5 text-green-400" />
                        <p className="text-base font-bold text-green-400">Camera</p>
                      </>
                    )}
                    {result.gazeLabel === "away" && (
                      <>
                        <EyeOff className="h-5 w-5 text-amber-400" />
                        <p className="text-base font-bold text-amber-400">Away</p>
                      </>
                    )}
                    {result.gazeLabel === "unknown" && (
                      <>
                        <EyeOff className="h-5 w-5 text-red-400" />
                        <p className="text-base font-bold text-red-400">Unknown</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-blue-900/20 to-cyan-900/20 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Attention Score (10s window)
                  </p>
                  <p className="text-3xl font-bold text-gradient">{confidencePct}%</p>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-800 border border-cyan-500/20">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${confidenceBarClass}`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-3 text-xs text-slate-400 mono">
                  <span>
                    Away time: <b className="text-slate-200">{awayTime}</b>
                  </span>
                  <span>
                    Session: <b className="text-slate-200">{sessionTime}</b>
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Session log
                </p>
                <div
                  id="log-list"
                  className="h-40 overflow-y-auto mono text-[11.5px] text-slate-400 space-y-1.5 pr-1 flex flex-col-reverse"
                >
                  {logs.map((entry) => (
                    <div key={entry.id} className={entry.isFlag ? "text-red-400" : ""}>
                      <span className={entry.isFlag ? "text-red-500/70" : "text-slate-600"}>
                        {entry.time}
                      </span>{" "}
                      {entry.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-cyan-500/20 bg-gradient-to-b from-transparent to-blue-950/20 py-8 text-center">
        <div className="mx-auto max-w-6xl px-6 space-y-3">
          <p className="text-xs text-slate-400">
            On-device inference • Nothing uploaded • Zero data retention
          </p>
          <p className="text-xs text-slate-500">
            PROCTORIA AI Detection Engine v1.0 · MediaPipe Face Landmarker, running
            locally
          </p>
        </div>
      </footer>
    </div>
  );
}