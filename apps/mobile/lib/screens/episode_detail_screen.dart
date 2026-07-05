import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/episode.dart';
import '../services/episode_service.dart';
import '../state/content_language_provider.dart';
import '../theme/colors.dart';
import '../utils/snackbar.dart';
import '../widgets/episode_detail/episode_detail_app_bar.dart';
import '../widgets/episode_detail/episode_detail_metadata_section.dart';
import '../widgets/episode_detail/episode_detail_playback_controls.dart';
import '../widgets/episode_detail/episode_detail_transcript_section.dart';

const _languageUnavailableMessage = '此集數尚未提供所選語言版本。';

class EpisodeDetailScreen extends StatefulWidget {
  const EpisodeDetailScreen({
    super.key,
    required this.episode,
    this.queueEpisodes,
    EpisodeService? episodeService,
  }) : _episodeService = episodeService;

  final Episode episode;
  final List<Episode>? queueEpisodes;
  final EpisodeService? _episodeService;

  @override
  State<EpisodeDetailScreen> createState() => _EpisodeDetailScreenState();
}

class _EpisodeDetailScreenState extends State<EpisodeDetailScreen> {
  late Episode _episode = widget.episode;
  late final EpisodeService _episodeService =
      widget._episodeService ?? EpisodeService();
  final ScrollController _scrollController = ScrollController();
  bool _showAppBarBackground = false;
  bool _showBackToTop = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    super.dispose();
  }

  void _handleScroll() {
    final offset = _scrollController.offset;
    final nextShowAppBarBackground = offset > 24;
    final nextShowBackToTop = offset > 400;

    if (nextShowAppBarBackground != _showAppBarBackground ||
        nextShowBackToTop != _showBackToTop) {
      setState(() {
        _showAppBarBackground = nextShowAppBarBackground;
        _showBackToTop = nextShowBackToTop;
      });
    }
  }

  void _scrollToTop() {
    _scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  void _displayEpisode(Episode episode) {
    setState(() {
      _episode = episode;
      _showAppBarBackground = false;
      _showBackToTop = false;
    });
    if (_scrollController.hasClients) {
      _scrollController.jumpTo(0);
    }
  }

  Future<void> _selectLanguage(String languageCode) async {
    final localizedEpisode = await _episodeService.getEpisodeById(
      _episode.id,
      languageCode: languageCode,
    );
    if (!mounted) return;
    if (localizedEpisode == null) {
      context.showMessage(_languageUnavailableMessage);
      return;
    }

    await context.read<ContentLanguageProvider?>()?.setLanguageCode(
          languageCode,
        );
    if (!mounted) return;
    setState(() => _episode = localizedEpisode);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: EpisodeDetailAppBar(
        episode: _episode,
        showBackground: _showAppBarBackground,
        onBack: () => Navigator.pop(context),
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            controller: _scrollController,
            physics: const BouncingScrollPhysics(),
            child: Padding(
              padding: EdgeInsets.only(
                top: MediaQuery.paddingOf(context).top + kToolbarHeight + 8,
                bottom: MediaQuery.paddingOf(context).bottom + 32,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  EpisodeDetailMetadataSection(episode: _episode),
                  EpisodeDetailPlaybackControls(
                    episode: _episode,
                    queueEpisodes: widget.queueEpisodes,
                    onLanguageSelected: _selectLanguage,
                    onEpisodeChanged: _displayEpisode,
                  ),
                  const SizedBox(height: 14),
                  EpisodeDetailActionRow(episode: _episode),
                  const SizedBox(height: 28),
                  EpisodeDetailTranscriptSection(episode: _episode),
                ],
              ),
            ),
          ),
          Positioned(
            right: 16,
            bottom: 20,
            child: SafeArea(
              child: IgnorePointer(
                ignoring: !_showBackToTop,
                child: AnimatedOpacity(
                  opacity: _showBackToTop ? 1 : 0,
                  duration: const Duration(milliseconds: 180),
                  child: FloatingActionButton.small(
                    heroTag: 'episode-detail-back-to-top',
                    tooltip: 'Back to top',
                    backgroundColor: AppColors.surfaceElevated,
                    foregroundColor: AppColors.accent,
                    onPressed: _scrollToTop,
                    child: const Icon(Icons.keyboard_arrow_up_rounded),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
