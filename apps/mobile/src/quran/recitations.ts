/**
 * Recitations du Coran proposees dans l'ecran Qibla.
 *
 * Le choix du recitateur vient du client : Ali Jaber (علي جابر), voix connue et posee. Les
 * fichiers sont ceux de mp3quran.net, diffuses librement, et servis par un CDN qui accepte la
 * lecture par morceaux — on ECOUTE donc sans rien telecharger, ce qui compte sur un forfait
 * algerien : Al-Baqara pese plus de cent megaoctets.
 *
 * La liste est volontairement COURTE. Les 114 sourates tiendraient dans un defilement, mais
 * cet ecran n'est pas une application de Coran : c'est l'ecran de la Qibla, ou l'on vient pour
 * s'orienter avant la priere. On y trouve donc ce qu'on y cherche a ce moment-la — la Fatiha,
 * le verset du Trone, les sourates qu'on recite le vendredi ou le soir — et rien de plus.
 */
export type Recitation = {
  /** Numero de la sourate, tel qu'il nomme le fichier sur le serveur (001 a 114). */
  numero: number;
  /** Nom arabe, affiche en grand : c'est lui qu'on cherche des yeux. */
  arabe: string;
  /** Translitteration, pour qui ne lit pas l'arabe. */
  latin: string;
  /** Duree approximative, affichee pour qu'on sache a quoi s'engager avant d'appuyer. */
  duree: string;
  /** Les trois protectrices se suivent : un seul fichier ne les contient pas toutes. */
  suite?: number[];
};

export const RECITATIONS: Recitation[] = [
  { numero: 1, arabe: 'الفاتحة', latin: 'Al-Fatiha', duree: '~1 min' },
  { numero: 2, arabe: 'البقرة', latin: 'Al-Baqara', duree: '~2 h' },
  { numero: 18, arabe: 'الكهف', latin: 'Al-Kahf', duree: '~45 min' },
  { numero: 36, arabe: 'يس', latin: 'Ya-Sin', duree: '~25 min' },
  { numero: 55, arabe: 'الرحمن', latin: 'Ar-Rahman', duree: '~20 min' },
  { numero: 67, arabe: 'الملك', latin: 'Al-Mulk', duree: '~15 min' },
  {
    numero: 112,
    arabe: 'المعوذات',
    latin: 'Al-Ikhlas · Al-Falaq · An-Nas',
    duree: '~2 min',
    // Trois sourates, trois fichiers, joues a la suite.
    suite: [112, 113, 114],
  },
];

export const RECITATEUR = 'Ali Jaber';

const SERVEUR = 'https://cdn.mp3quran.net/audio/ali-jaber/r1';

/** Adresse du fichier d'une sourate. Le serveur nomme ses fichiers sur trois chiffres. */
export function urlSourate(numero: number): string {
  return `${SERVEUR}/${String(numero).padStart(3, '0')}.mp3`;
}

/** Les fichiers a enchainer pour une entree de la liste. */
export function urlsDe(r: Recitation): string[] {
  return (r.suite ?? [r.numero]).map(urlSourate);
}
