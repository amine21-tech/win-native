import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../theme';

/**
 * RECALCUL EN COURS — pastille verte et trois points pulsants (option C du client, 28 octobre).
 *
 * POURQUOI UNE PASTILLE PLUTOT QUE REPEINDRE LE BANDEAU. Le bandeau de consigne passait en
 * orange pendant le recalcul : la consigne disparaissait, remplacee par « Recalcul en cours ».
 * Pendant les deux secondes du calcul, le conducteur n'avait donc plus AUCUNE indication — ni
 * l'ancienne, devenue douteuse, ni la nouvelle, pas encore prete. Sur une bretelle, deux
 * secondes sans rien a l'ecran est exactement le moment ou l'on a le plus besoin de quelque
 * chose.
 *
 * La pastille se pose PAR-DESSUS sans rien effacer : la consigne reste lisible, et les trois
 * points disent que l'application travaille. C'est ce que montre la maquette, et c'est aussi ce
 * qui perd le moins d'information.
 *
 * LES POINTS PULSENT EN DECALE, pas ensemble. Trois points qui clignotent a l'unisson se lisent
 * comme un avertissement ; decales, ils se lisent comme une attente — ce qui est exactement ce
 * dont il s'agit.
 */

/* VERT #0D6E4F A 80 % D'OPACITE — valeurs du correctif du 8 novembre. La pastille etait en
 * #0B5B2C opaque. Le document demande explicitement << fond #0D6E4F a 80 % opacite >> et
 * << NE PAS bloquer la carte >> : a 80 %, la route se devine sous la pastille, ce qui change
 * la facon dont on la lit — un message pose SUR la carte plutot qu'un morceau d'interface qui
 * en prend la place. */
const VERT = 'rgba(13, 110, 79, 0.8)';
const DUREE_MS = 480;
const DECALAGE_MS = 160;

function Point({ retard }: { retard: number }) {
  const valeur = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const cycle = Animated.sequence([
      Animated.timing(valeur, { toValue: 1, duration: DUREE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(valeur, { toValue: 0.3, duration: DUREE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]);
    const boucle = Animated.loop(cycle);
    const minuteur = setTimeout(() => boucle.start(), retard);
    return () => {
      clearTimeout(minuteur);
      boucle.stop();
    };
  }, [retard, valeur]);

  /* `useNativeDriver` : l'animation tourne sur le fil d'affichage, pas sur celui du
   * JavaScript. Pendant un recalcul, ce dernier est occupe a decoder un itineraire de
   * plusieurs milliers de points — une animation qui en dependrait se figerait precisement
   * quand elle doit montrer que l'application travaille. */
  return <Animated.View style={[styles.point, { opacity: valeur, transform: [{ scale: valeur }] }]} />;
}

export function RecalcToast({
  visible,
  lent,
  bottom,
}: {
  visible: boolean;
  /** Le calcul depasse trois secondes : presque toujours le reseau (point 15.A du client). */
  lent?: boolean;
  /** Distance au bas de l'ecran, en points. Calculee par l'appelant pour passer AU-DESSUS du
   * cadre du bas quand il est ouvert. */
  bottom: number;
}) {
  const { t } = useTranslation();
  if (!visible) return null;

  /* ELLE EST PASSEE EN BAS DE L'ECRAN — correctif du 8 novembre, << bandeau vert translucide
   * EN BAS de l'ecran, carte visible a 100 % >>.
   *
   * Elle etait accrochee sous le bandeau de consigne, en haut. Ce n'etait pas absurde — on la
   * voyait a l'endroit meme ou la consigne devenait douteuse — mais cela encombrait le tiers
   * superieur de la carte, celui qu'on regarde en conduisant, et c'est le reproche que le
   * client fait depuis trois documents a tout ce qui s'empile en haut.
   *
   * LA DUREE RESTE CELLE DU CALCUL, et non la seconde du document. Elle disparait quand le
   * nouvel itineraire est pret : c'est la seule regle qui ne mente jamais. Une pastille qui
   * s'effacerait au bout d'une seconde alors que le calcul dure encore laisserait le
   * conducteur devant une consigne perimee sans rien lui dire — et un recalcul Valhalla tient
   * presque toujours dans cette seconde, si bien que la difference ne se voit que les fois ou
   * elle compte. */
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="none">
      {/* LA PASTILLE CHANGE DE MOT, PAS DE FORME. Passer de l'orange au rouge, ou grossir,
          ferait croire a une panne : le calcul continue, et il aboutit presque toujours. Seul
          le texte dit ce qui se passe, et les trois points continuent de tourner. */}
      <View style={[styles.pastille, lent ? styles.pastilleLente : null]}>
        <Text style={styles.texte} numberOfLines={1}>
          {t(lent ? 'nav.slowConnection' : 'nav.recalculating')}
        </Text>
        <View style={styles.points}>
          <Point retard={0} />
          <Point retard={DECALAGE_MS} />
          <Point retard={DECALAGE_MS * 2} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pastille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: VERT,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  /* Un vert plus sombre, et rien d'autre : assez pour marquer que quelque chose a change,
   * trop peu pour alarmer un conducteur qui n'a rien a faire de cette information sinon
   * patienter. */
  pastilleLente: { backgroundColor: '#07401F' },
  texte: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' as const },
  points: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  point: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FFFFFF' },
});
