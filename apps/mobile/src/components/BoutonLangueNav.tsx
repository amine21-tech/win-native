import { memo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, ToastAndroid } from 'react-native';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
import {
  appuiLangue,
  AU_REPOS,
  libelleProchain,
  prochaineLangue,
  type EtatCycle,
} from '../i18n/cycleLangue';
import { arreterClips, jouerClips } from '../speech/voixKab';
import { useSession } from '../store/session';
import type { Language } from '../shared';
import type { Palette } from '../theme';

/**
 * Le cote du bouton, en points — 52 depuis le correctif v2, et c'est LE MOT QUI LES RECLAME.
 *
 * SON HISTOIRE EN TROIS LIGNES. 36 le 21 novembre, par une erreur de lecture de ma part : le
 * << 44dp -> 36dp >> de ce document-la ne visait pas ce bouton mais celui d'ALERTE, qui
 * debordait sur le cadre vert. 44 le 22 novembre, la valeur ecrite noir sur blanc. 52
 * aujourd'hui, parce que le client a vu le mot se couper et que le point A autorise lui-meme ce
 * reglage : << ou ajuster la largeur du bouton >>.
 *
 * L'ARITHMETIQUE, QUI EST AUSSI CELLE DU CONTROLE. << Tamazight >> fait neuf lettres ; une
 * lettre de Roboto Bold mesure environ 0,56 fois la taille de la police. A huit points, le mot
 * demande donc 40 points. Un bouton de 44 portant sa bordure epaisse (2,5 de chaque cote, le
 * cas de l'audio coupe) n'en offre que 39 : il manquait un point et demi, et c'est ce point et
 * demi qui renvoyait le << t >> a la ligne suivante. A 52, il en reste 47.
 *
 * REDUIRE ENCORE LA POLICE ETAIT L'AUTRE VOIE, ET ON L'A ECARTEE : a sept points le mot tenait
 * dans 44, mais le reproche du client est justement que le bouton est << illisible en
 * conduite >>. On ne repond pas a un probleme de lisibilite en rapetissant le texte.
 *
 * CE QUE CES HUIT POINTS NE TOUCHENT PAS. La colonne reste large de 58 — c'est le compteur de
 * vitesse qui la fixe, et 52 passe dessous. Sa hauteur totale passe de 258 a 266 points sur les
 * 667 d'un ecran courant : il en reste 75 libres. Le controle des chevauchements refait les
 * deux calculs a chaque execution, et mesure le mot dans le bouton.
 */
const COTE = 52;

/**
 * LES COULEURS D'IDENTITE DU BOUTON — point 1 du 22 novembre.
 *
 * << Bouton Derija (vert WIN) : fond vert fonce, texte dore, bordure verte. Bouton Tamazight :
 * fond brun-rouge berbere, texte dore, bordure doree. >>
 *
 * ELLES SUIVENT LE MOT AFFICHE, c'est-a-dire la langue OU L'ON VA — pas celle qui est active.
 * Le bouton annonce sa destination, et il doit en porter la couleur : un bouton vert qui
 * emmene au tamazight dirait le contraire de ce qu'il fait.
 *
 * LE RETOUR GARDE LES COULEURS DE L'APPLICATION. Quand le bouton annonce << FR >>, << AR >> ou
 * << EN >>, il ne va vers aucune des deux identites : lui donner l'une des deux couleurs
 * laisserait croire qu'on y retourne. Il reprend donc l'or et la surface des autres commandes
 * de la colonne, comme le bouton de vue d'ensemble juste au-dessus.
 */
const IDENTITES: Record<string, { fond: string; texte: string; bord: string }> = {
  // Le vert WIN du bandeau Emploi et du bandeau de navigation.
  dz: { fond: '#0A4A24', texte: '#F0B429', bord: '#0A4A24' },
  // Le brun-rouge berbere, avec la bordure doree que le document demande.
  kab: { fond: '#7A3B1F', texte: '#F0B429', bord: '#F0B429' },
};

type Props = {
  colors: Palette;
};

/**
 * RACCOURCI TAMAZIGHT / DERIJA PENDANT LE TRAJET — point 6 du 21 novembre.
 *
 * << Le selecteur de langue existe deja sur l'ecran d'accueil. Objectif : ajouter un bouton dans
 * la colonne gauche de navigation pour basculer en Tamazight ou Derija sans quitter le trajet. >>
 *
 * UN BOUTON, DEUX GESTES, et c'est le document qui le demande ainsi : appui court pour la langue,
 * appui long pour couper la voix. Le second geste ne rajoute aucun etat a l'application — il
 * appelle l'interrupteur de voix QUI EXISTE DEJA dans les reglages (`toggleVoiceGuidance`), si
 * bien qu'une voix coupee ici se retrouve coupee la-bas, et se garde d'un lancement a l'autre.
 * C'etait la seule facon de ne pas avoir deux verites sur le meme sujet.
 *
 * CE QUE LE DOCUMENT ANNONCE ET QUE L'APPLICATION NE PEUT PAS TENIR : << 2e tap -> voix Derija
 * + message de bienvenue >>. L'audio darija n'a jamais ete enregistre — les deux envois du
 * locuteur ne contiennent que du kabyle (voir Header.tsx, meme constat au 18 novembre). Le
 * deuxieme appui change donc la langue des TEXTES sans rien annoncer. Jouer autre chose — une
 * synthese, un clip voisin — irait contre la regle qui tient depuis le 9 novembre : en
 * tamazight, les enregistrements ou rien. Le jour ou les fichiers arrivent, une ligne suffit.
 *
 * POURQUOI L'ETAT DU CYCLE VIT DANS UN `useRef` ET NON DANS UN `useState`. Il ne se dessine
 * nulle part : seul le libelle en depend, et le libelle se recalcule a chaque changement de
 * langue, que i18next annonce de son cote. Le garder dans un etat ferait un rendu de plus par
 * appui, sur l'ecran ou chaque rendu compte le plus.
 */
