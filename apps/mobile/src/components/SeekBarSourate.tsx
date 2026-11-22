import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuranPlayer } from '../quran/player';
import { formaterTemps, partRemplie, PAS_S, positionDepuisToucher } from '../quran/seekbar';

/* Les couleurs de la section Coran, reprises telles quelles : cette barre prolonge la ligne de
 * la sourate active, elle ne doit pas se lire comme un objet pose dessus. */
const OR = '#E6C66B';
const OR_PALE = '#F5E3A8';
const CREME = '#EFE7CF';
const FOND_LIGNE = 'rgba(255,255,255,0.045)';

/** Hauteur de la piste dessinee, en points. La zone sensible, elle, fait 34 points — voir plus bas. */
const PISTE = 4;
/** Diametre du curseur. */
const CURSEUR = 14;

/**
 * LA BARRE DE NAVIGATION DANS LA SOURATE EN COURS — point 4 du 22 novembre.
 *
 * << Barre de progression glissable · Temps actuel / Duree totale · Boutons -10s / +10s.
 * NE RIEN CASSER : SeekBar ajoutee seulement sur la sourate active. >>
 *
 * ELLE N'EST RENDUE QUE POUR LA SOURATE ACTIVE, et c'est la consigne du document prise au mot.
 * Mais ce n'est pas qu'une question de place : treize barres a l'ecran, dont douze immobiles a
 * zero, donneraient douze commandes qui ne repondent a rien.
 *
 * POURQUOI C'EST UN FICHIER A PART, ET NON QUELQUES LIGNES DANS QuranSection. Cette barre a
 * besoin de MESURER sa largeur pour traduire un doigt en secondes, donc d'un `useState`. Or
 * QuranSection dessine ses treize sourates dans un `.map` : un crochet ecrit a l'interieur de
 * cette boucle en ferait treize, puis quatorze le jour ou une sourate s'ajoute — et React,
 * qui compte les crochets d'un rendu a l'autre, demonterait l'arbre avec
 * << Rendered more hooks than during the previous render >>. C'est l'ecran noir que le depot
 * surveille par `verifier-hooks.py` depuis le 10 novembre. Un composant separe met ses crochets
 * a l'abri : il en a toujours exactement deux.
 *
 * ELLE NE PARLE PAS AU LECTEUR DIRECTEMENT : elle demande au magasin `useQuranPlayer`, qui
 * borne les positions et tient le `seekTo`. L'arithmetique, elle, vit dans `quran/seekbar` et
 * s'eprouve sans telephone.
 */
