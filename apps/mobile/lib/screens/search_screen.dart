import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../config/app_config.dart';
import '../models/episode_search_result.dart';
import '../services/episode_service.dart';
import '../state/auth_provider.dart';
import '../state/content_language_provider.dart';
import '../state/episode_search_controller.dart';
import '../state/likes_provider.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../widgets/centered_state_message.dart';
import '../widgets/episode_card.dart';
import '../widgets/episode_sliver_list.dart';
import '../widgets/error_state_widget.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({
    super.key,
    EpisodeService? episodeService,
    EpisodeSearchController? controller,
  })  : _episodeService = episodeService,
        _controller = controller;

  final EpisodeService? _episodeService;
  final EpisodeSearchController? _controller;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  late final EpisodeSearchController _controller = widget._controller ??
      EpisodeSearchController(
        episodeService: widget._episodeService ?? EpisodeService(),
      );
  late final bool _ownsController = widget._controller == null;
  final TextEditingController _textController = TextEditingController();

  List<EpisodeSearchResult>? _seededResults;
  String? _playbackUserId;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_seedLikes);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final user = context.watch<AuthProvider>().currentUser;
    if (user != null) {
      context.read<LikesProvider>().watchUser(user.id);
      _bindPlaybackUser(user.id);
    }

    final languageCode =
        context.watch<ContentLanguageProvider?>()?.languageCode ??
            AppConfig.contentLanguageCode;
    _controller.syncContext(
      languageCode: languageCode,
      userId: user?.id,
    );
  }

  @override
  void dispose() {
    _controller.removeListener(_seedLikes);
    if (_ownsController) {
      _controller.dispose();
    }
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<EpisodeSearchController>.value(
      value: _controller,
      child: _SearchScreenContent(
        textController: _textController,
        onClear: _clearQuery,
      ),
    );
  }

  void _clearQuery() {
    _textController.clear();
    _controller.clear();
  }

  void _bindPlaybackUser(String userId) {
    if (_playbackUserId == userId) return;
    _playbackUserId = userId;
    context.read<PlaybackProvider>().setUser(userId);
  }

  void _seedLikes() {
    if (!mounted) return;
    final results = _controller.results;
    if (identical(_seededResults, results)) return;
    _seededResults = results;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !identical(_seededResults, results)) return;
      context.read<LikesProvider>().seedEpisodes(
            results.map((result) => result.episode).toList(growable: false),
          );
    });
  }
}

class _SearchScreenContent extends StatelessWidget {
  const _SearchScreenContent({
    required this.textController,
    required this.onClear,
  });

  final TextEditingController textController;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<EpisodeSearchController>();
    final playback = context.watch<PlaybackProvider>();

    return Material(
      color: AppColors.background,
      child: CustomScrollView(
        slivers: [
          const SliverAppBar(pinned: true, title: Text('搜尋')),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: TextField(
                controller: textController,
                textInputAction: TextInputAction.search,
                onChanged: controller.updateQuery,
                onSubmitted: (_) => unawaited(controller.retry()),
                decoration: InputDecoration(
                  hintText: '搜尋標題或內容',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: controller.query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: '清除搜尋',
                          onPressed: onClear,
                          icon: const Icon(Icons.close_rounded),
                        ),
                ),
              ),
            ),
          ),
          if (controller.loading && controller.results.isNotEmpty)
            const SliverToBoxAdapter(
              child: LinearProgressIndicator(minHeight: 2),
            ),
          ..._resultSlivers(controller, playback),
        ],
      ),
    );
  }

  List<Widget> _resultSlivers(
    EpisodeSearchController controller,
    PlaybackProvider playback,
  ) {
    if (!controller.hasValidQuery) {
      return const [
        SliverFillRemaining(
          hasScrollBody: false,
          child: CenteredStateMessage(
            title: '搜尋節目內容',
            message: '輸入至少兩個字，找出標題或逐字稿中的相關集數。',
            icon: Icons.manage_search_rounded,
          ),
        ),
      ];
    }

    if (controller.loading && controller.results.isEmpty) {
      return const [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
    }

    if (controller.error != null) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: ErrorStateWidget(
              message: controller.error!,
              onRetry: () => unawaited(controller.retry()),
            ),
          ),
        ),
      ];
    }

    if (controller.results.isEmpty) {
      return const [
        SliverFillRemaining(
          hasScrollBody: false,
          child: CenteredStateMessage(
            title: '找不到相關集數',
            message: '換個關鍵字試試。',
            icon: Icons.search_off_rounded,
          ),
        ),
      ];
    }

    final queueEpisodes = controller.results
        .map((result) => result.episode)
        .toList(growable: false);

    return [
      SliverList.builder(
        itemCount: controller.results.length,
        itemBuilder: (context, index) {
          final result = controller.results[index];
          final episode = result.episode;
          return EpisodeCard(
            episode: episode,
            isPlaying: playback.isEpisodePlaying(episode.id),
            isLoading: playback.loadingEpisodeId == episode.id,
            onPlay: () => unawaited(
              playback.playFromQueue(episodes: queueEpisodes, episode: episode),
            ),
            supportingContent: _SearchMatchSummary(result: result),
            queueEpisodes: queueEpisodes,
          );
        },
      ),
      const EpisodeListBottomSpacer(),
    ];
  }
}

class _SearchMatchSummary extends StatelessWidget {
  const _SearchMatchSummary({required this.result});

  final EpisodeSearchResult result;

  @override
  Widget build(BuildContext context) {
    final snippet = result.snippet?.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.accent.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(ZapTokens.radiusControl),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Text(
              result.matchSource == EpisodeSearchMatchSource.title
                  ? '標題'
                  : '內容',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.accent,
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
        ),
        if (snippet != null && snippet.isNotEmpty) ...[
          const SizedBox(height: 7),
          Text(
            snippet,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(height: 1.4),
          ),
        ],
      ],
    );
  }
}
