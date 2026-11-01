import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  anniversaire,
  dansLesZones,
  DUREE_BANNIERE_MS,
  evenementParId,
  ordinal,
  resumerZones,
  wilayaLaPlusProche,
  type Alerte,
  type Language,
} from '../shared';
import { radius, spacing } from '../theme';

/**
 * LA BANNIERE DES ALERTES OFFICIELLES — cahier des charges du 1er novembre 2026.
 *
 * C'EST LA MEME BANNIERE QU'AVANT, ET C'EST VOULU : le client l'a demande en toutes lettres.
 * Le dessin, les marges, le halo qui respire, la case du pictogramme, la pastille d'appel — on
 * ne touche a rien. Le fichier garde meme son nom, pour que le changement se lise d'un coup
 * d'oeil dans l'historique.
 *
 * CE QUI CHANGE EST CE QUI LA DECLENCHE. Elle s'allumait toute seule : du 1er juin au
 * 30 septembre, et uniquement dans l'une des quatre zones forestieres ecrites en dur ici. Le
 * cahier des charges abolit ce declenchement — << activees ou desactivees a la main par le
 * fondateur, et plus de declenchement automatique par dates >>.
 *
 * Il a raison, et pour une raison qu'on ne voit qu'une fois ecrite : une alerte qui s'allume
 * toute seule ne peut pas s'eteindre quand elle n'a plus lieu d'etre. Un incendie n'attend pas
 * le 1er juin ; une annee seche commence en mai ; et l'Aid suit la lune, qu'aucun calendrier
 * gregorien ecrit dans une application ne saura trouver juste chaque annee.
 *
 * ELLE SERT MAINTENANT LES TROIS TYPES. Le rouge de la vigilance foret reste exactement ce
 * qu'il etait ; le bleu de la vigilance meteo et le vert a bordure doree des fetes suivent les
 * memes mesures, avec les couleurs du document.
 *
 * LES VALEURS SONT CELLES DU CAHIER DES CHARGES, AU CHIFFRE PRES, et plusieurs ont change de
 * quelques points : la case du pictogramme passe de 36 a 41, le titre de 12,5 a 14,5, la
 * pastille d'appel de 1 a 2 points de bordure. L'ancienne version avait ete relevee a l'oeil
 * sur une capture du site ; celle-ci est lue dans le document, qui donne les nombres.
 */

/* ------------------------------------------------------------------ */
/* Les trois habillages, tires du document                             */
/* ------------------------------------------------------------------ */

type Habillage = {
  fond: string;
  /** Teinte du halo qui respire derriere la carte. */
  halo: string;
  /** Bordure, seulement pour les fetes (2 points dores). */
  bordure?: string;
  /** Duree d'un cycle de respiration. Les vigilances clignotent, les fetes respirent. */
  cycleMs: number;
  /** Les fetes n'ont pas de bouton d'appel : le document l'interdit explicitement. */
  appel: boolean;
};

const HABILLAGES: Record<'fire' | 'weather' | 'event', Habillage> = {
  /* Rouge de la page 2. C'est deja la couleur de l'ombre de l'ancienne banniere. */
  fire: { fond: '#C8102E', halo: '#C8102E', cycleMs: 1_100, appel: true },
  /* Bleu de la page 3. */
  weather: { fond: '#0B5FA5', halo: '#0B5FA5', cycleMs: 1_100, appel: true },
  /* Vert fonce et or des pages 4 et 6. LA RESPIRATION EST LENTE — 2,4 s contre 1,1 : le
   * document demande un ton << digne et festif, sans clignotement agressif >>. Faire clignoter
   * un hommage aux martyrs comme une alerte d'incendie serait deplace. */
  event: { fond: '#0A5840', halo: '#D4AF6A', bordure: '#D4AF6A', cycleMs: 2_400, appel: false },
};

