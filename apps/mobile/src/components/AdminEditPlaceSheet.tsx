import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { clearSearchCache } from '../search/usePlaceSearch';
import { PLACE_CATEGORIES, type PlaceCategory } from '../shared';
import { radius, spacing, typography, type Palette } from '../theme';

type PlaceRecord = {
  id: string;
  name: string;
  category: PlaceCategory;
  houseNumber: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  wilaya: string | null;
  phoneFixe: string | null;
  phoneMobile: string | null;
  whatsapp: string | null;
  email: string | null;
  enseigne: string | null;
  promo: string | null;
  isPartner: boolean;
};

type Props = {
  visible: boolean;
  placeId: string | null;
  adminToken: string;
  onClose: () => void;
  onSaved: () => void;
};

const emptyForm = {
  name: '',
  category: 'autre' as PlaceCategory,
  houseNumber: '',
  street: '',
  city: '',
  postalCode: '',
  wilaya: '',
  phoneMobile: '',
  whatsapp: '',
  email: '',
  promo: '',
};

/**
 * Panneau "Gerer cette fiche (administrateur)" — Modifier / Declasser / Supprimer (doc "22
 * chantiers" #17). Les trois actions n'existaient que server-side (voir apps/api/src/routes/
 * places.ts, requireAdmin) : aucun ecran mobile ne les declenchait encore.
 */
export function AdminEditPlaceSheet({ visible, placeId, adminToken, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [isPartner, setIsPartner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colors = ADMIN_COLORS;

  useEffect(() => {
    if (!visible || !placeId) return;
    setLoading(true);
    setError(null);
    api<PlaceRecord>(`/places/${placeId}`, { adminToken })
      .then((p) => {
        setForm({
          name: p.name,
          category: p.category,
          houseNumber: p.houseNumber ?? '',
          street: p.street ?? '',
          city: p.city ?? '',
          postalCode: p.postalCode ?? '',
          wilaya: p.wilaya ?? '',
          phoneMobile: p.phoneMobile ?? '',
          whatsapp: p.whatsapp ?? '',
          email: p.email ?? '',
          promo: p.promo ?? '',
        });
        setIsPartner(p.isPartner);
      })
      .catch(() => setError(t('admin.loadError')))
      .finally(() => setLoading(false));
  }, [visible, placeId, adminToken, t]);

  if (!placeId) return null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/places/${placeId}`, {
        method: 'PATCH',
        adminToken,
        body: {
          name: form.name.trim(),
          category: form.category,
          houseNumber: form.houseNumber.trim() || undefined,
          street: form.street.trim() || undefined,
          city: form.city.trim() || undefined,
          postalCode: form.postalCode.trim() || undefined,
          wilaya: form.wilaya.trim() || undefined,
          phoneMobile: form.phoneMobile.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          email: form.email.trim() || undefined,
          promo: form.promo.trim() || undefined,
        },
      });
      clearSearchCache();
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('admin.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const declass = () => {
    Alert.alert(t('admin.declassConfirmTitle'), t('admin.declassConfirmBody'), [
      { text: t('search.cancel'), style: 'cancel' },
      {
        text: t('admin.declass'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/places/${placeId}`, { method: 'PATCH', adminToken, body: { isPartner: false } });
            clearSearchCache();
            onSaved();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : t('admin.saveError'));
          }
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert(t('admin.deleteConfirmTitle'), t('admin.deleteConfirmBody'), [
      { text: t('search.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/places/${placeId}`, { method: 'DELETE', adminToken });
            clearSearchCache();
            onSaved();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : t('admin.saveError'));
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <Text style={[typography.heading, { color: colors.text }]}>{t('admin.editTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xl }} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label={t('addPlace.name')} colors={colors}>
                <TextInput
                  value={form.name}
                  onChangeText={(v) => set('name', v)}
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
              <Field label={t('admin.promo')} colors={colors}>
                <TextInput
                  value={form.promo}
                  onChangeText={(v) => set('promo', v)}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </Field>

              {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text> : null}

              <Pressable onPress={() => void save()} disabled={saving} style={[styles.save, { backgroundColor: colors.accent, opacity: saving ? 0.7 : 1 }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('admin.save')}</Text>}
              </Pressable>

              <View style={styles.dangerRow}>
                {isPartner ? (
                  <Pressable onPress={declass} style={[styles.dangerBtn, { borderColor: colors.gold }]}>
                    <Text style={[styles.dangerBtnText, { color: colors.alert }]}>⬇️ {t('admin.declass')}</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={remove} style={[styles.dangerBtn, { borderColor: colors.danger }]}>
                  <Text style={[styles.dangerBtnText, { color: colors.danger }]}>🗑️ {t('admin.delete')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Palette fixe : ce panneau n'a pas de prop `colors` (aucun appelant n'en a besoin de themer),
// et reste lisible aussi bien en mode jour que nuit.
const ADMIN_COLORS: Palette = {
  background: '#F4F1E8',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F1E8',
  text: '#15201C',
  textMuted: '#6B7A72',
  border: '#E2DDCD',
  accent: '#0D6E4F',
  accentDark: '#0A5840',
  accentText: '#FFFFFF',
  gold: '#E9B949',
  goldDeep: '#D4AF6A',
  alert: '#B8860B',
  danger: '#C8102E',
};

function Field({ label, colors, children, style }: { label: string; colors: Palette; children: ReactNode; style?: object }) {
  return (
    <View style={style}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  box: { maxHeight: '90%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  label: { fontSize: 12.5, fontWeight: '700' as const, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14 },
  row2: { flexDirection: 'row', gap: spacing.sm },
  catRow: { flexGrow: 0 },
  catChip: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm },
  save: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' as const, fontSize: 15 },
  dangerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  dangerBtn: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  dangerBtnText: { fontWeight: '700' as const, fontSize: 13 },
});
