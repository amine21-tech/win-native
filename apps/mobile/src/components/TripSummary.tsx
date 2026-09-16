import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDistance, formatDuration } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

export type Trip = {
  /** Longueur de l'itineraire suivi. */
  distanceM: number;
  /** Duree reellement ecoulee entre le depart et l'arrivee. */
  durationS: number;
  /** Duree annoncee au moment du depart, pour la comparaison. */
  estimateS: number;
};

type Props = {
  trip: Trip | null;
  onClose: () => void;
  colors: Palette;
};

/**
 * Bilan affiche a l'arrivee (`quickStats` en v83).
 *
 * L'ecart avec l'estimation est donne tel quel, en avance comme en retard. C'est la seule
 * mesure qui permette au conducteur de juger la fiabilite des durees annoncees — la masquer
 * quand elle est mauvaise reviendrait a lui cacher que l'application se trompe.
 */
export function TripSummary({ trip, onClose, colors }: Props) {
  const { t } = useTranslation();
  if (!trip) return null;

  const deltaS = Math.round(trip.durationS - trip.estimateS);
  const deltaMin = Math.round(Math.abs(deltaS) / 60);
  const onTime = trip.estimateS <= 0 || deltaMin < 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.goldDeep }]}
        >
          <Text style={styles.flag}>🏁</Text>
          <Text style={[typography.title, { color: colors.text }]}>{t('nav.arrived')}</Text>

          <View style={styles.grid}>
            <View style={styles.cell}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{t('trip.distance')}</Text>
              <Text style={[styles.value, { color: colors.text }]}>{formatDistance(trip.distanceM)}</Text>
            </View>
            <View style={[styles.cell, styles.cellDivider, { borderLeftColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{t('trip.duration')}</Text>
              <Text style={[styles.value, { color: colors.text }]}>{formatDuration(trip.durationS)}</Text>
            </View>
          </View>

          <Text style={[styles.delta, { color: colors.textMuted }]}>
            {onTime
              ? t('trip.onTime')
              : deltaS > 0
                ? t('trip.late', { minutes: deltaMin })
                : t('trip.early', { minutes: deltaMin })}
          </Text>

          <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: colors.accent }]}>
            <Text style={styles.btnText}>{t('trip.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  box: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  flag: { fontSize: 30, lineHeight: 34 },
  grid: { flexDirection: 'row', width: '100%', marginTop: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm },
  cellDivider: { borderLeftWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.3, textTransform: 'uppercase' },
  value: { fontSize: 21, fontWeight: '800' as const },
  delta: { fontSize: 13.5, textAlign: 'center' },
  btn: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' as const, fontSize: 15.5 },
});
