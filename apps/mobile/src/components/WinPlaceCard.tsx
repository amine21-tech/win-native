import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SelectedPlace } from './PlaceSheet';
import { photoSource } from '../place/placePhoto';
import { formatDistance } from '../shared';
import { fonts, radius, spacing, typography, type Palette } from '../theme';

type Props = {
  place: SelectedPlace;
  colors: Palette;
  /** Photo affichee, deja choisie par la fiche (galerie du contributeur). */
  photo: string | null;
  photoState: 'loading' | 'ok' | 'failed';
  onPhotoLoad: () => void;
  onPhotoError: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** L'utilisateur a-t-il le droit de corriger et de retirer cette fiche ? Ne commande plus
   * que le crayon pose sur la photo : le bouton « Gerer cette fiche », lui, est pour tous. */
  peutGerer: boolean;
  hasUserPosition: boolean;
  onStart: () => void;
  /** Ouvre directement le formulaire de correction (crayon sur la photo). */
  onEdit: () => void;
  /** Ouvre le panneau des trois actions. */
  onManage: () => void;
};

/**
 * LA FICHE D'UN LIEU ENREGISTRE PAR UN UTILISATEUR WIN — maquette validee du client.
 *
 * Elle existe a cote de la fiche generale, et non a sa place, parce que les deux repondent a
 * des questions differentes. Devant un restaurant trouve dans OpenStreetMap, on compare : duree,
 * itineraires, variantes, horaires. Devant une adresse qu'on a soi-meme enregistree — la maison
 * d'un cousin, un atelier, une salle des fetes —, il n'y a rien a comparer : on sait ou l'on va,
 * on veut partir, et de temps en temps corriger ce qu'on avait saisi trop vite.
 *
 * D'ou la contrainte que le client pose en toutes lettres et qui commande tout le reste : TOUT
 * DOIT TENIR SUR UN ECRAN, sans defilement. Chaque element gagne donc sa place —
 *
 *   la photo, parce qu'elle sert a reconnaitre l'endroit quand le nom ne suffit pas ;
 *   les coordonnees et leur bouton << Copier >>, parce que c'est ainsi qu'on envoie une adresse
 *     a quelqu'un par message, et qu'elles etaient jusqu'ici introuvables depuis la fiche ;
 *   la distance, qui dit en un chiffre si l'on y va a pied ou en voiture ;
 *   << C'est parti >>, large et plein, le geste pour lequel on a ouvert la fiche ;
 *   corriger et supprimer cote a cote, parce qu'ils vont ensemble — qui ouvre l'un envisage
 *     souvent l'autre.
 *
 * Les fiches PARTENAIRES gardent la fiche generale : elles portent un telephone, un WhatsApp,
 * une promotion, et les resumer serait leur retirer ce pour quoi elles ont ete payees.
 */
