import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { FlecheManoeuvre } from './FlecheManoeuvre';
import { localizedInstruction, roadRef } from '../navigation/instructions';
import type { Maneuver } from '../navigation/routing';
import { formatDistance, type Language } from '../shared';
import { radius, spacing } from '../theme';

/**
 * PANNEAU DE DIRECTION, EN BAS DE L'ECRAN — point 16.A du client, 29 octobre.
 *
 * La consigne vivait en haut depuis la v83, avec une fleche de 34 points. Le client la veut en
 * bas, avec une fleche de 80, fond vert fonce et fleche blanche.
 *
 * CE QUE CE DEPLACEMENT GAGNE, ET CE QU'IL COUTE. Il gagne la taille : 80 points contre 34,
 * c'est la difference entre une fleche qu'on lit et une fleche qu'on reconnait. Il gagne aussi
 * le pouce — en bas de l'ecran, la consigne est la ou la main se trouve deja. Il coute un
 * regard plus bas : le haut de l'ecran est plus proche de la route, et l'oeil y revient de
 * lui-meme. Le client a tranche, et sa raison tient : sur un telephone pose sur un support de
 * tableau de bord, le haut de l'ecran est souvent le plus eloigne et le plus reflechissant.
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

const VERT = '#07401F';
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
  /** Hauteur du cadre du bas, pour se poser juste au-dessus. */
  bottom: number;
};

export function PanneauDirection({
  maneuver,
  suivante,
  distanceM,
  ecartSuivanteM,
  lang,
  arrived,
  bottom,
}: Props) {
  const { t } = useTranslation();

  if (arrived || !maneuver) {
    return (
      <View style={[styles.panneau, { bottom }]} pointerEvents="none">
        <Text style={styles.arrivee}>🏁  {t('nav.arrived')}</Text>
      </View>
    );
  }

  const montrerSuivante =
    suivante != null && ecartSuivanteM != null && ecartSuivanteM <= SUIVANTE_PROCHE_M;

  return (
    <View style={[styles.panneau, { bottom }]} pointerEvents="none">
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
  panneau: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: VERT,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
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
