import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportKind } from '../shared';
import { menuEmoji, REPORT_FAMILLE, REPORT_MENU_ORDER } from '../reports/kinds';
import { RadarIcon } from './RadarIcon';
import { useSession } from '../store/session';
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
/* LES VALEURS DU 8 NOVEMBRE : fond #FCFFFB, bordure #1A8A65 sur 2 points.
 *
 * Elles etaient en gris neutre (#F7F8F9 / #E4E6E8, 1 point). Le changement ne contredit pas la
 * decision rappelee ci-dessus : ce qui avait ete refuse, ce sont onze bordures de couleurs
 * DIFFERENTES, une par famille, qui faisaient un damier. Ici, les douze cartes partagent la
 * MEME bordure verte — c'est l'inverse d'un damier, c'est une serie. */
const FOND_CARTE = '#FCFFFB';
const BORDURE_CARTE = '#1A8A65';
const EPAISSEUR_CARTE = 2;
/** Teinte de l'appui : la bordure verte est trop sombre pour servir de fond presse. */
const FOND_CARTE_PRESSE = '#E8F3ED';

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
  /* LE CHOIX DE LA FORCE A DISPARU — demande d'arsanne, 9 novembre : << un barrage, ca reste un
   * barrage >>.
   *
   * IL Y AVAIT TROIS ECUSSONS DANS LA CARTE — POLICE, GEND., ARMEE — et il fallait en choisir un
   * avant de signaler. Cela partait d'une bonne idee, du 27 octobre : un conducteur algerien ne
   * lit pas << barrage >> de la meme facon selon qui le tient.
   *
   * MAIS CELA DEMANDE AU TEMOIN DE SAVOIR, et au volant il ne sait pas toujours. On aperçoit un
   * barrage a deux cents metres ; distinguer un uniforme de gendarme d'un uniforme de policier a
   * cette distance, en roulant, est une precision qu'on n'a pas. Exiger le choix, c'est obtenir
   * une reponse au hasard — et une information fausse est pire qu'une information absente.
   *
   * Le conducteur suivant decouvrira de qui il s'agit en arrivant, ce qui lui coute zero seconde.
   */
  /* L'etat des alertes de proximite vit ICI parce que c'est ici qu'on le cherche : le menu des
   * signalements est le seul endroit de l'application qui parle d'eux. La colonne de droite
   * reste a dix boutons — c'est une decision prise et tenue. */
  const alertesActives = useSession((s) => s.approachAlertsEnabled);
  const setAlertes = useSession((s) => s.setApproachAlerts);

  const choisir = (kind: ReportKind) => {
    onPick(kind);
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
              { backgroundColor: pressed ? FOND_CARTE_PRESSE : FOND_CARTE },
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
                const estNouveau = REPORT_FAMILLE[kind] === 'nouveau';
                /* LES DECHETS SONT UNE CARTE COMME LES AUTRES — correction d'arsanne, vue a
                 * l'ecran le 9 novembre.
                 *
                 * ELLES ONT PRIS TOUTE LA LARGEUR PENDANT UNE VERSION. Les documents du 8 et du
                 * 9 novembre le demandent tous deux, au mot pres : << DERNIER, seul sur sa ligne
                 * = pleine largeur >>. Le raisonnement se defendait sur le papier — un type qui
                 * vient d'arriver se remarque d'autant plus qu'il ne partage sa ligne avec rien.
                 *
                 * A L'USAGE, CELA NE MARCHE PAS. Le menu est une grille de onze cartes
                 * identiques ; la douzieme, large et seule en bas, ne se lit plus comme un type
                 * de signalement mais comme un bouton d'une autre nature — a cote de la ligne
                 * << Alertes actives >>, qui est justement un bouton d'une autre nature. arsanne
                 * l'a vu sur son telephone et demande la meme carte que les autres, en face
                 * d'Incendie.
                 *
                 * Le badge << Nouveau >> reste : il ne change pas la forme de la carte, et c'est
                 * lui, pas la largeur, qui dit que le type est recent.
                 *
                 * ELLE TOMBE NATURELLEMENT EN FACE D'INCENDIE : elle est derniere dans
                 * REPORT_MENU_ORDER, qui en compte douze, donc elle occupe la seconde colonne de
                 * la sixieme rangee. Il n'y a rien a forcer. */
                return (
                  <Pressable
                    key={kind}
                    onPress={() => choisir(kind)}
                    accessibilityRole="button"
                    accessibilityLabel={t(`report.${kind}`)}
                    style={({ pressed }) => [
                      styles.item,
                      { backgroundColor: pressed ? FOND_CARTE_PRESSE : FOND_CARTE, borderColor: BORDURE_CARTE },
                    ]}
                  >
                    {estNouveau ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{t('report.nouveau')}</Text>
                      </View>
                    ) : null}

                    {kind === 'radar' ? (
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

            {/* ETAT DES ALERTES DE PROXIMITE, et le chemin du retour (point 17).
                La carte d'alerte permet de les couper d'un appui, en roulant. Sans cette
                ligne, rien ne permettrait de les RALLUMER : un reglage qu'on ne peut que
                desactiver est un piege, pas un reglage. */}
            <Pressable
              onPress={() => setAlertes(!alertesActives)}
              accessibilityRole="switch"
              accessibilityState={{ checked: alertesActives }}
              style={({ pressed }) => [
                styles.alertes,
                { backgroundColor: pressed ? FOND_CARTE_PRESSE : FOND_CARTE, borderColor: BORDURE_CARTE },
              ]}
            >
              <View
                style={[
                  styles.alertesPoint,
                  { backgroundColor: alertesActives ? '#2BA84A' : TEXTE_CARTE_DOUX },
                ]}
              />
              <Text style={[styles.alertesTexte, { color: TEXTE_CARTE }]} numberOfLines={1}>
                {alertesActives ? t('approach.alertsOn') : t('approach.alertsOff')}
              </Text>
              <Text style={[styles.alertesAction, { color: TEXTE_CARTE_DOUX }]} numberOfLines={1}>
                {alertesActives ? t('approach.disableQuestion') : t('approach.reenable')}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  alertes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: EPAISSEUR_CARTE,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  alertesPoint: { width: 8, height: 8, borderRadius: 4 },
  alertesTexte: { fontSize: 13, fontWeight: '800' as const },
  alertesAction: { flex: 1, fontSize: 11, textAlign: 'right' },

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
    borderWidth: EPAISSEUR_CARTE,
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
  /* Le badge deborde du coin : pose a l'interieur, il se confondrait avec le contenu ; a cheval
   * sur le bord, il se lit comme une etiquette collee. */
  badge: {
    position: 'absolute',
    top: -7,
    right: -3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    /* L'OR, et non le vert (8 novembre : << badge NOUVEAU dore >>, fond #D4A017, texte
     * blanc). Le vert etait celui de l'interface : le badge se fondait dans le panneau qu'il
     * etait justement cense faire remarquer. L'or ne sert qu'a cela dans l'application — il
     * entoure les marqueurs et cerne la fleche — et il n'apparait nulle part ailleurs dans ce
     * menu. */
    backgroundColor: '#D4A017',
    elevation: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' as const },
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
