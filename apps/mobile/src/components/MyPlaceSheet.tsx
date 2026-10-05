import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../api/client';
import { clearSearchCache } from '../search/usePlaceSearch';
import { PLACE_CATEGORIES, type PlaceCategory } from '../shared';
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
  place: { id: string; name: string; category?: string; lat: number; lon: number } | null;
  onClose: () => void;
  onSaved: () => void;
  colors: Palette;
};

export function MyPlaceSheet({ visible, place, onClose, onSaved, colors }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('autre');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!place) return;
    setName(place.name);
    setCategory((place.category as PlaceCategory) ?? 'autre');
    setLat(place.lat.toFixed(6));
    setLon(place.lon.toFixed(6));
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
        body: { name: name.trim(), category, lat: typedLat, lon: typedLon },
      });
      clearSearchCache();
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  if (!place) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.surface }]}>
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
  saveText: { color: '#fff', fontWeight: '800' as const, fontSize: 15.5 },
});
