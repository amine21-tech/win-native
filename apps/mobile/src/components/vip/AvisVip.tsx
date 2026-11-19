import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import {
  AVIS_MIN,
  NOTE_MAX,
  avisAffichables,
  etoiles,
  formatNote,
  genreAvis,
} from '../../place/avis';
import { radius, spacing, typography, type Palette } from '../../theme';

/**
 * ETOILES ET AVIS — amelioration 5 de la synthese « Fiche VIP Premium ».
 *
 * « Le signal de confiance le plus fort dans les apps de navigation », dit le client, et les
 * deux conditions qu'il pose sont tenues a la lettre : visible uniquement sur une fiche
 * partenaire, et seulement a partir de trois avis.
 *
 * LA DEUXIEME MOITIE DE CE COMPOSANT N'EST PAS DANS LE DOCUMENT, et il faut le dire.
 * La synthese decrit l'affichage de la note, et suppose la table des avis deja pleine. Sans
 * aucun moyen d'en deposer un, aucune fiche de WIN n'atteindrait jamais trois avis : le bloc
 * aurait ete ecrit, teste, et invisible sur chaque fiche de l'application. C'est mot pour mot le
 * defaut trouve le 18 novembre sur le rayon VIP — une fonction juste, sans effet dans la
 * situation pour laquelle elle avait ete demandee. Les cinq etoiles sont donc TOUCHABLES, et
 * c'est le minimum pour que l'amelioration 5 existe un jour a l'ecran.
 *
 * SOUS LE SEUIL, ON N'AFFICHE PAS LA NOTE MAIS ON PROPOSE DE NOTER. C'est l'inverse qui serait
 * absurde : cacher entierement le bloc tant qu'il n'y a pas trois avis garantit qu'il n'y en
 * aura jamais trois. On montre donc une invitation discrete, sans chiffre — personne ne voit
 * « 5,0 » appuye sur un seul avis, et le premier qui note sait qu'il sert a quelque chose.
 */

type Props = {
  placeId: string | undefined;
  estPartenaire: boolean;
  categorie: string | null | undefined;
  note: number | null | undefined;
  nombre: number | null | undefined;
  colors: Palette;
};

