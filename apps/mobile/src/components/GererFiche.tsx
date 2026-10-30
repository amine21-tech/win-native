import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, type Palette } from '../theme';

/**
 * « GERER CETTE FICHE » — les trois gestes, sous les yeux (maquette du client).
 *
 * POURQUOI ILS SORTENT DE LEUR FEUILLE. Ils vivaient derriere un bouton « Gerer cette fiche »
 * qui ouvrait une seconde feuille. Je les y avais mis pour garder la fiche courte, et pour
 * qu'on ne supprime pas en croyant corriger. La maquette du client les remet dans la fiche, et
 * elle a raison sur un point que j'avais sous-estime : un geste cache derriere un appui n'est
 * pas prudent, il est INTROUVABLE. Un contributeur qui voit une adresse fausse et ne trouve pas
 * comment le dire ne la signale pas — il s'en va.
 *
 * La prudence est conservee autrement, et mieux : chaque ligne porte UNE PHRASE qui dit ce
 * qu'elle fait, la suppression est en rouge, et elle demande toujours confirmation dans sa
 * propre boite. C'est l'ecriture qui protege, pas la profondeur du menu.
 *
 * CE COMPOSANT EST PARTAGE avec la feuille qui subsiste pour l'affichage compact, pendant la
 * navigation. Les deux montrent donc exactement les memes mots : les ecrire deux fois aurait
 * garanti qu'ils divergent au premier changement de formulation.
 */

type Props = {
  /** Qui peut corriger et retirer : l'auteur de la fiche, ou un contributeur. */
  peutGerer: boolean;
  peutSupprimer: boolean;
  estLaMienne: boolean;
  suppressionEnCours: boolean;
  onReport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Appui sur une ligne verrouillee : on explique au lieu de ne rien faire. */
  onSansDroit: () => void;
  colors: Palette;
};

export function GererFiche({
  peutGerer,
  peutSupprimer,
  estLaMienne,
  suppressionEnCours,
  onReport,
  onEdit,
  onDelete,
  onSansDroit,
  colors,
}: Props) {
  const { t } = useTranslation();

  return (
    <View>
      <Text style={[styles.titre, { color: colors.textMuted }]}>{t('place.manageSection')}</Text>

      {/* LE SIGNALEMENT S'ADRESSE A TOUT LE MONDE. C'est le seul geste qu'un passant puisse
          faire sur la fiche d'un autre, et c'est precisement ce qui fait vivre la base : celui
          qui constate l'erreur n'est presque jamais celui qui a cree la fiche. */}
      <LigneAction
        emoji="🚩"
        teinte={colors.alert + '1f'}
        titre={t('place.reportIssueTitle')}
        detail={t('place.reportIssueSub')}
        onPress={onReport}
        colors={colors}
      />

      {peutGerer ? (
        <LigneAction
          emoji="✏️"
          teinte={colors.accent + '1f'}
          titre={t('place.editPlaceTitle')}
          detail={t('place.editPlaceSub')}
          note={!estLaMienne ? t('place.editOtherSub') : undefined}
          onPress={onEdit}
          colors={colors}
        />
      ) : null}

      {peutGerer ? (
        <LigneAction
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
      ) : null}
    </View>
  );
}

export function LigneAction({
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
          encore. Rien n'est detruit depuis cette ligne. */}
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
