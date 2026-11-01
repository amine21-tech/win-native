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

/**
 * LE DISQUE BLANC EST RETIRE, A LA DEMANDE DU CLIENT — 1er novembre.
 *
 * Il avait ete ajoute pour une vraie raison : la fleche etait remplie de la couleur de
 * l'itineraire et posee SUR cet itineraire ; deux surfaces de la meme teinte l'une sur
 * l'autre ne font qu'une seule forme, et il ne restait d'elle qu'un lisere blanc de deux
 * pixels. Le client avait lui-meme signale ce trait fin et incertain.
 *
 * Il demande aujourd'hui de revenir au curseur d'avant, << vert avec un petit peu de jaune >>,
 * sans ce fond blanc. On applique sa demande — mais pas au prix du defaut qu'elle avait
 * corrige : le lisere passe du blanc a l'OR de WIN, en 3,5 points au lieu de 2. L'or est la
 * couleur qui entoure deja tous les marqueurs de l'application, il se detache du vert du trace
 * comme du beige du fond, et il donne exactement le << petit peu de jaune >> demande.
 *
 * La fleche retrouve aussi sa taille d'origine — pointe a 16, base a 108, demi-largeur 40 —
 * qui avait ete reduite pour tenir dans le disque disparu.
 */
/** L'or des marqueurs WIN, repris de signalisation.ts. */
const OR = '#D4A017';
const EPAISSEUR_LISERE = 3.5;

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
        {/* La fleche verte, cernee d'or : voir la note en tete de fichier. */}
        <Path
          d={PATH}
          fill={color}
          stroke={OR}
          strokeWidth={EPAISSEUR_LISERE}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
