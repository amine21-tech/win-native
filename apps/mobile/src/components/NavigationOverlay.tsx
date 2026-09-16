import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { localizedInstruction, maneuverArrow, roadRef } from '../navigation/instructions';
import type { Maneuver } from '../navigation/routing';
import type { FixListener } from '../navigation/useLiveLocation';
import { formatDistance, formatDuration, type Language } from '../shared';
import { SpeedBadge } from './SpeedBadge';
import { radius, spacing, titleFontFor, typography, type Palette } from '../theme';
import { formatClock24, useClock } from '../utils/clock';

/** Ecart entre les cartes flottantes et le bord de l'ecran, en paysage. */
const CARD_MARGIN = spacing.sm;

type Props = {
  active: boolean;
  nextManeuver: Maneuver | null;
  /** Manoeuvre suivant celle qui est annoncee : « puis a droite ». Deux virages rapproches
   * se preparent ensemble — savoir qu'on tourne encore juste apres change la file qu'on
   * choisit, et c'est pour cela que toutes les cartes de navigation l'affichent. */
  followingManeuver: Maneuver | null;
  /** Distance restante JUSQU'A la prochaine manoeuvre, mesuree le long de la route et non a
   * vol d'oiseau : sur une route en courbe, la distance directe annoncait le virage trop tot. */
  distanceToNextManeuverM: number | null;
  /** Flux de position interpole : le compteur de vitesse s'y abonne lui-meme, pour qu'une
   * variation de vitesse ne re-rende pas tout le bandeau. */
  subscribeFix: (listener: FixListener) => () => void;
  remaining: { distanceM: number; durationS: number } | null;
  recalculating: boolean;
  lang: Language;
  onEnd: () => void;
  /** Ouvre la liste complete des etapes. Le geste attendu sur une carte de navigation est
   * de toucher le bandeau d'instruction — pas de chercher un bouton de plus. */
  onShowSteps: () => void;
  /** Vue d'ensemble façon Google Maps : dezoome sur tout le trajet restant (voir overviewBtn en
   * v83). Reste affiche en permanence, contrairement a "Recentrer" qui n'apparait que quand la
   * camera a quitte le suivi automatique. */
  onOverview: () => void;
  onRecenter: () => void;
  /** Guidage vocal. Il n'etait reglable que depuis la colonne de l'ecran principal, qui
   * disparait pendant la navigation : couper le son en route etait donc impossible sans
   * arreter le trajet. */
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  /** Appui LONG sur le haut-parleur : choisir la voix. Un appui court coupe le son — deux
   * gestes sur le meme bouton, parce que la colonne est deja pleine. */
  onChooseVoice: () => void;
  /** Ouvre la recherche SANS quitter le guidage (le detour). Elle n'etait joignable qu'a la
   * voix : un conducteur qui prefere taper — ou dont l'assistant ne comprend pas dans le bruit
   * — n'avait aucun moyen de chercher une station-service en route. */
  onSearch: () => void;
  /** Fausse quand la vue d'ensemble est ouverte ou que le conducteur a manuellement deplace la
   * carte — determine si "Recentrer" doit s'afficher. */
  following: boolean;
  colors: Palette;
  topInset: number;
  bottomInset: number;
  /** Telephone en paysage, sur un support de voiture : la consigne et le cadre du bas
   * deviennent une colonne a gauche, comme sur les cartes de navigation courantes, et la
   * largeur revient a la carte. En portrait, rien ne change. */
  landscape: boolean;
  /** Largeur de cette colonne, en points. La meme valeur fixe la marge gauche de la camera :
   * le vehicule est ainsi centre dans la carte VISIBLE, pas derriere la colonne. */
  cardWidth: number;
  leftInset: number;
  rightInset: number;
};

