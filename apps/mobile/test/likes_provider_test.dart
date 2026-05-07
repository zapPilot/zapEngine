import 'dart:async';

import 'package:ai_podcast_mobile/services/likes_service.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'watchUser stores stream errors instead of letting them escape',
    () async {
      final service = _FakeLikesService();
      final provider = LikesProvider(likesService: service);
      final error = StateError('realtime failed');

      provider.watchUser('user-1');
      service.addError(error);
      await Future<void>.delayed(Duration.zero);

      expect(provider.streamError, error);

      provider.dispose();
      service.dispose();
    },
  );
}

class _FakeLikesService extends LikesService {
  _FakeLikesService() : super(store: _NoopLikesStore());

  final _controller = StreamController<LikeSnapshot>();

  @override
  Stream<LikeSnapshot> streamLikeSnapshot(String userId) => _controller.stream;

  void addError(Object error) => _controller.addError(error);

  void dispose() {
    _controller.close();
  }
}

class _NoopLikesStore implements LikesStore {
  @override
  Stream<List<Map<String, dynamic>>> streamLikeRows() => const Stream.empty();

  @override
  Future<void> deleteLike({
    required String userId,
    required String episodeId,
  }) async {}

  @override
  Future<void> upsertLike({
    required String userId,
    required String episodeId,
  }) async {}
}
