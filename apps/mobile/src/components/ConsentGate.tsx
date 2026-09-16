import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../store/session';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = { colors: Palette };

/** Ecran de consentement, affiche une seule fois au premier lancement — le texte i18n et
 * l'etat (consentAccepted/acceptConsent) existaient deja mais n'etaient rattaches a aucun
 * ecran, si bien que l'usager n'en voyait jamais rien (parite avec le message d'accueil de v83). */
export function ConsentGate({ colors }: Props) {
  const { t } = useTranslation();
  const consentAccepted = useSession((s) => s.consentAccepted);
  const acceptConsent = useSession((s) => s.acceptConsent);

  return (
    <Modal visible={!consentAccepted} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: colors.surface }]}>
          <Text style={[typography.title, { color: colors.text }]}>{t('consent.title')}</Text>
          <Text style={[typography.body, styles.body, { color: colors.textMuted }]}>{t('consent.body')}</Text>
          <Pressable onPress={acceptConsent} style={[styles.btn, { backgroundColor: colors.accent }]}>
            <Text style={styles.btnText}>{t('consent.accept')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  box: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: spacing.lg },
  body: { marginTop: spacing.md, lineHeight: 21 },
  btn: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' as const, fontSize: 15.5 },
});
