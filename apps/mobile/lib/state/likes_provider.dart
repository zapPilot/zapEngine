import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/episode.dart';
import '../services/likes_service.dart';

@immutable
class EpisodeLikeState {
  const EpisodeLikeState({required this.liked, required this.count});

  final bool liked;
  final int count;

  EpisodeLikeState copyWith({bool? liked, int? count}) {
    return EpisodeLikeState(
      liked: liked ?? this.liked,
      count: count ?? this.count,
    );
  }
}

class LikesProvider extends ChangeNotifier {
  LikesProvider({LikesService? likesService})
      : _likesService = likesService ?? LikesService();

  final LikesService _likesService;
  final Map<String, EpisodeLikeState> _states = {};
  StreamSubscription<LikeSnapshot>? _subscription;
  String? _watchedUserId;
  Object? _streamError;

  Object? get streamError => _streamError;

  Set<String> get likedEpisodeIds {
    return {
      for (final entry in _states.entries)
        if (entry.value.liked) entry.key,
    };
  }

  EpisodeLikeState stateFor(Episode episode) {
    return _states[episode.id] ??
        EpisodeLikeState(liked: false, count: episode.likeCount);
  }

  void seedEpisodes(List<Episode> episodes) {
    for (final episode in episodes) {
      final previous = _states[episode.id];
      _states[episode.id] = EpisodeLikeState(
        liked: previous?.liked ?? false,
        count: previous?.count ?? episode.likeCount,
      );
    }
    notifyListeners();
  }

  void watchUser(String userId) {
    if (_watchedUserId == userId) return;

    _watchedUserId = userId;
    _subscription?.cancel();
    _streamError = null;
    _subscription = _likesService.streamLikeSnapshot(userId).listen(
      (snapshot) {
        final episodeIds = {
          ..._states.keys,
          ...snapshot.counts.keys,
          ...snapshot.likedEpisodeIds,
        };

        for (final episodeId in episodeIds) {
          _states[episodeId] = EpisodeLikeState(
            liked: snapshot.likedEpisodeIds.contains(episodeId),
            count: snapshot.counts[episodeId] ?? 0,
          );
        }

        _streamError = null;
        notifyListeners();
      },
      onError: (Object error) {
        _streamError = error;
        notifyListeners();
      },
    );
  }

  Future<void> toggle(Episode episode, String userId) async {
    final current = stateFor(episode);
    final optimisticCount = current.liked
        ? (current.count - 1).clamp(0, 1 << 31).toInt()
        : current.count + 1;

    _states[episode.id] = current.copyWith(
      liked: !current.liked,
      count: optimisticCount,
    );
    notifyListeners();

    try {
      await _likesService.toggleLike(
        episodeId: episode.id,
        userId: userId,
        currentlyLiked: current.liked,
      );
    } catch (_) {
      _states[episode.id] = current;
      notifyListeners();
      rethrow;
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
