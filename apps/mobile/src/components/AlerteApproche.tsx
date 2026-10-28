import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REPORT_EMOJI } from '../reports/kinds';
import { REPORT_COLORS } from '../map/style';
import { formatDistance, type Report } from '../shared';
import { radius, spacing } from '../theme';

/**
 * CARTE D'ALERTE COMPACTE — point 17 du client, synthese du 29 octobre.
 *
 * POURQUOI ELLE REMPLACE LA FEUILLE BASSE. L'alerte d'approche ouvrait jusqu'ici la carte de
 * vote « Toujours la ? », une feuille qui monte du bas et occupe la moitie de l'ecran. Le
 * client le dit sans detour : elle est trop grande et elle cache les boutons de navigation.
 * Il a raison, et la raison est plus profonde que l'encombrement.
 *
 * Une alerte d'approche n'est pas une QUESTION, c'est une INFORMATION. Elle arrive sans qu'on
 * l'ait demandee, pendant qu'on conduit, et elle doit se lire sans rien interrompre. Lui donner
 * la forme d'une boite de dialogue — qui attend une reponse, qui couvre l'ecran — fait croire
 * au conducteur qu'il doit agir. Une petite carte posee dans un coin ne demande rien.
 *
 * LE VOTE N'EST PAS PERDU, et c'etait le vrai risque de ce changement : le retrait d'un
 * signalement repose sur les votes « plus la », et le degagement d'une route bloquee en depend
 * directement (point 12). Il reste donc atteignable par un APPUI SUR LE MARQUEUR, qui ouvre la
 * feuille de vote complete comme avant. Ce qui change, c'est qu'on ne la subit plus : on la
 * demande.
 *
 * BAS-GAUCHE, AU-DESSUS DE LA BARRE ANDROID. La colonne des dix boutons occupe la droite, la
 * consigne de conduite occupe le haut : le coin bas-gauche est le seul endroit libre pendant
 * la navigation. La barre systeme n'est jamais couverte — le client l'ecrit deux fois.
 */

/** 230 x 110 points, valeurs du client. La hauteur n'est pas imposee : elle s'adapte au texte,
 *  le minimum garantissant que la carte ne se reduise jamais a une ligne illisible. */
const LARGEUR = 230;
const HAUTEUR_MIN = 110;

/** Epaisseur de la barre de couleur en tete de carte (5 dp chez le client). */
const BARRE = 5;

const FOND = '#FFFFFF';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';
const VERT = '#0B5B2C';
const GRIS = '#ECEFED';
const TRAIT = '#E2E7E4';

type Props = {
  report: Report | null;
  /** Distance restante au moment de l'alerte — le badge de la maquette. */
  distanceM: number | null;
  /** « NON, garder » : la carte se referme et les alertes continuent. */
  onGarder: () => void;
  /** « OUI, desactiver » : les alertes de proximite s'arretent, jusqu'a reactivation. */
  onDesactiver: () => void;
};

export function AlerteApproche({ report, distanceM, onGarder, onDesactiver }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!report) return null;

  const couleur = REPORT_COLORS[report.kind] ?? VERT;
  const libelle = t(`report.${report.kind}`);

  return (
    <View
      style={[styles.ancrage, { bottom: spacing.md + insets.bottom, left: spacing.md }]}
      pointerEvents="box-none"
    >
      <View style={styles.carte}>
        {/* BARRE DE COULEUR DU TYPE, en tete. Elle fait le travail que ferait une icone en
            couleur, mais sur toute la largeur : reconnaissable du coin de l'oeil, sans avoir
            a distinguer un pictogramme de quinze points. */}
        <View style={[styles.barre, { backgroundColor: couleur }]} />

        <View style={styles.corps}>
          <View style={styles.entete}>
            {/* Le triangle de signalisation routiere, a la couleur du type, avec le symbole
                dedans — c'est la forme que tout conducteur lit sans apprendre. */}
            <View style={styles.panneau}>
              <Text style={[styles.triangle, { color: couleur }]}>▲</Text>
              <Text style={styles.symbole}>{REPORT_EMOJI[report.kind] ?? '⚠️'}</Text>
            </View>

            <View style={styles.titres}>
              <Text style={styles.nom} numberOfLines={1}>
                {libelle}
              </Text>
              <Text style={styles.sousTitre} numberOfLines={1}>
                {t('approach.ahead')}
              </Text>
            </View>

            {distanceM != null ? (
              <View style={[styles.badge, { backgroundColor: couleur }]}>
                <Text style={styles.badgeTexte}>{formatDistance(distanceM)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.trait} />

          <Text style={styles.question}>{t('approach.disableQuestion')}</Text>

          <View style={styles.boutons}>
            <Pressable
              onPress={onDesactiver}
              accessibilityRole="button"
              style={({ pressed }) => [styles.oui, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.ouiTexte}>{t('approach.disableYes')}</Text>
            </Pressable>
            <Pressable
              onPress={onGarder}
              accessibilityRole="button"
              style={({ pressed }) => [styles.non, { backgroundColor: pressed ? TRAIT : GRIS }]}
            >
              <Text style={styles.nonTexte}>{t('approach.disableNo')}</Text>
            </Pressable>
          </View>

          {/* Le point vert et « Alertes actives » : l'etat du reglage, sous les yeux au moment
              ou on le modifie. Sans lui, « OUI, desactiver » ne dit pas ce qu'on desactive. */}
          <View style={styles.etat}>
            <View style={styles.point} />
            <Text style={styles.etatTexte}>{t('approach.alertsOn')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ancrage: { position: 'absolute' },
  carte: {
    width: LARGEUR,
    minHeight: HAUTEUR_MIN,
    backgroundColor: FOND,
    borderRadius: radius.md,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  barre: { height: BARRE },
  corps: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 6, gap: 5 },

  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* Le symbole se superpose au triangle : un seul bloc de 22 points, comme la maquette. */
  panneau: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  triangle: { fontSize: 22, position: 'absolute' },
  symbole: { fontSize: 11 },

  titres: { flex: 1, minWidth: 0 },
  nom: { color: TEXTE, fontSize: 13, fontWeight: '800' as const },
  sousTitre: { color: TEXTE_DOUX, fontSize: 10 },

  badge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTexte: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' as const },

  trait: { height: StyleSheet.hairlineWidth, backgroundColor: TRAIT, marginVertical: 1 },
  question: { color: TEXTE, fontSize: 11, fontWeight: '700' as const },

  boutons: { flexDirection: 'row', gap: 6 },
  oui: {
    flex: 1,
    backgroundColor: VERT,
    borderRadius: radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  ouiTexte: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' as const },
  non: { flex: 1, borderRadius: radius.sm, paddingVertical: 6, alignItems: 'center' },
  nonTexte: { color: TEXTE, fontSize: 10, fontWeight: '800' as const },

  etat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  point: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2BA84A' },
  etatTexte: { color: TEXTE_DOUX, fontSize: 9, fontWeight: '700' as const },
});
