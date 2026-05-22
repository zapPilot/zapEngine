import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:zapengine_tokens/design_tokens.dart';

import '../config/app_config.dart';
import '../config/language_codes.dart';
import '../services/auth_service.dart';
import '../state/auth_provider.dart';
import '../state/content_language_provider.dart';
import '../theme/colors.dart';
import '../utils/snackbar.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('設定')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 112),
          children: const [
            _LanguageSection(),
            SizedBox(height: 28),
            _AccountSection(),
          ],
        ),
      ),
    );
  }
}

class _LanguageSection extends StatelessWidget {
  const _LanguageSection();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final languageCode =
        context.watch<ContentLanguageProvider?>()?.languageCode ??
            AppConfig.defaultLanguageCode;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('語言', style: theme.textTheme.titleMedium),
        const SizedBox(height: 10),
        _SettingsCard(
          child: Column(
            children: [
              for (final option in kLanguageOptions) ...[
                _LanguageTile(
                  option: option,
                  selected: option.code == languageCode,
                ),
                if (option != kLanguageOptions.last)
                  const Divider(height: 1, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text(
          '語言會影響內容與音訊版本，收聽紀錄會保留。',
          style: theme.textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}

class _LanguageTile extends StatelessWidget {
  const _LanguageTile({required this.option, required this.selected});

  final LanguageOption option;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final enabled = option.enabled;

    return Opacity(
      opacity: enabled ? 1 : 0.58,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          radius: 18,
          backgroundColor:
              selected ? AppColors.accent : AppColors.surfaceElevated,
          child: Text(
            option.shortLabel,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color:
                      selected ? AppColors.background : AppColors.textSecondary,
                  fontWeight: FontWeight.w800,
                ),
          ),
        ),
        title: Text(option.nativeName),
        subtitle: Text(option.code),
        trailing: selected
            ? const Icon(Icons.check_circle_rounded, color: AppColors.accent)
            : enabled
                ? null
                : const Icon(Icons.lock_rounded,
                    color: AppColors.textSecondary),
        onTap: _buildTapHandler(context, enabled),
      ),
    );
  }

  VoidCallback? _buildTapHandler(BuildContext context, bool enabled) {
    if (selected) {
      return null;
    }

    if (enabled) {
      return () {
        final provider = context.read<ContentLanguageProvider?>();
        if (provider != null) {
          unawaited(provider.setLanguageCode(option.code));
        }
      };
    }

    return () => context.showMessage(kComingSoonTooltip);
  }
}

class _AccountSection extends StatelessWidget {
  const _AccountSection();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final accountDisplay = _resolveAccountDisplay(auth.currentUser);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('帳戶', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 10),
        _SettingsCard(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      radius: 22,
                      backgroundColor: AppColors.surfaceElevated,
                      child: Icon(
                        Icons.person_rounded,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            accountDisplay.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            accountDisplay.subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('登出'),
                    onPressed: () => context.read<AuthProvider>().signOut(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  _AccountDisplay _resolveAccountDisplay(PodcastUser? user) {
    final displayName = user?.displayName?.trim();
    final email = user?.email?.trim();
    final deviceId = user?.deviceId?.trim();
    final hasDisplayName = displayName?.isNotEmpty ?? false;
    final hasEmail = email?.isNotEmpty ?? false;
    final hasDeviceId = deviceId?.isNotEmpty ?? false;

    return _AccountDisplay(
      title: _accountTitle(
        displayName: hasDisplayName ? displayName : null,
        email: hasEmail ? email : null,
      ),
      subtitle: _accountSubtitle(
        email: hasEmail ? email : null,
        hasDeviceId: hasDeviceId,
      ),
    );
  }

  String _accountTitle({String? displayName, String? email}) {
    if (displayName != null) return displayName;
    if (email != null) return email;
    return '未登入帳戶';
  }

  String _accountSubtitle({String? email, required bool hasDeviceId}) {
    if (email != null) return email;
    if (hasDeviceId) return '裝置登入';
    return '尚未同步帳戶資料';
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(ZapTokens.radiusCard),
        side: const BorderSide(color: AppColors.divider),
      ),
      child: child,
    );
  }
}

class _AccountDisplay {
  const _AccountDisplay({required this.title, required this.subtitle});

  final String title;
  final String subtitle;
}
