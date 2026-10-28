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

const VERT = '#0B5B2C';
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

export function RecalcToast({ visible, top }: { visible: boolean; top: number }) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="none">
      <View style={styles.pastille}>
        <Text style={styles.texte} numberOfLines={1}>
          {t('nav.recalculating')}
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
  texte: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' as const },
  points: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  point: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FFFFFF' },
});
