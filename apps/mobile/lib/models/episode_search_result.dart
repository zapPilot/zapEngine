import 'episode.dart';

enum EpisodeSearchMatchSource {
  title,
  script;

  static EpisodeSearchMatchSource fromJson(Object? value) {
    return switch (value) {
      'title' => EpisodeSearchMatchSource.title,
      'script' => EpisodeSearchMatchSource.script,
      _ => throw FormatException('Unknown episode search match source: $value'),
    };
  }
}

class EpisodeSearchResult {
  const EpisodeSearchResult({
    required this.episode,
    required this.matchSource,
    required this.snippet,
  });

  final Episode episode;
  final EpisodeSearchMatchSource matchSource;
  final String? snippet;

  factory EpisodeSearchResult.fromJson(Map<String, dynamic> json) {
    return EpisodeSearchResult(
      episode: Episode.fromJson(
        Map<String, dynamic>.from(json['episode'] as Map),
      ),
      matchSource: EpisodeSearchMatchSource.fromJson(json['matchSource']),
      snippet: json['snippet'] as String?,
    );
  }

  EpisodeSearchResult copyWithEpisode(Episode episode) {
    return EpisodeSearchResult(
      episode: episode,
      matchSource: matchSource,
      snippet: snippet,
    );
  }
}
