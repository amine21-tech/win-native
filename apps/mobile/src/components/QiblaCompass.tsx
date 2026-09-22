import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

/**
 * La boussole du panneau Qibla — transcription trait pour trait de `#qiblaArrow` et de
 * `.qibla-compass` (win-v83/index.html).
 *
 * Le site dessine cette boussole en SVG, dans un repere de 0 a 100. On garde ce repere : tous
 * les nombres ci-dessous sont donc LES SIENS, sans conversion, et l'echelle reelle ne depend
 * que de `size`. La version precedente approchait ces formes avec des vues React Native — un
 * triangle fait de bordures, un croissant fait de deux disques, un degrade radial imite par un
 * anneau sombre. Ces approximations tenaient de loin, pas cote a cote avec le site.
 *
 * Deux points ou l'on s'ecarte volontairement du CODE du site pour coller a son RENDU :
 *
 * 1. Le site declare une barre doree epaisse entre le moyeu et le triangle
 *    (`stroke-width:8`), mais elle n'apparait jamais a l'ecran : son degrade est defini en
 *    unites de boite englobante, et la boite d'un segment VERTICAL a une largeur nulle — cas
 *    ou la specification SVG demande de ne pas peindre l'element du tout. Seul subsiste le
 *    filet clair pose par-dessus. C'est ce filet, et lui seul, que l'on reproduit ici : c'est
 *    l'image que l'utilisateur connait. Retablir la barre serait un changement de design, pas
 *    une correction de fidelite.
 * 2. Les degrades sont exprimes en coordonnees du repere (`userSpaceOnUse`) plutot qu'en
 *    boite englobante, precisement pour ne pas dependre de ce meme piege.
 */

/** Degrade dore de v83 (`#qiblaGold`), du plus clair au plus sombre. */
const GOLD_STOPS: readonly [string, string, string, string] = ['#FFF4C2', '#F2D676', '#E0B13A', '#B8860B'];
/** Creme des liseres (`#fff2bf` en v83). */
const CREAM_EDGE = '#FFF2BF';

type Props = {
  /** Diametre de la boussole, bordure doree comprise. */
  size: number;
  /** Orientation de l'aiguille, en degres : cap de la Kaaba corrige du cap du telephone. */
  arrowRotation: number;
  /** Orientation de la rose des vents, en degres : l'oppose du cap du telephone. */
  dialRotation: number;
  /** Couleur des lettres cardinales et de la bordure. */
  gold: string;
  /** Lettres cardinales, dans l'ordre Nord, Est, Sud, Ouest — traduites. */
  cardinals: readonly [string, string, string, string];
};

/**
 * Rotation animee, equivalent du `transition: transform .15s linear` que le site applique a
 * `#qiblaArrow` et au cadran. Sans elle, chaque nouvelle mesure du magnetometre deplace
 * l'aiguille d'un coup : meme lissee, la succession de sauts se lit comme un tremblement. Les
 * 150 ms lineaires du site relient ces mesures et donnent une aiguille qui glisse.
 *
 * L'angle recu doit etre CONTINU (voir QiblaPanel) : une valeur ramenee dans 0-360 ferait
 * tourner l'aiguille dans le mauvais sens sur presque un tour a chaque passage par le nord.
 */
function useSmoothRotation(degrees: number) {
  const value = useRef(new Animated.Value(degrees)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: degrees,
      duration: 150,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [degrees, value]);
  // `extrapolate: 'extend'` (par defaut) prolonge la droite au-dela du tour complet : un cap
  // cumule de 400 degres donne bien 400deg, et non une valeur bornee a 360.
  return value.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
}

