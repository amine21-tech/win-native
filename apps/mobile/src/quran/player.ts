import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { create } from 'zustand';
import { urlsDe, type Recitation } from './recitations';
import { bornerPosition, decalerPosition } from './seekbar';

/**
 * LE LECTEUR VIT EN DEHORS DE L'ECRAN QUI L'A LANCE.
 *
 * Il etait jusqu'ici construit par `useAudioPlayer` A L'INTERIEUR de la section Coran, donc a
 * l'interieur du panneau Qibla. Or un `Modal` de React Native demonte son contenu des qu'il se
 * ferme : quitter la Qibla detruisait le lecteur, et la recitation s'arretait au milieu d'un
 * verset. C'etait documente comme un choix ; c'etait en realite une limite.
 *
 * Le client demande de pouvoir REDUIRE la boussole et continuer a ecouter en conduisant. Cela
 * suppose que le lecteur ne depende plus d'aucun ecran. Il est donc cree une seule fois, ici,
 * au niveau du module — et c'est la raison pour laquelle on n'utilise pas le crochet.
 *
 * CE QUE CELA NE FAIT PAS, et il faut etre precis : ceci ne joue pas en ARRIERE-PLAN. Tant que
 * l'application est a l'ecran, la recitation continue d'un ecran a l'autre. Des que l'on quitte
 * l'application ou que l'ecran s'eteint, Android coupe le son — le faire survivre exigerait un
 * second service de premier plan, donc une declaration supplementaire chez Google, alors que
 * celle du guidage bloque deja la publication.
 */

type Etat = {
  /** Recitation en cours, ou `null` quand rien ne joue. */
  enCours: Recitation | null;
  /** Le son sort reellement des haut-parleurs. */
  joue: boolean;
  /** Demande mais pas encore arrive : le reseau travaille. */
  charge: boolean;
  /**
   * OU L'ON EN EST, EN SECONDES — point 4 du 22 novembre.
   *
   * Le lecteur annonce sa position toutes les cinq cents millisecondes (c'est le defaut
   * d'`expo-audio`, et il tombe juste : le document cite mille millisecondes pour une barre
   * Android, et cinq cents donnent un curseur qui glisse sans a-coup).
   *
   * C'EST LA POSITION DANS LE FICHIER EN COURS, et non dans la recitation entiere : les trois
   * protectrices sont trois fichiers qui s'enchainent. Voir la note de `quran/seekbar`.
   */
  position: number;
  /** Duree du fichier en cours, en secondes. `0` tant que le lecteur n'a pas lu son entete. */
  duree: number;
};

type Actions = {
  /** Lance une recitation, ou met en pause si c'est deja celle qui joue. */
  basculer: (r: Recitation) => void;
  /** Reprend ou suspend ce qui est en cours, sans rien recharger. */
  pauseOuReprise: () => void;
  /** Arrete tout et vide la barre. */
  arreter: () => void;
  /**
   * Saute a une position donnee, en secondes — le glissement sur la barre.
   *
   * ELLE ECRIT L'ETAT TOUT DE SUITE, sans attendre la reponse du lecteur. `seekTo` est une
   * promesse, et la prochaine annonce de position arrive jusqu'a cinq cents millisecondes plus
   * tard : sans cette ecriture immediate, le curseur reviendrait sous le doigt avant de
   * repartir. C'est le defaut classique des barres audio, et il se voit.
   */
  allerA: (secondes: number) => void;
  /** Avance ou recule de `delta` secondes — les deux boutons du document. */
  decaler: (delta: number) => void;
};

