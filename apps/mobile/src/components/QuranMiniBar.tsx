import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuranPlayer } from '../quran/player';
import { fonts, radius, spacing } from '../theme';

/* Les couleurs de l'ecran Qibla, et non celles du theme general : cette barre est ce qui reste
 * du panneau vert sombre une fois reduit, et doit s'y rattacher d'un coup d'oeil. */
const VERT_HAUT = '#0F7A55';
const OR = '#E6C66B';
const CREME = '#EFE7CF';

type Props = {
  /** Distance au bas de l'ecran : elle change pendant le guidage, ou le cadre du bas occupe
   * deja la place. */
  bottom: number;
  /** Rouvre le panneau de la Qibla en grand. */
  onOuvrir: () => void;
};

/**
 * LA QIBLA REDUITE — demande du client.
 *
 * Le panneau de la boussole occupe tout l'ecran. On y lance une recitation, et pour revenir a
 * la carte il fallait le fermer, ce qui coupait le son. Le client veut ce que font les lecteurs
 * de musique : reduire, garder le son, rendre la carte.
 *
 * Cette barre est ce qui reste du panneau une fois reduit. Elle tient en une ligne et ne porte
 * que ce dont on a besoin au volant : ce qui joue, pause, et la croix. Un appui sur le titre
 * rouvre le panneau en grand.
 *
 * Elle est posee A GAUCHE et non a droite malgre la demande, et c'est le seul ecart : la
 * colonne des dix boutons occupe toute la hauteur du bord droit. Mise a droite, la barre
 * passerait dessous ou recouvrirait la Qibla elle-meme — on l'aurait reduite sur le bouton qui
 * sert a la rouvrir.
 */
export function QuranMiniBar({ bottom, onOuvrir }: Props) {
  const { t } = useTranslation();
  const enCours = useQuranPlayer((s) => s.enCours);
  const joue = useQuranPlayer((s) => s.joue);
  const charge = useQuranPlayer((s) => s.charge);
  const pauseOuReprise = useQuranPlayer((s) => s.pauseOuReprise);
  const arreter = useQuranPlayer((s) => s.arreter);

  if (!enCours) return null;

  return (
    <View style={[styles.barre, { bottom }]} pointerEvents="box-none">
      <View style={styles.contenu}>
        <Pressable
          onPress={pauseOuReprise}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={joue ? t('qibla.pause') : t('qibla.play')}
          style={styles.bouton}
        >
          {charge ? (
            <ActivityIndicator size="small" color="#0D3A2B" />
          ) : (
            <Text style={styles.boutonGlyphe}>{joue ? '❚❚' : '▶'}</Text>
          )}
        </Pressable>

        <Pressable style={styles.titres} onPress={onOuvrir} accessibilityRole="button">
          <Text style={styles.arabe} numberOfLines={1}>
            {enCours.arabe}
          </Text>
          <Text style={styles.latin} numberOfLines={1}>
            {enCours.latin}
          </Text>
        </Pressable>

        <Pressable
          onPress={arreter}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('qibla.stop')}
          style={styles.fermer}
        >
          <Text style={styles.fermerGlyphe}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barre: { position: 'absolute', left: spacing.lg },
  contenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: VERT_HAUT,
    borderWidth: 1,
    borderColor: OR,
    borderRadius: radius.pill,
    paddingLeft: 5,
    paddingRight: spacing.md,
    paddingVertical: 5,
    // Large assez pour lire le nom, jamais assez pour couvrir la carte.
    maxWidth: 230,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  bouton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: OR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonGlyphe: { color: '#0D3A2B', fontSize: 13, fontWeight: '800' as const },
  titres: { flexShrink: 1, minWidth: 0 },
  arabe: { color: CREME, fontSize: 14, textAlign: 'right', lineHeight: 19 },
  latin: { color: 'rgba(239,231,207,0.62)', fontFamily: fonts.sans, fontSize: 10.5 },
  fermer: { paddingLeft: 2 },
  fermerGlyphe: { color: CREME, fontSize: 14, opacity: 0.8 },
});
