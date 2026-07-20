// hooks/useGazeMonitor.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AWAY_TO_FLAG_MS,
  DetectionResult,
  EYE_OFFSET_LIMIT,
  FlagCategory,
  GazeLabel,
  LEFT_EYE_CORNERS,
  LEFT_IRIS,
  PITCH_LIMIT,
  RIGHT_EYE_CORNERS,
  RIGHT_IRIS,
  WINDOW_MS,
  YAW_LIMIT,
  irisOffset,
  matrixToEuler,
} from "@/lib/gaze";

export interface GazeMetrics {
  yaw: string;
  pitch: string;
  eye: string;
  faces: string;
}

export interface GazeMonitorOptions {
  /** Called on every processed frame (~ every rAF tick). Cheap; throttle upstream if needed. */
  onStatus?: (status: {
    result: DetectionResult;
    metrics: GazeMetrics;
    flagCount: number;
    awayTime: number; // ms
    sessionTime: number; // ms
  }) => void;
  /** Called only when a sustained attention-loss flag actually fires, or a lifecycle event occurs. */
  onFlag?: (flag: { message: string; timestamp: number; category: FlagCategory }) => void;
  /** If false, the video element is still required in the DOM (can be visually hidden) but no canvas overlay drawing happens. */
  drawOverlay?: boolean;
}

/**
 * Headless-friendly face/gaze monitor. Attach `videoRef` to a <video> element
 * anywhere in the tree (it can be display:none / off-screen — getUserMedia
 * and MediaPipe both still work on a hidden video element, it just must be
 * playing). Attach `canvasRef` only if you want the overlay drawn (skip it
 * entirely on pages where the feed is never shown to the student).
 */
export function useGazeMonitor(options: GazeMonitorOptions = {}) {
  const { onStatus, onFlag, drawOverlay = false } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const faceLandmarkerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const awayStreakStartRef = useRef<number | null>(null);
  const totalAwayMsRef = useRef(0);
  const flagCountRef = useRef(0);
  const lastFlagAtRef = useRef(0);
  const sessionStartRef = useRef<number | null>(null);
  const lastTRef = useRef<number | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  const [modelStatus, setModelStatus] = useState("loading model…");
  const [modelReady, setModelReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [flagCount, setFlagCount] = useState(0);

  const logEvent = useCallback(
    (message: string, category: FlagCategory) => {
      onFlag?.({ message, timestamp: Date.now(), category });
    },
    [onFlag]
  );

  function drawFrame(landmarks: { x: number; y: number }[]) {
    if (!drawOverlay) return;
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

  function loop() {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const faceLandmarker = faceLandmarkerRef.current;
    if (!video || !faceLandmarker) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    const detection = faceLandmarker.detectForVideo(video, now);
    if (drawOverlay && canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    const faces = detection.faceLandmarks || [];
    let attentive = false;
    let reason = "";
    let gazeLabel: GazeLabel = "unknown";
    let confidence = 0;
    let result: DetectionResult;
    let metrics: GazeMetrics;

    // Set whenever the current frame is NOT attentive, so the sustained-streak
    // check below knows which FlagCategory to attach when it fires.
    let awayCategory: FlagCategory | null = null;

    if (faces.length === 0) {
      awayCategory = "no_face";
      metrics = { yaw: "–", pitch: "–", eye: "–", faces: "0" };
      result = {
        state: "bad",
        title: "Not visible",
        sub: "No face detected in frame",
        faceDetected: false,
        gazeLabel: "unknown",
        confidence: 0,
      };
    } else if (faces.length > 1) {
      awayCategory = "multiple_faces";
      reason = "Multiple faces detected in frame";
      metrics = { yaw: "–", pitch: "–", eye: "–", faces: String(faces.length) };
      result = {
        state: "bad",
        title: "Flagged",
        sub: reason,
        faceDetected: true,
        gazeLabel: "unknown",
        confidence: 0,
      };
    } else {
      const landmarks = faces[0];
      const matrix = detection.facialTransformationMatrixes[0].data;
      const { yaw, pitch } = matrixToEuler(matrix);
      const leftOff = irisOffset(landmarks, LEFT_EYE_CORNERS, LEFT_IRIS);
      const rightOff = irisOffset(landmarks, RIGHT_EYE_CORNERS, RIGHT_IRIS);
      const eyeOffsetX = (leftOff.x + rightOff.x) / 2;

      metrics = {
        yaw: yaw.toFixed(1) + "°",
        pitch: pitch.toFixed(1) + "°",
        eye: eyeOffsetX.toFixed(2),
        faces: String(faces.length),
      };

      const headDev = Math.max(Math.abs(yaw) / YAW_LIMIT, Math.abs(pitch) / PITCH_LIMIT);
      const eyeDev = Math.abs(eyeOffsetX) / EYE_OFFSET_LIMIT;
      const dev = Math.max(headDev, eyeDev);
      confidence = Math.max(0, 1 - dev);
      attentive = dev < 1;
      gazeLabel = attentive ? "camera" : "away";

      if (!attentive) {
        awayCategory = headDev > eyeDev ? "head_away" : "gaze_away";
        reason = headDev > eyeDev ? "Head turned away from camera" : "Eyes directed away from screen";
      }

      result = {
        state: attentive ? "ok" : "warn",
        title: attentive ? "Verified" : "Flagged",
        sub: attentive ? "Face detected • Attention confirmed" : reason,
        faceDetected: true,
        gazeLabel,
        confidence,
      };

      drawFrame(landmarks);
    }

    if (!attentive) {
      if (awayStreakStartRef.current === null) awayStreakStartRef.current = now;
      const streak = now - awayStreakStartRef.current;
      if (streak >= AWAY_TO_FLAG_MS && now - lastFlagAtRef.current > AWAY_TO_FLAG_MS && awayCategory) {
        flagCountRef.current += 1;
        lastFlagAtRef.current = now;
        setFlagCount(flagCountRef.current);
        logEvent(
          `Sustained attention loss (${(streak / 1000).toFixed(1)}s) — ${reason || "no face in frame"}`,
          awayCategory
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

    const sessionTime = sessionStartRef.current !== null ? now - sessionStartRef.current : 0;

    onStatus?.({
      result,
      metrics,
      flagCount: flagCountRef.current,
      awayTime: totalAwayMsRef.current,
      sessionTime,
    });

    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    let cancelled = false;
    async function initModel() {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
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
        setModelStatus("model ready");
        setModelReady(true);
      } catch (e: any) {
        if (cancelled) return;
        setModelStatus("model failed to load");
        setErrorMsg("Could not load the detection model: " + e.message);
      }
    }
    initModel();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (!faceLandmarkerRef.current) {
      setErrorMsg("Model is still loading, try again in a moment.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    } catch (e: any) {
      setErrorMsg("Camera access was denied or unavailable: " + e.message);
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
    logEvent("Camera started — monitoring session begun.", "system");
    rafRef.current = requestAnimationFrame(loop);
  }, [logEvent]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRunning(false);
    logEvent("Camera stopped.", "system");
  }, [logEvent]);

  const reset = useCallback(() => {
    totalAwayMsRef.current = 0;
    flagCountRef.current = 0;
    awayStreakStartRef.current = null;
    lastFlagAtRef.current = 0;
    sessionStartRef.current = performance.now();
    setFlagCount(0);
    logEvent("Session reset.", "system");
  }, [logEvent]);

  return {
    videoRef,
    canvasRef,
    modelStatus,
    modelReady,
    running,
    errorMsg,
    flagCount,
    start,
    stop,
    reset,
  };
}