export const useQuranPlayer = create<Etat & Actions>((set, get) => ({
  enCours: null,
  joue: false,
  charge: false,
  position: 0,
  duree: 0,

  basculer: (r) => {
    const lecteur = obtenirLecteur();
    if (get().enCours?.numero === r.numero) {
      get().pauseOuReprise();
      return;
    }
    indexSuite = 0;
    /* La barre repart de zero, et sa longueur redevient inconnue : le fichier precedent ne
     * dit rien de celui-ci. Sans ces deux remises, la barre afficherait une seconde la duree
     * de la sourate qu'on vient de quitter. */
    set({ enCours: r, charge: true, joue: false, position: 0, duree: 0 });
    lecteur.replace(urlsDe(r)[0]!);
    lecteur.play();
  },

  pauseOuReprise: () => {
    const lecteur = obtenirLecteur();
    if (get().joue) lecteur.pause();
    else lecteur.play();
  },

  arreter: () => {
    // `pause` et non `remove` : le lecteur est partage et doit rester utilisable. Le liberer
    // ici le detruirait pour tout le monde — c'est exactement l'erreur qui rendait l'ecran
    // blanc a la fermeture de la Qibla (voir QuranSection).
    lecteur?.pause();
    indexSuite = 0;
    set({ enCours: null, joue: false, charge: false, position: 0, duree: 0 });
  },

  allerA: (secondes) => {
    const { duree } = get();
    const visee = bornerPosition(secondes, duree);
    /* RIEN A FAIRE SANS DUREE CONNUE : le lecteur n'a pas encore lu l'entete du fichier, et
     * `seekTo` sur une position qu'on ne peut pas borner coupe la lecture sur certaines
     * versions d'Android. La barre est alors vide, et personne ne peut l'avoir glissee. */
    if (duree <= 0) return;
    set({ position: visee });
    void obtenirLecteur().seekTo(visee);
  },

  decaler: (delta) => {
    const { position, duree } = get();
    get().allerA(decalerPosition(position, delta, duree));
  },
}));

/** Lecteur unique, cree a la premiere ecoute et jamais detruit. */
let lecteur: AudioPlayer | null = null;
/** Position dans la suite, pour les trois protectrices qui s'enchainent. */
let indexSuite = 0;

function obtenirLecteur(): AudioPlayer {
  if (lecteur) return lecteur;

  /* Le son ne doit PAS etre coupe par le mode silencieux : quelqu'un qui lance une sourate
   * veut l'entendre, meme si son telephone est en silencieux pour les notifications. */
  void setAudioModeAsync({ playsInSilentMode: true });

  lecteur = createAudioPlayer();
  lecteur.addListener('playbackStatusUpdate', (status) => {
    const { enCours } = useQuranPlayer.getState();

    /* Fin d'un fichier. Les trois protectrices sont trois sourates distinctes : un seul
     * fichier ne les contient pas toutes, et on enchaine. */
    if (status.didJustFinish && enCours) {
      const urls = urlsDe(enCours);
      const suivant = indexSuite + 1;
      if (suivant < urls.length) {
        indexSuite = suivant;
        /* Nouveau fichier, nouvelle barre : la duree de la sourate precedente ne vaut plus. */
        useQuranPlayer.setState({ position: 0, duree: 0 });
        lecteur!.replace(urls[suivant]!);
        lecteur!.play();
        return;
      }
      useQuranPlayer.setState({ enCours: null, joue: false, charge: false, position: 0, duree: 0 });
      return;
    }

    /* << CHARGE >> COUVRE DEUX SITUATIONS, et n'en couvrait qu'une.
     *
     * L'ancienne regle etait `ni en train de jouer, ni charge`. Elle attrapait le DEBUT — le
     * fichier n'est pas encore arrive — mais pas la PAUSE FORCEE en cours de route : quand la
     * reserve se vide sur une connexion faible, le fichier reste charge et la lecture
     * s'arrete. On tombait alors dans ni l'un ni l'autre, et le bouton revenait a << lecture >>
     * sans un mot. Vu de l'utilisateur, le son s'arrete tout seul et rien ne l'explique —
     * c'est exactement ce que le client decrit sur Al-Baqara.
     *
     * `isBuffering` dit precisement cela : le lecteur veut jouer, et attend des octets. */
    const attend = status.isBuffering || (!status.playing && !status.isLoaded);
    useQuranPlayer.setState({
      joue: status.playing,
      charge: attend && useQuranPlayer.getState().enCours !== null,
      /**
       * LA POSITION ET LA DUREE ARRIVENT PAR LE MEME CANAL QUE LE RESTE — point 4.
       *
       * Il n'y a donc PAS de minuterie a cote : le document propose un `handler.postDelayed`
       * qui relit la position chaque seconde, et c'est la facon de faire d'un lecteur Android
       * nu. Ici l'annonce existe deja, toutes les cinq cents millisecondes, et elle s'arrete
       * d'elle-meme quand la lecture s'arrete. Une minuterie en plus serait un second compteur
       * a demarrer, a arreter et a oublier d'arreter.
       *
       * `duration` vaut zero jusqu'a ce que l'entete du fichier soit lu, et c'est exactement
       * ce que la barre doit afficher pendant ce temps : vide, et sans duree annoncee.
       */
      position: Number.isFinite(status.currentTime) ? status.currentTime : 0,
      duree: Number.isFinite(status.duration) && status.duration > 0 ? status.duration : 0,
    });
  });

  return lecteur;
}
