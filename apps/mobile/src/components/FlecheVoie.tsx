import Svg, { G, Path } from 'react-native-svg';
import type { Lane } from '../navigation/routing';
import { gesteDeVoie, rabattementAGauche, TRACES_VOIE } from '../navigation/voiesRegles';

/**
 * LES NEUF FLECHES DE VOIE — correctif du 8 novembre, point 4.
 *
 * Ce fichier ne fait que DESSINER. Le choix de la fleche, l'ordre de priorite des directions et
 * les neuf traces vivent dans src/navigation/voiesRegles.ts, hors de tout React Native, pour
 * pouvoir etre eprouves sans telephone — voir scripts/verifier-voies.ts.
 */
export { gesteDeVoie, rabattementAGauche, type GesteVoie } from '../navigation/voiesRegles';

export function FlecheVoie({
  lane,
  size = 30,
  couleur,
}: {
  lane: Lane;
  size?: number;
  couleur: string;
}) {
  const geste = gesteDeVoie(lane);
  const retourne = geste === 'rabattement' && rabattementAGauche(lane);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* `scale(-1, 1)` avec une translation de 100 : le miroir se fait autour du milieu de la
          boite, sans quoi le dessin sortirait du cadre par la gauche. */}
      <G transform={retourne ? 'translate(100, 0) scale(-1, 1)' : undefined}>
        <Path
          d={TRACES_VOIE[geste]}
          stroke={couleur}
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}
