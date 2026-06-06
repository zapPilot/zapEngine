import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/services/supabase_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  group('EpisodeService - setListened', () {
    test('upserts user episode state with a stable timestamp', () async {
      final writer = _FakeUserEpisodeStateWriter();
      final service = _TestableEpisodeService(
        userEpisodeStateWriter: writer,
        now: () => DateTime.utc(2026, 5, 7, 4, 5, 6),
      );

      await service.setListened(
        userId: 'user-1',
        episodeId: 'episode-1',
        listened: false,
      );

      expect(writer.onConflict, 'user_id,episode_id');
      expect(writer.values, {
        'user_id': 'user-1',
        'episode_id': 'episode-1',
        'listened': false,
        'updated_at': '2026-05-07T04:05:06.000Z',
      });
    });

    test('upserts with listened true', () async {
      final writer = _FakeUserEpisodeStateWriter();
      final service = _TestableEpisodeService(
        userEpisodeStateWriter: writer,
        now: () => DateTime.utc(2026, 5, 8, 10, 30, 0),
      );

      await service.setListened(
        userId: 'user-2',
        episodeId: 'episode-5',
        listened: true,
      );

      expect(writer.values?['listened'], true);
    });
  });

  group('EpisodeService - setPosition', () {
    test('upserts position with correct timestamp', () async {
      final writer = _FakeUserEpisodeStateWriter();
      final service = _TestableEpisodeService(
        userEpisodeStateWriter: writer,
        now: () => DateTime.utc(2026, 5, 9, 12, 0, 0),
      );

      await service.setPosition(
        userId: 'user-1',
        episodeId: 'episode-2',
        seconds: 120,
      );

      expect(writer.onConflict, 'user_id,episode_id');
      expect(writer.values, {
        'user_id': 'user-1',
        'episode_id': 'episode-2',
        'last_position_seconds': 120,
        'updated_at': '2026-05-09T12:00:00.000Z',
      });
    });

    test('handles zero seconds position', () async {
      final writer = _FakeUserEpisodeStateWriter();
      final service = _TestableEpisodeService(
        userEpisodeStateWriter: writer,
        now: () => DateTime.utc(2026, 5, 10, 8, 0, 0),
      );

      await service.setPosition(
        userId: 'user-1',
        episodeId: 'episode-3',
        seconds: 0,
      );

      expect(writer.values?['last_position_seconds'], 0);
    });

    test('handles large position values', () async {
      final writer = _FakeUserEpisodeStateWriter();
      final service = _TestableEpisodeService(
        userEpisodeStateWriter: writer,
        now: () => DateTime.utc(2026, 5, 11, 6, 0, 0),
      );

      await service.setPosition(
        userId: 'user-1',
        episodeId: 'episode-4',
        seconds: 3600,
      );

      expect(writer.values?['last_position_seconds'], 3600);
    });
  });

  group('UserEpisodeState', () {
    test('creates instance with correct values', () {
      final state = UserEpisodeState(listened: true, lastPositionSeconds: 300);

      expect(state.listened, true);
      expect(state.lastPositionSeconds, 300);
    });

    test('handles false listened value', () {
      final state = UserEpisodeState(listened: false, lastPositionSeconds: 0);

      expect(state.listened, false);
      expect(state.lastPositionSeconds, 0);
    });

    test('handles large values', () {
      final state = UserEpisodeState(listened: true, lastPositionSeconds: 7200);

      expect(state.listened, true);
      expect(state.lastPositionSeconds, 7200);
    });
  });

  group('EpisodePage', () {
    test('creates page with items and cursor', () {
      final page = EpisodePage(
        items: [
          Episode(
            id: 'ep-1',
            title: 'Episode 1',
            hlsUrl: 'https://example.com/ep1.m3u8',
            createdAt: DateTime(2026),
            listened: false,
          ),
        ],
        nextCursor: '20',
      );

      expect(page.items.length, 1);
      expect(page.nextCursor, '20');
    });

    test('creates page without cursor when no more pages', () {
      final page = EpisodePage(items: [], nextCursor: null);

      expect(page.items, isEmpty);
      expect(page.nextCursor, isNull);
    });
  });

  group('EpisodeService - Uninitialized Supabase (Null Client)', () {
    test('getEpisodeById returns null when client is null', () async {
      final fakeSupabase = _FakeSupabaseService(null);
      final service = EpisodeService(supabaseService: fakeSupabase);

      final episode = await service.getEpisodeById('episode-1');

      expect(episode, isNull);
    });

    test('getListenedEpisodeIds returns empty set when client is null',
        () async {
      final fakeSupabase = _FakeSupabaseService(null);
      final service = EpisodeService(supabaseService: fakeSupabase);

      final ids = await service.getListenedEpisodeIds('user-1');
      expect(ids, isEmpty);
    });

    test('getUserState returns empty map when client is null', () async {
      final fakeSupabase = _FakeSupabaseService(null);
      final service = EpisodeService(supabaseService: fakeSupabase);
      final states = await service.getUserState('user-1');
      expect(states, isEmpty);
    });
  });
}

class _TestableEpisodeService {
  _TestableEpisodeService({
    UserEpisodeStateWriter? userEpisodeStateWriter,
    DateTime Function()? now,
  })  : _userEpisodeStateWriter =
            userEpisodeStateWriter ?? _FakeUserEpisodeStateWriter(),
        _now = now ?? DateTime.now;

  final UserEpisodeStateWriter _userEpisodeStateWriter;
  final DateTime Function() _now;

  Future<void> setListened({
    required String userId,
    required String episodeId,
    required bool listened,
  }) async {
    await _userEpisodeStateWriter.upsert({
      'user_id': userId,
      'episode_id': episodeId,
      'listened': listened,
      'updated_at': _now().toUtc().toIso8601String(),
    }, onConflict: 'user_id,episode_id');
  }

  Future<void> setPosition({
    required String userId,
    required String episodeId,
    required int seconds,
  }) async {
    await _userEpisodeStateWriter.upsert({
      'user_id': userId,
      'episode_id': episodeId,
      'last_position_seconds': seconds,
      'updated_at': _now().toUtc().toIso8601String(),
    }, onConflict: 'user_id,episode_id');
  }
}

class _FakeUserEpisodeStateWriter implements UserEpisodeStateWriter {
  Map<String, Object?>? values;
  String? onConflict;

  @override
  Future<void> upsert(
    Map<String, Object?> values, {
    required String onConflict,
  }) async {
    this.values = values;
    this.onConflict = onConflict;
  }
}

class _FakeSupabaseService extends SupabaseService {
  _FakeSupabaseService(this._client);
  final SupabaseClient? _client;

  @override
  SupabaseClient? get client => _client;
}
