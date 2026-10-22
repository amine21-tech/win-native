import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
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

      <PlaceCorrections token={token} colors={colors} />

      <PhotoReports token={token} colors={colors} />

      <ContributorCodes token={token} colors={colors} />

      <UnlockRequests token={token} colors={colors} />

      <Pressable onPress={onLogout} style={styles.logout}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.logout')}</Text>
      </Pressable>
    </View>
  );
}

type UnlockRequest = { id: string; phone: string | null; amountDa: number; createdAt: string };

type ContributorCode = {
  id: string;
  code: string;
  label: string;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdByName: string | null;
};

/**
 * CODES DE CONTRIBUTEUR — un par personne.
 *
 * Ce qu'un code donne : le titre, et rien d'autre. Le badge, le nom au classement, le compteur
 * de lieux. Corriger et retirer une adresse sont ouverts a tous depuis le 19 octobre, et le
 * client a confirme le 22 que le code devait rester une reconnaissance. L'ecran le dit en
 * toutes lettres : un administrateur qui croirait distribuer des droits se tromperait.
 *
 * Chaque code ne sert qu'une fois et se lie au premier telephone qui le presente. C'est ce qui
 * permet de savoir a qui on l'a donne et de n'en retirer qu'un seul.
 */
function ContributorCodes({ token, colors }: { token: string; colors: Palette }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'contributor-codes'],
    queryFn: () => api<{ items: ContributorCode[] }>('/admin/contributor-codes', { adminToken: token }),
  });
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = async () => {
    const pour = label.trim();
    if (pour.length < 2) return;
    setBusy(true);
    setErreur(null);
    try {
      await api('/admin/contributor-codes', { method: 'POST', body: { label: pour }, adminToken: token });
      setLabel('');
      await query.refetch();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : t('errors.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const retirer = (c: ContributorCode) => {
    /* La confirmation dit ce qu'elle fait VRAIMENT : le code cesse d'etre utilisable ET la
     * personne qui s'en etait servie perd son badge. Retirer l'un sans l'autre ne voudrait
     * rien dire, et l'administrateur doit le savoir avant d'appuyer. */
    Alert.alert(t('admin.codeRevokeTitle'), t('admin.codeRevokeBody', { label: c.label }), [
      { text: t('addPlace.cancel'), style: 'cancel' },
      {
        text: t('admin.codeRevoke'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void api(`/admin/contributor-codes/${c.id}`, { method: 'DELETE', adminToken: token })
            .then(() => query.refetch())
            .catch(() => setErreur(t('errors.unknown')))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const items = query.data?.items ?? [];

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[typography.heading, { color: colors.text }]}>{t('admin.codesTitle')}</Text>
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{t('admin.codesHint')}</Text>

      <View style={styles.codeCreate}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t('admin.codeFor')}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.codeInput, { borderColor: colors.border, color: colors.text }]}
        />
        <Pressable
          disabled={busy || label.trim().length < 2}
          onPress={() => void creer()}
          style={[
            styles.codeCreateBtn,
            { backgroundColor: colors.accent, opacity: busy || label.trim().length < 2 ? 0.5 : 1 },
          ]}
        >
          <Text style={styles.btnText}>{t('admin.codeCreate')}</Text>
        </Pressable>
      </View>

      {erreur ? (
        <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.sm }]}>{erreur}</Text>
      ) : null}

      {query.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          {t('admin.codesEmpty')}
        </Text>
      ) : null}

      {items.map((c) => {
        const retire = c.revokedAt !== null;
        const utilise = c.usedAt !== null;
        return (
          <View key={c.id} style={[styles.codeRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Le code en chiffres fixes : il se dicte au telephone et se recopie a la main. */}
              <Text
                style={[styles.codeValue, { color: retire ? colors.textMuted : colors.text }]}
                selectable
              >
                {c.code}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                {c.label}
              </Text>
              <Text style={[styles.codeEtat, { color: retire ? colors.danger : utilise ? colors.accent : colors.textMuted }]}>
                {retire ? t('admin.codeRevoked') : utilise ? t('admin.codeUsed') : t('admin.codeFree')}
              </Text>
            </View>

            {!retire ? (
              <Pressable
                disabled={busy}
                onPress={() => retirer(c)}
                style={[styles.smallBtn, { borderColor: colors.danger }]}
              >
                <Text style={{ color: colors.danger, fontWeight: '800' }}>{t('admin.codeRevoke')}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

type Correction = {
  id: string;
  message: string;
  placeId: string | null;
  placeName: string | null;
  lat: number | null;
  lon: number | null;
  createdAt: string;
};

/**
 * REMARQUES SUR LES ADRESSES — ce qu'un utilisateur signale sur une fiche : nom faux, lieu
 * ferme, mauvaise position.
 *
 * CE QUE << TRAITEE >> VEUT DIRE, ET SURTOUT CE QU'ELLE NE FAIT PAS. Le serveur ne change
 * RIEN a la fiche : il classe seulement la remarque pour qu'elle quitte la liste
 * (apps/api/src/routes/admin.ts, POST /admin/corrections/:id/status). La correction elle-meme
 * se fait a la main sur la fiche du lieu, depuis la carte. Un bouton nomme << Accepter >>
 * laisserait croire le contraire, et la remarque disparaitrait sans que rien ne soit corrige —
 * c'est pourquoi il s'appelle << Traitee >> et que la phrase d'aide le dit.
 */
function PlaceCorrections({ token, colors }: { token: string; colors: Palette }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'corrections'],
    queryFn: () => api<{ items: Correction[] }>('/admin/corrections', { adminToken: token }),
    refetchInterval: 60_000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const classer = async (id: string, status: 'accepted' | 'rejected') => {
    setBusy(id);
    try {
      await api(`/admin/corrections/${id}/status`, {
        method: 'POST',
        body: { status },
        adminToken: token,
      });
      await query.refetch();
    } finally {
      setBusy(null);
    }
  };

  const items = query.data?.items ?? [];

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[typography.heading, { color: colors.text }]}>{t('admin.correctionsTitle')}</Text>
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>
        {t('admin.correctionsHint')}
      </Text>

      {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.correctionsEmpty')}</Text>
      ) : null}

      {items.map((c) => (
        <View key={c.id} style={[styles.modRow, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
            {c.placeName ?? t('admin.correctionNoPlace')}
          </Text>
          {/* Le texte en entier, jamais tronque : c'est la seule chose que la personne a ecrite. */}
          <Text style={{ color: colors.text, marginTop: 4 }} selectable>
            {c.message}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            {new Date(c.createdAt).toLocaleString()}
            {c.lat !== null && c.lon !== null ? ` · ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}` : ''}
          </Text>

          <View style={styles.modActions}>
            {busy === c.id ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Pressable
                  onPress={() => void classer(c.id, 'rejected')}
                  style={[styles.smallBtn, { borderColor: colors.danger }]}
                >
                  <Text style={{ color: colors.danger, fontWeight: '800' }}>{t('admin.correctionReject')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void classer(c.id, 'accepted')}
                  style={[styles.smallBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                >
                  <Text style={{ color: colors.accentText, fontWeight: '800' }}>{t('admin.correctionDone')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

type PhotoReport = {
  photoId: string;
  placeId: string | null;
  placeName: string | null;
  photoUrl: string;
  reportCount: number;
  firstAt: string;
  lastAt: string;
  reasons: string[];
  messages: string[];
};

/** Les motifs sont une liste fermee cote serveur : on traduit, et on garde le brut en secours. */
const MOTIF_CLE: Record<string, string> = {
  wrong_place: 'admin.reasonWrongPlace',
  wrong_facade: 'admin.reasonWrongFacade',
  poor_quality: 'admin.reasonPoorQuality',
  inappropriate: 'admin.reasonInappropriate',
  other: 'admin.reasonOther',
};

/**
 * PHOTOS SIGNALEES.
 *
 * LA PHOTO EST AFFICHEE, et ce n'est pas un ornement : personne ne peut trancher sur une photo
 * qu'il ne voit pas. Aller la chercher ailleurs rendrait le traitement inutilisable, donc le
 * serveur renvoie son adresse avec chaque ligne.
 *
 * LES BOUTONS DISENT CE QU'ILS FONT. Cote serveur les deux decisions s'appellent `accepted` et
 * `rejected`, ce qui porte a confusion : << accepter >> signifie que le signalement est fonde,
 * donc que la photo est SUPPRIMEE. Ici on ecrit donc << Retirer la photo >> et << Garder >>.
 *
 * Le retrait est definitif — la ligne est effacee de place_photos — d'ou la confirmation.
 * Garder la photo clot les signalements pour qu'ils ne reviennent pas encombrer la liste.
 */
function PhotoReports({ token, colors }: { token: string; colors: Palette }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'photo-reports'],
    queryFn: () => api<{ items: PhotoReport[] }>('/admin/photo-reports', { adminToken: token }),
    refetchInterval: 60_000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const decider = async (photoId: string, status: 'accepted' | 'rejected') => {
    setBusy(photoId);
    try {
      await api(`/admin/photo-reports/${photoId}/status`, {
        method: 'POST',
        body: { status },
        adminToken: token,
      });
      await query.refetch();
    } finally {
      setBusy(null);
    }
  };

  const retirer = (r: PhotoReport) => {
    Alert.alert(t('admin.photoRemoveTitle'), t('admin.photoRemoveBody'), [
      { text: t('addPlace.cancel'), style: 'cancel' },
      { text: t('admin.photoRemove'), style: 'destructive', onPress: () => void decider(r.photoId, 'accepted') },
    ]);
  };

  const items = query.data?.items ?? [];

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[typography.heading, { color: colors.text }]}>{t('admin.photoReportsTitle')}</Text>
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>
        {t('admin.photoReportsHint')}
      </Text>

      {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.photoReportsEmpty')}</Text>
      ) : null}

      {items.map((r) => (
        <View key={r.photoId} style={[styles.modRow, { borderColor: colors.border }]}>
          <Image source={{ uri: r.photoUrl }} style={styles.modPhoto} resizeMode="cover" />

          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: spacing.sm }}>
            {r.placeName ?? t('admin.correctionNoPlace')}
          </Text>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
            {t('admin.photoReportCount', { count: r.reportCount })}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {(r.reasons ?? []).map((m) => t(MOTIF_CLE[m] ?? 'admin.reasonOther')).join(' · ')}
          </Text>
          {(r.messages ?? []).map((m, i) => (
            <Text key={i} style={{ color: colors.text, fontSize: 13, marginTop: 2 }} selectable>
              « {m} »
            </Text>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {new Date(r.lastAt).toLocaleString()}
          </Text>

          <View style={styles.modActions}>
            {busy === r.photoId ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Pressable
                  onPress={() => retirer(r)}
                  style={[styles.smallBtn, { borderColor: colors.danger }]}
                >
                  <Text style={{ color: colors.danger, fontWeight: '800' }}>{t('admin.photoRemove')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void decider(r.photoId, 'rejected')}
                  style={[styles.smallBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                >
                  <Text style={{ color: colors.accentText, fontWeight: '800' }}>{t('admin.photoKeep')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Deblocages de la Tunisie en attente. L'administrateur compare chaque numero aux virements
 * BaridiMob recus sur le compte ci-dessus, puis valide — l'acces s'ouvre sur le telephone du
 * client dans les trente secondes — ou refuse si aucun paiement n'est arrive.
 */
function UnlockRequests({ token, colors }: { token: string; colors: Palette }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'unlocks'],
    queryFn: () => api<{ items: UnlockRequest[] }>('/admin/unlocks', { adminToken: token }),
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await api(`/admin/unlocks/${id}/${action}`, { method: 'POST', adminToken: token });
      await query.refetch();
    } finally {
      setBusy(null);
    }
  };

  const items = query.data?.items ?? [];

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[typography.heading, { color: colors.text }]}>{t('admin.unlocksTitle')}</Text>
      <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{t('admin.unlocksHint')}</Text>

      {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {!query.isLoading && items.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.unlocksEmpty')}</Text>
      ) : null}

      {items.map((r) => (
        <View key={r.id} style={[styles.unlockRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }} selectable>
              {r.phone ?? '—'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {r.amountDa} DA · {new Date(r.createdAt).toLocaleString()}
            </Text>
          </View>
          {busy === r.id ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Pressable
                onPress={() => void act(r.id, 'reject')}
                style={[styles.smallBtn, { borderColor: colors.danger }]}
              >
                <Text style={{ color: colors.danger, fontWeight: '800' }}>{t('admin.reject')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void act(r.id, 'approve')}
                style={[styles.smallBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              >
                <Text style={{ color: colors.accentText, fontWeight: '800' }}>{t('admin.approve')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  smallBtn: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  modRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  // Les deux boutons a droite, sur leur propre ligne : le texte signale peut etre long, et
  // les serrer a cote de lui donnait des boutons de deux caracteres de large.
  modActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  // Assez grande pour trancher : une vignette de la taille d'une icone ne sert a rien ici.
  modPhoto: { width: '100%', height: 180, borderRadius: radius.sm, backgroundColor: '#0002' },
  codeCreate: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  codeInput: { flex: 1, marginTop: 0 },
  codeCreateBtn: { borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  // Chiffres a chasse fixe et lettres espacees : ce code se lit a voix haute et se recopie.
  codeValue: { fontSize: 17, fontWeight: '800' as const, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  codeEtat: { fontSize: 11, fontWeight: '700' as const, marginTop: 2 },
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
