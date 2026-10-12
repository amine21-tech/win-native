import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Fleche de position pendant le guidage.
 *
 * Elle remplace l'avion en papier dore de la v86 : le client la decrit comme « un design
 * depasse » et demande le reperage des cartes de navigation d'aujourd'hui — un triangle plein,
 * sans tige, de la couleur de l'itineraire, pose sur un halo lumineux qui respire.
 *
 * La couleur n'est pas figee : elle suit celle du trace, donc le vert WIN de jour et le
 * turquoise de nuit. Un vert fonce sur un fond sombre disparaitrait — c'est deja la raison
 * d'etre des deux palettes de l'itineraire.
 *
 * Elle ne tourne pas : c'est la carte qui pivote pour suivre le cap (la camera aligne le nord
 * sur la direction suivie). La fleche reste donc pointee vers le haut de l'ecran.
 */

/** Repere de dessin. Seule `size` fixe l'echelle reelle. */
const BOX = 128;
const CX = BOX / 2;
/** Pointe, base et creux arriere : un triangle dont le bas est legerement rentre, ce qui lui
 * donne sa direction d'un coup d'oeil la ou un triangle plat parait pose au hasard. */
const TIP_Y = 16;
const BASE_Y = 108;
const HALF_WIDTH = 40;
const NOTCH_Y = 88;

const PATH = [
  `M ${CX} ${TIP_Y}`,
  `L ${CX + HALF_WIDTH} ${BASE_Y}`,
  `L ${CX} ${NOTCH_Y}`,
  `L ${CX - HALF_WIDTH} ${BASE_Y}`,
  'Z',
].join(' ');

/** Duree d'une respiration du halo. Assez lent pour ne pas accrocher l'oeil au volant. */
const PULSE_MS = 1_800;

export function NavArrow({ size, color = '#0D6E4F' }: { size: number; color?: string }) {
  /* Le halo « respire » : il grandit et s'efface, puis repart. C'est ce qui distingue une
   * position VIVANTE d'une epingle posee sur la carte — on voit du coin de l'oeil que le
   * guidage est actif, sans avoir a lire quoi que ce soit.
   *
   * L'animation tourne sur le fil natif (`useNativeDriver`) : elle ne traverse donc jamais le
   * pont JavaScript, deja occupe a suivre le GPS et a faire avancer la camera image par image. */
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.5] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 0.14, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, backgroundColor: color, opacity, transform: [{ scale }] },
        ]}
      />
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        {/* Le contour blanc n'est pas decoratif : sans lui, le triangle se perd des que la route
            sous lui est de la meme teinte — c'est le cas du trace lui-meme. */}
        <Path d={PATH} fill={color} stroke="#FFFFFF" strokeWidth="7" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
