/**
 * L'ECHELLE DU CURSEUR DE RAYON — point E.3 du 18 novembre, module Emploi.
 *
 * SEPARE DU COMPOSANT POUR POUVOIR ETRE EPROUVE. Un script de verification qui importerait
 * CurseurRayon.tsx tirerait react-native-svg puis React Native, et echouerait au chargement
 * avant d'avoir rien verifie. C'est la meme raison que degradeTrace.ts, gestes.ts et
 * voixKabRegles.ts — et elle vient de se verifier une fois de plus.
 *
 * L'ECHELLE N'EST PAS LINEAIRE, ET C'EST LE POINT DELICAT. De 1 a 2000 km sur la largeur d'un
 * telephone, un point vaut environ six kilometres : regler cinquante — la valeur par defaut,
 * et celle que presque tout le monde veut — demanderait de viser huit points depuis le bord
 * gauche. La moitie gauche de la course couvre donc 1 a 100 km, la moitie droite 100 a 2000.
 * On regle au doigt ce qu'on reglait a la loupe.
 *
 * Voir scripts/verifier-curseur-rayon.ts, qui mesure notamment combien de points separent
 * 50 de 60 km sur un ecran reel.
 */

/** Bornes du document : de zero a la plus grande distance utile en Algerie. */
export const RAYON_MIN_KM = 1;
export const RAYON_MAX_KM = 2000;
/** Charniere de l'echelle : la moitie de la course mene ici. */
const CHARNIERE_KM = 100;

/** Position du doigt (0 a 1) vers kilometres. */
export function rayonDepuisFraction(f: number): number {
  const borne = Math.min(1, Math.max(0, f));
  const km =
    borne <= 0.5
      ? RAYON_MIN_KM + (borne / 0.5) * (CHARNIERE_KM - RAYON_MIN_KM)
      : CHARNIERE_KM + ((borne - 0.5) / 0.5) * (RAYON_MAX_KM - CHARNIERE_KM);
  /* ARRONDI AU PAS UTILE, pas au kilometre : personne ne distingue 1240 de 1245 km, et un
   * nombre qui bouge de un en un donne l'impression d'un reglage qu'on ne maitrise pas. */
  const pas = km < 50 ? 5 : km < 200 ? 10 : km < 1000 ? 50 : 100;
  return Math.max(RAYON_MIN_KM, Math.round(km / pas) * pas);
}

/** Kilometres vers position du pouce (0 a 1). L'inverse exact de la fonction ci-dessus. */
export function fractionDepuisRayon(km: number): number {
  const borne = Math.min(RAYON_MAX_KM, Math.max(RAYON_MIN_KM, km));
  return borne <= CHARNIERE_KM
    ? ((borne - RAYON_MIN_KM) / (CHARNIERE_KM - RAYON_MIN_KM)) * 0.5
    : 0.5 + ((borne - CHARNIERE_KM) / (RAYON_MAX_KM - CHARNIERE_KM)) * 0.5;
}
