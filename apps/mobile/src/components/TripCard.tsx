import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Route, RouteMode } from '../navigation/routing';
import { formatDistance, formatDuration } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

/* Les trois couleurs de la maquette validee du 27 octobre, au point pres. Elles sont FIGEES et
 * ne suivent pas le theme : ce sont des fonds pleins, et le texte pose dessus doit rester
 * lisible de jour comme de nuit. */
const VERT_DISTANCE = '#0B5B2C';
const GRIS_DUREE = '#F3F4F6';
const OR_MEILLEUR = '#D4A017';

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
          {/* DEUX CARTES METRIQUES — maquette validee du 27 octobre.
            *
            * Elles remplacent trois tuiles separees par des filets, dont celle du << statut >>
            * ajoutee le 23 octobre a la demande du meme client. L'information n'est pas perdue :
            * la fiche affiche deja, au-dessus, « ⭐ Ajoute par WIN VIP » ou « Ajoute par WIN ».
            * Elle etait donc ecrite deux fois, et la maquette d'aujourd'hui tranche.
            *
            * La carte de distance porte un fond vert plein et la duree un fond gris : leurs
            * textes sont FIGES, puisque leurs fonds le sont. C'est la regle qui a deja coute un
            * ecran illisible en mode nuit (menu de signalement, 26 octobre). */}
          <View style={styles.metrics}>
            <View style={[styles.carteMetrique, { backgroundColor: VERT_DISTANCE }]}>
              <Text style={styles.metriqueValeurClaire} numberOfLines={1} adjustsFontSizeToFit>
                {formatDistance(selected.distanceM)}
              </Text>
              <Text style={styles.metriqueLibelleClair}>{t('trip.distance')}</Text>
            </View>
            <View style={[styles.carteMetrique, { backgroundColor: GRIS_DUREE }]}>
              <Text style={styles.metriqueValeurSombre} numberOfLines={1} adjustsFontSizeToFit>
                {formatDuration(selected.durationS)}
              </Text>
              <Text style={styles.metriqueLibelleSombre}>{t('trip.duration')}</Text>
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
                  {/* LE MEILLEUR EN OR, les autres en gris (maquette du 27 octobre). La
                      couleur distingue le trajet RECOMMANDE, pas celui qui est selectionne —
                      ce sont deux choses differentes, et c'est la bordure qui dit le choix. */}
                  <Text
                    style={[styles.altChipTitle, { color: i === 0 ? OR_MEILLEUR : colors.textMuted }]}
                  >
                    {i === 0 ? t('trip.fastest') : t('trip.alternative')}
                  </Text>
                  <Text style={[styles.altChipSub, { color: colors.textMuted }]}>{formatDuration(r.durationS)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* « C'est parti ! » : vert plein, fleche de lecture, et une ombre portee. L'ombre
              n'est pas un ornement — c'est elle qui detache le geste principal du reste de la
              feuille, ou tout le monde est plat. */}
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: VERT_DISTANCE, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={styles.startBtnText}>▶  {t('nav.start')}</Text>
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
  metrics: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  carteMetrique: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  metriqueValeurClaire: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' as const },
  metriqueLibelleClair: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10.5,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  metriqueValeurSombre: { color: '#15201C', fontSize: 22, fontWeight: '800' as const },
  metriqueLibelleSombre: {
    color: '#5E6B64',
    fontSize: 10.5,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 2,
  },
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
  startBtn: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    // L'ombre detache le geste principal d'une feuille ou tout le reste est plat.
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  startBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 15.5 },
});