export const BoutonLangueNav = memo(function BoutonLangueNav({ colors }: Props) {
  const { i18n, t } = useTranslation();
  const voixActive = useSession((s) => s.voiceGuidanceEnabled);
  const basculerVoix = useSession((s) => s.toggleVoiceGuidance);
  const cycle = useRef<EtatCycle>(AU_REPOS);
  /* Un simple compteur pour redessiner le libelle apres un appui : la langue change bien, mais
   * le PALIER du cycle, lui, ne traverse pas i18next. */
  const [, redessiner] = useState(0);

  const actuelle = (i18n.language as Language) ?? 'fr';

  const appui = () => {
    const { etat, langue } = appuiLangue(cycle.current, actuelle);
    cycle.current = etat;
    changeLanguage(langue);
    /* LA BIENVENUE KABYLE, comme sur l'accueil : c'est le premier mot qu'on entend dans sa
     * langue. On la saute quand la voix est coupee — l'appui long vient d'etre fait pour cela. */
    if (langue === 'kab' && voixActive) jouerClips(['bienvenue']);
    redessiner((n) => n + 1);
  };

  const appuiLong = () => {
    if (voixActive) arreterClips(); // on coupe AUSSI l'annonce en cours, pas seulement la suivante
    basculerVoix();
    /**
     * LE MESSAGE EPHEMERE QUE DEMANDE LE DOCUMENT (<< Audio desactive >> / << Audio reactive >>).
     *
     * IL NE REMPLACE PAS LA BORDURE ROUGE, IL LA COMPLETE, et c'est la bordure qui compte : un
     * message disparait en deux secondes, et le conducteur qui regarde la route a ce
     * moment-la ne saura jamais si son appui long a ete compris. L'etat doit se lire en
     * permanence sur le bouton. Le message, lui, confirme le geste a celui qui regardait.
     *
     * `ToastAndroid` n'existe que sur Android : c'est la seule plateforme sur laquelle WIN est
     * distribue, et le garde evite une erreur si cela change un jour.
     */
    if (Platform.OS === 'android') {
      ToastAndroid.show(t(voixActive ? 'nav.audioCoupe' : 'nav.audioRetabli'), ToastAndroid.SHORT);
    }
  };

  /* La langue VISEE decide du mot et des couleurs : le bouton annonce ou il emmene. */
  const visee = prochaineLangue(cycle.current, actuelle);
  const identite = IDENTITES[visee] ?? {
    fond: colors.surface,
    texte: colors.accentDark,
    bord: colors.goldDeep,
  };

  return (
    <Pressable
      onPress={appui}
      onLongPress={appuiLong}
      accessibilityRole="button"
      accessibilityLabel={t('nav.langueRaccourci')}
      accessibilityHint={t('nav.langueRaccourciAide')}
      style={[
        styles.bouton,
        {
          backgroundColor: identite.fond,
          /* LA BORDURE ROUGE PASSE DEVANT L'IDENTITE, et c'est le bon ordre de priorite : une
           * voix coupee est un etat ANORMAL qu'il faut pouvoir reperer d'un coup d'oeil, alors
           * que la couleur de langue n'est qu'un rappel de ce que le mot dit deja. */
          borderColor: voixActive ? identite.bord : colors.danger,
          borderWidth: voixActive ? 1.5 : 2.5,
        },
      ]}
    >
      {/* UNE SEULE LIGNE, ET TROIS GARDE-FOUS PLUTOT QU'UN — point A du correctif v2.
       *
       * << ACTUEL : le bouton affiche "Tamazigh" + "t" sur une 2e ligne -> illisible en
       * conduite. CORRECTION : afficher "Tamazight" sur UNE SEULE ligne. >>
       *
       * `numberOfLines={1}` interdit le repli, `adjustsFontSizeToFit` reduit le mot au lieu de
       * le couper si la place manque quand meme, et `allowFontScaling={false}` est le garde-fou
       * QUI EXPLIQUE CE QU'ON A VU. A huit points le mot tient dans les quarante-et-un points
       * utiles du bouton ; mais un telephone regle sur une grande police multiplie la taille
       * par 1,15 ou 1,3, et le calcul tombe. C'est un bouton de taille FIXE : la police ne peut
       * pas grandir sans le casser, et le mot doit rester lisible pour tout le monde — ce que
       * deux lignes coupees ne font pour personne. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
        style={[styles.libelle, { color: voixActive ? identite.texte : colors.danger }]}
      >
        {libelleProchain(cycle.current, actuelle)}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bouton: {
    width: COTE,
    height: COTE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  /* HUIT POINTS, ET C'EST UNE MESURE, PAS UN GOUT — point A du correctif v2.
   *
   * On etait a 9, la taille que le document du 22 novembre ecrivait (<< android:textSize="9sp"
   * >>), et le client a vu le mot coupe : en gras, une lettre de Roboto fait environ 0,56 fois
   * la taille de la police, donc << Tamazight >> — neuf lettres — demande 45 points quand le
   * bouton de 44 en offre 41 entre ses bordures. A huit, le mot demande 40 points : il passe.
   *
   * Le document autorise cet ecart lui-meme (<< reduire legerement la taille de police si
   * necessaire, ex. 10sp -> 8sp >>) et il arrive a la meme valeur par le meme raisonnement. */
  libelle: { fontSize: 8, lineHeight: 10, fontWeight: '800', textAlign: 'center' },
});
