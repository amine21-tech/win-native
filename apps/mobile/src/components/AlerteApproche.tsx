import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
 * ELLE REMONTE SOUS LA BANDE DE DIRECTION — 1er novembre.
 *
 * Elle vivait en bas a gauche, seul endroit libre tant que la consigne de conduite occupait
 * elle-meme le bas de l'ecran. Depuis que la consigne est rentree dans le bandeau du haut, ce
 * coin ne l'est plus : la carte s'y est deplacee, et la capture du client le montre — l'alerte
 * recouvre le bouton << Recentrer >> et mord sur le cadre de progression.
 *
 * Elle se pose donc JUSTE SOUS le bandeau, a droite des deux pastilles de vitesse et a gauche
 * de la colonne de boutons. C'est la seule bande horizontale libre de l'ecran, et elle a
 * l'avantage d'etre a cote de ce qu'on regarde deja : la consigne de conduite.
 *
 * ET ELLE RETRECIT. Le client demande qu'elle << ne gene pas pour avoir l'itineraire >>. Sa
 * largeur n'est plus fixe : elle occupe ce qui reste entre les pastilles et les boutons, et
 * les corps de texte perdent un a deux points. Une carte d'avertissement n'a pas besoin d'etre
 * grande pour etre lue — elle a besoin d'etre AILLEURS que sur la route.
 */

/** Largeur maximale. La carte prend ce qui reste entre les pastilles de vitesse et la colonne
 *  de boutons, sans jamais depasser cette valeur : sur une tablette, une carte de 400 points
 *  de large pour trois lignes de texte serait ridicule. */
const LARGEUR_MAX = 230;

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
  /** Bas du bandeau du haut : la carte se pose juste dessous. */
  top: number;
  /** Largeur de la colonne de boutons a degager, a droite. */
  right: number;
  /** Largeur des pastilles de vitesse a degager, a gauche. */
  left: number;
};

export function AlerteApproche({
  report,
  distanceM,
  onGarder,
  onDesactiver,
  top,
  right,
  left,
}: Props) {
  const { t } = useTranslation();
  if (!report) return null;

  const couleur = REPORT_COLORS[report.kind] ?? VERT;
  const libelle = t(`report.${report.kind}`);

  return (
    <View style={[styles.ancrage, { top, left, right }]} pointerEvents="box-none">
      <View style={styles.carte}>
        {/* LA CROIX DE FERMETURE (correction C7 du 31 octobre). La carte se referme deja
            seule au bout de six secondes ; la croix sert a celui qui veut la retirer TOUT DE
            SUITE, parce qu'elle masque justement ce qu'il regardait. */}
        <Pressable
          onPress={onGarder}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('addPlace.cancel')}
          style={styles.fermer}
        >
          <Text style={styles.fermerGlyphe}>✕</Text>
        </Pressable>

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
    maxWidth: LARGEUR_MAX,
    backgroundColor: FOND,
    /* BORDURE VERTE FINE, coins de 12 (correction C6 du 31 octobre). Un point d'epaisseur
     * suffit : la carte est posee sur une carte routiere dont les teintes changent sans arret,
     * et c'est le trait qui en marque le bord, pas une ombre que le fond peut avaler. */
    borderWidth: 1,
    borderColor: VERT,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  barre: { height: BARRE },
  fermer: {
    position: 'absolute',
    top: BARRE + 2,
    right: 2,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fermerGlyphe: { color: TEXTE_DOUX, fontSize: 13, fontWeight: '800' as const },
  corps: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 6, gap: 5 },

  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* Le symbole se superpose au triangle : un seul bloc de 22 points, comme la maquette. */
  panneau: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  triangle: { fontSize: 22, position: 'absolute' },
  symbole: { fontSize: 11 },

  titres: { flex: 1, minWidth: 0 },
  nom: { color: TEXTE, fontSize: 12, fontWeight: '800' as const },
  sousTitre: { color: TEXTE_DOUX, fontSize: 9.5 },

  badge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTexte: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' as const },

  trait: { height: StyleSheet.hairlineWidth, backgroundColor: TRAIT, marginVertical: 1 },
  question: { color: TEXTE, fontSize: 10, fontWeight: '700' as const },

  boutons: { flexDirection: 'row', gap: 6 },
  oui: {
    flex: 1,
    backgroundColor: VERT,
    borderRadius: radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  ouiTexte: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' as const },
  non: { flex: 1, borderRadius: radius.sm, paddingVertical: 6, alignItems: 'center' },
  nonTexte: { color: TEXTE, fontSize: 9.5, fontWeight: '800' as const },

  etat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  point: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2BA84A' },
  etatTexte: { color: TEXTE_DOUX, fontSize: 9, fontWeight: '700' as const },
});
