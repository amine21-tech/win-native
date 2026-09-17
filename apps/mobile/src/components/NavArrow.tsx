import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * Fleche de position pendant le guidage — transcription du `navPuck` de la version web (v86).
 *
 * L'application affichait un triangle bleu dans un rond blanc ; le site dessine une fleche
 * DOREE facon avion en papier : pointe en haut, deux ailes arrondies, encoche concave a
 * l'arriere. C'est l'identite de WIN, et le client l'a releve.
 *
 * Elle ne tourne pas : c'est la carte qui pivote pour suivre le cap (la camera aligne le nord
 * sur la direction suivie). La fleche reste donc pointee vers le haut de l'ecran.
 *
 * Le repere est celui du site — un carre de 128 — pour que les courbes soient exactement les
 * siennes ; seule `size` fixe l'echelle reelle.
 */

/** Rayon de reference de la fleche dans le repere de 128, comme en v86 (`S * 0.30`). */
const R = 38.4;
const CX = 64;
const CY = 64;

const TIP_Y = CY - R * 1.35;
const WING_Y = CY + R * 0.48;
const WING_X = R * 0.92;
const NOTCH_Y = CY + R * 0.02;

const PATH = [
  `M ${CX} ${TIP_Y}`,
  `Q ${CX + WING_X * 0.55} ${CY - R * 0.15} ${CX + WING_X} ${WING_Y}`,
  `Q ${CX + WING_X * 0.32} ${WING_Y - R * 0.02} ${CX} ${NOTCH_Y}`,
  `Q ${CX - WING_X * 0.32} ${WING_Y - R * 0.02} ${CX - WING_X} ${WING_Y}`,
  `Q ${CX - WING_X * 0.55} ${CY - R * 0.15} ${CX} ${TIP_Y}`,
  'Z',
].join(' ');

export function NavArrow({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      <Defs>
        <LinearGradient id="navArrowGold" x1="64" y1={TIP_Y} x2="64" y2={CY + R * 0.5} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F6D877" />
          <Stop offset="1" stopColor="#DBA428" />
        </LinearGradient>
      </Defs>
      <Path d={PATH} fill="url(#navArrowGold)" stroke="#FFFFFF" strokeWidth="5.76" strokeLinejoin="round" />
    </Svg>
  );
}
