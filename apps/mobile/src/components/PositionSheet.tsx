import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { reverseGeocode } from '../search/geocode';
import { lienPosition, messagePartagePosition, type Language } from '../shared';
import { radius, spacing } from '../theme';

/**
 * PARTAGE D'UNE POSITION — point 19 du client, synthese du 29 octobre.
 *
 * Un appui long sur la carte ouvre ce panneau : coordonnees, adresse resolue, et trois facons
 * de les envoyer — WhatsApp, SMS, presse-papier.
 *
 * POURQUOI LE BOUTON << AJOUTER CE LIEU >> EST ENCORE LA. L'appui long servait deja a ajouter
 * un lieu, et c'est un droit ouvert a tout le monde depuis une decision explicite. Le point 19
 * reclame le meme geste pour autre chose. Plutot que de choisir — et de retirer a tous les
 * contributeurs le seul chemin d'ajout depuis la carte —, le panneau porte les deux : il
 * repond d'abord a << ou est-ce ? >>, et laisse l'ajout a un appui de plus. Personne ne perd
 * rien, et le geste reste unique.
 *
 * L'ADRESSE EST CHERCHEE APRES L'OUVERTURE, pas avant. Le geocodage inverse demande un aller
 * et retour reseau : attendre sa reponse pour afficher le panneau ferait croire que l'appui
 * long ne fait rien. Les coordonnees, elles, sont connues immediatement — et elles suffisent a
 * partager. L'adresse vient s'ajouter quand elle arrive, ou ne vient pas.
 */

const VERT = '#0B5B2C';
const VERT_WHATSAPP = '#25D366';
const GRIS_SMS = '#4A4A4A';
const FOND = '#FFFFFF';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';
const PUCE = '#E2E7E4';

type Props = {
  coords: { lat: number; lon: number } | null;
  lang: Language;
  onClose: () => void;
  /** Ajouter ce point comme lieu : l'ancien comportement de l'appui long, conserve. */
  onAjouter: (coords: { lat: number; lon: number }) => void;
  /** Message bref apres une copie — l'ecran principal tient le bandeau. */
  onToast: (message: string) => void;
};

export function PositionSheet({ coords, lang, onClose, onAjouter, onToast }: Props) {
  const { t } = useTranslation();
  const [adresse, setAdresse] = useState<string | null>(null);
  const [cherche, setCherche] = useState(false);

  useEffect(() => {
    if (!coords) {
      setAdresse(null);
      return;
    }
    let vivant = true;
    setAdresse(null);
    setCherche(true);
    void reverseGeocode(coords.lat, coords.lon, lang)
      .then((r) => {
        // Le panneau a pu etre ferme, ou deplace ailleurs, pendant l'aller-retour reseau.
        if (vivant) setAdresse(r?.displayName ?? null);
      })
      .finally(() => {
        if (vivant) setCherche(false);
      });
    return () => {
      vivant = false;
    };
  }, [coords, lang]);

  if (!coords) return null;

  const message = messagePartagePosition({
    titre: t('share.title'),
    libelleAdresse: t('share.addressLabel'),
    adresse,
    lat: coords.lat,
    lon: coords.lon,
  });

  const whatsapp = () => {
    /* `wa.me/?text=` sans numero ouvre le choix du destinataire dans WhatsApp : on partage une
     * position avec quelqu'un qu'on choisit a ce moment-la, pas avec un numero connu d'avance. */
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
  };

  const sms = () => {
    /* `smsto:` sans numero ouvre de meme l'application de messages avec le texte pret. Le
     * point-virgule apres `smsto:` est exige par Android pour separer le numero, meme vide. */
    void Linking.openURL(`smsto:?body=${encodeURIComponent(message)}`);
  };

  const copier = async () => {
    await Clipboard.setStringAsync(message);
    onToast(t('share.copied'));
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.voile} onPress={onClose} />

      <View style={styles.bas} pointerEvents="box-none">
        <View style={styles.feuille}>
          <View style={styles.poignee} />

          <Text style={styles.titre}>📍  {t('share.title')}</Text>

          {/* L'ADRESSE, ou son absence assumee. Trois etats, et chacun dit la verite : on
              cherche, on a trouve, on n'a pas trouve. Laisser la ligne vide dans le dernier
              cas ferait douter des coordonnees, qui sont pourtant exactes. */}
          {cherche ? (
            <View style={styles.adresseLigne}>
              <ActivityIndicator size="small" color={VERT} />
              <Text style={styles.adresseCherche}>{t('share.locating')}</Text>
            </View>
          ) : adresse ? (
            <Text style={styles.adresse} numberOfLines={3}>
              {adresse}
            </Text>
          ) : (
            <Text style={styles.adresseCherche}>{t('share.addressUnknown')}</Text>
          )}

          {/* LES COORDONNEES SONT SELECTIONNABLES : on les recopie parfois a la main, dans un
              message deja commence ailleurs. */}
          <View style={styles.coordsCadre}>
            <Text style={styles.coords} selectable>
              {t('share.lat')} {coords.lat.toFixed(5)}
            </Text>
            <Text style={styles.coords} selectable>
              {t('share.lon')} {coords.lon.toFixed(5)}
            </Text>
            <Text style={styles.lien} numberOfLines={1} selectable>
              {lienPosition(coords.lat, coords.lon)}
            </Text>
          </View>

          <View style={styles.canaux}>
            <Canal
              libelle={t('share.whatsapp')}
              emoji="💬"
              fond={VERT_WHATSAPP}
              onPress={whatsapp}
            />
            <Canal libelle={t('share.sms')} emoji="✉️" fond={GRIS_SMS} onPress={sms} />
            <Canal libelle={t('share.copy')} emoji="📋" fond={VERT} onPress={() => void copier()} />
          </View>

          {/* L'ANCIEN USAGE DE L'APPUI LONG, conserve : voir la note en tete de fichier. */}
          <Pressable
            onPress={() => {
              onAjouter(coords);
              onClose();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.ajouter, { backgroundColor: pressed ? PUCE : 'transparent' }]}
          >
            <Text style={styles.ajouterTexte}>➕  {t('share.addPlace')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Canal({
  libelle,
  emoji,
  fond,
  onPress,
}: {
  libelle: string;
  emoji: string;
  fond: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      style={({ pressed }) => [styles.canal, { backgroundColor: fond, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.canalEmoji}>{emoji}</Text>
      <Text style={styles.canalTexte} numberOfLines={1}>
        {libelle}
      </Text>
    </Pressable>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  poignee: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: PUCE,
    marginBottom: spacing.sm,
  },
  titre: { color: TEXTE, fontSize: 17, fontWeight: '800' as const },

  adresseLigne: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  adresse: { color: TEXTE, fontSize: 14, lineHeight: 19 },
  adresseCherche: { color: TEXTE_DOUX, fontSize: 13, fontStyle: 'italic' },

  coordsCadre: {
    backgroundColor: '#F3F4F6',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  coords: { color: TEXTE, fontSize: 14, fontWeight: '700' as const, fontVariant: ['tabular-nums'] },
  lien: { color: TEXTE_DOUX, fontSize: 11, marginTop: 4 },

  canaux: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  canal: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  canalEmoji: { fontSize: 18 },
  canalTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },

  ajouter: {
    borderWidth: 1.5,
    borderColor: VERT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  ajouterTexte: { color: VERT, fontSize: 14, fontWeight: '800' as const },
});
