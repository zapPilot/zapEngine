import '../utils/json_utils.dart' as json_utils;

class AudioTrack {
  const AudioTrack({
    required this.languageCode,
    required this.title,
    required this.hlsUrl,
    this.classroomHlsUrl,
  });

  final String languageCode;
  final String title;
  final String hlsUrl;
  final String? classroomHlsUrl;

  bool get isPlayable => hlsUrl.trim().isNotEmpty;

  factory AudioTrack.fromJson(Map<String, dynamic> json) {
    final languageCode = json_utils.readOptionalString(
      json,
      'languageCode',
      'language_code',
    );
    final title = json_utils.readOptionalString(json, 'title', 'title');

    return AudioTrack(
      languageCode: languageCode,
      title: title.isNotEmpty ? title : languageCode,
      hlsUrl: json_utils.readOptionalString(json, 'hlsUrl', 'hls_url'),
      classroomHlsUrl: json_utils.readNullableString(
        json,
        'classroomHlsUrl',
        'classroom_hls_url',
      ),
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is AudioTrack &&
            other.languageCode == languageCode &&
            other.title == title &&
            other.hlsUrl == hlsUrl &&
            other.classroomHlsUrl == classroomHlsUrl;
  }

  @override
  int get hashCode => Object.hash(languageCode, title, hlsUrl, classroomHlsUrl);
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
      term: json_utils.readRequiredString(json, 'term', 'term'),
      reading: json_utils.readNullableString(json, 'reading', 'reading'),
      meaning: json_utils.readRequiredString(json, 'meaning', 'meaning'),
      note: json_utils.readNullableString(json, 'note', 'note'),
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
      sourceLanguageCode: json_utils.readOptionalString(
        json,
        'sourceLanguageCode',
        'source_language_code',
      ),
      targetLanguageCode: json_utils.readRequiredString(
        json,
        'targetLanguageCode',
        'target_language_code',
      ),
      oneLiner: json_utils.readRequiredString(json, 'oneLiner', 'one_liner'),
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
    final id = json_utils.readRequiredString(json, 'id', 'id');
    final localizationId = json_utils.readOptionalString(
      json,
      'localizationId',
      'localization_id',
    );
    final languageCode = json_utils.readOptionalString(
      json,
      'languageCode',
      'language_code',
    );

    return Episode(
      id: id,
      localizationId: localizationId.isNotEmpty ? localizationId : id,
      title: json_utils.readRequiredString(json, 'title', 'title'),
      languageCode: languageCode.isNotEmpty ? languageCode : 'zh-Hant',
      hlsUrl: json_utils.readRequiredString(json, 'hlsUrl', 'hls_url'),
      createdAt: DateTime.parse(
        json_utils.readRequiredString(json, 'createdAt', 'created_at'),
      ).toLocal(),
      listened: json_utils.readBoolFromJson(json, 'listened', 'listened'),
      likeCount: json_utils.readIntFromJson(json, 'likeCount', 'like_count'),
      script: json['script'] as String?,
      audioTracks: _readAudioTracks(json),
      languageClassrooms: _readLanguageClassrooms(json),
      lastPositionSeconds: json_utils.readIntFromJson(
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
