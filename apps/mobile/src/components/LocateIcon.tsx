import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Icone « se localiser » : le viseur de la version web, trait pour trait.
 *
 * Android affichait jusqu'ici le caractere « ◎ », dont le rendu depend de la police du
 * telephone et ne ressemblait pas au viseur du site. Le dessin ci-dessous reprend le SVG de
 * `#locate` en v83 : un cercle de rayon 3,5 et quatre traits aux quatre points cardinaux,
 * dans la meme grille 24x24. Rien ne change au comportement du bouton.
 */
export function LocateIcon({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.5} stroke={color} strokeWidth={2.2} />
      <Path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
