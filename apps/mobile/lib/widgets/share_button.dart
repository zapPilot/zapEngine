import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../config/share_config.dart';
import '../models/episode.dart';
import '../theme/colors.dart';

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
          visualDensity:
              _compact ? VisualDensity.compact : VisualDensity.standard,
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

  Future<void> _shareEpisode(BuildContext context) async {
    final shareUrl = ShareConfig.episodeUri(_episode.id).toString();

    try {
      await SharePlus.instance.share(
        ShareParams(
          text: '${_episode.title}\n$shareUrl',
          subject: _episode.title,
          sharePositionOrigin: _sharePositionOrigin(context),
        ),
      );
    } catch (error, stackTrace) {
      debugPrint(
        'Failed to share episode ${_episode.id}: $error\n$stackTrace',
      );
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('分享失敗，請稍後再試')),
      );
    }
  }

  Rect? _sharePositionOrigin(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) {
      return null;
    }

    return box.localToGlobal(Offset.zero) & box.size;
  }
}
