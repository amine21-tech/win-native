import Svg, { Circle, Path } from 'react-native-svg';

/**
 * LA VOITURE ET LE PIETON, DESSINES — correctif du 8 novembre, point 7.
 *
 * Ils etaient des emoji : 🚗 et 🚶. Le document demande des « icones SVG modernes realistes »,
 * et il y a une raison plus forte que le gout a lui donner raison.
 *
 * UN EMOJI N'EST PAS LE MEME DESSIN D'UN TELEPHONE A L'AUTRE. Il est rendu par la police du
 * systeme : 🚗 est une berline rouge vue de cote sur un Samsung, une voiture bleue vue de face
 * sur un Android pur, et un carre vide sur un telephone dont la police d'emoji est incomplete —
 * ce qui arrive sur les appareils d'entree de gamme vendus en Algerie. L'application ne peut
 * donc pas savoir ce que l'utilisateur voit. C'est exactement le defaut qui avait fait
 * disparaitre les marqueurs de signalisation de la carte : `text-field` avec un emoji que la
 * police ne contenait pas.
 *
 * Un trace vectoriel, lui, est le meme partout, prend la couleur qu'on lui donne, et reste net
 * a toutes les tailles.
 *
 * ILS SONT VUS DE COTE, comme le demande le document. De face, une voiture et un camion se
 * ressemblent ; de profil, la ligne du toit et les deux roues la rendent reconnaissable a
 * quatorze points de haut.
 */

type Props = { size?: number; color: string };

/** Berline vue de cote : capot, pare-brise incline, toit, coffre, deux roues. */
export function IconeVoiture({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* La carrosserie en une seule silhouette : c'est la ligne du toit — basse a l'avant,
          cassee au pare-brise, horizontale au milieu — qui fait lire << voiture >>. */}
      <Path
        d="M2.4 15.1c0-.9.5-1.4 1.3-1.6l1.6-.3 2.3-3.4c.5-.7 1.1-1 1.9-1h5c.8 0 1.5.3 2 1l2 2.9 1.9.5c.9.2 1.4.8 1.4 1.7v1.5c0 .5-.4.9-.9.9h-1.3a2.6 2.6 0 0 0-5.1 0H9.6a2.6 2.6 0 0 0-5.1 0H3.3c-.5 0-.9-.4-.9-.9v-1.3Z"
        fill={color}
      />
      {/* Les deux roues, posees sur la ligne de sol. */}
      <Circle cx="7" cy="17.6" r="2.2" fill={color} />
      <Circle cx="17" cy="17.6" r="2.2" fill={color} />
    </Svg>
  );
}

/** Pieton EN MARCHE : une jambe devant, une derriere, et le bras qui balance. Un pieton debout
 *  jambes serrees se lit comme une epingle ; c'est l'ecartement qui dit << a pied >>. */
export function IconePieton({ size = 18, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12.6" cy="3.6" r="2.3" fill={color} />
      {/* Le tronc et la jambe arriere, d'un seul trait. */}
      <Path
        d="M12.9 7c1 0 1.7.6 1.9 1.5l.9 3.6 1.8 1.6a1.1 1.1 0 0 1-1.4 1.7l-2-1.5-.5 2.5 1.7 4.2a1.2 1.2 0 0 1-2.2.9L11.3 18l-2.1 3.3a1.2 1.2 0 0 1-2-1.3l2.4-3.9.7-4.4-1.5 1.3-1.2 2a1.1 1.1 0 0 1-1.9-1.1l1.4-2.4c.2-.3.4-.5.6-.7l2.6-2.3c.5-.4 1-.6 1.6-.6Z"
        fill={color}
      />
    </Svg>
  );
}
