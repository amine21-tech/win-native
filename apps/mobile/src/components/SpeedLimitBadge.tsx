import { memo, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import type { FixListener } from '../navigation/useLiveLocation';

/**
 * Pastille de limite de vitesse reglementaire — transcription de `.limit-badge` (v83, v79 #7) :
 * disque blanc, gros anneau rouge, chiffre noir, « km/h » dessous. Elle clignote des que le
 * vehicule depasse la limite.
 *
 * Elle s'abonne elle-meme au flux de position, comme le compteur de vitesse : une variation de
 * vitesse ne doit re-rendre que cette pastille, jamais l'ecran de carte entier.
 */

const RED = '#C8102E';
/** Tolerance avant de signaler un depassement : le GPS surestime souvent de quelques km/h, et
 * une pastille qui clignote a 51 km/h en ville finit par etre ignoree. */
const OVER_TOLERANCE_KMH = 5;

type Props = {
  /** Limite en km/h, ou `null` quand elle est inconnue — la pastille disparait alors. */
  limitKmh: number | null;
  subscribe: (listener: FixListener) => () => void;
  /** Distance au bas de l'ecran, en points. */
  bottom: number;
  /** Cote gauche par defaut ; en paysage, la colonne de consignes occupe la gauche. */
  right?: number;
};

export const SpeedLimitBadge = memo(function SpeedLimitBadge({ limitKmh, subscribe, bottom, right }: Props) {
  const [over, setOver] = useState(false);
  const overRef = useRef(false);
  const limitRef = useRef(limitKmh);
  limitRef.current = limitKmh;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return subscribe((fix) => {
      const limit = limitRef.current;
      const next = limit != null && fix.speedMps * 3.6 > limit + OVER_TOLERANCE_KMH;
      if (overRef.current === next) return;
      overRef.current = next;
      setOver(next);
    });
  }, [subscribe]);

  useEffect(() => {
    if (!over) {
      flash.stopAnimation();
      flash.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [over, flash]);

  if (limitKmh == null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.badge,
        right != null ? { right } : styles.left,
        { bottom },
        // Le clignotement joue sur l'echelle et non sur la couleur : une animation de couleur
        // ne peut pas utiliser le moteur natif, et ferait travailler le fil JavaScript en pleine
        // navigation — exactement le fil qu'il faut menager.
        { transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
      ]}
    >
      <Text style={styles.value}>{limitKmh}</Text>
      <Text style={styles.unit}>km/h</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 5,
    borderColor: RED,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  left: { left: 16 },
  value: { fontSize: 19, fontWeight: '800', color: '#141816', lineHeight: 21 },
  unit: { fontSize: 7, fontWeight: '700', color: '#6B7570', marginTop: 1, letterSpacing: 0.2 },
});
