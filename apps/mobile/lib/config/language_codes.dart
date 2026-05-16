class LanguageOption {
  const LanguageOption({
    required this.code,
    required this.shortLabel,
    required this.nativeName,
    required this.enabled,
  });

  final String code;
  final String shortLabel;
  final String nativeName;
  final bool enabled;
}

const kDefaultLanguageCode = 'zh-Hant';
const kComingSoonTooltip = '即將推出';

const kLanguageOptions = <LanguageOption>[
  LanguageOption(
    code: 'en',
    shortLabel: 'EN',
    nativeName: 'English',
    enabled: true,
  ),
  LanguageOption(
    code: kDefaultLanguageCode,
    shortLabel: '中',
    nativeName: '繁體中文',
    enabled: true,
  ),
  LanguageOption(
    code: 'ja',
    shortLabel: '日',
    nativeName: '日本語',
    enabled: true,
  ),
];

LanguageOption languageOptionFor(String code) {
  return kLanguageOptions.firstWhere(
    (option) => option.code == code,
    orElse: () => kLanguageOptions.firstWhere(
      (option) => option.code == kDefaultLanguageCode,
    ),
  );
}
