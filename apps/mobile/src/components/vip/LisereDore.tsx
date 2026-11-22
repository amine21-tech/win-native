import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useMouvementReduit } from './mouvement';
import { palette, vip } from '../../theme';

/**
 * LE LISERE DORE ANIME — amelioration 1 de la synthese « Fiche VIP Premium ».
 *
 * Un filet de trois points en haut de la carte, dans lequel un degrade dore glisse en boucle.
 * La synthese le decrit comme un `AnimationDrawable` de trois images, chaque image etant le
 * meme degrade decale de 120 points. C'est la façon Android de faire glisser une texture sans
 * animation continue — trois etapes de 300 ms, et l'oeil complete.
 *
 * ICI ON FAIT GLISSER LE DEGRADE LUI-MEME, et le resultat est meilleur, pas seulement plus
 * court a ecrire : trois images successives SAUTENT de 120 points, ce qui se voit sur un filet
 * aussi fin, alors qu'une translation continue coule. Surtout, elle tourne sur le fil graphique
 * (`useNativeDriver`) et ne coute donc rien au fil JavaScript — celui qui dessine la carte et
 * suit le GPS pendant la navigation. Trois images decodees et permutees vingt fois par minute,
 * elles, passent par lui.
 *
 * LES TEINTES VIENNENT DU POINT B DU CORRECTIF v2 — cinq au lieu de trois, du brun d'or au
 * jaune clair et retour. Seule la liste des arrets a change ; le mouvement, sa duree et son
 * arret au demontage sont ceux du 19 novembre.
 *
 * LE DEGRADE EST LARGE DE DEUX FOIS LA CARTE et translate d'exactement une largeur de carte :
 * c'est ce qui rend la boucle invisible. Avec une bande de la largeur de la carte, le retour a
 * zero ferait reapparaitre le bord gauche d'un coup, et l'on verrait un clignotement a chaque
 * cycle.
 */

/** Les trois temps de 300 ms de la synthese, bout a bout : un cycle complet. */
const CYCLE_MS = 900;

export function LisereDore({ hauteur = vip.goldStripeH }: { hauteur?: number }) {
  const [largeur, setLargeur] = useState(0);
  const glisse = useRef(new Animated.Value(0)).current;
  const mouvementReduit = useMouvementReduit();

  useEffect(() => {
    /* Tant qu'on ne connait pas la largeur, il n'y a rien a translater : lancer l'animation sur
     * zero la ferait tourner pour rien, et le premier rendu mesure est toujours le second. */
    if (largeur === 0 || mouvementReduit) return;
    glisse.setValue(0);
    const boucle = Animated.loop(
      Animated.timing(glisse, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    /* ARRETER LA BOUCLE AU DEMONTAGE. Une `Animated.loop` non arretee continue de tourner apres
     * la disparition du composant : la fiche se referme, le lisere n'existe plus, et le fil
     * graphique recalcule encore sa position. Sur une application de navigation ouverte une
     * heure, ce sont des dizaines de boucles orphelines. */
    return () => boucle.stop();
  }, [largeur, mouvementReduit, glisse]);

  const onLayout = (e: LayoutChangeEvent) => {
    const l = Math.round(e.nativeEvent.layout.width);
    if (l > 0 && l !== largeur) setLargeur(l);
  };

  const translateX = glisse.interpolate({ inputRange: [0, 1], outputRange: [-largeur, 0] });

  return (
    <View style={[styles.cadre, { height: hauteur }]} onLayout={onLayout} pointerEvents="none">
      {/* LE DEGRADE N'EST PAS RENDU TANT QU'ON N'A PAS MESURE.
       *
       * AU PREMIER RENDU, `largeur` vaut zero : le composant n'a pas encore ete mesure, et
       * c'est toujours le cas d'un composant qui vient d'apparaitre — donc de CHAQUE ligne de
       * resultat, a chaque frappe dans la barre de recherche.
       *
       * Un `LinearGradient` de largeur nulle construit cote Android un `android.graphics
       * .LinearGradient` dont les deux points sont confondus. Selon la version d'Android, cela
       * va du simple non-dessin a une exception NATIVE — qui ne produit pas un cadre rouge
       * mais la mort du processus, c'est-a-dire un ecran noir puis un redemarrage. C'est
       * exactement ce que le client a photographie le 19 novembre en cherchant un lieu.
       *
       * On ne perd rien a attendre : la mesure arrive au rendu suivant, soit quelques
       * millisecondes, et le lisere apparait avec la carte. */}
      {largeur > 0 ? (
      <Animated.View
        style={[
          styles.bande,
          { width: largeur * 2, height: hauteur },
          mouvementReduit ? null : { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          /* LES CINQ TEINTES DU POINT B DU CORRECTIF v2, ECRITES NEUF FOIS.
           *
           *   << Bandeau gradient en haut : #7A4D00 -> #C8880E -> #F0B429 -> #C8880E ->
           *   #7A4D00. >>
           *
           * Le motif demande compte cinq arrets. La bande, elle, est large de DEUX cartes et
           * glisse d'exactement une : il faut donc que le motif y tienne deux fois, soit neuf
           * arrets puisque les deux moities partagent celui du milieu. Ecrit cinq fois sur une
           * bande double, le meme degrade serait etire au point de n'etre plus qu'une lueur, et
           * le retour a zero se verrait.
           *
           * LE MOTIF EST SYMETRIQUE, ET C'EST CE QUI REND LA BOUCLE INVISIBLE : il commence et
           * finit sur le meme brun, donc le raccord entre les deux moities ne se lit pas comme
           * une couture. Le client ne l'a probablement pas choisi pour cela, mais c'est ce qui
           * permet de respecter sa suite a la lettre sans y ajouter de teinte de transition. */
          colors={[
            palette.light.gold700,
            palette.light.gold500,
            palette.light.gold300,
            palette.light.gold500,
            palette.light.gold700,
            palette.light.gold500,
            palette.light.gold300,
            palette.light.gold500,
            palette.light.gold700,
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* `overflow: hidden` est ce qui fait du cadre une fenetre : la bande double passe derriere,
   * et l'on n'en voit qu'une largeur a la fois. */
  cadre: { width: '100%', overflow: 'hidden' },
  bande: { position: 'absolute', left: 0, top: 0 },
});
