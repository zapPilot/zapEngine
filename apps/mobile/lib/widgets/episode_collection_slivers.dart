import 'package:flutter/material.dart';

import 'error_state_widget.dart';

List<Widget> buildEpisodeCollectionSlivers({
  required bool loading,
  required String? error,
  required bool empty,
  required Widget emptyState,
  required VoidCallback onRetry,
  required List<Widget> contentSlivers,
}) {
  if (loading) {
    return const [
      SliverFillRemaining(
        hasScrollBody: false,
        child: Center(child: CircularProgressIndicator()),
      ),
    ];
  }

  if (error != null) {
    return [
      SliverFillRemaining(
        hasScrollBody: false,
        child: ErrorStateWidget(message: error, onRetry: onRetry),
      ),
    ];
  }

  if (empty) {
    return [
      SliverFillRemaining(hasScrollBody: false, child: emptyState),
    ];
  }

  return contentSlivers;
}
