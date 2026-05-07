import '../utils/json_utils.dart' as json_utils;

class AudioTrack {
  const AudioTrack({
    required this.languageCode,
    required this.title,
    required this.hlsUrl,
  });

  final String languageCode;
  final String title;
  final String hlsUrl;

  bool get isPlayable => hlsUrl.trim().isNotEmpty;

  factory AudioTrack.fromJson(Map<String, dynamic> json) {
    final languageCode = _readOptionalString(
      json,
      'languageCode',
      'language_code',
    );
    final title = _readOptionalString(json, 'title', 'title');

    return AudioTrack(
      languageCode: languageCode,
      title: title.isNotEmpty ? title : languageCode,
      hlsUrl: _readOptionalString(json, 'hlsUrl', 'hls_url'),
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is AudioTrack &&
            other.languageCode == languageCode &&
            other.title == title &&
            other.hlsUrl == hlsUrl;
  }

  @override
  int get hashCode => Object.hash(languageCode, title, hlsUrl);
}

class LanguageClassroomKeyword {
  const LanguageClassroomKeyword({
    required this.term,
    required this.meaning,
    this.reading,
    this.note,
  });

  final String term;
  final String? reading;
  final String meaning;
  final String? note;

  factory LanguageClassroomKeyword.fromJson(Map<String, dynamic> json) {
    return LanguageClassroomKeyword(
      term: _readRequiredString(json, 'term', 'term'),
      reading: _readNullableString(json, 'reading', 'reading'),
      meaning: _readRequiredString(json, 'meaning', 'meaning'),
      note: _readNullableString(json, 'note', 'note'),
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is LanguageClassroomKeyword &&
            other.term == term &&
            other.reading == reading &&
            other.meaning == meaning &&
            other.note == note;
  }

  @override
  int get hashCode => Object.hash(term, reading, meaning, note);
}

class LanguageClassroomLesson {
  const LanguageClassroomLesson({
    required this.sourceLanguageCode,
    required this.targetLanguageCode,
    required this.oneLiner,
    required this.keywords,
  });

  final String sourceLanguageCode;
  final String targetLanguageCode;
  final String oneLiner;
  final List<LanguageClassroomKeyword> keywords;

  factory LanguageClassroomLesson.fromJson(Map<String, dynamic> json) {
    return LanguageClassroomLesson(
      sourceLanguageCode: _readOptionalString(
        json,
        'sourceLanguageCode',
        'source_language_code',
      ),
      targetLanguageCode: _readRequiredString(
        json,
        'targetLanguageCode',
        'target_language_code',
      ),
      oneLiner: _readRequiredString(json, 'oneLiner', 'one_liner'),
      keywords: _readLanguageClassroomKeywords(json),
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is LanguageClassroomLesson &&
            other.sourceLanguageCode == sourceLanguageCode &&
            other.targetLanguageCode == targetLanguageCode &&
            other.oneLiner == oneLiner &&
            _listEquals(other.keywords, keywords);
  }

  @override
  int get hashCode => Object.hash(
        sourceLanguageCode,
        targetLanguageCode,
        oneLiner,
        Object.hashAll(keywords),
      );
}

class Episode {
  const Episode({
    required this.id,
    String? localizationId,
    required this.title,
    this.languageCode = 'zh-Hant',
    required this.hlsUrl,
    required this.createdAt,
    required this.listened,
    this.likeCount = 0,
    this.script,
    this.audioTracks = const [],
    this.languageClassrooms = const [],
    this.lastPositionSeconds = 0,
  }) : localizationId = localizationId ?? id;

  final String id;
  final String localizationId;
  final String title;
  final String languageCode;
  final String hlsUrl;
  final DateTime createdAt;
  final bool listened;
  final int likeCount;
  final String? script;
  final List<AudioTrack> audioTracks;
  final List<LanguageClassroomLesson> languageClassrooms;
  final int lastPositionSeconds;

  List<AudioTrack> get playableAudioTracks {
    return audioTracks
        .where((track) => track.isPlayable)
        .toList(growable: false);
  }

  factory Episode.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String;
    final localizationId = _readOptionalString(
      json,
      'localizationId',
      'localization_id',
    );
    final languageCode = _readOptionalString(
      json,
      'languageCode',
      'language_code',
    );

