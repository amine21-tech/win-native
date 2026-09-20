import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { egsaForAirport, isAirport, isTrainStation, SNTF_URL } from '../reports/transport';
import type { Route, RouteMode } from '../navigation/routing';
import type { GeocodedResult } from '../search/geocode';
import { formatDistance } from '../shared';
import { useAdminSession } from '../store/admin';
import { lookupPlacePhoto } from '../place/placePhoto';
import { fonts, radius, spacing, typography, type Palette } from '../theme';
import { AdminEditPlaceSheet } from './AdminEditPlaceSheet';
import { CorrectionSheet } from './CorrectionSheet';
import { TripCard } from './TripCard';

export type SelectedPlace = GeocodedResult & { distanceM?: number };

type Props = {
  place: SelectedPlace | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  colors: Palette;
  hasUserPosition: boolean;
  routes: Route[];
  routesLoading: boolean;
  routesError: boolean;
  routeMode: RouteMode;
  onRouteModeChange: (mode: RouteMode) => void;
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  onStartNavigation: () => void;
};

/**
 * Photo d'illustration d'un lieu deja reference (ville, village, site emblematique), quand la
 * fiche n'a pas de photo de contributeur. Voir src/place/placePhoto.ts pour la regle exacte :
 * liste verifiee a la main d'abord, article Wikipedia ensuite, et rien du tout pour un commerce.
 */
function usePlacePhoto(place: SelectedPlace | null): string | null {
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    setPhoto(null);
    if (!place || place.photoUrl || (place.photos?.length ?? 0) > 0) return;
    let cancelled = false;
    void lookupPlacePhoto(place).then((src) => {
      if (!cancelled && src) setPhoto(src);
    });
    return () => {
      cancelled = true;
    };
  }, [place]);

  return photo;
}

