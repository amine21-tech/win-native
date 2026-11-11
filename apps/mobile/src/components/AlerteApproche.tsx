import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { OR_MARQUEUR, SIGNALISATION } from '../map/signalisation';
import { PICTOS_SIGNALISATION } from '../map/pictos';
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

  /* LA COULEUR ET LE PICTOGRAMME VIENNENT DU MEME ENDROIT QUE LA CARTE — le tableau du
   * client, dans map/signalisation.ts. C'est la demande du 2 novembre : << les mêmes design
   * et couleur >>.
   *
   * POURQUOI CELA COMPTE PLUS QU'UN DETAIL D'HABILLAGE. Le conducteur voit le marqueur sur la
   * carte, puis la carte d'alerte s'ouvre : si le dessin et la teinte changent entre les deux,
   * il doit refaire le lien a chaque fois. Les faire identiques, c'est faire reconnaitre
   * l'objet, pas le lire.
   *
   * On prend la variante de JOUR : la carte d'alerte a un fond blanc, quel que soit le theme
   * de la carte routiere. La variante de nuit, eclaircie pour un fond sombre, y serait
   * delavee. */
  const couleur = SIGNALISATION[report.kind]?.jour ?? VERT;
  const picto = PICTOS_SIGNALISATION[report.kind];
  const libelle = t(`report.${report.kind}`);
  /* Le badge du tableau du client — << Ralentisseur >>, << Trafic dense >>, << Collision >> —
   * celui-la meme qui est ecrit sous le marqueur sur la carte. */
  const badge = t(`report.badge_${SIGNALISATION[report.kind]?.badge ?? report.kind}`);

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
            {/* LE MARQUEUR DE LA CARTE, EN PLUS PETIT : disque a la couleur du type, anneau
                d'or, pictogramme blanc au centre. Exactement ce que le conducteur vient de
                voir sur la carte. L'ancien triangle avec un emoji dedans ne lui ressemblait
                en rien — et l'emoji ne s'affichait pas partout. */}
            <View style={[styles.pastille, { backgroundColor: couleur, borderColor: OR_MARQUEUR }]}>
              {picto ? <Image source={picto} style={styles.picto} resizeMode="contain" /> : null}
            </View>

            <View style={styles.titres}>
              <Text style={styles.nom} numberOfLines={1}>
                {libelle}
              </Text>
              <Text style={styles.sousTitre} numberOfLines={1}>
                {badge} · {t('approach.ahead')}
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

/** Marge autour de la croix de fermeture, sur tous les cotes. Valeur du document (C5). */
const CROIX_MARGE = 10;
/** Taille de la croix. Le document precise de ne pas y toucher. */
const CROIX_TAILLE = 24;

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
  /* LA CROIX NE TOUCHE PLUS RIEN — correction C5 du 11 novembre.
   *
   * Elle etait collee au coin : deux points du bord, deux points sous la barre de couleur. A
   * cette distance elle chevauchait le badge et la fin du titre des que le libelle etait un peu
   * long — << Route bloquee >>, << Trafic dense >>. Le document demande dix points de marge sur
   * tous les cotes et une croix ISOLEE.
   *
   * LA MARGE NE SUFFIT PAS A ELLE SEULE : ecarter la croix du bord la rapproche du texte. Il
   * faut AUSSI reserver sa place dans le contenu, ce que fait `paddingRight` sur l'entete —
   * dix de marge, vingt-quatre de croix, six de respiration. Sans cela on aurait deplace le
   * chevauchement au lieu de le supprimer. */
  fermer: {
    position: 'absolute',
    top: BARRE + CROIX_MARGE,
    right: CROIX_MARGE,
    width: CROIX_TAILLE,
    height: CROIX_TAILLE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fermerGlyphe: { color: TEXTE_DOUX, fontSize: 13, fontWeight: '800' as const },
  corps: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 6, gap: 5 },

  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    /* La place de la croix, reservee : voir la note sur `fermer`. */
    paddingRight: CROIX_MARGE + CROIX_TAILLE + 6,
  },
  /* Le marqueur de la carte, reduit a 22 points — la mesure de la maquette. L'anneau d'or
   * fait 1,5 point : en dessous il disparait a cette taille, au-dessus il mange le disque. */
  pastille: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picto: { width: 12, height: 12 },

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
