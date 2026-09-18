import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { localizedInstruction, maneuverArrow, roadRef } from '../navigation/instructions';
import type { Maneuver } from '../navigation/routing';
import type { FixListener } from '../navigation/useLiveLocation';
import { formatDistance, formatDuration, type Language } from '../shared';
import { SpeedBadge } from './SpeedBadge';
import { SpeedLimitBadge } from './SpeedLimitBadge';
import { radius, spacing, titleFontFor, typography, type Palette } from '../theme';
import { formatClock24, useClock } from '../utils/clock';

/** Ecart entre les cartes flottantes et le bord de l'ecran, en paysage. */
const CARD_MARGIN = spacing.sm;
/** Ecart entre le bas du bandeau et le compteur de vitesse. */
const BADGE_GAP = 48;

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
  /** Retour a la fiche du lieu SANS couper le guidage (bouton « Retour » du cadre du bas en
   * v86). Le conducteur veut revoir l'adresse, le telephone du commerce, sa promotion — pas
   * arreter son trajet pour cela. */
  onBack: () => void;
  /** Limite reglementaire du troncon, affichee sous le compteur de vitesse. `null` = inconnue,
   * la pastille disparait alors (voir useSpeedLimit). */
  limitKmh: number | null;
  /** Hauteurs reelles du bandeau (bas du bandeau, depuis le haut de l'ecran) et du cadre du bas
   * (0 quand il est ferme). L'ecran de carte en a besoin pour caler la colonne des dix boutons
   * ENTRE les deux : le dernier bouton chevauchait « Fin » (point 20 du client). */
  onLayoutBounds: (bounds: { bannerBottom: number; bottomBarHeight: number }) => void;
  /* Le guidage vocal ne se regle plus depuis cet ecran : la colonne des dix boutons de
   * l'accueil — dont celui du son — reste affichee pendant tout le trajet. */
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
  onBack,
  limitKmh,
  onLayoutBounds,
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
  /** Cadre du bas ouvert ou ferme (point 21 : comme sur le site, une petite croix le ferme et
   * un bouton en bas a droite le rouvre). Il degage la carte quand on veut regarder autour. */
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);

  // Transmis a l'ecran de carte a chaque changement : c'est lui qui place la colonne de boutons.
  useEffect(() => {
    onLayoutBounds({
      bannerBottom: (landscape ? topInset + CARD_MARGIN : 0) + bannerHeight,
      bottomBarHeight: bottomOpen ? bottomBarHeight : 0,
    });
  }, [bannerHeight, bottomBarHeight, bottomOpen, landscape, topInset, onLayoutBounds]);

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
        {/* Heure d'arrivee estimee et distance restante, EN HAUT comme EN BAS : le client les
            veut lisibles sans avoir a baisser les yeux vers le cadre du bas, qui peut etre
            masque. L'horloge courante reste affichee en permanence (chantier #22). */}
        <View style={styles.clockRow}>
          <Text style={styles.clockItem}>🕐 {formatClock24(now)}</Text>
          {remaining ? (
            <Text style={[styles.clockItem, styles.clockRight]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {formatDistance(remaining.distanceM)}
              {eta ? ` · ${t('nav.etaLong')} ${formatClock24(eta)}` : ''}
            </Text>
          ) : null}
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

      {/* Compteur de vitesse et limite reglementaire, EN HAUT A GAUCHE et l'un sous l'autre,
          comme sur le site (`.speed-badge` puis `.limit-badge`). Ils etaient en bas, et un
          second compteur etait dessine par l'ecran de carte : d'ou la pastille en double.
          Ici, un seul endroit les affiche, et ils descendent juste sous le bandeau — dont la
          hauteur est MESUREE, pour ne jamais le chevaucher quelle que soit la consigne. */}
      {landscape ? (
        <>
          <SpeedBadge
            subscribe={subscribeFix}
            colors={colors}
            bottom={bottomInset + spacing.md}
            right={rightInset + spacing.md}
          />
          <SpeedLimitBadge
            limitKmh={limitKmh}
            subscribe={subscribeFix}
            bottom={bottomInset + spacing.md + 66}
            right={rightInset + spacing.md + 4}
          />
        </>
      ) : (
        <>
          {/* Nettement DETACHEES du bandeau vert (point 19) : la pastille le touchait. L'ecart
              de 48 points laisse aussi passer la languette « puis », accrochee sous le bandeau
              a gauche, qui fait environ 36 points de haut. */}
          <SpeedBadge
            subscribe={subscribeFix}
            colors={colors}
            top={bannerTop + bannerHeight + BADGE_GAP}
            left={spacing.md}
          />
          <SpeedLimitBadge
            limitKmh={limitKmh}
            subscribe={subscribeFix}
            top={bannerTop + bannerHeight + BADGE_GAP + 66}
            left={spacing.md + 4}
          />
          {/* Vue d'ensemble du trajet, sous les deux pastilles, comme sur le site. */}
          <Pressable
            onPress={onOverview}
            accessibilityRole="button"
            accessibilityLabel={t('nav.overview')}
            style={[
              styles.overviewBtn,
              { top: bannerTop + bannerHeight + BADGE_GAP + 66 + 62, backgroundColor: colors.surface, borderColor: colors.goldDeep },
            ]}
          >
            <Text style={{ fontSize: 17, color: colors.accentDark }}>⛶</Text>
          </Pressable>
        </>
      )}

      {/* Il n'y a plus de colonne de boutons propre a cet ecran : la colonne des DIX boutons
          de l'accueil reste desormais affichee pendant tout le trajet (demande du client), et
          une seconde colonne aurait fait doublon — c'est d'ailleurs ce doublon qui tronquait
          l'affichage. Les commandes du trajet vivent dans le cadre du bas ci-dessous. */}

      {/* Cadre du bas, dans la disposition des cartes de navigation courantes : arreter a
          gauche, le temps restant en gros au centre, les etapes a droite. La duree est ce
          qu'on regarde le plus souvent — elle est donc au centre et en grand, et la distance
          l'accompagne sur la meme ligne que l'heure d'arrivee, plus discretement. */}
      {/* « Recentrer » flottant (point 12) : des que la carte a ete deplacee ou zoomee a la
          main, il reste a l'ecran — meme cadre du bas ferme — pour revenir a tout moment au
          suivi du vehicule. Il se place au-dessus du cadre, jamais dessus. */}
      {!following ? (
        // Rangee pleine largeur et `pointerEvents="box-none"` : c'est la seule facon de CENTRER
        // un element en position absolue. Un `alignSelf: 'center'` seul le laissait colle a
        // gauche, par-dessus les pastilles de vitesse.
        <View
          pointerEvents="box-none"
          style={[styles.resumeRow, { bottom: (bottomOpen ? bottomBarHeight : bottomInset) + spacing.md }]}
        >
          <Pressable
            onPress={onRecenter}
            accessibilityRole="button"
            accessibilityLabel={t('nav.recenter')}
            style={[styles.resumePill, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.resumeText, { color: colors.accentText }]}>🎯 {t('nav.recenter')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Cadre ferme : un petit bouton en bas a droite le rouvre, comme `#navBottomReopenBtn`. */}
      {!bottomOpen ? (
        <Pressable
          onPress={() => setBottomOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('nav.showPanel')}
          style={[
            styles.reopenPill,
            { bottom: bottomInset + spacing.md, backgroundColor: colors.surface, borderColor: colors.goldDeep },
          ]}
        >
          <Text style={{ fontSize: 16, color: colors.accentDark, fontWeight: '800' }}>⌃</Text>
        </Pressable>
      ) : null}

      {bottomOpen ? (
      <View
        onLayout={(e) => setBottomBarHeight(Math.round(e.nativeEvent.layout.height))}
        style={[
          landscape ? styles.bottomBarLandscape : styles.bottomBar,
          { backgroundColor: colors.surface },
          landscape
            ? { left: leftInset + CARD_MARGIN, width: cardWidth, bottom: bottomInset + CARD_MARGIN }
            : { paddingBottom: bottomInset + spacing.md },
        ]}
        pointerEvents="box-none"
      >
        {/* Petite croix a cheval sur le bord superieur, comme sur le site : placee HORS des
            boutons, elle ne peut jamais etre touchee par erreur a la place de « Fin ». */}
        <Pressable
          onPress={() => setBottomOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('nav.hidePanel')}
          hitSlop={8}
          style={[styles.closeBar, { backgroundColor: colors.text, borderColor: colors.surface }]}
        >
          <Text style={[styles.closeBarGlyph, { color: colors.surface }]}>✕</Text>
        </Pressable>

        {/* Meme contenu que le cadre du bas de la version web (`#navBottom`) : duree et
            distance restantes a gauche, puis retour, recherche, recentrer, et « Fin ». Il n'y
            avait ici qu'une croix et une icone d'etapes. */}
        <Pressable
          onPress={onShowSteps}
          accessibilityRole="button"
          accessibilityLabel={t('nav.steps')}
          style={styles.bottomRemain}
        >
          {/* Trois lignes courtes plutot qu'une longue tronquee (« 491 km · arriv... ») :
              distance en grand, duree, puis heure d'arrivee — l'ordre du site. */}
          {remaining ? (
            <>
              <Text style={[styles.bigDuration, { color: colors.accentDark }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatDistance(remaining.distanceM)}
              </Text>
              <Text style={[styles.bottomSub, { color: colors.textMuted }]} numberOfLines={1}>
                {formatDuration(remaining.durationS)}
              </Text>
              {eta ? (
                <Text style={[styles.bottomEta, { color: colors.accentDark }]} numberOfLines={1}>
                  {t('nav.etaLong')} {formatClock24(eta)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.bottomSub, { color: colors.textMuted }]}>{t('nav.recalculating')}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('nav.back')}
          style={[styles.bottomRound, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ fontSize: 17, color: colors.text }}>↩</Text>
        </Pressable>

        <Pressable
          onPress={onSearch}
          accessibilityRole="button"
          accessibilityLabel={t('map.searchPlaceholder')}
          style={[styles.bottomRound, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ fontSize: 17, color: colors.text }}>🔍</Text>
        </Pressable>

        {/* « Recentrer » reste TOUJOURS la, actif ou non : le client l'a trouve absent, et un
            bouton qui apparait et disparait donne l'impression d'un defaut. Quand la camera
            suit deja, il remet simplement le suivi — geste sans effet visible, mais sans
            surprise non plus. Il est mis en avant des que la carte a ete deplacee a la main. */}
        <Pressable
          onPress={onRecenter}
          accessibilityRole="button"
          accessibilityLabel={t('nav.recenter')}
          style={[
            styles.bottomRound,
            { backgroundColor: following ? colors.surfaceAlt : colors.accent },
          ]}
        >
          <Text style={{ fontSize: 18, color: following ? colors.text : colors.accentText }}>🎯</Text>
        </Pressable>

        <Pressable
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel={t('nav.stop')}
          style={[styles.stopBtn, { backgroundColor: colors.danger }]}
        >
          <Text style={styles.stopLabel}>⏹ {t('nav.end')}</Text>
        </Pressable>
      </View>
      ) : null}
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
  // « 491 km · Arrivee estimee 16:25 » : la ligne la plus longue du bandeau. Elle se reduit
  // legerement plutot que d'etre coupee par des points de suspension.
  clockRight: { flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
  grip: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
    marginBottom: -spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.32)',
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
  // Cinq elements sur une ligne : les pastilles rapetissent et l'ecart est constant, pour
  // qu'aucune ne touche sa voisine meme sur un ecran de 360 points (regle generale du client :
  // jamais de contact entre deux elements).
  bottomRound: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  stopBtn: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  stopLabel: { color: '#fff', fontSize: 13.5, fontWeight: '800' as const },
  bottomEta: { fontSize: 12, fontWeight: '800' as const, fontVariant: ['tabular-nums'] },
  closeBar: {
    position: 'absolute',
    top: -13,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 9,
    zIndex: 5,
  },
  closeBarGlyph: { fontSize: 14, fontWeight: '800' as const, lineHeight: 16 },
  reopenPill: {
    position: 'absolute',
    right: spacing.md,
    width: 52,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  resumeRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  resumePill: {
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  resumeText: { fontSize: 14, fontWeight: '800' as const },
  overviewBtn: {
    position: 'absolute',
    left: spacing.md + 5,
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  bottomRemain: { flexShrink: 1, minWidth: 92, gap: 1 },
  bigDuration: { fontSize: 21, fontWeight: '800' as const, lineHeight: 25 },
  bottomSub: { fontSize: 13, fontWeight: '600' as const, fontVariant: ['tabular-nums'] },
});
