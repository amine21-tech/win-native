import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { FlecheManoeuvre } from './FlecheManoeuvre';
import { localizedInstruction, roadRef } from '../navigation/instructions';
import type { Maneuver } from '../navigation/routing';
import { formatDistance, type Language } from '../shared';
import { radius, spacing } from '../theme';

/**
 * LA CONSIGNE DE DIRECTION, DANS LE BANDEAU DU HAUT — correction du 1er novembre.
 *
 * TROISIEME POSITION, ET LA BONNE. La consigne vivait dans le bandeau depuis la v83. Le point
 * 16.A du 29 octobre l'a descendue en bas de l'ecran, avec une fleche de 80 points. La
 * correction P1 du 31 l'a remontee en haut, mais dans SON PROPRE CADRE, pose sous le bandeau.
 * Le client a essaye au volant et le dit sans detour : ce cadre vert gene toute la navigation.
 *
 * Il a raison, et l'erreur etait de ne lire P1 qu'a moitie. Deux cadres verts l'un sous
 * l'autre, c'est deux fois le meme objet : le regard doit choisir lequel lire, et pendant ce
 * temps il n'est pas sur la route. Ensemble ils mangeaient le tiers superieur de la carte,
 * c'est-a-dire exactement la portion qu'on regarde en conduisant — celle qui est DEVANT.
 *
 * La consigne n'est donc plus un panneau pose sous le bandeau : elle est DEDANS, avec l'heure
 * courante, la distance restante et l'heure d'arrivee. Un seul cadre, une seule lecture. C'est
 * ce que le client demande mot pour mot : << il doit etre integre au cadre du haut, il ne doit
 * pas etre separe >>.
 *
 * CE COMPOSANT N'A DONC PLUS DE POSITION NI DE FOND. Il ne se place plus lui-meme et ne porte
 * plus ni couleur, ni coins arrondis, ni ombre : il prend ceux du bandeau qui l'accueille, ce
 * qui est la difference entre etre integre et etre pose dessus. C'est aussi pour cela qu'il
 * reste un fichier a part plutot que de retourner dans NavigationOverlay : la consigne a sa
 * propre logique — deuxieme manoeuvre, ecusson de route, nom de rue — et elle a deja change de
 * place trois fois.
 *
 * CE QUE LES ALLERS-RETOURS ONT LAISSE DE BON : la fleche de 80 points, dessinee et non
 * empruntee a une police ; le nom de la rue ; la deuxieme consigne quand deux virages
 * s'enchainent. Ces trois-la venaient du point 16 et n'ont jamais eu de rapport avec la
 * position.
 *
 * LE NOM DE RUE EST LA NOUVEAUTE REELLE. L'ancien bandeau disait << Tournez a gauche >> ; il
 * dit maintenant << Tournez a gauche >> ET sur quelle rue. C'est ce qui permet de verifier
 * qu'on tourne au bon endroit quand deux rues se suivent a vingt metres — exactement le cas ou
 * une fleche seule ne suffit pas.
 *
 * LA DEUXIEME CONSIGNE, EN PLUS PETIT DESSOUS, n'apparait que quand elle est PROCHE. L'afficher
 * toujours ferait lire deux instructions a chaque instant, et la premiere y perdrait son
 * evidence ; ne jamais l'afficher laisserait le conducteur s'engager dans une rue sans savoir
 * qu'il en ressort trente metres plus loin.
 */

const TAILLE_FLECHE = 80;

/**
 * Au-dela, la manoeuvre suivante n'est plus << proche >> et n'a pas a etre annoncee.
 *
 * Trois cents metres : a 50 km/h c'est une vingtaine de secondes, le temps de faire la
 * premiere manoeuvre et d'aborder la seconde sans surprise.
 */
const SUIVANTE_PROCHE_M = 300;

type Props = {
  maneuver: Maneuver | null;
  /** Manoeuvre d'apres : affichee en petit si elle suit de pres. */
  suivante: Maneuver | null;
  distanceM: number | null;
  /** Distance entre la manoeuvre en cours et la suivante, pour decider de l'afficher. */
  ecartSuivanteM: number | null;
  lang: Language;
  arrived: boolean;
};

export function PanneauDirection({
  maneuver,
  suivante,
  distanceM,
  ecartSuivanteM,
  lang,
  arrived,
}: Props) {
  const { t } = useTranslation();

  if (arrived || !maneuver) {
    return (
      <View style={styles.bloc} pointerEvents="none">
        <Text style={styles.arrivee}>🏁  {t('nav.arrived')}</Text>
      </View>
    );
  }

  const montrerSuivante =
    suivante != null && ecartSuivanteM != null && ecartSuivanteM <= SUIVANTE_PROCHE_M;

  return (
    <View style={styles.bloc} pointerEvents="none">
      <View style={styles.ligne}>
        <FlecheManoeuvre type={maneuver.type} size={TAILLE_FLECHE} />

        <View style={styles.textes}>
          <View style={styles.distanceLigne}>
            {distanceM != null ? (
              <Text style={styles.distance}>{formatDistance(distanceM)}</Text>
            ) : null}
            {/* La pastille du numero de route, comme sur les panneaux : c'est « N12 » qui est
                ecrit dehors, pas le nom complet de l'autoroute. */}
            {roadRef(maneuver) ? (
              <View style={styles.ecusson}>
                <Text style={styles.ecussonTexte}>{roadRef(maneuver)}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.instruction} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
            {localizedInstruction(maneuver, lang)}
          </Text>

          {/* LE NOM DE RUE, quand Valhalla le connait. Il n'est pas toujours la — une bretelle
              d'autoroute n'a pas de nom —, et une ligne vide vaudrait mieux que rien du tout. */}
          {maneuver.streetName ? (
            <Text style={styles.rue} numberOfLines={1}>
              {maneuver.streetName}
            </Text>
          ) : null}
        </View>
      </View>

      {montrerSuivante ? (
        <View style={styles.suivante}>
          <FlecheManoeuvre type={suivante!.type} size={22} couleur="rgba(255,255,255,0.85)" />
          <Text style={styles.suivanteTexte} numberOfLines={1}>
            {t('nav.then')} {localizedInstruction(suivante!, lang)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* NI POSITION, NI FOND, NI OMBRE : la consigne est DANS le bandeau et en prend la couleur.
   * Lui en redonner un recreerait le deuxieme cadre que le client vient de faire retirer. Le
   * bandeau fournit aussi les marges laterales, d'ou l'absence de padding horizontal ici. */
  bloc: { marginBottom: spacing.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  textes: { flex: 1, minWidth: 0 },

  distanceLigne: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  distance: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' as const },
  ecusson: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  ecussonTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },

  instruction: { color: '#FFFFFF', fontSize: 18, lineHeight: 23, marginTop: 2 },
  rue: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' as const, marginTop: 1 },

  suivante: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  suivanteTexte: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 13 },

  arrivee: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' as const, textAlign: 'center' },
});
