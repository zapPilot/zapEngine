import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    'setSpeed delegates to the handler and tracks speed stream updates',
    () async {
      final handler = FakePodcastAudioHandler();
      final provider = PlaybackProvider(handler);

      await provider.setSpeed(1.5);

      expect(handler.speed, 1.5);
      expect(provider.speed, 1.5);

      provider.dispose();
      await handler.dispose();
    },
  );

  test('setSpeed persists the chosen speed to SharedPreferences', () async {
    SharedPreferences.setMockInitialValues({});
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    await provider.setSpeed(1.75);

    final prefs = await SharedPreferences.getInstance();
    expect(
      prefs.getDouble('playback_speed'),
      1.75,
      reason: 'speed must survive app restarts via local prefs',
    );

    provider.dispose();
    await handler.dispose();
  });

  test('PlaybackProvider restores stored speed on construction', () async {
    SharedPreferences.setMockInitialValues({'playback_speed': 1.25});
    final handler = FakePodcastAudioHandler();
    final provider = PlaybackProvider(handler);

    // _loadSpeed() runs asynchronously from the constructor; let it settle.
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(
      handler.speed,
      1.25,
      reason: 'saved speed must be re-applied to the audio handler at start',
    );
    expect(provider.speed, 1.25);

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
    await provider.setSpeed(1.5);
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
  final List<_PositionWrite> positionWrites = [];
  final List<_ListenedWrite> listenedWrites = [];

  @override
  Future<void> setPosition({
    required String userId,
    required String episodeId,
    required int seconds,
  }) async {
    positionWrites.add(_PositionWrite(userId, episodeId, seconds));
  }

  @override
  Future<void> setListened({
    required String userId,
    required String episodeId,
    required bool listened,
  }) async {
    listenedWrites.add(_ListenedWrite(userId, episodeId, listened));
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
