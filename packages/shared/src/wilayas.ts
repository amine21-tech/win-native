import { countryFromCoords, haversine } from './geo.js';
import { DZ_WILAYA_NAMES } from './search.js';

/**
 * LES CHEFS-LIEUX DES 58 WILAYAS, pour savoir dans laquelle se trouve l'utilisateur.
 *
 * POURQUOI LE CHEF-LIEU LE PLUS PROCHE ET NON LA FRONTIERE REELLE. Repondre exactement
 * demanderait le contour de chaque wilaya — cinquante-huit polygones, plusieurs megaoctets,
 * telecharges puis tenus a jour. Pour une BANNIERE D'AVERTISSEMENT, c'est payer tres cher une
 * precision qui ne change rien : la seule chose qui depende de ce calcul est une ligne de
 * texte en plus, << Vous etes dans une zone concernee >>.
 *
 * Le client le dit lui-meme et accepte l'approximation : pres d'une limite entre deux wilayas,
 * la voisine peut etre choisie. Quelqu'un a trois kilometres de la limite de Bouira verra
 * peut-etre << Tizi Ouzou >>, et il n'a pas tort de se sentir concerne : la pluie ne s'arrete
 * pas non plus a la limite administrative.
 *
 * CELA MARCHE SANS INTERNET, et c'est la vraie raison de tout garder ici. L'alerte doit
 * s'afficher a l'ouverture de l'application, en douze secondes, parfois dans une zone sans
 * reseau — c'est-a-dire exactement la ou une route coupee se decouvre trop tard. Demander la
 * wilaya a un serveur ajouterait une panne possible au moment le plus mauvais.
 *
 * LES COORDONNEES SONT CELLES DU CHEF-LIEU, pas du centre geometrique de la wilaya. C'est ce
 * qui correspond au besoin : la population se concentre autour du chef-lieu, et un centre
 * geometrique placerait Tamanrasset au milieu d'un desert vide a trois cents kilometres de la
 * ville.
 */

export type ChefLieu = {
  /** Le nom tel que WIN l'affiche, repris a l'identique de DZ_WILAYA_NAMES. */
  nom: string;
  lat: number;
  lon: number;
};

export const CHEFS_LIEUX: readonly ChefLieu[] = [
  { nom: 'Adrar', lat: 27.8743, lon: -0.2939 },
  { nom: 'Chlef', lat: 36.1654, lon: 1.3345 },
  { nom: 'Laghouat', lat: 33.8, lon: 2.865 },
  { nom: 'Oum El Bouaghi', lat: 35.8753, lon: 7.1134 },
  { nom: 'Batna', lat: 35.556, lon: 6.1741 },
  { nom: 'Béjaïa', lat: 36.7509, lon: 5.0567 },
  { nom: 'Biskra', lat: 34.8504, lon: 5.7281 },
  { nom: 'Béchar', lat: 31.6167, lon: -2.2167 },
  { nom: 'Blida', lat: 36.4703, lon: 2.8277 },
  { nom: 'Bouira', lat: 36.374, lon: 3.902 },
  { nom: 'Tamanrasset', lat: 22.785, lon: 5.5228 },
  { nom: 'Tébessa', lat: 35.4042, lon: 8.1242 },
  { nom: 'Tlemcen', lat: 34.8828, lon: -1.3167 },
  { nom: 'Tiaret', lat: 35.3711, lon: 1.317 },
  { nom: 'Tizi Ouzou', lat: 36.7118, lon: 4.0458 },
  { nom: 'Alger', lat: 36.7538, lon: 3.0588 },
  { nom: 'Djelfa', lat: 34.6703, lon: 3.263 },
  { nom: 'Jijel', lat: 36.819, lon: 5.7667 },
  { nom: 'Sétif', lat: 36.1911, lon: 5.4137 },
  { nom: 'Saïda', lat: 34.8303, lon: 0.1517 },
  { nom: 'Skikda', lat: 36.8762, lon: 6.9094 },
  { nom: 'Sidi Bel Abbès', lat: 35.1878, lon: -0.6308 },
  { nom: 'Annaba', lat: 36.9, lon: 7.7667 },
  { nom: 'Guelma', lat: 36.4621, lon: 7.4261 },
  { nom: 'Constantine', lat: 36.365, lon: 6.6147 },
  { nom: 'Médéa', lat: 36.2675, lon: 2.7539 },
  { nom: 'Mostaganem', lat: 35.9315, lon: 0.0894 },
  { nom: "M'Sila", lat: 35.7058, lon: 4.5419 },
  { nom: 'Mascara', lat: 35.3968, lon: 0.14 },
  { nom: 'Ouargla', lat: 31.9493, lon: 5.3254 },
  { nom: 'Oran', lat: 35.6971, lon: -0.6308 },
  { nom: 'El Bayadh', lat: 33.6831, lon: 1.0192 },
  { nom: 'Illizi', lat: 26.4833, lon: 8.4667 },
  { nom: 'Bordj Bou Arréridj', lat: 36.0731, lon: 4.7614 },
  { nom: 'Boumerdès', lat: 36.7667, lon: 3.4772 },
  { nom: 'El Tarf', lat: 36.7672, lon: 8.3139 },
  { nom: 'Tindouf', lat: 27.6711, lon: -8.1475 },
  { nom: 'Tissemsilt', lat: 35.6072, lon: 1.8111 },
  { nom: 'El Oued', lat: 33.3683, lon: 6.8675 },
  { nom: 'Khenchela', lat: 35.4361, lon: 7.1436 },
  { nom: 'Souk Ahras', lat: 36.2864, lon: 7.9511 },
  { nom: 'Tipaza', lat: 36.5892, lon: 2.4486 },
  { nom: 'Mila', lat: 36.4503, lon: 6.2644 },
  { nom: 'Aïn Defla', lat: 36.2642, lon: 1.9678 },
  { nom: 'Naâma', lat: 33.2667, lon: -0.3133 },
  { nom: 'Aïn Témouchent', lat: 35.2983, lon: -1.14 },
  { nom: 'Ghardaïa', lat: 32.49, lon: 3.67 },
  { nom: 'Relizane', lat: 35.7372, lon: 0.5558 },
  { nom: 'Timimoun', lat: 29.2639, lon: 0.2306 },
  { nom: 'Bordj Badji Mokhtar', lat: 21.3289, lon: 0.955 },
  { nom: 'Ouled Djellal', lat: 34.4167, lon: 5.0667 },
  { nom: 'Béni Abbès', lat: 30.1286, lon: -2.1694 },
  { nom: 'In Salah', lat: 27.1967, lon: 2.48 },
  { nom: 'In Guezzam', lat: 19.5686, lon: 5.7725 },
  { nom: 'Touggourt', lat: 33.1, lon: 6.0667 },
  { nom: 'Djanet', lat: 24.5542, lon: 9.4844 },
  { nom: "El M'Ghair", lat: 33.9542, lon: 5.9244 },
  { nom: 'El Meniaa', lat: 30.5833, lon: 2.8833 },
];

