import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
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
  /**
   * Statut du lieu vise — la TROISIEME tuile demandee par le client (point 6, 23 octobre).
   *
   * Le cadre n'affichait que la duree et la distance, et il lui a paru « vide ». Le statut est
   * l'information qui manquait : savoir qu'on va chez un partenaire VIP ou vers une adresse
   * posee par la communaute change ce qu'on attend en arrivant.
   */
  statut: { texte: string; vip: boolean };
  colors: Palette;
};

/** Carte "resume de trajet" : reprise de `.tripcard` en v83 — distance/duree, bascule voiture/pied,
 * itineraires alternatifs, bouton demarrer. */
export function TripCard({ routes, selectedIndex, onSelect, loading, error, mode, onModeChange, onStart, statut, colors }: Props) {
  const prefs = useSession((s) => s.routePrefs);
  const setAutoroute = useSession((s) => s.setAutoroute);
  const { t } = useTranslation();
  const selected = routes[selectedIndex];

  return (
    /* BORDURE VERTE SUPERIEURE (point 6). Trois points de vert en haut du cadre : c'est ce qui
       le detache du reste de la fiche et lui donne un bord, au lieu d'un rectangle pose sans
       limite franche. Le client l'a demandee explicitement, et c'est aussi ce qui repond au
       reproche de cadre « sans encadrement ». */
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderTopColor: colors.accent },
      ]}
    >
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
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {/* La tuile de statut. Le texte y est plus petit que les deux chiffres voisins :
                c'est un mot, pas une mesure, et lui donner la meme taille deformerait la
                lecture d'un cadre ou l'oeil cherche d'abord la duree. */}
            <View style={styles.metric}>
              <Text
                style={[styles.statutValeur, { color: statut.vip ? colors.gold : colors.accentDark }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {statut.vip ? `⭐ ${statut.texte}` : statut.texte}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{t('trip.status')}</Text>
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

          {/* AUTOROUTE OU PAS : la seule question que se pose vraiment un conducteur algerien.
              Elle remplace les trois pastilles precedentes — voir RoutePrefs dans store/session
              pour ce qu'elles recouvraient et pourquoi deux choix valent mieux que trois
              reglages. A pied, elle ne s'affiche pas : elle n'a aucun sens. */}
          {mode === 'auto' ? (
            <View style={[styles.modes, { backgroundColor: colors.background }]}>
              <Pressable
                onPress={() => setAutoroute(true)}
                accessibilityRole="radio"
                accessibilityState={{ checked: prefs.autoroute }}
                style={[styles.modeBtn, prefs.autoroute && { backgroundColor: colors.accent }]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.modeLabel, { color: prefs.autoroute ? colors.accentText : colors.text }]}
                >
                  🛣️ {t('trip.motorway')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAutoroute(false)}
                accessibilityRole="radio"
                accessibilityState={{ checked: !prefs.autoroute }}
                style={[styles.modeBtn, !prefs.autoroute && { backgroundColor: colors.accent }]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.modeLabel, { color: !prefs.autoroute ? colors.accentText : colors.text }]}
                >
                  🚫 {t('trip.noMotorway')}
                </Text>
              </Pressable>
            </View>
          ) : null}

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
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    // Le haut plus epais et colore : c'est lui qui « encadre » le bloc (point 6 du client).
    borderTopWidth: 3,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { textAlign: 'center', paddingVertical: spacing.sm },
  metrics: { flexDirection: 'row', alignItems: 'stretch' },
  metric: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  metricLabel: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 },
  statutValeur: { fontSize: 15, fontWeight: '800' as const, letterSpacing: 0.2 },
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
