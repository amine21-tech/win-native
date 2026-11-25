import { memo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
import { appuiDirect, AU_REPOS, type EtatCycle } from '../i18n/cycleLangue';
import { arreterClips, jouerClips } from '../speech/voixKab';
import { useSession } from '../store/session';
import type { Language } from '../shared';
import type { Palette } from '../theme';

/**
 * LES DEUX BOUTONS DE LANGUE DE LA COLONNE DE NAVIGATION — relance v3, 25 novembre, URGENT 2.
 *
 *   << URGENT 2 — TAMAZIGHT · Carre Derija present · Carre Tamazight ABSENT. >>
 *   << Bouton 1 (DEJA PRESENT) : "Derija" en grand (latin) · دارجة en arabe dessous.
 *      Bouton 2 (A AJOUTER) : "Tamazight" en grand (latin) · ⵜⴰⵎⴰⵣⵉⵖⵜ en Tifinagh dessous ·
 *      meme taille. Les 2 boutons : colonne gauche · empiles verticalement · texte latin PLUS
 *      GRAND que la version actuelle. Ne rien casser du reste. >>
 *
 * CE QU'IL Y AVAIT, ET CE QUE CELA EXPLIQUE. Il n'y avait pas deux boutons mais UN SEUL, qui
 * tournait : il affichait << Derija >>, puis << Tamazight >>, puis << Retour >>, et le mot
 * changeait a chaque appui. Sur sa capture d'Azeffoun, ce bouton montrait << Derija >> — donc
 * le carre tamazight etait bel et bien absent de l'ecran, exactement comme il le dit. Il
 * n'etait pas perdu : il etait derriere un appui. Ce n'est pas ce qu'il demande, et deux
 * boutons qui NOMMENT valent mieux au volant qu'un bouton qu'il faut avoir compris.
 *
 * LE CYCLE N'EST PAS SUPPRIME POUR AUTANT (cycleLangue.ts, `appuiLangue`) : il est verifie par
 * son propre controle et il reste exact. Seul l'ECRAN change, et il appelle desormais
 * `appuiDirect`.
 *
 * LE CHEMIN DU RETOUR EST GARDE, ET C'EST LE POINT QUI NE SE VOIT PAS DANS LA MAQUETTE. Avec
 * deux boutons seulement, un conducteur qui essaie le tamazight par curiosite n'aurait plus
 * aucun moyen de revenir au francais pendant le trajet : le selecteur de l'accueil est sous le
 * bandeau de navigation, hors d'atteinte. UN APPUI SUR LA LANGUE DEJA ACTIVE — celle dont le
 * bouton est allume — ramene donc a la langue d'avant. Le troisieme palier du cycle est garde
 * entier, attache au seul bouton qui le rende evident.
 *
 * ================================================================================
 * LA TAILLE : CE QUE LE DOCUMENT DEMANDE, ET CE QUE LA PHYSIQUE PERMET
 * ================================================================================
 *
 * << Taille de police plus grande (minimum 18sp) >> pour la ligne latine, << meme carre >>.
 * LES DEUX ENSEMBLE SONT IMPOSSIBLES, et il faut le dire plutot que de choisir en silence.
 * << Tamazight >> fait neuf lettres ; une lettre de Roboto Bold mesure environ 0,56 fois la
 * taille de la police. A dix-huit points, le mot demande donc 91 points de large — le carre de
 * cinquante-deux de la version precedente n'en offre que 41. Il n'y a aucun reglage de police,
 * aucun espacement, aucun repli qui fasse entrer 91 dans 41.
 *
 * CE QUI A ETE CHOISI, ET POURQUOI. Les deux boutons deviennent deux RECTANGLES de cent quatre points
 * sur quarante-huit, identiques entre eux, et la ligne latine garde ses dix-huit points. Le mot
 * << illisible en conduite >> est le reproche d'origine, deux documents de suite : c'est la
 * lisibilite qu'on sauve, et c'est la forme carree qu'on perd. Le carre n'a jamais ete demande
 * POUR LUI-MEME — il vient de l'epoque ou le bouton portait << DZ >>.
 *
 * CE QUE CES CENT POINTS NE TOUCHENT PAS. La colonne de navigation n'a pas de largeur imposee :
 * elle prend celle de son plus large enfant et centre les autres (voir NavigationOverlay). En
 * portrait, la camera est calee a `left: 0` et le vehicule reste au milieu de l'ecran, soit
 * vers 180 points sur un telephone courant — la colonne s'arrete a 116. Aucun recouvrement.
 *
 * ================================================================================
 * LES COULEURS D'IDENTITE — point 1 du 22 novembre, conserve mot pour mot
 * ================================================================================
 *
 *   << Bouton Derija (vert WIN) : fond vert fonce, texte dore, bordure verte. Bouton
 *   Tamazight : fond brun-rouge berbere, texte dore, bordure doree. >>
 *
 * Chaque bouton porte MAINTENANT SA PROPRE identite en permanence, ce qui est plus simple que
 * la version precedente : elles suivaient le mot affiche, parce que le mot changeait.
 */

/** Largeur des deux boutons, en points. Voir l'arithmetique en tete de fichier. */
const LARGEUR = 104;
/** Hauteur des deux boutons : dix-huit points de latin, quatorze d'ecriture native, et l'air. */
const HAUTEUR = 48;

/** La ligne latine, en points. C'est le minimum ecrit dans le document. */
const TAILLE_LATIN = 18;
/** La seconde ligne, en ecriture native. Valeur du document. */
const TAILLE_NATIVE = 14;

type Identite = {
  langue: Language;
  /** Ligne 1 : la phonetique latine, celle qui se lit en roulant. */
  latin: string;
  /** Ligne 2 : l'ecriture native, pleine et entiere. */
  native: string;
  fond: string;
  texte: string;
  bord: string;
};

/**
 * LES DEUX BOUTONS, DANS L'ORDRE OU ILS SONT EMPILES.
 *
 * << Carre Tamazight EN DESSOUS de Derija >>, et le darija d'abord pour la raison que le client
 * donnait deja le 22 novembre : << Derija en 1er car langue la plus parlee en Algerie >>.
 *
 * L'ORTHOGRAPHE LATINE DU TAMAZIGHT CHANGE ENTRE DEUX DE SES DOCUMENTS : << Tamazirt >> le 18
 * novembre, qui est ce que porte le selecteur de l'accueil, et << Tamazight >> ici. On suit ce
 * document-ci pour ce bouton-ci, puisqu'il le nomme ; l'accueil n'est pas touche, et l'ecart
 * est a lui signaler plutot qu'a trancher seul.
 */
const BOUTONS: readonly Identite[] = [
  {
    langue: 'dz',
    latin: 'Derija',
    native: 'دارجة',
    // Le vert WIN du bandeau Emploi et du bandeau de navigation.
    fond: '#0A4A24',
    texte: '#F0B429',
    bord: '#0A4A24',
  },
  {
    langue: 'kab',
    latin: 'Tamazight',
    /* TIFINAGH, l'alphabet officiel, et l'orthographe corrigee le 18 novembre : ⵜⴰⵎⴰⵣⵉⵖⵜ
     * (Tamaziɣt) nomme la LANGUE, la ou ⴰⵎⴰⵣⵉⵖ (Amaziɣ) nomme la personne. */
    native: 'ⵜⴰⵎⴰⵣⵉⵖⵜ',
    // Le brun-rouge berbere, avec la bordure doree que le document demande.
    fond: '#7A3B1F',
    texte: '#F0B429',
    bord: '#F0B429',
  },
];

/** L'or de la bordure qui dit << c'est la langue en cours >>. */
const OR_ACTIF = '#F0B429';

type Props = {
  colors: Palette;
};

/**
 * RACCOURCI TAMAZIGHT / DERIJA PENDANT LE TRAJET — point 6 du 21 novembre, deux boutons depuis
 * la relance v3.
 *
 * DEUX GESTES PAR BOUTON, et c'est le document du 21 novembre qui les demande ainsi : appui
 * court pour la langue, appui long pour couper la voix. Le second geste ne rajoute aucun etat a
 * l'application — il appelle l'interrupteur de voix QUI EXISTE DEJA dans les reglages
 * (`toggleVoiceGuidance`), si bien qu'une voix coupee ici se retrouve coupee la-bas, et se garde
 * d'un lancement a l'autre. C'etait la seule facon de ne pas avoir deux verites sur le meme
 * sujet. L'appui long est porte par LES DEUX boutons : le conducteur ne doit pas avoir a se
 * souvenir duquel.
 *
 * CE QUE LE DOCUMENT ANNONCE ET QUE L'APPLICATION NE PEUT PAS TENIR : << Clic Derija ->
 * voix/texte arabe >>. L'audio darija n'a jamais ete enregistre — les deux envois du locuteur ne
 * contiennent que du kabyle (voir Header.tsx, meme constat au 18 novembre). L'appui sur Derija
 * change donc la langue des TEXTES et affiche le message de bienvenue ECRIT, sans rien
 * annoncer a voix haute. Jouer autre chose — une synthese, un clip voisin — irait contre la
 * regle qui tient depuis le 9 novembre : en tamazight, les enregistrements ou rien. Le jour ou
 * les fichiers arrivent, une ligne suffit.
 *
 * POURQUOI L'ETAT DU CYCLE VIT DANS UN `useRef` ET NON DANS UN `useState`. Il ne se dessine
 * nulle part : seul l'etat allume depend de la langue active, et celle-la, i18next l'annonce de
 * son cote. Le garder dans un etat ferait un rendu de plus par appui, sur l'ecran ou chaque
 * rendu compte le plus.
 */
export const BoutonLangueNav = memo(function BoutonLangueNav({ colors }: Props) {
  const { i18n, t } = useTranslation();
  const voixActive = useSession((s) => s.voiceGuidanceEnabled);
  const basculerVoix = useSession((s) => s.toggleVoiceGuidance);
  const cycle = useRef<EtatCycle>(AU_REPOS);
  /* Un simple compteur pour redessiner apres un appui : la langue change bien, mais le PALIER
   * du cycle, lui, ne traverse pas i18next. */
  const [, redessiner] = useState(0);

  const actuelle = (i18n.language as Language) ?? 'fr';

  const appui = (cible: Language) => {
    const { etat, langue } = appuiDirect(cycle.current, actuelle, cible);
    cycle.current = etat;
    changeLanguage(langue);
    /* LA BIENVENUE KABYLE, comme sur l'accueil : c'est le premier mot qu'on entend dans sa
     * langue. On la saute quand la voix est coupee — l'appui long vient d'etre fait pour cela. */
    if (langue === 'kab' && voixActive) jouerClips(['bienvenue']);
    /* LE MESSAGE DE BIENVENUE ECRIT, DANS LA LANGUE CHOISIE. C'est ce que le document appelle
     * << texte >>, et c'est la seule part du << voix + texte >> que le darija puisse tenir. */
    if (Platform.OS === 'android') {
      ToastAndroid.show(i18n.t('app.bienvenue', { lng: langue }), ToastAndroid.SHORT);
    }
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

  return (
    <>
      {BOUTONS.map((bouton) => {
        const actif = actuelle === bouton.langue;
        /* TROIS ETATS DE BORDURE, ET L'ORDRE DE PRIORITE EST CELUI DU 22 NOVEMBRE : une voix
         * coupee est un etat ANORMAL qu'il faut reperer d'un coup d'oeil, donc le rouge passe
         * devant tout. Vient ensuite l'or epais de la langue en cours, puis la bordure
         * d'identite du bouton au repos. */
        const bord = !voixActive ? colors.danger : actif ? OR_ACTIF : bouton.bord;
        const epaisseur = !voixActive || actif ? 2.5 : 1.5;
        return (
          <Pressable
            key={bouton.langue}
            onPress={() => appui(bouton.langue)}
            onLongPress={appuiLong}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={`${bouton.latin} — ${bouton.native}`}
            accessibilityHint={t('nav.langueRaccourciAide')}
            style={[
              styles.bouton,
              { backgroundColor: bouton.fond, borderColor: bord, borderWidth: epaisseur },
            ]}
          >
            <View style={styles.lignes}>
              {/* LA LIGNE LATINE, ET TROIS GARDE-FOUS PLUTOT QU'UN — point A du correctif v2,
                  garde tel quel parce que le defaut qu'il repare n'a pas disparu avec le carre.
                  `numberOfLines={1}` interdit le repli (<< "Tamazigh" + "t" sur une 2e ligne ->
                  illisible en conduite >>), `adjustsFontSizeToFit` reduit le mot au lieu de le
                  couper si la place manque quand meme, et `allowFontScaling={false}` est le
                  garde-fou QUI EXPLIQUE CE QU'ON AVAIT VU : un telephone regle sur une grande
                  police multiplie la taille par 1,15 ou 1,3, et le calcul tombe. Le bouton est
                  de taille FIXE — la police ne peut pas grandir sans le casser. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                allowFontScaling={false}
                style={[styles.latin, { color: voixActive ? bouton.texte : colors.danger }]}
              >
                {bouton.latin}
              </Text>
              {/* L'ECRITURE NATIVE, EN DESSOUS ET ENTIERE. Elle n'est pas la pour etre lue en
                  roulant — la ligne latine est la pour cela — mais parce que c'est la langue
                  telle qu'elle s'ecrit. */}
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={[styles.native, { color: voixActive ? bouton.texte : colors.danger }]}
              >
                {bouton.native}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </>
  );
});

const styles = StyleSheet.create({
  bouton: {
    width: LARGEUR,
    height: HAUTEUR,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  lignes: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  /* DIX-HUIT POINTS : le minimum ecrit dans le document, et la raison pour laquelle le bouton
   * n'est plus carre. L'arithmetique est en tete de fichier. */
  latin: { fontSize: TAILLE_LATIN, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  native: { fontSize: TAILLE_NATIVE, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
});
