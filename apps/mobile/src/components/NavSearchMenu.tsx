import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../theme';

/**
 * Le petit menu ouvert par la loupe PENDANT le guidage.
 *
 * Transcription de `showNavSearchMenu` (win-v83) : une carte posee au milieu de l'ecran, deux
 * lignes seulement, separees d'un filet. La premiere, en vert, mene au choix d'une nouvelle
 * destination ; la seconde, en gris, referme et rend la main a l'itineraire en cours. Un appui
 * a cote referme aussi, comme le `document.addEventListener('click', …)` du site.
 *
 * Pourquoi ce detour au lieu d'ouvrir la recherche directement : au volant, un appui malheureux
 * sur la loupe faisait disparaitre l'instruction en cours derriere un panneau plein ecran. La
 * question posee ici — nouvel itineraire, ou bien on continue ? — coute un appui et evite cela.
 *
 * Une difference assumee avec le site : la-bas, « Nouvel itineraire » ARRETE d'abord le guidage.
 * Ici, le choix d'une destination dans le panneau des rubriques declenche un detour sans couper
 * le guidage (demande d'une version precedente) ; on garde ce comportement, plus sur en route,
 * et le menu reste identique a l'ecran.
 */
export function NavSearchMenu({
  visible,
  onNewRoute,
  onContinue,
  colors,
}: {
  visible: boolean;
  onNewRoute: () => void;
  onContinue: () => void;
  colors: Palette;
}) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <Pressable style={styles.backdrop} onPress={onContinue}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.card, { backgroundColor: colors.surface }]}>
          <Pressable
            accessibilityRole="button"
            onPress={onNewRoute}
            style={({ pressed }) => [
              styles.row,
              { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              pressed ? { backgroundColor: colors.surfaceAlt } : null,
            ]}
          >
            <Text style={[styles.label, { color: colors.accent }]}>🔍 {t('nav.newRoute')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onContinue}
            style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.surfaceAlt } : null]}
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>▶ {t('nav.continueNav')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  card: {
    minWidth: 260,
    borderRadius: 18, // le rayon de la carte du site
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  row: { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '700' as const },
});
