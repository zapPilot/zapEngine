import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/app_config.dart';
import '../models/episode.dart';
import '../models/episode_page.dart';
import '../models/episode_status.dart';
import '../services/episode_service.dart';
import '../state/auth_provider.dart';
import '../state/content_language_provider.dart';
import '../state/likes_provider.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../widgets/continue_listening_card.dart';
import '../widgets/episode_card.dart';
import '../widgets/error_state_widget.dart';
import '../widgets/listened_section_header.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key, EpisodeService? episodeService})
      : _episodeService = episodeService;

  final EpisodeService? _episodeService;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  late final EpisodeService _episodeService =
      widget._episodeService ?? EpisodeService();
  final ScrollController _scrollController = ScrollController();

  List<Episode> _episodes = const [];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  String? _loadMoreError;
  int _requestEpoch = 0;
  bool _listenedExpanded = false;
  String? _playbackUserId;
  String _languageCode = AppConfig.contentLanguageCode;
  StreamSubscription<String>? _completionSub;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = context.read<AuthProvider>().currentUser;
      if (user != null) {
        context.read<LikesProvider>().watchUser(user.id);
        _bindPlaybackUser(user.id);
      }
      _languageCode = context.read<ContentLanguageProvider?>()?.languageCode ??
          AppConfig.contentLanguageCode;
      _completionSub = context
          .read<PlaybackProvider>()
          .completedEpisodeIds
          .listen(_onEpisodeCompleted);
      unawaited(_loadFirstPage());
    });
  }

  @override
  void dispose() {
    _completionSub?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadFirstPage() async {
    final epoch = ++_requestEpoch;
    setState(() {
      _loading = true;
      _error = null;
      _loadingMore = false;
      _loadMoreError = null;
    });

    try {
      final page = await _loadPage();
      if (!mounted || epoch != _requestEpoch) return;

      setState(() {
        _episodes = page.items;
        _nextCursor = page.nextCursor;
        _loading = false;
      });
      context.read<LikesProvider>().seedEpisodes(page.items);
    } catch (error) {
      if (!mounted || epoch != _requestEpoch) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _nextCursor == null) return;

    final epoch = _requestEpoch;
    setState(() {
      _loadingMore = true;
      _loadMoreError = null;
    });

    try {
      final page = await _loadPage(cursor: _nextCursor);
      if (!mounted || epoch != _requestEpoch) return;

      setState(() {
        _episodes = [..._episodes, ...page.items];
        _nextCursor = page.nextCursor;
        _loadingMore = false;
      });
      context.read<LikesProvider>().seedEpisodes(_episodes);
    } catch (error) {
      if (!mounted || epoch != _requestEpoch) return;
      setState(() {
        _loadingMore = false;
        _loadMoreError = error.toString();
      });
    }
  }

  Future<EpisodePage> _loadPage({String? cursor}) async {
    final page = await _episodeService.getEpisodes(
      limit: 20,
      cursor: cursor,
      languageCode: _languageCode,
    );
    final hydrated = await _applyUserState(page.items);

    return EpisodePage(items: hydrated, nextCursor: page.nextCursor);
  }

  Future<List<Episode>> _applyUserState(List<Episode> episodes) async {
    final user = context.read<AuthProvider>().currentUser;
    if (user == null || episodes.isEmpty) return episodes;

    _bindPlaybackUser(user.id);
    final Map<String, UserEpisodeState> states;
    try {
      states = await _episodeService.getUserState(
        user.id,
        episodeIds: episodes.map((episode) => episode.id),
      );
    } catch (error) {
      debugPrint('Feed user state hydration failed: $error');
      return episodes;
    }

    return episodes.map((episode) {
      final state = states[episode.id];
      if (state == null) return episode;
      return episode.copyWith(
        listened: episode.listened || state.listened,
        lastPositionSeconds: state.lastPositionSeconds,
      );
    }).toList(growable: false);
  }

  void _bindPlaybackUser(String userId) {
    if (_playbackUserId == userId) return;
    _playbackUserId = userId;
    context.read<PlaybackProvider>().setUser(userId);
  }

  void _onEpisodeCompleted(String id) {
    if (!mounted) return;
    setState(() {
      _episodes = [
        for (final episode in _episodes)
          episode.id == id ? episode.copyWith(listened: true) : episode,
      ];
    });
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels > position.maxScrollExtent - 360) {
      unawaited(_loadMore());
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().currentUser;
    final selectedLanguageCode =
        context.watch<ContentLanguageProvider?>()?.languageCode ??
            AppConfig.contentLanguageCode;
    final playback = context.watch<PlaybackProvider>();
    if (selectedLanguageCode != _languageCode) {
      _languageCode = selectedLanguageCode;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          unawaited(_loadFirstPage());
        }
      });
    }
    if (user != null) {
      _bindPlaybackUser(user.id);
    }
    final groups = _groupByStatus(_episodes);
    final heroEpisode = _heroEpisode(groups);

    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.surfaceElevated,
      onRefresh: _loadFirstPage,
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppBar(
            pinned: true,
            title: const Text('From Fed to Chain'),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.surfaceElevated,
                  foregroundColor: AppColors.accent,
                  child: Text(_avatarLabel(user?.email)),
                ),
              ),
            ],
          ),
          if (_loading)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            SliverFillRemaining(
              hasScrollBody: false,
              child:
                  ErrorStateWidget(message: _error!, onRetry: _loadFirstPage),
            )
          else if (_episodes.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptyState(),
            )
          else ...[
            if (heroEpisode != null)
              SliverToBoxAdapter(
                child: ContinueListeningCard(
                  episode: heroEpisode,
                  allCompleted:
                      groups.inProgress.isEmpty && groups.unplayed.isEmpty,
                  isPlaying: playback.isEpisodePlaying(heroEpisode.id),
                  isLoading: playback.loadingEpisodeId == heroEpisode.id,
                  onPlay: () => _handleSmartPlay(heroEpisode),
                ),
              ),
            if (groups.inProgress.isNotEmpty) ...[
              const SliverToBoxAdapter(child: _SectionTitle(title: '進行中')),
              _EpisodeSliverList(
                episodes: groups.inProgress,
                playback: playback,
                onPlay: (episode) => playback.toggle(episode),
              ),
            ],
            if (groups.unplayed.isNotEmpty) ...[
              const SliverToBoxAdapter(child: _SectionTitle(title: '未聽')),
              _EpisodeSliverList(
                episodes: groups.unplayed,
                playback: playback,
                onPlay: (episode) => playback.toggle(episode),
              ),
            ],
            if (groups.completed.isNotEmpty) ...[
              SliverToBoxAdapter(
                child: ListenedSectionHeader(
                  count: groups.completed.length,
                  expanded: _listenedExpanded,
                  onTap: () =>
                      setState(() => _listenedExpanded = !_listenedExpanded),
                ),
              ),
              if (_listenedExpanded)
                _EpisodeSliverList(
                  episodes: groups.completed,
                  playback: playback,
                  onPlay: (episode) => playback.toggle(episode),
                ),
            ],
            SliverToBoxAdapter(
              child: _LoadMoreStatus(
                loading: _loadingMore,
                error: _loadMoreError,
                hasMore: _nextCursor != null,
                onRetry: _loadMore,
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 108)),
          ],
        ],
      ),
    );
  }

  Future<void> _handleSmartPlay(Episode heroEpisode) async {
    final playback = context.read<PlaybackProvider>();
    final shouldResume = playback.currentEpisode?.id == heroEpisode.id &&
        heroEpisode.status == EpisodeStatus.inProgress;
    if (shouldResume) {
      if (playback.isPlaying) {
        await playback.pause();
      } else {
        await playback.resume();
      }
      return;
    }

    await playback.playSmart(_episodes);
  }

  _EpisodeGroups _groupByStatus(List<Episode> episodes) {
    final inProgress = <Episode>[];
    final unplayed = <Episode>[];
    final completed = <Episode>[];

    for (final episode in episodes) {
      switch (episode.status) {
        case EpisodeStatus.inProgress:
          inProgress.add(episode);
        case EpisodeStatus.unplayed:
          unplayed.add(episode);
        case EpisodeStatus.completed:
          completed.add(episode);
      }
    }

    return _EpisodeGroups(
      inProgress: inProgress,
      unplayed: unplayed,
      completed: completed,
    );
  }

  Episode? _heroEpisode(_EpisodeGroups groups) {
    if (groups.inProgress.isNotEmpty) return groups.inProgress.first;
    if (groups.unplayed.isNotEmpty) return groups.unplayed.last;
    if (_episodes.isNotEmpty) return _episodes.last;
    return null;
  }

  static String _avatarLabel(String? email) {
    final value = email?.trim();
    if (value == null || value.isEmpty) return 'F';
    return value.characters.first.toUpperCase();
  }
}

