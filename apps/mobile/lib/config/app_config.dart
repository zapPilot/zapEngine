class AppConfig {
  const AppConfig._();

  static const contentLanguageCode = String.fromEnvironment(
    'CONTENT_LANGUAGE_CODE',
    defaultValue: 'zh-Hant',
  );
}
