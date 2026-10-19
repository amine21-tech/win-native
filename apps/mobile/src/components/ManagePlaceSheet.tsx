import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Nom et adresse rappeles en tete : on doit savoir SUR QUOI on agit. */
  nom: string;
  adresse: string;
  /** Vrai pour une fiche enregistree par un utilisateur WIN — l'etiquette du haut. */
  contribuee: boolean;
  /** La fiche existe-t-elle chez nous ? Vrai pour toute fiche WIN — corriger est ouvert a tous. */
  peutGerer: boolean;
  /** Faux pour une fiche partenaire qui n'est pas la sienne : elle a ete payee. */
  peutSupprimer: boolean;
  /** Cette fiche a-t-elle ete enregistree depuis CET appareil ? Faux quand un contributeur
   * agit sur le travail de quelqu'un d'autre — ce qui doit se savoir avant d'appuyer. */
  estLaMienne: boolean;
  onReport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Appele quand quelqu'un sans le droit appuie sur Modifier ou Supprimer. */
  onSansDroit: () => void;
  suppressionEnCours: boolean;
  colors: Palette;
};

/**
 * « GERER CETTE FICHE » — maquette du client, point K.
 *
 * Les trois gestes vivaient au bas de la fiche, empiles sous les coordonnees et les boutons de
 * contact. Deux choses s'y perdaient. D'abord ils allongeaient une fiche que le client voulait
 * justement tenir sur un ecran. Ensuite, et c'est le plus genant, ils etaient ENTOURES :
 * supprimer un lieu se retrouvait a quelques points d'« appeler » et de « c'est parti », et un
 * pouce qui glisse ne pardonne pas.
 *
 * Les sortir dans leur propre panneau regle les deux. La fiche redevient courte, et le geste
 * grave demande desormais deux appuis au lieu d'un — avec, entre les deux, le nom du lieu
 * rappele en toutes lettres. On sait sur quoi on agit avant d'agir.
 *
 * LES TROIS GESTES SONT OUVERTS A TOUT LE MONDE — decision du client du 19 octobre 2026.
 * Signaler, corriger, retirer : n'importe quel utilisateur peut faire les trois sur n'importe
 * quelle adresse de WIN. C'est le fonctionnement des cartes communautaires, et c'est ce qui
 * permet a une adresse fausse d'etre reparee par la premiere personne qui passe devant.
 *
 * Une seule ligne peut encore porter un cadenas : la suppression d'une fiche PARTENAIRE qui
 * n'est pas la sienne. Celle-la a ete payee. L'appui explique pourquoi et propose de signaler.
 *
 * Quand on agit sur la fiche de QUELQU'UN D'AUTRE, la ligne le dit avant qu'on appuie. Ce
 * n'est pas un avertissement de confort : c'est la contrepartie d'un droit ouvert a tous.
 */
export function ManagePlaceSheet({
  visible,
  onClose,
  nom,
  adresse,
  contribuee,
  peutGerer,
  peutSupprimer,
  estLaMienne,
  onReport,
  onEdit,
  onDelete,
  onSansDroit,
  suppressionEnCours,
  colors,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Le fond est un voisin pose DERRIERE le contenu, jamais un parent : un Pressable
          parent revendique le geste avant ce qu'il contient (voir QiblaPanel). */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('addPlace.cancel')} />

        <View
          style={[
            styles.feuille,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <View style={[styles.poignee, { backgroundColor: colors.border }]} />

          {/* En-tete : le lieu concerne, rappele avant toute action. */}
          <Text style={[styles.nom, { color: colors.text }]} numberOfLines={1}>
            {nom}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {adresse}
          </Text>
          {contribuee ? (
            <Text style={[styles.tag, { color: colors.alert, backgroundColor: colors.gold + '22' }]}>
              {t('place.addedByWin')}
            </Text>
          ) : null}

          <Text style={[styles.titre, { color: colors.textMuted }]}>{t('place.manage')}</Text>

          <Ligne
            emoji="🚩"
            teinte={colors.alert + '1f'}
            titre={t('place.reportIssueTitle')}
            detail={t('place.reportIssueSub')}
            onPress={onReport}
            colors={colors}
          />
          <Ligne
            emoji="✏️"
            teinte={colors.accent + '1f'}
            titre={t('place.editPlaceTitle')}
            detail={t('place.editPlaceSub')}
            note={!estLaMienne ? t('place.editOtherSub') : undefined}
            onPress={onEdit}
            colors={colors}
          />
          <Ligne
            emoji="🗑️"
            teinte={colors.danger + '1f'}
            titre={t('place.deletePlaceTitle')}
            detail={t('place.deletePlaceSub')}
            note={peutSupprimer && !estLaMienne ? t('place.deleteOtherSub') : undefined}
            verrouille={!peutSupprimer}
            danger
            disabled={suppressionEnCours}
            onPress={peutSupprimer ? onDelete : onSansDroit}
            colors={colors}
          />

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.annuler,
              { backgroundColor: pressed ? colors.border : colors.surfaceAlt },
            ]}
          >
            <Text style={[typography.body, { color: colors.textMuted }]}>{t('addPlace.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Ligne({
  emoji,
  teinte,
  titre,
  detail,
  onPress,
  colors,
  danger,
  disabled,
  verrouille,
  note,
}: {
  emoji: string;
  teinte: string;
  titre: string;
  detail: string;
  onPress: () => void;
  colors: Palette;
  danger?: boolean;
  disabled?: boolean;
  verrouille?: boolean;
  /** Avertissement n'apparaissant que dans un cas : agir sur la fiche d'un autre. */
  note?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titre}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        { borderTopColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      <View style={[styles.icone, { backgroundColor: teinte }]}>
        <Text style={{ fontSize: 17 }}>{emoji}</Text>
      </View>
      <View style={styles.textes}>
        <Text
          style={[styles.ligneTitre, { color: danger ? colors.danger : colors.text }]}
          numberOfLines={1}
        >
          {verrouille ? '🔒 ' : ''}
          {titre}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={2}>
          {detail}
        </Text>
        {note ? (
          <Text style={[styles.note, { color: colors.alert }]} numberOfLines={2}>
            {note}
          </Text>
        ) : null}
      </View>
      {/* Le chevron de la maquette : il dit qu'il y a une suite, donc que l'appui n'agit pas
          encore. Rien n'est detruit sur ce panneau-ci. */}
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21,32,28,0.45)', justifyContent: 'flex-end' },
  feuille: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  poignee: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, marginBottom: spacing.md },
  nom: { ...typography.heading, fontSize: 18 },
  tag: {
    ...typography.caption,
    alignSelf: 'flex-start',
    fontWeight: '700' as const,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  titre: {
    fontSize: 10.5,
    fontWeight: '800' as const,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: 2,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    paddingVertical: spacing.md,
  },
  icone: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  textes: { flex: 1, minWidth: 0 },
  ligneTitre: { fontSize: 14.5, fontWeight: '700' as const },
  note: { fontSize: 10.5, fontWeight: '700' as const, marginTop: 2, lineHeight: 13 },
  chevron: { fontSize: 22, fontWeight: '300' as const },
  annuler: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
});
