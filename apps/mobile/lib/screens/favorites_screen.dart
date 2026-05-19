import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../models/episode_page.dart';
import '../services/episode_service.dart';
import '../state/auth_provider.dart';
import '../state/content_language_provider.dart';
import '../state/likes_provider.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../utils/episode_screen_state.dart';
import '../widgets/centered_state_message.dart';
import '../widgets/episode_collection_slivers.dart';
import '../widgets/episode_sliver_list.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key, EpisodeService? episodeService})
      : _episodeService = episodeService;

  final EpisodeService? _episodeService;

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen>
    with EpisodeScreenState<FavoritesScreen> {
  late final EpisodeService _episodeService =
      widget._episodeService ?? EpisodeService();

  List<Episode> _episodes = const [];
  bool _loading = true;
  String? _error;
  int _requestEpoch = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    if (syncEpisodeDependencies()) {
      unawaited(_loadFavoritesSource());
    }
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
      if (_didRequestExpire(epoch)) return;
      _showFavoriteEpisodes(hydrated);
    } catch (error) {
      if (_didRequestExpire(epoch)) return;
      _showFavoritesError(error);
    }
  }

  bool _didRequestExpire(int epoch) {
    return !mounted || epoch != _requestEpoch;
  }

  void _showFavoriteEpisodes(List<Episode> episodes) {
    setState(() {
      _episodes = episodes;
      _loading = false;
    });
    context.read<LikesProvider>().seedEpisodes(episodes);
  }

  void _showFavoritesError(Object error) {
    setState(() {
      _error = error.toString();
      _loading = false;
    });
  }

  Future<List<Episode>> _loadAllEpisodes() async {
    final episodes = <Episode>[];
    const maxPages = 20; // ~1000 episodes hard ceiling.
    var pages = 0;
    String? cursor;

    do {
      final EpisodePage page = await _episodeService.getEpisodes(
        limit: 50,
        cursor: cursor,
        languageCode: contentLanguageCode,
      );
      episodes.addAll(page.items);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor != null && pages < maxPages);

    episodes.sort((left, right) {
      final dateOrder = right.createdAt.compareTo(left.createdAt);
      if (dateOrder != 0) return dateOrder;
      return right.id.compareTo(left.id);
    });

    return episodes;
  }

  Future<List<Episode>> _applyUserState(List<Episode> episodes) async {
    return hydrateEpisodesForCurrentUser(_episodeService, episodes);
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ContentLanguageProvider?>();
    final likes = context.watch<LikesProvider>();
    final playback = context.watch<PlaybackProvider>();

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
          ...buildEpisodeCollectionSlivers(
            loading: _loading,
            error: _error,
            empty: favorites.isEmpty,
            emptyState: const _EmptyFavoritesState(),
            onRetry: _loadFavoritesSource,
            contentSlivers: [
              EpisodeSliverList(
                episodes: favorites,
                playback: playback,
                onPlay: (episode) => playback.toggle(episode),
                onDelete: _removeFavorite,
                deleteLabel: '從收藏移除',
                wrapper: _wrapFavoriteCard,
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 108)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _wrapFavoriteCard(
    BuildContext context,
    Episode episode,
    Widget child,
  ) {
    return Dismissible(
      key: ValueKey('favorite-${episode.id}'),
      direction: DismissDirection.endToStart,
      background: const _DismissBackground(),
      onDismissed: (_) => _removeFavorite(episode),
      child: child,
    );
  }

  void _removeFavorite(Episode episode) {
    final currentUser = context.read<AuthProvider>().currentUser;
    if (currentUser == null) return;
    unawaited(context.read<LikesProvider>().toggle(episode, currentUser.id));
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
    return const CenteredStateMessage(
      title: '還沒有收藏的集數',
      message: '點選書籤後，集數會出現在這裡。',
      icon: Icons.bookmark_border_rounded,
    );
  }
}
