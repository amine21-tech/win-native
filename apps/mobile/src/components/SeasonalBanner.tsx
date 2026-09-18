import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type Palette } from '../theme';

const BANNER_DURATION_MS = 10_000;

function isSummerSeason(): boolean {
  const month = new Date().getMonth() + 1;
  return month >= 6 && month <= 9;
}

type Props = {
  top: number;
  /** Marge droite : elle doit DEGAGER la colonne de boutons, que le bandeau chevauchait
   * (point 1 du client). Sur le site, le bandeau s'arrete a 64 px du bord pour la meme raison. */
  right: number;
  colors: Palette;
};

/**
 * Bandeau rouge "vigilance feux de forêt", affiche une fois par session pendant l'ete (juin a
 * septembre) — seul survivant du systeme de bandeaux saisonniers de v83 : le bandeau "securite
 * routiere/vacances" avait ete retire sur demande client (v79 #8, "porte une consigne
 * d'urgence, pas un simple rappel"). Ne se ferme jamais manuellement pour la meme raison :
 * disparait seul apres 10 secondes (BANNER_DURATION_MS, identique a v83).
 */
export function SeasonalBanner({ top, right, colors }: Props) {
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
    <View style={[styles.banner, { top, right, backgroundColor: colors.danger }]} pointerEvents="box-none">
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
      {/* Format COMPLET du site (`.season-fire`) : pictogramme dans sa case, titre, texte entier
          et pastille d'appel dessous. La version precedente tronquait le texte a deux lignes et
          serrait l'appel sur la meme ligne — le client l'a trouvee reduite. */}
      <View style={styles.iconBox}>
        <Text style={styles.icon}>🔥</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{t('seasonalAlert.fireTitle')}</Text>
        <Text style={styles.message}>{t('seasonalAlert.fireMessage')}</Text>
        <Pressable onPress={() => void Linking.openURL('tel:14')} style={styles.callBtn}>
          <Text style={styles.callText}>📞 {t('seasonalAlert.fireCall')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Halo derriere le bandeau : deborde de 10 points de chaque cote et pulse doucement.
  halo: { position: 'absolute', left: -10, right: -10, top: -10, bottom: -10, borderRadius: 24 },
  // Reprise de `.season-banner` + `.season-fire` : rayon 18, marges 13/15, ombre rouge diffuse.
  banner: {
    position: 'absolute',
    left: spacing.lg,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    elevation: 8,
    shadowColor: '#C8102E',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    zIndex: 50,
  },
  // `.sb-ic` : case de 36 points, coins de 11, fond blanc translucide.
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontWeight: '800' as const, fontSize: 12.5, marginBottom: 2 },
  message: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, lineHeight: 16 },
  // `.sb-call` : pastille d'appel sous le texte, fond et liseré blancs translucides.
  callBtn: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  callText: { color: '#fff', fontWeight: '800' as const, fontSize: 10.5 },
});
