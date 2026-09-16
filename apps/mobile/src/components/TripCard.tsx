import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Route, RouteMode } from '../navigation/routing';
import { formatDistance, formatDuration } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  routes: Route[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  loading: boolean;
  error: boolean;
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  onStart: () => void;
  colors: Palette;
};

/** Carte "resume de trajet" : reprise de `.tripcard` en v83 — distance/duree, bascule voiture/pied,
 * itineraires alternatifs, bouton demarrer. */
export function TripCard({ routes, selectedIndex, onSelect, loading, error, mode, onModeChange, onStart, colors }: Props) {
  const { t } = useTranslation();
  const selected = routes[selectedIndex];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.lg }} />
      ) : error || !selected ? (
        <Text style={[typography.caption, styles.errorText, { color: colors.textMuted }]}>{t('trip.unavailable')}</Text>
      ) : (
        <>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={[typography.title, { color: colors.accentDark }]}>
                {formatDistance(selected.distanceM)}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t('trip.distance')}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.metric}>
              <Text style={[typography.title, { color: colors.accentDark }]}>
                {formatDuration(selected.durationS)}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t('trip.duration')}</Text>
            </View>
          </View>

          <View style={[styles.modes, { backgroundColor: colors.background }]}>
            <Pressable
              onPress={() => onModeChange('auto')}
              style={[styles.modeBtn, mode === 'auto' && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.modeLabel, { color: mode === 'auto' ? colors.accentText : colors.text }]}>
                🚗 {t('trip.byCar')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onModeChange('pedestrian')}
              style={[styles.modeBtn, mode === 'pedestrian' && { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.modeLabel, { color: mode === 'pedestrian' ? colors.accentText : colors.text }]}>
                🚶 {t('trip.onFoot')}
              </Text>
            </Pressable>
          </View>

          {routes.length > 1 ? (
            <View style={styles.altRow}>
              {routes.map((r, i) => (
                <Pressable
                  key={i}
                  onPress={() => onSelect(i)}
                  style={[
                    styles.altChip,
                    { borderColor: i === selectedIndex ? colors.accent : colors.border, backgroundColor: i === selectedIndex ? colors.surfaceAlt : colors.surface },
                  ]}
                >
                  <Text style={[styles.altChipTitle, { color: colors.text }]}>
                    {i === 0 ? t('trip.fastest') : t('trip.alternative')}
                  </Text>
                  <Text style={[styles.altChipSub, { color: colors.textMuted }]}>{formatDuration(r.durationS)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable onPress={onStart} style={[styles.startBtn, { backgroundColor: colors.accent }]}>
            <Text style={styles.startBtnText}>➤ {t('nav.start')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
  errorText: { textAlign: 'center', paddingVertical: spacing.sm },
  metrics: { flexDirection: 'row', alignItems: 'stretch' },
  metric: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  metricLabel: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 },
  divider: { width: 1, marginVertical: 2 },
  modes: { flexDirection: 'row', borderRadius: radius.md, padding: 4, marginTop: spacing.md, gap: 4 },
  modeBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  modeLabel: { fontSize: 12.5, fontWeight: '700' as const },
  altRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  altChip: { flex: 1, borderWidth: 1.5, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  altChipTitle: { fontSize: 12, fontWeight: '800' as const },
  altChipSub: { fontSize: 11, marginTop: 2 },
  startBtn: { marginTop: spacing.md, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  startBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 15.5 },
});
