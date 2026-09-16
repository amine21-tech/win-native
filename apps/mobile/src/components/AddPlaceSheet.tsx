import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, uploadPhoto } from '../api/client';
import { clearSearchCache } from '../search/usePlaceSearch';
import { PLACE_CATEGORIES, type PlaceCategory } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

type Coords = { lat: number; lon: number };

type Props = {
  coords: Coords | null;
  onClose: () => void;
  onSaved: () => void;
  colors: Palette;
};

/** Jusqu'a 3 photos par fiche (v81 #14) — la fiche du lieu (PlaceSheet) affiche deja une galerie
 * de plusieurs photos, mais ce formulaire n'en proposait qu'une seule a l'envoi. */
const MAX_PHOTOS = 3;

/** Largeur d'envoi. Le serveur re-limite a 1600 px de toute facon (routes/photos.ts) : au-dela,
 * on ne transporterait que des octets inutiles sur une connexion mobile algerienne. */
const UPLOAD_WIDTH = 1280;

const emptyForm = {
  name: '',
  category: 'autre' as PlaceCategory,
  street: '',
  houseNumber: '',
  city: '',
  postalCode: '',
  wilaya: '',
  phoneMobile: '',
  whatsapp: '',
  email: '',
  promo: '',
};

/** Pays deduit de la position choisie : un lieu ajoute pendant un essai en France ne doit pas
 * etre enregistre comme algerien. Boites englobantes larges, suffisantes pour trois pays que
 * la Mediterranee separe. */
function countryAt(lat: number, lon: number): 'DZ' | 'TN' | 'FR' {
  if (lat > 41 && lat < 51.5 && lon > -5.5 && lon < 9.8) return 'FR';
  if (lat > 30 && lat < 37.6 && lon > 7.5 && lon < 11.8 && !(lat < 34 && lon < 8.3)) return 'TN';
  return 'DZ';
}

