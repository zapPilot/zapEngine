export interface CanonicalSentence {
  id: string;
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

const SENTENCE_PATTERN =
  /[^\r\n。！？!?；;]+(?:[。！？!?；;]+[」』”’）)]*)?|[。！？!?；;]+/gu;

export function splitCanonicalSentences(script: string): CanonicalSentence[] {
  const sentences: CanonicalSentence[] = [];

  for (const match of script.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0];
    const matchStart = match.index;
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const startOffset = matchStart + leadingWhitespace;
    const endOffset = matchStart + raw.length - trailingWhitespace;
    if (endOffset <= startOffset) continue;

    const index = sentences.length;
    sentences.push({
      id: `s${String(index + 1).padStart(4, '0')}`,
      index,
      text: script.slice(startOffset, endOffset),
      startOffset,
      endOffset,
    });
  }

  if (sentences.length === 0 && script.trim()) {
    const startOffset = script.length - script.trimStart().length;
    const endOffset = script.trimEnd().length;
    sentences.push({
      id: 's0001',
      index: 0,
      text: script.slice(startOffset, endOffset),
      startOffset,
      endOffset,
    });
  }

  return sentences;
}

export function canonicalSentenceRangeText(
  script: string,
  sentences: readonly CanonicalSentence[],
  startId: string,
  endId: string,
): string | null {
  const start = sentences.find((sentence) => sentence.id === startId);
  const end = sentences.find((sentence) => sentence.id === endId);
  if (!start || !end || end.index < start.index) return null;
  return script.slice(start.startOffset, end.endOffset);
}

export function formatSentencesForPrompt(
  sentences: readonly CanonicalSentence[],
): string {
  return sentences
    .map((sentence) => `${sentence.id}\t${sentence.text}`)
    .join('\n');
}
