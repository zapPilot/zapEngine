import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

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
      child: IconButton(
        tooltip: 'Share',
        visualDensity:
            _compact ? VisualDensity.compact : VisualDensity.standard,
        icon: Icon(
          Icons.ios_share_rounded,
          size: _compact ? 18 : 20,
          color: AppColors.textSecondary,
        ),
        onPressed: () {
          Share.share(
            '${_episode.title} - ${_episode.hlsUrl}',
            subject: _episode.title,
          );
        },
      ),
    );
  }
}