export function PlaceSheet({
  place,
  isFavorite,
  onToggleFavorite,
  onClose,
  colors,
  hasUserPosition,
  routes,
  routesLoading,
  routesError,
  routeMode,
  onRouteModeChange,
  selectedRouteIndex,
  onSelectRoute,
  onStartNavigation,
}: Props) {
  const { t } = useTranslation();
  const wikiPhoto = usePlacePhoto(place);
  const gallery = place?.photos?.length ? place.photos.map((p) => p.url) : place?.photoUrl ? [place.photoUrl] : [];
  const [mainPhoto, setMainPhoto] = usePhotoSelection(gallery, wikiPhoto);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const adminToken = useAdminSession((s) => s.token);
  if (!place) return null;

  const isContributed = place.source === 'win';
  const canOrder = !!place.whatsapp && place.isPartner;

  const call = (n: string) => void Linking.openURL(`tel:${n.replace(/\s+/g, '')}`);
  const whatsapp = (n: string, text?: string) =>
    void Linking.openURL(`https://wa.me/${n.replace(/[^0-9]/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`);
  const email = (addr: string) => void Linking.openURL(`mailto:${addr}`);

  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <View style={[styles.grip, { backgroundColor: colors.border }]} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Encadre dore, en tete de fiche — le bouton de gestion admin de v83 etait un lien
            discret tout en bas, facile a manquer (doc "22 chantiers" #17). Reserve aux fiches
            WIN (source='win') : rien a gerer sur un resultat OpenStreetMap brut. */}
        {adminToken && place.source === 'win' ? (
          <Pressable
            onPress={() => setAdminEditOpen(true)}
            style={[styles.adminPanel, { backgroundColor: colors.gold + '1f', borderColor: colors.goldDeep }]}
          >
            <Text style={[styles.adminPanelText, { color: colors.alert }]}>🔧 {t('admin.manageThisPlace')}</Text>
          </Pressable>
        ) : null}

        {place.isPartner ? (
          <Text style={[styles.badge, { color: colors.alert, backgroundColor: colors.gold + '2a' }]}>
            {t('place.partner')}
          </Text>
        ) : null}

        {mainPhoto ? (
          <View style={[styles.photoBox, { backgroundColor: colors.surfaceAlt }]}>
            <Image source={{ uri: mainPhoto }} style={styles.photo} resizeMode="cover" />
            {/* Bandeau pose SUR l'image, comme sur le site : une photo de contributeur doit se
                reconnaitre immediatement comme telle, sans avoir a chercher la mention plus bas.
                Une illustration Wikimedia, elle, porte sa mention de credit. */}
            <Text style={styles.photoTag}>
              {gallery.includes(mainPhoto) ? t('place.photoByWin') : '© Wikimedia'}
            </Text>
          </View>
        ) : null}

        {gallery.length > 1 ? (
          <View style={styles.gallery}>
            {gallery.slice(0, 3).map((url) => (
              <Pressable
                key={url}
                onPress={() => setMainPhoto(url)}
                style={[styles.thumb, { borderColor: url === mainPhoto ? colors.goldDeep : 'transparent' }]}
              >
                <Image source={{ uri: url }} style={styles.thumbImage} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {place.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? t('place.favoriteRemove') : t('place.favoriteAdd')}
            onPress={onToggleFavorite}
            style={[styles.favBtn, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text style={{ fontSize: 18, color: isFavorite ? colors.danger : colors.textMuted }}>
              {isFavorite ? '♥' : '♡'}
            </Text>
          </Pressable>
        </View>

        <Text style={[typography.body, styles.address, { color: colors.textMuted }]}>
          {place.distanceM != null ? `${formatDistance(place.distanceM)} (${t('place.distanceAirline')}) · ` : ''}
          {place.displayName}
        </Text>

        {hasUserPosition ? (
          <TripCard
            routes={routes}
            selectedIndex={selectedRouteIndex}
            onSelect={onSelectRoute}
            loading={routesLoading}
            error={routesError}
            mode={routeMode}
            onModeChange={onRouteModeChange}
            onStart={onStartNavigation}
            colors={colors}
          />
        ) : null}

        {isContributed ? (
          <Text style={[styles.contribTag, { color: colors.alert, backgroundColor: colors.gold + '22' }]}>
            {place.isPartner ? `⭐ ${t('place.addedByWinVip')}` : t('place.addedByWin')}
          </Text>
        ) : null}

        {isAirport(place) ? (
          <TransportLink
            emoji="✈️"
            title={t('transport.flightTitle')}
            sub={t('transport.flightSubExact', { org: egsaForAirport(place.lat, place.lon).nom })}
            url={egsaForAirport(place.lat, place.lon).url}
            colors={colors}
          />
        ) : isTrainStation(place) ? (
          <TransportLink
            emoji="🚆"
            title={t('transport.trainTitle')}
            sub={t('transport.trainSub')}
            url={SNTF_URL}
            colors={colors}
          />
        ) : null}

        <View style={styles.contactRow}>
          {place.phoneMobile || place.phoneFixe ? (
            <ContactButton
              label={t('place.call')}
              color={colors.accent}
              onPress={() => call((place.phoneMobile || place.phoneFixe)!)}
            />
          ) : null}
          {place.whatsapp ? (
            <ContactButton label={t('place.whatsapp')} color="#25D366" onPress={() => whatsapp(place.whatsapp!)} />
          ) : null}
          {place.email ? (
            <ContactButton label={t('place.email')} color="#5B8DEF" onPress={() => email(place.email!)} />
          ) : null}
          {canOrder ? (
            <ContactButton
              label={t('place.order')}
              color={colors.gold}
              textColor="#5A4500"
              onPress={() => whatsapp(place.whatsapp!, `Bonjour, je voudrais commander chez ${place.name}`)}
            />
          ) : null}
        </View>

        {place.promo ? (
          <View style={[styles.promo, { backgroundColor: colors.gold + '1f', borderColor: colors.goldDeep }]}>
            <Text style={[typography.caption, { color: colors.alert }]}>{place.promo}</Text>
          </View>
        ) : null}

        <Pressable onPress={() => setCorrectionOpen(true)} style={styles.reportIssue}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('place.reportIssue')}</Text>
        </Pressable>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="close"
        onPress={onClose}
        style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}
      >
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
      </Pressable>

      <CorrectionSheet
        visible={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        placeId={place.placeId}
        lat={place.lat}
        lon={place.lon}
        colors={colors}
      />

      {adminToken ? (
        <AdminEditPlaceSheet
          visible={adminEditOpen}
          placeId={place.placeId ?? null}
          adminToken={adminToken}
          onClose={() => setAdminEditOpen(false)}
          onSaved={() => {
            setAdminEditOpen(false);
            onClose();
          }}
        />
      ) : null}
    </View>
  );
}

/** Photo affichee en grand : la premiere du tableau par defaut, ou la photo Wikipedia si aucune. */
function usePhotoSelection(gallery: string[], wikiPhoto: string | null): [string | null, (u: string) => void] {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [gallery.join('|')]);
  return [selected ?? gallery[0] ?? wikiPhoto, setSelected];
}

/** Carte de lien externe (horaires vols/trains) — v83 ne fait, lui non plus, que renvoyer vers le site officiel. */
function TransportLink({
  emoji,
  title,
  sub,
  url,
  colors,
}: {
  emoji: string;
  title: string;
  sub: string;
  url: string;
  colors: Palette;
}) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => [styles.transportLink, { backgroundColor: '#DBE8FB', opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[typography.caption, { color: '#1C3F70', fontWeight: '700' as const }]}>{title}</Text>
        <Text style={[typography.caption, { color: '#2A5EA8' }]}>{sub}</Text>
      </View>
      <Text style={{ color: '#2A5EA8', fontWeight: '800' as const }}>↗</Text>
    </Pressable>
  );
}

function ContactButton({
  label,
  color,
  textColor = '#fff',
  onPress,
}: {
  label: string;
  color: string;
  textColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cbtn, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={[typography.caption, { color: textColor, fontWeight: '700' as const }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '72%',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
  },
  grip: { width: 42, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: spacing.md },
  badge: {
    ...typography.caption,
    alignSelf: 'flex-start',
    fontWeight: '700' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  photoBox: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  photo: { width: '100%', height: '100%' },
  photoTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: 'rgba(10,88,64,0.82)',
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '700' as const,
  },
  gallery: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  thumb: { flex: 1, height: 52, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2 },
  thumbImage: { width: '100%', height: '100%' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { ...typography.destinationName, flex: 1, fontFamily: fonts.destinationName },
  favBtn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  address: { marginTop: spacing.xs },
  contribTag: {
    ...typography.caption,
    alignSelf: 'flex-start',
    fontWeight: '700' as const,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  transportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#2A5EA8',
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  cbtn: {
    flexGrow: 1,
    minWidth: 90,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promo: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  reportIssue: { alignItems: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm },
  adminPanel: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  adminPanelText: { fontWeight: '800' as const, fontSize: 13.5 },
  // Marge franche autour de la croix : le client a releve deux icones collees en haut a droite
  // de cette fiche. Elle est desormais decalee du bord et plus large que son pictogramme, donc
  // impossible a confondre — ou a toucher — avec un element voisin.
  closeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg + spacing.xs,
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
