String _twoDigits(int value) => value.toString().padLeft(2, '0');

String formatEpisodeDate(DateTime date) {
  return [
    '${date.year}-${_twoDigits(date.month)}-${_twoDigits(date.day)}',
    '${_twoDigits(date.hour)}:${_twoDigits(date.minute)}',
  ].join(' ');
}

String formatDuration(Duration duration) {
  final totalSeconds = duration.inSeconds;
  final hours = totalSeconds ~/ 3600;
  final minutes = (totalSeconds % 3600) ~/ 60;
  final seconds = totalSeconds % 60;

  if (hours > 0) {
    return '$hours:${_twoDigits(minutes)}:${_twoDigits(seconds)}';
  }
  return '$minutes:${_twoDigits(seconds)}';
}
