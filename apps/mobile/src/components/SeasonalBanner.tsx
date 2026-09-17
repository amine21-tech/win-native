import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type Palette } from '../theme';

const BANNER_DURATION_MS = 10_000;

function isSummerSeason(): boolean {
  const month = new Date().getMonth() + 1;
  return month >= 6 && month <= 9;
}

type Props = { top: number; colors: Palette };

/**
 * Bandeau rouge "vigilance feux de forêt", affiche une fois par session pendant l'ete (juin a
 * septembre) — seul survivant du systeme de bandeaux saisonniers de v83 : le bandeau "securite
 * routiere/vacances" avait ete retire sur demande client (v79 #8, "porte une consigne
 * d'urgence, pas un simple rappel"). Ne se ferme jamais manuellement pour la meme raison :
 * disparait seul apres 10 secondes (BANNER_DURATION_MS, identique a v83).
 */
export function SeasonalBanner({ top, colors }: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isSummerSeason()) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), BANNER_DURATION_MS);
    return () => clearTimeout(id);
  }, []);

  /* Halo pulsant, comme `@keyframes fireHalo` sur le site : le bandeau « respire » au lieu de
   * clignoter en tout-ou-rien, ce qui serait agressif pour les yeux au volant. L'animation joue
   * sur l'echelle et l'opacite d'un halo place DERRIERE le bandeau : ces deux proprietes
   * tournent sur le fil natif, donc sans faire travailler le fil JavaScript. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  if (!visible) return null;

  return (
    <View style={[styles.banner, { top, backgroundColor: colors.danger }]} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            backgroundColor: colors.danger,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
          },
        ]}
      />
      <Text style={styles.icon}>🔥</Text>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{t('seasonalAlert.fireTitle')}</Text>
        <Text style={styles.message} numberOfLines={2}>
          {t('seasonalAlert.fireMessage')}
        </Text>
      </View>
      <Pressable onPress={() => void Linking.openURL('tel:14')} style={styles.callBtn}>
        <Text style={styles.callText}>📞 14</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Compact et centre : ce bandeau s'affiche par-dessus la carte a l'ouverture et disparait
  // seul apres 10 s. Trop haut, il masquait la barre de recherche au moment precis ou
  // l'utilisateur veut taper — d'ou une mise en page resserree (icone et textes reduits,
  // bouton d'appel sur la meme ligne que le texte).
  // Halo derriere le bandeau : deborde de 10 points de chaque cote et pulse doucement.
  halo: { position: 'absolute', left: -10, right: -10, top: -10, bottom: -10, borderRadius: radius.lg },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 380,
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 50,
  },
  icon: { fontSize: 17 },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontWeight: '800' as const, fontSize: 12.5 },
  message: { color: '#fff', fontSize: 11, marginTop: 1, lineHeight: 14 },
  callBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  callText: { color: '#fff', fontWeight: '700' as const, fontSize: 11 },
});