    return Episode(
      id: id,
      localizationId: localizationId.isNotEmpty ? localizationId : id,
      title: json['title'] as String,
      languageCode: languageCode.isNotEmpty ? languageCode : 'zh-Hant',
      hlsUrl: _readRequiredString(json, 'hlsUrl', 'hls_url'),
      createdAt: DateTime.parse(
        _readRequiredString(json, 'createdAt', 'created_at'),
      ).toLocal(),
      listened: json['listened'] as bool? ?? false,
      likeCount: _readInt(json, 'likeCount', 'like_count'),
      script: json['script'] as String?,
      audioTracks: _readAudioTracks(json),
      languageClassrooms: _readLanguageClassrooms(json),
      lastPositionSeconds: _readInt(
        json,
        'lastPositionSeconds',
        'last_position_seconds',
      ),
    );
  }

  Episode copyWith({
    String? id,
    String? localizationId,
    String? title,
    String? languageCode,
    String? hlsUrl,
    DateTime? createdAt,
    bool? listened,
    int? likeCount,
    String? script,
    List<AudioTrack>? audioTracks,
    List<LanguageClassroomLesson>? languageClassrooms,
    int? lastPositionSeconds,
  }) {
    return Episode(
      id: id ?? this.id,
      localizationId: localizationId ?? this.localizationId,
      title: title ?? this.title,
      languageCode: languageCode ?? this.languageCode,
      hlsUrl: hlsUrl ?? this.hlsUrl,
      createdAt: createdAt ?? this.createdAt,
      listened: listened ?? this.listened,
      likeCount: likeCount ?? this.likeCount,
      script: script ?? this.script,
      audioTracks: audioTracks ?? this.audioTracks,
      languageClassrooms: languageClassrooms ?? this.languageClassrooms,
      lastPositionSeconds: lastPositionSeconds ?? this.lastPositionSeconds,
    );
  }
}

String _readRequiredString(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  return (json[camelKey] ?? json[snakeKey]) as String;
}

String _readOptionalString(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  return (json[camelKey] ?? json[snakeKey])?.toString() ?? '';
}

String? _readNullableString(
  Map<String, dynamic> json,
  String camelKey,
  String snakeKey,
) {
  final value = _readOptionalString(json, camelKey, snakeKey).trim();
  return value.isEmpty ? null : value;
}

int _readInt(Map<String, dynamic> json, String camelKey, String snakeKey) {
  return json_utils.readIntFromJson(json, camelKey, snakeKey);
}

List<AudioTrack> _readAudioTracks(Map<String, dynamic> json) {
  final value = json['audioTracks'] ?? json['audio_tracks'];
  if (value is! List) return const [];

  return value
      .whereType<Map>()
      .map((track) => AudioTrack.fromJson(Map<String, dynamic>.from(track)))
      .where((track) => track.isPlayable)
      .toList(growable: false);
}

List<LanguageClassroomLesson> _readLanguageClassrooms(
  Map<String, dynamic> json,
) {
  final value = json['languageClassrooms'] ?? json['language_classrooms'];
  if (value is! List) return const [];

  return value
      .whereType<Map>()
      .map(
        (lesson) =>
            LanguageClassroomLesson.fromJson(Map<String, dynamic>.from(lesson)),
      )
      .where((lesson) => lesson.oneLiner.trim().isNotEmpty)
      .toList(growable: false);
}

List<LanguageClassroomKeyword> _readLanguageClassroomKeywords(
  Map<String, dynamic> json,
) {
  final value = json['keywords'];
  if (value is! List) return const [];

  return value
      .whereType<Map>()
      .map(
        (keyword) => LanguageClassroomKeyword.fromJson(
          Map<String, dynamic>.from(keyword),
        ),
      )
      .where((keyword) => keyword.term.trim().isNotEmpty)
      .toList(growable: false);
}

bool _listEquals<T>(List<T> left, List<T> right) {
  if (identical(left, right)) return true;
  if (left.length != right.length) return false;
  for (var index = 0; index < left.length; index += 1) {
    if (left[index] != right[index]) return false;
  }
  return true;
}
