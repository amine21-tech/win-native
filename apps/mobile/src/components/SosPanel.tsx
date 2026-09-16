import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { detectSosCountry, SOS_COUNTRIES } from '../reports/sos';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onTowing: () => void;
  onMechanic: () => void;
  onSharePosition: () => void;
  position: { lat: number; lon: number } | null;
  colors: Palette;
};

/** Panneau d'urgence : repris de `.sos-panel`/`.sos-box` en v83. Affiche uniquement les numeros
 * du pays ou se trouve l'utilisateur (voir detectSosCountry) — pas les trois pays a la fois. */
export function SosPanel({ visible, onClose, onTowing, onMechanic, onSharePosition, position, colors }: Props) {
  const { t } = useTranslation();
  const countryCode = useMemo(
    () => (position ? detectSosCountry(position.lat, position.lon) : 'DZ'),
    [position],
  );
  const country = SOS_COUNTRIES.find((c) => c.code === countryCode) ?? SOS_COUNTRIES[0]!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.box, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <View style={styles.titleRow}>
              <Text style={[typography.heading, { color: colors.text }]}>{t('sos.title')}</Text>
              <View style={[styles.callBadge, { backgroundColor: colors.danger }]}>
                <Text style={styles.callBadgeText}>📞 {t('sos.call')}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
            {t('sos.sub')}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.countryBlock}>
              <Text style={[typography.caption, styles.countryLabel, { color: colors.textMuted }]}>
                {country.flag}
              </Text>
              {country.numbers.map((n) => (
                <Pressable
                  key={n.labelKey}
                  onPress={() => void Linking.openURL(n.href)}
                  style={({ pressed }) => [
                    styles.item,
                    { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={[styles.itemIcon, { backgroundColor: colors.gold + '2a' }]}>
                    <Text style={{ fontSize: 16 }}>{n.emoji}</Text>
                  </View>
                  <Text style={[typography.heading, styles.itemNumber, { color: colors.danger }]}>{n.number}</Text>
                  <Text style={[typography.caption, styles.itemLabel, { color: colors.text }]} numberOfLines={2}>
                    {t(`sos.numbers.${n.labelKey}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={onTowing}
              style={({ pressed }) => [styles.item, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.itemIcon, { backgroundColor: colors.gold + '2a' }]}>
                <Text style={{ fontSize: 16 }}>🛻</Text>
              </View>
              <Text style={[typography.caption, styles.itemLabel, { color: colors.text }]}>{t('sos.towing')}</Text>
            </Pressable>
            <Pressable
              onPress={onMechanic}
              style={({ pressed }) => [styles.item, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.itemIcon, { backgroundColor: colors.gold + '2a' }]}>
                <Text style={{ fontSize: 16 }}>🔧</Text>
              </View>
              <Text style={[typography.caption, styles.itemLabel, { color: colors.text }]}>{t('sos.mechanic')}</Text>
            </Pressable>

            <Pressable
              onPress={onSharePosition}
              style={({ pressed }) => [styles.share, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.shareText}>{t('sos.sharePosition')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
    maxWidth: 340,
    maxHeight: '80%',
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  callBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  callBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' as const },
  countryBlock: { marginTop: spacing.sm },
  countryLabel: { fontSize: 16, marginBottom: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  itemIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemNumber: { minWidth: 46 },
  itemLabel: { flex: 1 },
  share: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  shareText: { color: '#fff', fontWeight: '700' as const, fontSize: 13 },
});
