import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import { PHOTO_REPORT_REASONS, type PhotoReportReason } from '../shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type Palette } from '../theme';

/**
 * « Signaler cette photo » — le dernier point de la liste du client.
 *
 * Une photo de lieu est publiee par un contributeur et vue par tous. Rien ne permettait de dire
 * qu'elle montrait la mauvaise facade, le mauvais endroit, ou qu'elle etait inexploitable : il
 * fallait nous ecrire, c'est-a-dire ne rien faire.
 *
 * Les motifs sont une liste fermee, et non un champ libre : on signale une photo en marchant ou
 * au volant, personne ne redige un paragraphe. Un appui sur un motif envoie le signalement et
 * referme — pas de bouton « Confirmer » a chercher ensuite.
 *
 * La photo n'est pas retiree pour autant : c'est un moderateur qui tranche depuis le tableau de
 * bord. Une photo exacte qui deplait se ferait sinon effacer par quelques clics mal
 * intentionnes.
 */
const EMOJI: Record<PhotoReportReason, string> = {
  wrong_place: '📍',
  wrong_facade: '🏠',
  poor_quality: '🌫️',
  inappropriate: '🚫',
  other: '💬',
};

export function ReportPhotoSheet({
  visible,
  photoId,
  onClose,
  onSent,
  colors,
}: {
  visible: boolean;
  photoId: string | null;
  onClose: () => void;
  onSent: () => void;
  colors: Palette;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [sending, setSending] = useState<PhotoReportReason | null>(null);

  const send = (reason: PhotoReportReason) => {
    if (!photoId || sending) return;
    setSending(reason);
    // L'envoi ne peut pas echouer aux yeux de l'utilisateur : son signalement est parti ou il
    // repartira, mais lui a fait sa part. Le silence vaut mieux qu'un message d'erreur sur un
    // geste qui ne lui rapporte rien.
    void api(`/photos/${photoId}/report`, { method: 'POST', body: { reason } })
      .catch(() => {})
      .finally(() => {
        setSending(null);
        onSent();
      });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.box, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.head}>
            <Text style={[typography.heading, { color: colors.text }]}>{t('place.reportPhotoTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {PHOTO_REPORT_REASONS.map((reason) => (
            <Pressable
              key={reason}
              disabled={sending !== null}
              onPress={() => send(reason)}
              style={({ pressed }) => [
                styles.row,
                { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
              ]}
            >
              <Text style={styles.emoji}>{EMOJI[reason]}</Text>
              <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                {t(`place.reason_${reason}`)}
              </Text>
              {sending === reason ? <Text style={{ color: colors.textMuted }}>…</Text> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  box: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  emoji: { fontSize: 18 },
});
