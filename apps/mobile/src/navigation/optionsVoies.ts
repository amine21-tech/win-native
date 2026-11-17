import type { Lane } from './voies';
import { gesteDeVoie, type GesteVoie } from './voiesRegles';

/**
 * REGROUPE LES VOIES EN OPTIONS DE DIRECTION — correctif du 17 novembre, point 7.
 *
 * CE QUE LE DOCUMENT DEMANDE, en gras et precede d'un avertissement : << On N'affiche PAS une
 * fleche par voie — impossible sur petits ecrans. On affiche les OPTIONS DE DIRECTION (2-3
 * max) et la bonne clignote. >>
 *
 * CE QU'ON FAISAIT. Une tuile par voie renvoyee par Valhalla. Sur l'A61 mesuree le 16 novembre,
 * cela faisait CINQ tuiles de trente-deux points dans un bandeau qui en fait trois cent
 * soixante de large : des timbres-poste, au moment precis ou le conducteur doit decider de sa
 * file. Et trois de ces cinq voies disaient exactement la meme chose — << gauche legere >>.
 *
 * POURQUOI GROUPER PLUTOT QUE TRONQUER. Garder les trois premieres voies sur cinq donnerait un
 * dessin FAUX : on montrerait trois fois la meme direction en cachant celle qu'il faut prendre.
 * Ce qui compte pour decider n'est pas le nombre de files, c'est le nombre de CHOIX — et il y
 * en a presque toujours deux ou trois, quelle que soit la largeur de la chaussee.
 *
 * SEPARE DU COMPOSANT POUR POUVOIR ETRE EPROUVE. Ce module ne dessine rien et n'importe aucun
 * module React Native : scripts/verifier-voies.ts le fait tourner sur de vraies configurations
 * de voies. Meme raison que degradeTrace.ts, manoeuvreRatee.ts et voixKabRegles.ts.
 */

/** Une option de direction : un geste, et s'il faut la prendre. */
export type OptionVoie = {
  geste: GesteVoie;
  /** La voie representative du groupe, pour que le composant dessine la bonne fleche. */
  lane: Lane;
  /** Au moins une voie du groupe mene la ou l'on va. */
  aPrendre: boolean;
  /** Combien de files portent cette direction. Sert au libelle. */
  voies: number;
};

/**
 * NOMBRE MAXIMAL D'OPTIONS AFFICHEES. Valeur du document : << 2-3 max >>.
 *
 * Trois et non quatre : sur un ecran de telephone, le bandeau accorde environ cent points aux
 * fleches une fois la consigne et la distance posees. Trois tuiles de trente-deux y tiennent
 * avec leur ecart ; quatre les ecrasent.
 */
export const MAX_OPTIONS = 3;

/**
 * Les options de direction d'un ensemble de voies, de gauche a droite.
 *
 * L'ORDRE EST CELUI DE LA CHAUSSEE, et il n'est pas decoratif : le conducteur lit la rangee
 * comme il voit les files devant lui. Trier par direction, ou mettre la voie recommandee en
 * premier, le ferait chercher a gauche ce qui est a droite.
 */
export function optionsDeVoies(lanes: readonly Lane[]): OptionVoie[] {
  const groupes: OptionVoie[] = [];

  for (const lane of lanes) {
    const geste = gesteDeVoie(lane);
    /* `active` = la voie ou l'on est deja bien place ; `valid` = elle mene quand meme la ou
     * l'on va. Les deux comptent comme << a prendre >>. */
    const mene = lane.active !== 0 || lane.valid !== 0;
    const dernier = groupes[groupes.length - 1];

    /* ON NE GROUPE QUE LES VOISINES. Deux files qui vont tout droit, separees par une file de
     * gauche, sont deux options distinctes sur la chaussee : les fondre en une seule
     * deplacerait la fleche et designerait la mauvaise file. */
    if (dernier && dernier.geste === geste) {
      dernier.voies += 1;
      /* UNE SEULE VOIE QUI MENE SUFFIT a marquer le groupe. En revanche on garde comme
       * representative la voie QUI MENE, et non la premiere venue : sur une sortie, la file
       * de droite porte souvent un marquage different de sa voisine. */
      if (mene && !dernier.aPrendre) {
        dernier.aPrendre = true;
        dernier.lane = lane;
      }
      continue;
    }
    groupes.push({ geste, lane, aPrendre: mene, voies: 1 });
  }

  return reduireATrois(groupes);
}

