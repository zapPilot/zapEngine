import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'setListened upserts user episode state with a stable timestamp',
    () async {
      final writer = _FakeUserEpisodeStateWriter();
      final service = EpisodeService(
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
    },
  );
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
