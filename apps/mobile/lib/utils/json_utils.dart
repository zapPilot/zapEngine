int readIntFromJson(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  final value = json[camelKey] ?? json[snakeKey];
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}
