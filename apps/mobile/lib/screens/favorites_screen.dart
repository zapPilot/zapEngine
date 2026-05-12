import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../models/episode_page.dart';
import '../services/episode_service.dart';
import '../state/auth_provider.dart';
import '../state/likes_provider.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../widgets/episode_card.dart';
import '../widgets/error_state_widget.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key, EpisodeService? episodeService})
      : _episodeService = episodeService;

  final EpisodeService? _episodeService;

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  late final EpisodeService _episodeService =
      widget._episodeService ?? EpisodeService();

  List<Episode> _episodes = const [];
  bool _loading = true;
  String? _error;
  int _requestEpoch = 0;
  String? _playbackUserId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = context.read<AuthProvider>().currentUser;
      if (user != null) {
        context.read<LikesProvider>().watchUser(user.id);
        _bindPlaybackUser(user.id);
      }
      unawaited(_loadFavoritesSource());
    });
  }

  Future<void> _loadFavoritesSource() async {
    final epoch = ++_requestEpoch;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final episodes = await _loadAllEpisodes();
      final hydrated = await _applyUserState(episodes);
      if (!mounted || epoch != _requestEpoch) return;

      setState(() {
        _episodes = hydrated;
        _loading = false;
      });
      context.read<LikesProvider>().seedEpisodes(hydrated);
    } catch (error) {
      if (!mounted || epoch != _requestEpoch) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<List<Episode>> _loadAllEpisodes() async {
    final episodes = <Episode>[];
    String? cursor;

    do {
      final EpisodePage page = await _episodeService.getEpisodes(
        limit: 50,
        cursor: cursor,
      );
      episodes.addAll(page.items);
      cursor = page.nextCursor;
    } while (cursor != null);

    episodes.sort((left, right) {
      final dateOrder = right.createdAt.compareTo(left.createdAt);
      if (dateOrder != 0) return dateOrder;
      return right.id.compareTo(left.id);
    });

    return episodes;
  }

  Future<List<Episode>> _applyUserState(List<Episode> episodes) async {
    final user = context.read<AuthProvider>().currentUser;
    if (user == null || episodes.isEmpty) return episodes;

    _bindPlaybackUser(user.id);
    try {
      final states = await _episodeService.getUserState(
        user.id,
        episodeIds: episodes.map((episode) => episode.id),
      );

      return episodes.map((episode) {
        final state = states[episode.id];
        if (state == null) return episode;
        return episode.copyWith(
          listened: episode.listened || state.listened,
          lastPositionSeconds: state.lastPositionSeconds,
        );
      }).toList(growable: false);
    } catch (error) {
      debugPrint('Favorites user state hydration failed: $error');
      return episodes;
    }
  }

  void _bindPlaybackUser(String userId) {
    if (_playbackUserId == userId) return;
    _playbackUserId = userId;
    context.read<PlaybackProvider>().setUser(userId);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().currentUser;
    final likes = context.watch<LikesProvider>();
    final playback = context.watch<PlaybackProvider>();
    if (user != null) {
      _bindPlaybackUser(user.id);
    }

    final likedEpisodeIds = likes.likedEpisodeIds;
    final favorites = _episodes
        .where((episode) => likedEpisodeIds.contains(episode.id))
        .toList(growable: false);

    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.surfaceElevated,
      onRefresh: _loadFavoritesSource,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          const SliverAppBar(
            pinned: true,
            title: Text('收藏'),
          ),
          if (_loading)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            SliverFillRemaining(
              hasScrollBody: false,
              child: ErrorStateWidget(
                message: _error!,
                onRetry: _loadFavoritesSource,
              ),
            )
          else if (favorites.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptyFavoritesState(),
            )
          else ...[
            SliverList.builder(
              itemCount: favorites.length,
              itemBuilder: (context, index) {
                final episode = favorites[index];
                return Dismissible(
                  key: ValueKey('favorite-${episode.id}'),
                  direction: DismissDirection.endToStart,
                  background: const _DismissBackground(),
                  onDismissed: (_) {
                    final currentUser =
                        context.read<AuthProvider>().currentUser;
                    if (currentUser == null) return;
                    unawaited(
                      context.read<LikesProvider>().toggle(
                            episode,
                            currentUser.id,
                          ),
                    );
                  },
                  child: EpisodeCard(
                    episode: episode,
                    isPlaying: playback.isEpisodePlaying(episode.id),
                    isLoading: playback.loadingEpisodeId == episode.id,
                    onPlay: () => playback.toggle(episode),
                    onDelete: () {
                      final currentUser =
                          context.read<AuthProvider>().currentUser;
                      if (currentUser == null) return;
                      unawaited(
                        context.read<LikesProvider>().toggle(
                              episode,
                              currentUser.id,
                            ),
                      );
                    },
                    deleteLabel: '從收藏移除',
                  ),
                );
              },
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 108)),
          ],
        ],
      ),
    );
  }
}

class _DismissBackground extends StatelessWidget {
  const _DismissBackground();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.redAccent.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: EdgeInsets.only(right: 20),
            child: Icon(
              Icons.delete_outline_rounded,
              color: Colors.redAccent,
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyFavoritesState extends StatelessWidget {
  const _EmptyFavoritesState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.bookmark_border_rounded,
              color: AppColors.accent,
              size: 42,
            ),
            const SizedBox(height: 16),
            Text(
              '還沒有收藏的集數',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '點選書籤後，集數會出現在這裡。',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
