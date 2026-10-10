import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { reverseGeocode } from '../search/geocode';
import type { Language } from '../shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type Palette } from '../theme';

/**
 * « Souhaitez-vous devier vers ce point ? » — l'appui long PENDANT le guidage.
 *
 * Hors navigation, un appui long sur la carte ouvre le formulaire d'enregistrement d'un lieu.
 * En pleine conduite, ce formulaire n'a aucun sens : on ne remplit pas un nom et une photo au
 * volant, et il masquait l'instruction en cours. Le meme geste sert donc a autre chose — se
 * derouter vers ce qu'on vient de voir : une station-service, un commerce, une avenue.
 *
 * Le point est NOMME avant qu'on demande quoi que ce soit. « Devier vers 36,7538 / 3,0588 ? »
 * ne veut rien dire au volant ; « vers Rue Larbi Tebessi » se decide d'un coup d'oeil. Tant que
 * le nom n'est pas revenu, la fiche le dit et les deux boutons restent utilisables : le reseau
 * ne doit jamais empecher de repondre.
 *
 * Deux boutons seulement, larges, et aucune croix de fermeture a viser : on repond « oui » ou
 * « non » en roulant, pas en visant une cible de douze points.
 */
export function DetourSheet({
  visible,
  point,
  lang,
  onCancel,
  onConfirm,
  colors,
}: {
  visible: boolean;
  point: { lat: number; lon: number } | null;
  lang: Language;
  onCancel: () => void;
  /** Le nom sert a l'annonce et au repere sur la carte ; il peut etre absent. */
  onConfirm: (nom: string | null) => void;
  colors: Palette;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [nom, setNom] = useState<string | null>(null);
  const [cherche, setCherche] = useState(false);

  useEffect(() => {
    if (!visible || !point) return;
    setNom(null);
    setCherche(true);
    let annule = false;
    void reverseGeocode(point.lat, point.lon, lang).then((r) => {
      if (annule) return;
      setNom(r?.name ?? null);
      setCherche(false);
    });
    return () => {
      annule = true;
    };
  }, [visible, point, lang]);

  if (!point) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.box, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={[typography.heading, styles.nom, { color: colors.accentDark }]} numberOfLines={2}>
            {nom ?? (cherche ? t('nav.detourLocating') : `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`)}
          </Text>
          {cherche ? <ActivityIndicator color={colors.accent} style={styles.chargement} /> : null}

          <Text style={[typography.body, styles.question, { color: colors.text }]}>
            {t('nav.detourTitle')}
          </Text>

          <Pressable
            onPress={() => onConfirm(nom)}
            style={({ pressed }) => [styles.oui, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.ouiTexte}>✅ {t('nav.detourYes')}</Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.non,
              { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
            ]}
          >
            <Text style={[styles.nonTexte, { color: colors.textMuted }]}>❌ {t('nav.detourNo')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  box: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  nom: { textAlign: 'center' },
  chargement: { marginTop: spacing.sm },
  question: { textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },
  // Boutons hauts : on les vise au volant, pas assis au bureau.
  oui: { borderRadius: radius.lg, paddingVertical: spacing.md + 2, alignItems: 'center' },
  ouiTexte: { color: '#fff', fontWeight: '800' as const, fontSize: 16 },
  non: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  nonTexte: { fontWeight: '700' as const, fontSize: 15 },
});
