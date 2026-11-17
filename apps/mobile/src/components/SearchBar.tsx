import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HIT_SIZE, radius, spacing, type Palette } from '../theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onClear: () => void;
  placeholder: string;
  colors: Palette;
  /** Dictee vocale (micBtn en v83) : appui maintenu pour parler. */
  listening: boolean;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
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
  onMicPressIn,
  onMicPressOut,
}: Props) {
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
      {/* Appui MAINTENU pour dicter, comme sur le site : on parle tant que le doigt reste
          pose, le relachement lance la recherche. Rouge pendant l'ecoute. */}
      <Pressable
        accessibilityRole="button"
        hitSlop={10}
        onPressIn={onMicPressIn}
        onPressOut={onMicPressOut}
        /* UN BOUTON ROND VERT, ET NON UN EMOJI POSE — maquette du correctif 2.
         *
         * << Bouton vert a droite de la barre. >> L'emoji seul ne se lisait pas comme un
         * bouton : rien ne disait qu'on pouvait appuyer dessus, et le client a signale deux
         * fois que le micro << ne fonctionnait pas >> alors qu'il fonctionnait — on ne
         * l'essayait simplement pas.
         *
         * IL ROUGIT PENDANT L'ECOUTE, comme avant : c'est le seul retour qu'on ait sur un
         * appui maintenu, et il doit rester visible meme en plein soleil. */
        style={[styles.mic, { backgroundColor: listening ? colors.danger : colors.accentDark }]}
      >
        <Text style={styles.micGlyph}>🎤</Text>
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
   * mange le texte saisi. */
  mic: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micGlyph: { fontSize: 17, lineHeight: 20 },
});
