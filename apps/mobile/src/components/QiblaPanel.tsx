import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  compassLabel,
  DZ_CITIES,
  gregorianDate,
  HADITH_AR,
  HADITH_TRANSLATION,
  hijriDate,
  MECCA,
} from '../reports/qibla';
import { bearing, formatDistance, haversine, type Language } from '../shared';
import { QiblaCompass } from './QiblaCompass';
import { type Palette } from '../theme';

type Coords = { lat: number; lon: number };

type Props = {
  visible: boolean;
  onClose: () => void;
  position: Coords | null;
  /** Reçue mais volontairement inutilisée : cet écran garde ses propres couleurs de jour comme
   * de nuit, exactement comme `.qibla-box` en v83, qui n'est pas touchée par `body.night`. */
  colors: Palette;
};

/* ------------------------------------------------------------------------- */
/* Couleurs                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Reprises une a une de `.qibla-*` dans win-v83/index.html (lignes 372-402).
 *
 * Le panneau Qibla est le seul ecran de WIN a ne PAS utiliser la palette generale : il a
 * ses propres verts et ses deux ors. Il faut donc les ecrire ici, et surtout ne pas les
 * confondre — le site distingue l'or des FILETS (#d4af6a, bordures, lettres cardinales,
 * puces) de l'or des TEXTES (#e8c97a, titres et accents). Les fondre en un seul ton, ce que
 * faisait la version precedente de cet ecran, suffisait a le rendre reconnaissable.
 */
const GOLD_LINE = '#D4AF6A';
const GOLD_TEXT = '#E8C97A';
const CREAM = '#F3E9D2';
const TIP_TEXT = '#DCE8DF';
const NET_TEXT = '#BCD6C6';
const HADITH_AR_COLOR = '#F0E3C0';
const HADITH_TR_COLOR = '#CFE0D4';
const BOX_TOP = '#0F7A55';
const BOX_BOTTOM = '#0A4A36';
/** Lettres cardinales de la rose des vents. Le site les ecrit en toutes lettres francaises
 * quelle que soit la langue de l'interface (`.qibla-letter` en v83) — on ne traduit donc pas. */
const CARDINALS = ['N', 'E', 'S', 'O'] as const;

/** Largeur maximale de l'encadre (`.qibla-box{max-width:320px}`) et ses marges internes
 * (`padding:11px 13px`). */
const BOX_MAX_WIDTH = 320;
const BOX_PAD_H = 13;
const BOX_PAD_V = 11;
/** Part de la mesure brute dans le cap lisse — `_qiblaSmoothAngle(..., 0.18)` en v83. */
const HEADING_SMOOTHING = 0.18;
/** Intervalle minimal entre deux rafraichissements de l'aiguille, en ms (v83 : 80). */
const HEADING_FRAME_MS = 80;
/** En dessous de ce deplacement, on ne re-rend pas : l'aiguille n'a pas bouge pour l'oeil. */
const HEADING_DEADBAND_DEG = 0.25;

/** `.qibla-compass{width:92%;max-width:290px}` */
const COMPASS_MAX = 290;

