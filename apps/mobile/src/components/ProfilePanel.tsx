import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
};

/** Panneau « Mes contributions », repris de `#profilePanel`/renderProfilePanel() en v83. */
export function ProfilePanel({ visible, onClose, colors }: Props) {
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
