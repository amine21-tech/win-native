import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../src/api/client';
import { useAdminSession } from '../src/store/admin';
import { palette, radius, spacing, typography, type Palette } from '../src/theme';

type PayoutAccount = { type: 'ccp' | 'bank'; accountNumber: string; holderName: string };

/**
 * Espace administrateur : connexion par compte reel (voir apps/api/src/routes/admin.ts, deja
 * construit cote serveur) puis configuration du compte CCP/bancaire qui recoit les paiements de
 * deblocage Tunisie. Premiere brique du chantier paiement — le reglement en ligne lui-meme
 * suivra une fois le fournisseur choisi.
 */
export default function AdminScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme() ?? 'light';
  const colors = palette[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const { token, admin, loading, error, login, logout } = useAdminSession();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.head}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: colors.textMuted, fontSize: 22 }}>←</Text>
          </Pressable>
          <Text style={[typography.title, { color: colors.text }]}>{t('admin.title')}</Text>
        </View>

        {!admin || !token ? (
          <LoginForm colors={colors} loading={loading} error={error} onSubmit={login} />
        ) : (
          <Dashboard colors={colors} adminName={admin.displayName} token={token} onLogout={logout} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LoginForm({
  colors,
  loading,
  error,
  onSubmit,
}: {
  colors: Palette;
  loading: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View>
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{t('admin.loginHint')}</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={t('admin.email')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={t('admin.password')}
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text> : null}
      <Pressable
        onPress={() => void onSubmit(email.trim(), password)}
        disabled={loading || !email.trim() || !password}
        style={[styles.btn, { backgroundColor: colors.accent, opacity: loading || !email.trim() || !password ? 0.6 : 1 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('admin.login')}</Text>}
      </Pressable>
    </View>
  );
}

function Dashboard({
  colors,
  adminName,
  token,
  onLogout,
}: {
  colors: Palette;
  adminName: string;
  token: string;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'payout-account'],
    queryFn: () => api<PayoutAccount>('/admin/payout-account', { adminToken: token }),
    retry: false,
  });

  const [type, setType] = useState<'ccp' | 'bank'>(query.data?.type ?? 'ccp');
  const [accountNumber, setAccountNumber] = useState(query.data?.accountNumber ?? '');
  const [holderName, setHolderName] = useState(query.data?.holderName ?? '');
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!hydrated && query.data) {
    setType(query.data.type);
    setAccountNumber(query.data.accountNumber);
    setHolderName(query.data.holderName);
    setHydrated(true);
  }

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api('/admin/payout-account', {
        method: 'PUT',
        adminToken: token,
        body: { type, accountNumber: accountNumber.trim(), holderName: holderName.trim() },
      });
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={[typography.body, { color: colors.textMuted, marginBottom: spacing.lg }]}>
        {t('admin.welcome', { name: adminName })}
      </Text>

      <Text style={[typography.heading, { color: colors.text }]}>{t('admin.payoutTitle')}</Text>
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{t('admin.payoutHint')}</Text>

      {query.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} /> : null}

      <View style={[styles.typeRow, { backgroundColor: colors.surfaceAlt }]}>
        <Pressable
          onPress={() => setType('ccp')}
          style={[styles.typeBtn, type === 'ccp' && { backgroundColor: colors.accent }]}
        >
          <Text style={{ color: type === 'ccp' ? colors.accentText : colors.text, fontWeight: '700' }}>CCP</Text>
        </Pressable>
        <Pressable
          onPress={() => setType('bank')}
          style={[styles.typeBtn, type === 'bank' && { backgroundColor: colors.accent }]}
        >
          <Text style={{ color: type === 'bank' ? colors.accentText : colors.text, fontWeight: '700' }}>
            {t('admin.bankAccount')}
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={accountNumber}
        onChangeText={setAccountNumber}
        placeholder={t('admin.accountNumber')}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />
      <TextInput
        value={holderName}
        onChangeText={setHolderName}
        placeholder={t('admin.holderName')}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
      />

      {saveError ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{saveError}</Text> : null}
      {saved ? <Text style={[typography.caption, { color: colors.accent, marginTop: spacing.sm }]}>{t('admin.saved')}</Text> : null}

      <Pressable
        onPress={() => void save()}
        disabled={saving || !accountNumber.trim() || !holderName.trim()}
        style={[
          styles.btn,
          { backgroundColor: colors.accent, opacity: saving || !accountNumber.trim() || !holderName.trim() ? 0.6 : 1 },
        ]}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('admin.save')}</Text>}
      </Pressable>

      <Pressable onPress={onLogout} style={styles.logout}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  hint: { marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 18 },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  typeRow: { flexDirection: 'row', borderRadius: radius.md, padding: 4, marginTop: spacing.sm, gap: 4 },
  typeBtn: { flex: 1, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  btn: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' as const, fontSize: 15 },
  logout: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.sm },
});
