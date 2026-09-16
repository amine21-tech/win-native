import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GeocodedResult } from '../search/geocode';
import type { Bookmark } from '../store/places';
import { formatDistance } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  loading: boolean;
  showBookmarks: boolean;
  partners: GeocodedResult[];
  results: GeocodedResult[];
  favorites: Bookmark[];
  history: Bookmark[];
  onSelectResult: (r: GeocodedResult) => void;
  onSelectBookmark: (b: Bookmark) => void;
  onRemoveHistory: (b: Bookmark) => void;
  onClearHistory: () => void;
  colors: Palette;
};

/** Pastille de l'icone d'un resultat : etoile doree (VIP), pastille bleue (ajoute par WIN), ou neutre. */
function ResultPin({ kind, colors }: { kind: 'partner' | 'win' | 'default'; colors: Palette }) {
  const background = kind === 'partner' ? colors.gold + '33' : kind === 'win' ? '#DCE7FB' : colors.surfaceAlt;
  const color = kind === 'partner' ? colors.alert : kind === 'win' ? '#2563EB' : colors.accent;
  return (
    <View style={[styles.pin, { backgroundColor: background }]}>
      <Text style={[styles.pinGlyph, { color }]}>{kind === 'partner' ? '★' : '◎'}</Text>
    </View>
  );
}

/** Premiere photo d'un lieu, en vignette : la miniature si le serveur en a produit une. */
function thumbnailOf(place: GeocodedResult): string | null {
  const first = place.photos?.[0];
  return first?.thumbUrl ?? first?.url ?? place.photoUrl ?? null;
}

/**
 * Vignette a gauche du resultat, a la place de la pastille, quand le lieu a une photo.
 * C'est elle qui permet de reconnaitre d'un coup d'oeil le lieu que l'on a soi-meme ajoute.
 * `resizeMethod="resize"` : la photo est reduite AVANT d'etre decodee, sinon une liste de
 * dix resultats decoderait dix photos en pleine resolution.
 */
function ResultThumb({ uri, colors }: { uri: string; colors: Palette }) {
  return (
    <Image
      source={{ uri }}
      style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}
      resizeMode="cover"
      resizeMethod="resize"
    />
  );
}