/**
 * Au-dela de cette distance du chef-lieu le plus proche, on n'attribue aucune wilaya.
 *
 * Trois cents kilometres : le pays est vaste et le Sahara peu peuple — un conducteur peut
 * legitimement se trouver a deux cents kilometres de Tamanrasset en etant toujours dans sa
 * wilaya.
 *
 * CETTE DISTANCE NE SUFFIT PAS A ELLE SEULE, et c'est le controle automatique qui l'a montre :
 * Tunis est a moins de deux cents kilometres d'El Tarf, donc largement dans la portee. Une
 * limite de distance ne peut pas distinguer un pays d'un autre la ou la frontiere est proche —
 * il aurait fallu la reduire au point de perdre le Sahara. On regarde donc d'abord LE PAYS,
 * avec la fonction qui sert deja a etiqueter les adresses, puis la distance.
 */
export const PORTEE_CHEF_LIEU_M = 300_000;

/**
 * La wilaya de l'utilisateur : celle du chef-lieu le plus proche de sa position.
 *
 * Renvoie `null` quand la position est inconnue ou trop loin du pays. Le `null` compte autant
 * que le reste : il correspond a la << variante A >> des maquettes, ou la banniere s'affiche
 * avec la liste des zones mais sans la ligne << Vous etes dans une zone concernee >>. Ne rien
 * savoir n'est pas une raison de se taire.
 */
export function wilayaLaPlusProche(position: { lat: number; lon: number } | null): string | null {
  if (!position) return null;
  /* HORS D'ALGERIE, AUCUNE WILAYA. WIN guide aussi en Tunisie et en France : un conducteur a
   * Tunis ou a Marseille ne doit pas se voir annoncer qu'il est << dans une zone concernee >>
   * par une vigilance algerienne. */
  if (countryFromCoords(position.lat, position.lon) !== 'DZ') return null;

  let meilleure: ChefLieu | null = null;
  let meilleureDistance = Infinity;
  for (const c of CHEFS_LIEUX) {
    const d = haversine(position.lat, position.lon, c.lat, c.lon);
    if (d < meilleureDistance) {
      meilleureDistance = d;
      meilleure = c;
    }
  }
  if (!meilleure || meilleureDistance > PORTEE_CHEF_LIEU_M) return null;
  return meilleure.nom;
}

/**
 * L'utilisateur est-il dans l'une des wilayas concernees ?
 *
 * UNE LISTE VIDE VEUT DIRE << TOUTE L'ALGERIE >>, et donc oui des que la wilaya est connue.
 * C'est la regle du client pour la vigilance foret, qui ne coche aucune wilaya : la lire a
 * l'envers afficherait la banniere a personne, exactement l'inverse de ce qu'on veut.
 */
export function dansLesZones(wilayaUtilisateur: string | null, zones: readonly string[]): boolean {
  if (!wilayaUtilisateur) return false;
  if (zones.length === 0) return true;
  return zones.includes(wilayaUtilisateur);
}

/**
 * La liste des zones telle que la banniere l'ecrit : six noms, puis << +N >>.
 *
 * C'est la variante B des maquettes. Au-dela de six, la carte grandirait jusqu'a couvrir la
 * recherche et les categories — et une liste de quinze wilayas ne se lit de toute facon pas en
 * douze secondes au volant. Le nombre restant suffit a dire << c'est tres large >>.
 */
export const ZONES_AFFICHEES_MAX = 6;

export function resumerZones(zones: readonly string[]): string {
  if (zones.length <= ZONES_AFFICHEES_MAX) return zones.join(' · ');
  const montrees = zones.slice(0, ZONES_AFFICHEES_MAX).join(' · ');
  return `${montrees} · +${zones.length - ZONES_AFFICHEES_MAX}`;
}

/** Garde-fou : la liste des chefs-lieux doit couvrir exactement les wilayas de reference. */
export function chefsLieuxComplets(): boolean {
  if (CHEFS_LIEUX.length !== DZ_WILAYA_NAMES.length) return false;
  const noms = new Set(CHEFS_LIEUX.map((c) => c.nom));
  return DZ_WILAYA_NAMES.every((n) => noms.has(n));
}
