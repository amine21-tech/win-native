import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError } from '../api/client';
import { radius, spacing, type Palette } from '../theme';

/**
 * SUPPRIMER OU DECLASSER UNE ADRESSE VIP — point B du 18 novembre.
 *
 * << 2 actions possibles via code 0000 : (1) Supprimer definitivement ; (2) Declasser en
 * adresse normale — garde l'adresse, retire uniquement le statut VIP. >>
 *
 * CE QU'IL Y AVAIT AVANT, ET POURQUOI C'ETAIT UN MUR. Devant une fiche partenaire, le bouton
 * de retrait expliquait poliment qu'elle << appartient a un partenaire WIN >> et proposait de
 * signaler une erreur. C'etait juste — une fiche payee ne se retire pas d'un appui distrait —
 * mais cela ne laissait AUCUN moyen d'agir a ceux qui en ont le droit. Le code ouvre cette
 * porte, et seulement elle.
 *
 * POURQUOI DEUX ACTIONS ET NON UNE. Un partenaire qui ne renouvelle pas garde un commerce,
 * une adresse, un numero. Supprimer la fiche ferait perdre a la carte une information vraie et
 * obligerait quelqu'un a la ressaisir. Le declassement retire ce qui a ete vendu — le statut
 * et l'encart promotionnel — et laisse le reste. C'est le geste courant ; la suppression est
 * l'exception.
 *
 * L'ORDRE DES BOUTONS LE DIT : le declassement en premier, en orange ; la suppression ensuite,
 * en rouge. Le document les donne dans l'ordre inverse, mais il decrit deux options sans dire
 * laquelle on fait le plus souvent — et au doigt, le premier bouton est celui qu'on appuie.
 */

const ROUGE = '#D32F2F';
const ORANGE = '#E65100';

export function VipActionSheet({
  visible,
  placeId,
  placeName,
  colors,
  onClose,
  onFait,
}: {
  visible: boolean;
  /** Identifiant de la fiche WIN. `null` ferme la feuille : rien a faire sans elle. */
  placeId: string | null;
  placeName: string;
  colors: Palette;
  onClose: () => void;
  /** Appele apres une action reussie, avec ce qui a ete fait : l'ecran se rafraichit. */
  onFait: (action: 'supprimer' | 'declasser') => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<'supprimer' | 'declasser' | null>(null);

  const fermer = () => {
    setCode('');
    setErreur(null);
    setEnCours(null);
    onClose();
  };

  const agir = async (action: 'supprimer' | 'declasser') => {
    if (!placeId || enCours) return;
    setErreur(null);
    setEnCours(action);
    try {
      await api(`/places/${placeId}/vip-action`, { method: 'POST', body: { code, action } });
      setCode('');
      setEnCours(null);
      onFait(action);
    } catch (e) {
      /* LE MESSAGE DU SERVEUR EST DEJA EN FRANCAIS et dit ce qui ne va pas — code faux, fiche
       * disparue, trop d'essais. On l'affiche tel quel plutot que d'en inventer un autre qui
       * dirait moins. */
      setErreur(e instanceof ApiError ? e.message : t('place.vipActionFailed'));
      setEnCours(null);
    }
  };

  /* QUATRE CHIFFRES EXACTEMENT. On n'active les boutons qu'a partir de la, plutot que de
   * laisser partir une requete qui sera refusee : chaque essai consomme la limite par adresse
   * IP qui protege un code a quatre chiffres. */
  const pret = code.length >= 4 && placeId !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={fermer}>
      <Pressable style={styles.fond} onPress={fermer}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.feuille,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.lg },
          ]}
        >
          <View style={styles.poignee} />

          <Text style={[styles.titre, { color: colors.text }]} numberOfLines={2}>
            {t('place.vipManageTitle', { name: placeName })}
          </Text>
          <Text style={[styles.sous, { color: colors.textMuted }]}>
            {t('place.vipManageBody')}
          </Text>

          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/[^0-9]/g, '').slice(0, 8));
              setErreur(null);
            }}
            /* MASQUE ET NUMERIQUE, comme le document le demande : le clavier s'ouvre sur les
             * chiffres, et le code ne s'affiche pas en clair au-dessus d'une epaule. */
            secureTextEntry
            keyboardType="number-pad"
            placeholder="● ● ● ●"
            placeholderTextColor={colors.textMuted}
            style={[styles.champ, { borderColor: colors.border, color: colors.text }]}
            accessibilityLabel={t('place.vipManageBody')}
          />

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          {/* LE DECLASSEMENT D'ABORD : c'est le geste courant. Voir la note en tete. */}
          <Pressable
            onPress={() => void agir('declasser')}
            disabled={!pret || enCours !== null}
            accessibilityRole="button"
            style={[styles.bouton, { backgroundColor: ORANGE }, !pret && styles.inactif]}
          >
            {enCours === 'declasser' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.boutonTexte}>⬇  {t('place.vipDowngrade')}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => void agir('supprimer')}
            disabled={!pret || enCours !== null}
            accessibilityRole="button"
            style={[styles.bouton, { backgroundColor: ROUGE }, !pret && styles.inactif]}
          >
            {enCours === 'supprimer' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.boutonTexte}>🗑  {t('place.vipDelete')}</Text>
            )}
          </Pressable>

          <Pressable onPress={fermer} accessibilityRole="button" style={styles.annuler}>
            <Text style={[styles.annulerTexte, { color: colors.textMuted }]}>
              {t('addPlace.cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  feuille: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  poignee: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C9D4CE',
    marginBottom: spacing.md,
  },
  titre: { fontSize: 16, fontWeight: '800' as const, marginBottom: 4 },
  sous: { fontSize: 13, marginBottom: spacing.md },
  champ: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  erreur: { color: ROUGE, fontSize: 13, fontWeight: '700' as const, marginBottom: spacing.sm },
  /* Coins a 12, comme le document. Hauteur confortable : ces deux boutons se touchent une fois
   * par an, et une erreur de visee coute cher. */
  bouton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  boutonTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' as const },
  inactif: { opacity: 0.4 },
  annuler: { alignItems: 'center', paddingVertical: spacing.sm },
  annulerTexte: { fontSize: 14, fontWeight: '700' as const },
});
