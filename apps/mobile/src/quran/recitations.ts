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
import { apiBase } from '../api/client';

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
  /**
   * Adresse complete, quand le fichier ne vient PAS du serveur habituel.
   *
   * AL-BAQARA EST LE SEUL CAS, et il vaut d'etre explique. Le client signalait un probleme de
   * son sur cette sourate et sur elle seule. Mesure des sept fichiers, le 2 novembre :
   *
   *     Al-Fatiha   192 kbps     1,3 Mo
   *     AL-BAQARA   320 kbps   237,6 Mo   <- seule a 320
   *     Al-Kahf     192 kbps    39,8 Mo
   *     Ya-Sin      192 kbps    17,8 Mo
   *     Ar-Rahman   192 kbps    12,3 Mo
   *     Al-Mulk     192 kbps     8,5 Mo
   *     Al-Ikhlas   160 kbps     0,4 Mo
   *
   * Trois cent vingt kilobits par seconde, c'est QUARANTE kilo-octets a recevoir chaque
   * seconde, pendant une heure quarante-trois, sans interruption. Sur une connexion mobile
   * algerienne, la moindre faiblesse vide la reserve du lecteur et le son se coupe. Les autres
   * sourates tiennent parce qu'elles demandent moitie moins, et surtout parce qu'elles sont
   * courtes : un fichier de huit minutes se remplit d'avance, pas un de deux heures.
   *
   * On prend donc la meme recitation, du meme recitateur, en 128 kbps : 120 Mo au lieu de 238,
   * soit seize kilo-octets par seconde. Le reste de la liste ne bouge pas — on ne change pas
   * ce qui marche.
   *
   * AUCUN DE CES FICHIERS N'A DE TABLE DE RECHERCHE (ni Xing, ni Info, ni VBRI). Se deplacer
   * dans la sourate est donc approximatif, chez l'une comme chez l'autre : ce n'est pas une
   * regression, c'est ainsi depuis le debut.
   */
  url?: string;
  /**
   * Fichier servi par NOTRE serveur, pour ce qui n'existe pas en sourate entiere.
   *
   * Le verset du Trone est le verset 255 d'Al-Baqara : aucun fichier de sourate ne le contient
   * seul, et lancer Al-Baqara pour l'entendre voudrait dire traverser deux heures de
   * recitation. On garde donc chez nous le seul extrait dont on a besoin — 400 ko, decoupes
   * par un service qui publie le Coran verset par verset, du meme recitateur.
   */
  fichierLocal?: string;
};

export const RECITATIONS: Recitation[] = [
  { numero: 1, arabe: 'الفاتحة', latin: 'Al-Fatiha', duree: '~1 min' },
  {
    numero: 2,
    arabe: 'البقرة',
    latin: 'Al-Baqara',
    duree: '~2 h',
    // 128 kbps au lieu de 320 : voir la note sur `url`. Meme recitateur, meme recitation.
    url: 'https://download.quranicaudio.com/quran/ali_jaber/002.mp3',
  },
  {
    numero: 255,
    arabe: 'آية الكرسي',
    latin: 'Ayat Al-Kursi',
    duree: '~1 min',
    fichierLocal: 'ayat-al-kursi.mp3',
  },
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
  if (r.fichierLocal) return [`${apiBase()}/uploads/audio/${r.fichierLocal}`];
  if (r.url) return [r.url];
  return (r.suite ?? [r.numero]).map(urlSourate);
}