/** Formulaire « Ajouter un lieu », declenche par un appui long sur la carte (openAddPoint en v83). */
export function AddPlaceSheet({ coords, onClose, onSaved, colors }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lieu enregistre, mais photo(s) non envoyee(s) : porte la raison technique. */
  const [savedWithoutPhoto, setSavedWithoutPhoto] = useState<string | null>(null);
  /** Service VIP : null = ferme, 'code' = saisie du code, sinon le code valide par le serveur. */
  const [vip, setVip] = useState<null | 'code' | { code: string }>(null);
  const [vipInput, setVipInput] = useState('');
  const [vipChecking, setVipChecking] = useState(false);
  const [vipError, setVipError] = useState<string | null>(null);
  /* Coordonnees saisissables, en plus de celles de l'appui long.
   *
   * Un partenaire VIP est souvent enregistre au bureau, a partir de coordonnees relevees sur
   * place ou communiquees par le commercant : il faut pouvoir les ECRIRE, pas seulement viser
   * un point sur la carte. Les deux champs partent de l'endroit touche, et le lieu est
   * enregistre a l'endroit affiche ici. */
  const [coordText, setCoordText] = useState({ lat: '', lon: '' });
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (coords) {
      setForm(emptyForm);
      setPhotoUris([]);
      setPreparingPhoto(false);
      setError(null);
      setSavedWithoutPhoto(null);
      setVip(null);
      setVipInput('');
      setVipError(null);
      setCoordText({ lat: coords.lat.toFixed(6), lon: coords.lon.toFixed(6) });
    }
  }, [coords]);

  if (!coords) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const removePhoto = (uri: string) => setPhotoUris((cur) => cur.filter((u) => u !== uri));

  /**
   * Reduit la photo AVANT de la garder, et non au moment de l'enregistrement.
   *
   * C'est la correction du plantage signale : une photo de telephone recent fait 12 megapixels,
   * soit environ 48 Mo une fois decodee en memoire. Elle etait decodee DEUX fois — une premiere
   * par la vignette affichee dans le formulaire, une seconde par le redimensionnement declenche
   * a l'appui sur « Enregistrer ». Avec trois photos, Android atteignait la limite de memoire du
   * processus et tuait l'application : elle se fermait d'un coup, sans message, exactement au
   * moment de l'enregistrement.
   *
   * En reduisant des la prise de vue, la vignette affiche un fichier deja petit et l'appui sur
   * « Enregistrer » n'a plus aucun travail d'image a faire.
   */
  const addPhoto = async (uri: string) => {
    setPreparingPhoto(true);
    try {
      const resized = await manipulateAsync(uri, [{ resize: { width: UPLOAD_WIDTH } }], {
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      setPhotoUris((cur) => [...cur, resized.uri].slice(0, MAX_PHOTOS));
    } catch {
      // Le redimensionnement a echoue : on garde l'originale plutot que de perdre la photo.
      // Le serveur la redimensionnera de son cote (routes/photos.ts), l'envoi sera seulement
      // plus long.
      setPhotoUris((cur) => [...cur, uri].slice(0, MAX_PHOTOS));
    } finally {
      setPreparingPhoto(false);
    }
  };

  // Deux boutons directs plutot qu'un Alert.alert() natif : un dialogue systeme empile par-dessus
  // ce Modal, suivi de l'ouverture d'une autre Activity (camera), provoquait un redemarrage de
  // l'application sur certains telephones — probleme connu d'empilement de fenetres natives sur
  // Android, evite en ne passant plus par Alert.alert() ici.
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError(t('addPlace.cameraDenied'));
      return;
    }
    // `exif: false` : les donnees EXIF ne servent a rien ici et alourdissent la reponse du
    // module natif, qui les transporte en memoire.
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, exif: false });
    const picked = result.canceled ? null : result.assets?.[0]?.uri;
    if (picked) await addPhoto(picked);
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('addPlace.galleryDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, exif: false });
    const picked = result.canceled ? null : result.assets?.[0]?.uri;
    if (picked) await addPhoto(picked);
  };

  /** Le code n'est jamais compare dans l'application : il est envoye au serveur, seul a le
   * connaitre. Il sera renvoye avec le lieu, et reverifie a l'enregistrement. */
  const checkVip = async () => {
    const code = vipInput.trim();
    if (!code) return;
    setVipChecking(true);
    setVipError(null);
    try {
      await api<{ ok: boolean }>('/places/vip-check', { method: 'POST', body: { code } });
      setVip({ code });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setVipError(t('addPlace.vipWrongCode'));
      else if (e instanceof ApiError && e.status === 429) setVipError(t('addPlace.vipTooMany'));
      else setVipError(t('errors.network'));
    } finally {
      setVipChecking(false);
    }
  };

  const vipCode = vip && typeof vip === 'object' ? vip.code : null;

  /** Coordonnees retenues : celles saisies si elles sont valides, sinon celles de l'appui long.
   * Une latitude hors [-90, 90] ou une longitude hors [-180, 180] est refusee a l'enregistrement
   * plutot que d'aller poser un lieu a l'autre bout du monde. */
  const typedLat = Number(coordText.lat.replace(',', '.'));
  const typedLon = Number(coordText.lon.replace(',', '.'));
  const coordsValid =
    Number.isFinite(typedLat) && Number.isFinite(typedLon) &&
    Math.abs(typedLat) <= 90 && Math.abs(typedLon) <= 180;
  const saveLat = coordsValid ? typedLat : coords.lat;
  const saveLon = coordsValid ? typedLon : coords.lon;

  const submit = async () => {
    if (!form.name.trim()) {
      setError(t('addPlace.nameRequired'));
      return;
    }
    if (!coordsValid) {
      setError(t('addPlace.coordsInvalid'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      /**
       * Les photos sont envoyees AVANT le lieu, mais leur echec ne l'empeche plus.
       *
       * Auparavant, une photo qui ne partait pas faisait echouer tout l'enregistrement : le
       * contributeur avait rempli nom, adresse, wilaya, telephone — et repartait sans rien.
       * C'est la mauvaise priorite. Le lieu est ce qui a de la valeur pour la carte ; la photo
       * l'illustre. On enregistre donc ce qui peut l'etre, et on dit clairement ce qui a
       * manque, plutot que de tout perdre pour une image.
       */
      const photoIds: string[] = [];
      let photoProblem: string | null = null;
      if (photoUris.length > 0) {
        for (const uri of photoUris) {
          try {
            // Sequentiel plutot que Promise.all — trois envois simultanes sur une connexion
            // mobile algerienne se genent plus qu'ils ne s'aident.
            const uploaded = await uploadPhoto(uri);
            photoIds.push(uploaded.id);
          } catch (e) {
            photoProblem = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
          }
        }
      }

      await api<{ id: string }>('/places', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          category: form.category,
          lat: saveLat,
          lon: saveLon,
          country: countryAt(saveLat, saveLon),
          street: form.street.trim() || undefined,
          houseNumber: form.houseNumber.trim() || undefined,
          city: form.city.trim() || undefined,
          postalCode: form.postalCode.trim() || undefined,
          wilaya: form.wilaya.trim() || undefined,
          phoneMobile: form.phoneMobile.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          email: form.email.trim() || undefined,
          photoIds: photoIds.length > 0 ? photoIds : undefined,
          promo: vipCode ? form.promo.trim() || undefined : undefined,
          vipCode: vipCode ?? undefined,
        },
      });

      clearSearchCache();
      if (photoProblem) {
        // Le lieu est en base : on ne referme pas le formulaire sur un simple message d'erreur,
        // on dit ce qui s'est passe pour que le contributeur sache qu'il peut revenir ajouter
        // la photo plus tard depuis la fiche.
        setSavedWithoutPhoto(photoProblem);
        return;
      }
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setVip('code');
        setVipError(t('addPlace.vipWrongCode'));
      } else if (e instanceof ApiError && e.status === 409) {
        setError(t('addPlace.duplicate'));
      } else {
        const detail = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
        setError(`${t('addPlace.error')} — ${detail}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* `maxHeight` laisse une bande libre en haut, et la marge basse suit la barre de
            navigation du telephone : le bouton « Enregistrer » touchait le bord inferieur de
            l'ecran, sans aucune respiration. */}
        <View style={[styles.box, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.head}>
            <Text style={[typography.heading, { color: colors.text }]}>
              {vipCode ? `⭐ ${t('addPlace.vipTitle')}` : t('addPlace.title')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {savedWithoutPhoto ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[typography.body, { color: colors.text, marginBottom: spacing.sm }]}>
                {t('addPlace.savedWithoutPhoto')}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{savedWithoutPhoto}</Text>
              <Pressable onPress={onSaved} style={[styles.save, { backgroundColor: colors.accent }]}>
                <Text style={styles.saveText}>{t('search.confirm')}</Text>
              </Pressable>
            </ScrollView>
          ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[typography.caption, styles.coords, { color: colors.accent, backgroundColor: colors.surfaceAlt }]}>
              📍 {saveLat.toFixed(5)}, {saveLon.toFixed(5)}
            </Text>

            {/* Coordonnees modifiables : indispensables pour enregistrer un partenaire VIP dont
                on a releve la position ailleurs, sans avoir a viser le point sur la carte. */}
            <View style={styles.row2}>
              <Field label={t('addPlace.latitude')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={coordText.lat}
                  onChangeText={(v) => setCoordText((c) => ({ ...c, lat: v }))}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: colors.text, borderColor: coordsValid ? colors.border : colors.danger }]}
                />
              </Field>
              <Field label={t('addPlace.longitude')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={coordText.lon}
                  onChangeText={(v) => setCoordText((c) => ({ ...c, lon: v }))}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { color: colors.text, borderColor: coordsValid ? colors.border : colors.danger }]}
                />
              </Field>
            </View>

            <Field label={t('addPlace.name')} colors={colors}>
              <TextInput
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder={t('addPlace.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>

            <Text style={[styles.label, { color: colors.textMuted }]}>{t('addPlace.category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
              {PLACE_CATEGORIES.map((cat) => {
                const on = cat === form.category;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => set('category', cat)}
                    style={[
                      styles.catChip,
                      { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.surface },
                    ]}
                  >
                    <Text style={{ color: on ? colors.accentText : colors.text, fontSize: 12.5, fontWeight: '700' }}>
                      {t(`placeCategories.${cat}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.row2}>
              <Field label={t('addPlace.houseNumber')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={form.houseNumber}
                  onChangeText={(v) => set('houseNumber', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
              <Field label={t('addPlace.street')} colors={colors} style={{ flex: 2 }}>
                <TextInput
                  value={form.street}
                  onChangeText={(v) => set('street', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
            </View>

            <View style={styles.row2}>
              <Field label={t('addPlace.postalCode')} colors={colors} style={{ flex: 1 }}>
                <TextInput
                  value={form.postalCode}
                  onChangeText={(v) => set('postalCode', v)}
                  keyboardType="number-pad"
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
              <Field label={t('addPlace.city')} colors={colors} style={{ flex: 2 }}>
                <TextInput
                  value={form.city}
                  onChangeText={(v) => set('city', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>
            </View>

            <Field label={t('addPlace.wilaya')} colors={colors}>
              <TextInput
                value={form.wilaya}
                onChangeText={(v) => set('wilaya', v)}
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>

            <Field label={t('addPlace.phoneMobile')} colors={colors}>
              <TextInput
                value={form.phoneMobile}
                onChangeText={(v) => set('phoneMobile', v)}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>
            <Field label={t('addPlace.whatsapp')} colors={colors}>
              <TextInput
                value={form.whatsapp}
                onChangeText={(v) => set('whatsapp', v)}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>
            <Field label={t('addPlace.email')} colors={colors}>
              <TextInput
                value={form.email}
                onChangeText={(v) => set('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Field>

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('addPlace.photo')} {photoUris.length > 0 ? `(${photoUris.length}/${MAX_PHOTOS})` : ''}
              {preparingPhoto ? ` — ${t('addPlace.preparingPhoto')}` : ''}
            </Text>
            {photoUris.length > 0 ? (
              <View style={styles.photoRow}>
                {photoUris.map((uri) => (
                  <Pressable key={uri} onPress={() => removePhoto(uri)} style={styles.photoThumbWrap}>
                    {/* `resizeMethod="resize"` : Android decode l'image DEJA reduite a la
                        taille d'affichage, au lieu de charger le bitmap entier en memoire
                        pour le reduire ensuite. Sur une vignette de 88 points, la difference
                        se compte en dizaines de megaoctets par photo. */}
                    <Image source={{ uri }} style={styles.photoThumb} resizeMethod="resize" />
                    <View style={[styles.removePhotoBadge, { backgroundColor: colors.danger }]}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✕</Text>
                    </View>
                  </Pressable>
                ))}
                {photoUris.length < MAX_PHOTOS ? (
                  <View style={[styles.photoAddTile, { borderColor: colors.border }]}>
                    <Pressable onPress={() => void takePhoto()} style={styles.photoAddHalf}>
                      <Text style={{ fontSize: 18 }}>📷</Text>
                    </Pressable>
                    <View style={[styles.photoAddDivider, { backgroundColor: colors.border }]} />
                    <Pressable onPress={() => void pickFromGallery()} style={styles.photoAddHalf}>
                      <Text style={{ fontSize: 18 }}>🖼️</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.photoRow}>
                <Pressable onPress={() => void takePhoto()} style={[styles.photoBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted }}>📷 {t('addPlace.camera')}</Text>
                </Pressable>
                <Pressable onPress={() => void pickFromGallery()} style={[styles.photoBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textMuted }}>🖼️ {t('addPlace.gallery')}</Text>
                </Pressable>
              </View>
            )}

            {/* Service VIP — bouton dore, puis code, comme « Ajouter un partenaire VIP » en v83. */}
            {vipCode ? (
              <>
                <View style={[styles.vipBanner, { borderColor: colors.goldDeep, backgroundColor: colors.gold + '22' }]}>
                  <Text style={[styles.vipBannerText, { color: colors.alert }]}>⭐ {t('addPlace.vipActive')}</Text>
                </View>
                <Field label={t('addPlace.promo')} colors={colors}>
                  <TextInput
                    value={form.promo}
                    onChangeText={(v) => set('promo', v)}
                    placeholder={t('addPlace.promoPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    maxLength={280}
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  />
                </Field>
              </>
            ) : vip === 'code' ? (
              <View style={styles.vipCodeZone}>
                <Text style={[styles.label, { color: colors.textMuted }]}>{t('addPlace.vipCode')}</Text>
                <View style={styles.row2}>
                  <TextInput
                    value={vipInput}
                    onChangeText={setVipInput}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={32}
                    placeholder="••••"
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={() => void checkVip()}
                    style={[styles.input, styles.vipInput, { color: colors.text, borderColor: colors.goldDeep }]}
                  />
                  <Pressable
                    onPress={() => void checkVip()}
                    disabled={vipChecking}
                    style={[styles.vipOk, { backgroundColor: colors.goldDeep, opacity: vipChecking ? 0.7 : 1 }]}
                  >
                    {vipChecking ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>OK</Text>}
                  </Pressable>
                </View>
                {vipError ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{vipError}</Text> : null}
              </View>
            ) : (
              <Pressable
                onPress={() => setVip('code')}
                style={[styles.vipBtn, { borderColor: colors.goldDeep, backgroundColor: colors.surface }]}
              >
                <Text style={[styles.vipBtnText, { color: colors.goldDeep }]}>⭐ {t('addPlace.vipButton')}</Text>
              </Pressable>
            )}

            {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={submitting || preparingPhoto}
              style={[
                styles.save,
                { backgroundColor: vipCode ? colors.goldDeep : colors.accent, opacity: submitting || preparingPhoto ? 0.7 : 1 },
              ]}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{vipCode ? t('addPlace.vipSave') : t('addPlace.save')}</Text>}
            </Pressable>
          </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  colors,
  children,
  style,
}: {
  label: string;
  colors: Palette;
  children: ReactNode;
  style?: object;
}) {
  return (
    <View style={style}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  box: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  coords: {
    alignSelf: 'flex-start',
    fontWeight: '700' as const,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  label: { fontSize: 12.5, fontWeight: '700' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14 },
  row2: { flexDirection: 'row', gap: spacing.sm },
  catRow: { flexGrow: 0 },
  catChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm },
  photoBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  photoRow: { flexDirection: 'row', gap: spacing.sm },
  photoThumbWrap: { position: 'relative', width: 88, height: 88 },
  photoThumb: { width: '100%', height: '100%', borderRadius: radius.md },
  removePhotoBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddTile: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  photoAddHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoAddDivider: { width: 1.5 },
  save: { marginTop: spacing.lg, marginBottom: spacing.md, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' as const, fontSize: 15 },
  vipBtn: { marginTop: spacing.lg, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  vipBtnText: { fontWeight: '800' as const, fontSize: 14.5 },
  vipCodeZone: { marginTop: spacing.md },
  vipInput: { flex: 1, textAlign: 'center', letterSpacing: 6, fontWeight: '800' as const },
  vipOk: { borderRadius: radius.sm, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  vipBanner: { marginTop: spacing.lg, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md },
  vipBannerText: { fontWeight: '800' as const, fontSize: 13.5, textAlign: 'center' },
});
