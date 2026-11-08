import type { ReportKind } from '../shared';

/**
 * LES PICTOGRAMMES DE SIGNALISATION, declares une seule fois pour toute l'application.
 *
 * POURQUOI UN FICHIER A PART PLUTOT QUE DANS L'ECRAN DE CARTE. Ils etaient declares dans
 * app/index.tsx, ou seule la carte s'en servait. Depuis le 2 novembre, la carte d'alerte
 * d'approche montre le MEME marqueur que la carte — le client le demande en ces termes :
 * << les mêmes design et couleur >>. Deux tableaux d'images auraient fini par diverger, et
 * c'est precisement ce que la demande cherche a eviter.
 *
 * ILS SONT ECRITS UN PAR UN, ET C'EST OBLIGATOIRE. `require` est resolu a la COMPILATION par
 * Metro, qui doit lire un chemin litteral. Une boucle sur les types donnerait un chemin
 * calcule, que Metro ne sait pas suivre — et les images manqueraient a l'execution, sans la
 * moindre erreur dans la console. Le defaut ne se verrait que sur un telephone, en regardant
 * la carte.
 *
 * Les images sont produites par scripts/make-report-glyphs.py : un dessin blanc sur fond
 * transparent, pose sur le disque colore que dessine la carte. Le pictogramme ne porte donc
 * aucune couleur — c'est le fond qui en porte une, et c'est ce qui permet a la meme image de
 * servir sur la carte de jour comme sur celle de nuit.
 */
export const PICTOS_SIGNALISATION: Record<ReportKind, number> = {
  jam: require('../../assets/map/sig-jam.png'),
  crash: require('../../assets/map/sig-crash.png'),
  police: require('../../assets/map/sig-police.png'),
  gendarmerie: require('../../assets/map/sig-gendarmerie.png'),
  armee: require('../../assets/map/sig-armee.png'),
  block: require('../../assets/map/sig-block.png'),
  works: require('../../assets/map/sig-works.png'),
  bump: require('../../assets/map/sig-bump.png'),
  radar: require('../../assets/map/sig-radar.png'),
  object: require('../../assets/map/sig-object.png'),
  pothole: require('../../assets/map/sig-pothole.png'),
  flood: require('../../assets/map/sig-flood.png'),
  fire: require('../../assets/map/sig-fire.png'),
  waste: require('../../assets/map/sig-waste.png'),
};
