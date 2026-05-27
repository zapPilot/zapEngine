import 'package:ai_podcast_mobile/utils/app_logger.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    AppLogger.sink = null;
  });

  test('info forwards records to the sink', () {
    final records = <LogRecord>[];
    AppLogger.sink = records.add;

    AppLogger.info('Deep link opened');

    expect(records, hasLength(1));
    expect(records.single.level, LogLevel.info);
    expect(records.single.message, 'Deep link opened');
    expect(records.single.error, isNull);
    expect(records.single.stackTrace, isNull);
  });

  test('warn forwards error details to the sink', () {
    final records = <LogRecord>[];
    final error = StateError('offline');
    final stackTrace = StackTrace.current;
    AppLogger.sink = records.add;

    AppLogger.warn('Likes sync failed', error, stackTrace);

    expect(records, hasLength(1));
    expect(records.single.level, LogLevel.warn);
    expect(records.single.message, 'Likes sync failed');
    expect(records.single.error, same(error));
    expect(records.single.stackTrace, same(stackTrace));
  });

  test('error forwards error details to the sink', () {
    final records = <LogRecord>[];
    final error = Exception('audio failed');
    final stackTrace = StackTrace.current;
    AppLogger.sink = records.add;

    AppLogger.error('Playback source failed', error, stackTrace);

    expect(records, hasLength(1));
    expect(records.single.level, LogLevel.error);
    expect(records.single.message, 'Playback source failed');
    expect(records.single.error, same(error));
    expect(records.single.stackTrace, same(stackTrace));
  });
}
