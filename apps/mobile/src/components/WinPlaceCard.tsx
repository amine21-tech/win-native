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
  /** Ouvre directement le formulaire de correction (crayon sur la photo). */
  onEdit: () => void;
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
  onEdit,
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
          {/* « Photo ajoutee par un utilisateur WIN », pose EN BAS de l'image — maquette du
              client. Il dit d'ou vient ce qu'on regarde, ce qu'aucune photo ne dit d'elle-meme :
              une facade prise par un contributeur n'engage pas l'application de la meme facon
              qu'une image officielle, et l'utilisateur a le droit de le savoir avant de se
              fier a ce qu'il voit. */}
          <View style={styles.photoCredit}>
            <Text style={styles.photoCreditTexte} numberOfLines={1}>
              📷  {t('place.photoByUser')}
            </Text>
          </View>

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

    </View>
  );
}

/**
 * LES DEUX ACTIONS, EPINGLEES SOUS LA FICHE ET HORS DU DEFILEMENT.
 *
 * Elles etaient a la fin du contenu, donc emportees par le defilement : sur un telephone un
 * peu court, << Gerer cette fiche >> tombait sous le bord et n'apparaissait qu'en faisant
 * glisser la fiche. Le client l'a photographie coupe en deux, et il a raison — un bouton a
 * moitie visible ne se lit pas comme un bouton, il se lit comme un defaut.
 *
 * Les en sortir regle le probleme a la racine et pour tous les telephones, au lieu de grappiller
 * des points de hauteur ici et la en esperant que ca passe : quelle que soit la longueur du
 * nom, de l'adresse ou le nombre de lignes, << C'est parti >> et << Gerer cette fiche >> sont
 * la. Ce qui peut defiler, c'est ce qui se lit — la photo, l'adresse, les coordonnees.
 *
 * C'est aussi ce que font les applications de carte : les gestes restent sous le pouce, le
 * texte monte et descend derriere.
 */
export function WinPlaceActions({
  colors,
  hasUserPosition,
  onStart,
  onManage,
  onRequestPosition,
}: {
  colors: Palette;
  hasUserPosition: boolean;
  onStart: () => void;
  onManage: () => void;
  /** Demande une mesure GPS quand la position manque. Sans elle, le bouton reste informatif. */
  onRequestPosition?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.actions, { borderTopColor: colors.border }]}>
      {/* LE BOUTON NE DISPARAIT PLUS QUAND LA POSITION MANQUE.
          Il s'effaçait, et la fiche n'offrait alors plus aucune action : le client a vu « un
          simple point, aucun bouton pour cliquer ». Or la position manque pour des raisons
          banales et reparables — permission jamais accordee, GPS qui cherche encore, mode
          avion. Le bouton reste donc, et DIT ce qu'il attend : appuyer declenche une mesure
          au lieu de laisser l'utilisateur devant un ecran muet. */}
      <Pressable
        onPress={hasUserPosition ? onStart : onRequestPosition}
        disabled={!hasUserPosition && !onRequestPosition}
        style={[
          styles.startBtn,
          { backgroundColor: hasUserPosition ? colors.accent : colors.surfaceAlt },
        ]}
      >
        <Text style={[styles.startBtnText, hasUserPosition ? null : { color: colors.text }]}>
          {hasUserPosition ? `🧭  ${t('place.startRoute')}` : `📍 ${t('place.enableLocation')}`}
        </Text>
      </Pressable>

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
          { borderColor: colors.border, backgroundColor: pressed ? colors.border : colors.surfaceAlt },
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
  /* Le bandeau de credit : pose sur le bas de l'image, fond sombre translucide pour rester
   * lisible quelle que soit la photo — une facade claire avalerait un texte blanc pose nu. */
  photoCredit: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  photoCreditTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' as const },
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
  /* Gras ITALIQUE, valeur de la maquette : l'italique distingue le nom du lieu de l'adresse
   * qui le suit, laquelle est droite et grise. Deux lignes de texte sombre l'une sur l'autre
   * se lisaient comme un seul bloc. */
  name: {
    ...typography.destinationName,
    flex: 1,
    fontFamily: fonts.destinationName,
    fontStyle: 'italic',
  },
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

  /* La bande des actions. Un filet clair la separe de ce qui defile au-dessus : sans lui, le
   * texte qui passe derriere semblerait glisser SOUS les boutons sans raison. */
  actions: { paddingTop: spacing.md, marginTop: spacing.xs, borderTopWidth: 1 },
  startBtn: {
    marginTop: 0,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 16 },

  /* Un fond plein plutot qu'un contour vide, et de la hauteur : le client le decrivait comme
   * << mal encadre >>. Un bouton pose sur du blanc, en bas d'une fiche, a besoin d'une surface
   * pour exister — un simple filet le fait passer pour une ligne de texte. */
  gerer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  gererText: { flex: 1, fontSize: 14, fontWeight: '800' as const },
  gererChevron: { fontSize: 20, fontWeight: '300' as const },
});