/** Pictogrammes du document : 🔥 foret, 🌧️/💨/🌪️ selon le phenomene, 🇩🇿 ou 🌙 selon la fete. */
function pictogramme(alerte: Alerte): string {
  if (alerte.type === 'fire') return '🔥';
  if (alerte.type === 'weather') {
    const premier = alerte.phenomena?.[0];
    return premier === 'wind' ? '💨' : premier === 'sand' ? '🌪️' : '🌧️';
  }
  return evenementParId(alerte.id ?? '')?.icone ?? '🇩🇿';
}

type Props = {
  top: number;
  /** Position de l'utilisateur : elle ne sert qu'a AJOUTER une ligne, jamais a cacher. */
  position: { lat: number; lon: number } | null;
  /** Marge droite : elle doit DEGAGER la colonne de boutons, que le bandeau chevauchait
   * (point 1 du client). Sur le site, le bandeau s'arrete a 64 px du bord pour la meme raison. */
  right: number;
  /** Les alertes actives, deja ordonnees foret puis meteo puis fete. */
  alertes: readonly Alerte[];
  lang: Language;
};

export function SeasonalBanner({ top, right, position, alertes, lang }: Props) {
  const { t } = useTranslation();

  /**
   * L'INDEX DE CELLE QU'ON MONTRE. Le document demande de les afficher << une a la fois :
   * foret, puis meteo, puis fete, 12 s chacune >>. Les empiler cacherait la carte entiere, et
   * les faire se chevaucher rendrait les trois illisibles.
   */
  const [index, setIndex] = useState(0);
  const [fermee, setFermee] = useState(false);

  useEffect(() => {
    if (fermee || alertes.length === 0 || index >= alertes.length) return;
    const id = setTimeout(() => setIndex((i) => i + 1), DUREE_BANNIERE_MS);
    return () => clearTimeout(id);
  }, [index, alertes.length, fermee]);

  const alerte = fermee ? null : alertes[index];
  const habillage = alerte ? HABILLAGES[alerte.type] : null;

  /* Halo pulsant, comme `@keyframes fireHalo` sur le site : le bandeau « respire » au lieu de
   * clignoter en tout-ou-rien, ce qui serait agressif pour les yeux au volant. L'animation joue
   * sur l'echelle et l'opacite d'un halo place DERRIERE le bandeau : ces deux proprietes
   * tournent sur le fil natif, donc sans faire travailler le fil JavaScript. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!habillage) return;
    const demi = habillage.cycleMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: demi, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: demi, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [habillage, pulse]);

  if (!alerte || !habillage) return null;

  return (
    /* UN TAP SUR LA CARTE LA FERME, comme le document le demande. `onPress` est sur la carte
     * entiere et non sur une croix : au volant, viser une croix de douze points est plus
     * dangereux que l'information qu'on cherche a retirer. */
    <Pressable
      onPress={() => setFermee(true)}
      style={[
        styles.banner,
        { top, right, backgroundColor: habillage.fond },
        habillage.bordure ? { borderWidth: 2, borderColor: habillage.bordure } : null,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            backgroundColor: habillage.halo,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
          },
        ]}
      />
      {/* Format COMPLET du site (`.season-fire`) : pictogramme dans sa case, titre, texte entier
          et pastille d'appel dessous. La version precedente tronquait le texte a deux lignes et
          serrait l'appel sur la meme ligne — le client l'a trouvee reduite. */}
      <View style={styles.iconBox}>
        <Text style={styles.icon}>{pictogramme(alerte)}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{titre(alerte, t, lang)}</Text>
        <Text style={styles.message}>{corps(alerte, t, lang)}</Text>

        {/* « 📍 Vous etes dans une zone concernee » : la SEULE difference entre un utilisateur
            dans la zone et un autre. Les wilayas nomment les zones, elles ne cachent rien —
            voir packages/shared/src/alertes.ts. */}
        {alerte.type === 'weather' && dansLesZones(wilayaLaPlusProche(position), alerte.wilayas ?? []) &&
        (alerte.wilayas?.length ?? 0) > 0 ? (
          <Text style={styles.zoneMoi}>📍 {t('alertes.inZone')}</Text>
        ) : null}

        {alerte.type !== 'event' && (alerte.wilayas?.length ?? 0) > 0 ? (
          <Text style={styles.zones}>
            {t('alertes.zones')} {resumerZones(alerte.wilayas ?? [])}
          </Text>
        ) : null}

        {habillage.appel ? (
          <Pressable onPress={() => void Linking.openURL('tel:14')} style={styles.callBtn}>
            <Text style={styles.callText}>📞 {t('seasonalAlert.fireCall')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Les textes                                                          */
/* ------------------------------------------------------------------ */

type Traduire = (cle: string, options?: Record<string, unknown>) => string;

/**
 * LE TEXTE REECRIT PAR LE FONDATEUR L'EMPORTE, s'il existe dans la langue affichee.
 *
 * Et s'il n'existe QUE dans une autre langue, on prend quand meme le texte standard de la
 * langue de l'utilisateur plutot que le message reecrit dans une langue qu'il ne lit pas. Un
 * avertissement en francais a quelqu'un qui a choisi l'arabe n'avertit personne.
 */
function reecrit(alerte: Alerte, lang: Language): string | null {
  const m = alerte.message?.[lang];
  return typeof m === 'string' && m.trim() !== '' ? m : null;
}

function titre(alerte: Alerte, t: Traduire, lang: Language): string {
  if (alerte.type === 'fire') return t('seasonalAlert.fireTitle');
  if (alerte.type === 'weather') return t('alertes.weatherTitle');
  const evenement = evenementParId(alerte.id ?? '');
  return evenement ? t(`alertes.event.${evenement.id}.title`) : t('alertes.weatherTitle');
}

function corps(alerte: Alerte, t: Traduire, lang: Language): string {
  const perso = reecrit(alerte, lang);
  if (perso) return perso;

  if (alerte.type === 'fire') return t('seasonalAlert.fireMessage');

  if (alerte.type === 'weather') {
    /* UNE PHRASE PAR PHENOMENE COCHE, dans l'ordre du document. Les reunir en une seule
     * phrase (<< pluies et vents >>) perdrait les consignes, qui different : on tient le
     * volant dans le vent, on allume ses feux dans le sable. */
    const phrases = (alerte.phenomena ?? []).map((p) => t(`alertes.phenomenon.${p}`));
    return phrases.join(' ');
  }

  const evenement = evenementParId(alerte.id ?? '');
  if (!evenement) return '';
  const n = anniversaire(evenement);
  /* << 72e anniversaire >> : le nombre est calcule, jamais ecrit dans la traduction — un
   * nombre ecrit serait juste un an, puis faux pour toujours, et personne ne le verrait. */
  return t(`alertes.event.${evenement.id}.body`, { n: n != null ? ordinal(n, lang) : '' });
}

const styles = StyleSheet.create({
  // Halo derriere le bandeau : deborde de 12 points de chaque cote et pulse doucement.
  halo: { position: 'absolute', left: -12, right: -12, top: -12, bottom: -12, borderRadius: 26 },
  // `.season-banner` : rayon 18, marge interieure 16, ombre diffuse.
  banner: {
    position: 'absolute',
    left: spacing.lg,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    zIndex: 50,
  },
  // `.sb-ic` : case de 41 points, coins de 12, fond blanc a 20 %.
  iconBox: {
    width: 41,
    height: 41,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontWeight: '800' as const, fontSize: 14.5, marginBottom: 2 },
  message: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  zoneMoi: { color: '#fff', fontWeight: '800' as const, fontSize: 12.5, marginTop: 5 },
  zones: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, marginTop: 3 },
  // `.sb-call` : pastille d'appel sous le texte, bordure blanche a 55 %, fond blanc a 14 %.
  callBtn: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  callText: { color: '#fff', fontWeight: '800' as const, fontSize: 12.5 },
});
