String formatEpisodeDate(DateTime date) {
  String twoDigits(int value) => value.toString().padLeft(2, '0');

  return [
    '${date.year}-${twoDigits(date.month)}-${twoDigits(date.day)}',
    '${twoDigits(date.hour)}:${twoDigits(date.minute)}',
  ].join(' ');
}
