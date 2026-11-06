import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * LA VOIX TAMAZIGHT — des enregistrements, pas de la synthese.
 *
 * POURQUOI DES CLIPS ET NON LA SYNTHESE VOCALE. Android ne sait pas lire le kabyle. Aucun
 * telephone algerien n'embarque de voix tamazight, et il n'en existe pas a installer : la
 * demande passee a `Speech.speak` retombe silencieusement sur la langue du telephone, si bien
 * qu'un utilisateur qui choisit le tamazight se faisait guider en francais sans comprendre
 * pourquoi.
 *
 * Le client a donc fait enregistrer soixante-huit phrases par un locuteur. C'est la seule
 * facon d'avoir une voix tamazight, et elle a un avantage inattendu : un enregistrement humain
 * se comprend mieux au volant qu'une synthese, surtout dans le bruit d'un habitacle.
 *
 * CE QU'ELLE NE COUVRE PAS, ET QUI COMPTE. Soixante-huit phrases ne font pas une langue.
 * L'application annonce trente manoeuvres differentes et des distances calculees ; les
 * enregistrements en couvrent une partie. Quand la phrase n'existe pas, on retombe sur la
 * SYNTHESE FRANCAISE — decision du client. Le conducteur est toujours averti, meme si la
 * langue change le temps d'une annonce. Se taire serait pire : une manoeuvre non annoncee se
 * rate.
 *
 * LES CLIPS S'ENCHAINENT. << Dans 300 metres, tournez a droite >> est dit par DEUX fichiers
 * joues l'un apres l'autre. C'est ce qui permet a soixante-huit enregistrements de couvrir
 * plusieurs centaines de phrases — mais cela impose que chaque clip soit prononce comme un
 * morceau de phrase, sans chute de voix a la fin.
 *
 * LES FICHIERS SONT EMBARQUES, jamais telecharges. Une consigne de conduite doit se prononcer
 * dans un tunnel. Trois megaoctets dans l'APK, apres conversion en 16 kHz mono — voir
 * scripts/convertir-voix.py.
 *
 * LES `require` SONT ECRITS UN PAR UN, et c'est obligatoire : Metro les resout a la
 * COMPILATION et ne sait pas suivre un chemin calcule. Une boucle produirait un tableau vide a
 * l'execution, sans la moindre erreur.
 */
export const CLIPS = {
  accident: require('../../assets/voix/kab/accident.wav'),
  adresseIntrouvable: require('../../assets/voix/kab/adresseIntrouvable.wav'),
  aeroport: require('../../assets/voix/kab/aeroport.wav'),
  approcheDestination: require('../../assets/voix/kab/approcheDestination.wav'),
  arretBus: require('../../assets/voix/kab/arretBus.wav'),
  arrivee: require('../../assets/voix/kab/arrivee.wav'),
  attention: require('../../assets/voix/kab/attention.wav'),
  banque: require('../../assets/voix/kab/banque.wav'),
  bienvenue: require('../../assets/voix/kab/bienvenue.wav'),
  bouchon: require('../../assets/voix/kab/bouchon.wav'),
  d100m: require('../../assets/voix/kab/d100m.wav'),
  d10km: require('../../assets/voix/kab/d10km.wav'),
  d1km: require('../../assets/voix/kab/d1km.wav'),
  d200m: require('../../assets/voix/kab/d200m.wav'),
  d2km: require('../../assets/voix/kab/d2km.wav'),
  d300m: require('../../assets/voix/kab/d300m.wav'),
  d500m: require('../../assets/voix/kab/d500m.wav'),
  d50m: require('../../assets/voix/kab/d50m.wav'),
  d5km: require('../../assets/voix/kab/d5km.wav'),
  demiTour: require('../../assets/voix/kab/demiTour.wav'),
  destinationDroite: require('../../assets/voix/kab/destinationDroite.wav'),
  destinationGauche: require('../../assets/voix/kab/destinationGauche.wav'),
  destinationToutDroit: require('../../assets/voix/kab/destinationToutDroit.wav'),
  ditesDestination: require('../../assets/voix/kab/ditesDestination.wav'),
  gpsFaible: require('../../assets/voix/kab/gpsFaible.wav'),
  gpsPerdu: require('../../assets/voix/kab/gpsPerdu.wav'),
  gpsRetrouve: require('../../assets/voix/kab/gpsRetrouve.wav'),
  hopital: require('../../assets/voix/kab/hopital.wav'),
  horsLigne: require('../../assets/voix/kab/horsLigne.wav'),
  hotel: require('../../assets/voix/kab/hotel.wav'),
  internetPerdu: require('../../assets/voix/kab/internetPerdu.wav'),
  itineraireRecalcule: require('../../assets/voix/kab/itineraireRecalcule.wav'),
  mosquee: require('../../assets/voix/kab/mosquee.wav'),
  navigationArretee: require('../../assets/voix/kab/navigationArretee.wav'),
  navigationDemarree: require('../../assets/voix/kab/navigationDemarree.wav'),
  nouvelItineraire: require('../../assets/voix/kab/nouvelItineraire.wav'),
  parking: require('../../assets/voix/kab/parking.wav'),
  pharmacie: require('../../assets/voix/kab/pharmacie.wav'),
  plusieursResultats: require('../../assets/voix/kab/plusieursResultats.wav'),
  police: require('../../assets/voix/kab/police.wav'),
  pont: require('../../assets/voix/kab/pont.wav'),
  protectionCivile: require('../../assets/voix/kab/protectionCivile.wav'),
  radar: require('../../assets/voix/kab/radar.wav'),
  ralentir: require('../../assets/voix/kab/ralentir.wav'),
  ralentissez: require('../../assets/voix/kab/ralentissez.wav'),
  recalculEnCours: require('../../assets/voix/kab/recalculEnCours.wav'),
  recherche: require('../../assets/voix/kab/recherche.wav'),
  repriseItineraire: require('../../assets/voix/kab/repriseItineraire.wav'),
  restaurant: require('../../assets/voix/kab/restaurant.wav'),
  resterDroite: require('../../assets/voix/kab/resterDroite.wav'),
  resterGauche: require('../../assets/voix/kab/resterGauche.wav'),
  rondPoint: require('../../assets/voix/kab/rondPoint.wav'),
  sortie1: require('../../assets/voix/kab/sortie1.wav'),
  sortie2: require('../../assets/voix/kab/sortie2.wav'),
  sortie3: require('../../assets/voix/kab/sortie3.wav'),
  sortie4: require('../../assets/voix/kab/sortie4.wav'),
  sortieAutoroute: require('../../assets/voix/kab/sortieAutoroute.wav'),
  stationService: require('../../assets/voix/kab/stationService.wav'),
  supermarche: require('../../assets/voix/kab/supermarche.wav'),
  tournerDroite: require('../../assets/voix/kab/tournerDroite.wav'),
  tournerGauche: require('../../assets/voix/kab/tournerGauche.wav'),
  toutDroit: require('../../assets/voix/kab/toutDroit.wav'),
  travaux: require('../../assets/voix/kab/travaux.wav'),
  tunnelEntree: require('../../assets/voix/kab/tunnelEntree.wav'),
  tunnelSortie: require('../../assets/voix/kab/tunnelSortie.wav'),
  virageDangereux: require('../../assets/voix/kab/virageDangereux.wav'),
  vousVoulezDire: require('../../assets/voix/kab/vousVoulezDire.wav'),
  zoneScolaire: require('../../assets/voix/kab/zoneScolaire.wav'),
} as const;