/** Panneau Qibla : boussole vers la Kaaba, dates du jour, mode manuel hors-ligne (58 wilayas). */
export function QiblaPanel({ visible, onClose, position }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const { width: windowWidth } = useWindowDimensions();
  const [manual, setManual] = useState<(Coords & { name: string }) | null>(null);
  const [showCities, setShowCities] = useState(false);
  const [heading, setHeading] = useState(0);
  const [headingKnown, setHeadingKnown] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setManual(null);
    setShowCities(false);
    setHeadingKnown(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    /* Le magnetometre Android emet une vingtaine de mesures par seconde, et elles oscillent de
     * plusieurs degres telephone immobile. Trois precautions, reprises une a une de
     * `_qiblaApplyHeading` en v83 — le client compare justement avec cette version :
     *
     *   1. filtre passe-bas de poids 0,18 (et non 0,25 : plus la part de la mesure brute est
     *      faible, plus l'aiguille est calme) ;
     *   2. au plus un rafraichissement toutes les 80 ms, meme si le capteur parle plus vite —
     *      l'oeil ne distingue pas mieux, et vingt rendus par seconde faisaient trembler tout
     *      le panneau ;
     *   3. cap CUMULE, jamais ramene dans 0-360. Un cap remis dans l'intervalle fait passer
     *      l'aiguille de 359 a 1 degre, soit un tour complet a l'ecran a chaque passage par le
     *      nord. En cumulant les ecarts les plus courts, la rotation reste continue et
     *      l'animation de QiblaCompass peut la suivre sans jamais repartir en arriere.
     */
    let smoothed: number | null = null;
    let continuous = 0;
    let shownAt = 0;

    void Location.watchHeadingAsync((h) => {
      if (cancelled) return;
      const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (smoothed == null) {
        smoothed = raw;
        continuous = raw;
      } else {
        const delta = ((raw - smoothed + 540) % 360) - 180;
        smoothed = (smoothed + delta * HEADING_SMOOTHING + 360) % 360;
      }
      const now = Date.now();
      if (shownAt && now - shownAt < HEADING_FRAME_MS) return;
      shownAt = now;
      // Ecart le plus court entre le cap cumule et le cap lisse : c'est lui qu'on ajoute.
      const step = ((smoothed - continuous + 540) % 360) - 180;
      if (Math.abs(step) < HEADING_DEADBAND_DEG) return;
      continuous += step;
      setHeading(continuous);
      setHeadingKnown(true);
    }).then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [visible]);

  const here = manual ?? position;
  const bearingToMecca = here ? bearing(here.lat, here.lon, MECCA.lat, MECCA.lon) : null;
  const distance = here ? haversine(here.lat, here.lon, MECCA.lat, MECCA.lon) : null;
  const arrowRotation = bearingToMecca != null ? bearingToMecca - (headingKnown ? heading : 0) : 0;
  const dialRotation = headingKnown ? -heading : 0;
  // La traduction du hadith est masquee en arabe et en darija : le texte original EST deja
  // dans cette langue (v83, `qiblaHadithTr` masque pour ar/dz).
  const showTranslation = lang === 'fr' || lang === 'en';

  /* Diametre reel de la boussole : `.qibla-compass{width:92%;max-width:290px}`, mesure sur
   * la largeur interieure de l'encadre. Le dessin, lui, reste exprime dans le repere 0-100 du
   * site (voir QiblaCompass) : les proportions sont donc les memes sur n'importe quel ecran. */
  const boxWidth = Math.min(BOX_MAX_WIDTH, windowWidth - 40);
  const compassSize = Math.min(Math.round((boxWidth - BOX_PAD_H * 2) * 0.92), COMPASS_MAX);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.boxWrap, { maxWidth: BOX_MAX_WIDTH }]}>
          <LinearGradient colors={[BOX_TOP, BOX_BOTTOM]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.box}>
            {/* Le defilement ne marchait pas : l'encadre ne pouvait pas rapetisser (flexShrink
                valant zero par defaut), il gardait donc la hauteur de son contenu, la liste
                recevait une hauteur illimitee — rien a faire defiler — et le bas du panneau
                (rappel et « Choisir ma ville ») etait simplement coupe par le cadre parent.
                `flexShrink` sur l'encadre ET sur la liste les ramene dans les 84 % de hauteur
                d'ecran, et la liste retrouve de quoi defiler. */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
                <Text style={styles.closeGlyph}>✕</Text>
              </Pressable>

              {/* Encadre de dates en haut a gauche (#qiblaDates). Positionne en absolu comme
                  sur le site : c'est la marge haute du titre qui lui reserve la place. */}
              <View style={styles.dateBox}>
                <Text style={styles.dateGreg}>{gregorianDate(lang)}</Text>
                <Text style={styles.dateHijri}>{hijriDate(lang)}</Text>
              </View>

              <Text style={styles.title}>{t('qibla.title')}</Text>

              <View style={styles.compassWrap}>
                <QiblaCompass
                  size={compassSize}
                  arrowRotation={arrowRotation}
                  dialRotation={dialRotation}
                  gold={GOLD_LINE}
                  cardinals={CARDINALS}
                />
              </View>

              {/* Meme regle d'affichage que le site : des que la boussole repond, son message
                  REMPLACE le cap et la distance au lieu de s'y ajouter. Un cap en degres ne
                  sert qu'a celui qui doit s'orienter a la main, faute de capteur. */}
              {!here || bearingToMecca == null || distance == null ? (
                <Text style={styles.info}>{t('qibla.locating')}</Text>
              ) : headingKnown ? (
                <Text style={styles.info}>
                  <Text style={styles.infoBold}>{t('qibla.compassActiveBold')}</Text>
                  {t('qibla.compassActiveRest')}
                  {'\n'}
                  {t('qibla.compassFlat')}
                  {manual ? `\n${manual.name}` : ''}
                </Text>
              ) : (
                <Text style={styles.info}>
                  {t('qibla.compassUnavailable')}
                  {'\n\n'}
                  <Text style={styles.infoBold}>{Math.round(bearingToMecca)}°</Text> {t('qibla.fromNorth')} (
                  {compassLabel(bearingToMecca, lang)}){'\n'}
                  {t('qibla.distance')} : {formatDistance(distance)}
                  {manual ? `\n${manual.name}` : ''}
                </Text>
              )}

              {/* Conseils de calibrage (#qiblaTips) : sans eux, une fleche qui hesite passe
                  pour un bug alors qu'il suffit souvent d'eloigner un aimant. */}
              <View style={styles.tips}>
                <Text style={styles.tipsTitle}>{t('qibla.tipsTitle')}</Text>
                {['tip1', 'tip2', 'tip3', 'tip4'].map((k) => (
                  <View key={k} style={styles.tipRow}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipItem}>{t(`qibla.${k}`)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.manualWrap}>
                <Pressable onPress={() => setShowCities((s) => !s)} style={styles.manualBtn}>
                  <Text style={styles.manualBtnText}>📍 {t('qibla.chooseCity')}</Text>
                </Pressable>

                {showCities ? (
                  <View style={styles.cityList}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {DZ_CITIES.slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <Pressable
                            key={c.name}
                            onPress={() => {
                              setManual(c);
                              setShowCities(false);
                            }}
                            style={styles.cityRow}
                          >
                            <Text style={styles.cityRowText}>{c.name}</Text>
                          </Pressable>
                        ))}
                    </ScrollView>
                  </View>
                ) : null}
              </View>

              <Text style={styles.net}>{t('qibla.net')}</Text>

              <View style={styles.hadithBlock}>
                <Text style={styles.hadithIntro}>{t('qibla.hadithIntro')}</Text>
                <Text style={styles.hadithAr}>{HADITH_AR}</Text>
                {showTranslation ? (
                  <Text style={styles.hadithTr}>{HADITH_TRANSLATION[lang as 'fr' | 'en']}</Text>
                ) : null}
                <Text style={styles.hadithSrc}>{t('qibla.hadithSource')}</Text>
              </View>
            </ScrollView>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* Toutes les valeurs ci-dessous viennent de `.qibla-*` dans win-v83/index.html. Les tailles de
 * texte y sont volontairement petites (7 a 11 px) : ce sont celles du site, vu sur le meme
 * telephone, et les changer eloignerait l'application de ce que l'utilisateur connait. */
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  boxWrap: { width: '100%', maxHeight: '84%' },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  box: {
    flexShrink: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: GOLD_LINE,
    paddingHorizontal: BOX_PAD_H,
    paddingVertical: BOX_PAD_V,
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  close: {
    position: 'absolute',
    top: -3,
    right: -5,
    zIndex: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { color: GOLD_TEXT, fontSize: 16, lineHeight: 18 },

  // `#qiblaDates{position:absolute;top:9px;left:13px;right:50px}` — decale de la marge interne
  // de l'encadre, puisqu'il est ici pose dans la zone deja marginee.
  dateBox: {
    position: 'absolute',
    top: -2,
    left: 0,
    right: 37,
    zIndex: 4,
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,106,0.35)',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  dateGreg: { color: CREAM, fontSize: 10.5, fontWeight: '800' as const, lineHeight: 14 },
  dateHijri: { color: GOLD_TEXT, fontSize: 9.5, marginTop: 1, lineHeight: 13 },

  // `.qibla-box h3{margin:96px 0 16px;font-size:16px}` : la marge haute reserve la place de
  // l'encadre de dates, qui ne prend pas de hauteur puisqu'il est en absolu.
  title: {
    marginTop: 96,
    marginBottom: 16,
    fontSize: 16,
    color: GOLD_TEXT,
    letterSpacing: 0.3,
    textAlign: 'center',
    fontWeight: '700' as const,
  },

  // `.qibla-compass{margin:14px auto 10px}` — le dessin lui-meme est dans QiblaCompass.
  compassWrap: { marginTop: 14, marginBottom: 10, alignItems: 'center' },

  // `#qiblaInfo{margin:2px 0 0;font-size:11px;line-height:1.28}` ; `b` en or de texte.
  info: { color: CREAM, fontSize: 11, lineHeight: 14, textAlign: 'center', marginTop: 2 },
  infoBold: { fontWeight: '700' as const, color: GOLD_TEXT },

  tips: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,106,0.3)',
  },
  tipsTitle: { fontSize: 9.5, fontWeight: '800' as const, color: GOLD_TEXT, marginBottom: 3, letterSpacing: 0.2 },
  tipRow: { flexDirection: 'row', marginBottom: 2, opacity: 0.92 },
  tipBullet: { color: GOLD_LINE, fontWeight: '800' as const, fontSize: 9, lineHeight: 11.5, width: 11, paddingLeft: 3 },
  tipItem: { flex: 1, color: TIP_TEXT, fontSize: 9, lineHeight: 11.5 },

  manualWrap: { marginTop: 7 },
  manualBtn: {
    backgroundColor: 'rgba(212,175,106,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,106,0.5)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  manualBtnText: { color: CREAM, fontSize: 10.5, fontWeight: '700' as const, textAlign: 'center' },
  // `.qibla-city-select` : le site utilise un `<select>` natif, qui n'existe pas en React
  // Native. Meme cadre, meme fond, meme bordure — la liste se deroule sur place.
  cityList: {
    maxHeight: 180,
    marginTop: 6,
    backgroundColor: '#0A4A36',
    borderWidth: 1,
    borderColor: 'rgba(212,175,106,0.5)',
    borderRadius: 10,
  },
  cityRow: { paddingHorizontal: 10, paddingVertical: 7 },
  cityRowText: { color: CREAM, fontSize: 11 },

  net: { marginTop: 6, fontSize: 8, color: NET_TEXT, lineHeight: 10.5, opacity: 0.8, textAlign: 'center' },

  hadithBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,106,0.3)',
  },
  hadithIntro: { fontSize: 8, color: GOLD_TEXT, fontWeight: '700' as const, marginBottom: 4, opacity: 0.95 },
  hadithAr: {
    fontSize: 10.5,
    color: HADITH_AR_COLOR,
    lineHeight: 16.5,
    writingDirection: 'rtl',
    textAlign: 'right',
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  hadithTr: { fontSize: 8, color: HADITH_TR_COLOR, lineHeight: 10.5, fontStyle: 'italic', opacity: 0.92 },
  hadithSrc: { fontSize: 7, color: GOLD_LINE, marginTop: 2, opacity: 0.85 },
});
