import Svg, { Path, Circle, Rect } from 'react-native-svg';

/**
 * Le radar, dessine plutot qu'emprunte a une police d'emoji.
 *
 * L'emoji 📷 montrait un appareil photo de touriste : rien n'y disait le radar routier, et le
 * client l'a releve. Un dessin regle aussi un probleme plus sourd — les emoji ne sont pas
 * garantis d'une version d'Android a l'autre, et celui-ci change d'aspect selon le telephone.
 * Un trace vectoriel est identique partout, et se met a l'echelle sans flou.
 *
 * Boitier sombre, objectif cercle clair, et l'eclair jaune du flash : trois formes qui disent
 * le radar sans legende.
 */
export function RadarIcon({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 26">
      {/* Boitier */}
      <Rect x="1" y="6" width="22" height="16" rx="3.5" fill="#37474F" />
      {/* Bossage du viseur, qui donne la silhouette d'un appareil et non d'une simple boite */}
      <Path d="M6 6 L9 2.5 H15 L18 6 Z" fill="#37474F" />
      {/* Objectif : deux cercles, le clair par-dessus, pour le creux du verre */}
      <Circle cx="12" cy="14" r="6" fill="#263238" />
      <Circle cx="12" cy="14" r="3.6" fill="#90A4AE" />
      <Circle cx="10.6" cy="12.6" r="1.2" fill="#ECEFF1" />
      {/* L'eclair du flash, detache du boitier : c'est lui qui dit << radar >> et non
          << appareil photo >>. */}
      <Path d="M25.5 3 L21 12 H24.5 L22.5 21 L29 10.5 H25.5 L27.5 3 Z" fill="#F5B400" />
    </Svg>
  );
}