export function QiblaCompass({ size, arrowRotation, dialRotation, gold, cardinals }: Props) {
  const [north, east, south, west] = cardinals;
  const dialSpin = useSmoothRotation(dialRotation);
  const arrowSpin = useSmoothRotation(arrowRotation);

  return (
    <View style={[styles.frame, { width: size, height: size, borderColor: gold }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          {/* `radial-gradient(circle,#0a4a36,#0d3a2b)` : clair au centre, sombre au bord. */}
          <RadialGradient id="dial" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0A4A36" />
            <Stop offset="1" stopColor="#0D3A2B" />
          </RadialGradient>
          {/* `box-shadow:inset 0 0 18px rgba(0,0,0,.4)` : l'ombre interieure n'existe pas en
              React Native, mais un degrade qui ne s'assombrit que sur les derniers 15 % du
              rayon en donne exactement le relief — et sans l'anneau net que laissait une
              bordure sombre. */}
          <RadialGradient id="dialShade" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0.84" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.4" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#dial)" />
        <Circle cx="50" cy="50" r="50" fill="url(#dialShade)" />
      </Svg>

      {/* Rose des vents : elle tourne avec le telephone, l'aiguille non — c'est ce qui permet
          de lire la direction de la Kaaba par rapport au Nord reel. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: dialSpin }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          {/* Les lettres sont posees a 4,5 unites du bord, ce qui reproduit le `top:8px` du
              site sur une boussole de 290 px — sa taille de reference. */}
          <SvgText x="50" y="8.2" fill={gold} fontSize="4.5" fontWeight="800" textAnchor="middle">
            {north}
          </SvgText>
          <SvgText x="50" y="96.2" fill={gold} fontSize="4.5" fontWeight="800" textAnchor="middle">
            {south}
          </SvgText>
          <SvgText x="95" y="51.6" fill={gold} fontSize="4.5" fontWeight="800" textAnchor="middle">
            {east}
          </SvgText>
          <SvgText x="5" y="51.6" fill={gold} fontSize="4.5" fontWeight="800" textAnchor="middle">
            {west}
          </SvgText>
        </Svg>
      </Animated.View>

      {/* Aiguille : filet clair du moyeu au triangle, triangle grave « Mecca », embleme
          ottoman a son sommet, moyeu dore au centre. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: arrowSpin }] }]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="goldBlade" x1="39" y1="3" x2="61" y2="23" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={GOLD_STOPS[0]} />
              <Stop offset="0.3" stopColor={GOLD_STOPS[1]} />
              <Stop offset="0.6" stopColor={GOLD_STOPS[2]} />
              <Stop offset="1" stopColor={GOLD_STOPS[3]} />
            </LinearGradient>
            <LinearGradient id="goldEmblem" x1="45.8" y1="6.8" x2="55.8" y2="15.2" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={GOLD_STOPS[0]} />
              <Stop offset="0.3" stopColor={GOLD_STOPS[1]} />
              <Stop offset="0.6" stopColor={GOLD_STOPS[2]} />
              <Stop offset="1" stopColor={GOLD_STOPS[3]} />
            </LinearGradient>
          </Defs>

          <Path d="M 50 48 L 50 23" stroke={CREAM_EDGE} strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />

          <Polygon
            points="50,3 39,23 61,23"
            fill="url(#goldBlade)"
            stroke={CREAM_EDGE}
            strokeWidth="0.8"
            strokeLinejoin="round"
          />

          {/* Croissant et etoile, dessines. Le caractere ☪ etait rendu par Android en emoji
              couleur — un carre violet au sommet de l'aiguille — car un emoji ignore la
              couleur qu'on lui donne. */}
          <Path
            d="M 50,6.8 A 4.2,4.2 0 1 0 52.6,14.5 A 3.3,3.3 0 1 1 50,6.8 Z"
            fill="url(#goldEmblem)"
            stroke={CREAM_EDGE}
            strokeWidth="0.4"
          />
          <Polygon
            points="53.4,8.8 54.05,10.45 55.8,10.45 54.35,11.5 54.9,13.2 53.4,12.15 51.9,13.2 52.45,11.5 51,10.45 52.75,10.45"
            fill="url(#goldEmblem)"
            stroke={CREAM_EDGE}
            strokeWidth="0.3"
          />

          <SvgText
            x="50"
            y="19.5"
            fill="#5A3D00"
            fontSize="4.4"
            fontWeight="700"
            fontStyle="italic"
            fontFamily="serif"
            textAnchor="middle"
          >
            Mecca
          </SvgText>
        </Svg>
      </Animated.View>

      {/* Moyeu central, hors de l'aiguille : il est au centre de rotation, donc l'y laisser ne
          changerait rien a l'image et le ferait redessiner a chaque degre. */}
      <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="hub" cx="48.6" cy="47.9" r="9.8" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFF7D0" />
            <Stop offset="0.55" stopColor="#EAC254" />
            <Stop offset="1" stopColor="#A9760A" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="7" fill="url(#hub)" stroke={CREAM_EDGE} strokeWidth="1" />
        <Circle cx="47.5" cy="47.5" r="1.8" fill="#FFF9E0" opacity="0.9" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.qibla-compass{border-radius:50%;border:3px solid #d4af6a}`
  frame: { alignSelf: 'center', borderRadius: 999, borderWidth: 3, overflow: 'hidden' },
});
