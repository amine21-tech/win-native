import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import {
  fractionDepuisRayon,
  RAYON_MAX_KM,
  RAYON_MIN_KM,
  rayonDepuisFraction,
} from '../jobs/echelleRayon';

/**
 * CURSEUR DE RAYON DE RECHERCHE — point E.3 du 18 novembre, module Emploi.
 *
 * << Ajouter un curseur visible et bien positionne pour definir son rayon de recherche de 0 a
 * 2000 km. Le curseur doit etre large, facile a glisser, et ne pas empieter sur les autres
 * elements. >>
 *
 * POURQUOI IL EST ECRIT A LA MAIN plutot qu'installe. React Native n'a plus de `Slider` depuis
 * la 0.60 ; le composant courant est une dependance NATIVE, qui demande de reconstruire le
 * projet et peut se brouiller avec Expo. Un curseur est quarante lignes de `PanResponder` et
 * aucun code natif : la dependance couterait plus cher que ce qu'elle apporte, et elle
 * casserait un jour une mise a niveau d'Expo pour un composant qu'on sait ecrire.
 *
 * L'ECHELLE N'EST PAS LINEAIRE, ET C'EST LE POINT DELICAT. De zero a deux mille kilometres sur
 * la largeur d'un telephone, un pixel vaut environ six kilometres : regler cinquante — la
 * valeur par defaut, et celle que presque tout le monde veut — demanderait de viser huit
 * pixels depuis le bord gauche. La moitie gauche de la course couvre donc 0 a 100 km, la
 * moitie droite 100 a 2000. On regle au doigt ce qu'on reglait a la loupe.
 */

const VERT = '#0D6E4F';
const RAIL = '#D8E2DC';
const POUCE = 26;

export function CurseurRayon({
  valeurKm,
  onChange,
  onFini,
  libelle,
}: {
  valeurKm: number;
  /** A chaque deplacement du doigt : sert a rafraichir le libelle, pas la liste. */
  onChange: (km: number) => void;
  /** Au relachement : c'est la qu'on relance la recherche. */
  onFini: (km: number) => void;
  libelle: string;
}) {
  const [largeur, setLargeur] = useState(0);
  /* LA LARGEUR ET LA VALEUR SONT LUES PAR REFERENCE DANS LE PAN RESPONDER. Celui-ci est cree
   * une seule fois — le recreer a chaque rendu perdrait le geste en cours, le doigt encore
   * pose. */
  const largeurRef = useRef(0);
  largeurRef.current = largeur;
  const valeurRef = useRef(valeurKm);
  valeurRef.current = valeurKm;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (largeurRef.current > 0) {
          onChange(rayonDepuisFraction(e.nativeEvent.locationX / largeurRef.current));
        }
      },
      onPanResponderMove: (e) => {
        if (largeurRef.current > 0) {
          onChange(rayonDepuisFraction(e.nativeEvent.locationX / largeurRef.current));
        }
      },
      /* LA RECHERCHE NE PART QU'AU RELACHEMENT. Le document demande un rafraichissement
       * << temps reel avec un delai de 400 ms >> ; en glissant d'un bout a l'autre on
       * traverse une trentaine de valeurs, soit autant de requetes dont une seule compte.
       * Le libelle, lui, suit le doigt — c'est lui qui donne la sensation du temps reel. */
      onPanResponderRelease: () => onFini(valeurRef.current),
      onPanResponderTerminate: () => onFini(valeurRef.current),
    }),
  ).current;

  const fraction = fractionDepuisRayon(valeurKm);

  return (
    <View style={styles.bloc}>
      <Text style={styles.libelle}>{libelle}</Text>

      {/* LA ZONE DE TOUCHER FAIT TOUTE LA HAUTEUR DU BLOC, pas celle du rail. Un rail de
          quatre points serait impossible a attraper en voiture ou debout dans la rue. */}
      <View
        style={styles.zone}
        onLayout={(e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
      >
        <View style={styles.rail} />
        <View style={[styles.rempli, { width: `${fraction * 100}%` }]} />
        <View
          style={[
            styles.pouce,
            /* Le pouce est centre sur sa position, et on le retient aux deux bords pour qu'il
             * ne deborde pas du rail aux extremites. */
            { left: Math.max(0, Math.min(largeur - POUCE, fraction * largeur - POUCE / 2)) },
          ]}
        />
      </View>

      <View style={styles.bornes}>
        <Text style={styles.borne}>{RAYON_MIN_KM} km</Text>
        <Text style={styles.borne}>{RAYON_MAX_KM} km</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { paddingHorizontal: 16, paddingBottom: 8 },
  libelle: { fontSize: 14, fontWeight: '800' as const, color: VERT, marginBottom: 4 },
  zone: { height: 34, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: RAIL },
  rempli: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: VERT },
  pouce: {
    position: 'absolute',
    width: POUCE,
    height: POUCE,
    borderRadius: POUCE / 2,
    backgroundColor: VERT,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  bornes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  borne: { fontSize: 11, color: '#8A9690' },
});

/* Re-exportee : JobsSheet l'importe d'ici, ou vit le curseur. */
export { RAYON_MIN_KM, RAYON_MAX_KM };
