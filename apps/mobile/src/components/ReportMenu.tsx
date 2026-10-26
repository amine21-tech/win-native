import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportKind } from '../shared';
import { FORCES, menuEmoji, REPORT_FAMILLE, REPORT_MENU_ORDER } from '../reports/kinds';
import { RadarIcon } from './RadarIcon';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: ReportKind) => void;
  colors: Palette;
};

/* Fond et bordure des cartes, repris de la maquette du client.
 *
 * Les contours de couleur vive ont disparu. J'avais teinte chaque carte selon sa famille, en
 * pensant qu'au volant la couleur se lit plus vite que le mot ; le client a tranche autrement,
 * et sa maquette se defend mieux que mon raisonnement : onze cartes de quatre couleurs
 * differentes forment un damier ou plus rien ne ressort. Des cartes neutres, et la couleur
 * reservee a ce qui la merite vraiment — les trois ecussons du barrage, le badge << Nouveau >>.
 */
const FOND_CARTE = '#F7F8F9';
const BORDURE_CARTE = '#E4E6E8';

/**
 * TEXTE DES CARTES — fixe, parce que LEUR FOND L'EST.
 *
 * `FOND_CARTE` est une constante : les cartes restent claires dans les deux themes. Leur texte,
 * lui, prenait `colors.text`, qui devient CLAIR en mode nuit — le libelle disparaissait alors
 * sur un fond blanc. Le client l'a constate, capture a l'appui : « en mode nuit, ce n'est pas
 * bien affiché ».
 *
 * La regle est generale et vaut au-dela de cet ecran : la couleur d'un texte suit le fond SUR
 * LEQUEL IL EST POSE, pas le theme de l'application. Des qu'un fond est fige, son texte doit
 * l'etre aussi.
 */
const TEXTE_CARTE = '#15201C';
const TEXTE_CARTE_DOUX = '#5E6B64';

/* Vert WIN, epaisseur et marges : les trois valeurs sont celles du client, au point pres.
 *
 * Sans bordure, le panneau collait aux quatre bords de l'ecran et ressemblait a n'importe quel
 * panneau d'Android. Detache de quelques points, cercle de vert, il redevient UN OBJET DE WIN
 * pose sur la carte — c'est exactement ce que dit la maquette, et la raison qu'elle en donne. */
const VERT_WIN = '#1A6B45';
const BORDURE_PANNEAU = 2.5;
const MARGE_PANNEAU = 14;