export const NavigationOverlay = memo(function NavigationOverlay({
  active,
  nextManeuver,
  followingManeuver,
  distanceToNextManeuverM,
  subscribeFix,
  remaining,
  recalculating,
  lang,
  onEnd,
  onShowSteps,
  onOverview,
  onRecenter,
  voiceEnabled,
  onToggleVoice,
  onChooseVoice,
  onSearch,
  following,
  colors,
  topInset,
  bottomInset,
  landscape,
  cardWidth,
  leftInset,
  rightInset,
}: Props) {
  const { t } = useTranslation();
  const now = useClock();
  /** Hauteur reelle du bandeau, mesuree : la languette « puis » doit s'accrocher juste en
   * dessous, et cette hauteur varie avec la longueur du nom de rue (une ou deux lignes). */
  const [bannerHeight, setBannerHeight] = useState(0);

  if (!active) return null;

  const arrived = !nextManeuver;
  const distanceToUpcoming = nextManeuver ? distanceToNextManeuverM : null;

  const eta = remaining ? new Date(Date.now() + remaining.durationS * 1000) : null;
  /** Haut du bandeau : colle au bord en portrait (il passe sous la barre d'etat), flottant
   * en paysage. La languette « puis » s'accroche dessous dans les deux cas. */
  const bannerTop = landscape ? topInset + CARD_MARGIN : 0;

  return (
    <>
      <Pressable
        onPress={onShowSteps}
        accessibilityRole="button"
        accessibilityLabel={t('nav.steps')}
        onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
        style={[
          landscape ? styles.topBannerLandscape : styles.topBanner,
          { backgroundColor: colors.accentDark },
          landscape
            ? { top: bannerTop, left: leftInset + CARD_MARGIN, width: cardWidth }
            : { paddingTop: topInset + spacing.md },
        ]}
      >
        {recalculating ? (
          <Text style={styles.recalcPill}>{t('nav.recalculating')}</Text>
        ) : arrived ? (
          <Text style={styles.instruction}>{t('nav.arrived')}</Text>
        ) : (
          <View style={styles.instructionRow}>
            <Text style={styles.arrow}>{maneuverArrow(nextManeuver.type)}</Text>
            <View style={styles.instructionTextWrap}>
              <View style={styles.distanceRow}>
                {distanceToUpcoming != null ? (
                  <Text style={styles.distanceToNext}>{formatDistance(distanceToUpcoming)}</Text>
                ) : null}
                {/* Pastille du numero de route, comme sur les panneaux : c'est « N12 » qui est
                    ecrit dehors, pas le nom complet de l'autoroute. */}
                {roadRef(nextManeuver) ? (
                  <View style={styles.shield}>
                    <Text style={styles.shieldText}>{roadRef(nextManeuver)}</Text>
                  </View>
                ) : null}
              </View>
              {/* Trois lignes et non deux, et la taille s'ajuste au besoin : « Gardez la gauche
                  pour rester sur Autoroute Alger–Tizi Ouzou » se terminait par des points de
                  suspension, ce qui coupait justement le nom de la voie a prendre. */}
              <Text
                style={[styles.instruction, { fontFamily: titleFontFor(lang) }]}
                numberOfLines={3}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {localizedInstruction(nextManeuver, lang)}
              </Text>
            </View>
          </View>
        )}

        {/* Heure courante, seule : l'heure d'ARRIVEE a rejoint le cadre du bas, sur la meme
            ligne que la distance. Le client demande l'horloge visible en permanence
            (chantier #22) — elle reste donc ici, ou rien ne la masque jamais. */}
        <View style={styles.clockRow}>
          <Text style={styles.clockItem}>🕐 {formatClock24(now)}</Text>
        </View>

        {/* Poignee discrete : sans elle, rien n'indique que le bandeau s'ouvre. */}
        <View style={styles.grip} />
      </Pressable>

      {/* « Puis » : la manoeuvre d'apres, en languette accrochee SOUS le bandeau et alignee a
          gauche, comme sur les cartes de navigation courantes — et non en rangee pleine
          largeur, qui donnait a la seconde consigne le meme poids visuel que la premiere.
          Elle n'apparait qu'a moins de 600 m : plus loin, elle n'apporte rien. */}
      {!arrived && followingManeuver && distanceToUpcoming != null && distanceToUpcoming < 600 ? (
        <View
          style={[styles.thenWrap, { top: bannerTop + bannerHeight, left: landscape ? leftInset + CARD_MARGIN : 0 }]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.thenTab,
              { backgroundColor: colors.accentDark },
              landscape ? { borderBottomLeftRadius: radius.md } : null,
            ]}
          >
            <Text style={styles.thenLabel}>{t('nav.then')}</Text>
            <Text style={styles.thenArrow}>{maneuverArrow(followingManeuver.type)}</Text>
          </View>
        </View>
      ) : null}

      {landscape ? (
        <SpeedBadge
          subscribe={subscribeFix}
          colors={colors}
          bottom={bottomInset + spacing.md}
          right={rightInset + spacing.md}
        />
      ) : (
        <SpeedBadge subscribe={subscribeFix} colors={colors} bottom={bottomInset + 100} />
      )}

      {/* Colonne de droite, comme sur les cartes de navigation courantes : les commandes de la
          conduite sont groupees a portee du pouce, en pastilles rondes, plutot que dispersees
          entre le cadre du bas et un bouton flottant. */}
      {/* En paysage la colonne remonte en haut a droite : a mi-hauteur, elle tomberait sur le
          compteur de vitesse, qui occupe le coin bas droit dans cette orientation. */}
      <View
        style={[styles.sideColumn, landscape ? { top: bannerTop, right: rightInset + spacing.md } : null]}
        pointerEvents="box-none"
      >
        {/* « Recentrer » n'apparait que quand la camera a quitte le suivi — sinon il ne
            ferait rien, et un bouton qui ne fait rien est pire qu'un bouton absent. */}
        {!following ? (
          <Pressable
            onPress={onRecenter}
            accessibilityRole="button"
            accessibilityLabel={t('nav.recenter')}
            style={[styles.roundBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={{ fontSize: 19, color: colors.accentText }}>🎯</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel={t('map.searchPlaceholder')}
          style={[styles.roundBtn, { backgroundColor: colors.surface }]}
        >
          <Text style={{ fontSize: 18, color: colors.text }}>🔍</Text>
        </Pressable>

        <Pressable
          onPress={onOverview}
          accessibilityRole="button"
          accessibilityLabel={t('nav.overview')}
          style={[styles.roundBtn, { backgroundColor: colors.surface }]}
        >
          <Text style={{ fontSize: 18, color: colors.text }}>⛶</Text>
        </Pressable>

        <Pressable
          onPress={onToggleVoice}
          onLongPress={onChooseVoice}
          accessibilityRole="button"
          accessibilityLabel={t('map.voiceGuidance')}
          accessibilityHint={t('voice.title')}
          style={[styles.roundBtn, { backgroundColor: colors.surface }]}
        >
          <Text style={{ fontSize: 18 }}>{voiceEnabled ? '🔊' : '🔇'}</Text>
        </Pressable>
      </View>

      {/* Cadre du bas, dans la disposition des cartes de navigation courantes : arreter a
          gauche, le temps restant en gros au centre, les etapes a droite. La duree est ce
          qu'on regarde le plus souvent — elle est donc au centre et en grand, et la distance
          l'accompagne sur la meme ligne que l'heure d'arrivee, plus discretement. */}
      <View
        style={[
          landscape ? styles.bottomBarLandscape : styles.bottomBar,
          { backgroundColor: colors.surface },
          landscape
            ? { left: leftInset + CARD_MARGIN, width: cardWidth, bottom: bottomInset + CARD_MARGIN }
            : { paddingBottom: bottomInset + spacing.md },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel={t('nav.stop')}
          style={[styles.bottomRound, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ fontSize: 19, color: colors.danger, fontWeight: '800' }}>✕</Text>
        </Pressable>

        <View style={styles.bottomCenter}>
          {remaining ? (
            <>
              <Text style={[styles.bigDuration, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatDuration(remaining.durationS)}
              </Text>
              <Text style={[styles.bottomSub, { color: colors.textMuted }]} numberOfLines={1}>
                {formatDistance(remaining.distanceM)}
                {eta ? ` · ${formatClock24(eta)}` : ''}
              </Text>
            </>
          ) : null}
        </View>

        <Pressable
          onPress={onShowSteps}
          accessibilityRole="button"
          accessibilityLabel={t('nav.steps')}
          style={[styles.bottomRound, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ fontSize: 17, color: colors.accent }}>⇄</Text>
        </Pressable>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  topBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  instructionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  arrow: { fontSize: 34, color: '#fff' },
  instructionTextWrap: { flex: 1 },
  distanceToNext: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '800' as const },
  instruction: { color: '#fff', fontSize: 21, lineHeight: 26 },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  shield: {
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  shieldText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  recalcPill: { color: '#fff', fontSize: 15, fontWeight: '700' as const, textAlign: 'center' },
  thenWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'flex-start' },
  thenTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    paddingVertical: 7,
    borderBottomRightRadius: radius.md,
  },
  thenLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '700' as const },
  thenArrow: { color: '#fff', fontSize: 18 },
  clockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  clockItem: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '700' as const },
  grip: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
    marginBottom: -spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  sideColumn: { position: 'absolute', right: spacing.md, top: '38%', gap: spacing.sm, alignItems: 'flex-end' },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  // Variantes paysage : cartes flottantes a gauche, coins arrondis de tous cotes.
  topBannerLandscape: {
    position: 'absolute',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderRadius: radius.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bottomBarLandscape: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bottomRound: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm, gap: 1 },
  bigDuration: { fontSize: 25, fontWeight: '800' as const, lineHeight: 30 },
  bottomSub: { fontSize: 13, fontWeight: '600' as const, fontVariant: ['tabular-nums'] },
});
