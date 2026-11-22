import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HIT_SIZE, radius, spacing, type Palette } from '../theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onClear: () => void;
  placeholder: string;
  colors: Palette;
  /** La dictee est-elle en cours ? Le bouton devient rouge et clignote. */
  listening: boolean;
  /**
   * UN SEUL APPUI, ET NON PLUS UN APPUI MAINTENU — point 8 du 22 novembre.
   *
   * << Remplacement de l'appui long (peu intuitif) par un appui simple de 5 secondes. >>
   *
   * Les deux proprietes d'avant (`onMicPressIn` / `onMicPressOut`) sont REMPLACEES et non
   * doublees : garder les trois laisserait un composant qui ne dit plus quel geste il attend,
   * et deux chemins vers le meme moteur de reconnaissance. C'est le seul endroit de ce
   * correctif ou je remplace au lieu d'ajouter, et c'est precisement ce que le point demande.
   */
  onMicPress: () => void;
};

/** Barre de recherche : meme pilule que `.searchbox` en v83 (ombre douce, bord vert au focus). */
export function SearchBar({
  value,
  onChangeText,
  onFocus,
  onClear,
  placeholder,
  colors,
  listening,
  onMicPress,
}: Props) {
  /**
   * << ROUGE CLIGNOTANT PENDANT L'ECOUTE >> — point 8.
   *
   * IL ETAIT DEJA ROUGE, MAIS FIXE, et le clignotement n'est pas un ornement : avec l'appui
   * maintenu, le doigt pose sur le bouton SUFFISAIT a dire qu'on ecoutait. Un appui simple
   * n'offre plus ce repere — on a appuye, on a retire le doigt, et seul l'ecran peut dire si
   * la dictee a demarre. Le clignotement est ce qui dit << c'est a vous de parler >>, et il
   * dit aussi, en s'arretant, que les cinq secondes sont passees.
   *
   * MEME RYTHME QUE LES FLECHES DE NAVIGATION (500 ms, de 1,0 a 0,35) : l'application n'a
   * qu'une cadence de clignotement, et deux rythmes differents se liraient comme deux etats.
   * Le minimum est un peu plus haut que celui des fleches — un bouton qui descend a 0,2
   * semble disparaitre, alors qu'une fleche sur fond vert reste lisible.
   *
   * L'ANIMATION TOURNE MEME A L'ARRET, et c'est une contrainte de React et non un choix : un
   * hook ne peut pas etre appele conditionnellement. Elle est native, ne touche pas au fil
   * JavaScript, et son resultat n'est applique que pendant l'ecoute.
   */
  const battement = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(battement, {
          toValue: 0.35,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(battement, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [battement]);

  return (
    <View style={[styles.box, { backgroundColor: colors.surface }]}>
      <View style={styles.icon}>
        <View style={[styles.iconRing, { borderColor: colors.accent }]} />
        <View style={[styles.iconHandle, { backgroundColor: colors.accent }]} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text }]}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClear}
          style={styles.clear}
        >
          <Text style={[styles.clearGlyph, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      ) : null}
      {/* UN APPUI, CINQ SECONDES, LE RESULTAT — point 8 du 22 novembre. L'appui maintenu
          demandait de garder le doigt pose pendant qu'on prononce << Bordj Bou Arreridj >>, en
          conduisant : on relachait au milieu du nom. */}
      <Pressable
        accessibilityRole="button"
        /* L'ETAT SE DIT A LA VOIX DE SYNTHESE AUSSI, et pas seulement par la couleur : un
         * bouton qui clignote en rouge ne dit rien a qui ne voit pas l'ecran. */
        accessibilityState={{ busy: listening }}
        hitSlop={10}
        onPress={onMicPress}
        /* UN BOUTON ROND VERT, ET NON UN EMOJI POSE — maquette du correctif 2.
         *
         * << Bouton vert a droite de la barre. >> L'emoji seul ne se lisait pas comme un
         * bouton : rien ne disait qu'on pouvait appuyer dessus, et le client a signale deux
         * fois que le micro << ne fonctionnait pas >> alors qu'il fonctionnait — on ne
         * l'essayait simplement pas.
         *
         * IL ROUGIT ET CLIGNOTE PENDANT L'ECOUTE, et il doit rester visible en plein
         * soleil. */
        style={[styles.mic, { backgroundColor: listening ? colors.danger : colors.accentDark }]}
      >
        <Animated.Text style={[styles.micGlyph, listening ? { opacity: battement } : null]}>
          🎤
        </Animated.Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pilule PLEINE (rayon = moitie de la hauteur) et ombre large et diffuse, comme sur les
  // cartes de navigation courantes : la barre doit flotter au-dessus de la carte, pas y etre
  // posee comme un panneau. Un coin a 15 lisait comme un encadre de formulaire.
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: HIT_SIZE / 2,
    paddingHorizontal: spacing.lg,
    height: HIT_SIZE,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
  },
  icon: { width: 18, height: 18 },
  iconRing: { width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  iconHandle: {
    position: 'absolute',
    width: 7,
    height: 2,
    borderRadius: 1,
    right: 0,
    bottom: 1,
    transform: [{ rotate: '45deg' }],
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  clear: { padding: spacing.xs },
  clearGlyph: { fontSize: 16, lineHeight: 18 },
  /* LE BOUTON FAIT 38 POINTS DE COTE dans une barre de 52 : il remplit la hauteur utile sans
   * la toucher, comme sur la maquette. Plus petit, il redevient une icone ; plus grand, il
   * mange le texte saisi.
   *
   * LE DOCUMENT DU 22 NOVEMBRE DEMANDE << 30dp >>, et nous y sommes deja largement : ses
   * valeurs de depart (<< 20dp >> pour le micro principal, << 18dp >> pour celui de
   * navigation) sont celles de la maquette Android, pas les notres — ce bouton fait
   * trente-huit points depuis le correctif 2. Le rendre plus grand mangerait le texte saisi.
   * C'est le DESSIN qui gagne, ci-dessous. */
  mic: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* VINGT-DEUX POINTS AU LIEU DE DIX-SEPT : c'est le micro lui-meme que le client voit petit,
   * et non le disque vert qui le porte. Vingt-deux remplit le bouton de trente-huit sans que
   * l'emoji touche le bord — au-dela, le rendu de l'emoji se fait rogner par Android. */
  micGlyph: { fontSize: 22, lineHeight: 26 },
});
