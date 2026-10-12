import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMyPlaces } from '../place/useMyPlaces';
import { claimContributor, useContributor } from '../place/useContributor';
import { formatDistance, haversine } from '../shared';
import { api } from '../api/client';
import { radius, spacing, typography, type Palette } from '../theme';

type ContributorMe = {
  placesCount: number;
  reportsCount: number;
  confirmsCount: number;
  score: number;
  rank: number;
  total: number;
};

const BADGES = [
  { emoji: '🥉', min: 1, labelKey: 'badge1' as const },
  { emoji: '🥈', min: 10, labelKey: 'badge10' as const },
  { emoji: '🥇', min: 50, labelKey: 'badge50' as const },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: Palette;
  /** Position courante, pour afficher la distance de chaque lieu enregistre — c'est elle qui
   * permet de reperer d'un coup d'oeil un enregistrement dont le GPS avait derape. */
  position?: { lat: number; lon: number } | null;
  /** Ouvre la fiche d'un lieu enregistre, ou se trouvent « Modifier » et « Supprimer ». */
  onOpenPlace?: (place: { id: string; name: string; lat: number; lon: number }) => void;
};

/** Panneau « Mes contributions », repris de `#profilePanel`/renderProfilePanel() en v83. */
export function ProfilePanel({ visible, onClose, colors, position, onOpenPlace }: Props) {
  const mine = useMyPlaces(visible);
  const { isContributor, refresh: refreshContributor } = useContributor();
  /* L'entree « contributeur » reste fermee par defaut. Un utilisateur ordinaire ne doit pas
   * tomber sur un champ de code dont il ne sait que faire : il la depliera s'il cherche, ce
   * qui est exactement le cas de quelqu'un a qui on vient de remettre le code. */
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<'idle' | 'checking' | 'bad'>('idle');
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['contributors', 'me'],
    queryFn: () => api<ContributorMe>('/contributors/me'),
    enabled: visible,
  });

  const total = (data?.placesCount ?? 0) + (data?.reportsCount ?? 0) + (data?.confirmsCount ?? 0);
  const rankLabel = total >= 50 ? t('profile.gold') : total >= 10 ? t('profile.silver') : total >= 1 ? t('profile.bronze') : t('profile.newcomer');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.box, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
          </Pressable>

          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={{ fontSize: 30 }}>👤</Text>
          </View>
          <Text style={[typography.heading, styles.rankLabel, { color: colors.text }]}>🏅 {rankLabel}</Text>

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
          ) : (
            <>
              <View style={styles.statRow}>
                <Stat value={data?.reportsCount ?? 0} label={t('profile.reports')} colors={colors} />
                <Stat value={data?.confirmsCount ?? 0} label={t('profile.confirms')} colors={colors} />
                <Stat value={data?.placesCount ?? 0} label={t('profile.places')} colors={colors} />
              </View>

              <View style={styles.badgeRow}>
                {BADGES.map((b) => {
                  const unlocked = total >= b.min;
                  return (
                    <View
                      key={b.labelKey}
                      style={[styles.badge, { backgroundColor: unlocked ? '#F3D98A' : colors.surfaceAlt, opacity: unlocked ? 1 : 0.4 }]}
                    >
                      <Text style={{ fontSize: 18 }}>{b.emoji}</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={[typography.caption, styles.note, { color: colors.textMuted }]}>
                {data && data.total > 0
                  ? t('profile.rankPosition', { position: data.rank, total: data.total })
                  : t('profile.rankEmpty')}
              </Text>
            </>
          )}

          {/* « Mes enregistrements ».
              Retrouver un lieu que l'on a soi-meme ajoute obligeait a retaper son nom dans la
              recherche — ce que personne ne fait. La liste donne aussi la distance, qui est le
              signe le plus simple d'un enregistrement a corriger : un lieu du quartier affiche
              a douze kilometres a ete pris avec un GPS mal stabilise. */}
          <View style={styles.myPlaces}>
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '800' }]}>
              📍 {t('place.myPlaces')}
            </Text>
            {mine.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.sm }} />
            ) : (mine.data?.items.length ?? 0) === 0 ? (
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 6 }]}>
                {t('place.myPlacesEmpty')}
              </Text>
            ) : (
              <ScrollView style={styles.myList} nestedScrollEnabled>
                {mine.data!.items.map((p) => {
                  const away = position ? haversine(position.lat, position.lon, p.lat, p.lon) : null;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        onOpenPlace?.({ id: p.id, name: p.name, lat: p.lat, lon: p.lon });
                        onClose();
                      }}
                      style={[styles.myRow, { borderColor: colors.border }]}
                    >
                      <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {away != null ? (
                        <Text style={[typography.caption, { color: colors.textMuted }]}>{formatDistance(away)}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Espace contributeur : c'est ici qu'on ouvre le droit d'enregistrer des lieux.
              Replie tant qu'on ne le cherche pas, et remplace par une simple mention une fois
              le droit obtenu — il n'y a plus rien a y faire. */}
          <View style={styles.contributor}>
            {isContributor ? (
              <Text style={[typography.caption, { color: colors.accentDark, fontWeight: '700' }]}>
                ✅ {t('profile.becomeAlready')}
              </Text>
            ) : codeOpen ? (
              <>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('profile.becomeHint')}</Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => {
                    setCode(v);
                    setCodeState('idle');
                  }}
                  placeholder={t('profile.becomeCode')}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  secureTextEntry
                  style={[styles.codeInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                />
                {codeState === 'bad' ? (
                  <Text style={[typography.caption, { color: colors.danger }]}>{t('profile.becomeBad')}</Text>
                ) : null}
                <Pressable
                  disabled={codeState === 'checking' || code.trim().length < 4}
                  onPress={() => {
                    setCodeState('checking');
                    void claimContributor(code.trim())
                      .then(() => {
                        refreshContributor();
                        setCodeState('idle');
                        setCode('');
                      })
                      .catch(() => setCodeState('bad'));
                  }}
                  style={[styles.codeBtn, { backgroundColor: colors.accent, opacity: code.trim().length < 4 ? 0.5 : 1 }]}
                >
                  <Text style={styles.codeBtnText}>
                    {codeState === 'checking' ? '…' : t('search.confirm')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => setCodeOpen(true)}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('profile.becomeTitle')}</Text>
              </Pressable>
            )}
          </View>

          {/* Discret, jamais un code partage : l'authentification reelle (voir apps/api/src/
              routes/admin.ts) protege deja l'espace qui s'ouvre ensuite. */}
          <Pressable
            onPress={() => {
              onClose();
              router.push('/admin');
            }}
            style={styles.adminLink}
          >
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.title')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ value, label, colors }: { value: number; label: string; colors: Palette }) {
  return (
    <View style={styles.stat}>
      <Text style={[typography.title, { color: colors.accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  myPlaces: { width: '100%', marginTop: spacing.md },
  contributor: { width: '100%', marginTop: spacing.md, gap: 6 },
  codeInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  codeBtn: { borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  codeBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 14 },
  // Hauteur bornee : la liste defile a l'interieur du panneau au lieu de le faire grandir
  // sans fin quand un contributeur a enregistre trente lieux.
  myList: { maxHeight: 170, marginTop: 6 },
  myRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  box: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: spacing.md, right: spacing.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  rankLabel: { marginTop: spacing.sm },
  statRow: { flexDirection: 'row', width: '100%', marginTop: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.3, marginTop: 4, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  badge: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: spacing.md, textAlign: 'center' },
  adminLink: { marginTop: spacing.lg, paddingVertical: spacing.xs },
});
