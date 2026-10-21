import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { create } from 'zustand';
import { urlsDe, type Recitation } from './recitations';

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
};

type Actions = {
  /** Lance une recitation, ou met en pause si c'est deja celle qui joue. */
  basculer: (r: Recitation) => void;
  /** Reprend ou suspend ce qui est en cours, sans rien recharger. */
  pauseOuReprise: () => void;
  /** Arrete tout et vide la barre. */
  arreter: () => void;
};

export const useQuranPlayer = create<Etat & Actions>((set, get) => ({
  enCours: null,
  joue: false,
  charge: false,

  basculer: (r) => {
    const lecteur = obtenirLecteur();
    if (get().enCours?.numero === r.numero) {
      get().pauseOuReprise();
      return;
    }
    indexSuite = 0;
    set({ enCours: r, charge: true, joue: false });
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
    set({ enCours: null, joue: false, charge: false });
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
        lecteur!.replace(urls[suivant]!);
        lecteur!.play();
        return;
      }
      useQuranPlayer.setState({ enCours: null, joue: false, charge: false });
      return;
    }

    useQuranPlayer.setState({
      joue: status.playing,
      // Demande, mais ni charge ni en train de jouer : le fichier arrive encore.
      charge: !status.playing && !status.isLoaded,
    });
  });

  return lecteur;
}
