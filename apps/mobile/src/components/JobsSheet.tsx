import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../api/client';
import { formatDistance } from '../shared';
import { radius, spacing } from '../theme';

/**
 * MODULE EMPLOI — les offres autour de moi (point 11 du client, 27 octobre).
 *
 * Les couleurs et la forme viennent de la maquette validee : feuille blanche a angles de
 * 28 points, vert WIN pour ce qui agit, or pour la publication. Elles sont FIGEES et ne
 * suivent pas le theme de l'application — c'est la regle posee le 26 octobre apres un ecran
 * devenu illisible en mode nuit : la couleur d'un texte suit le fond SUR LEQUEL IL EST POSE.
 *
 * POURQUOI LES QUATRE CONTACTS SONT DES BOUTONS SEPARES, et non un seul numero a recopier.
 * Un chercheur d'emploi algerien n'appelle pas toujours : il ecrit sur WhatsApp, parfois sur
 * Viber, et garde le telephone pour la fin. Lui donner les quatre d'un geste, c'est la
 * difference entre une annonce qu'on contacte et une annonce qu'on regarde.
 */

const VERT = '#0B5B2C';
const OR = '#D4A017';
const FOND = '#FFFFFF';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';
const PUCE = '#F3F4F6';

/** Les sept secteurs, dans l'ordre de la maquette, avec le pictogramme de chacun. */
export const SECTEURS_EMPLOI = [
  { cle: 'btp', emoji: '🔧' },
  { cle: 'commerce', emoji: '🛒' },
  { cle: 'transport', emoji: '🚗' },
  { cle: 'restauration', emoji: '🍽' },
  { cle: 'industrie', emoji: '🏭' },
  { cle: 'bureaux', emoji: '💼' },
  { cle: 'services', emoji: '🏠' },
] as const;

export type JobOffer = {
  id: string;
  sector: string;
  title: string;
  company: string | null;
  contract: 'cdi' | 'cdd' | 'mission';
  salary: string | null;
  description: string | null;
  phone: string;
  whatsapp: string | null;
  viber: string | null;
  email: string | null;
  wilaya: string | null;
  lat: number;
  lon: number;
  distanceM: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  position: { lat: number; lon: number } | null;
  /** Lance la navigation WIN vers une offre. */
  onNavigate: (offre: JobOffer) => void;
  onPublish: () => void;
};

const tel = (n: string) => void Linking.openURL(`tel:${n.replace(/\s+/g, '')}`);
const whatsapp = (n: string) => void Linking.openURL(`https://wa.me/${n.replace(/[^0-9]/g, '')}`);
/* Viber attend le numero au format international, sans le signe plus : `viber://chat?number=`
 * ignore silencieusement un numero mal forme, sans erreur ni message. */
const viber = (n: string) => void Linking.openURL(`viber://chat?number=${n.replace(/[^0-9]/g, '')}`);
const mail = (a: string) => void Linking.openURL(`mailto:${a}`);

export function JobsSheet({ visible, onClose, position, onNavigate, onPublish }: Props) {
  const { t } = useTranslation();
  const [secteur, setSecteur] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['jobs', position?.lat, position?.lon, secteur],
    enabled: visible && position != null,
    queryFn: () =>
      api<{ items: JobOffer[]; radiusM: number }>(
        `/jobs?lat=${position!.lat}&lon=${position!.lon}${secteur ? `&sector=${secteur}` : ''}`,
      ),
  });

  const offres = useMemo(() => query.data?.items ?? [], [query.data]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.voile} onPress={onClose} />

      <View style={styles.bas} pointerEvents="box-none">
        <View style={styles.feuille}>
          <View style={styles.tete}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.titre}>{t('jobs.title')}</Text>
              <Text style={styles.sousTitre}>{t('jobs.radius')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.fermer}>✕</Text>
            </Pressable>
          </View>

          {/* FILTRES EN CHIPS DEFILANTS, comme la maquette. Horizontal et non une grille : sept
              secteurs plus « Tous » prendraient trois lignes au-dessus de la liste, et
              repousseraient les offres hors de l'ecran. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            <Chip actif={secteur === null} libelle={t('jobs.all')} onPress={() => setSecteur(null)} />
            {SECTEURS_EMPLOI.map((s) => (
              <Chip
                key={s.cle}
                actif={secteur === s.cle}
                libelle={`${s.emoji}  ${t(`jobs.sector.${s.cle}`)}`}
                onPress={() => setSecteur(s.cle)}
              />
            ))}
          </ScrollView>

          <ScrollView style={styles.liste} keyboardShouldPersistTaps="handled">
            {position == null ? (
              <Text style={styles.vide}>{t('jobs.needPosition')}</Text>
            ) : query.isLoading ? (
              <ActivityIndicator color={VERT} style={{ marginTop: spacing.lg }} />
            ) : query.isError ? (
              <Text style={styles.vide}>{t('errors.unknown')}</Text>
            ) : offres.length === 0 ? (
              <Text style={styles.vide}>{t('jobs.empty')}</Text>
            ) : (
              offres.map((o) => <CarteOffre key={o.id} offre={o} onNavigate={onNavigate} />)
            )}
            <View style={{ height: 88 }} />
          </ScrollView>

          {/* FAB OR — « Publier une offre », l'acces employeur. Pose PAR-DESSUS la liste et non
              a la suite : c'est le geste qu'un employeur vient chercher, et il ne doit pas avoir
              a faire defiler cinquante annonces pour le trouver. */}
          <Pressable
            onPress={onPublish}
            accessibilityRole="button"
            style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.88 : 1 }]}
          >
            <Text style={styles.fabTexte}>＋  {t('jobs.publish')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ actif, libelle, onPress }: { actif: boolean; libelle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      style={[styles.chip, actif ? styles.chipActif : null]}
    >
      <Text style={[styles.chipTexte, actif ? styles.chipTexteActif : null]} numberOfLines={1}>
        {libelle}
      </Text>
    </Pressable>
  );
}

