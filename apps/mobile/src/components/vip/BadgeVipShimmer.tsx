import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useMouvementReduit } from './mouvement';
import { palette, radius, spacing } from '../../theme';

/**
 * LE BADGE VIP A BRILLANCE — amelioration 3 de la synthese « Fiche VIP Premium ».
 *
 * Un reflet blanc translucide, incline, traverse le badge de gauche a droite, en boucle. Le
 * client compare l'effet aux cartes bancaires Premium et aux badges Apple, et il a raison sur
 * le fond : c'est le seul ornement qui dit « ceci a ete paye » sans ecrire un mot de plus.
 *
 * POURQUOI PAS ShimmerFrameLayout, QUE LA SYNTHESE RECOMMANDE. C'est une bibliotheque Android
 * native (`com.facebook.shimmer`), en XML, pour des `View` Android. WIN est ecrit en React
 * Native : l'ajouter supposerait un module natif a ecrire et a maintenir pour un rectangle
 * blanc qui se deplace. On prend donc l'option B du document — l'animation a la main — et l'on
 * en garde les valeurs exactes : incline a 20°, blanc a 0,4 d'opacite, cycle de 2 800 ms.
 *
 * LE CYCLE SE DECOMPOSE EN 1 200 ms DE PASSAGE ET 1 600 ms DE PAUSE, comme le `startDelay` de
 * la synthese. La pause n'est pas une economie : un reflet qui balaie sans arret se lit comme un
 * chargement en cours, pas comme un eclat. C'est l'intervalle entre deux passages qui fait que
 * l'oeil percoit du metal plutot qu'une barre de progression.
 */

const PASSAGE_MS = 1_200;
const CYCLE_MS = 2_800;
/** L'inclinaison du document. Posee sur un badge de trente points de haut, elle suffit. */
const INCLINAISON = '20deg';
/** `shimmer_highlight_alpha` de la synthese. */
const ECLAT_OPACITE = 0.4;

type Props = {
  /** Le texte du badge. Fourni par l'appelant pour rester traduit — jamais ecrit en dur ici. */
  libelle: string;
  /** Version compacte, pour une ligne de resultat de recherche. */
  compact?: boolean;
};

export function BadgeVipShimmer({ libelle, compact = false }: Props) {
  const [largeur, setLargeur] = useState(0);
  const glisse = useRef(new Animated.Value(0)).current;
  const mouvementReduit = useMouvementReduit();

  useEffect(() => {
    if (largeur === 0 || mouvementReduit) return;
    glisse.setValue(0);
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(glisse, {
          toValue: 1,
          duration: PASSAGE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        /* La pause est une animation vers la MEME valeur : c'est la façon d'attendre dans une
         * sequence sans bloquer quoi que ce soit, et elle reste sur le fil graphique. */
        Animated.timing(glisse, {
          toValue: 1,
          duration: CYCLE_MS - PASSAGE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [largeur, mouvementReduit, glisse]);

  const onLayout = (e: LayoutChangeEvent) => {
    const l = Math.round(e.nativeEvent.layout.width);
    if (l > 0 && l !== largeur) setLargeur(l);
  };

  /* Le reflet part HORS du badge a gauche et sort HORS a droite : sinon il apparait et
   * disparait au milieu, et l'on voit un rectangle qui s'allume au lieu d'un reflet qui passe.
   * Le facteur 1,5 est celui de la synthese. */
  const translateX = glisse.interpolate({
    inputRange: [0, 1],
    outputRange: [-largeur, largeur * 1.5],
  });

  const eclatLargeur = Math.max(28, largeur * 0.34);

  return (
    <View
      style={[styles.badge, compact ? styles.badgeCompact : null]}
      onLayout={onLayout}
      accessibilityRole="text"
      accessibilityLabel={libelle}
    >
      {/* Le fond dore du document : bg_badge_gold, du gold500 au gold300.
       *
       * IL N'EST POSE QU'UNE FOIS LE BADGE MESURE — meme raison que dans LisereDore : un
       * degrade de taille nulle peut lever une exception NATIVE sur Android, qui tue le
       * processus au lieu de produire une erreur rattrapable. En attendant, le badge porte une
       * couleur pleine, et personne ne voit la difference sur une frame. */}
      {largeur > 0 ? (
        <LinearGradient
          colors={[palette.light.gold500, palette.light.gold300]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {largeur > 0 && !mouvementReduit ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.eclat,
            {
              width: eclatLargeur,
              transform: [{ translateX }, { rotate: INCLINAISON }],
            },
          ]}
        >
          {/* Un degrade et non un rectangle plein : un bord net se lit comme une barre blanche
              posee sur le badge. Le reflet doit avoir des bords fondus pour passer pour de la
              lumiere. */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', `rgba(255,255,255,${ECLAT_OPACITE})`, 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}

      <Text style={[styles.texte, compact ? styles.texteCompact : null]} numberOfLines={1}>
        {libelle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    /* La couleur pleine sous le degrade : elle sert pendant la frame ou le badge n'est pas
     * encore mesure, et elle evite un rectangle transparent si le degrade echouait. */
    backgroundColor: palette.light.gold500,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  badgeCompact: { paddingHorizontal: spacing.sm, paddingVertical: 2 },
  /* Plus haut que le badge et incline : une bande droite de la hauteur exacte laisserait deux
   * coins vides une fois tournee de 20 degres. */
  eclat: { position: 'absolute', top: -14, bottom: -14, left: 0 },
  /* Blanc sur or sature : le contraste tient, et c'est la couleur du document. L'ombre portee
   * sombre protege la lisibilite a l'instant ou le reflet blanc passe DERRIERE le texte. */
  texte: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(90,60,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  texteCompact: { fontSize: 10.5 },
});
