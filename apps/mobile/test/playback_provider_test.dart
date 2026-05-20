import 'dart:async';

import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/services/audio_player_handler.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test(
    'toggle loads a new episode through the handler and starts playback',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = _episode('episode-1');

      await provider.toggle(episode);

      expect(handler.loadedEpisodeIds, ['episode-1']);
      expect(handler.playCount, 1);
      expect(provider.currentEpisode, episode);
      expect(provider.isPlaying, isTrue);
      expect(provider.loadingEpisodeId, isNull);

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'toggle resumes in-progress episodes from their last position',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = _episode('episode-1').copyWith(lastPositionSeconds: 42);

      await provider.toggle(episode);

      expect(handler.loadedEpisodeIds, ['episode-1']);
      expect(handler.seekPositions, [const Duration(seconds: 42)]);
      expect(provider.position, const Duration(seconds: 42));
      expect(handler.playCount, 1);

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'toggle pauses and resumes the current episode without reloading it',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = _episode('episode-1');

      await provider.toggle(episode);
      await provider.toggle(episode);
      await provider.toggle(episode);

      expect(handler.loadedEpisodeIds, ['episode-1']);
      expect(handler.pauseCount, 1);
      expect(handler.playCount, 2);

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'toggle reloads the same episode id when the localization changes',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final zhEpisode = _episode('episode-1').copyWith(
        localizationId: 'episode-1-zh',
        languageCode: 'zh-Hant',
        hlsUrl: 'https://example.com/zh.m3u8',
      );
      final enEpisode = _episode('episode-1').copyWith(
        localizationId: 'episode-1-en',
        languageCode: 'en',
        hlsUrl: 'https://example.com/en.m3u8',
      );

      await provider.toggle(zhEpisode);
      await provider.toggle(enEpisode);

      expect(handler.loadedEpisodeIds, ['episode-1', 'episode-1']);
      expect(handler.loadedTrackUrls, [
        'https://example.com/zh.m3u8',
        'https://example.com/en.m3u8',
      ]);
      expect(handler.playCount, 2);
      expect(provider.currentEpisode, enEpisode);

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'setSpeedForCurrentSection delegates to the handler and tracks speed stream updates',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);

      await provider.setSpeedForCurrentSection(1.5);

      expect(handler.speed, 1.5);
      expect(provider.speed, 1.5);
      expect(provider.mainSpeed, 1.5);
      expect(provider.classroomSpeed, 1.0);

      provider.dispose();
      await handler.dispose();
    },
  );

  test('setSpeedForCurrentSection persists the main speed to SharedPreferences',
      () async {
    SharedPreferences.setMockInitialValues({});
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    await provider.setSpeedForCurrentSection(1.75);

    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getDouble('playback_speed_main'),
      1.75,
      reason: 'speed must survive app restarts via local prefs',
    );
    expect(prefs.getDouble('playback_speed_classroom'), isNull);

    provider.dispose();
    await handler.dispose();
  });

  test('PlaybackProvider restores stored section speeds on construction',
      () async {
    SharedPreferences.setMockInitialValues({
      'playback_speed_main': 1.25,
      'playback_speed_classroom': 0.75,
    });
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    // _loadSpeed() runs asynchronously from the constructor; let it settle.
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(
      handler.speed,
      1.25,
      reason:
          'saved main speed must be re-applied to the audio handler at start',
    );
    expect(provider.speed, 1.25);
    expect(provider.mainSpeed, 1.25);
    expect(provider.classroomSpeed, 0.75);

    provider.dispose();
    await handler.dispose();
  });

  test('PlaybackProvider falls back to 1.0x when no speed is stored', () async {
    SharedPreferences.setMockInitialValues({});
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    await Future<void>.delayed(Duration.zero);

    expect(handler.speed, 1.0);
    expect(provider.speed, 1.0);
    expect(provider.mainSpeed, 1.0);
    expect(provider.classroomSpeed, 1.0);

    provider.dispose();
    await handler.dispose();
  });

  test('PlaybackProvider migrates the legacy speed key to main speed only',
      () async {
    SharedPreferences.setMockInitialValues({'playback_speed': 1.25});
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    await _flushProviderAsync();

    final prefs = await SharedPreferences.getInstance();
    expect(provider.mainSpeed, 1.25);
    expect(provider.classroomSpeed, 1.0);
    expect(handler.speed, 1.25);
    expect(prefs.getDouble('playback_speed_main'), 1.25);
    expect(prefs.getDouble('playback_speed_classroom'), isNull);

    provider.dispose();
    await handler.dispose();
  });

  test('section changes apply the remembered speed for that section', () async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    await provider.setSpeedForCurrentSection(1.5);
    handler.emitSection(PlaybackSection.classroom);
    await _flushProviderAsync();

    expect(provider.currentSection, PlaybackSection.classroom);
    expect(provider.speed, 1.0);
    expect(handler.speed, 1.0);

    await provider.setSpeedForCurrentSection(0.75);
    expect(provider.classroomSpeed, 0.75);
    expect(handler.speed, 0.75);

    handler.emitSection(PlaybackSection.main);
    await _flushProviderAsync();

    expect(provider.currentSection, PlaybackSection.main);
    expect(provider.speed, 1.5);
    expect(handler.speed, 1.5);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getDouble('playback_speed_main'), 1.5);
    expect(prefs.getDouble('playback_speed_classroom'), 0.75);

    provider.dispose();
    await handler.dispose();
  });

  test(
    'toggle selects the first playable audio track for a new episode',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = _episodeWithTracks('episode-1');

      await provider.toggle(episode);

      expect(provider.currentAudioTrack, episode.audioTracks.first);
      expect(handler.currentAudioTrack, episode.audioTracks.first);
      expect(handler.loadedTrackUrls, ['https://example.com/zh.m3u8']);

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'setAudioTrack delegates to the handler and updates the current track',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);
      final episode = _episodeWithTracks('episode-1');
      final englishTrack = episode.audioTracks[1];

      await provider.toggle(episode);
      await provider.setAudioTrack(englishTrack);

      expect(provider.currentAudioTrack, englishTrack);
      expect(handler.currentAudioTrack, englishTrack);
      expect(handler.loadedTrackUrls, [
        'https://example.com/zh.m3u8',
        'https://example.com/en.m3u8',
      ]);

      provider.dispose();
      await handler.dispose();
    },
  );

  test('setAudioTrack keeps the current playback speed', () async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);
    final episode = _episodeWithTracks('episode-1');
    final japaneseTrack = episode.audioTracks[2];

    await provider.toggle(episode);
    await provider.setSpeedForCurrentSection(1.5);
    await provider.setAudioTrack(japaneseTrack);

    expect(provider.speed, 1.5);
    expect(handler.speed, 1.5);
    expect(provider.currentAudioTrack, japaneseTrack);

    provider.dispose();
    await handler.dispose();
  });

  test(
    'playSmart resumes the first in-progress episode and advances queue',
    () async {
      final handler = FakePodcastAudioHandler();
      final service = _FakeEpisodeService();
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');
      final newestUnplayed = _episode('episode-3');
      final inProgress = _episode(
        'episode-2',
      ).copyWith(lastPositionSeconds: 42);
      final oldestUnplayed = _episode('episode-1');

      await provider.playSmart([newestUnplayed, inProgress, oldestUnplayed]);

      expect(handler.loadedEpisodeIds, ['episode-2']);
      expect(handler.seekPositions, [const Duration(seconds: 42)]);
      expect(handler.playCount, 1);
      expect(provider.currentEpisode?.id, 'episode-2');
      expect(provider.position, const Duration(seconds: 42));

      handler.complete();
      await Future<void>.delayed(Duration.zero);

      expect(service.listenedWrites, [
        const _ListenedWrite('user-1', 'episode-2', true),
      ]);
      expect(handler.loadedEpisodeIds, ['episode-2', 'episode-1']);
      expect(handler.playCount, 2);
      expect(provider.currentEpisode?.id, 'episode-1');

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'playSmart starts the oldest unplayed episode when nothing is in progress',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(
        handler,
        episodeService: _FakeEpisodeService(),
      );
      final newestUnplayed = _episode('episode-3');
      final completed = _episode('episode-2').copyWith(listened: true);
      final oldestUnplayed = _episode('episode-1');

      await provider.playSmart([newestUnplayed, completed, oldestUnplayed]);

      expect(handler.loadedEpisodeIds, ['episode-1']);
      expect(handler.seekPositions, isEmpty);
      expect(provider.currentEpisode?.id, 'episode-1');

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'playSmart restarts from the oldest episode when all are completed',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(
        handler,
        episodeService: _FakeEpisodeService(),
      );
      final newestCompleted = _episode('episode-3').copyWith(listened: true);
      final middleCompleted = _episode('episode-2').copyWith(listened: true);
      final oldestCompleted = _episode('episode-1').copyWith(listened: true);

      await provider.playSmart([
        newestCompleted,
        middleCompleted,
        oldestCompleted,
      ]);

      expect(handler.loadedEpisodeIds, ['episode-1']);
      expect(provider.currentEpisode?.id, 'episode-1');

      provider.dispose();
      await handler.dispose();
    },
  );

  test('marks an episode listened when position reaches near the end',
      () async {
    final handler = FakePodcastAudioHandler();
    final service = _FakeEpisodeService();
    final provider = PlaybackProvider(handler, episodeService: service)
      ..setUser('user-1');

    await provider.toggle(_episode('episode-1'));
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 598));
    handler.emitPosition(const Duration(seconds: 599));
    handler.emitPosition(const Duration(seconds: 599));
    await _flushProviderAsync();

    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-1', true),
    ]);

    provider.dispose();
    await handler.dispose();
  });

  test('seek near the end marks an episode listened without a position event',
      () async {
    final handler = FakePodcastAudioHandler(emitPositionOnSeek: false);
    final service = _FakeEpisodeService();
    final provider = PlaybackProvider(handler, episodeService: service)
      ..setUser('user-1');

    await provider.toggle(_episode('episode-1'));
    handler.emitDuration(const Duration(seconds: 600));

    await provider.seek(const Duration(seconds: 599));

    expect(handler.seekPositions, [const Duration(seconds: 599)]);
    expect(provider.position, const Duration(seconds: 600));

    await _flushProviderAsync();

    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-1', true),
    ]);

    provider.dispose();
    await handler.dispose();
  });

  test('completion still writes listened when position persistence fails',
      () async {
    final handler = FakePodcastAudioHandler();
    final service = _FakeEpisodeService(
      positionWriteError: Exception('position write failed'),
    );
    final provider = PlaybackProvider(handler, episodeService: service)
      ..setUser('user-1');

    await provider.toggle(_episode('episode-1'));
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 599));
    await _flushProviderAsync();

    expect(service.positionWrites, [
      const _PositionWrite('user-1', 'episode-1', 599),
      const _PositionWrite('user-1', 'episode-1', 600),
    ]);
    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-1', true),
    ]);

    provider.dispose();
    await handler.dispose();
  });

  test(
    'completion still writes listened when PostgrestException blocks position writes',
    () async {
      final handler = FakePodcastAudioHandler();
      final service = _FakeEpisodeService(
        positionWriteError: const PostgrestException(
          message: 'permission denied for table user_episode_state',
          code: '42501',
        ),
      );
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');

      await provider.toggle(_episode('episode-1'));
      handler.emitDuration(const Duration(seconds: 600));
      handler.emitPosition(const Duration(seconds: 599));
      await _flushProviderAsync();

      expect(service.listenedWrites, [
        const _ListenedWrite('user-1', 'episode-1', true),
      ]);

      provider.dispose();
      await handler.dispose();
    },
  );

  test('near-end completion writes listened only once', () async {
    final handler = FakePodcastAudioHandler();
    final service = _FakeEpisodeService();
    final provider = PlaybackProvider(handler, episodeService: service)
      ..setUser('user-1');

    await provider.toggle(_episode('episode-1'));
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 599));
    handler.emitPosition(const Duration(seconds: 598));
    handler.emitPosition(const Duration(seconds: 599));
    handler.emitPosition(const Duration(seconds: 600));
    await _flushProviderAsync();

    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-1', true),
    ]);

    provider.dispose();
    await handler.dispose();
  });

  test(
    'completedEpisodeIds stream emits exactly once on near-end completion',
    () async {
      final handler = FakePodcastAudioHandler();
      final service = _FakeEpisodeService();
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');
      final emitted = <String>[];
      final sub = provider.completedEpisodeIds.listen(emitted.add);

      await provider.toggle(_episode('episode-1'));
      handler.emitDuration(const Duration(seconds: 600));
      handler.emitPosition(const Duration(seconds: 599));
      handler.emitPosition(const Duration(seconds: 599));
      handler.emitPosition(const Duration(seconds: 600));
      await _flushProviderAsync();

      expect(emitted, ['episode-1']);

      await sub.cancel();
      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'completedEpisodeIds stream emits when handler reports completed state',
    () async {
      final handler = FakePodcastAudioHandler();
      final service = _FakeEpisodeService();
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');
      final emitted = <String>[];
      final sub = provider.completedEpisodeIds.listen(emitted.add);

      await provider.toggle(_episode('episode-1'));
      handler.complete();
      await _flushProviderAsync();

      expect(emitted, ['episode-1']);
      expect(service.listenedWrites, [
        const _ListenedWrite('user-1', 'episode-1', true),
      ]);

      await sub.cancel();
      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'seek to mid-episode does not finalize the episode',
    () async {
      final handler = FakePodcastAudioHandler(emitPositionOnSeek: false);
      final service = _FakeEpisodeService();
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');
      final emitted = <String>[];
      final sub = provider.completedEpisodeIds.listen(emitted.add);

      await provider.toggle(_episode('episode-1'));
      handler.emitDuration(const Duration(seconds: 600));
      await provider.seek(const Duration(seconds: 300));
      await _flushProviderAsync();

      expect(service.listenedWrites, isEmpty);
      expect(emitted, isEmpty);

      handler.emitPosition(const Duration(seconds: 599));
      await _flushProviderAsync();

      expect(service.listenedWrites, [
        const _ListenedWrite('user-1', 'episode-1', true),
      ]);
      expect(emitted, ['episode-1']);

      await sub.cancel();
      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'seek with unknown duration does not finalize the episode',
    () async {
      final handler = FakePodcastAudioHandler(emitPositionOnSeek: false);
      final service = _FakeEpisodeService();
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');

      await provider.toggle(_episode('episode-1'));
      await provider.seek(const Duration(seconds: 599));
      await _flushProviderAsync();

      expect(service.listenedWrites, isEmpty);

      handler.emitDuration(const Duration(seconds: 600));
      handler.emitPosition(const Duration(seconds: 599));
      await _flushProviderAsync();

      expect(service.listenedWrites, [
        const _ListenedWrite('user-1', 'episode-1', true),
      ]);

      provider.dispose();
      await handler.dispose();
    },
  );

  test(
    'completion stream stays silent when setListened throws and does not retry',
    () async {
      final uncaughtErrors = <Object>[];
      final service = _FakeEpisodeService(
        listenedWriteError: const PostgrestException(
          message: 'permission denied for table user_episode_state',
          code: '42501',
        ),
      );

      await runZonedGuarded<Future<void>>(
        () async {
          final handler = FakePodcastAudioHandler();
          final provider = PlaybackProvider(handler, episodeService: service)
            ..setUser('user-1');
          final emitted = <String>[];
          final sub = provider.completedEpisodeIds.listen(emitted.add);

          await provider.toggle(_episode('episode-1'));
          handler.emitDuration(const Duration(seconds: 600));
          handler.emitPosition(const Duration(seconds: 599));
          await _flushProviderAsync();

          expect(service.listenedWrites, hasLength(1));
          expect(emitted, isEmpty);

          handler.emitPosition(const Duration(seconds: 600));
          await _flushProviderAsync();

          expect(service.listenedWrites, hasLength(1));
          expect(emitted, isEmpty);

          await sub.cancel();
          provider.dispose();
          await handler.dispose();
        },
        (error, _) {
          uncaughtErrors.add(error);
        },
      );

      expect(
        uncaughtErrors,
        contains(
          isA<PostgrestException>().having(
            (error) => error.code,
            'code',
            '42501',
          ),
        ),
      );
    },
  );

  test('near-end and completed state triggers are idempotent', () async {
    final handler = FakePodcastAudioHandler();
    final service = _FakeEpisodeService();
    final provider = PlaybackProvider(handler, episodeService: service)
      ..setUser('user-1');

    await provider.toggle(_episode('episode-1'));
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 599));
    handler.complete();
    await _flushProviderAsync();

    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-1', true),
    ]);

    provider.dispose();
    await handler.dispose();
  });

  test('replaying an episode can mark it listened again', () async {
    final handler = FakePodcastAudioHandler();
    final service = _FakeEpisodeService();
    final provider = PlaybackProvider(handler, episodeService: service)
      ..setUser('user-1');
    final episode = _episode('episode-1');

    await provider.toggle(episode);
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 599));
    await _flushProviderAsync();

    await provider.toggle(episode.copyWith(listened: true));
    handler.emitDuration(const Duration(seconds: 600));
    handler.emitPosition(const Duration(seconds: 599));
    await _flushProviderAsync();

    expect(service.listenedWrites, [
      const _ListenedWrite('user-1', 'episode-1', true),
      const _ListenedWrite('user-1', 'episode-1', true),
    ]);

    provider.dispose();
    await handler.dispose();
  });

  test(
    'position persistence is throttled and flush can write immediately',
    () async {
      final handler = FakePodcastAudioHandler();
      final service = _FakeEpisodeService();
      final provider = PlaybackProvider(handler, episodeService: service)
        ..setUser('user-1');

      await provider.toggle(_episode('episode-1'));

      handler.emitPosition(const Duration(seconds: 3));
      handler.emitPosition(const Duration(seconds: 8));
      handler.emitPosition(const Duration(seconds: 13));
      await Future<void>.delayed(Duration.zero);

      await provider.flushPosition();

      expect(service.positionWrites, [
        const _PositionWrite('user-1', 'episode-1', 3),
        const _PositionWrite('user-1', 'episode-1', 13),
        const _PositionWrite('user-1', 'episode-1', 13),
      ]);

      provider.dispose();
      await handler.dispose();
    },
  );

  test('position updates notify listeners only when the whole second changes',
      () async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);
    var notifications = 0;
    provider.addListener(() => notifications += 1);

    await provider.toggle(_episode('episode-1'));
    notifications = 0;

    handler.emitPosition(const Duration(milliseconds: 100));
    handler.emitPosition(const Duration(milliseconds: 200));
    handler.emitPosition(const Duration(milliseconds: 900));
    handler.emitPosition(const Duration(seconds: 1));

    expect(provider.position, const Duration(seconds: 1));
    expect(notifications, 2);

    provider.dispose();
    await handler.dispose();
  });

  test('unchanged playback state and duration do not notify listeners',
      () async {
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);
    var notifications = 0;
    provider.addListener(() => notifications += 1);

    await provider.toggle(_episode('episode-1'));
    handler.emitDuration(const Duration(seconds: 60));
    notifications = 0;

    await handler.play();
    handler.emitDuration(const Duration(seconds: 60));
    handler.emitDuration(const Duration(seconds: 61));

    expect(provider.isPlaying, isTrue);
    expect(provider.duration, const Duration(seconds: 61));
    expect(notifications, 1);

    provider.dispose();
    await handler.dispose();
  });
}

