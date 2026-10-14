import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReportKind } from '../shared';
import { menuEmoji, REPORT_FAMILLE, REPORT_MENU_ORDER, type ReportFamille } from '../reports/kinds';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: ReportKind) => void;
  colors: Palette;
};

/**
 * Teinte de fond par famille de signalement.
 *
 * Ce menu s'ouvre au volant, et le choix s'y fait en une seconde — a la couleur et au
 * pictogramme, rarement en lisant l'etiquette. Le rouge appelle ce qui met en danger, l'ambre ce
 * qui ralentit, le bleu ce qui s'anticipe ou se contourne, le violet ce qui vient d'arriver.
 *
 * Les fonds restent tres pales (`14` en fin de code, soit 8 % d'opacite) : ils doivent guider
 * l'oeil, pas crier. La bordure, elle, porte la couleur pleine.
 */
const TEINTES: Record<ReportFamille, string> = {
  danger: '#D64545',
  ralentit: '#E09B2D',
  info: '#2F6FE0',
  nouveau: '#7B5BD6',
};

/** Menu de signalement : grille 2 colonnes, heritee de `.alert-menu`/`.am-grid` en v83. */
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
            {REPORT_MENU_ORDER.map((kind) => {
              const famille = REPORT_FAMILLE[kind];
              const teinte = TEINTES[famille];
              return (
                <Pressable
                  key={kind}
                  onPress={() => onPick(kind)}
                  accessibilityRole="button"
                  accessibilityLabel={t(`report.${kind}`)}
                  style={({ pressed }) => [
                    styles.item,
                    { borderColor: teinte, backgroundColor: teinte + (pressed ? '2E' : '14') },
                  ]}
                >
                  {/* Le badge ne marque pas une categorie mais une NOUVEAUTE : il attire l'oeil
                      sur une fonction que personne ne cherche encore, et disparaitra quand elle
                      sera entree dans les habitudes. */}
                  {famille === 'nouveau' ? (
                    <View style={[styles.badge, { backgroundColor: teinte }]}>
                      <Text style={styles.badgeText}>{t('report.nouveau')}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.emoji}>{menuEmoji(kind)}</Text>
                  <Text style={[typography.caption, styles.itemLabel, { color: colors.text }]} numberOfLines={2}>
                    {t(`report.${kind}`)}
                  </Text>
                </Pressable>
              );
            })}
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
    // 16 points de rayon, demandes par le client : des angles plus doux que le reste de
    // l'interface, parce que ces pastilles se touchent vite et mal.
    borderRadius: 16,
    overflow: 'visible',
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
  /* Le badge deborde volontairement du coin : pose a l'interieur, il se confondrait avec le
   * contenu de la pastille ; a cheval sur le bord, il se lit comme une etiquette collee. */
  badge: {
    position: 'absolute',
    top: -8,
    right: -4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    elevation: 3,
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' as const, letterSpacing: 0.3 },
  itemLabel: { fontWeight: '700' as const, textAlign: 'center' },
});