class _EpisodeGroups {
  const _EpisodeGroups({
    required this.inProgress,
    required this.unplayed,
    required this.completed,
  });

  final List<Episode> inProgress;
  final List<Episode> unplayed;
  final List<Episode> completed;
}

class _EpisodeSliverList extends StatelessWidget {
  const _EpisodeSliverList({
    required this.episodes,
    required this.playback,
    required this.onPlay,
  });

  final List<Episode> episodes;
  final PlaybackProvider playback;
  final ValueChanged<Episode> onPlay;

  @override
  Widget build(BuildContext context) {
    return SliverList.builder(
      itemCount: episodes.length,
      itemBuilder: (context, index) {
        final episode = episodes[index];
        return EpisodeCard(
          episode: episode,
          isPlaying: playback.isEpisodePlaying(episode.id),
          isLoading: playback.loadingEpisodeId == episode.id,
          onPlay: () => onPlay(episode),
        );
      },
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(
        children: [
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontSize: 18),
          ),
          const SizedBox(width: 12),
          const Expanded(child: Divider()),
        ],
      ),
    );
  }
}

class _LoadMoreStatus extends StatelessWidget {
  const _LoadMoreStatus({
    required this.loading,
    required this.error,
    required this.hasMore,
    required this.onRetry,
  });

  final bool loading;
  final String? error;
  final bool hasMore;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (error != null) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Retry'),
        ),
      );
    }

    return SizedBox(height: hasMore ? 24 : 12);
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        'No episodes yet.',
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: AppColors.textSecondary),
      ),
    );
  }
}
