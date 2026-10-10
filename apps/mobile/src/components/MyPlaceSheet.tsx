import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../api/client';
import { clearSearchCache } from '../search/usePlaceSearch';
import { PLACE_CATEGORIES, type PlaceCategory } from '../shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type Palette } from '../theme';

/**
 * « Modifier » un lieu que l'on a soi-meme enregistre.
 *
 * Jusqu'ici, seul un moderateur pouvait corriger une fiche : un contributeur qui s'etait
 * trompe de nom ou dont le GPS avait derape devait nous ecrire et attendre. Il peut desormais
 * corriger lui-meme, et le serveur verifie que la fiche est bien la sienne.
 *
 * Volontairement limite a ce qui se corrige vraiment : le nom, la categorie et les
 * coordonnees. Le reste de la fiche — contacts, adresse — se modifie par le meme formulaire
 * qu'a la creation, et le statut partenaire reste hors de portee : c'est un engagement
 * commercial, pas une information saisie par le contributeur.
 */
type Props = {
  visible: boolean;
  place: {
    id: string;
    name: string;
    category?: string;
    lat: number;
    lon: number;
    /** Adresse telle qu'elle a ete saisie, pour pouvoir la corriger sans tout refaire. */
    houseNumber?: string | null;
    street?: string | null;
    city?: string | null;
    postalCode?: string | null;
    wilaya?: string | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
  /** Suppression confirmee depuis cet ecran : l'appelant referme la fiche du lieu. */
  onDeleted: () => void;
  colors: Palette;
};

export function MyPlaceSheet({ visible, place, onClose, onSaved, onDeleted, colors }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('autre');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  /* L'adresse se corrige ici aussi. C'est la demande la plus frequente apres le nom : un lieu
   * enregistre a la va-vite porte souvent une rue approximative ou une ville vide, et il
   * fallait jusqu'ici tout supprimer pour recommencer. */
  const [houseNumber, setHouseNumber] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!place) return;
    setName(place.name);
    setCategory((place.category as PlaceCategory) ?? 'autre');
    setLat(place.lat.toFixed(6));
    setLon(place.lon.toFixed(6));
    setHouseNumber(place.houseNumber ?? '');
    setStreet(place.street ?? '');
    setCity(place.city ?? '');
    setPostalCode(place.postalCode ?? '');
    setError(null);
  }, [place]);

  const typedLat = Number(lat.replace(',', '.'));
  const typedLon = Number(lon.replace(',', '.'));
  const coordsValid =
    Number.isFinite(typedLat) && Number.isFinite(typedLon) && Math.abs(typedLat) <= 90 && Math.abs(typedLon) <= 180;

  const save = async () => {
    if (!place) return;
    if (!name.trim()) {
      setError(t('addPlace.nameRequired'));
      return;
    }
    if (!coordsValid) {
      setError(t('addPlace.coordsInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/places/${place.id}/mine`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          category,
          lat: typedLat,
          lon: typedLon,
          // Un champ vide efface la valeur precedente plutot que de la conserver : corriger
          // une adresse, c'est aussi pouvoir retirer une rue saisie par erreur.
          houseNumber: houseNumber.trim(),
          street: street.trim(),
          city: city.trim(),
          postalCode: postalCode.trim(),
        },
      });
      clearSearchCache();
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  /* « Quand on essaie de modifier, on donne la main a supprimer » : les deux gestes vont
   * ensemble. Celui qui ouvre cet ecran pour corriger une fiche fausse decide souvent, une
   * fois devant, qu'elle ne vaut pas d'etre corrigee. La confirmation dit ce qu'elle efface. */
  const askDelete = () => {
    if (!place) return;
    Alert.alert(t('place.deleteConfirmTitle'), t('place.deleteConfirm'), [
      { text: t('addPlace.cancel'), style: 'cancel' },
      {
        text: t('place.deletePlace'),
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void api(`/places/${place.id}/mine`, { method: 'DELETE' })
            .then(() => {
              clearSearchCache();
              onDeleted();
            })
            .catch(() => setError(t('errors.generic')))
            .finally(() => setDeleting(false));
        },
      },
    ]);
  };

  if (!place) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.head}>
            <Text style={[typography.heading, { color: colors.text }]}>✏️ {t('place.editPlace')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('addPlace.name')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
              {t('addPlace.category')}
            </Text>
            <View style={styles.cats}>
              {PLACE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.cat,
                    {
                      borderColor: c === category ? colors.accent : colors.border,
                      backgroundColor: c === category ? colors.accent : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 11.5, color: c === category ? colors.accentText : colors.text }}>
                    {t(`categories.items.${c}`, { defaultValue: c })}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Les coordonnees sont modifiables a la main : c'est la correction la plus utile
                quand le GPS a derape au moment de l'enregistrement. */}
            <View style={styles.row2}>
              <View style={styles.half}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Latitude</Text>
                <TextInput
                  value={lat}
                  onChangeText={setLat}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
              </View>
              <View style={styles.half}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Longitude</Text>
                <TextInput
                  value={lon}
                  onChangeText={setLon}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
              </View>
            </View>

            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
              {t('addPlace.address')}
            </Text>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={houseNumber}
                  onChangeText={setHouseNumber}
                  placeholder={t('addPlace.houseNumber')}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
              </View>
              <View style={{ flex: 3 }}>
                <TextInput
                  value={street}
                  onChangeText={setStreet}
                  placeholder={t('addPlace.street')}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
              </View>
            </View>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder={t('addPlace.postalCode')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
              </View>
              <View style={{ flex: 2 }}>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder={t('addPlace.city')}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
              </View>
            </View>

            {error ? (
              <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text>
            ) : null}

            <Pressable
              disabled={saving}
              onPress={() => void save()}
              style={[styles.save, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={styles.saveText}>{saving ? '…' : t('search.confirm')}</Text>
            </Pressable>

            <Pressable
              disabled={deleting}
              onPress={askDelete}
              style={({ pressed }) => [
                styles.delete,
                { borderColor: colors.danger, backgroundColor: pressed ? colors.danger + '12' : 'transparent' },
              ]}
            >
              <Text style={[styles.deleteText, { color: colors.danger }]}>
                {deleting ? '…' : `🗑 ${t('place.deletePlace')}`}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  box: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: '86%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, marginTop: 4 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  cat: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  row2: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  half: { flex: 1 },
  save: { marginTop: spacing.lg, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  delete: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteText: { fontWeight: '800' as const, fontSize: 14.5 },
  saveText: { color: '#fff', fontWeight: '800' as const, fontSize: 15.5 },
});
