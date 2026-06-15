class TranscriptSegment {
  const TranscriptSegment({
    required this.text,
    required this.start,
    required this.end,
  });

  final String text;
  final Duration start;
  final Duration end;
}

List<TranscriptSegment> estimateTranscriptTiming(
  String? script,
  Duration audioDuration,
) {
  final trimmedScript = script?.trim();
  if (trimmedScript == null || trimmedScript.isEmpty) {
    return const [];
  }

  final rawParagraphs = trimmedScript
      .split(RegExp(r'\n\s*\n+'))
      .map((paragraph) => paragraph.trim())
      .where((paragraph) => paragraph.isNotEmpty)
      .toList(growable: false);

  final texts =
      rawParagraphs.length > 1 ? rawParagraphs : _splitSentences(trimmedScript);
  if (texts.isEmpty) return const [];

  if (audioDuration <= Duration.zero) {
    return [
      for (final text in texts)
        TranscriptSegment(text: text, start: Duration.zero, end: Duration.zero),
    ];
  }

  final weights = texts.map(_timingWeight).toList(growable: false);
  final totalWeight = weights.fold<int>(0, (total, weight) => total + weight);
  final durationMs = audioDuration.inMilliseconds;
  var accumulatedWeight = 0;

  return [
    for (var index = 0; index < texts.length; index++)
      TranscriptSegment(
        text: texts[index],
        start: _scaledDuration(accumulatedWeight, totalWeight, durationMs),
        end: index == texts.length - 1
            ? audioDuration
            : _scaledDuration(
                accumulatedWeight += weights[index],
                totalWeight,
                durationMs,
              ),
      ),
  ];
}

List<String> _splitSentences(String script) {
  final matches = RegExp(r'[^。！？.!?]+[。！？.!?]?')
      .allMatches(script)
      .map((match) => match.group(0)?.trim() ?? '')
      .where((text) => text.isNotEmpty)
      .toList(growable: false);

  return matches.isEmpty ? [script] : matches;
}

int _timingWeight(String text) {
  final compact = text.replaceAll(RegExp(r'\s+'), '');
  return compact.runes.isEmpty ? 1 : compact.runes.length;
}

Duration _scaledDuration(int weight, int totalWeight, int durationMs) {
  if (totalWeight <= 0 || durationMs <= 0) return Duration.zero;
  return Duration(milliseconds: (weight / totalWeight * durationMs).round());
}
