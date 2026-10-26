import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { changeLanguage } from '../i18n';
import type { Language } from '../shared';
import { fonts, radius, spacing, type Palette } from '../theme';
import { formatClock24, useClock } from '../utils/clock';

/**
 * Les cinq langues du bandeau, dans l'ordre EXACT demande par le client.
 *
 * Cet ordre n'est pas celui qu'on devinerait — ni alphabetique, ni par nombre de locuteurs :
 * francais, darija, tamazight, arabe, anglais. Il est releve sur son document a la position
 * des caracteres eux-memes, parce que le texte extrait les melangeait. Il ne faut donc pas le
 * « ranger » : c'est une demande, pas un defaut.
 *
 * Le DARIJA etait le vrai manque. Ses 421 textes sont traduits depuis le debut et le code le
 * connait (`LANGUAGES` contient 'dz'), mais aucun bouton ne le proposait : la langue existait
 * dans l'application sans que personne puisse l'atteindre. Elle fonctionne a partir de ce
 * bouton, entierement.
 *
 * Le TAMAZIGHT, lui, reste annonce et grise. Ce qui lui manque n'est pas l'audio mais les 421
 * textes de l'interface, qu'il faut ecrire et faire relire par quelqu'un dont c'est la langue.
 * Le bouton est a sa place, dans l'ordre demande ; `pret: true` est la seule chose a changer le
 * jour ou ces textes existent. On annonce, on ne fait pas semblant.
 */
const LANGUAGE_PILLS: { code: Language | 'kab'; label: string; pret: boolean }[] = [
  { code: 'fr', label: 'FR', pret: true },
  // Le darija s'ecrit en caracteres arabes : c'est la langue parlee, pas une autre graphie.
  { code: 'dz', label: 'دارجة', pret: true },
  // Tifinagh, l'alphabet officiel, dans la graphie meme du document du client.
  { code: 'kab', label: 'ⴰⵎⴰⵣⵉⵖ', pret: false },
  { code: 'ar', label: 'عربي', pret: true },
  { code: 'en', label: 'EN', pret: true },
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

  /* Un appui, la langue change. Il n'y a plus rien entre les deux : ni fenetre de
   * confirmation, ni redemarrage — voir src/i18n/index.ts pour ce qui l'imposait. */
  const pickLanguage = (lang: Language) => {
    if (lang === i18n.language) return;
    changeLanguage(lang);
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
        {/* Horloge permanente (chantier #22) : visible ici sur l'ecran principal, et dans le
            bandeau de navigation pendant un trajet (voir NavigationOverlay) — jamais absente. */}
        <Text style={[styles.clock, { color: colors.text }]}>{formatClock24(now)}</Text>
      </View>

      {/* LES LANGUES SUR LEUR PROPRE LIGNE, et non plus serrees contre l'horloge.
          A quatre boutons, la colonne de droite tenait encore ; a cinq, les mots arabes et
          tifinagh ne rentraient qu'en rognant le nom de l'application. Une ligne pleine largeur
          donne a chaque langue la meme part, lisible, et laisse le bandeau du haut respirer. */}
      <View style={[styles.langs, { backgroundColor: colors.surface }]}>
        {LANGUAGE_PILLS.map((p) => {
          const on = p.pret && p.code === i18n.language;
          return (
            <Pressable
              key={p.code}
              disabled={!p.pret}
              // Une pastille grisee qui ne repond pas laisse croire a une panne : elle dit
              // donc elle-meme pourquoi elle ne repond pas.
              onPress={() => (p.pret ? pickLanguage(p.code as Language) : Alert.alert(t('app.soon'), t('app.soonBody')))}
              style={[styles.langPill, on && { backgroundColor: colors.accent }, !p.pret && styles.langPillSoon]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.langLabel,
                  { color: on ? colors.accentText : colors.textMuted },
                  !p.pret && styles.langLabelSoon,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
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
  clock: { fontFamily: fonts.sansBold, fontSize: 12.5, letterSpacing: 0.3 },
  langs: {
    flexDirection: 'row',
    gap: 3,
    borderRadius: radius.pill,
    padding: 3,
    marginTop: spacing.sm,
    /* PAS DE MARGE BASSE ICI, ET C'EST UNE CORRECTION.
     *
     * L'espace demande sous les langues (point 4 du client) se regle dans app/index.tsx, par
     * HEADER_HEIGHT. Cet en-tete et la barre de recherche sont DEUX BLOCS INDEPENDANTS : la
     * barre est posee a une distance fixe du haut de l'ecran et ne suit pas la hauteur de
     * l'en-tete.
     *
     * Une premiere tentative avait pose ici `marginBottom: 10` ET monte HEADER_HEIGHT de 10 :
     * les deux se sont exactement annules — l'en-tete grandissait de dix points pendant que la
     * barre descendait des memes dix. L'ecart visible n'avait pas bouge d'un pixel, et le
     * client l'a vu immediatement. Une seule des deux valeurs doit changer. */
  },
  // `flex: 1` : les cinq langues se partagent la largeur a parts egales, quelle que soit la
  // longueur du mot. Une pastille de deux lettres et une de six gardent la meme surface
  // tactile — c'est ce qui rend la rangee lisible au premier coup d'oeil.
  langPill: { flex: 1, borderRadius: radius.pill, paddingVertical: 6, alignItems: 'center' },
  langLabel: { fontFamily: fonts.sansBold, fontSize: 11.5 },
  /* Une langue annoncee mais pas encore traduite. Volontairement discrete : elle ne doit pas
   * attirer l'oeil autant qu'une langue utilisable. */
  langPillSoon: { opacity: 0.45 },
  langLabelSoon: { fontSize: 12 },
});