export function WinPlaceCard({
  place,
  colors,
  photo,
  photoState,
  onPhotoLoad,
  onPhotoError,
  isFavorite,
  onToggleFavorite,
  peutGerer,
  hasUserPosition,
  onStart,
  onEdit,
  onManage,
}: Props) {
  const { t } = useTranslation();
  const [copie, setCopie] = useState(false);

  /* Six decimales : environ dix centimetres. C'est la precision qu'attend un autre telephone
   * quand on lui colle ces chiffres, et le format que comprennent Google Maps comme Waze. */
  const coordonnees = `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`;

  const copier = () => {
    void Clipboard.setStringAsync(coordonnees);
    setCopie(true);
    // Le bouton dit lui-meme que c'est fait, puis redevient ce qu'il etait. Pas de message
    // ailleurs sur l'ecran : la reponse doit arriver la ou le doigt vient d'appuyer.
    setTimeout(() => setCopie(false), 1800);
  };

  return (
    <View>
      {photo && photoState !== 'failed' ? (
        <View style={[styles.photoBox, { backgroundColor: colors.surfaceAlt }]}>
          <Image
            key={photo}
            source={photoSource(photo)}
            style={styles.photo}
            resizeMode="cover"
            onLoad={onPhotoLoad}
            onError={onPhotoError}
          />
          {photoState === 'loading' ? (
            <View style={[StyleSheet.absoluteFill, styles.photoLoading]}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}
          {/* La photo est MODIFIABLE, et il faut que cela se voie sans l'expliquer : un crayon
              pose dessus suffit. Il mene au meme formulaire que << Modifier cette adresse >>. */}
          {peutGerer ? (
            <Pressable
              onPress={onEdit}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('place.changePhoto')}
              style={styles.photoEdit}
            >
              <Text style={styles.photoEditGlyph}>✎</Text>
            </Pressable>
          ) : null}
        </View>
      ) : peutGerer ? (
        /* Sans photo, un cadre qui invite a en mettre une plutot qu'un vide. Une fiche de
         * contributeur sans photo est une fiche qu'on reconnait mal sur le terrain. */
        <Pressable
          onPress={onEdit}
          style={[styles.photoVide, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={[styles.photoVideText, { color: colors.textMuted }]}>
            📷  {t('place.addPhoto')}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {place.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? t('place.favoriteRemove') : t('place.favoriteAdd')}
          onPress={onToggleFavorite}
          style={[styles.favBtn, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ fontSize: 18, color: isFavorite ? colors.danger : colors.textMuted }}>
            {isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>

      <Text style={[typography.body, styles.address, { color: colors.textMuted }]} numberOfLines={2}>
        {place.distanceM != null ? `${formatDistance(place.distanceM)} (${t('place.distanceAirline')}) · ` : ''}
        {place.displayName}
      </Text>

      <Text style={[styles.tag, { color: colors.alert, backgroundColor: colors.gold + '22' }]}>
        {t('place.addedByWin')}
      </Text>

      {/* COORDONNEES ET << COPIER >>. Elles sont dans un cadre a part, en chiffres fixes : ce
          sont des donnees qu'on relit et qu'on transmet, pas une phrase. */}
      <View style={[styles.gpsBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <View style={styles.gpsTexts}>
          <Text style={[styles.gpsLabel, { color: colors.textMuted }]}>📍 {t('place.gpsCoords')}</Text>
          <Text style={[styles.gpsValue, { color: colors.text }]} numberOfLines={1}>
            {coordonnees}
          </Text>
        </View>
        <Pressable
          onPress={copier}
          accessibilityRole="button"
          accessibilityLabel={t('place.copy')}
          style={({ pressed }) => [
            styles.copyBtn,
            { borderColor: colors.accent, backgroundColor: copie || pressed ? colors.accent : 'transparent' },
          ]}
        >
          <Text style={[styles.copyText, { color: copie ? colors.accentText : colors.accent }]}>
            {copie ? `✓ ${t('place.copied')}` : t('place.copy')}
          </Text>
        </Pressable>
      </View>

      {hasUserPosition ? (
        <Pressable onPress={onStart} style={[styles.startBtn, { backgroundColor: colors.accent }]}>
          <Text style={styles.startBtnText}>➤ {t('nav.start')}</Text>
        </Pressable>
      ) : null}

      {/* UNE SEULE PORTE, ET ELLE EST OUVERTE A TOUS.
          Les deux boutons precedents n'apparaissaient qu'a l'auteur de la fiche ou a un
          contributeur : un utilisateur ordinaire qui passait devant une adresse fausse ne
          voyait rien du tout. Ce bouton-ci s'affiche pour tout le monde et mene aux trois
          actions (signaler, corriger, retirer) — voir ManagePlaceSheet. */}
      <Pressable
        onPress={onManage}
        accessibilityRole="button"
        accessibilityLabel={t('place.manage')}
        style={({ pressed }) => [
          styles.gerer,
          { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
        ]}
      >
        <Text style={[styles.gererText, { color: colors.text }]} numberOfLines={1}>
          ⚙️  {t('place.manage')}
        </Text>
        <Text style={[styles.gererChevron, { color: colors.textMuted }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /* 150 et non 180 comme la fiche generale : ce sont les trente points qui manquaient pour que
   * les deux boutons du bas restent visibles sans defiler sur un telephone court. */
  photoBox: { width: '100%', height: 150, borderRadius: radius.lg, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  photoEdit: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEditGlyph: { color: '#fff', fontSize: 15, lineHeight: 17 },
  photoVide: {
    width: '100%',
    height: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoVideText: { fontSize: 13, fontWeight: '700' as const },

  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  name: { ...typography.destinationName, flex: 1, fontFamily: fonts.destinationName },
  favBtn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  address: { marginTop: 2 },
  tag: {
    ...typography.caption,
    alignSelf: 'flex-start',
    fontWeight: '700' as const,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },

  gpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  gpsTexts: { flex: 1, minWidth: 0 },
  gpsLabel: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.2 },
  // Chiffres a chasse fixe : deux coordonnees alignees se relisent, deux coordonnees
  // proportionnelles se devinent.
  gpsValue: { fontSize: 13.5, fontVariant: ['tabular-nums'], marginTop: 1 },
  copyBtn: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  copyText: { fontSize: 12, fontWeight: '800' as const },

  startBtn: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 16 },

  gerer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  gererText: { flex: 1, fontSize: 13.5, fontWeight: '700' as const },
  gererChevron: { fontSize: 20, fontWeight: '300' as const },
});
