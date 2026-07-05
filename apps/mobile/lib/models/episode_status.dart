import 'episode.dart';

enum EpisodeStatus { unplayed, inProgress, completed }

extension EpisodeStatusX on Episode {
  EpisodeStatus get status {
    if (listened) return EpisodeStatus.completed;
    if (lastPositionSeconds > 5) return EpisodeStatus.inProgress;
    return EpisodeStatus.unplayed;
  }
}
