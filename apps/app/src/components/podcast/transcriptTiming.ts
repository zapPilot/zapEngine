export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export function estimateTranscriptTiming(
  script: string | null,
  audioDurationSeconds: number,
): TranscriptSegment[] {
  const trimmedScript = script?.trim();
  if (trimmedScript === undefined || trimmedScript === '') return [];

  const rawParagraphs = trimmedScript
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const texts =
    rawParagraphs.length > 1 ? rawParagraphs : splitSentences(trimmedScript);
  if (texts.length === 0) return [];

  const duration = Number.isFinite(audioDurationSeconds)
    ? Math.max(0, audioDurationSeconds)
    : 0;
  if (duration <= 0) {
    return texts.map((text) => ({ text, start: 0, end: 0 }));
  }

  const weights = texts.map(timingWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let accumulatedWeight = 0;

  return texts.map((text, index) => {
    const start = scaledSeconds(accumulatedWeight, totalWeight, duration);
    accumulatedWeight += weights[index] ?? 0;
    const end =
      index === texts.length - 1
        ? duration
        : scaledSeconds(accumulatedWeight, totalWeight, duration);
    return { text, start, end };
  });
}

function splitSentences(script: string): string[] {
  const matches = script.match(/[^。！？.!?]+[。！？.!?]?/g);
  if (matches === null) return [script];
  const sentences = matches
    .map((match) => match.trim())
    .filter((match) => match !== '');
  return sentences.length > 0 ? sentences : [script];
}

function timingWeight(text: string): number {
  const compact = text.replace(/\s+/g, '');
  return compact.length > 0 ? Array.from(compact).length : 1;
}

function scaledSeconds(
  weight: number,
  totalWeight: number,
  duration: number,
): number {
  if (totalWeight <= 0 || duration <= 0) return 0;
  return (weight / totalWeight) * duration;
}
