import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReportKind } from '../shared';
import { REPORT_EMOJI, REPORT_MENU_ORDER } from '../reports/kinds';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: ReportKind) => void;
  colors: Palette;
};

/** Menu de signalement : meme grille 2 colonnes que `.alert-menu`/`.am-grid` en v83. */
export function ReportMenu({ visible, onClose, onPick, colors }: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Text style={[typography.heading, { color: colors.text }]}>{t('report.menuTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {REPORT_MENU_ORDER.map((kind) => (
              <Pressable
                key={kind}
                onPress={() => onPick(kind)}
                style={({ pressed }) => [
                  styles.item,
                  { borderColor: colors.goldDeep, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.emoji}>{REPORT_EMOJI[kind]}</Text>
                <Text style={[typography.caption, styles.itemLabel, { color: colors.text }]}>
                  {t(`report.${kind}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(21,32,28,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: {
    width: '47%',
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  emoji: { fontSize: 22 },
  itemLabel: { fontWeight: '700' as const, textAlign: 'center' },
});