/**
 * LES CLES VIVENT DANS voixKabRegles.ts, ET C'EST POUR POUVOIR LES EPROUVER.
 *
 * `require` d'un fichier .wav est resolu par Metro, pas par Node : un script de verification
 * qui importerait ce fichier-ci echouerait au chargement, avant d'avoir rien verifie. Les
 * regles — quel clip pour quelle distance, quel clip pour quelle manoeuvre — sont donc dans un
 * module voisin qui ne touche a aucun fichier. Meme raison que degradeTrace.ts et
 * alerteApproche.ts.
 *
 * Ce fichier-ci garde ce que Metro seul sait faire : les `require` et la lecture.
 */
export type { CleVoix } from './voixKabRegles';
export { clipDistance, clipManoeuvre } from './voixKabRegles';

import type { CleVoix } from './voixKabRegles';

/* ------------------------------------------------------------------ */
/* La lecture                                                          */
/* ------------------------------------------------------------------ */

/**
 * Lecteur unique, cree a la premiere annonce et jamais detruit.
 *
 * SEPARE DE CELUI DU CORAN, volontairement. Les deux peuvent jouer dans la meme session — on
 * ecoute une sourate en conduisant — et partager un lecteur ferait que chaque consigne de
 * conduite couperait la recitation sans la reprendre.
 */
let lecteur: AudioPlayer | null = null;
/** Clips restant a jouer dans l'annonce en cours. */
let file: number[] = [];

function obtenirLecteur(): AudioPlayer {
  if (lecteur) return lecteur;
  lecteur = createAudioPlayer();
  lecteur.addListener('playbackStatusUpdate', (status) => {
    if (!status.didJustFinish) return;
    const suivant = file.shift();
    if (suivant === undefined) return;
    lecteur!.replace(suivant);
    lecteur!.play();
  });
  return lecteur;
}

/**
 * Joue une suite de clips, en coupant ce qui parlait.
 *
 * ON COUPE, ET C'EST VOULU. Deux consignes qui se chevauchent ne s'entendent ni l'une ni
 * l'autre ; la plus recente est toujours la bonne, puisque le vehicule a avance.
 */
export function jouerClips(cles: readonly CleVoix[]): void {
  if (cles.length === 0) return;
  const sources = cles.map((c) => CLIPS[c] as number);
  const l = obtenirLecteur();
  file = sources.slice(1);
  l.replace(sources[0]!);
  l.play();
}

/** Arrete l'annonce en cours et vide la file. */
export function arreterClips(): void {
  file = [];
  lecteur?.pause();
}
