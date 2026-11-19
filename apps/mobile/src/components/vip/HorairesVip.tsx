import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMouvementReduit } from './mouvement';
import {
  estOuvertMaintenant,
  formatPlage,
  semaineDepuisAujourdhui,
  type Horaire,
} from '../../place/horaires';
import { radius, spacing, typography, type Palette } from '../../theme';

/**
 * HORAIRES EN TEMPS REEL — amelioration 4 de la synthese « Fiche VIP Premium ».
 *
 * « Ouvert » ou « Ferme », decide a l'instant ou l'on regarde, avec un point vert qui bat quand
 * c'est ouvert, et le jour en cours lisible sans rien deplier. Le client le decrit comme un
 * signal de confiance : savoir qu'un cabinet est ouvert MAINTENANT change le trajet qu'on
 * s'apprete a lancer.
 *
 * LA REGLE EST AILLEURS, ET C'EST VOULU. `estOuvertMaintenant` vit dans
 * src/place/horaires.ts, qui n'importe rien de React Native, et le verificateur la rejoue sur
 * des horaires reels — coupure de midi, fermeture apres minuit, jour sans plage. Ce fichier-ci
 * ne fait que de l'affichage : un badge vert qui s'affiche est rassurant meme quand il ment, et
 * c'est exactement pourquoi la decision ne doit pas etre prise dans un composant qu'on ne peut
 * tester qu'a l'oeil.
 *
 * LA LISTE EST REPLIEE PAR DEFAUT, sur le seul jour en cours. La maquette en montre trois
 * lignes, mais sept lignes de plus sur une fiche dont tout le reste a ete pense pour tenir sans
 * defilement repousserait le bouton « C'est parti » hors de l'ecran — le defaut que le client
 * avait lui-meme photographie en septembre. Qui veut la semaine appuie ; les autres ont deja la
 * reponse a la question qu'ils se posaient.
 *
 * L'HEURE EST RELUE TOUTES LES MINUTES. Sans cela, une fiche laissee ouverte a 19 h 59
 * afficherait encore « Ouvert » a 20 h 30. C'est un cas banal : on consulte, on hesite, on
 * revient.
 */

/** Le battement du document : AlphaAnimation 1f → .3f, 1 600 ms. */
const BATTEMENT_MS = 1_600;
const BATTEMENT_MIN = 0.3;
/** Relecture de l'heure. Une minute est la granularite des horaires eux-memes. */
const RAFRAICHISSEMENT_MS = 60_000;

/** Clefs de traduction des sept jours, dans l'ordre de `Date.getDay()` : 0 = dimanche. */
const JOURS_CLES = [
  'place.daySun',
  'place.dayMon',
  'place.dayTue',
  'place.dayWed',
  'place.dayThu',
  'place.dayFri',
  'place.daySat',
] as const;

export function HorairesVip({ horaires, colors }: { horaires: Horaire[]; colors: Palette }) {
  const { t } = useTranslation();
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [deplie, setDeplie] = useState(false);
  const battement = useRef(new Animated.Value(1)).current;
  const mouvementReduit = useMouvementReduit();

  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, []);

  const ouvert = estOuvertMaintenant(horaires, maintenant);

  useEffect(() => {
    /* Le point ne bat QUE quand c'est ouvert : un point rouge qui pulse ressemble a une alarme,
     * et une fiche fermee n'a rien d'urgent a dire. */
    if (!ouvert || mouvementReduit) {
      battement.setValue(1);
      return;
    }
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(battement, {
          toValue: BATTEMENT_MIN,
          duration: BATTEMENT_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(battement, {
          toValue: 1,
          duration: BATTEMENT_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [ouvert, mouvementReduit, battement]);

  const semaine = semaineDepuisAujourdhui(horaires, maintenant);
  const aujourdhui = semaine[0]!;
  const lignes = deplie ? semaine : semaine.slice(0, 1);

  const couleurEtat = ouvert ? colors.openGreen : colors.danger;
  const fondEtat = ouvert ? colors.openBg : colors.danger + '1a';

  return (
    <View style={[styles.cadre, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      <Pressable
        onPress={() => setDeplie((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: deplie }}
        accessibilityLabel={`${ouvert ? t('place.openNow') : t('place.closedNow')} — ${
          deplie ? t('place.hoursCollapse') : t('place.hoursExpand')
        }`}
        style={styles.entete}
      >
        <View style={[styles.pastilleEtat, { backgroundColor: fondEtat }]}>
          <Animated.View
            style={[styles.point, { backgroundColor: couleurEtat, opacity: battement }]}
          />
          <Text style={[styles.etatTexte, { color: couleurEtat }]}>
            {ouvert ? t('place.openNow') : t('place.closedNow')}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>{deplie ? '⌃' : '⌄'}</Text>
      </Pressable>

      {lignes.map((j) => (
        <View key={j.jour} style={styles.ligne}>
          <Text
            style={[
              styles.jour,
              { color: j.aujourdhui ? colors.text : colors.textMuted },
              j.aujourdhui ? styles.jourFort : null,
            ]}
            numberOfLines={1}
          >
            {j.aujourdhui ? `${t('place.today')} · ${t(JOURS_CLES[j.jour]!)}` : t(JOURS_CLES[j.jour]!)}
          </Text>
          <Text
            style={[
              styles.plages,
              { color: j.plages.length === 0 ? colors.textMuted : colors.text },
            ]}
            numberOfLines={2}
          >
            {j.plages.length === 0
              ? t('place.closedDay')
              : /* Les plages d'un meme jour sur une ligne, separees par une virgule :
                   « 08h00 – 12h00, 14h00 – 18h00 ». C'est ainsi que les commerces l'ecrivent
                   eux-memes sur leur rideau. */
                j.plages.map(formatPlage).filter(Boolean).join(', ')}
          </Text>
        </View>
      ))}

      {!deplie && aujourdhui.plages.length > 0 ? (
        <Text style={[typography.caption, styles.invite, { color: colors.textMuted }]}>
          {t('place.hoursExpand')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    gap: 4,
  },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastilleEtat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  point: { width: 8, height: 8, borderRadius: 4 },
  etatTexte: { fontSize: 13, fontWeight: '800' as const },
  chevron: { fontSize: 16, fontWeight: '700' as const, paddingHorizontal: 4 },

  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: 2 },
  jour: { flex: 1, fontSize: 12.5 },
  jourFort: { fontWeight: '800' as const },
  /* Chiffres a chasse fixe : sept lignes d'horaires alignees se parcourent d'un coup d'oeil,
   * sept lignes proportionnelles se relisent une par une. */
  plages: { fontSize: 12.5, fontVariant: ['tabular-nums'], textAlign: 'right' },
  invite: { marginTop: 2 },
});