/**
 * Ramene la rangee a trois options AU PLUS, sans jamais perdre celle qu'il faut prendre.
 *
 * COMMENT ON CHOISIT CE QU'ON RETIRE. On part des options a prendre — elles ne peuvent pas
 * disparaitre, c'est toute la raison d'etre de la rangee — et on complete avec leurs VOISINES
 * les plus proches, de proche en proche. Une option voisine dit au conducteur de quel cote se
 * trouve celle qu'il vise ; une option lointaine ne lui apprend rien qu'il puisse utiliser.
 *
 * SI AUCUNE N'EST A PRENDRE — cela arrive quand Valhalla n'a pas d'avis — on garde les trois
 * premieres, faute de mieux. La rangee reste au moins fidele au bord gauche de la chaussee.
 */
function reduireATrois(groupes: OptionVoie[]): OptionVoie[] {
  if (groupes.length <= MAX_OPTIONS) return groupes;

  const gardes = new Set<number>();
  groupes.forEach((g, i) => {
    if (g.aPrendre) gardes.add(i);
  });
  if (gardes.size === 0) return groupes.slice(0, MAX_OPTIONS);

  /* Si les options a prendre sont deja trop nombreuses, on garde les premieres : elles sont
   * toutes justes, et le conducteur n'a qu'a en choisir une. */
  if (gardes.size >= MAX_OPTIONS) {
    return groupes.filter((_, i) => gardes.has(i)).slice(0, MAX_OPTIONS);
  }

  /* Etendre de proche en proche, des deux cotes a la fois, pour que la rangee reste centree
   * sur ce qui compte plutot que de deborder d'un seul bord. */
  let ecart = 1;
  while (gardes.size < MAX_OPTIONS && ecart < groupes.length) {
    for (const i of [...gardes]) {
      for (const voisin of [i - ecart, i + ecart]) {
        if (gardes.size >= MAX_OPTIONS) break;
        if (voisin >= 0 && voisin < groupes.length) gardes.add(voisin);
      }
      if (gardes.size >= MAX_OPTIONS) break;
    }
    ecart += 1;
  }

  return groupes.filter((_, i) => gardes.has(i));
}

/**
 * Clef de libelle d'une option, pour i18n. `null` quand aucun mot n'ajoute rien.
 *
 * LA MAQUETTE MET UN MOT SOUS CHAQUE TUILE — << Sortie >>, << Tout droit >>, << Droite >>.
 * C'est ce qui rend trois tuiles lisibles la ou trois fleches seules se ressemblent : au
 * volant, on reconnait un mot plus vite qu'on ne compare deux angles.
 */