export function AvisVip({ placeId, estPartenaire, categorie, note, nombre, colors }: Props) {
  const { t } = useTranslation();
  /* L'etat local prend le pas sur la valeur du serveur une fois qu'on a note : la fiche n'est
   * pas rechargee, et celui qui vient d'appuyer doit voir son avis compte immediatement. Sans
   * cela, le geste n'a aucune reponse visible et l'on appuie une seconde fois. */
  const [local, setLocal] = useState<{ note: number | null; nombre: number } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [maNote, setMaNote] = useState<number | null>(null);
  const [erreur, setErreur] = useState(false);

  /* LE BLOC ENTIER EST RESERVE AUX FICHES PARTENAIRES — la condition du document. Une fiche
   * ordinaire ne montre ni note, ni invitation a noter : c'est ce qui fait de ce bloc un
   * avantage vendu, et non une fonction de l'application. */
  if (!estPartenaire || !placeId) return null;

  const noteCourante = local ? local.note : (note ?? null);
  const nombreCourant = local ? local.nombre : (nombre ?? 0);
  const afficheNote = avisAffichables(estPartenaire, nombreCourant) && noteCourante != null;

  const noter = async (valeur: number) => {
    if (envoi) return;
    setEnvoi(true);
    setErreur(false);
    try {
      const r = await api<{ ok: boolean; avisNote: number | null; avisCount: number }>(
        `/places/${placeId}/avis`,
        { method: 'POST', body: { note: valeur } },
      );
      setLocal({ note: r.avisNote, nombre: r.avisCount });
      setMaNote(valeur);
    } catch {
      /* On ne remet pas l'etoile en place en silence : l'utilisateur a vu son geste pris en
       * compte, et un retour sans explication se lit comme un bug. */
      setErreur(true);
    } finally {
      setEnvoi(false);
    }
  };

  const mot = genreAvis(categorie);
  const libelleNombre =
    mot === 'patients'
      ? t('place.reviewsPatients', { count: nombreCourant })
      : mot === 'clients'
        ? t('place.reviewsClients', { count: nombreCourant })
        : t('place.reviewsNeutral', { count: nombreCourant });

  return (
    <View style={[styles.cadre, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      {afficheNote ? (
        <View style={styles.ligneNote}>
          <Etoiles note={noteCourante!} colors={colors} />
          <Text style={[styles.nombre, { color: colors.gold500 }]}>{formatNote(noteCourante!)}</Text>
          <Text style={[styles.compte, { color: colors.textMuted }]} numberOfLines={1}>
            · {libelleNombre}
          </Text>
        </View>
      ) : (
        /* Sous le seuil : pas de chiffre, et on dit pourquoi. « Soyez le premier a donner un
         * avis » est plus honnete qu'un « 5,0 » appuye sur une seule voix, et c'est la seule
         * façon d'arriver un jour aux trois avis que le client exige. */
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {nombreCourant > 0
            ? t('place.reviewsBelowThreshold', { count: nombreCourant, min: AVIS_MIN })
            : t('place.reviewsNone')}
        </Text>
      )}

      {/* NOTER. Les cinq etoiles touchables restent sous la note : on lit d'abord ce que
          pensent les autres, on donne son avis ensuite. */}
      <View style={styles.ligneNoter}>
        <Text style={[styles.inviteNoter, { color: colors.textMuted }]} numberOfLines={1}>
          {maNote != null ? t('place.yourRating', { n: maNote }) : t('place.rateThis')}
        </Text>
        <View style={styles.etoilesTouchables}>
          {Array.from({ length: NOTE_MAX }, (_, i) => i + 1).map((v) => (
            <Pressable
              key={v}
              onPress={() => void noter(v)}
              disabled={envoi}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('place.rateStars', { n: v })}
              style={styles.etoileTouchable}
            >
              <Text
                style={[
                  styles.glypheTouchable,
                  { color: maNote != null && v <= maNote ? colors.gold300 : colors.border },
                ]}
              >
                ★
              </Text>
            </Pressable>
          ))}
        </View>
        {envoi ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      {erreur ? (
        <Text style={[typography.caption, { color: colors.danger }]}>{t('place.rateFailed')}</Text>
      ) : null}
    </View>
  );
}

/**
 * LES CINQ ETOILES D'AFFICHAGE, pleine / demie / vide.
 *
 * La demie est rendue par SUPERPOSITION et non par un glyphe « ★ a moitie » — il n'en existe
 * pas : une etoile vide, et par-dessus la meme etoile pleine recoupee a la moitie de sa
 * largeur. C'est ce qui permet a 4,7 de se lire quatre etoiles et demie, au lieu de cinq
 * pleines posees au-dessus du chiffre « 4,7 » qui les contredit.
 */
function Etoiles({ note, colors }: { note: number; colors: Palette }) {
  return (
    <View style={styles.etoiles}>
      {etoiles(note).map((etat, i) => (
        <View key={i} style={styles.etoileBoite}>
          <Text style={[styles.glyphe, { color: colors.border }]}>★</Text>
          {etat !== 'vide' ? (
            <View style={[styles.moitie, etat === 'pleine' ? styles.entiere : null]}>
              <Text style={[styles.glyphe, { color: colors.gold300 }]}>★</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const TAILLE_ETOILE = 15;

const styles = StyleSheet.create({
  cadre: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    gap: 6,
  },
  ligneNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nombre: { fontSize: 17, fontWeight: '800' as const, fontVariant: ['tabular-nums'] },
  compte: { flex: 1, fontSize: 12.5 },

  etoiles: { flexDirection: 'row', gap: 1 },
  etoileBoite: { width: TAILLE_ETOILE + 1, height: TAILLE_ETOILE + 4 },
  glyphe: { fontSize: TAILLE_ETOILE, lineHeight: TAILLE_ETOILE + 4 },
  /* `overflow: hidden` sur la moitie gauche : c'est lui qui coupe l'etoile doree en deux. */
  moitie: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: (TAILLE_ETOILE + 1) / 2,
    overflow: 'hidden',
  },
  entiere: { width: TAILLE_ETOILE + 1 },

  ligneNoter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inviteNoter: { flex: 1, fontSize: 11.5 },
  etoilesTouchables: { flexDirection: 'row', gap: 2 },
  etoileTouchable: { paddingHorizontal: 2 },
  glypheTouchable: { fontSize: 19, lineHeight: 23 },
});
