import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { FlecheVoie } from './FlecheVoie';
import { surGrandAxe } from '../navigation/grandAxe';
import type { Lane } from '../navigation/routing';

/**
 * Voies a prendre a l'approche d'une bifurcation (point 4 du client).
 *
 * « L'utilisateur ne sait pas quelle voie prendre » : sur l'autoroute Est-Ouest comme a
 * l'entree d'Alger, rater la bonne file coute plusieurs kilometres. Les cartes de navigation
 * courantes montrent les fleches peintes au sol, et eteignent celles qui ne menent pas la ou
 * l'on va.
 *
 * Trois etats, et non deux — c'est ce qui distingue cet affichage d'une simple liste de
 * fleches :
 *
 *   VERTE  la voie suit l'itineraire SANS changer de file. C'est celle ou se placer.
 *   BLANCHE la voie suit l'itineraire, mais il faudra encore se rabattre ensuite.
 *   GRISE  la voie ne mene pas la ou l'on va.
 *
 * Rien ne s'affiche quand la donnee n'existe pas : OpenStreetMap ne porte les marquages au sol
 * (`turn:lanes`) que sur une partie du reseau, surtout en Algerie. Une voie inventee serait
 * pire que pas de voie du tout.
 *
 * AUTOROUTE ET VOIE RAPIDE UNIQUEMENT depuis le 3 novembre, et au moins deux voies. La
 * POSITION, elle, ne change pas : le client demandait une barre en bas, mais son point 5 du
 * 27 octobre exigeait l'inverse — << integrees dans le bandeau vert EN HAUT, pas un widget
 * separe >>. On garde le bandeau, decision prise avec lui ; seules les conditions de
 * declenchement suivent le nouveau document.
 */

/** Distance d'apparition : au-dela, le conducteur ne peut encore rien faire de l'information. */
export const LANE_GUIDANCE_VISIBLE_M = 500;

/**
 * NOMBRE MINIMAL DE VOIES — correctif 1 du 3 novembre.
 *
 * Une seule voie peinte n'est pas un choix : elle ne dit pas ou se placer, elle dit seulement
 * ce qui est ecrit par terre. Le guidage ne sert que la ou il y a une decision a prendre.
 */
export const LANE_GUIDANCE_MIN = 2;

/**
 * LES NEUF FLECHES SONT DESSINEES, et la table de caracteres a disparu — correctif du
 * 8 novembre, point 4.
 *
 * Elle associait onze directions a six caracteres : ↩ ↰ ↖ ↱ ↗ ↑. << Tournez a gauche >> et
 * << serrez franchement a gauche >> partageaient donc le MEME signe, alors que sur une
 * bifurcation d'autoroute ils menent a deux routes differentes. Voir FlecheVoie.tsx pour les
 * neuf traces et pour la raison technique — un caractere absent de la police s'affiche en
 * carre vide.
 */

/**
 * LE CLIGNOTEMENT DE LA VOIE RECOMMANDEE : de 1,0 a 0,2 en 500 ms, aller-retour, sans fin.
 * Valeurs du document.
 *
 * C'est deux fois plus rapide que la respiration de la fleche de position (1200 ms), et c'est
 * voulu : l'une signale que le guidage est vivant, l'autre qu'il y a une DECISION a prendre
 * dans les trois cents metres. Un clignotement lent se regarde ; un clignotement vif se
 * remarque.
 */
const CLIGNOTEMENT_MS = 500;
const CLIGNOTEMENT_MIN = 0.2;

/** Fond des voies a eviter : le vert fonce du document. Elles restent VISIBLES — les effacer
 *  empecherait de compter les files et de savoir laquelle est la bonne. */
const FOND_AUTRE = '#0D6E4F';
const FOND_RECOMMANDE = '#FFFFFF';

/**
 * LES VOIES SONT DESSINEES DANS LE BANDEAU VERT, pas sous lui (point 5 du client, 27 octobre :
 * « integrees dans le bandeau vert de navigation EN HAUT — pas un widget separe »).
 *
 * Elles etaient accrochees juste en dessous, dans leur propre carte blanche a ombre portee. De
 * pres cela se defend ; au volant, cela faisait un second objet a regarder, et la consigne —
 * « serrez a gauche » — se trouvait separee des fleches qui la montrent. Les reunir rend la
 * phrase et le dessin solidaires.
 *
 * Le code couleur devient celui du client, et il n'a plus que DEUX etats au lieu de trois : la
 * voie a prendre en BLANC opaque, les autres dans un vert clair a 40 %. Sur un aplat vert, la
 * nuance « suit l'itineraire mais il faudra se rabattre » ne se lisait plus — mieux vaut deux
 * etats nets qu'une troisieme teinte que personne ne distingue a 110 km/h.
 */
