import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../config/share_config.dart';
import '../models/episode.dart';
import '../theme/colors.dart';
import '../utils/app_logger.dart';
import '../utils/snackbar.dart';

class ShareButton extends StatelessWidget {
  const ShareButton({super.key, required Episode episode, bool compact = false})
    : _episode = episode,
      _compact = compact;

  final Episode _episode;
  final bool _compact;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Share ${_episode.title}',
      child: Builder(
        builder: (buttonContext) => IconButton(
          tooltip: 'Share',
          visualDensity: _compact
              ? VisualDensity.compact
              : VisualDensity.standard,
          icon: Icon(
            Icons.ios_share_rounded,
            size: _compact ? 18 : 20,
            color: AppColors.textSecondary,
          ),
          onPressed: () => _shareEpisode(buttonContext),
        ),
      ),
    );
  }

  static Future<void> share(
    BuildContext context,
    Episode episode, {
    Rect? sharePositionOrigin,
  }) async {
    final shareUrl = ShareConfig.episodeUri(episode.id).toString();

    try {
      await SharePlus.instance.share(
        ShareParams(
          text: '${episode.title}\n$shareUrl',
          subject: episode.title,
          sharePositionOrigin:
              sharePositionOrigin ?? sharePositionOriginFor(context),
        ),
      );
    } catch (error, stackTrace) {
      AppLogger.warn(
        'Failed to share episode ${episode.id}',
        error,
        stackTrace,
      );
      if (!context.mounted) return;

      context.showMessage('分享失敗，請稍後再試');
    }
  }

  Future<void> _shareEpisode(BuildContext context) {
    return share(context, _episode);
  }

  static Rect? sharePositionOriginFor(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) {
      return null;
    }

    return box.localToGlobal(Offset.zero) & box.size;
  }
}
