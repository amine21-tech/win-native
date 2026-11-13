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

/**
 * LES COULEURS SONT RELEVEES SUR LA MAQUETTE, au pixel — 13 novembre.
 *
 * Elles ne sont pas choisies : elles sont MESUREES. La maquette des neuf scenarios a ete
 * sondee, et ces quatre valeurs en sortent telles quelles. C'est la demande d'arsanne —
 * << le meme design, les memes couleurs, le meme emplacement >> — et c'est aussi la seule
 * facon de ne pas discuter d'une nuance de vert pendant trois versions.
 *
 * CE QUI A CHANGE PAR RAPPORT AU 11 NOVEMBRE :
 *
 *   le fond des autres voies  #0D6E4F -> #0B553C  (un vert plus sombre que le bandeau)
 *   leur fleche               #FFFFFF -> #85B0A6  (un vert pale, pas du blanc)
 *
 * LA SECONDE EST LA PLUS IMPORTANTE. Des fleches BLANCHES sur les voies a eviter les mettaient
 * au meme niveau de contraste que la voie recommandee, qui est blanche elle aussi : trois
 * taches claires, et l'oeil devait chercher laquelle clignotait. En vert pale elles reculent, et
 * la voie a prendre est la seule chose claire de la rangee.
 */
const FOND_AUTRE = '#0B553C';
const FLECHE_AUTRE = '#85B0A6';
const FOND_RECOMMANDE = '#FFFFFF';
/** La fleche de la voie recommandee : le vert du bandeau, sur fond blanc. */
const FLECHE_RECOMMANDEE = '#0D6E4F';

/**
 * LA PASTILLE DOREE DE LA VOIE RECOMMANDEE.
 *
 * Le sous-titre de la maquette la decrit en trois mots : << voie recommandee (clignote + dore) >>.
 * Elle manquait entierement — il n'y avait que le clignotement.
 *
 * A QUOI ELLE SERT, ET POURQUOI LE CLIGNOTEMENT NE SUFFIT PAS. Un clignotement ne se voit que
 * si on regarde au bon moment : vingt fois par minute, la voie recommandee est a vingt pour cent
 * d'opacite, c'est-a-dire presque effacee. Un conducteur qui jette un oeil a cet instant-la ne
 * voit aucune voie designee. La pastille, elle, ne bouge pas.
 *
 * Posee A CHEVAL SUR LE COIN, comme sur la maquette : a l'interieur elle se confondrait avec le
 * dessin, debordante elle se lit comme une etiquette collee — le meme principe que le badge
 * << Nouveau >> du menu de signalement.
 */
const OR_RECOMMANDEE = '#D4A017';
const PASTILLE = 9;

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
        /* SEUL LE FOND CLIGNOTE, PAS LA FLECHE — et il faut deux vues pour l'obtenir.
         *
         * Une premiere version posait l'opacite animee sur la case ELLE-MEME. En React Native
         * comme sur le web, l'opacite d'une vue s'applique a tous ses enfants : la fleche
         * palissait donc avec le fond et devenait illisible vingt fois par minute, c'est-a-dire
         * exactement ce que le clignotement est cense eviter. Le defaut est invisible a la
         * relecture — on lit << opacity sur le fond >>, et le fond est bien ce qu'on a ecrit.
         *
         * Le fond est donc une vue SOUS la fleche, en position absolue, et c'est elle qui
         * respire. La fleche, posee par-dessus, reste a pleine opacite en permanence. */
        return (
          <View key={i} style={styles.case}>
            {aPrendre ? (
              <Animated.View
                style={[
                  styles.fond,
                  { backgroundColor: FOND_RECOMMANDE, opacity: clignote },
                ]}
              />
            ) : (
              <View style={[styles.fond, { backgroundColor: FOND_AUTRE }]} />
            )}
            <FlecheVoie
              lane={lane}
              size={26}
              couleur={aPrendre ? FLECHE_RECOMMANDEE : FLECHE_AUTRE}
            />
            {/* LA PASTILLE DOREE, a cheval sur le coin haut-droit. Elle ne clignote PAS : c'est
                tout son interet, elle designe la voie meme quand le fond est efface. */}
            {aPrendre ? <View style={styles.pastille} /> : null}
          </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    /* PAS DE `overflow: hidden` ICI : la pastille doree deborde du coin, et le moindre
     * rognage la couperait en quart de rond. */
  },
  /* Le fond, SOUS la fleche : il couvre toute la case sans repeter ses dimensions, donc sans
   * risque qu'elles divergent un jour. */
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 6 },
  pastille: {
    position: 'absolute',
    top: -PASTILLE / 3,
    right: -PASTILLE / 3,
    width: PASTILLE,
    height: PASTILLE,
    borderRadius: PASTILLE / 2,
    backgroundColor: OR_RECOMMANDEE,
  },
});
