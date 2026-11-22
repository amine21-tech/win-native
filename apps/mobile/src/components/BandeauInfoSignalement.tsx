import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
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
 * ELLE EST LE SEUL INDICATEUR depuis le 16 novembre. Une CARTE d'alerte prenait le relais a
 * 150 m : un bloc de la hauteur d'un tiers d'ecran, avec deux boutons. Elle disait la meme
 * chose en occupant dix fois la place, au moment precis ou le conducteur a besoin de voir la
 * route. Elle est supprimee. << C'est visible et c'est tres tres discret. Ca prend pas de
 * place. >>
 *
 * LA BARRE NE S'EFFACE DONC PLUS A 150 M. Elle accompagne le signalement depuis cinq cents
 * metres jusqu'au passage, et sa distance descend : << dans 300 m >>, << dans 150 m >>,
 * << dans 30 m >>. La voix, elle, garde son unique annonce a 150 m.
 *
 * TROIS ETATS, ET NON DEUX — correction d'arsanne du 17 novembre.
 *
 *   1. ALERTES ACTIVES : la barre entiere, interrupteur VERT, pastille a droite.
 *   2. ALERTES COUPEES, un signalement en vue : la barre se REDUIT a une pastille ronde,
 *      posee au-dessus du compteur de vitesse. Elle ne dit plus quoi, elle dit seulement
 *      qu'il y avait quelque chose et qu'on a demande le silence.
 *   3. Rien en vue : rien a l'ecran, dans les deux cas.
 *
 * POURQUOI L'ETAT 2 EXISTE PLUTOT QUE RIEN DU TOUT. Un reglage qui efface toute trace de
 * lui-meme devient impossible a retrouver au volant : il faudrait ouvrir le panneau de
 * signalement pour se rappeler qu'on l'a coupe. La pastille reduite est a la fois le rappel et
 * le moyen de revenir — un appui, et la barre reprend sa taille.
 */

/** Distance d'apparition, en metres. Valeur du document. */
export const BANDEAU_INFO_M = 500;

/* LE VERT ET LE ROUGE DE L'INTERRUPTEUR.
 *
 * Le vert est celui de la ligne << Alertes actives >> du panneau de signalement : les deux
 * commandes agissent sur le MEME reglage, elles doivent se ressembler. Le rouge est celui des
 * signalements bloquants (#D32F2F), deja present partout ailleurs dans l'application. */
const VERT = '#2BA84A';
const ROUGE = '#D32F2F';

