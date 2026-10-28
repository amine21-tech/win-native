import Svg, { Path } from 'react-native-svg';
import { gesteDeManoeuvre, type Geste } from '../navigation/gestes';

/**
 * LA FLECHE DE MANOEUVRE, DESSINEE — point 16.A du client, 29 octobre.
 *
 * POURQUOI UN TRACE ET NON UN CARACTERE. La consigne affichait « ↱ », « ↰ », « ↑ » : des
 * caracteres de police, choisis quand la fleche tenait dans 34 points en haut de l'ecran. Le
 * client en demande 80, et a cette taille un caractere montre ce qu'il est — un trait fin,
 * dessine pour du texte, dont l'epaisseur ne grandit pas avec la taille. Pire, « ↩ » et « 🔄 »
 * changent d'aspect d'un Android a l'autre : le demi-tour devient un emoji colore sur certains
 * telephones, et le rond-point une fleche circulaire bleue.
 *
 * Un trace vectoriel est identique partout et grossit proprement. C'est le meme raisonnement
 * que pour le radar (voir RadarIcon), et pour la meme raison : ce que le conducteur doit
 * reconnaitre en un dixieme de seconde ne peut pas dependre de la police de son telephone.
 *
 * SIX FORMES SEULEMENT, et c'est volontaire. Valhalla distingue une trentaine de manoeuvres —
 * « tourner a droite », « prendre la sortie a droite », « rester a droite », « se rabattre a
 * droite ». Pour la MAIN qui tient le volant, ce sont quatre fois le meme geste. Multiplier
 * les pictogrammes obligerait a les lire ; six formes se reconnaissent sans lecture, et le
 * texte sous la fleche porte la nuance.
 */

/* Traces dans une boite de 100 x 100, mis a l'echelle par `viewBox`. Chaque fleche part du bas
 * au centre — la ou se trouve le vehicule — et file vers l'endroit ou il doit aller. Le trait
 * est epais (14) parce qu'il est regarde de loin et de biais, jamais de face. */
const TRACES: Record<Geste, string> = {
  'tout-droit': 'M50 88 L50 30 M50 18 L30 42 M50 18 L70 42',
  gauche: 'M50 88 L50 46 Q50 34 38 34 L22 34 M10 34 L32 20 M10 34 L32 48',
  droite: 'M50 88 L50 46 Q50 34 62 34 L78 34 M90 34 L68 20 M90 34 L68 48',
  'legere-gauche': 'M50 88 L50 56 L28 30 M28 18 L26 44 M28 18 L52 22',
  'legere-droite': 'M50 88 L50 56 L72 30 M72 18 L74 44 M72 18 L48 22',
  /* Le demi-tour part vers le haut, revient par une boucle et redescend : c'est la forme
   * qu'on lit comme « reviens sur tes pas », la ou une fleche courbe simple se confond avec
   * un virage serre. */
  'demi-tour': 'M66 88 L66 44 Q66 24 48 24 Q30 24 30 44 L30 60 M30 72 L18 50 M30 72 L42 50',
};

export function FlecheManoeuvre({
  type,
  size = 80,
  couleur = '#FFFFFF',
}: {
  type: number;
  size?: number;
  couleur?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d={TRACES[gesteDeManoeuvre(type)]}
        stroke={couleur}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
