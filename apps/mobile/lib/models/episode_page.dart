import 'episode.dart';

class EpisodePage {
  const EpisodePage({required this.items, required this.nextCursor});

  final List<Episode> items;
  final String? nextCursor;

  factory EpisodePage.fromJson(Map<String, dynamic> json) {
    return EpisodePage(
      items: (json['items'] as List)
          .cast<Map<String, dynamic>>()
          .map(Episode.fromJson)
          .toList(growable: false),
      nextCursor: json['nextCursor'] as String?,
    );
  }
}
