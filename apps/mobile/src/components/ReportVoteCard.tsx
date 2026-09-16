import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Report } from '../shared';
import { REPORT_EMOJI } from '../reports/kinds';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  report: Report;
  pending: boolean;
  message: string | null;
  onConfirm: () => void;
  onAbsent: () => void;
  onClose: () => void;
  colors: Palette;
};

/** Carte flottante « toujours la / plus la », reprise de `.alert-confirm` en v83. */
export function ReportVoteCard({ report, pending, message, onConfirm, onAbsent, onClose, colors }: Props) {
  const { t } = useTranslation();

  return (
    <View style={[styles.card, { backgroundColor: colors.text }]}>
      <View style={styles.headRow}>
        <Text style={styles.emoji}>{REPORT_EMOJI[report.kind]}</Text>
        <Text style={[typography.body, styles.title, { color: colors.background }]}>{t(`report.${report.kind}`)}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: colors.background, fontSize: 16, opacity: 0.8 }}>✕</Text>
        </Pressable>
      </View>

      {message ? (
        <Text style={[typography.caption, { color: colors.background, opacity: 0.9 }]}>{message}</Text>
      ) : pending ? (
        <ActivityIndicator color={colors.background} />
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={onConfirm}
            style={[styles.btn, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
          >
            <Text style={[typography.caption, styles.btnLabel]}>✅ {t('report.stillThere')}</Text>
          </Pressable>
          <Pressable onPress={onAbsent} style={[styles.btn, { backgroundColor: colors.danger }]} accessibilityRole="button">
            <Text style={[typography.caption, styles.btnLabel]}>❌ {t('report.gone')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 18 },
  title: { flex: 1, fontWeight: '700' as const },
  row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  btn: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnLabel: { color: '#fff', fontWeight: '700' as const },
});