export function libelleOption(geste: GesteVoie): string {
  return `lane.${geste.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;
}

/* ------------------------------------------------------------------ */
/* Quand Valhalla ne connait pas les voies                             */
/* ------------------------------------------------------------------ */

/**
 * CE QUE LE CLIENT A CORRIGE LE 17 NOVEMBRE, ET IL AVAIT RAISON.
 *
 * << Les donnees Valhalla (maneuver.type + maneuver.highway + maneuver.length) sont
 * suffisantes. On ne demande pas une fleche par voie physique — on demande que la fleche
 * directionnelle recommandee clignote. Ce sont deux choses differentes. >>
 *
 * J'AVAIS CONFONDU LES DEUX. La rangee etait conditionnee a `lanes.length >= 2`, c'est-a-dire
 * au marquage au sol que Valhalla ne renvoie que la ou OpenStreetMap porte `turn:lanes`. Or
 * j'avais moi-meme compte ces tronçons le 15 novembre : CENT DOUZE dans toute la region
 * d'Alger. La rangee ne pouvait donc presque jamais apparaitre — et c'est exactement ce que le
 * client constatait en roulant, sans que le reste du dispositif soit en cause.
 *
 * `maneuver.type`, LUI, EST TOUJOURS LA. Il dit la direction a prendre : sortie a droite,
 * bifurcation a gauche, demi-tour. C'est tout ce qu'il faut pour dessiner la fleche
 * recommandee et la faire clignoter.
 *
 * ON NE REMPLACE PAS LES VOIES, ON LES COMPLETE. Quand le marquage existe, il reste meilleur :
 * il dit combien de files vont ou, pas seulement la direction. La deduction ci-dessous ne sert
 * que lorsqu'il manque.
 */
const GESTE_PAR_MANOEUVRE: Record<number, GesteVoie> = {
  9: 'legere-droite',
  10: 'droite',
  11: 'serree-droite',
  12: 'demi-tour',
  13: 'demi-tour',
  14: 'serree-gauche',
  15: 'gauche',
  16: 'legere-gauche',
  /* Les bretelles et les sorties : une bretelle droite se prend comme une sortie droite, et
   * le conducteur n'a pas a savoir que Valhalla les distingue. */
  18: 'legere-droite',
  19: 'legere-gauche',
  20: 'legere-droite',
  21: 'legere-gauche',
  23: 'legere-droite',
  24: 'legere-gauche',
  /* L'insertion a sa propre fleche depuis le 3 novembre : voir FlecheVoie. */
  25: 'rabattement',
};

/** Ce geste part-il vers la gauche ? Sert a ranger la rangee dans l'ordre de la chaussee. */
function versLaGauche(geste: GesteVoie): boolean {
  return geste.endsWith('gauche');
}

/**
 * Les options de direction deduites d'une manoeuvre, ou `null` s'il n'y a pas de choix a
 * presenter.
 *
 * DEUX TUILES, ET DEUX SEULEMENT : la direction a prendre, et << tout droit >> comme repere.
 * C'est ce que montrent les cases de la maquette ou il n'y a pas de marquage au sol —
 * << Tout droit | Droite >>, << Gauche | Tout droit >>, << Demi-tour | Tout droit >>.
 *
 * L'ORDRE SUIT LA CHAUSSEE : une direction a gauche se pose a gauche de la rangee, une
 * direction a droite a droite. Sans cela, le conducteur chercherait a gauche ce qui est a
 * droite — et la rangee lui couterait du temps au lieu de lui en faire gagner.
 *
 * `null` POUR UNE MANOEUVRE TOUT DROIT, et c'est un choix. La rangee existe pour dire DE QUEL
 * COTE se placer ; quand il n'y a rien a choisir, deux fleches identiques n'apprennent rien et
 * occupent le bandeau. La maquette montre bien un cas << restez voie principale >>, mais il
 * suppose de savoir qu'une sortie existe — ce que seul le marquage au sol dit. Inventer cette
 * sortie reviendrait a dessiner une route qu'on ne connait pas.
 */
export function optionsDeManoeuvre(type: number): OptionVoie[] | null {
  const geste = GESTE_PAR_MANOEUVRE[type];
  if (!geste) return null;

  const direction: OptionVoie = {
    geste,
    lane: { directions: 0, valid: 1, active: 1 },
    aPrendre: true,
    voies: 1,
  };
  const toutDroit: OptionVoie = {
    geste: 'tout-droit',
    lane: { directions: 0, valid: 0, active: 0 },
    aPrendre: false,
    voies: 1,
  };

  return versLaGauche(geste) ? [direction, toutDroit] : [toutDroit, direction];
}
