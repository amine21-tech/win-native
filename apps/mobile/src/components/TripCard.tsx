import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconePieton, IconeVoiture } from './IconesTransport';
import type { Route, RouteMode } from '../navigation/routing';
import { formatDistance, formatDuration } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

/* Les trois couleurs de la maquette validee du 27 octobre, au point pres. Elles sont FIGEES et
 * ne suivent pas le theme : ce sont des fonds pleins, et le texte pose dessus doit rester
 * lisible de jour comme de nuit. */
const VERT_DISTANCE = '#0B5B2C';
const GRIS_DUREE = '#F3F4F6';
const OR_MEILLEUR = '#D4A017';

/* LE DOUBLE CADRE DU 8 NOVEMBRE, point 7 : un cadre exterieur vert de 3 points en rayon 16, un
 * cadre interieur dore de 1,5 point en rayon 10, a 12 points du premier.
 *
 * POURQUOI DEUX CADRES PLUTOT QU'UN. La fiche en avait un seul, avec un bord superieur vert de
 * trois points — le << encadrement >> demande le 27 octobre. Le double cadre dit autre chose :
 * il ne separe pas la carte du reste de la fiche, il la designe comme LE contenu de la fiche.
 * C'est la mise en page des documents officiels algeriens, et sur une carte de destination elle
 * se lit comme un sceau. C'est aussi, accessoirement, ce que le client dessine.
 *
 * Les deux couleurs sont FIGEES, comme les trois du dessus et pour la meme raison : les fonds
 * qu'elles encadrent le sont. */
const VERT_CADRE = '#0D6E4F';
const OR_CADRE = '#FFD864';

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

/**
 * LES TROIS PROFILS DANS L'ORDRE OU ILS S'AFFICHENT.
 *
 * Une table plutot que trois blocs recopies : les deux boutons precedents etaient identiques
 * a la couleur et au libelle pres, et chacun repetait neuf lignes de style. Un troisieme en
 * aurait fait vingt-sept, ou une faute de copie se cache sans se voir - typiquement un
 * `prefs.profil` oublie qui laisse deux boutons allumes en meme temps.
 */
const PROFILS = [
  { profil: 'court' as const, glyphe: '📏', cle: 'trip.shortest' },
  { profil: 'autoroute' as const, glyphe: '🛣️', cle: 'trip.motorway' },
  { profil: 'sansAutoroute' as const, glyphe: '🚫', cle: 'trip.noMotorway' },
];

/** Carte "resume de trajet" : reprise de `.tripcard` en v83 — distance/duree, bascule voiture/pied,
 * itineraires alternatifs, bouton demarrer. */
