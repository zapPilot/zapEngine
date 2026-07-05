import 'supabase_service.dart';

class LikeSnapshot {
  const LikeSnapshot({required this.likedEpisodeIds, required this.counts});

  final Set<String> likedEpisodeIds;
  final Map<String, int> counts;
}

class LikesService {
  LikesService({SupabaseService? supabaseService, LikesStore? store})
      : _store =
            store ?? SupabaseLikesStore(supabaseService ?? SupabaseService());

  final LikesStore _store;

  Stream<LikeSnapshot> streamLikeSnapshot(String userId) {
    return _store.streamLikeRows().map((rows) {
      final liked = <String>{};
      final counts = <String, int>{};

      for (final row in rows) {
        final episodeId = row['episode_id'] as String;
        counts[episodeId] = (counts[episodeId] ?? 0) + 1;
        if (row['user_id'] == userId) {
          liked.add(episodeId);
        }
      }

      return LikeSnapshot(likedEpisodeIds: liked, counts: counts);
    });
  }

  Stream<Set<String>> streamLikedEpisodeIds(String userId) {
    return streamLikeSnapshot(
      userId,
    ).map((snapshot) => snapshot.likedEpisodeIds);
  }

  Future<void> toggleLike({
    required String episodeId,
    required String userId,
    required bool currentlyLiked,
  }) async {
    if (currentlyLiked) {
      await _store.deleteLike(userId: userId, episodeId: episodeId);
      return;
    }

    await _store.upsertLike(userId: userId, episodeId: episodeId);
  }
}

abstract interface class LikesStore {
  Stream<List<Map<String, dynamic>>> streamLikeRows();

  Future<void> deleteLike({required String userId, required String episodeId});

  Future<void> upsertLike({required String userId, required String episodeId});
}

class SupabaseLikesStore implements LikesStore {
  const SupabaseLikesStore(this._supabaseService);

  final SupabaseService _supabaseService;

  @override
  Stream<List<Map<String, dynamic>>> streamLikeRows() {
    final client = _supabaseService.client;
    if (client == null) return const Stream.empty();
    return client.from('likes').stream(primaryKey: ['user_id', 'episode_id']);
  }

  @override
  Future<void> deleteLike({
    required String userId,
    required String episodeId,
  }) async {
    final client = _supabaseService.client;
    if (client == null) return;
    await client
        .from('likes')
        .delete()
        .eq('user_id', userId)
        .eq('episode_id', episodeId);
  }

  @override
  Future<void> upsertLike({
    required String userId,
    required String episodeId,
  }) async {
    final client = _supabaseService.client;
    if (client == null) return;
    await client.from('likes').upsert({
      'user_id': userId,
      'episode_id': episodeId,
    }, onConflict: 'user_id,episode_id');
  }
}
