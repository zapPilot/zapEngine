import 'dart:developer' as developer;

enum LogLevel {
  info(800),
  warn(900),
  error(1000);

  const LogLevel(this.value);

  final int value;
}

class LogRecord {
  const LogRecord({
    required this.level,
    required this.message,
    this.error,
    this.stackTrace,
  });

  final LogLevel level;
  final String message;
  final Object? error;
  final StackTrace? stackTrace;
}

class AppLogger {
  const AppLogger._();

  static const _loggerName = 'ai_podcast_mobile';

  static void Function(LogRecord record)? sink;

  static void info(
    String message, [
    Object? error,
    StackTrace? stackTrace,
  ]) {
    _log(LogLevel.info, message, error, stackTrace);
  }

  static void warn(
    String message, [
    Object? error,
    StackTrace? stackTrace,
  ]) {
    _log(LogLevel.warn, message, error, stackTrace);
  }

  static void error(
    String message, [
    Object? error,
    StackTrace? stackTrace,
  ]) {
    _log(LogLevel.error, message, error, stackTrace);
  }

  static void _log(
    LogLevel level,
    String message,
    Object? error,
    StackTrace? stackTrace,
  ) {
    final record = LogRecord(
      level: level,
      message: message,
      error: error,
      stackTrace: stackTrace,
    );

    sink?.call(record);
    developer.log(
      message,
      name: _loggerName,
      level: level.value,
      error: error,
      stackTrace: stackTrace,
    );
  }
}
