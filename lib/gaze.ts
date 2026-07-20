// lib/gaze.ts
// Pure, UI-free gaze/head-pose math + tunable thresholds.
// Kept isolated so both the exam page (headless) and the monitor page
// (camera visible) share identical detection behavior, and so it's
// unit-testable without mounting React.

export const YAW_LIMIT = 18;
export const PITCH_LIMIT = 14;
export const EYE_OFFSET_LIMIT = 0.28;
export const AWAY_TO_FLAG_MS = 2500;
export const WINDOW_MS = 10000;

export const LEFT_EYE_CORNERS = [33, 133];
export const RIGHT_EYE_CORNERS = [362, 263];
export const LEFT_IRIS = [468, 469, 470, 471, 472];
export const RIGHT_IRIS = [473, 474, 475, 476, 477];

export function matrixToEuler(m: Float32Array | number[]) {
  const r13 = m[8];
  const r23 = m[9];
  const r33 = m[10];
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r23)));
  const yaw = Math.atan2(r13, r33);
  return { yaw: (yaw * 180) / Math.PI, pitch: (pitch * 180) / Math.PI };
}

export function irisOffset(
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

export type ResultState = "ok" | "warn" | "bad";
export type GazeLabel = "camera" | "away" | "unknown";

export interface DetectionResult {
  state: ResultState;
  title: string;
  sub: string;
  faceDetected: boolean;
  gazeLabel: GazeLabel;
  confidence: number;
}