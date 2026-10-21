import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuranPlayer } from '../quran/player';
import { RECITATEUR, RECITATIONS } from '../quran/recitations';
import { fonts, radius, spacing } from '../theme';

/* Les couleurs de l'ecran Qibla, et non celles du theme general : cette section vit dans le
 * panneau vert sombre et doit en faire partie, pas y etre posee. */
const OR = '#E6C66B';
const OR_PALE = '#F5E3A8';
const CREME = '#EFE7CF';
const FOND_LIGNE = 'rgba(255,255,255,0.045)';
const BORD_LIGNE = 'rgba(230,198,107,0.18)';

/**
 * Recitations du Coran, sous la boussole.
 *
 * Elles ne sont pas la par hasard a cet endroit : on ouvre cet ecran avant la priere, et c'est
 * le seul moment de l'application ou l'on s'arrete. Mettre les sourates ailleurs — dans le menu,
 * dans un onglet — aurait fait une fonction de plus a chercher ; ici, elles sont sous la main au
 * moment ou l'on en a l'usage.
 *
 * Rien n'est telecharge : le serveur accepte la lecture par morceaux, et Al-Baqara pese plus de
 * cent megaoctets. Sur un forfait algerien, la difference n'est pas un detail.
 *
 * CE COMPOSANT NE TIENT PLUS LE LECTEUR. Il l'a tenu, et c'etait la cause de deux defauts : la
 * recitation s'arretait des qu'on quittait l'ecran, et la liberation du lecteur au demontage
 * rendait l'ecran blanc. Le lecteur vit desormais dans quran/player, hors de tout ecran — ce
 * qui permet aussi de reduire la Qibla et de continuer a ecouter en conduisant.
 */
export function QuranSection() {
  const { t } = useTranslation();

  /* Tout l'etat vit AILLEURS, et c'est le point de ce changement. Ce composant ne fait plus
   * que l'afficher : le lecteur appartient au module quran/player, qui survit a la fermeture
   * du panneau. Voir le commentaire en tete de ce fichier-la. */
  const enCours = useQuranPlayer((s) => s.enCours);
  const joue = useQuranPlayer((s) => s.joue);
  const charge = useQuranPlayer((s) => s.charge);
  const basculer = useQuranPlayer((s) => s.basculer);

  return (
    <View style={styles.bloc}>
      <View style={styles.entete}>
        <Text style={styles.titre}>🎧 {t('qibla.quran')}</Text>
        <View style={styles.recitateur}>
          <Text style={styles.recitateurText}>{RECITATEUR}</Text>
        </View>
      </View>

      {RECITATIONS.map((r) => {
        const active = enCours?.numero === r.numero;
        const enAttente = active && charge;
        return (
          <Pressable
            key={r.numero}
            onPress={() => basculer(r)}
            accessibilityRole="button"
            accessibilityLabel={`${r.latin} — ${r.duree}`}
            style={({ pressed }) => [
              styles.ligne,
              { borderColor: active ? OR : BORD_LIGNE, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            {/* Le numero de sourate, comme sur un mushaf. Les trois protectrices n'en ont pas
                un seul : elles portent une etoile. */}
            <View style={styles.numero}>
              <Text style={styles.numeroText}>
                {r.suite || r.fichierLocal ? '✦' : String(r.numero).padStart(3, '0')}
              </Text>
            </View>

            <View style={styles.noms}>
              <Text style={styles.arabe} numberOfLines={1}>
                {r.arabe}
              </Text>
              <Text style={styles.latin} numberOfLines={1}>
                {r.latin}
              </Text>
            </View>

            <Text style={styles.duree}>{r.duree}</Text>

            <View style={[styles.bouton, active && styles.boutonActif]}>
              {enAttente ? (
                <ActivityIndicator size="small" color={active ? '#0D3A2B' : OR_PALE} />
              ) : (
                <Text style={[styles.boutonGlyphe, active && { color: '#0D3A2B' }]}>
                  {active && joue ? '❚❚' : '▶'}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { marginTop: spacing.lg },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  titre: { color: CREME, fontFamily: fonts.sansBold, fontSize: 15 },
  recitateur: {
    borderWidth: 1,
    borderColor: 'rgba(120,220,170,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  recitateurText: { color: '#8FE3B4', fontSize: 11.5, fontWeight: '700' as const },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: FOND_LIGNE,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  numero: {
    width: 38,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroText: { color: OR_PALE, fontSize: 11.5, fontWeight: '800' as const, letterSpacing: 0.4 },
  // Le nom arabe est aligne a DROITE : c'est le sens de lecture de ce qu'il ecrit.
  noms: { flex: 1 },
  arabe: { color: CREME, fontSize: 17, textAlign: 'right', lineHeight: 24 },
  latin: { color: 'rgba(239,231,207,0.62)', fontSize: 11.5 },
  duree: { color: 'rgba(239,231,207,0.42)', fontSize: 11 },
  bouton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORD_LIGNE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonActif: { backgroundColor: OR, borderColor: OR },
  boutonGlyphe: { color: OR_PALE, fontSize: 13 },
});
