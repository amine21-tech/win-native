import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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

  if (!visible) return null;

  return (
    <View style={[styles.banner, { top, backgroundColor: colors.danger }]} pointerEvents="box-none">
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
