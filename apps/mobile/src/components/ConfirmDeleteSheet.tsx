import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../theme';

/**
 * Confirmation de suppression : boite COMPACTE ET CENTREE — point 14 du client, 28 octobre.
 *
 * CE QUI CHANGE, ET POURQUOI. La version du 27 octobre etait une feuille basse pleine largeur
 * qui montrait le nom, un avertissement d'irreversibilite et les coordonnees GPS. Le client la
 * trouve trop large et mal placee, et demande une boite << lisible en une seconde >> : 85 % de
 * la largeur au maximum, centree sur l'ecran, angles de 16 points, et pour tout contenu une
 * poubelle rouge, << Supprimer ? >>, le nom sur UNE ligne, deux boutons.
 *
 * Il a raison sur le fond : une confirmation n'est pas un formulaire. Chaque ligne en plus est
 * une ligne qu'on ne lit pas, et un paragraphe sur l'irreversibilite n'a jamais empeche personne
 * de supprimer — il retarde seulement la lecture du NOM, qui est la seule chose a verifier.
 *
 * CONSEQUENCE A SIGNALER AU CLIENT : les coordonnees GPS de la maquette du 27 octobre
 * disparaissent. C'est la contrepartie directe de << uniquement le contenu necessaire >>.
 *
 * LES COULEURS SONT FIGEES, ET C'EST VOULU. Le fond de la boite est blanc dans les deux themes ;
 * son texte doit donc l'etre aussi. La regle a deja coute un ecran illisible en mode nuit (menu
 * de signalement, 26 octobre) : la couleur d'un texte suit le fond SUR LEQUEL IL EST POSE, pas
 * le theme de l'application.
 */

const ROUGE = '#C0392B';
const VERT = '#0B5B2C';
const FOND = '#FFFFFF';
const PRESSE = '#F3F4F6';
const TEXTE = '#15201C';

/** Un nom plus long est tronque par le moteur de rendu ; la coupe nette evite l'ellipse seule. */
const NOM_MAX = 40;

type Props = {
  visible: boolean;
  /** Ce qu'on s'apprete a supprimer — la seule ligne de contenu. */
  nom: string;
  /** Titre de la boite. Par defaut : « Supprimer ? ». */
  titre?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteSheet({ visible, nom, titre, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();

  /* Le Modal reste monte et c'est `visible` qui commande : l'arracher de l'arbre alors qu'il
   * est affiche fige Android puis ferme l'application — defaut rencontre le 24 octobre sur
   * l'ajout et la suppression d'un lieu. */
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Le fond sombre est un FRERE de la boite, jamais son parent : un Pressable parent
          volerait le toucher a ce qu'il contient. */}
      <Pressable style={styles.voile} onPress={busy ? undefined : onCancel} />

      <View style={styles.centre} pointerEvents="box-none">
        <View style={styles.boite}>
          {/* La poubelle et le titre sur la MEME ligne : c'est ce qui tient la boite basse. */}
          <View style={styles.entete}>
            <Text style={styles.icone}>🗑️</Text>
            <Text style={styles.titre} numberOfLines={1}>
              {titre ?? t('place.deleteQuestion')}
            </Text>
          </View>

          {/* CE QU'ON SUPPRIME, sur une seule ligne. */}
          <Text style={styles.nom} numberOfLines={1}>
            {nom.length > NOM_MAX ? `${nom.slice(0, NOM_MAX)}…` : nom}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.annuler,
                { backgroundColor: pressed ? PRESSE : 'transparent' },
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
                <Text style={styles.supprimerTexte}>{t('place.deletePlace')}</Text>
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
  // Centree dans les deux sens, comme le demande le point 14.
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  boite: {
    // 85 % AU PLUS, et pas moins de 280 points : en dessous, deux boutons cote a cote ne
    // tiennent plus et le texte se casse en deux lignes. Le plafond de 420 evite une boite
    // demesuree sur une tablette.
    width: '85%',
    minWidth: 280,
    maxWidth: 420,
    backgroundColor: FOND,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    // Ombre douce : elle detache la boite du fond sans la faire flotter.
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icone: { fontSize: 36, lineHeight: 42 },
  titre: { flex: 1, color: ROUGE, fontSize: 16, fontWeight: '700' as const },
  nom: { color: TEXTE, fontSize: 15, fontWeight: '600' as const },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  annuler: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: VERT,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  annulerTexte: {
    color: VERT,
    fontSize: 14,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
  },
  supprimer: {
    flex: 1,
    backgroundColor: ROUGE,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supprimerTexte: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
  },
});
