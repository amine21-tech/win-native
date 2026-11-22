import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { FlecheManoeuvre } from './FlecheManoeuvre';
import { distanceAnticipation, surGrandAxe } from '../navigation/grandAxe';
import { localizedInstruction, roadRef } from '../navigation/instructions';
import type { Maneuver } from '../navigation/routing';
import { formatDistance, type Language } from '../shared';
import { radius, spacing } from '../theme';

/**
 * LA CONSIGNE DE DIRECTION, DANS LE BANDEAU DU HAUT — correction du 1er novembre.
 *
 * TROISIEME POSITION, ET LA BONNE. La consigne vivait dans le bandeau depuis la v83. Le point
 * 16.A du 29 octobre l'a descendue en bas de l'ecran, avec une fleche de 80 points. La
 * correction P1 du 31 l'a remontee en haut, mais dans SON PROPRE CADRE, pose sous le bandeau.
 * Le client a essaye au volant et le dit sans detour : ce cadre vert gene toute la navigation.
 *
 * Il a raison, et l'erreur etait de ne lire P1 qu'a moitie. Deux cadres verts l'un sous
 * l'autre, c'est deux fois le meme objet : le regard doit choisir lequel lire, et pendant ce
 * temps il n'est pas sur la route. Ensemble ils mangeaient le tiers superieur de la carte,
 * c'est-a-dire exactement la portion qu'on regarde en conduisant — celle qui est DEVANT.
 *
 * La consigne n'est donc plus un panneau pose sous le bandeau : elle est DEDANS, avec l'heure
 * courante, la distance restante et l'heure d'arrivee. Un seul cadre, une seule lecture. C'est
 * ce que le client demande mot pour mot : << il doit etre integre au cadre du haut, il ne doit
 * pas etre separe >>.
 *
 * CE COMPOSANT N'A DONC PLUS DE POSITION NI DE FOND. Il ne se place plus lui-meme et ne porte
 * plus ni couleur, ni coins arrondis, ni ombre : il prend ceux du bandeau qui l'accueille, ce
 * qui est la difference entre etre integre et etre pose dessus. C'est aussi pour cela qu'il
 * reste un fichier a part plutot que de retourner dans NavigationOverlay : la consigne a sa
 * propre logique — deuxieme manoeuvre, ecusson de route, nom de rue — et elle a deja change de
 * place trois fois.
 *
 * CE QUE LES ALLERS-RETOURS ONT LAISSE DE BON : la fleche de 80 points, dessinee et non
 * empruntee a une police ; le nom de la rue ; la deuxieme consigne quand deux virages
 * s'enchainent. Ces trois-la venaient du point 16 et n'ont jamais eu de rapport avec la
 * position.
 *
 * LE NOM DE RUE EST LA NOUVEAUTE REELLE. L'ancien bandeau disait << Tournez a gauche >> ; il
 * dit maintenant << Tournez a gauche >> ET sur quelle rue. C'est ce qui permet de verifier
 * qu'on tourne au bon endroit quand deux rues se suivent a vingt metres — exactement le cas ou
 * une fleche seule ne suffit pas.
 *
 * LA DEUXIEME CONSIGNE, EN PLUS PETIT DESSOUS, n'apparait que quand elle est PROCHE. L'afficher
 * toujours ferait lire deux instructions a chaque instant, et la premiere y perdrait son
 * evidence ; ne jamais l'afficher laisserait le conducteur s'engager dans une rue sans savoir
 * qu'il en ressort trente metres plus loin.
 */

const TAILLE_FLECHE = 80;

/**
 * Au-dela, la manoeuvre suivante n'est plus << proche >> et n'a pas a etre annoncee.
 *
 * Trois cents metres : a 50 km/h c'est une vingtaine de secondes, le temps de faire la
 * premiere manoeuvre et d'aborder la seconde sans surprise.
 */
