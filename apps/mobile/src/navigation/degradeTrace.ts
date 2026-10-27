/**
 * Degrade du trace de navigation : progression ET trafic, en un seul degrade.
 *
 * POURQUOI UNE SEULE FONCTION PLUTOT QUE DEUX COUCHES SUPERPOSEES. MapLibre ne sait pas melanger
 * deux `line-gradient` sur la meme ligne, et poser une seconde ligne par-dessus ferait un
 * bourrelet a chaque raccord. On compose donc les deux informations dans le meme degrade : la
 * couleur d'un point est celle de son bouchon s'il y en a un, sinon celle de sa progression.
 *
 * LA METHODE. On ne balaie pas la ligne, on ne calcule que les POINTS DE RUPTURE — le vehicule,
 * et les deux bords de chaque bande de trafic. Entre deux ruptures la couleur ne change pas, et
 * MapLibre interpole. Une dizaine de paliers suffit donc a decrire un trajet de 300 km.
 *
 * CE FICHIER EST SEPARE DE L'ECRAN POUR POUVOIR ETRE EPROUVE. Les paliers d'une interpolation
 * doivent croitre STRICTEMENT : un seul palier qui ne progresse pas fait rejeter la couche
 * ENTIERE par MapLibre, et le trace disparait — sans message, sans erreur, sans rien. Le defaut
 * ne se verrait que sur un telephone, en pleine navigation. Voir scripts/verifier-degrade.ts.
 */

/** Ecart minimal entre deux paliers : assez petit pour que la transition paraisse nette. */
export const COUPURE = 0.0008;

export type BandeTrafic = { debut: number; fin: number; couleur: string };

/** Une liste de paliers, telle que MapLibre l'attend : position, couleur, position, couleur… */
export type Paliers = (number | string)[];

export function paliersDuTrace(
  parcouru: string,
  avant: string,
  fait: number,
  bandes: BandeTrafic[],
  /** Teinte une couleur de bande pour la portion deja parcourue. */
  attenuer: (couleur: string) => string,
): Paliers {
  const couleurEn = (x: number): string => {
    const bande = bandes.find((b) => x >= b.debut && x <= b.fin);
    if (bande) return x <= fait ? attenuer(bande.couleur) : bande.couleur;
    return x <= fait ? parcouru : avant;
  };

  const bornes = new Set<number>([0, 1]);
  if (fait > 0) {
    bornes.add(fait);
    bornes.add(fait + COUPURE);
  }
  for (const b of bandes) {
    bornes.add(b.debut - COUPURE);
    bornes.add(b.debut);
    bornes.add(b.fin);
    bornes.add(b.fin + COUPURE);
  }

  const paliers: Paliers = [];
  let dernier = -1;
  for (const brut of [...bornes].sort((a, b) => a - b)) {
    const x = Math.min(1, Math.max(0, brut));
    if (x <= dernier) continue;
    dernier = x;
    paliers.push(x, couleurEn(x));
  }
  return paliers;
}
