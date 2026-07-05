import '../models/episode.dart';

int compareEpisodesOldestFirst(Episode left, Episode right) {
  final dateOrder = left.createdAt.compareTo(right.createdAt);
  if (dateOrder != 0) return dateOrder;
  return left.id.compareTo(right.id);
}

int compareEpisodesNewestFirst(Episode left, Episode right) {
  final dateOrder = right.createdAt.compareTo(left.createdAt);
  if (dateOrder != 0) return dateOrder;
  return right.id.compareTo(left.id);
}