export function LaneGuidance({
  lanes,
  distanceM,
  surAutoroute,
  nomVoie,
}: {
  lanes: Lane[];
  /** Distance restante jusqu'a la bifurcation, ou `null` si elle est inconnue. */
  distanceM: number | null;
  /** La manoeuvre se fait-elle sur une autoroute ou une voie rapide ? */
  surAutoroute: boolean;
  /** Nom de la voie, seul moyen de reconnaitre une NATIONALE : voir grandAxe.ts. */
  nomVoie?: string | null;
}) {
  /* LE CLIGNOTEMENT TOURNE MEME QUAND RIEN N'EST AFFICHE, et c'est une contrainte de React et
   * non un choix : un hook ne peut pas etre appele apres un `return`. L'animation est native
   * et ne touche pas au fil JavaScript — la faire tourner pour rien ne coute rien. */
  const clignote = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(clignote, {
          toValue: CLIGNOTEMENT_MIN,
          duration: CLIGNOTEMENT_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(clignote, {
          toValue: 1,
          duration: CLIGNOTEMENT_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [clignote]);

  /* AUTOROUTE ET VOIE RAPIDE UNIQUEMENT, et au moins deux voies — correctif 1 du 3 novembre.
   *
   * << Elle NE s'active PAS sur les virages normaux en ville, les carrefours classiques, les
   * ronds-points, ni sur une route a voie unique. >>
   *
   * Le client a raison, et pour une raison qu'on ne voit qu'au volant : en ville, les voies
   * changent a chaque carrefour et l'affichage clignoterait d'un feu a l'autre sans jamais
   * rien apprendre. Rater une file en ville coute un tour du pate de maisons ; la rater avant
   * une sortie d'autoroute coute dix kilometres. C'est la que l'information vaut. */
  /* AUTOROUTE, VOIE RAPIDE *ET NATIONALE* depuis le 8 novembre. Valhalla ne marque pas les
   * nationales taguees `primary` : on les reconnait a leur nom — << RN 12 >>, << N5 >>. Voir
   * grandAxe.ts. */
  if (!surGrandAxe(surAutoroute, nomVoie)) return null;
  if (lanes.length < LANE_GUIDANCE_MIN || distanceM == null || distanceM > LANE_GUIDANCE_VISIBLE_M) {
    return null;
  }

  return (
    <View style={styles.row} pointerEvents="none">
      {lanes.map((lane, i) => {
        /* `active` = la voie ou l'on est deja bien place ; `valid` = elle mene quand meme la ou
         * l'on va. Les deux comptent comme « a prendre » pour l'affichage. */
        const aPrendre = lane.active !== 0 || lane.valid !== 0;
        /* LA CASE RECOMMANDEE EST UN FOND BLANC QUI CLIGNOTE, les autres un vert fonce fixe —
         * et c'est le fond qui porte l'etat, pas la fleche. Faire clignoter la FLECHE la
         * ferait disparaitre la moitie du temps ; faire clignoter le fond la laisse lisible
         * en permanence tout en attirant l'oeil. */
        return (
          <Animated.View
            key={i}
            style={[
              styles.case,
              aPrendre
                ? { backgroundColor: FOND_RECOMMANDE, opacity: clignote }
                : { backgroundColor: FOND_AUTRE },
            ]}
          >
            <FlecheVoie lane={lane} size={26} couleur={aPrendre ? FOND_AUTRE : '#FFFFFF'} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Une simple rangee, posee dans le bandeau : ni carte, ni bordure, ni ombre. Elle fait
  // partie du bandeau, elle ne se pose plus dessus.
  row: { flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 4 },
  /* Chaque voie dans sa case, comme le montre la maquette : les fleches etaient posees cote a
   * cote sans fond, et sur l'aplat vert du bandeau on ne voyait plus ou s'arretait une file et
   * ou commencait la suivante. */
  case: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
