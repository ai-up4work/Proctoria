import { NextRequest, NextResponse } from 'next/server';

export interface AnalyzeResponse {
  face_detected: boolean;
  gaze_label: 'LOOKING AT CAMERA' | 'LOOKING AWAY' | null;
  confidence: number | null;
  flagged: boolean;
  threshold: number;
}

const MODEL_THRESHOLD = 0.3;

const SCENARIOS: Array<Omit<AnalyzeResponse, 'threshold'>> = [
  { face_detected: true, gaze_label: 'LOOKING AT CAMERA', confidence: 0.47, flagged: false },
  { face_detected: true, gaze_label: 'LOOKING AT CAMERA', confidence: 0.62, flagged: false },
  { face_detected: true, gaze_label: 'LOOKING AT CAMERA', confidence: 0.71, flagged: false },
  { face_detected: true, gaze_label: 'LOOKING AWAY', confidence: 0.58, flagged: true },
  { face_detected: true, gaze_label: 'LOOKING AWAY', confidence: 0.66, flagged: true },
  { face_detected: false, gaze_label: null, confidence: null, flagged: true },
];

function simulateNetworkDelay(ms = 1200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'no_file_provided' },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'invalid_image' },
        { status: 400 }
      );
    }

    await simulateNetworkDelay();

    const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

    const response: AnalyzeResponse = {
      ...scenario,
      threshold: MODEL_THRESHOLD,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'analysis_failed' },
      { status: 500 }
    );
  }
}