export function SearchResults({
  visible,
  loading,
  showBookmarks,
  partners,
  results,
  favorites,
  history,
  onSelectResult,
  onSelectBookmark,
  onRemoveHistory,
  onClearHistory,
  colors,
}: Props) {
  const { t } = useTranslation();

  const confirmRemoveHistory = useCallback(
    (b: Bookmark) => {
      Alert.alert(t('search.removeHistoryConfirmTitle'), `${b.name} — ${t('search.removeHistoryConfirmBody')}`, [
        { text: t('search.cancel'), style: 'cancel' },
        { text: t('search.confirm'), style: 'destructive', onPress: () => onRemoveHistory(b) },
      ]);
    },
    [onRemoveHistory, t],
  );

  const confirmClearHistory = useCallback(() => {
    Alert.alert(t('search.clearHistoryConfirmTitle'), t('search.clearHistoryConfirmBody'), [
      { text: t('search.cancel'), style: 'cancel' },
      { text: t('search.confirm'), style: 'destructive', onPress: onClearHistory },
    ]);
  }, [onClearHistory, t]);

  if (!visible) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
        {showBookmarks ? (
          <BookmarksView
            favorites={favorites}
            history={history}
            onSelect={onSelectBookmark}
            onLongPressHistory={confirmRemoveHistory}
            onClearHistory={confirmClearHistory}
            colors={colors}
          />
        ) : loading ? (
          <Text style={[styles.status, { color: colors.textMuted }]}>{t('search.loading')}</Text>
        ) : partners.length === 0 && results.length === 0 ? (
          <Text style={[styles.status, { color: colors.textMuted }]}>{t('search.empty')}</Text>
        ) : (
          <>
            {partners.map((p, i) => (
              <PartnerRow key={`p-${p.placeId ?? i}`} place={p} onPress={() => onSelectResult(p)} colors={colors} />
            ))}
            {/* Un partenaire present dans la liste ordonnee par distance garde sa
                presentation d'origine — etoile et mention — sans changer de rang. */}
            {results.map((r, i) =>
              r.isPartner ? (
                <PartnerRow
                  key={`r-${r.placeId ?? `${r.lat},${r.lon}-${i}`}`}
                  place={r}
                  onPress={() => onSelectResult(r)}
                  colors={colors}
                />
              ) : (
                <ResultRow
                  key={`r-${r.placeId ?? `${r.lat},${r.lon}-${i}`}`}
                  place={r}
                  onPress={() => onSelectResult(r)}
                  colors={colors}
                />
              ),
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PartnerRow({ place, onPress, colors }: { place: GeocodedResult; onPress: () => void; colors: Palette }) {
  const { t } = useTranslation();
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      {thumbnailOf(place) ? (
        <ResultThumb uri={thumbnailOf(place)!} colors={colors} />
      ) : (
        <ResultPin kind="partner" colors={colors} />
      )}
      <View style={styles.rowText}>
        <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {place.displayName}
          {place.distanceM != null ? ` · ${formatDistance(place.distanceM)}` : ''}
        </Text>
        <Text style={[styles.partnerTag, { color: colors.alert, backgroundColor: colors.alert + '1a' }]}>
          {t('place.partner')}
        </Text>
      </View>
    </Pressable>
  );
}

function ResultRow({ place, onPress, colors }: { place: GeocodedResult; onPress: () => void; colors: Palette }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      {thumbnailOf(place) ? (
        <ResultThumb uri={thumbnailOf(place)!} colors={colors} />
      ) : (
        <ResultPin kind={place.source === 'win' ? 'win' : 'default'} colors={colors} />
      )}
      <View style={styles.rowText}>
        <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
          {place.distanceM != null ? `${formatDistance(place.distanceM)} · ` : ''}
          {place.displayName}
        </Text>
      </View>
    </Pressable>
  );
}

function BookmarksView({
  favorites,
  history,
  onSelect,
  onLongPressHistory,
  onClearHistory,
  colors,
}: {
  favorites: Bookmark[];
  history: Bookmark[];
  onSelect: (b: Bookmark) => void;
  onLongPressHistory: (b: Bookmark) => void;
  onClearHistory: () => void;
  colors: Palette;
}) {
  const { t } = useTranslation();
  if (favorites.length === 0 && history.length === 0) return null;

  return (
    <>
      {favorites.length > 0 ? (
        <BookmarkSection title={t('search.favorites')} items={favorites} star onSelect={onSelect} colors={colors} />
      ) : null}
      {history.length > 0 ? (
        <>
          <BookmarkSection
            title={t('search.history')}
            items={history}
            star={false}
            onSelect={onSelect}
            onLongPress={onLongPressHistory}
            colors={colors}
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('search.longPressHint')}</Text>
          <Pressable onPress={onClearHistory} style={styles.clearAll}>
            <Text style={[typography.caption, { color: colors.danger, fontFamily: undefined }]}>
              {t('search.clearHistory')}
            </Text>
          </Pressable>
        </>
      ) : null}
    </>
  );
}

function BookmarkSection({
  title,
  items,
  star,
  onSelect,
  onLongPress,
  colors,
}: {
  title: string;
  items: Bookmark[];
  star: boolean;
  onSelect: (b: Bookmark) => void;
  onLongPress?: (b: Bookmark) => void;
  colors: Palette;
}) {
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {items.slice(0, 5).map((it, i) => (
        <Pressable
          key={`${it.name}-${i}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onSelect(it)}
          onLongPress={onLongPress ? () => onLongPress(it) : undefined}
          delayLongPress={900}
        >
          <ResultPin kind={star ? 'partner' : 'default'} colors={colors} />
          <View style={styles.rowText}>
            <Text style={[typography.heading, { color: colors.text }]} numberOfLines={1}>
              {it.name}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {it.addr}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    maxHeight: '55%',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'hidden',
  },
  scroll: { flexGrow: 0 },
  status: { ...typography.body, textAlign: 'center', padding: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', padding: spacing.md },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  pin: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 44, height: 44, borderRadius: 9 },
  pinGlyph: { fontSize: 14 },
  partnerTag: {
    ...typography.caption,
    fontSize: 10.5,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 2,
    overflow: 'hidden',
  },
  sectionTitle: { ...typography.heading, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  hint: { ...typography.caption, fontStyle: 'italic', paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  clearAll: { padding: spacing.md, paddingTop: spacing.sm },
});