/** Menu de signalement : grille 2 colonnes, heritee de `.alert-menu`/`.am-grid` en v83. */
export function ReportMenu({ visible, onClose, onPick, colors }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  /* Quelle force tient le barrage : le choix se fait DANS la carte, sans la quitter. Un seul
   * appui suffit a qui sait deja, deux a qui hesite. */
  const [force, setForce] = useState<ReportKind>('police');

  const choisir = (kind: ReportKind) => {
    onPick(kind === 'police' ? force : kind);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: colors.surface, marginBottom: MARGE_PANNEAU + insets.bottom },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.poignee} />

          {/* La croix remplace le bouton « Annuler » du bas. Elle est a sa place habituelle —
              en haut a droite — donc la ou le pouce la cherche, et elle rend au panneau la
              hauteur que prenait un bouton entier pour ne rien faire d'autre que fermer. */}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('addPlace.cancel')}
            style={({ pressed }) => [
              styles.fermer,
              { backgroundColor: pressed ? BORDURE_CARTE : FOND_CARTE },
            ]}
          >
            {/* Meme raison : la pastille de fermeture est claire dans les deux themes. */}
            <Text style={[styles.fermerGlyphe, { color: TEXTE_CARTE_DOUX }]}>✕</Text>
          </Pressable>

          <Text style={[typography.heading, styles.titre, { color: colors.text }]}>{t('report.menuTitle')}</Text>
          <Text style={[typography.caption, styles.sousTitre, { color: colors.textMuted }]}>
            {t('report.menuSub')}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {REPORT_MENU_ORDER.map((kind) => {
                const estBarrage = kind === 'police';
                const estNouveau = REPORT_FAMILLE[kind] === 'nouveau';
                return (
                  <Pressable
                    key={kind}
                    onPress={() => choisir(kind)}
                    accessibilityRole="button"
                    accessibilityLabel={t(`report.${kind}`)}
                    style={({ pressed }) => [
                      styles.item,
                      { backgroundColor: pressed ? BORDURE_CARTE : FOND_CARTE, borderColor: BORDURE_CARTE },
                    ]}
                  >
                    {estNouveau ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{t('report.nouveau')}</Text>
                      </View>
                    ) : null}

                    {estBarrage ? (
                      /* Les trois ecussons, a la place du pictogramme.
                       *
                       * LES TROIS GARDENT LEUR COULEUR PLEINE. Les deux non choisis etaient
                       * ramenes a 32 % d'opacite : la teinte institutionnelle s'effaçait, et le
                       * texte blanc avec elle. Sur la capture du client, << GEND. >> et
                       * << ARMÉE >> etaient illisibles — deux pastilles grises dont on ne
                       * devinait ni la couleur ni le mot.
                       *
                       * Le choix se marque donc par un CERCLE sombre autour de l'ecusson actif,
                       * et non par l'effacement des autres. La bordure est posee sur les trois,
                       * transparente quand l'ecusson n'est pas choisi : la taille ne bouge pas
                       * d'un point quand on change de force. */
                      <View style={styles.forces}>
                        {FORCES.map((f) => {
                          const actif = f.kind === force;
                          return (
                            <Pressable
                              key={f.kind}
                              onPress={() => setForce(f.kind)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: actif }}
                              accessibilityLabel={t(`report.${f.kind}`)}
                              style={[
                                styles.ecusson,
                                {
                                  backgroundColor: f.couleur,
                                  borderColor: actif ? TEXTE_CARTE : 'transparent',
                                },
                              ]}
                            >
                              <Text style={styles.ecussonText}>{f.court}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : kind === 'radar' ? (
                      // Un dessin plutot qu'un emoji : voir RadarIcon.
                      <RadarIcon size={26} />
                    ) : (
                      <Text style={styles.emoji}>{menuEmoji(kind)}</Text>
                    )}

                    {/* Couleurs figees, comme le fond de la carte : voir TEXTE_CARTE. */}
                    <Text style={[styles.itemLabel, { color: TEXTE_CARTE }]} numberOfLines={1}>
                      {t(`report.${kind}`)}
                    </Text>
                    <Text style={[styles.itemSub, { color: TEXTE_CARTE_DOUX }]} numberOfLines={2}>
                      {t(`report.sub_${kind}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(21,32,28,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    // Detache des bords : le panneau redevient une carte posee sur la carte.
    marginHorizontal: MARGE_PANNEAU,
    borderRadius: radius.lg,
    borderWidth: BORDURE_PANNEAU,
    borderColor: VERT_WIN,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '86%',
  },
  poignee: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8DCDE',
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  item: {
    width: '48%',
    borderWidth: 1,
    // 16 points : des angles plus doux que le reste de l'interface, parce que ces cartes se
    // touchent vite et mal.
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: 3,
  },
  emoji: { fontSize: 24 },
  itemLabel: { fontSize: 14, fontWeight: '800' as const, marginTop: 2 },
  itemSub: { fontSize: 10.5, textAlign: 'center', lineHeight: 13 },
  forces: { flexDirection: 'row', gap: 5 },
  ecusson: {
    width: 34,
    height: 26,
    borderRadius: 7,
    // La bordure est posee sur les TROIS, transparente quand l'ecusson n'est pas choisi : sans
    // cela, la pastille active serait plus large que les autres et la rangee sauterait a chaque
    // changement de force.
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ecussonText: { color: '#fff', fontSize: 7.5, fontWeight: '800' as const, letterSpacing: 0.2 },
  /* Le badge deborde du coin : pose a l'interieur, il se confondrait avec le contenu ; a cheval
   * sur le bord, il se lit comme une etiquette collee. */
  badge: {
    position: 'absolute',
    top: -7,
    right: -3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#2E7D4F',
    elevation: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' as const },
  // Le titre s'arrete avant la croix : sinon un libelle long passerait dessous.
  titre: { paddingRight: 40 },
  sousTitre: { paddingRight: 40, marginBottom: spacing.md },
  fermer: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    zIndex: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fermerGlyphe: { fontSize: 15, lineHeight: 17, fontWeight: '700' as const },
});
