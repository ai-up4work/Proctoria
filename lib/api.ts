import type { AnalyzeResponse } from '@/app/api/analyze/route';

export async function analyzeFrame(file: File): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'Analysis failed. Try another image.');
  }

  return response.json();
}
