import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  placeId?: string;
  lat: number;
  lon: number;
  colors: Palette;
};

/** « Signaler une adresse incorrecte » (v81 #17 en v83) : le serveur sait deja recevoir ce
 * signalement (`POST /corrections`, voir apps/api/src/routes/contributions.ts), mais aucun
 * ecran de l'app native ne le declenchait — les contributeurs n'avaient aucun moyen de
 * corriger une fiche fausse. */
export function CorrectionSheet({ visible, onClose, placeId, lat, lon, colors }: Props) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = () => {
    setMessage('');
    setDone(false);
    setFailed(false);
    // Sans cette remise a zero, fermer la fiche pendant l'envoi laissait le bouton desactive
    // pour de bon : le panneau n'est pas demonte, seulement masque, et son etat survit.
    setSubmitting(false);
    onClose();
  };

  const submit = async () => {
    if (message.trim().length < 3) return;
    setFailed(false);
    setSubmitting(true);
    try {
      await api('/corrections', { method: 'POST', body: { placeId, lat, lon, message: message.trim() } });
      setDone(true);
    } catch {
      // On ne remercie PAS l'utilisateur pour un envoi qui n'a pas eu lieu.
      //
      // La version precedente affichait « signalement envoye » quoi qu'il arrive, au nom du
      // confort. Le resultat etait pire que l'inconfort evite : quelqu'un signale une adresse
      // fausse, voit une confirmation, et sa correction est perdue sans que personne ne le
      // sache — ni lui, ni nous. Le texte saisi reste a l'ecran, pret a etre renvoye.
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.box, { backgroundColor: colors.surface }]}>
          {done ? (
            <>
              <Text style={[typography.heading, { color: colors.text, textAlign: 'center' }]}>
                {t('correction.sent')}
              </Text>
              <Pressable onPress={close} style={[styles.submitBtn, { backgroundColor: colors.accent }]}>
                <Text style={styles.submitBtnText}>{t('search.confirm')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[typography.heading, { color: colors.text }]}>{t('correction.title')}</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={t('correction.placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              />
              {failed ? (
                <Text style={[typography.caption, styles.failed, { color: colors.danger }]}>
                  {t('correction.failed')}
                </Text>
              ) : null}
              <Pressable
                onPress={submit}
                disabled={submitting || message.trim().length < 3}
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.accent, opacity: submitting || message.trim().length < 3 ? 0.6 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {failed ? t('correction.retry') : t('correction.submit')}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  box: { width: '100%', maxWidth: 380, borderRadius: radius.lg, padding: spacing.lg },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  failed: { marginTop: spacing.md, textAlign: 'center' },
  submitBtn: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 15 },
});
