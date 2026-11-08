import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Fleche de position pendant le guidage.
 *
 * Elle remplace l'avion en papier dore de la v86 : le client la decrit comme « un design
 * depasse » et demande le reperage des cartes de navigation d'aujourd'hui — un triangle plein,
 * sans tige, pose sur un halo lumineux qui respire.
 *
 * Elle ne tourne pas : c'est la carte qui pivote pour suivre le cap (la camera aligne le nord
 * sur la direction suivie). La fleche reste donc pointee vers le haut de l'ecran, ce qui est
 * exactement ce que redit le correctif du 8 novembre — « la fleche GPS pointe toujours VERS LE
 * HAUT = sens de deplacement ».
 *
 * ELLE EST OR LE JOUR ET VERTE LA NUIT depuis le 8 novembre, et c'est un renversement.
 *
 * Jusque-la elle prenait la couleur du trace : verte de jour, turquoise de nuit — « la fleche et
 * le trace qu'elle suit doivent etre de la meme couleur ». Le client demande l'inverse, et il a
 * raison : une fleche de la couleur du trace, POSEE SUR ce trace, ne se distingue plus de lui.
 * C'est le meme defaut que le disque blanc d'octobre essayait de corriger. En or, elle se
 * detache du vert de l'itineraire comme du beige du fond de carte.
 *
 * La nuit, le fond devient sombre et l'or y crierait : la fleche repasse au vert #0D6E4F, valeur
 * du document.
 */

/** Repere de dessin de la fleche. Seule `size` fixe l'echelle reelle. */
const BOX = 128;
const CX = BOX / 2;

/** L'or des marqueurs WIN, repris de signalisation.ts. Valeur du document : #D4A017. */
export const OR_FLECHE = '#D4A017';
/** Le vert de nuit demande par le document pour la fleche. */
export const VERT_FLECHE_NUIT = '#0D6E4F';

/**
 * LE CONTOUR PREND LA COULEUR OPPOSEE, et ce n'est pas dans le document.
 *
 * Il le faut pourtant : le document demande une fleche OR posee au centre d'un halo OR. Deux
 * surfaces de la meme teinte l'une sur l'autre ne font qu'une seule forme — c'est litteralement
 * le defaut que le disque blanc d'octobre avait ete ajoute pour corriger, et qu'on ne va pas
 * reintroduire en appliquant la consigne a la lettre contre son propre but.
 *
 * De jour, la fleche or est donc cernee du vert fonce de l'itineraire ; de nuit, la fleche verte
 * reprend son lisere d'or. Dans les deux cas, ce sont les deux couleurs du document et aucune
 * autre.
 */
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

/**
 * LES TROIS ANNEAUX DU HALO, valeurs du correctif du 8 novembre.
 *
 * Ce sont des RAYONS en points, pas des diametres : le plus large fait donc 112 points de bout
 * en bout, autour d'une fleche de 40. C'est la proportion des cartes de navigation courantes —
 * le document demande explicitement « visible comme Google Maps et Waze ».
 *
 * Trois disques empiles plutot qu'un degrade : c'est ce qu'ecrit le document, et cela donne un
 * halo qui s'eclaircit par paliers nets au lieu de se fondre. Les opacites se composent au
 * centre (0,45 puis 0,28 puis 0,15 donnent environ 0,66), ce qui produit un coeur dense et un
 * bord leger sans qu'on ait a le calculer.
 */
const ANNEAUX = [
  { rayon: 56, couleur: 'rgb(255, 220, 100)', opacite: 0.15 },
  { rayon: 40, couleur: 'rgb(212, 160, 23)', opacite: 0.28 },
  { rayon: 26, couleur: 'rgb(212, 160, 23)', opacite: 0.45 },
] as const;

/** Cote de la boite du halo : le plus grand anneau, de bout en bout. */
export const TAILLE_HALO = ANNEAUX[0].rayon * 2;

/**
 * LA RESPIRATION, valeurs du document : de 1,0 a 0,15 en 1200 ms, aller-retour, sans fin.
 *
 * Elle etait a 1800 ms avec un halo qui GRANDISSAIT en plus de palir. Le document ne demande
 * qu'une variation d'opacite, et c'est mieux ainsi : un halo qui enfle fait bouger un objet au
 * milieu de l'ecran pendant qu'on conduit, et l'oeil y revient sans arret. En ne faisant que
 * respirer, il se voit du coin de l'oeil sans se faire regarder.
 */
const PULSE_MS = 1_200;
const PULSE_MIN = 0.15;

export function NavArrow({
  size,
  night = false,
}: {
  size: number;
  /** De nuit la fleche passe au vert : l'or sur un fond sombre est trop violent. */
  night?: boolean;
}) {
  /* Le halo « respire » : son opacite descend puis remonte, sans fin. C'est ce qui distingue une
   * position VIVANTE d'une epingle posee sur la carte — on voit du coin de l'oeil que le
   * guidage est actif, sans avoir a lire quoi que ce soit.
   *
   * L'animation tourne sur le fil natif (`useNativeDriver`) : elle ne traverse donc jamais le
   * pont JavaScript, deja occupe a suivre le GPS et a faire avancer la camera image par image. */
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    /* ALLER-RETOUR EXPLICITE, parce que React Native n'a pas de `setRepeatMode(REVERSE)`.
     * Le document decrit l'animation en Android (`AlphaAnimation` + `REVERSE`) ; ici il faut
     * enchainer les deux sens a la main, sans quoi le halo retomberait d'un coup a 1 a chaque
     * tour et clignoterait au lieu de respirer. */
    const aller = Animated.timing(pulse, {
      toValue: PULSE_MIN,
      duration: PULSE_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    const retour = Animated.timing(pulse, {
      toValue: 1,
      duration: PULSE_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    const loop = Animated.loop(Animated.sequence([aller, retour]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const remplissage = night ? VERT_FLECHE_NUIT : OR_FLECHE;
  const lisere = night ? OR_FLECHE : VERT_FLECHE_NUIT;

  return (
    <View
      pointerEvents="none"
      style={{
        width: TAILLE_HALO,
        height: TAILLE_HALO,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* LES TROIS ANNEAUX. Ils sont dessines dans un SVG et non en bordures de vues : trois
          vues rondes superposees coutent trois couches de rendu a chaque image, et sur Android
          une vue qui depasse de son parent est rognee. */}
      <Animated.View style={{ position: 'absolute', opacity: pulse }}>
        <Svg width={TAILLE_HALO} height={TAILLE_HALO} viewBox={`0 0 ${TAILLE_HALO} ${TAILLE_HALO}`}>
          {ANNEAUX.map((a) => (
            <Circle
              key={a.rayon}
              cx={TAILLE_HALO / 2}
              cy={TAILLE_HALO / 2}
              r={a.rayon}
              fill={a.couleur}
              fillOpacity={a.opacite}
            />
          ))}
        </Svg>
      </Animated.View>
      {/* La fleche, cernee de la couleur opposee : voir la note en tete de fichier. */}
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <Path
          d={PATH}
          fill={remplissage}
          stroke={lisere}
          strokeWidth={EPAISSEUR_LISERE}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
