Object? _readJsonValue(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  return json[camelKey] ?? json[snakeKey];
}

T _readConvertedJsonValue<T>(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
  T Function(Object? value) convert,
) {
  return convert(_readJsonValue(json, camelKey, snakeKey));
}

int readIntFromJson(
    Map<String, dynamic> json, String camelKey, String snakeKey) {
  return _readConvertedJsonValue(json, camelKey, snakeKey, _coerceInt);
}

int _coerceInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}

bool readBoolFromJson(
    Map<String, dynamic> json, String camelKey, String snakeKey) {
  return _readConvertedJsonValue(json, camelKey, snakeKey, _coerceBool);
}

bool _coerceBool(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;

  switch (value?.toString().trim().toLowerCase()) {
    case 'true':
    case 't':
    case '1':
    case 'yes':
      return true;
    default:
      return false;
  }
}

String readRequiredString(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  return _readJsonValue(json, camelKey, snakeKey) as String;
}

String readOptionalString(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  return _readJsonValue(json, camelKey, snakeKey)?.toString() ?? '';
}

String? readNullableString(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  final value = readOptionalString(json, camelKey, snakeKey).trim();
  return value.isEmpty ? null : value;
}
