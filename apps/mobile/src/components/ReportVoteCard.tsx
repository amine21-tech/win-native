import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Report } from '../shared';
import { REPORT_EMOJI } from '../reports/kinds';
import { REPORT_COLORS } from '../map/style';
import { dateDepuisServeur, formatDistance, millisecondesDepuisServeur } from '../shared';
import { radius, spacing, type Palette } from '../theme';

/**
 * « Toujours la ? » — feuille basse, maquette validee du 27 octobre (point 8).
 *
 * POURQUOI ELLE CHANGE DE FORME. C'etait une pastille sombre posee en haut de l'ecran, qui
 * disait le type du signalement et offrait deux boutons. Elle ne disait ni depuis quand il est
 * la, ni combien de conducteurs l'ont deja confirme, ni dans combien de temps il expire — or
 * c'est exactement ce dont on a besoin pour repondre honnetement. Confirmer un bouchon signale
 * il y a deux minutes et un signale il y a deux heures n'engage pas la meme chose.
 *
 * LES COULEURS SONT FIGEES. Le fond de la feuille est blanc dans les deux themes ; son texte
 * doit l'etre aussi. Voir ReportMenu : la regle a deja coute un ecran illisible en mode nuit.
 */

const FOND = '#FFFFFF';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';
const PUCE = '#F3F4F6';
const ROUGE = '#C0392B';
const VERT = '#0B5B2C';

type Props = {
  report: Report;
  pending: boolean;
  message: string | null;
  /** Distance restante jusqu'au signalement, quand on roule vers lui. */
  distanceM?: number | null;
  /**
   * CE QU'ON DEMANDE AU CONDUCTEUR — point H du correctif v2, phase 2.
   *
   *   `vote`       : << Ce signalement est-il toujours la ? >> Toujours la / Disparu. C'est la
   *                  carte du 27 octobre, inchangee, et c'est le cas par defaut.
   *   `praticable` : << Cette route est-elle praticable ? >> Oui / Non. Posee aux deux premiers
   *                  conducteurs qui empruntent un segment en reouverture provisoire.
   *
   * UNE VARIANTE DE LA MEME CARTE, ET NON UNE SECONDE CARTE. Le document dit << AJOUTER >>, et
   * c'est bien un ajout : le chemin du vote ne change pas d'une ligne. Mais poser la question
   * dans une feuille differente aurait demande au conducteur d'apprendre une deuxieme interface
   * au volant, pour deux boutons au meme endroit. Ce qui change est le titre et les libelles ;
   * le pictogramme, l'anciennete, la distance et le geste sont deja les bons.
   */
  mode?: 'vote' | 'praticable';
  onConfirm: () => void;
  onAbsent: () => void;
  onClose: () => void;
  colors: Palette;
};

/**
 * « il y a 12 min », « il y a 3 h » — l'anciennete, qui dit ce que vaut l'information.
 *
 * `dateDepuisServeur` et non `new Date` : le serveur renvoie l'horodatage de PostgreSQL, qu'Hermes
 * refuse. Sans elle, ce calcul rendait NaN et la puce affichait « il y a NaN min ».
 */
function depuis(
  quand: string,
  t: (k: string, o?: Record<string, unknown>) => string,
): string | null {
  const date = dateDepuisServeur(quand);
  if (!date) return null;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return t('report.agoMin', { n: minutes });
  return t('report.agoHour', { n: Math.round(minutes / 60) });
}

/** Part du temps de vie deja ecoulee, entre 0 et 1. `null` quand le signalement est permanent. */
function partEcoulee(report: Report): number | null {
  if (!report.expiresAt) return null;
  /* LA JAUGE N'A JAMAIS ETE AFFICHEE, et c'est le defaut le plus sournois de cette serie :
   * `new Date` rendait NaN sur Android, `Number.isFinite` renvoyait donc `null`, et la jauge
   * disparaissait en silence. Rien ne signalait l'erreur — on croyait simplement que tous les
   * signalements etaient permanents. */
  const debut = millisecondesDepuisServeur(report.createdAt);
  const fin = millisecondesDepuisServeur(report.expiresAt);
  if (debut === null || fin === null || fin <= debut) return null;
  return Math.min(1, Math.max(0, (Date.now() - debut) / (fin - debut)));
}

