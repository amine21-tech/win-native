import { memo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, ToastAndroid } from 'react-native';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
import { appuiLangue, AU_REPOS, libelleProchain, type EtatCycle } from '../i18n/cycleLangue';
import { arreterClips, jouerClips } from '../speech/voixKab';
import { useSession } from '../store/session';
import type { Language } from '../shared';
import type { Palette } from '../theme';

/** Le cote du bouton, en points. C'est la taille demandee par le document du 21 novembre
 * (<< RÉDUIRE : 44dp -> 36dp >>), et elle reste au-dessus du minimum tactile parce que la
 * colonne lui laisse huit points d'air de chaque cote. */
const COTE = 36;

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
          backgroundColor: colors.surface,
          // Bordure rouge = muet, comme le demande le document ; or = la couleur des autres
          // commandes de cette colonne.
          borderColor: voixActive ? colors.goldDeep : colors.danger,
          borderWidth: voixActive ? 1.5 : 2.5,
        },
      ]}
    >
      <Text style={[styles.libelle, { color: voixActive ? colors.accentDark : colors.danger }]}>
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
  libelle: { fontSize: 14, fontWeight: '800' },
});
