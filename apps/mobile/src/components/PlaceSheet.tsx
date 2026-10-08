import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { egsaForAirport, isAirport, isTrainStation, SNTF_URL } from '../reports/transport';
import type { Route, RouteMode } from '../navigation/routing';
import type { GeocodedResult } from '../search/geocode';
import { formatDistance } from '../shared';
import { useAdminSession } from '../store/admin';
import { lookupPlacePhoto, photoSource } from '../place/placePhoto';
import { localPhotoUri } from '../place/photoCache';
import { useMyPlaceIds, useRefreshMyPlaces } from '../place/useMyPlaces';
import { MyPlaceSheet } from './MyPlaceSheet';
import { ReportPhotoSheet } from './ReportPhotoSheet';
import { api } from '../api/client';
import { clearSearchCache } from '../search/usePlaceSearch';
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
    void (async () => {
      const found = await lookupPlacePhoto(place);
      if (cancelled || !found) return;
      /* DEUX VOIES, et c'est deliberé.
       *
       * On telecharge l'image nous-memes quand c'est possible : Wikimedia refuse les requetes
       * sans agent declare, et rien ne garantit que le composant natif transmette les en-tetes
       * de la source. Mais `downloadAsync` appartient a la partie depreciee d'expo-file-system
       * et peut tout simplement ne pas exister dans la compilation — c'est ce qui s'est produit,
       * et la fiche se retrouvait sans photo alors que l'adresse etait trouvee.
       *
       * Faute de telechargement, on affiche donc l'adresse distante telle quelle : les en-tetes
       * y sont jointes par `photoSource`, et si le composant les transmet, l'image s'affiche.
       * Deux chances valent mieux qu'une seule. */
      const local = await localPhotoUri(found);
      if (!cancelled) setPhoto(local ?? found);
    })();
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
  /* Trois etats explicites pour la photo, et non « ca marche ou rien ».
   *
   * Le client a decrit le symptome exactement : un cadre gris vide a la premiere recherche,
   * plus de cadre du tout a la seconde. Un cadre vide et silencieux ne dit rien a personne —
   * ni a l'utilisateur, ni au developpeur. Desormais : pendant le chargement, le cadre porte
   * un indicateur ; en cas d'echec, il disparait entierement plutot que de rester vide ; le
   * bandeau de credit n'apparait qu'une fois l'image reellement affichee. */
  const [photoState, setPhotoState] = useState<'loading' | 'ok' | 'failed'>('loading');
  useEffect(() => setPhotoState('loading'), [mainPhoto]);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const adminToken = useAdminSession((s) => s.token);
  /* Ce lieu a-t-il ete enregistre depuis CET appareil ? Le serveur en est seul juge — il garde
   * l'appareil createur — et c'est ce qui ouvre « Modifier » et « Supprimer ». */
  const myPlaceIds = useMyPlaceIds();
  const refreshMyPlaces = useRefreshMyPlaces();
  const [myEditOpen, setMyEditOpen] = useState(false);
  const [photoReportOpen, setPhotoReportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!place) return null;

  const isContributed = place.source === 'win';
  const isMine = !!place.placeId && myPlaceIds.has(place.placeId);
  /* Seules les photos de contributeurs se signalent : une illustration Wikimedia ne nous
   * appartient pas, et il n'y a rien a moderer chez nous la concernant. */
  const currentPhotoId = place.photos?.find((ph) => ph.url === mainPhoto)?.id ?? null;

  /* La confirmation est obligatoire et le dit clairement : la suppression efface la photo, les
   * coordonnees et tout ce qui est rattache au lieu, sans retour possible cote utilisateur. */
  const askDelete = () => {
    Alert.alert(t('place.deleteConfirmTitle'), t('place.deleteConfirm'), [
      { text: t('addPlace.cancel'), style: 'cancel' },
      {
        text: t('place.deletePlace'),
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void api(`/places/${place.placeId}/mine`, { method: 'DELETE' })
            .then(() => {
              clearSearchCache();
              refreshMyPlaces();
              onClose();
            })
            .catch(() => Alert.alert(t('errors.generic')))
            .finally(() => setDeleting(false));
        },
      },
    ]);
  };
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

        {/* Une photo trouvee mais impossible a charger le DIT, au lieu de disparaitre sans
            laisser de trace. C'est ce que le client demandait — jamais de cadre vide
            silencieux — et c'est aussi notre seul moyen de distinguer, depuis un telephone,
            une adresse introuvable d'une image refusee. */}
        {mainPhoto && photoState === 'failed' ? (
          <Text style={[typography.caption, styles.photoFailed, { color: colors.textMuted }]}>
            📷 {t('place.photoUnavailable')}
          </Text>
        ) : null}

        {mainPhoto && photoState !== 'failed' ? (
          <View style={[styles.photoBox, { backgroundColor: colors.surfaceAlt }]}>
            {/* `key` lie l'image a son adresse : changer de lieu detruit et recree la vue au
                lieu de la reutiliser avec l'etat de la recherche precedente. */}
            <Image
              key={mainPhoto}
              source={photoSource(mainPhoto)}
              style={styles.photo}
              resizeMode="cover"
              onLoad={() => setPhotoState('ok')}
              onError={() => setPhotoState('failed')}
            />
            {photoState === 'loading' ? (
              <View style={[StyleSheet.absoluteFill, styles.photoLoading]}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null}
            {/* Bandeau pose SUR l'image, comme sur le site : une photo de contributeur doit se
                reconnaitre immediatement comme telle, sans avoir a chercher la mention plus bas.
                Une illustration Wikimedia, elle, porte sa mention de credit. Il n'apparait
                qu'une fois l'image affichee — annoncer « © Wikimedia » sur un cadre vide etait
                precisement ce qui rendait le defaut incomprehensible. */}
            {photoState === 'ok' ? (
              <Text style={styles.photoTag}>
                {gallery.includes(mainPhoto) ? t('place.photoByWin') : '© Wikimedia'}
              </Text>
            ) : null}

            {/* Discret, en haut a droite de l'image : une photo juste ne doit pas etre encombree
                d'un bouton, mais une photo fausse doit pouvoir se signaler sans chercher. */}
            {photoState === 'ok' && currentPhotoId ? (
              <Pressable
                onPress={() => setPhotoReportOpen(true)}
                hitSlop={10}
                accessibilityLabel={t('place.reportPhoto')}
                style={styles.photoFlag}
              >
                <Text style={styles.photoFlagText}>⚑</Text>
              </Pressable>
            ) : null}
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
                <Image source={photoSource(url)} style={styles.thumbImage} resizeMode="cover" />
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

        {/* Gestion par l'auteur de la fiche. Reservee aux lieux WIN enregistres depuis cet
            appareil : rien de tout cela n'apparait sur un resultat OpenStreetMap, qu'on ne
            peut ni corriger ni retirer ici. */}
        {isMine ? (
          <View style={styles.ownerRow}>
            <Pressable
              onPress={() => setMyEditOpen(true)}
              style={[styles.ownerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={[typography.caption, { color: colors.text, fontWeight: '700' }]}>
                ✏️ {t('place.editPlace')}
              </Text>
            </Pressable>
            <Pressable
              disabled={deleting}
              onPress={askDelete}
              style={[styles.ownerBtn, { borderColor: colors.danger, backgroundColor: colors.danger + '12' }]}
            >
              <Text style={[typography.caption, { color: colors.danger, fontWeight: '700' }]}>
                {deleting ? '…' : `🗑 ${t('place.deletePlace')}`}
              </Text>
            </Pressable>
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

      <ReportPhotoSheet
        visible={photoReportOpen}
        photoId={currentPhotoId}
        onClose={() => setPhotoReportOpen(false)}
        onSent={() => setPhotoReportOpen(false)}
        colors={colors}
      />

      <MyPlaceSheet
        visible={myEditOpen}
        place={
          isMine && place.placeId
            ? { id: place.placeId, name: place.name, category: place.category, lat: place.lat, lon: place.lon }
            : null
        }
        onClose={() => setMyEditOpen(false)}
        onSaved={() => {
          setMyEditOpen(false);
          refreshMyPlaces();
          onClose();
        }}
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
  photoFlag: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFlagText: { color: '#fff', fontSize: 14, lineHeight: 16 },
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
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  photoFailed: { textAlign: 'center', paddingVertical: spacing.sm },
  ownerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ownerBtn: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
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