export function TripCard({ routes, selectedIndex, onSelect, loading, error, mode, onModeChange, onStart, colors }: Props) {
  const prefs = useSession((s) => s.routePrefs);
  const setProfil = useSession((s) => s.setProfil);
  const { t } = useTranslation();
  const selected = routes[selectedIndex];

  return (
    /* BORDURE VERTE SUPERIEURE (point 6). Trois points de vert en haut du cadre : c'est ce qui
       le detache du reste de la fiche et lui donne un bord, au lieu d'un rectangle pose sans
       limite franche. Le client l'a demandee explicitement, et c'est aussi ce qui repond au
       reproche de cadre « sans encadrement ». */
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* LE CADRE INTERIEUR DORE. Il enveloppe tout le contenu, y compris l'indicateur de
          chargement et le message d'erreur : un cadre qui n'apparaitrait qu'une fois le trajet
          calcule ferait sauter la fiche au moment ou elle se remplit. */}
      <View style={styles.cadreInterieur}>
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
              {/* L'ICONE PREND LA COULEUR DU TEXTE, ce qu'un emoji ne sait pas faire : sur le
                  fond vert du mode actif, 🚗 restait rouge. */}
              <View style={styles.modeContenu}>
                <IconeVoiture size={17} color={mode === 'auto' ? colors.accentText : colors.text} />
                <Text style={[styles.modeLabel, { color: mode === 'auto' ? colors.accentText : colors.text }]}>
                  {t('trip.byCar')}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => onModeChange('pedestrian')}
              style={[styles.modeBtn, mode === 'pedestrian' && { backgroundColor: colors.accent }]}
            >
              <View style={styles.modeContenu}>
                <IconePieton
                  size={17}
                  color={mode === 'pedestrian' ? colors.accentText : colors.text}
                />
                <Text
                  style={[styles.modeLabel, { color: mode === 'pedestrian' ? colors.accentText : colors.text }]}
                >
                  {t('trip.onFoot')}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* LES TROIS CHOIX D'ITINERAIRE - point 5A du 21 novembre.
           *
           * << Les 3 boutons UI existants (avec autoroute / sans autoroute / plus court)
           * continuent de fonctionner exactement comme avant. >> Il n'y en avait que DEUX : le
           * troisieme avait ete fondu dans les autres en octobre, quand le reglage est devenu un
           * simple booleen. On le remet, et c'est lui le defaut.
           *
           * POURQUOI LE PREMIER DE LA RANGEE EST << PLUS COURT >>. C'est le reglage par defaut,
           * et un conducteur lit une rangee de gauche a droite : le premier bouton allume doit
           * etre celui qui est actif quand on n'a rien choisi. Le trajet de l'aeroport d'Alger -
           * 10 km annonces pour 2 km reels - venait de ce que ce choix n'existait pas.
           *
           * A pied, la rangee ne s'affiche pas : elle n'a aucun sens. */}
          {mode === 'auto' ? (
            <View style={[styles.modes, { backgroundColor: colors.background }]}>
              {PROFILS.map(({ profil, glyphe, cle }) => {
                const actif = prefs.profil === profil;
                return (
                  <Pressable
                    key={profil}
                    onPress={() => setProfil(profil)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: actif }}
                    style={[styles.modeBtn, actif && { backgroundColor: colors.accent }]}
                  >
                    {/* DEUX LIGNES AUTORISEES, ET C'EST LE PASSAGE DE DEUX BOUTONS A TROIS QUI
                        L'IMPOSE. A trois, chaque bouton fait environ 98 points de large sur un
                        telephone de 360 : << Sans autoroute >> en demande 120 avec son glyphe.
                        Sur une seule ligne, le libelle se serait coupe en << Sans autor... >> —
                        un bouton qu'on ne peut plus lire. Le repli sur deux lignes garde les
                        glyphes et les mots entiers, et la rangee grandit d'une ligne. */}
                    <Text
                      numberOfLines={2}
                      style={[styles.modeLabel, { color: actif ? colors.accentText : colors.text }]}
                    >
                      {glyphe} {t(cle)}
                    </Text>
                  </Pressable>
                );
              })}
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
    </View>
  );
}

const styles = StyleSheet.create({
  /* LE CADRE EXTERIEUR : vert, 3 points, rayon 16 — valeurs du 8 novembre. Il n'a plus de
   * bord superieur special : le vert fait desormais tout le tour, ce qui rend inutile le
   * `borderTopWidth: 3` qui le simulait sur un seul cote depuis le 27 octobre. */
  card: {
    borderRadius: 16,
    borderWidth: 3,
    borderColor: VERT_CADRE,
    marginTop: spacing.md,
  },
  /* LE CADRE INTERIEUR : or, 1,5 point, rayon 10, a 12 points du cadre vert. La marge du
   * document (12) remplace le `padding` de la carte — sans quoi les deux s'ajouteraient et le
   * contenu serait repousse de vingt-huit points. */
  cadreInterieur: {
    borderWidth: 1.5,
    borderColor: OR_CADRE,
    borderRadius: 10,
    margin: 12,
    padding: spacing.sm,
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
  modeContenu: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /* `textAlign` compte des que le libelle passe sur deux lignes : `alignItems` centre le BLOC
   * de texte, pas ses lignes entre elles, et la seconde ligne resterait collee a gauche. */
  modeLabel: { fontSize: 12.5, fontWeight: '700' as const, textAlign: 'center' as const },
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
