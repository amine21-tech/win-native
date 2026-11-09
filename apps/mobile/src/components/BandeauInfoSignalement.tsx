import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDistance } from '../shared';
import type { Report } from '../shared';
import { SIGNALISATION } from '../map/signalisation';
import { radius, spacing } from '../theme';

/**
 * LA BARRE D'INFORMATION D'UN SIGNALEMENT A VENIR — point 6 du 9 novembre.
 *
 * << Alerte dans la barre d'info (ex : 'Bouchon dans 300m') lorsqu'on est a moins de 500m. >>
 *
 * ELLE NE PARLE PAS, ET C'EST LE POINT DELICAT DE CE CORRECTIF.
 *
 * Le document demande une alerte a cinq cents metres. Mais le 2 novembre, apres avoir essaye les
 * deux au volant, le client avait ramene la VOIX a un seul palier de 150 m, en expliquant
 * pourquoi : deux annonces pour un seul dos d'ane, c'est deux fois l'attention detournee de la
 * route, et la seconde arrive au moment ou l'on franchit l'obstacle, donc trop tard pour servir.
 *
 * Les deux consignes ne se contredisent pas des qu'on lit la seconde a la lettre : elle parle
 * d'une BARRE D'INFO, c'est-a-dire d'un texte a l'ecran. Rien dans le point 6 ne demande que la
 * voix parle a cinq cents metres. L'oeil est donc prevenu tot, l'oreille une seule fois — et les
 * deux decisions du client tiennent ensemble.
 *
 * ELLE S'EFFACE QUAND LA CARTE D'ALERTE PREND LE RELAIS, a 150 m : la meme information deux fois
 * a l'ecran, l'une sous l'autre, ne previent pas mieux. Elle encombre.
 *
 * LA DISTANCE SE MET A JOUR, et c'est la moitie de son utilite : << dans 300 m >> puis
 * << dans 200 m >> dit qu'on approche, la ou un texte fixe laisse croire a un affichage oublie.
 */

/** Distance d'apparition, en metres. Valeur du document. */
export const BANDEAU_INFO_M = 500;

export function BandeauInfoSignalement({
  report,
  distanceM,
  top,
  left,
  right,
}: {
  /** Le signalement a venir, ou `null` pour masquer la barre. */
  report: Report | null;
  distanceM: number;
  top: number;
  left: number;
  right: number;
}) {
  const { t } = useTranslation();
  if (!report) return null;

  /* LA COULEUR DU TYPE, variante de JOUR. La barre a un fond clair fixe dans les deux themes —
   * c'est la regle du depot depuis le menu de signalement du 26 octobre : un texte dont le fond
   * est fige doit l'etre aussi, sinon il disparait en mode nuit. */
  const couleur = SIGNALISATION[report.kind]?.jour ?? '#B8860B';

  return (
    <View style={[styles.barre, { top, left, right }]} pointerEvents="none">
      {/* Le filet de couleur porte le type : au volant, on le reconnait avant d'avoir lu. */}
      <View style={[styles.filet, { backgroundColor: couleur }]} />
      <Text style={[styles.texte, { color: couleur }]} numberOfLines={1}>
        ⚠ {t(`report.${report.kind}`)} {t('approach.inDistance', { distance: formatDistance(distanceM) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  barre: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    /* Fond clair fige : voir la note sur la couleur ci-dessus. */
    backgroundColor: '#FCFFFB',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  filet: { width: 4, height: 18, borderRadius: 2 },
  texte: { flex: 1, fontSize: 13, fontWeight: '800' as const },
});