function CarteOffre({ offre, onNavigate }: { offre: JobOffer; onNavigate: (o: JobOffer) => void }) {
  const { t } = useTranslation();
  const emoji = SECTEURS_EMPLOI.find((s) => s.cle === offre.sector)?.emoji ?? '💼';

  return (
    <View style={styles.carte}>
      <View style={styles.carteTete}>
        <Text style={styles.carteEmoji}>{emoji}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.carteTitre} numberOfLines={2}>
            {offre.title}
          </Text>
          {offre.company ? (
            <Text style={styles.carteEntreprise} numberOfLines={1}>
              {offre.company}
            </Text>
          ) : null}
        </View>
        {/* La distance en tete : c'est le premier critere de tri d'un chercheur d'emploi, bien
            avant le salaire — une annonce a quarante kilometres ne se postule pas. */}
        <Text style={styles.carteDistance}>{formatDistance(offre.distanceM)}</Text>
      </View>

      <View style={styles.tags}>
        <Tag texte={t(`jobs.sector.${offre.sector}`)} />
        <Tag texte={t(`jobs.contract.${offre.contract}`)} />
        {offre.salary ? <Tag texte={offre.salary} fort /> : null}
      </View>

      {offre.description ? (
        <Text style={styles.carteDescription} numberOfLines={3}>
          {offre.description}
        </Text>
      ) : null}

      <View style={styles.contacts}>
        <Contact emoji="📞" libelle={t('jobs.call')} onPress={() => tel(offre.phone)} />
        {offre.whatsapp ? (
          <Contact emoji="💬" libelle="WhatsApp" onPress={() => whatsapp(offre.whatsapp!)} />
        ) : null}
        {offre.viber ? <Contact emoji="📱" libelle="Viber" onPress={() => viber(offre.viber!)} /> : null}
        {offre.email ? <Contact emoji="✉️" libelle="Email" onPress={() => mail(offre.email!)} /> : null}
      </View>

      <Pressable
        onPress={() => onNavigate(offre)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.itineraire, { opacity: pressed ? 0.88 : 1 }]}
      >
        <Text style={styles.itineraireTexte}>
          🧭  {t('jobs.route')} · {formatDistance(offre.distanceM)}
        </Text>
      </Pressable>
    </View>
  );
}

function Tag({ texte, fort = false }: { texte: string; fort?: boolean }) {
  return (
    <View style={[styles.tag, fort ? { backgroundColor: `${OR}22` } : null]}>
      <Text style={[styles.tagTexte, fort ? { color: '#8A6A10' } : null]} numberOfLines={1}>
        {texte}
      </Text>
    </View>
  );
}

function Contact({ emoji, libelle, onPress }: { emoji: string; libelle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.contact, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={styles.contactEmoji}>{emoji}</Text>
      <Text style={styles.contactTexte} numberOfLines={1}>
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
    paddingTop: spacing.lg,
    maxHeight: '88%',
  },
  tete: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titre: { color: TEXTE, fontSize: 20, fontWeight: '800' as const },
  sousTitre: { color: TEXTE_DOUX, fontSize: 12.5, marginTop: 2 },
  fermer: { color: TEXTE_DOUX, fontSize: 18 },

  chips: { gap: spacing.sm, paddingVertical: spacing.md, paddingRight: spacing.lg },
  chip: { borderWidth: 1.5, borderColor: PUCE, backgroundColor: PUCE, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  chipActif: { backgroundColor: VERT, borderColor: VERT },
  chipTexte: { color: TEXTE_DOUX, fontSize: 12.5, fontWeight: '700' as const },
  chipTexteActif: { color: '#FFFFFF' },

  liste: { marginTop: 2 },
  vide: { color: TEXTE_DOUX, fontSize: 13, textAlign: 'center', paddingVertical: spacing.xl },

  carte: {
    borderWidth: 1,
    borderColor: PUCE,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  carteTete: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  carteEmoji: { fontSize: 24 },
  carteTitre: { color: TEXTE, fontSize: 15.5, fontWeight: '800' as const },
  carteEntreprise: { color: TEXTE_DOUX, fontSize: 12.5, marginTop: 1 },
  carteDistance: { color: VERT, fontSize: 13, fontWeight: '800' as const },
  carteDescription: { color: TEXTE_DOUX, fontSize: 12.5, lineHeight: 17 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: PUCE, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  tagTexte: { color: TEXTE_DOUX, fontSize: 11, fontWeight: '700' as const },

  contacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: VERT,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  contactEmoji: { fontSize: 13 },
  contactTexte: { color: VERT, fontSize: 12, fontWeight: '800' as const },

  itineraire: { backgroundColor: VERT, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  itineraireTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' as const },

  fab: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: OR,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabTexte: { color: '#2A1F00', fontSize: 15, fontWeight: '800' as const },
});
