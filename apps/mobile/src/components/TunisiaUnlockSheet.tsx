import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { radius, spacing, type Palette } from '../theme';
import type { UnlockInfo } from '../unlock/useTunisiaUnlock';

/**
 * « Tunisie 🇹🇳 » — l'ecran de deblocage payant, repris du panneau `tnPanel` de la version web :
 * offre (200 DA, acces illimite a vie, paiement unique), deux etapes, un champ, un bouton.
 *
 * Difference voulue avec le site : pas de code de deblocage a recevoir par SMS. Le client donne
 * son numero, qui sert de reference du virement, et l'administrateur valide depuis l'espace
 * admin ; l'acces s'ouvre alors tout seul. Une etape manuelle de moins des deux cotes.
 */
type Props = {
  visible: boolean;
  onClose: () => void;
  info: UnlockInfo | null;
  loading: boolean;
  onRequest: (phone: string) => Promise<unknown>;
  onRefresh: () => void;
  colors: Palette;
};

export function TunisiaUnlockSheet({ visible, onClose, info, loading, onRequest, onRefresh, colors }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = info?.TN ?? 'none';
  const price = info?.priceDa ?? 200;
  const account = info?.payout;

  const submit = async () => {
    const cleaned = phone.trim();
    if (cleaned.replace(/\D/g, '').length < 8) {
      setError(t('unlock.phoneInvalid'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onRequest(cleaned);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? t('unlock.tooMany') : t('errors.network'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}
          >
            <View style={styles.head}>
              <Text style={[styles.title, { color: colors.text }]}>{t('unlock.title')}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={{ fontSize: 16, color: colors.textMuted }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {loading ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
              ) : status === 'paid' ? (
                <Text style={[styles.done, { color: colors.accentDark }]}>✓ {t('unlock.unlocked')}</Text>
              ) : status === 'pending' ? (
                <>
                  <Text style={[styles.pending, { color: colors.text }]}>⏳ {t('unlock.pending')}</Text>
                  <Pressable onPress={onRefresh} style={[styles.secondaryBtn, { borderColor: colors.accent }]}>
                    <Text style={{ color: colors.accent, fontWeight: '800' }}>{t('unlock.check')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[styles.offer, { color: colors.text }]}>
                    {t('unlock.offerBefore')}{' '}
                    <Text style={[styles.price, { backgroundColor: colors.gold + '33', color: colors.alert }]}>
                      {t('unlock.price', { price })}
                    </Text>{' '}
                    {t('unlock.offerAfter')}
                  </Text>

                  <Text style={[styles.step, { color: colors.text }]}>
                    1. {t('unlock.step1', { price })}
                  </Text>
                  {account ? (
                    <View style={[styles.account, { backgroundColor: colors.surfaceAlt, borderColor: colors.goldDeep }]}>
                      <Text style={[styles.accountNumber, { color: colors.text }]} selectable>
                        {account.accountNumber}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
                        {account.type.toUpperCase()} · {account.holderName}
                      </Text>
                    </View>
                  ) : (
                    // Aucun compte configure par l'administrateur : on le dit, plutot que de
                    // laisser le client chercher ou payer.
                    <Text style={[styles.warning, { color: colors.danger }]}>{t('unlock.noAccount')}</Text>
                  )}
                  <Text style={[styles.step, { color: colors.text }]}>2. {t('unlock.step2')}</Text>

                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="0550 00 00 00"
                    placeholderTextColor={colors.textMuted}
                    maxLength={24}
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  />
                  {error ? <Text style={[styles.warning, { color: colors.danger }]}>{error}</Text> : null}

                  <Pressable
                    onPress={() => void submit()}
                    disabled={sending || !account}
                    style={[styles.primaryBtn, { backgroundColor: colors.accent, opacity: sending || !account ? 0.6 : 1 }]}
                  >
                    {sending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>{t('unlock.paid')}</Text>
                    )}
                  </Pressable>
                  <Text style={[styles.note, { color: colors.textMuted }]}>{t('unlock.note')}</Text>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '88%',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  title: { flex: 1, fontSize: 18, fontWeight: '800' },
  close: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  offer: { fontSize: 14.5, lineHeight: 22, marginBottom: spacing.md },
  price: { fontWeight: '800', borderRadius: 5, paddingHorizontal: 4 },
  step: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  account: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: 2 },
  accountNumber: { fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    marginTop: spacing.sm,
  },
  primaryBtn: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    marginTop: spacing.lg,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  note: { fontSize: 12, lineHeight: 17, marginTop: spacing.md, marginBottom: spacing.sm },
  warning: { fontSize: 13, marginTop: spacing.sm },
  done: { fontSize: 16, fontWeight: '800', marginVertical: spacing.xl, textAlign: 'center' },
  pending: { fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
});