Future<void> _flushProviderAsync() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

Episode _episode(String id) {
  return Episode(
    id: id,
    title: 'Test episode',
    hlsUrl: 'https://example.com/audio.m3u8',
    createdAt: DateTime(2026),
    listened: false,
  );
}

Episode _episodeWithTracks(String id) {
  return _episode(id).copyWith(
    audioTracks: const [
      AudioTrack(
        languageCode: 'zh-Hant',
        title: '繁中',
        hlsUrl: 'https://example.com/zh.m3u8',
      ),
      AudioTrack(
        languageCode: 'en',
        title: 'EN',
        hlsUrl: 'https://example.com/en.m3u8',
      ),
      AudioTrack(
        languageCode: 'ja',
        title: '日本語',
        hlsUrl: 'https://example.com/ja.m3u8',
      ),
    ],
  );
}

class _FakeEpisodeService extends EpisodeService {
  _FakeEpisodeService({
    this.positionWriteError,
    this.listenedWriteError,
  });

  final Object? positionWriteError;
  final Object? listenedWriteError;
  final List<_PositionWrite> positionWrites = [];
  final List<_ListenedWrite> listenedWrites = [];

  @override
  Future<void> setPosition({
    required String userId,
    required String episodeId,
    required int seconds,
  }) async {
    positionWrites.add(_PositionWrite(userId, episodeId, seconds));
    final err = positionWriteError;
    if (err != null) {
      throw err;
    }
  }

  @override
  Future<void> setListened({
    required String userId,
    required String episodeId,
    required bool listened,
  }) async {
    listenedWrites.add(_ListenedWrite(userId, episodeId, listened));
    final err = listenedWriteError;
    if (err != null) {
      throw err;
    }
  }
}

class _PositionWrite {
  const _PositionWrite(this.userId, this.episodeId, this.seconds);

  final String userId;
  final String episodeId;
  final int seconds;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is _PositionWrite &&
            other.userId == userId &&
            other.episodeId == episodeId &&
            other.seconds == seconds;
  }

  @override
  int get hashCode => Object.hash(userId, episodeId, seconds);

  @override
  String toString() => 'PositionWrite($userId, $episodeId, $seconds)';
}

class _ListenedWrite {
  const _ListenedWrite(this.userId, this.episodeId, this.listened);

  final String userId;
  final String episodeId;
  final bool listened;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is _ListenedWrite &&
            other.userId == userId &&
            other.episodeId == episodeId &&
            other.listened == listened;
  }

  @override
  int get hashCode => Object.hash(userId, episodeId, listened);

  @override
  String toString() => 'ListenedWrite($userId, $episodeId, $listened)';
}