export function BandeauInfoSignalement({
  report,
  distanceM,
  top = 0,
  left = 0,
  right = 0,
  leftReduit = 0,
  mode = 'tout',
  actif,
  onBasculer,
}: {
  /** Le signalement a venir, ou `null` pour tout masquer. */
  report: Report | null;
  distanceM: number;
  /* LES QUATRE POSITIONS SONT FACULTATIVES DEPUIS LE 22 NOVEMBRE, et uniquement pour le mode
   * `'pastille'` : la colonne de navigation place son enfant elle-meme, et l'appelant n'aurait
   * que des zeros a ecrire. Les modes `'tout'` et `'barre'` les lisent toujours. */
  top?: number;
  left?: number;
  right?: number;
  /** Position horizontale en mode reduit, quand la pastille se place elle-meme. */
  leftReduit?: number;
  /**
   * LEQUEL DES DEUX ETATS CE RENDU DESSINE — point 2 du 22 novembre.
   *
   * Ce composant a toujours eu deux visages : la BARRE pleine largeur quand les alertes sont
   * actives, et la PASTILLE quand elles sont coupees. Ils vivaient au meme endroit de l'ecran,
   * poses tous les deux en absolu sous le bandeau vert.
   *
   * LA PASTILLE A BESOIN D'ALLER AILLEURS, ET C'EST LE DEFAUT QUE LE CLIENT A PHOTOGRAPHIE.
   * Posee a huit points sous le bandeau et haute de trente-huit, elle finissait SIX POINTS
   * PLUS BAS que le haut de la colonne de navigation : elle recouvrait le compteur de vitesse.
   * Le calcul n'avait jamais ete fait — deux fichiers differents decidaient chacun d'une
   * position, sans se connaitre.
   *
   * On ne peut pas simplement deplacer le composant entier : la barre, elle, doit rester large
   * et en haut. On lui demande donc lequel de ses visages il dessine :
   *
   *   `'tout'`     les deux, chacun se placant en absolu — EXACTEMENT le comportement d'avant,
   *                et c'est le defaut, donc un appelant qui ne dit rien ne change pas.
   *   `'barre'`    la barre seule ; la pastille est laissee a quelqu'un d'autre.
   *   `'pastille'` la pastille seule, SANS position propre, pour qu'une colonne l'empile.
   *
   * POURQUOI `'tout'` SURVIT ALORS QUE LA COLONNE EXISTE : la colonne de navigation n'est a
   * l'ecran QUE PENDANT UN TRAJET. Hors trajet, un signalement peut tres bien etre en vue — et
   * si la pastille n'etait plus dessinee que par la colonne, le reglage coupe n'aurait plus
   * aucune trace a l'ecran. C'est precisement ce que l'etat reduit existe pour eviter.
   */
  mode?: 'tout' | 'barre' | 'pastille';
  /** Les alertes de proximite sont-elles actives ? Vient du reglage partage. */
  actif: boolean;
  /** Bascule le reglage. Le MEME que celui du panneau de signalement. */
  onBasculer: (actif: boolean) => void;
}) {
  const { t } = useTranslation();

  /* LA PASTILLE DE L'INTERRUPTEUR GLISSE, elle ne saute pas d'un bord a l'autre.
   *
   * CE N'EST PAS DE L'ORNEMENT. Un interrupteur qui change d'etat sans bouger laisse un
   * doute : a-t-on appuye ? Le glissement de cent cinquante millisecondes est ce qui fait
   * qu'on sait, du coin de l'oeil et sans relire, que l'appui a ete pris.
   *
   * Les hooks sont declares AVANT tout retour conditionnel : React l'exige. */
  const glisse = useRef(new Animated.Value(actif ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(glisse, {
      toValue: actif ? 1 : 0,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [actif, glisse]);

  if (!report) return null;

  /* LA COULEUR DU TYPE, variante de JOUR. La barre a un fond clair fixe dans les deux themes —
   * c'est la regle du depot depuis le menu de signalement du 26 octobre : un texte dont le fond
   * est fige doit l'etre aussi, sinon il disparait en mode nuit. */
  const couleur = SIGNALISATION[report.kind]?.jour ?? '#B8860B';

  /* ------------------------------------------------------------------ etat 2 : reduit */
  if (!actif) {
    if (mode === 'barre') return null; // c'est l'autre rendu qui dessine la pastille
    return (
      <Pressable
        onPress={() => onBasculer(true)}
        accessibilityRole="switch"
        accessibilityState={{ checked: false }}
        accessibilityLabel={t('approach.reenable')}
        /* `hitSlop` COMPENSE LA REDUCTION A 26 POINTS. Le doigt a besoin de quarante-huit
         * points pour viser sans regarder ; la pastille n'en occupe plus que vingt-six a
         * l'ecran, et la zone sensible garde la taille d'avant tout autour. */
        hitSlop={14}
        style={[
          styles.reduit,
          { borderColor: couleur },
          mode === 'tout' ? { position: 'absolute', top, left: leftReduit } : null,
        ]}
      >
        <Text style={[styles.reduitTexte, { color: couleur }]}>⚠</Text>
        {/* LE POINT ROUGE DIT QUE C'EST COUPE, et pas seulement petit. Sans lui, la pastille
            reduite se lirait comme un avertissement de plus — alors qu'elle dit l'inverse :
            il y avait quelque chose a signaler, et on a demande le silence. */}
        <View style={styles.reduitPoint} />
      </Pressable>
    );
  }

  /* ------------------------------------------------------------------ etat 1 : la barre */
  if (mode === 'pastille') return null; // la colonne ne porte que la pastille
  return (
    /* `box-none` : la barre ne doit pas intercepter les appuis destines a la carte, mais
       l'interrupteur, lui, doit les recevoir. << none >> l'aurait rendu intouchable. */
    <View style={[styles.barre, { top, left, right }]} pointerEvents="box-none">
      {/* Le filet de couleur porte le type : au volant, on le reconnait avant d'avoir lu. */}
      <View style={[styles.filet, { backgroundColor: couleur }]} />
      <Text style={[styles.texte, { color: couleur }]} numberOfLines={1}>
        ⚠ {t(`report.${report.kind}`)} {t('approach.inDistance', { distance: formatDistance(distanceM) })}
      </Text>

      {/* L'INTERRUPTEUR — demande d'arsanne : << un bouton vert quand il est active, on
          coulisse pour desactiver >>, puis, le 17 novembre : << ca va devenir rouge >>.

          IL BASCULE DANS LES DEUX SENS, et c'est la correction du 17. Il ne faisait que
          couper : une fois coupe, la barre disparaissait avec lui, et il fallait aller
          rouvrir le panneau de signalement pour revenir en arriere. Un interrupteur qui ne
          revient pas n'est pas un interrupteur, c'est un bouton.

          IL EST SYNCHRONISE AVEC LE PANNEAU parce qu'ils lisent et ecrivent le MEME reglage
          (`approachAlertsEnabled`, retenu d'une session a l'autre). Il n'y a pas deux etats a
          tenir d'accord : il n'y en a qu'un, affiche a deux endroits.

          QUARANTE POINTS DE ZONE DE TOUCHER POUR UNE PASTILLE DE QUATORZE : au volant, la
          zone compte plus que le dessin, et un appui manque ne coute rien. */}
      <Pressable
        onPress={() => onBasculer(false)}
        accessibilityRole="switch"
        accessibilityState={{ checked: true }}
        accessibilityLabel={t('approach.disableQuestion')}
        hitSlop={10}
        style={styles.interrupteur}
      >
        <Animated.View
          style={[
            styles.rail,
            {
              backgroundColor: glisse.interpolate({
                inputRange: [0, 1],
                outputRange: [ROUGE, VERT],
              }),
            },
          ]}
        >
          <Animated.View
            style={[
              styles.pastille,
              { transform: [{ translateX: glisse.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }] },
            ]}
          />
        </Animated.View>
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
  rail: { width: 32, height: 18, borderRadius: 9, padding: 2, justifyContent: 'center' },
  pastille: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },

  /**
   * VINGT-SIX POINTS — la valeur du document du 22 novembre (<< 44dp -> 26dp >>).
   *
   * Elle en faisait trente-huit, et le client a raison de la trouver trop grosse : posee a huit
   * points sous le bandeau, elle descendait jusqu'a quarante-six, c'est-a-dire SIX POINTS PLUS
   * BAS que le haut de la colonne de navigation. Elle recouvrait le compteur de vitesse.
   *
   * `position: 'absolute'` n'est PLUS ICI mais dans le rendu, et seulement en mode `'tout'` :
   * une pastille qui se place elle-meme est precisement ce qui a permis le recouvrement. En
   * mode colonne, c'est la colonne qui decide — et un recouvrement y devient impossible.
   */
  reduit: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    backgroundColor: '#FCFFFB',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  reduitTexte: { fontSize: 13, lineHeight: 15, fontWeight: '800' as const },
  /* Le point rouge suit la pastille : a 10 points sur un disque de 26, il en couvrait le
   * tiers et se lisait comme une seconde pastille collee. */
  reduitPoint: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ROUGE,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
