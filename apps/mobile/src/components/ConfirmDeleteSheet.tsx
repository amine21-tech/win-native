import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../theme';

/**
 * Confirmation de suppression, en feuille basse — maquette validee du 27 octobre (points 3 et 9).
 *
 * POURQUOI UNE FEUILLE PLUTOT QU'UNE BOITE DE DIALOGUE. `Alert.alert` rend la boite du
 * systeme : trois lignes de texte, deux boutons gris, aucune place pour montrer CE QU'ON
 * SUPPRIME. L'utilisateur devait croire sur parole qu'il s'agissait bien de la bonne adresse.
 * Ici le nom et les coordonnees sont sous ses yeux au moment ou il decide — c'est tout l'objet
 * de la maquette, et c'est ce qui rend la confirmation utile plutot que rituelle.
 *
 * LES COULEURS SONT FIGEES, ET C'EST VOULU. Le fond de la feuille est blanc dans les deux
 * themes ; son texte doit donc l'etre aussi. La regle a deja coute un ecran illisible en mode
 * nuit (menu de signalement, 26 octobre) : la couleur d'un texte suit le fond SUR LEQUEL IL EST
 * POSE, pas le theme de l'application.
 */

const ROUGE = '#C0392B';
const VERT = '#0B5B2C';
const FOND = '#FFFFFF';
const ENCADRE = '#F3F4F6';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';

type Props = {
  visible: boolean;
  /** Ce qu'on s'apprete a supprimer — affiche dans l'encadre gris. */
  nom: string;
  lat?: number | null;
  lon?: number | null;
  /** Titre de la feuille. Par defaut : « Supprimer ce lieu ? ». */
  titre?: string;
  /** Phrase sous le titre. Par defaut : l'avertissement d'irreversibilite. */
  message?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteSheet({
  visible,
  nom,
  lat,
  lon,
  titre,
  message,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const aDesCoords = typeof lat === 'number' && typeof lon === 'number';

  /* Le Modal reste monte et c'est `visible` qui commande : l'arracher de l'arbre alors qu'il
   * est affiche fige Android puis ferme l'application — defaut rencontre le 24 octobre sur
   * l'ajout et la suppression d'un lieu. */
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* Le fond sombre est un FRERE de la feuille, jamais son parent : un Pressable parent
          volerait le toucher a ce qu'il contient. */}
      <Pressable style={styles.voile} onPress={busy ? undefined : onCancel} />

      <View style={styles.bas} pointerEvents="box-none">
        <View style={styles.feuille}>
          <Text style={styles.icone}>🗑️</Text>
          <Text style={styles.titre}>{titre ?? t('place.deleteConfirmTitle')}</Text>
          <Text style={styles.message}>{message ?? t('place.deleteConfirm')}</Text>

          {/* CE QU'ON SUPPRIME, sous les yeux. */}
          <View style={styles.encadre}>
            <Text style={styles.nom} numberOfLines={2}>
              {nom}
            </Text>
            {aDesCoords ? (
              <Text style={styles.coords} selectable>
                📍 {t('place.gpsCoords')} · {lat!.toFixed(6)}, {lon!.toFixed(6)}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.annuler,
                { backgroundColor: pressed ? ENCADRE : 'transparent' },
              ]}
            >
              <Text style={styles.annulerTexte}>{t('addPlace.cancel')}</Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.supprimer, { opacity: pressed || busy ? 0.75 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.supprimerTexte}>🗑️  {t('place.deletePlace')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(21,32,28,0.45)',
  },
  bas: { flex: 1, justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: FOND,
    // 28 points, valeur de la maquette : des angles nettement plus doux que le reste de
    // l'interface, parce que cette feuille interrompt ce qu'on faisait.
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  icone: { fontSize: 44 },
  titre: { color: ROUGE, fontSize: 18, fontWeight: '800' as const, textAlign: 'center' },
  message: { color: TEXTE_DOUX, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  encadre: {
    alignSelf: 'stretch',
    backgroundColor: ENCADRE,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: 4,
  },
  nom: { color: TEXTE, fontSize: 15, fontWeight: '800' as const },
  coords: { color: TEXTE_DOUX, fontSize: 12, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' },
  annuler: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: VERT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  annulerTexte: { color: VERT, fontSize: 15, fontWeight: '800' as const },
  supprimer: {
    flex: 1,
    backgroundColor: ROUGE,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  supprimerTexte: { color: '#fff', fontSize: 15, fontWeight: '800' as const },
});
