import type * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Language } from '../shared';
import {
  preferredVoiceId,
  setPreferredVoiceId,
  speakGuidance,
  voiceGender,
  voicesForLanguage,
} from '../speech/voice';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  lang: Language;
  onClose: () => void;
  colors: Palette;
};

/**
 * Choix de la voix du guidage.
 *
 * Les voix ne sont pas les memes d'un telephone a l'autre : elles dependent du moteur de
 * synthese installe. On affiche donc ce que l'appareil propose REELLEMENT pour la langue
 * active, dans l'ordre du plus naturel au moins bon, plutot qu'une liste fixe qui promettrait
 * des voix absentes.
 */
export function VoicePanel({ visible, lang, onClose, colors }: Props) {
  const { t } = useTranslation();
  const [voices, setVoices] = useState<Speech.Voice[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(preferredVoiceId());

  useEffect(() => {
    if (!visible) return;
    setChosen(preferredVoiceId());
    let cancelled = false;
    void voicesForLanguage(lang).then((list) => {
      if (!cancelled) setVoices(list);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, lang]);

  const pick = (identifier: string | null) => {
    setPreferredVoiceId(identifier);
    setChosen(identifier);
    // On la fait parler tout de suite : c'est le seul moyen de juger une voix.
    speakGuidance(t('voice.sample'), lang);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.box, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[typography.heading, { color: colors.text }]}>{t('voice.title')}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{t('voice.hint')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {voices === null ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
          ) : (
            <ScrollView style={styles.list}>
              <Row
                label={t('voice.automatic')}
                sub={t('voice.automaticSub')}
                selected={chosen === null}
                onPress={() => pick(null)}
                colors={colors}
              />
              {voices.map((v) => {
                // Le genre n'est affiche que lorsqu'il est reellement lisible : inventer
                // « masculine » sur une voix indeterminee tromperait le choix.
                const gender = voiceGender(v);
                return (
                <Row
                  key={v.identifier}
                  label={v.name || v.identifier}
                  sub={gender ? `${v.language} · ${t(`voice.${gender}`)}` : v.language}
                  selected={chosen === v.identifier}
                  onPress={() => pick(v.identifier)}
                  colors={colors}
                />
                );
              })}
              {voices.length === 0 ? (
                <Text style={[typography.caption, styles.empty, { color: colors.textMuted }]}>
                  {t('voice.none')}
                </Text>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  label,
  sub,
  selected,
  onPress,
  colors,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  colors: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.row, selected ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      <View style={[styles.dot, { borderColor: selected ? colors.accent : colors.border }]}>
        {selected ? <View style={[styles.dotFill, { backgroundColor: colors.accent }]} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  box: { width: '100%', maxWidth: 400, maxHeight: '75%', borderRadius: radius.lg, padding: spacing.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  list: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotFill: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, gap: 1 },
  label: { fontSize: 14.5, fontWeight: '600' as const },
  sub: { fontSize: 12 },
  empty: { textAlign: 'center', marginVertical: spacing.lg },
});
