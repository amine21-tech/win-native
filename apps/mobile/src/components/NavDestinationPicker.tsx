import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GeocodedResult } from '../search/geocode';
import { radius, spacing, type Palette } from '../theme';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';

/**
 * « Ou voulez-vous aller ? » — le panneau de recherche PENDANT le guidage.
 *
 * Transcription de `showNavCategoryPicker` (win-v83) : un panneau qui monte du bas, un titre et
 * sa croix, une grille de douze rubriques utiles en route, puis un vrai champ de recherche avec
 * ses resultats dans le panneau meme. Choisir un lieu declenche un DETOUR : le guidage reprend
 * vers la nouvelle destination depuis l'endroit ou l'on se trouve, sans avoir ete arrete.
 *
 * L'ordre des rubriques est celui du site, et il n'est pas arbitraire : carburant et
 * restauration d'abord (les deux motifs d'arret les plus frequents), puis l'hebergement, la
 * sante, le depannage.
 */
const NAV_CATEGORIES: { labelKey: string; dataQ: string; emoji: string }[] = [
  { labelKey: 'fuel', dataQ: 'fuel', emoji: '⛽' },
  { labelKey: 'restaurant', dataQ: 'restaurant', emoji: '🍽️' },
  { labelKey: 'cafe', dataQ: 'cafe', emoji: '☕' },
  { labelKey: 'fastfood', dataQ: 'fast food', emoji: '🍔' },
  { labelKey: 'hotel', dataQ: 'hotel', emoji: '🏨' },
  { labelKey: 'pharmacy', dataQ: 'pharmacy', emoji: '💊' },
  { labelKey: 'hospital', dataQ: 'hospital', emoji: '🏥' },
  { labelKey: 'parking', dataQ: 'parking', emoji: '🅿️' },
  { labelKey: 'towing', dataQ: 'car repair', emoji: '🔧' },
  { labelKey: 'mosque', dataQ: 'mosque', emoji: '🕌' },
  { labelKey: 'police', dataQ: 'police', emoji: '👮' },
  { labelKey: 'busstation', dataQ: 'bus station', emoji: '🚌' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  query: string;
  onChangeQuery: (text: string) => void;
  onCategory: (dataQ: string, label: string) => void;
  loading: boolean;
  partners: GeocodedResult[];
  results: GeocodedResult[];
  onSelectResult: (result: GeocodedResult) => void;
  colors: Palette;
};

export function NavDestinationPicker({
  visible,
  onClose,
  query,
  onChangeQuery,
  onCategory,
  loading,
  partners,
  results,
  onSelectResult,
  colors,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const searching = query.trim().length >= 2;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.text }]}>{t('nav.whereTo')}</Text>
            {/* Croix bien visible, avec sa propre zone de toucher : aucun autre bouton a cote. */}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('addPlace.cancel')}
              hitSlop={10}
              style={[styles.close, { backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
            </Pressable>
          </View>

          {/* La grille laisse la place aux resultats des qu'une recherche est tapee. */}
          {!searching ? (
            <View style={styles.grid}>
              {NAV_CATEGORIES.map((c) => {
                const label = t(`categories.items.${c.labelKey}`);
                return (
                  <Pressable
                    key={c.labelKey}
                    onPress={() => onCategory(c.dataQ, label)}
                    style={({ pressed }) => [
                      styles.cell,
                      { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={styles.cellEmoji}>{c.emoji}</Text>
                    <Text style={[styles.cellLabel, { color: colors.text }]} numberOfLines={2}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.searchWrap}>
            <SearchBar
              value={query}
              onChangeText={onChangeQuery}
              onClear={() => onChangeQuery('')}
              placeholder={t('map.searchPlaceholder')}
              colors={colors}
              listening={false}
              onMicPressIn={() => {}}
              onMicPressOut={() => {}}
            />
          </View>

          {searching || partners.length > 0 || results.length > 0 ? (
            <View style={styles.results}>
              <SearchResults
                visible
                loading={loading}
                showBookmarks={false}
                partners={partners}
                results={results}
                favorites={[]}
                history={[]}
                onSelectResult={onSelectResult}
                onSelectBookmark={() => {}}
                onRemoveHistory={() => {}}
                onClearHistory={() => {}}
                colors={colors}
              />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 12,
    maxHeight: '86%',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: 6, marginBottom: 12 },
  title: { flex: 1, fontSize: 15, fontWeight: '800' },
  close: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  // Grille de quatre colonnes, cases de 72 points de haut minimum, comme sur le site.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '23.2%',
    minHeight: 72,
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 4,
  },
  cellEmoji: { fontSize: 22, lineHeight: 26 },
  cellLabel: { fontSize: 10.5, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
  searchWrap: { marginTop: 14 },
  results: { marginTop: 8, maxHeight: 340 },
});
