import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

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
/** Le vert de nuit demande par le document du 8 novembre pour la fleche. Conserve pour le
 *  liseré : la fleche elle-meme est passee au degrade le 11 novembre (C9). */
export const VERT_FLECHE_NUIT = '#0D6E4F';

/**
 * LA FLECHE OPTION D — correction C9 du 11 novembre.
 *
 * << Degrade SVG Blanc -> Jaune -> Or, contour blanc, remplace la fleche actuelle. >>
 *
 * CE QUE LE DEGRADE APPORTE, ET POURQUOI IL EST ORIENTE AINSI. La pointe est BLANCHE et la base
 * DOREE. Une fleche d'une seule couleur ne dit pas de quel cote elle pointe tant qu'on ne
 * distingue pas sa forme ; sur une carte chargee, a la taille d'un ongle, c'est la partie la
 * plus claire que l'oeil trouve en premier. Mettre le blanc a la pointe, c'est faire designer
 * la direction par la luminosite plutot que par la geometrie.
 *
 * LE CONTOUR BLANC remplace le liseré vert fonce du 8 novembre. Celui-ci servait a detacher la
 * fleche de son propre halo dore ; le degrade s'en charge desormais tout seul, puisque sa
 * pointe est deja blanche. Et un contour blanc se lit sur TOUTE carte — le vert fonce
 * disparaissait sur un parc ou une foret.
 */
const DEGRADE_FLECHE = [
  { decalage: '0%', couleur: '#FFFFFF' },
  { decalage: '45%', couleur: '#FFE566' },
  { decalage: '100%', couleur: '#D4A017' },
] as const;

/** Contour de la fleche : blanc, 2,5 points. Valeurs du document. Le meme de jour et de nuit. */
const CONTOUR_FLECHE = '#FFFFFF';

/**
 * LA LUEUR DOREE DE NUIT — << Mode NUIT : lueur doree supplementaire >> (C9).
 *
 * C'est un trait large et translucide pose SOUS la fleche, de la meme forme : il deborde de
 * tous les cotes et se lit comme un rayonnement. L'or est celui de Google pour cet usage,
 * #FFD700, plus clair que l'or WIN — une lueur doit etre plus lumineuse que ce qu'elle entoure,
 * sinon elle se lit comme une ombre.
 *
 * SEPT POINTS DE DEBORDEMENT, pas deux. Le premier essai teintait le contour en #FFF4CC sur
 * un demi-point de plus, et la mesure l'a condamne : deux points d'ecart de bleu en moyenne,
 * invisible. Un effet qu'on ne peut pas mesurer est un effet que personne ne verra.
 */
const LUEUR_NUIT = '#FFD700';
const LUEUR_DEBORDEMENT = 7;
const LUEUR_OPACITE = 0.55;

/**
 * LE POINT GPS ROUGE, sous la pointe de la fleche.
 *
 * A QUOI IL SERT, puisque la fleche est deja la. La fleche dit le CAP ; elle est large, et son
 * centre geometrique n'est pas la position. Le point rouge dit la POSITION EXACTE, au metre
 * pres. La distinction compte a l'arret devant un carrefour, ou cinq metres decident de la rue
 * dans laquelle on est.
 *
 * ROUGE, et c'est la seule touche de rouge de tout le marqueur : aucune confusion possible
 * avec l'or de la fleche ou de son halo.
 */
const POINT_GPS = '#E53935';
/**
 * SEPT, ET NON QUATRE ET DEMI. A 4,5 le point faisait neuf points de diametre sur une fleche de
 * quarante : arsanne l'a vu sur sa capture et l'a pris pour une poussiere sur l'ecran. Un repere
 * qu'on prend pour une salissure ne repere rien.
 */
const POINT_GPS_RAYON = 7;
/**
 * OU SE POSE LE POINT, dans le repere 0-128 de la fleche. Et il a bouge deux fois.
 *
 * A 27, IL FLOTTAIT A COTE. Le triangle n'y fait que quatre points de demi-largeur : le point,
 * bordure blanche comprise, debordait des deux cotes et se lisait comme un objet pose a cote du
 * marqueur.
 *
 * A 40, IL ETAIT POSE SUR LA FLECHE. C'est ce qu'arsanne a vu le 13 novembre et ce qu'il refuse :
 * << je trouvais qu'il est sur l'icone elle-meme, tu le mets avant l'icone >>. Il avait raison de
 * revenir au document, dont le tableau de composition donne l'ordre
 * [Halo] -> [Point rouge GPS] -> [Fleche] : le point est dessine AVANT la fleche, donc DESSOUS.
 * Le mien etait peint par-dessus.
 *
 * A 8, IL EST DEVANT LA POINTE. Son bord inferieur touche la pointe du triangle, qui commence a
 * 16 ; il se lit comme un repere pose en avant du marqueur, dans le sens de la marche. Il ne
 * peut pas descendre plus haut : a rayon sept, le bord superieur arriverait a 1, et le dessin
 * est coupe au-dela de zero.
 */
