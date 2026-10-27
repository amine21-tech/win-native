import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Report } from '../shared';
import { REPORT_EMOJI } from '../reports/kinds';
import { REPORT_COLORS } from '../map/style';
import { formatDistance } from '../shared';
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
  onConfirm: () => void;
  onAbsent: () => void;
  onClose: () => void;
  colors: Palette;
};

/** « il y a 12 min », « il y a 3 h » — l'anciennete, qui dit ce que vaut l'information. */
function depuis(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return t('report.agoMin', { n: minutes });
  return t('report.agoHour', { n: Math.round(minutes / 60) });
}

/** Part du temps de vie deja ecoulee, entre 0 et 1. `null` quand le signalement est permanent. */
function partEcoulee(report: Report): number | null {
  if (!report.expiresAt) return null;
  const debut = new Date(report.createdAt).getTime();
  const fin = new Date(report.expiresAt).getTime();
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin <= debut) return null;
  return Math.min(1, Math.max(0, (Date.now() - debut) / (fin - debut)));
}

export function ReportVoteCard({
  report,
  pending,
  message,
  distanceM,
  onConfirm,
  onAbsent,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const couleur = REPORT_COLORS[report.kind] ?? VERT;
  const ecoule = partEcoulee(report);
  const restantMin =
    report.expiresAt != null
      ? Math.max(0, Math.round((new Date(report.expiresAt).getTime() - Date.now()) / 60000))
      : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.voile} onPress={onClose} />

      <View style={styles.bas} pointerEvents="box-none">
        <View style={styles.feuille}>
          <View style={styles.tete}>
            {/* Le pictogramme dans un carre a LA COULEUR DU TYPE, celle qu'il porte deja sur la
                carte : on reconnait de quoi il s'agit avant d'avoir lu le mot. */}
            <View style={[styles.carre, { backgroundColor: couleur }]}>
              <Text style={styles.carreEmoji}>{REPORT_EMOJI[report.kind]}</Text>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.titre} numberOfLines={1}>
                {t(`report.${report.kind}`)}
              </Text>
              <Text style={styles.sousTitre} numberOfLines={2}>
                {depuis(report.createdAt, t)}
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

          <View style={styles.puces}>
            <Puce texte={t('report.confirmations', { n: report.confirmCount })} />
            <Puce texte={depuis(report.createdAt, t)} />
            {restantMin !== null ? <Puce texte={t('report.expiresIn', { n: restantMin })} /> : null}
          </View>

          {message ? (
            <Text style={styles.message}>{message}</Text>
          ) : pending ? (
            <ActivityIndicator color={VERT} style={{ marginTop: spacing.sm }} />
          ) : (
            <View style={styles.actions}>
              <Pressable
                onPress={onAbsent}
                accessibilityRole="button"
                style={({ pressed }) => [styles.disparu, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.disparuTexte}>{t('report.gone')}</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                accessibilityRole="button"
                style={({ pressed }) => [styles.toujours, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.toujoursTexte}>{t('report.stillThere')}</Text>
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
