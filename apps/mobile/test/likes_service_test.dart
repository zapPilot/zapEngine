import 'dart:async';

import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/services/supabase_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  test(
    'streamLikeSnapshot counts likes and marks the current user liked',
    () async {
      final store = _FakeLikesStore();
      final service = LikesService(store: store);

      final snapshots = service.streamLikeSnapshot('user-1');
      final expectation = expectLater(
        snapshots,
        emits(
          isA<LikeSnapshot>().having(
            (snapshot) => snapshot.likedEpisodeIds,
            'likedEpisodeIds',
            {'episode-1'},
          ).having((snapshot) => snapshot.counts, 'counts', {
            'episode-1': 2,
            'episode-2': 1,
          }),
        ),
      );

      store.addRows([
        {'user_id': 'user-1', 'episode_id': 'episode-1'},
        {'user_id': 'user-2', 'episode_id': 'episode-1'},
        {'user_id': 'user-2', 'episode_id': 'episode-2'},
      ]);

      await expectation;
      store.dispose();
    },
  );

  test('toggleLike deletes an existing like', () async {
    final store = _FakeLikesStore();
    final service = LikesService(store: store);

    await service.toggleLike(
      episodeId: 'episode-1',
      userId: 'user-1',
      currentlyLiked: true,
    );

    expect(store.calls, [
      const _StoreCall('delete', userId: 'user-1', episodeId: 'episode-1'),
    ]);
    store.dispose();
  });

  test('toggleLike upserts a missing like idempotently', () async {
    final store = _FakeLikesStore();
    final service = LikesService(store: store);

    await service.toggleLike(
      episodeId: 'episode-1',
      userId: 'user-1',
      currentlyLiked: false,
    );

    expect(store.calls, [
      const _StoreCall('upsert', userId: 'user-1', episodeId: 'episode-1'),
    ]);
    store.dispose();
  });

  group('SupabaseLikesStore - Uninitialized Supabase (Null Client)', () {
    test('streamLikeRows returns empty stream when client is null', () {
      final fakeSupabase = _FakeSupabaseService(null);
      final store = SupabaseLikesStore(fakeSupabase);

      expect(store.streamLikeRows(), emitsInOrder([emitsDone]));
    });

    test('deleteLike completes without crashing when client is null', () async {
      final fakeSupabase = _FakeSupabaseService(null);
      final store = SupabaseLikesStore(fakeSupabase);

      await expectLater(
        store.deleteLike(userId: 'user-1', episodeId: 'episode-1'),
        completes,
      );
    });

    test('upsertLike completes without crashing when client is null', () async {
      final fakeSupabase = _FakeSupabaseService(null);
      final store = SupabaseLikesStore(fakeSupabase);

      await expectLater(
        store.upsertLike(userId: 'user-1', episodeId: 'episode-1'),
        completes,
      );
    });
  });
}

class _FakeSupabaseService extends SupabaseService {
  _FakeSupabaseService(this._client);
  final SupabaseClient? _client;

  @override
  SupabaseClient? get client => _client;
}

class _FakeLikesStore implements LikesStore {
  StreamController<List<Map<String, dynamic>>>? _controller;
  final List<_StoreCall> calls = [];

  void addRows(List<Map<String, dynamic>> rows) => _controller!.add(rows);

  @override
  Stream<List<Map<String, dynamic>>> streamLikeRows() {
    _controller ??= StreamController<List<Map<String, dynamic>>>();
    return _controller!.stream;
  }

  @override
  Future<void> deleteLike({
    required String userId,
    required String episodeId,
  }) async {
    calls.add(_StoreCall('delete', userId: userId, episodeId: episodeId));
  }

  @override
  Future<void> upsertLike({
    required String userId,
    required String episodeId,
  }) async {
    calls.add(_StoreCall('upsert', userId: userId, episodeId: episodeId));
  }

  void dispose() {
    _controller?.close();
  }
}

class _StoreCall {
  const _StoreCall(
    this.operation, {
    required this.userId,
    required this.episodeId,
  });

  final String operation;
  final String userId;
  final String episodeId;

  @override
  bool operator ==(Object other) {
    return other is _StoreCall &&
        other.operation == operation &&
        other.userId == userId &&
        other.episodeId == episodeId;
  }

  @override
  int get hashCode => Object.hash(operation, userId, episodeId);

  @override
  String toString() {
    return '_StoreCall($operation, userId: $userId, episodeId: $episodeId)';
  }
}
