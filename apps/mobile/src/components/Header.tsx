import { LinearGradient } from 'expo-linear-gradient';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { changeLanguage } from '../i18n';
import type { Language } from '../shared';
import { fonts, radius, spacing, type Palette } from '../theme';
import { formatClock24, useClock } from '../utils/clock';

const LANGUAGE_PILLS: { code: Language; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'عربي' },
  { code: 'en', label: 'EN' },
];

type Props = { colors: Palette; top: number };

/**
 * Bandeau de marque, repris de `.topbar .brandrow` en v83 : logo, nom,
 * accroche, selecteur de langue. Absent jusqu'ici de l'app native — c'etait
 * la premiere chose qui manquait par rapport au site, d'apres les captures
 * d'ecran comparees en aout 2026.
 */
export function Header({ colors, top }: Props) {
  const { t, i18n } = useTranslation();
  const now = useClock();

  const pickLanguage = (lang: Language) => {
    if (lang === i18n.language) return;
    const needsRestart = changeLanguage(lang);
    if (!needsRestart) return;
    Alert.alert(t('app.rtlRestartTitle'), t('app.rtlRestartBody'), [
      { text: t('app.restartLater'), style: 'cancel' },
      {
        text: t('app.restartNow'),
        onPress: () => {
          Updates.reloadAsync().catch(() => {
            /* Expo Go / dev client : pas de reload disponible, sans consequence */
          });
        },
      },
    ]);
  };

  return (
    <View style={[styles.wrap, { top: 0, paddingTop: top + spacing.sm }]} pointerEvents="box-none">
      <LinearGradient
        colors={[colors.background, `${colors.background}00`]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.row}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <View style={styles.brandText}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]}>{t('app.name')}</Text>
            <Text style={[styles.dzBadge, { color: colors.gold }]}>DZ</Text>
          </View>
          <Text style={[styles.tagline, { color: colors.textMuted }]} numberOfLines={1}>
            {t('app.tagline')}
          </Text>
        </View>
        <View style={styles.rightCol}>
          {/* Horloge permanente (chantier #22) : visible ici sur l'ecran principal, et dans le
              bandeau de navigation pendant un trajet (voir NavigationOverlay) — jamais absente. */}
          <Text style={[styles.clock, { color: colors.text }]}>{formatClock24(now)}</Text>
          <View style={[styles.langs, { backgroundColor: colors.surface }]}>
            {LANGUAGE_PILLS.map((p) => {
              const on = p.code === i18n.language;
              return (
                <Pressable
                  key={p.code}
                  onPress={() => pickLanguage(p.code)}
                  style={[styles.langPill, on && { backgroundColor: colors.accent }]}
                >
                  <Text style={[styles.langLabel, { color: on ? colors.accentText : colors.textMuted }]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 40, height: 40, borderRadius: radius.sm },
  brandText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  name: { fontFamily: fonts.sansExtraBold, fontSize: 19, letterSpacing: 0.5 },
  dzBadge: { fontFamily: fonts.sansExtraBold, fontSize: 9 },
  tagline: { fontFamily: fonts.sans, fontSize: 10.5, marginTop: 1 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  clock: { fontFamily: fonts.sansBold, fontSize: 12.5, letterSpacing: 0.3 },
  langs: { flexDirection: 'row', gap: 2, borderRadius: radius.pill, padding: 3 },
  langPill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 6 },
  langLabel: { fontFamily: fonts.sansBold, fontSize: 11 },
});
