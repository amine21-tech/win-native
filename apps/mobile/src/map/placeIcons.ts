import type { PlaceCategory } from '../shared';
import type { SelectedPlace } from '../components/PlaceSheet';

/** Pictogramme par categorie WIN — reprend les 21 categories du formulaire d'ajout de lieu. */
const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  pharmacie: '💊',
  hopital: '🏥',
  clinique: '⚕️',
  medecin: '🩺',
  ecole: '🏫',
  universite: '🎓',
  mosquee: '🕌',
  administration: '🏛️',
  banque: '🏦',
  poste: '📮',
  commerce: '🛍️',
  restaurant: '🍽️',
  cafe: '☕',
  hotel: '🏨',
  station_service: '⛽',
  parking: '🅿️',
  garage: '🔧',
  immobilier: '🏠',
  transport: '🚌',
  sport: '⚽',
  autre: '📍',
};

/** Pictogramme au meilleur effort pour un resultat OpenStreetMap (Photon/Nominatim), qui ne
 * porte pas nos categories WIN mais des tags osm_key/osm_value ou un `type` Nominatim. */
const OSM_EMOJI: [RegExp, string][] = [
  [/restaurant|fast_food/i, '🍽️'],
  [/cafe/i, '☕'],
  [/pharmac/i, '💊'],
  [/hospital/i, '🏥'],
  [/clinic|doctors/i, '🩺'],
  [/school/i, '🏫'],
  [/university|college/i, '🎓'],
  [/mosque|place_of_worship/i, '🕌'],
  [/^bank$/i, '🏦'],
  [/post_office/i, '📮'],
  [/^shop$/i, '🛍️'],
  [/hotel/i, '🏨'],
  [/fuel/i, '⛽'],
  [/parking/i, '🅿️'],
  [/car_repair/i, '🔧'],
  [/estate_agent/i, '🏠'],
  [/bus_stop|bus_station/i, '🚌'],
  [/aerodrome|airport/i, '✈️'],
  [/train_station|railway/i, '🚆'],
  [/sports|pitch|stadium/i, '⚽'],
];

/** Pictogramme affiche pour un lieu sur la carte, a la place d'un simple point de couleur —
 * demande client : reconnaitre le type de lieu (restaurant, station, etc.) d'un coup d'oeil. */
export function emojiForPlace(place: Pick<SelectedPlace, 'category' | 'osmKey' | 'osmValue' | 'type'>): string {
  if (place.category) return CATEGORY_EMOJI[place.category];

  const tag = [place.osmValue, place.osmKey, place.type].filter(Boolean).join(' ');
  for (const [pattern, emoji] of OSM_EMOJI) {
    if (pattern.test(tag)) return emoji;
  }
  return '📍';
}

/**
 * Nom de l'image du pictogramme d'un lieu SUR LA CARTE, generee par scripts/make-place-glyphs.py.
 *
 * POURQUOI UNE IMAGE ET NON L'EMOJI LUI-MEME. La couche posait `'text-field': ['get','emoji']`,
 * et il ne s'affichait JAMAIS : aucune police servie avec nos tuiles ne contient d'emoji, et la
 * couche ne declarait meme pas de police, donc elle reclamait une famille par defaut que le
 * serveur ne sert pas non plus. Deux raisons de ne rien dessiner, et aucune erreur pour le
 * dire. Les lieux VIP montraient leur halo dore, vide au milieu ; les autres rien du tout.
 *
 * `emojiForPlace` RESTE, et sert toujours : les fiches de lieu, la destination et les listes
 * sont du React Native ordinaire, rendu par la police du systeme, qui a les emoji. C'est la
 * CARTE qui ne les a pas.
 */
export function imageLieu(categorie: PlaceCategory | null | undefined): string {
  return `lieu-${categorie && categorie in CATEGORY_EMOJI ? categorie : 'autre'}`;
}