const POINT_GPS_Y = 8;

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
 * centre, ce qui produit un coeur dense et un bord leger sans qu'on ait a le calculer.
 *
 * LES OPACITES ONT BAISSE DE 30 % le 11 novembre (correction C1) : 0,45 / 0,28 / 0,15 sont
 * devenues 0,32 / 0,20 / 0,11 — chacune multipliee par 0,70.
 *
 * SEULE L'INTENSITE CHANGE. Les RAYONS ne bougent pas, l'animation non plus : le document
 * l'ecrit trois fois et c'est important, parce que la facon evidente de << reduire le halo >>
 * serait de le retrecir. Ce n'est pas ce qui est demande — le halo doit garder sa place et son
 * mouvement, il doit seulement moins briller. Au centre, les trois disques composaient environ
 * 0,66 d'opacite ; ils en composent maintenant 0,51.
 */
const ANNEAUX = [
  { rayon: 56, couleur: 'rgb(255, 220, 100)', opacite: 0.11 },
  { rayon: 40, couleur: 'rgb(212, 160, 23)', opacite: 0.20 },
  { rayon: 26, couleur: 'rgb(212, 160, 23)', opacite: 0.32 },
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

  /* LE DEGRADE EST LE MEME DE JOUR ET DE NUIT. Le document ne demande pour la nuit qu'une
   * << lueur doree supplementaire >> — pas une autre fleche. Le contour reste donc blanc, et
   * c'est une COUCHE EN PLUS qui fait la lueur : voir LUEUR_NUIT ci-dessous. */
  const contour = CONTOUR_FLECHE;

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
      {/* LA FLECHE OPTION D : degrade blanc -> jaune -> or, contour blanc, et le point GPS
          rouge sous la pointe. Voir la note en tete de fichier. */}
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <Defs>
          {/* Degrade VERTICAL dans le repere de la fleche : elle pointe toujours vers le haut,
              donc y=0 est la pointe et y=1 la base. La rotation du marqueur, quand il y en a
              une, emporte le degrade avec lui. */}
          <LinearGradient id="degradeFleche" x1="0" y1="0" x2="0" y2="1">
            {DEGRADE_FLECHE.map((e) => (
              <Stop key={e.decalage} offset={e.decalage} stopColor={e.couleur} />
            ))}
          </LinearGradient>
        </Defs>
        {/* LA LUEUR DE NUIT, DESSINEE AVANT LA FLECHE DONC DESSOUS.
            C'est un second trace de la MEME forme, avec un trait dore large et translucide : il
            deborde tout autour et se lit comme un rayonnement. Il n'y a pas de flou ici — un
            filtre de flou SVG se recalcule a chaque image sur Android, et cette fleche est
            redessinee a chaque point GPS.

            UNE PREMIERE VERSION TEINTAIT SIMPLEMENT LE CONTOUR en #FFF4CC. La mesure l'a
            condamnee : deux points d'ecart de bleu en moyenne sur l'image entiere, c'est-a-dire
            rien de visible. Un effet qu'on ne peut pas mesurer est un effet que le conducteur
            ne verra pas. */}
        {/* LE POINT GPS, DESSINE AVANT LA FLECHE DONC DESSOUS — c'est l'ordre du tableau de
            composition du document : [Halo] -> [Point rouge] -> [Fleche]. Il etait peint
            par-dessus, ce qui le posait SUR l'icone au lieu de l'accompagner. */}
        <Circle
          cx={CX}
          cy={POINT_GPS_Y}
          r={POINT_GPS_RAYON}
          fill={POINT_GPS}
          stroke="#FFFFFF"
          strokeWidth={1.6}
        />
        {night ? (
          <Path
            d={PATH}
            fill="none"
            stroke={LUEUR_NUIT}
            strokeWidth={EPAISSEUR_LISERE + LUEUR_DEBORDEMENT}
            strokeOpacity={LUEUR_OPACITE}
            strokeLinejoin="round"
          />
        ) : null}
        <Path
          d={PATH}
          fill="url(#degradeFleche)"
          stroke={contour}
          strokeWidth={EPAISSEUR_LISERE}
          strokeLinejoin="round"
        />
        {/* LE POINT GPS, pose SOUS la pointe et non au centre de la fleche : c'est la que se
            trouve reellement le vehicule. Sa bordure blanche le detache du degrade. */}
        <Circle
          cx={CX}
          cy={POINT_GPS_Y}
          r={POINT_GPS_RAYON}
          fill={POINT_GPS}
          stroke="#FFFFFF"
          strokeWidth={1.6}
        />
      </Svg>
    </View>
  );
}
