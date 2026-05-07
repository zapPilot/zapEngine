import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/episode.dart';
import '../models/episode_page.dart';

class ApiService {
  ApiService({
    String baseUrl = const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://from-fed-to-chain-api.fly.dev/',
    ),
    http.Client? client,
  })  : _baseUri = Uri.parse(_withTrailingSlash(baseUrl)),
        _client = client ?? http.Client();

  final Uri _baseUri;
  final http.Client _client;

  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    final queryParameters = <String, String>{
      'limit': '$limit',
      'language': languageCode,
      if (cursor != null) 'cursor': cursor,
    };
    final response = await _client.get(
      _uri('episodes').replace(queryParameters: queryParameters),
    );
    final data = _decode(response);

    if (data is! Map<String, dynamic>) {
      throw const ApiException('Invalid episodes response');
    }

    return EpisodePage.fromJson(data);
  }

  Future<Episode> markListened(String id) async {
    final response = await _client.post(_uri('episodes/$id/listened'));
    final data = _decode(response);

    if (data is! Map<String, dynamic>) {
      throw const ApiException('Invalid episode response');
    }

    return Episode.fromJson(data);
  }

  void close() {
    _client.close();
  }

  Uri _uri(String path) {
    return _baseUri.resolve(path);
  }

  Object? _decode(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException('API request failed (${response.statusCode})');
    }

    return jsonDecode(response.body) as Object?;
  }

  static String _withTrailingSlash(String value) {
    return value.endsWith('/') ? value : '$value/';
  }
}

class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  @override
  String toString() => message;
}