/**
 * LA FLECHE DU BANDEAU CLIGNOTE 500 M AVANT LA MANOEUVRE — point F.2 du 18 novembre.
 *
 * << La fleche doit clignoter 500 m avant chaque manoeuvre, UNIQUEMENT sur autoroute et route
 * nationale. La fleche qui clignote doit etre la BONNE (droite, gauche, etc.). >>
 *
 * CE N'EST PAS LA RANGEE DE VOIES, et c'est ce qui manquait. La rangee de tuiles clignotait
 * deja ; la grande fleche de la consigne, elle, restait fixe. Or c'est elle qu'on regarde —
 * elle fait quatre-vingts points, les tuiles en font trente-deux.
 *
 * MEMES VALEURS QUE LA RANGEE : de 1,0 a 0,2 en 500 ms, aller-retour, sans fin. Deux objets
 * qui clignotent cote a cote a des rythmes differents se disputeraient le regard.
 *
 * ET SEULEMENT SUR GRAND AXE, comme la rangee : en ville, les manoeuvres s'enchainent a chaque
 * carrefour et une fleche qui clignote en permanence cesse d'alerter.
 */
/**
 * CINQ CENTS METRES N'EST PLUS UNE CONSTANTE — point 6 du 22 novembre.
 *
 * << Les fleches clignotent 500 m avant meme sur une RN en ville. Anticipation trop precoce en
 * ville, confusion avec les autres carrefours. >> Le seuil vaut desormais 50 m en
 * agglomeration et 500 m ailleurs ; il se calcule dans `distanceAnticipation`, a partir de la
 * limite reglementaire du troncon. Le RYTHME du clignotement, lui, n'a pas bouge d'une
 * milliseconde — c'est la consigne du document : << uniquement le seuil de declenchement >>.
 */
const CLIGNOTEMENT_MS = 500;
const CLIGNOTEMENT_MIN = 0.2;

const SUIVANTE_PROCHE_M = 300;

type Props = {
  maneuver: Maneuver | null;
  /** Manoeuvre d'apres : affichee en petit si elle suit de pres. */
  suivante: Maneuver | null;
  distanceM: number | null;
  /** Distance entre la manoeuvre en cours et la suivante, pour decider de l'afficher. */
  ecartSuivanteM: number | null;
  lang: Language;
  arrived: boolean;
  /** Nom de la voie en cours, pour reconnaitre une nationale. Voir grandAxe. */
  nomVoie: string | null;
  /** Valhalla marque l'autoroute et la voie rapide ; la nationale se lit au nom. */
  surAutoroute: boolean;
  /**
   * Limite reglementaire du troncon en cours, en km/h — point 6 du 22 novembre.
   *
   * ELLE NE SERT PAS A L'AFFICHER ICI mais a savoir si l'on est EN VILLE : c'est le critere du
   * document (<< maxspeed <= 50 km/h >>), et cette limite est la seule source de la
   * reponse Valhalla qui le dise. `null` quand elle est inconnue — le seuil reste alors a
   * cinq cents metres. Voir `distanceAnticipation`.
   */
  limiteKmh?: number | null;
};

