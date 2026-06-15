import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/app_config.dart';
import '../models/episode.dart';
import '../models/episode_status.dart';
import '../services/episode_service.dart';
import '../state/auth_provider.dart';
import '../state/content_language_provider.dart';
import '../state/feed_pagination_controller.dart';
import '../state/likes_provider.dart';
import '../state/playback_provider.dart';
import '../widgets/feed/feed_screen_content.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({
    super.key,
    EpisodeService? episodeService,
    FeedPaginationController? controller,
  }) : _episodeService = episodeService,
       _controller = controller;

  final EpisodeService? _episodeService;
  final FeedPaginationController? _controller;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  late final FeedPaginationController _controller =
      widget._controller ??
      FeedPaginationController(
        episodeService: widget._episodeService ?? EpisodeService(),
      );
  late final bool _ownsController = widget._controller == null;
  final ScrollController _scrollController = ScrollController();

  bool _listenedExpanded = false;
  String? _playbackUserId;
  List<Episode>? _seededEpisodes;
  StreamSubscription<String>? _completionSub;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _controller.addListener(_seedLikes);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _setupPlaybackListener();

    final userId = _setupUserState();
    _reloadIfNeeded(userId);
  }

  void _setupPlaybackListener() {
    _completionSub ??= context
        .read<PlaybackProvider>()
        .completedEpisodeIds
        .listen(_controller.onEpisodeCompleted);
  }

  /// Subscribes likes/playback to the signed-in user and returns their id.
  String? _setupUserState() {
    final user = context.watch<AuthProvider>().currentUser;
    if (user != null) {
      context.read<LikesProvider>().watchUser(user.id);
      _bindPlaybackUser(user.id);
    }
    return user?.id;
  }

  void _reloadIfNeeded(String? userId) {
    final languageCode =
        context.watch<ContentLanguageProvider?>()?.languageCode ??
        AppConfig.contentLanguageCode;

    if (_controller.needsReload(languageCode: languageCode, userId: userId)) {
      unawaited(
        _controller.loadFirstPage(languageCode: languageCode, userId: userId),
      );
    }
  }

  @override
  void dispose() {
    _completionSub?.cancel();
    _controller.removeListener(_seedLikes);
    if (_ownsController) {
      _controller.dispose();
    }
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadFirstPage() async {
    final user = context.read<AuthProvider>().currentUser;
    return _controller.loadFirstPage(
      languageCode: _currentLanguageCode(),
      userId: user?.id,
    );
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels > position.maxScrollExtent - 360) {
      unawaited(_controller.loadMore());
    }
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<FeedPaginationController>.value(
      value: _controller,
      child: FeedScreenContent(
        scrollController: _scrollController,
        listenedExpanded: _listenedExpanded,
        onToggleListenedExpanded: () =>
            setState(() => _listenedExpanded = !_listenedExpanded),
        onRefresh: _loadFirstPage,
        onLoadMore: () => unawaited(_controller.loadMore()),
        onSmartPlay: (episode) => unawaited(_handleSmartPlay(episode)),
      ),
    );
  }

  Future<void> _handleSmartPlay(Episode heroEpisode) async {
    final playback = context.read<PlaybackProvider>();
    final shouldResume =
        playback.currentEpisode?.id == heroEpisode.id &&
        heroEpisode.status == EpisodeStatus.inProgress;
    if (shouldResume) {
      if (playback.isPlaying) {
        await playback.pause();
      } else {
        await playback.resume();
      }
      return;
    }

    await playback.playSmart(_controller.episodes);
  }

  void _bindPlaybackUser(String userId) {
    if (_playbackUserId == userId) return;
    _playbackUserId = userId;
    context.read<PlaybackProvider>().setUser(userId);
  }

  String _currentLanguageCode() {
    return context.read<ContentLanguageProvider?>()?.languageCode ??
        AppConfig.contentLanguageCode;
  }

  void _seedLikes() {
    if (!mounted) return;
    final episodes = _controller.episodes;
    if (identical(_seededEpisodes, episodes)) return;
    _seededEpisodes = episodes;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !identical(_seededEpisodes, episodes)) return;
      context.read<LikesProvider>().seedEpisodes(episodes);
    });
  }
}
