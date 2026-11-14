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

/**
 * LES MARQUEURS COMPLETS DE LA CARTE — maquette du 13 novembre.
 *
 * CE QU'ILS REMPLACENT. Le marqueur etait compose PAR LA CARTE : un cercle de la couleur du
 * type, un anneau par-dessus, et un pictogramme blanc en troisieme couche. Trois couches, trois
 * expressions de style, et une couleur qui venait de la donnee.
 *
 * La maquette en demande un autre : pastille pale, anneau de la couleur de la CATEGORIE, et
 * l'EMOJI en couleur au milieu — le meme que celui du menu de signalement. Un emoji ne peut pas
 * etre compose par la carte : il est dessine a l'avance, et le marqueur devient UNE image.
 *
 * TROIS COUCHES DEVIENNENT UNE, et ce n'est pas qu'une economie de lignes : la couleur, la
 * taille de l'anneau et la place du dessin etaient reparties entre trois endroits qui devaient
 * s'accorder. Elles sont maintenant dans un seul fichier, scripts/make-report-markers.py.
 *
 * Les `require` sont ecrits UN PAR UN : Metro les resout a la compilation et ne sait pas suivre
 * un chemin calcule. Une boucle produirait une table vide a l'execution, sans erreur.
 */
export const MARQUEURS_SIGNALISATION: Record<ReportKind, number> = {
  jam: require('../../assets/map/marker-jam.png'),
  crash: require('../../assets/map/marker-crash.png'),
  police: require('../../assets/map/marker-police.png'),
  gendarmerie: require('../../assets/map/marker-gendarmerie.png'),
  armee: require('../../assets/map/marker-armee.png'),
  block: require('../../assets/map/marker-block.png'),
  works: require('../../assets/map/marker-works.png'),
  bump: require('../../assets/map/marker-bump.png'),
  radar: require('../../assets/map/marker-radar.png'),
  object: require('../../assets/map/marker-object.png'),
  pothole: require('../../assets/map/marker-pothole.png'),
  flood: require('../../assets/map/marker-flood.png'),
  fire: require('../../assets/map/marker-fire.png'),
  waste: require('../../assets/map/marker-waste.png'),
};
