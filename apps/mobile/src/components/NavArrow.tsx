import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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

/**
 * LE DISQUE BLANC EST LE CORRECTIF, PAS UN ORNEMENT.
 *
 * La fleche etait remplie de la couleur de l'itineraire, et posee SUR cet itineraire : deux
 * surfaces de la meme teinte l'une sur l'autre ne font qu'une seule forme. Il ne restait d'elle
 * que son liseré blanc — deux pixels de large a l'ecran — ce qui donnait le trait fin et
 * incertain que le client a releve. Le commentaire d'origine avait vu le risque et comptait sur
 * ce liseré pour y parer ; il etait trop mince pour cela.
 *
 * Un disque blanc OPAQUE dessous regle le probleme a la source : quoi qu'il y ait sous le
 * curseur — le trace vert, une route jaune, un parc — la fleche se detache toujours, puisque
 * ce n'est plus le fond de carte qui la porte mais un fond a nous.
 *
 * L'anneau sombre qui le borde sert au cas inverse : sur le beige clair du fond de carte, un
 * disque blanc sans contour se dissout a son tour.
 */
const RAYON_DISQUE = 52;
const EPAISSEUR_ANNEAU = 3;

/** Pointe, base et creux arriere : un triangle dont le bas est legerement rentre, ce qui lui
 * donne sa direction d'un coup d'oeil la ou un triangle plat parait pose au hasard.
 * Il est RETRECI pour tenir dans le disque, avec de la marge blanche tout autour. */
const TIP_Y = 30;
const BASE_Y = 100;
const HALF_WIDTH = 30;
const NOTCH_Y = 84;

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
        {/* Le disque, puis la fleche par-dessus : voir la note en tete de fichier. */}
        <Circle
          cx={CX}
          cy={CX}
          r={RAYON_DISQUE}
          fill="#FFFFFF"
          stroke="rgba(0,0,0,0.22)"
          strokeWidth={EPAISSEUR_ANNEAU}
        />
        <Path d={PATH} fill={color} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
