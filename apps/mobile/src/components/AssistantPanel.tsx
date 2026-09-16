import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  listening: boolean;
  /** Ce que l'assistant repond — affiche meme quand la voix est coupee. */
  status: string;
  /** Ce que le moteur a entendu, au fil de la phrase. */
  heard: string;
  onClose: () => void;
  colors: Palette;
};

/**
 * Fenetre d'ecoute de l'assistant vocal (`#assistBox` en v83).
 *
 * Elle se pose en BAS de l'ecran, pas au centre : pendant la navigation, le haut porte la
 * consigne de conduite, et rien ne doit la masquer. Elle se referme seule apres avoir agi,
 * pour la meme raison qu'ailleurs dans l'application — au volant, on ne doit jamais avoir a
 * fermer quoi que ce soit pour continuer.
 */
export function AssistantPanel({ visible, listening, status, heard, onClose, colors }: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.goldDeep }]}
        >
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel={t('assistant.close')}>
            <Text style={[styles.closeGlyph, { color: colors.textMuted }]}>✕</Text>
          </Pressable>

          <Text style={[styles.wave, listening ? styles.waveOn : null]}>🎙️</Text>

          <Text style={[typography.body, styles.status, { color: colors.text }]}>
            {status || t('assistant.listening')}
          </Text>

          {heard ? (
            <Text style={[styles.heard, { color: colors.textMuted }]} numberOfLines={2}>
              « {heard} »
            </Text>
          ) : (
            <View style={styles.heardSpacer} />
          )}

          <Text style={[styles.help, { color: colors.textMuted }]}>{t('assistant.help')}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  box: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  close: { position: 'absolute', top: 8, right: 10, padding: 4 },
  closeGlyph: { fontSize: 15, lineHeight: 17 },
  wave: { fontSize: 26, lineHeight: 30, opacity: 0.45 },
  waveOn: { opacity: 1 },
  status: { marginTop: spacing.sm, textAlign: 'center', fontWeight: '700' as const },
  heard: { marginTop: 4, fontSize: 12.5, textAlign: 'center', fontStyle: 'italic' },
  heardSpacer: { height: 17 },
  help: { marginTop: spacing.md, fontSize: 10.5, lineHeight: 15, textAlign: 'center' },
});
