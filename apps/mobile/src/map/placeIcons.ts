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