export function ReportVoteCard({
  report,
  pending,
  message,
  distanceM,
  mode = 'vote',
  onConfirm,
  onAbsent,
  onClose,
}: Props) {
  const { t } = useTranslation();
  /* LA BARRE ANDROID NE DOIT JAMAIS COUVRIR LE CONTENU (correction C3 du 31 octobre).
   * Le client l'a constate sur le panneau de partage GPS, dont le bouton « Ajouter ce lieu »
   * passait derriere la barre de navigation et devenait invisible. La regle vaut pour TOUTE
   * feuille ancree en bas : son dernier element doit rester atteignable au pouce. */
  const insets = useSafeAreaInsets();
  const couleur = REPORT_COLORS[report.kind] ?? VERT;
  /* Calculee une fois : elle apparait en sous-titre ET en puce. `null` quand la date est
   * illisible — on n'affiche alors rien plutot qu'un « il y a NaN min ». */
  const anciennete = depuis(report.createdAt, t);
  const ecoule = partEcoulee(report);
  const finMs = millisecondesDepuisServeur(report.expiresAt);
  const restantMin = finMs !== null ? Math.max(0, Math.round((finMs - Date.now()) / 60000)) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.voile} onPress={onClose} />

      <View style={styles.bas} pointerEvents="box-none">
        <View style={[styles.feuille, { paddingBottom: spacing.lg + insets.bottom }]}>
          <View style={styles.tete}>
            {/* Le pictogramme dans un carre a LA COULEUR DU TYPE, celle qu'il porte deja sur la
                carte : on reconnait de quoi il s'agit avant d'avoir lu le mot. */}
            <View style={[styles.carre, { backgroundColor: couleur }]}>
              <Text style={styles.carreEmoji}>{REPORT_EMOJI[report.kind]}</Text>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {/* LE TITRE PORTE LA QUESTION, et non le type du signalement : au volant, deux
                  boutons sans question posee se devinent mal, et c'est le texte exact que le
                  client a ecrit — << Cette route est-elle praticable ? >>. */}
              <Text style={styles.titre} numberOfLines={2}>
                {mode === 'praticable' ? t('report.passableAsk') : t(`report.${report.kind}`)}
              </Text>
              <Text style={styles.sousTitre} numberOfLines={2}>
                {anciennete ?? ''}
                {typeof distanceM === 'number'
                  ? ` · ${t('report.aheadOfYou', { distance: formatDistance(distanceM) })}`
                  : ''}
              </Text>
            </View>

            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.fermer}>✕</Text>
            </Pressable>
          </View>

          {/* TEMPS DE VIE RESTANT. Un signalement s'efface tout seul ; voir combien il lui reste
              dit si notre reponse compte encore. Rien ne s'affiche pour un signalement
              permanent — un radar fixe n'expire pas. */}
          {ecoule !== null ? (
            <View style={styles.piste}>
              <View style={[styles.jauge, { width: `${Math.round((1 - ecoule) * 100)}%`, backgroundColor: couleur }]} />
            </View>
          ) : null}

          {/* EN MODE PRATICABLE, LES PUCES DISENT AUTRE CHOSE. << 4 confirmations >> et
              << expire dans 20 min >> parlent de la vie du signalement ; ici la question est
              celle de la ROUTE, et ce qui aide a repondre est le type de ce qui avait ete
              signale et depuis quand. */}
          <View style={styles.puces}>
            {mode === 'praticable' ? (
              <Puce texte={t(`report.${report.kind}`)} />
            ) : (
              <Puce texte={t('report.confirmations', { n: report.confirmCount })} />
            )}
            {anciennete ? <Puce texte={anciennete} /> : null}
            {mode !== 'praticable' && restantMin !== null ? (
              <Puce texte={t('report.expiresIn', { n: restantMin })} />
            ) : null}
          </View>

          {message ? (
            <Text style={styles.message}>{message}</Text>
          ) : pending ? (
            <ActivityIndicator color={VERT} style={{ marginTop: spacing.sm }} />
          ) : (
            <View style={styles.actions}>
              {/* LES COULEURS NE CHANGENT PAS DE SENS D'UNE VARIANTE A L'AUTRE, et c'est ce qui
                  evite l'erreur de doigt : le rouge est a gauche et dit toujours << la route ne
                  passe pas >> (Disparu, ou Non), le vert est a droite et dit toujours
                  << la situation tient >> (Toujours la, ou Oui). Un conducteur qui connait la
                  carte du 27 octobre appuie au bon endroit sans relire. */}
              <Pressable
                onPress={onAbsent}
                accessibilityRole="button"
                style={({ pressed }) => [styles.disparu, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.disparuTexte}>
                  {t(mode === 'praticable' ? 'report.passableNo' : 'report.gone')}
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                accessibilityRole="button"
                style={({ pressed }) => [styles.toujours, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.toujoursTexte}>
                  {t(mode === 'praticable' ? 'report.passableYes' : 'report.stillThere')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Puce({ texte }: { texte: string }) {
  return (
    <View style={styles.puce}>
      <Text style={styles.puceTexte} numberOfLines={1}>
        {texte}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(21,32,28,0.45)' },
  bas: { flex: 1, justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: FOND,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  tete: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  carre: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  carreEmoji: { fontSize: 26 },
  titre: { color: TEXTE, fontSize: 18, fontWeight: '800' as const },
  sousTitre: { color: TEXTE_DOUX, fontSize: 12.5, marginTop: 2 },
  fermer: { color: TEXTE_DOUX, fontSize: 18 },
  piste: { height: 6, borderRadius: 3, backgroundColor: PUCE, overflow: 'hidden', marginTop: spacing.sm },
  jauge: { height: 6, borderRadius: 3 },
  puces: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  puce: { flex: 1, backgroundColor: PUCE, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8 },
  puceTexte: { color: TEXTE_DOUX, fontSize: 11, fontWeight: '700' as const, textAlign: 'center' },
  message: { color: TEXTE_DOUX, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  disparu: {
    flex: 1,
    backgroundColor: ROUGE,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  disparuTexte: { color: '#fff', fontSize: 15, fontWeight: '800' as const },
  toujours: {
    flex: 1,
    backgroundColor: VERT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  toujoursTexte: { color: '#fff', fontSize: 15, fontWeight: '800' as const },
});