export function SeekBarSourate() {
  const { t } = useTranslation();
  const position = useQuranPlayer((s) => s.position);
  const duree = useQuranPlayer((s) => s.duree);
  const allerA = useQuranPlayer((s) => s.allerA);
  const decaler = useQuranPlayer((s) => s.decaler);

  /** Largeur reelle de la piste, mesuree au premier rendu. Zero avant : aucun doigt ne compte. */
  const [largeur, setLargeur] = useState(0);

  const part = partRemplie(position, duree);
  /* La duree reste inconnue tant que le lecteur n'a pas lu l'entete du fichier. On l'ecrit
   * alors d'un trait plutot que << 0:00 >>, qui se lirait comme une sourate vide. */
  const connue = duree > 0;

  const viser = (x: number) => {
    if (!connue) return;
    allerA(positionDepuisToucher(x, largeur, duree));
  };

  return (
    <View style={styles.bloc}>
      {/**
       * LA PISTE EST SON PROPRE RESPONDEUR TACTILE, et non un `Pressable`.
       *
       * Un `Pressable` donne l'appui et le relachement, pas le GLISSEMENT : le document demande
       * << Glisser sur la barre >>, c'est-a-dire suivre le doigt pendant qu'il se deplace. Les
       * quatre `on*Responder*` sont l'equivalent React Native du `OnSeekBarChangeListener`
       * Android cite par le document — `onResponderMove` est son `onProgressChanged`.
       *
       * `locationX` est mesure DANS cette vue : c'est exactement ce que
       * `positionDepuisToucher` attend, et c'est pourquoi la zone sensible et la piste mesuree
       * sont la meme vue. Les separer rendrait le calcul faux de la difference.
       */}
      <View
        style={styles.zone}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={t('qibla.seek')}
        accessibilityValue={{ min: 0, max: Math.max(1, Math.floor(duree)), now: Math.floor(position) }}
        onStartShouldSetResponder={() => connue}
        onMoveShouldSetResponder={() => connue}
        onResponderGrant={(e) => viser(e.nativeEvent.locationX)}
        onResponderMove={(e) => viser(e.nativeEvent.locationX)}
      >
        <View style={styles.piste}>
          {/* La part ecoutee, en or : la meme couleur que le bouton de lecture actif. */}
          <View style={[styles.remplie, { width: `${part * 100}%` }]} />
        </View>
        {/* LE CURSEUR EST POSE EN ABSOLU SUR LA PISTE, et son centre est ramene de la moitie de
            son diametre : sans ce decalage il depasserait a droite en fin de sourate, et son
            bord gauche ne toucherait jamais le debut. */}
        <View style={[styles.curseur, { left: `${part * 100}%`, marginLeft: -CURSEUR / 2 }]} />
      </View>

      <View style={styles.rangee}>
        {/* RECULER EST A GAUCHE, AVANCER A DROITE, dans le sens de la barre juste au-dessus :
            c'est le seul ordre qui ne demande pas de reflechir au volant ou en priere. */}
        <Pressable
          onPress={() => decaler(-PAS_S)}
          disabled={!connue}
          accessibilityRole="button"
          accessibilityLabel={t('qibla.back10')}
          hitSlop={8}
          style={({ pressed }) => [styles.pas, { opacity: !connue ? 0.4 : pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.pasTexte}>⏪ {PAS_S}s</Text>
        </Pressable>

        {/* LE TEMPS AU MILIEU, en chiffres de largeur fixe : sans `tabular-nums`, les deux
            nombres se decalent lateralement a chaque seconde, et l'oeil suit ce tremblement
            au lieu de lire. */}
        <Text style={styles.temps}>
          {formaterTemps(position)}
          {connue ? ` / ${formaterTemps(duree)}` : ''}
        </Text>

        <Pressable
          onPress={() => decaler(PAS_S)}
          disabled={!connue}
          accessibilityRole="button"
          accessibilityLabel={t('qibla.forward10')}
          hitSlop={8}
          style={({ pressed }) => [styles.pas, { opacity: !connue ? 0.4 : pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.pasTexte}>{PAS_S}s ⏩</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Elle prolonge la ligne de la sourate : meme fond, meme bordure d'or, et le haut carre pour
   * que les deux ne fassent qu'une carte — << Carte elargie >> dans les mots du document. */
  bloc: {
    backgroundColor: FOND_LIGNE,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: OR,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 9,
  },

  /**
   * TRENTE-QUATRE POINTS DE HAUT POUR UNE PISTE DE QUATRE.
   *
   * La piste fine est ce qui se LIT ; la zone de trente-quatre points est ce qui se TOUCHE. Une
   * barre audio haute de quatre points est injouable au doigt — on la rate, on appuie a cote,
   * et sur cet ecran appuyer a cote veut dire mettre la recitation en pause. C'est la meme
   * regle que l'interrupteur de la barre d'alerte : la zone compte plus que le dessin.
   */
  zone: { height: 34, justifyContent: 'center' },
  piste: {
    height: PISTE,
    borderRadius: PISTE / 2,
    backgroundColor: 'rgba(239,231,207,0.18)',
    overflow: 'hidden',
  },
  remplie: { height: PISTE, borderRadius: PISTE / 2, backgroundColor: OR },
  curseur: {
    position: 'absolute',
    width: CURSEUR,
    height: CURSEUR,
    borderRadius: CURSEUR / 2,
    backgroundColor: OR_PALE,
    borderWidth: 1,
    borderColor: 'rgba(13,58,43,0.55)',
  },

  rangee: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pas: {
    minWidth: 58,
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(230,198,107,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pasTexte: { color: OR_PALE, fontSize: 11.5, fontWeight: '800' as const },
  temps: {
    color: CREME,
    fontSize: 12,
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'],
  },
});