export function PanneauDirection({
  maneuver,
  suivante,
  distanceM,
  ecartSuivanteM,
  lang,
  arrived,
  nomVoie,
  surAutoroute,
  limiteKmh,
}: Props) {
  const { t } = useTranslation();

  /* L'ANIMATION TOURNE EN PERMANENCE ET SON OPACITE EST APPLIQUEE OU NON.
   *
   * CES DEUX HOOKS SONT DECLARES AVANT LE RETOUR DE L'ARRIVEE, ET C'EST LA TOUT LE SUJET.
   * Ils etaient apres, sous le commentaire qui disait qu'ils etaient avant. A l'arrivee le
   * composant executait deux hooks, puis a la manoeuvre suivante il en executait quatre :
   * React compte les hooks, en trouvait plus qu'au rendu precedent, et levait
   * << Rendered more hooks than during the previous render >>. L'exception demontait l'arbre
   * entier — ecran noir au volant, au moment ou le conducteur avait le plus besoin de sa
   * carte. Le 20 novembre, c'est ce qui est arrive sur le telephone de test.
   *
   * L'animation ne coute rien la ou elle est : elle tourne sur le fil natif, sans traverser
   * le pont JavaScript, et son opacite n'est appliquee que dans les cinq cents derniers
   * metres. La declarer toujours est donc gratuit ; la declarer conditionnellement etait
   * fatal. */
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

  /* L'ARRIVEE : le retour anticipe, pose APRES les hooks, jamais avant. */
  if (arrived || !maneuver) {
    return (
      <View style={styles.bloc} pointerEvents="none">
        <Text style={styles.arrivee}>🏁  {t('nav.arrived')}</Text>
      </View>
    );
  }

  const montrerSuivante =
    suivante != null && ecartSuivanteM != null && ecartSuivanteM <= SUIVANTE_PROCHE_M;

  /**
   * LES DEUX FLECHES CLIGNOTENT ENSEMBLE — point 1 du 21 novembre.
   *
   * << Les petites fleches clignotent EN MEME TEMPS que la grande. >>
   *
   * La condition est donc calculee UNE FOIS et partagee, au lieu d'etre recopiee. Deux copies
   * de la meme condition finissent par differer d'un chiffre — et deux fleches qui clignotent a
   * contretemps dans le meme bandeau se disputent le regard exactement quand il faut le poser
   * sur la route.
   */
  /* LE SEUIL SE CALCULE, IL N'EST PLUS ECRIT : 50 m en agglomeration, 500 m ailleurs. La
   * condition de GRAND AXE est inchangee — en ville hors nationale, la fleche ne clignote
   * toujours pas du tout. */
  const seuilM = distanceAnticipation(limiteKmh);
  const clignoter =
    distanceM != null && distanceM <= seuilM && surGrandAxe(surAutoroute, nomVoie);

  return (
    <View style={styles.bloc} pointerEvents="none">
      <View style={styles.ligne}>
        {/* ELLE NE CLIGNOTE QUE DANS LES DERNIERS METRES — cinquante en ville, cinq cents en
            rase campagne — ET SUR GRAND AXE.
            Ailleurs, l'opacite reste a 1 : la meme vue, sans animation visible. */}
        <Animated.View style={clignoter ? { opacity: clignote } : undefined}>
          <FlecheManoeuvre type={maneuver.type} size={TAILLE_FLECHE} />
        </Animated.View>

        <View style={styles.textes}>
          <View style={styles.distanceLigne}>
            {distanceM != null ? (
              <Text style={styles.distance}>{formatDistance(distanceM)}</Text>
            ) : null}
            {/* La pastille du numero de route, comme sur les panneaux : c'est « N12 » qui est
                ecrit dehors, pas le nom complet de l'autoroute. */}
            {roadRef(maneuver) ? (
              <View style={styles.ecusson}>
                <Text style={styles.ecussonTexte}>{roadRef(maneuver)}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.instruction} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
            {localizedInstruction(maneuver, lang)}
          </Text>

          {/* LE NOM DE RUE, quand Valhalla le connait. Il n'est pas toujours la — une bretelle
              d'autoroute n'a pas de nom —, et une ligne vide vaudrait mieux que rien du tout. */}
          {maneuver.streetName ? (
            <Text style={styles.rue} numberOfLines={1}>
              {maneuver.streetName}
            </Text>
          ) : null}
        </View>
      </View>

      {montrerSuivante ? (
        <View style={styles.suivante}>
          {/* LA MEME VALEUR D'ANIMATION que la grande fleche, et non une seconde boucle : c'est
              ce qui garantit qu'elles s'eteignent et se rallument sur le meme temps. */}
          <Animated.View style={clignoter ? { opacity: clignote } : undefined}>
            <FlecheManoeuvre type={suivante!.type} size={22} couleur="rgba(255,255,255,0.85)" />
          </Animated.View>
          <Text style={styles.suivanteTexte} numberOfLines={1}>
            {t('nav.then')} {localizedInstruction(suivante!, lang)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* NI POSITION, NI FOND, NI OMBRE : la consigne est DANS le bandeau et en prend la couleur.
   * Lui en redonner un recreerait le deuxieme cadre que le client vient de faire retirer. Le
   * bandeau fournit aussi les marges laterales, d'ou l'absence de padding horizontal ici. */
  bloc: { marginBottom: spacing.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  textes: { flex: 1, minWidth: 0 },

  distanceLigne: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  distance: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' as const },
  ecusson: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  ecussonTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },

  instruction: { color: '#FFFFFF', fontSize: 18, lineHeight: 23, marginTop: 2 },
  rue: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' as const, marginTop: 1 },

  suivante: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  suivanteTexte: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13 },

  arrivee: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' as const, textAlign: 'center' },
});
