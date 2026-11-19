import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GeocodedResult } from '../search/geocode';
import type { Bookmark } from '../store/places';
import { formatDistance } from '../shared';
import { BadgeVipShimmer } from './vip/BadgeVipShimmer';
import { LisereDore } from './vip/LisereDore';
import { radius, spacing, typography, vip, type Palette } from '../theme';
import { photoSource } from '../place/placePhoto';
import { ConfirmDeleteSheet } from './ConfirmDeleteSheet';

type Props = {
  visible: boolean;
  loading: boolean;
  showBookmarks: boolean;
  results: GeocodedResult[];
  favorites: Bookmark[];
  history: Bookmark[];
  onSelectResult: (r: GeocodedResult) => void;
  onSelectBookmark: (b: Bookmark) => void;
  onRemoveHistory: (b: Bookmark) => void;
  onClearHistory: () => void;
  /** Referme le panneau. Absent quand il est pose dans un cadre qui le ferme deja. */
  onClose?: () => void;
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
      source={photoSource(uri)}
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
  results,
  favorites,
  history,
  onSelectResult,
  onSelectBookmark,
  onRemoveHistory,
  onClearHistory,
  /** Referme le panneau et rend le clavier — la croix du client (correction C7). */
  onClose,
  colors,
}: Props) {
  const { t } = useTranslation();

  /* La meme feuille que pour la suppression d'une fiche (point 9 du client, 27 octobre : « la
   * meme maquette, pour l'historique de recherche ET la liste GPS enregistree »). Elle montre
   * le nom et les coordonnees de ce qu'on retire — la boite du systeme ne le permettait pas. */
  const [aSupprimer, setASupprimer] = useState<Bookmark | null>(null);
  const confirmRemoveHistory = useCallback((b: Bookmark) => setASupprimer(b), []);

  const confirmClearHistory = useCallback(() => {
    Alert.alert(t('search.clearHistoryConfirmTitle'), t('search.clearHistoryConfirmBody'), [
      { text: t('search.cancel'), style: 'cancel' },
      { text: t('search.confirm'), style: 'destructive', onPress: onClearHistory },
    ]);
  }, [onClearHistory, t]);

  /* `&& !aSupprimer` : tant que la feuille de confirmation est ouverte, ce composant doit
   * rester monte. Renvoyer null emporterait un Modal ENCORE AFFICHE, ce qui fige Android puis
   * ferme l'application — defaut rencontre le 24 octobre sur l'ajout et la suppression. */
  if (!visible && !aSupprimer) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* LA CROIX (correction C7 du 31 octobre). Le panneau se fermait en appuyant ailleurs,
          ce qui se devine mais ne se voit pas — et pendant qu'il est ouvert il recouvre la
          carte. Elle rend aussi le clavier, sans quoi l'ecran reste a moitie mange. */}
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('search.cancel')}
          style={[styles.fermer, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '800' }}>✕</Text>
        </Pressable>
      ) : null}

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
        ) : results.length === 0 ? (
          <Text style={[styles.status, { color: colors.textMuted }]}>{t('search.empty')}</Text>
        ) : (
          <>
            {/* LES PARTENAIRES NE SONT PLUS EXTRAITS EN TETE — 2 novembre. Ils etaient
                affiches avant tout le reste, donc AVANT la ville cherchee, ce qui defaisait
                la regle du client : ville, puis VIP, puis le reste. Ils gardent leur
                presentation — etoile et mention — a leur rang dans la liste ordonnee, ou
                `classerPoint18` les a deja places au deuxieme palier. */}
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

      <ConfirmDeleteSheet
        visible={aSupprimer !== null}
        nom={aSupprimer?.name ?? ''}
        titre={t('search.removeHistoryConfirmTitle')}
        onCancel={() => setASupprimer(null)}
        onConfirm={() => {
          if (aSupprimer) onRemoveHistory(aSupprimer);
          setASupprimer(null);
        }}
      />
    </View>
  );
}

/** L'or des marqueurs WIN, valeur du point 12 : #D4A017. Fige, comme partout ailleurs ou il
 *  designe le statut VIP — l'anneau des signalements, la fleche de position, le badge NOUVEAU. */
const OR_VIP = '#D4A017';

/**
 * LA LIGNE D'UN PARTENAIRE, DANS SON CADRE DORE — amelioration 1 de la synthese du 19 novembre.
 *
 * C'est l'endroit exact que le client designe : << identification instantanee dans la liste de
 * resultats >>. Trois choses la distinguent desormais d'une ligne ordinaire, et aucune ne
 * demande de lire quoi que ce soit — une bordure doree de deux points, des coins a seize, et un
 * lisere qui glisse en haut de la carte.
 *
 * ON NE TOUCHE PAS A SON RANG. Les partenaires ne sont PAS remontes en tete de liste : c'est
 * une regle etablie le 2 novembre, parce que les faire passer avant la ville cherchee defaisait
 * le classement que le client avait lui-meme demande. La carte doree se voit a sa place.
 */
function PartnerRow({ place, onPress, colors }: { place: GeocodedResult; onPress: () => void; colors: Palette }) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.carteVip,
        { borderColor: colors.gold300, backgroundColor: colors.surface },
      ]}
    >
      {/* Le lisere anime, cale en haut de la carte et sous ses coins arrondis — d'ou
          l'`overflow: hidden` du cadre : sans lui, la bande doree depasserait en carre aux
          deux coins superieurs. */}
      <LisereDore />
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
          {/* LE BADGE << WIN VIP >> PASSE A LA BRILLANCE — amelioration 3. Le mot et l'or ne
              changent pas : ils viennent du point 12 du 9 novembre, et << WIN VIP >> est le nom
              de l'offre commerciale, pas une phrase a traduire. Seul le reflet s'ajoute, en
              version compacte pour tenir sur une ligne de resultat. */}
          <View style={styles.badgeLigne}>
            <BadgeVipShimmer libelle={`⭐ ${t('place.vipBadge')}`} compact />
          </View>
        </View>
      </Pressable>
    </View>
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
  fermer: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
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
  /* LE CADRE DORE D'UN PARTENAIRE — les valeurs du dimens.xml de la synthese : coins a 16,
   * bordure a 2. L'ombre est celle du `cardElevation="6dp"` du document : sans elle, la carte
   * est encadree mais reste a plat, et le client la decrit comme << une carte Gold >>, ce qui
   * suppose qu'elle se detache de la page. */
  carteVip: {
    borderRadius: vip.cardCorner,
    borderWidth: vip.strokeWidth,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  badgeLigne: { marginTop: 4 },
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
