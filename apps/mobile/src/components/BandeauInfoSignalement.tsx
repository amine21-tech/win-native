import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistance } from '../shared';
import type { Report } from '../shared';
import { SIGNALISATION } from '../map/signalisation';
import { radius, spacing } from '../theme';

/**
 * LA BARRE D'INFORMATION D'UN SIGNALEMENT A VENIR — point 6 du 9 novembre.
 *
 * << Alerte dans la barre d'info (ex : 'Bouchon dans 300m') lorsqu'on est a moins de 500m. >>
 *
 * ELLE NE PARLE PAS, ET C'EST LE POINT DELICAT DE CE CORRECTIF.
 *
 * Le document demande une alerte a cinq cents metres. Mais le 2 novembre, apres avoir essaye les
 * deux au volant, le client avait ramene la VOIX a un seul palier de 150 m, en expliquant
 * pourquoi : deux annonces pour un seul dos d'ane, c'est deux fois l'attention detournee de la
 * route, et la seconde arrive au moment ou l'on franchit l'obstacle, donc trop tard pour servir.
 *
 * Les deux consignes ne se contredisent pas des qu'on lit la seconde a la lettre : elle parle
 * d'une BARRE D'INFO, c'est-a-dire d'un texte a l'ecran. Rien dans le point 6 ne demande que la
 * voix parle a cinq cents metres. L'oeil est donc prevenu tot, l'oreille une seule fois — et les
 * deux decisions du client tiennent ensemble.
 *
 * ELLE EST DESORMAIS LE SEUL INDICATEUR — decision d'arsanne, le 16 novembre, apres essai au
 * volant. Une CARTE d'alerte prenait le relais a 150 m : un bloc de la hauteur d'un tiers
 * d'ecran, avec deux boutons. Elle disait la meme chose que cette barre, en occupant dix fois
 * la place, au moment precis ou le conducteur a besoin de voir la route. Elle est supprimee.
 *
 * << C'est visible et c'est tres tres discret. Ca prend pas de place. >> C'est exactement ce
 * qu'on demande a un avertissement en conduisant : etre vu sans etre regarde.
 *
 * LA BARRE NE S'EFFACE DONC PLUS A 150 M. Elle accompagne le signalement depuis cinq cents
 * metres jusqu'au passage, et sa distance descend : << dans 300 m >>, << dans 150 m >>,
 * << dans 30 m >>. La voix, elle, garde son unique annonce a 150 m.
 *
 * LA DISTANCE SE MET A JOUR, et c'est la moitie de son utilite : << dans 300 m >> puis
 * << dans 200 m >> dit qu'on approche, la ou un texte fixe laisse croire a un affichage oublie.
 */

/** Distance d'apparition, en metres. Valeur du document. */
export const BANDEAU_INFO_M = 500;

export function BandeauInfoSignalement({
  report,
  distanceM,
  top,
  left,
  right,
  onCouper,
}: {
  /** Le signalement a venir, ou `null` pour masquer la barre. */
  report: Report | null;
  distanceM: number;
  top: number;
  left: number;
  right: number;
  /** Coupe les alertes de proximite. Voir l'interrupteur ci-dessous. */
  onCouper: () => void;
}) {
  const { t } = useTranslation();

  /* LA PASTILLE DE L'INTERRUPTEUR GLISSE, elle n'apparait pas a sa place d'un coup.
   *
   * CE N'EST PAS DE L'ORNEMENT. Un interrupteur qui change d'etat sans bouger laisse un doute :
   * a-t-on appuye ? Le glissement de cent cinquante millisecondes est ce qui fait qu'on sait,
   * du coin de l'oeil et sans relire, que l'appui a ete pris. C'est la seule animation de cette
   * barre, et elle ne tourne que lorsqu'on y touche.
   *
   * Elle est declaree AVANT le `return null` : un hook ne peut pas etre appele apres un retour
   * conditionnel. */
  const glisse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    glisse.setValue(1);
  }, [glisse, report?.id]);

  if (!report) return null;

  const couper = () => {
    Animated.timing(glisse, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(onCouper);
  };

  /* LA COULEUR DU TYPE, variante de JOUR. La barre a un fond clair fixe dans les deux themes —
   * c'est la regle du depot depuis le menu de signalement du 26 octobre : un texte dont le fond
   * est fige doit l'etre aussi, sinon il disparait en mode nuit. */
  const couleur = SIGNALISATION[report.kind]?.jour ?? '#B8860B';

  return (
    /* `pointerEvents` passe de << none >> a << box-none >> : la barre elle-meme ne doit
       toujours pas intercepter les appuis destines a la carte, mais l'interrupteur, lui, doit
       les recevoir. << box-none >> dit exactement cela — le conteneur est transparent au
       toucher, ses enfants ne le sont pas. */
    <View style={[styles.barre, { top, left, right }]} pointerEvents="box-none">
      {/* Le filet de couleur porte le type : au volant, on le reconnait avant d'avoir lu. */}
      <View style={[styles.filet, { backgroundColor: couleur }]} />
      <Text style={[styles.texte, { color: couleur }]} numberOfLines={1}>
        ⚠ {t(`report.${report.kind}`)} {t('approach.inDistance', { distance: formatDistance(distanceM) })}
      </Text>

      {/* L'INTERRUPTEUR DE COUPURE — demande d'arsanne du 16 novembre : << un bouton vert quand
          il est active, on coulisse pour desactiver >>.

          POURQUOI UN INTERRUPTEUR ET NON UNE CROIX. Une croix fermerait CETTE alerte ; la
          suivante reviendrait trois cents metres plus loin. Ce que le conducteur veut quand il
          y touche, c'est le silence pour le reste du trajet. L'interrupteur dit cela, et son
          vert dit qu'il est actif sans avoir a le lire.

          IL EST LARGE DE QUARANTE POINTS POUR UNE PASTILLE DE QUATORZE : au volant, la zone de
          toucher compte plus que le dessin. Et un appui manque ne coute rien — la barre reste.

          POUR LES REACTIVER : la ligne << Alertes actives >> en bas du panneau de signalement.
          Elle existe depuis le 8 novembre et fait l'inverse de ce bouton. */}
      <Pressable
        onPress={couper}
        accessibilityRole="switch"
        accessibilityState={{ checked: true }}
        accessibilityLabel={t('approach.disableQuestion')}
        hitSlop={10}
        style={styles.interrupteur}
      >
        <View style={styles.rail}>
          <Animated.View
            style={[
              styles.pastille,
              {
                transform: [
                  {
                    translateX: glisse.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  barre: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    /* Fond clair fige : voir la note sur la couleur ci-dessus. */
    backgroundColor: '#FCFFFB',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  filet: { width: 4, height: 18, borderRadius: 2 },
  texte: { flex: 1, fontSize: 13, fontWeight: '800' as const },
  /* Zone de toucher large, dessin petit : voir la note de l'interrupteur. */
  interrupteur: { paddingVertical: 6, paddingLeft: 6, justifyContent: 'center' },
  rail: {
    width: 32,
    height: 18,
    borderRadius: 9,
    /* LE VERT DE L'APPLICATION, le meme que la ligne << Alertes actives >> du panneau de
     * signalement : deux commandes qui font la meme chose doivent se ressembler. */
    backgroundColor: '#2BA84A',
    padding: 2,
    justifyContent: 'center',
  },
  pastille: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
});
