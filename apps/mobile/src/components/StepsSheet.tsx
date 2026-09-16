import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { localizedInstruction, maneuverArrow } from '../navigation/instructions';
import type { Maneuver, Route } from '../navigation/routing';
import { formatDistance, formatDuration, type Language } from '../shared';
import { radius, spacing, titleFontFor, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  route: Route | null;
  /** Manoeuvre en cours, pour estomper celles qui sont derriere et mettre celle-ci en avant. */
  currentIndex: number;
  lang: Language;
  onClose: () => void;
  colors: Palette;
};

type Row = { maneuver: Maneuver; index: number };

/**
 * Liste complete des etapes de l'itineraire.
 *
 * Elle s'ouvre en touchant le bandeau d'instruction — c'est le geste attendu sur une carte de
 * navigation, et il evite d'ajouter un bouton de plus a un ecran qui en a deja dix.
 *
 * Ce qui est deja passe reste affiche, estompe, plutot que d'etre retire de la liste : on
 * consulte souvent les etapes pour verifier qu'on n'a PAS rate une sortie, et une liste qui
 * efface le passe ne permet justement pas cette verification.
 */
export function StepsSheet({ visible, route, currentIndex, lang, onClose, colors }: Props) {
  const { t } = useTranslation();

  const rows: Row[] = route ? route.maneuvers.map((maneuver, index) => ({ maneuver, index })) : [];

  return (
    <Modal visible={visible && !!route} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[typography.heading, { color: colors.text }]}>{t('nav.steps')}</Text>
              {route ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {formatDistance(route.distanceM)} · {formatDuration(route.durationS)}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('nav.closeSteps')}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          <FlatList
            data={rows}
            keyExtractor={(row) => String(row.index)}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            )}
            renderItem={({ item }) => {
              const passed = item.index < currentIndex;
              const current = item.index === currentIndex;
              return (
                <View style={[styles.row, current ? { backgroundColor: colors.surfaceAlt } : null]}>
                  <Text
                    style={[
                      styles.arrow,
                      { color: current ? colors.accent : colors.text, opacity: passed ? 0.35 : 1 },
                    ]}
                  >
                    {maneuverArrow(item.maneuver.type)}
                  </Text>
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        styles.instruction,
                        {
                          color: colors.text,
                          opacity: passed ? 0.4 : 1,
                          fontFamily: titleFontFor(lang),
                          fontWeight: current ? '800' : '400',
                        },
                      ]}
                    >
                      {localizedInstruction(item.maneuver, lang)}
                    </Text>
                    <Text style={[styles.distance, { color: colors.textMuted, opacity: passed ? 0.4 : 1 }]}>
                      {formatDistance(item.maneuver.distanceM)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  box: {
    maxHeight: '75%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headText: { flex: 1, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  arrow: { fontSize: 22, width: 26, textAlign: 'center' },
  rowText: { flex: 1, gap: 1 },
  instruction: { fontSize: 14.5, lineHeight: 19 },
  distance: { fontSize: 12 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 26 + spacing.md },
});
