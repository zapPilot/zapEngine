import { API_ENDPOINTS } from '@zapengine/app-core/lib/http/config';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

interface StatusScreenProps {
  body: string;
  layout: 'home' | 'centered';
  title: string;
  eyebrow?: string;
}

export function StatusScreen({
  body,
  eyebrow,
  layout,
  title,
}: StatusScreenProps) {
  const isHome = layout === 'home';
  // Read at render (not module scope) so the env injected at app bootstrap
  // (configureAppCoreEnv) is honored; also proves app-core resolves via Metro.
  const accountApiState = API_ENDPOINTS.accountApi ? 'configured' : 'missing';

  return (
    <View style={[styles.screen, isHome ? styles.home : styles.centered]}>
      {isHome && (
        <View style={styles.header}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.heroTitle}>{title}</Text>
        </View>
      )}

      <View style={[styles.panel, isHome ? styles.homePanel : styles.notice]}>
        {!isHome && <Text style={styles.noticeTitle}>{title}</Text>}
        <Text style={isHome ? styles.panelTitle : styles.body}>{body}</Text>
        <Text style={styles.footnote}>
          Shared app-core · account API {accountApiState}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: colors.background,
  },
  home: {
    justifyContent: 'space-between',
  },
  centered: {
    justifyContent: 'center',
  },
  header: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 40,
  },
  panel: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: spacing.lg,
  },
  homePanel: {
    backgroundColor: colors.surface,
  },
  notice: {
    backgroundColor: colors.surfaceElevated,
  },
  panelTitle: {
    color: colors.inkDim,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  body: {
    color: colors.inkDim,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
  },
  footnote: {
    color: colors.inkDim,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 16,
  },
});
