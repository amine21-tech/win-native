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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { dateDepuisServeur, formatDistance, type DureeEmploi, type FormuleEmploi } from '../shared';
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
/* LES COULEURS DE LA MAQUETTE DU 29 OCTOBRE. Celles des canaux de contact sont celles qu'on
 * leur connait ailleurs — le vert de WhatsApp, le violet de Viber : elles se reconnaissent sans
 * lire l'etiquette, et c'est tout leur interet sur un bouton de trente points de large. */
const VERT_WHATSAPP = '#25D366';
const VIOLET_VIBER = '#7360F2';
const ROUGE_MAIL = '#C0392B';
/** Le bleu marine du bouton « Naviguer » : le seul bouton qui fait quitter la liste. */
const BLEU_MARINE = '#1E3A5F';
const OR = '#D4A017';
const FOND = '#FFFFFF';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';
const PUCE = '#F3F4F6';

/** Les sept secteurs, dans l'ordre de la maquette, avec le pictogramme de chacun. */
/**
 * LES DOUZE SECTEURS DU CLIENT (doc 196 v2.0, 29 octobre).
 *
 * Sa liste compte treize lignes, mais la premiere est « Tous » : c'est le filtre par defaut de
 * l'ecran, pas un secteur. Douze, donc, et l'ordre est celui de sa maquette — c'est celui dans
 * lequel les chips defilent.
 *
 * « Bureaux » disparait : il n'existe pas dans sa liste, et aucun des douze ne le recouvre
 * exactement. Les annonces deja deposees basculent vers « Services » (migration 0008).
 */
export const SECTEURS_EMPLOI = [
  { cle: 'btp', emoji: '🔧' },
  { cle: 'commerce', emoji: '🛒' },
  { cle: 'transport', emoji: '🚚' },
  { cle: 'restauration', emoji: '🍽' },
  { cle: 'agriculture', emoji: '🌾' },
  { cle: 'sante', emoji: '⚕️' },
  { cle: 'informatique', emoji: '💻' },
  { cle: 'industrie', emoji: '🏭' },
  { cle: 'securite', emoji: '🛡' },
  { cle: 'artisanat', emoji: '🪚' },
  { cle: 'education', emoji: '📚' },
  { cle: 'services', emoji: '🏠' },
] as const;

/** Une annonce vue par son auteur : il n'a besoin que de son titre et de son etat. */
export type MyJobOffer = {
  id: string;
  sector: string;
  title: string;
  status: 'pending' | 'active' | 'rejected';
  formule: FormuleEmploi;
  duree: DureeEmploi;
  createdAt: string;
  expiresAt: string | null;
};

export type JobOffer = {
  id: string;
  sector: string;
  title: string;
  company: string | null;
  contract: 'cdi' | 'cdd' | 'interim' | 'saisonnier' | 'mission';
  /** Formule achetee par l'employeur : elle decide du badge et du rang dans la liste. */
  formule: FormuleEmploi;
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
  const insets = useSafeAreaInsets();
  const [secteur, setSecteur] = useState<string | null>(null);
  /* « Mes annonces » n'est pas un filtre de plus : c'est la seule facon pour un employeur de
   * savoir ou en est ce qu'il a paye. Sans cet ecran, l'ecran de confirmation lui promettait
   * un endroit qui n'existait pas. */
  const [mesAnnonces, setMesAnnonces] = useState(false);

  const query = useQuery({
    queryKey: ['jobs', position?.lat, position?.lon, secteur],
    enabled: visible && !mesAnnonces && position != null,
    queryFn: () =>
      api<{ items: JobOffer[]; radiusM: number }>(
        `/jobs?lat=${position!.lat}&lon=${position!.lon}${secteur ? `&sector=${secteur}` : ''}`,
      ),
  });

  const miennes = useQuery({
    queryKey: ['jobs', 'mine'],
    enabled: visible && mesAnnonces,
    queryFn: () => api<{ items: MyJobOffer[] }>('/jobs/mine'),
  });

  const offres = useMemo(() => query.data?.items ?? [], [query.data]);

  return (
    /* PLEIN ECRAN, ET C'EST LE POINT BLOQUANT DU CLIENT (doc 196 v2.0, 29 octobre).
     *
     * C'etait une feuille basse plafonnee a 88 % : le bas de la liste passait sous le bord de
     * l'ecran et les dernieres annonces devenaient inatteignables. Le client le decrit comme
     * << le probleme principal a corriger en priorite >>, et il a raison — une liste qu'on ne
     * peut pas finir de lire n'est pas une liste.
     *
     * `transparent` est retire : un Modal opaque occupe tout l'ecran, sans voile ni fond de
     * carte derriere. Le retour se fait par la fleche du bandeau et par le bouton Retour
     * d'Android (`onRequestClose`), comme sur l'ecran d'enregistrement GPS auquel le client
     * demande de se referer. */
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.plein}>
        <View style={[styles.contenu, { paddingTop: insets.top }]}>
          {/* BANDEAU VERT PLEIN, comme la maquette : l'emploi a son propre en-tete, et c'est ce
              qui le fait lire comme un module a part plutot que comme une feuille de plus. */}
          <View style={styles.bandeau}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.retour}>←</Text>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* « Emploi - WIN DZ », le titre exact de la maquette : le module porte le nom
                  de l'application parce qu'il est une partie d'elle, pas une autre application. */}
              <Text style={styles.bandeauTitre}>{t('jobs.headerTitle')}</Text>
              <Text style={styles.bandeauSousTitre}>{t('jobs.headerSub')}</Text>
            </View>
            {/* Le carre or de la maquette : l'acces employeur, atteignable sans faire defiler. */}
            <Pressable onPress={onPublish} accessibilityRole="button" style={styles.carreOr}>
              <Text style={styles.carreOrTexte}>✚</Text>
            </Pressable>
          </View>

          {/* SOUS-BANDEAU : le rayon a gauche, le nombre d'offres a droite. Il repond avant
              qu'on demande aux deux questions qu'on se pose en ouvrant : jusqu'ou cherche-t-on,
              et y a-t-il quelque chose. */}
          <View style={styles.sousBandeau}>
            {/* « Localisation active » avec sa puce or, comme la maquette : le chercheur veut
                d'abord savoir que l'application sait OU il est. Le rayon, lui, est rappele
                dans le message qui s'affiche quand la liste est vide. */}
            <View style={styles.localisation}>
              <View style={styles.puceOr} />
              <Text style={styles.sousBandeauTexte}>{t('jobs.locationActive')}</Text>
            </View>
            <Text style={styles.sousBandeauTexte}>
              {mesAnnonces
                ? t('jobs.countMine', { count: miennes.data?.items.length ?? 0 })
                : t('jobs.count', { count: offres.length })}
            </Text>
          </View>

          {/* FILTRES EN CHIPS DEFILANTS, comme la maquette. Horizontal et non une grille : sept
              secteurs plus « Tous » prendraient trois lignes au-dessus de la liste, et
              repousseraient les offres hors de l'ecran. */}
          {/* `flexGrow: 0` N'EST PAS UNE COQUETTERIE. Un ScrollView pose dans une colonne
              `flex: 1` prend TOUTE la hauteur restante : en passant le module en plein ecran,
              la rangee de chips s'est mise a occuper les trois quarts de l'ecran, et chaque
              secteur est devenu une gelule verticale de huit cents points. Elle ne doit
              mesurer que ce que mesurent les chips. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rangeeChips}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            <Chip
              actif={!mesAnnonces && secteur === null}
              libelle={t('jobs.all')}
              onPress={() => {
                setMesAnnonces(false);
                setSecteur(null);
              }}
            />
            {SECTEURS_EMPLOI.map((s) => (
              <Chip
                key={s.cle}
                actif={!mesAnnonces && secteur === s.cle}
                libelle={`${s.emoji}  ${t(`jobs.sector.${s.cle}`)}`}
                onPress={() => {
                  setMesAnnonces(false);
                  setSecteur(s.cle);
                }}
              />
            ))}
            {/* Separe des secteurs par sa couleur : ce n'est pas un filtre sur les offres des
                autres, c'est la liste des siennes. */}
            <Chip
              actif={mesAnnonces}
              libelle={`📄  ${t('jobs.mine')}`}
              onPress={() => setMesAnnonces(true)}
            />
          </ScrollView>

          {/* `flex: 1` et non plus une hauteur libre : en plein ecran, c'est cette liste qui
              doit absorber TOUT l'espace restant entre les filtres et le bas de l'ecran. Sans
              lui, elle se dimensionnerait sur son contenu et s'arreterait au milieu. */}
          <ScrollView
            style={styles.liste}
            contentContainerStyle={styles.listeContenu}
            keyboardShouldPersistTaps="handled"
          >
            {mesAnnonces ? (
              miennes.isLoading ? (
                <ActivityIndicator color={VERT} style={{ marginTop: spacing.lg }} />
              ) : miennes.isError ? (
                <Text style={styles.vide}>{t('errors.unknown')}</Text>
              ) : (miennes.data?.items.length ?? 0) === 0 ? (
                <Text style={styles.vide}>{t('jobs.mineEmpty')}</Text>
              ) : (
                miennes.data!.items.map((a) => <MienneLigne key={a.id} annonce={a} />)
              )
            ) : position == null ? (
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
            <View style={{ height: 88 + insets.bottom }} />
          </ScrollView>

          {/* FAB OR — « Publier une offre », l'acces employeur. Pose PAR-DESSUS la liste et non
              a la suite : c'est le geste qu'un employeur vient chercher, et il ne doit pas avoir
              a faire defiler cinquante annonces pour le trouver. */}
          <Pressable
            onPress={onPublish}
            accessibilityRole="button"
            /* La barre systeme Android (Retour / Accueil / Recents) ne doit JAMAIS etre
               couverte : le client l'ecrit deux fois. Le bouton se pose au-dessus d'elle. */
            style={({ pressed }) => [
              styles.fab,
              { bottom: spacing.lg + insets.bottom, opacity: pressed ? 0.88 : 1 },
            ]}
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
  return (
    <View style={styles.carte}>
      {/* LE BADGE DE LA FORMULE, en tete de carte.
          Il ne sert pas qu'a decorer : c'est ce que l'employeur a paye, et c'est ce qui
          explique au chercheur pourquoi cette offre est en haut de sa liste alors qu'elle est
          plus loin que la suivante. Une mise en avant qui ne se voit pas se lit comme un tri
          casse. Rien pour Essentiel : la majorite des annonces, et un badge sur toutes les
          cartes ne distingue plus rien. */}
      {offre.formule !== 'essentiel' ? (
        <View
          style={[
            styles.badgeFormule,
            { backgroundColor: offre.formule === 'premium' ? VERT : OR },
          ]}
        >
          <Text style={styles.badgeFormuleTexte}>
            {t(offre.formule === 'premium' ? 'jobs.priority' : 'jobs.highlighted')}
          </Text>
        </View>
      ) : null}

      <View style={styles.carteTete}>
        {/* LA PASTILLE A L'INITIALE, comme la maquette. Elle remplace l'emoji du secteur, et
            ce n'est pas qu'une question de gout : sur une liste, douze emoji se ressemblent
            de loin, tandis qu'une lettre dans un rond colore se distingue du premier coup
            d'oeil et se rattache au NOM de l'entreprise, qui est ce qu'on cherche. */}
        <View style={[styles.pastille, { backgroundColor: couleurPastille(offre.title) }]}>
          <Text style={styles.pastilleLettre}>{initiale(offre.company ?? offre.title)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.carteTitre} numberOfLines={2}>
            {offre.title}
          </Text>
          {offre.company || offre.wilaya ? (
            <Text style={styles.carteEntreprise} numberOfLines={1}>
              {[offre.company, offre.wilaya].filter(Boolean).join(' - ')}
            </Text>
          ) : null}
        </View>

        {/* La distance en chip vert, en haut a droite — c'est le premier critere de tri d'un
            chercheur d'emploi, bien avant le salaire : une annonce a quarante kilometres ne se
            postule pas. */}
        <View style={styles.chipDistance}>
          <Text style={styles.chipDistanceTexte}>{formatDistance(offre.distanceM)}</Text>
        </View>
      </View>

      {/* TROIS ETIQUETTES, DANS L'ORDRE DE LA MAQUETTE : secteur et contrat reunis par un
          point median, le temps de travail, puis le salaire EN OR. L'or n'est pas decoratif —
          c'est la couleur de l'argent dans tout le module, et le salaire est la seule chose
          qu'on cherche des yeux avant de lire le reste. */}
      <View style={styles.tags}>
        <Tag texte={`${t(`jobs.sector.${offre.sector}`)} · ${t(`jobs.contract.${offre.contract}`)}`} />
        {offre.salary ? <Text style={styles.salaire}>{offre.salary}</Text> : null}
      </View>

      {offre.description ? (
        <Text style={styles.carteDescription} numberOfLines={2}>
          {offre.description}
        </Text>
      ) : null}

      {/* LES QUATRE CONTACTS, CHACUN A SA COULEUR. La maquette leur donne les couleurs qu'on
          leur connait ailleurs — le vert de WhatsApp, le violet de Viber — parce qu'elles se
          reconnaissent sans lire l'etiquette. */}
      <View style={styles.contacts}>
        <Contact libelle={t('jobs.call')} fond={VERT} onPress={() => tel(offre.phone)} />
        {offre.whatsapp ? (
          <Contact libelle="WhatsApp" fond={VERT_WHATSAPP} onPress={() => whatsapp(offre.whatsapp!)} />
        ) : null}
        {offre.viber ? (
          <Contact libelle="Viber" fond={VIOLET_VIBER} onPress={() => viber(offre.viber!)} />
        ) : null}
        {offre.email ? (
          <Contact libelle="Email" fond={ROUGE_MAIL} onPress={() => mail(offre.email!)} />
        ) : null}
      </View>

      {/* « Naviguer vers Tizi Ouzou — WIN DZ », en BLEU MARINE et pleine largeur.
          Le bleu le separe de tout le reste du module, qui est vert ou or : c'est le seul
          bouton qui fait QUITTER la liste pour entrer en navigation. */}
      <Pressable
        onPress={() => onNavigate(offre)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.naviguer, { opacity: pressed ? 0.88 : 1 }]}
      >
        <Text style={styles.naviguerTexte} numberOfLines={1}>
          {offre.wilaya
            ? t('jobs.navigateTo', { lieu: offre.wilaya })
            : t('jobs.navigate')}
        </Text>
      </Pressable>

      <Text style={styles.distanceExacte}>
        {t('jobs.exactDistance', { distance: formatDistance(offre.distanceM) })}
      </Text>
    </View>
  );
}

/** Premiere lettre significative, pour la pastille. */
function initiale(texte: string): string {
  const lettre = texte.trim().replace(/^[^\p{L}]+/u, '').charAt(0);
  return (lettre || '?').toUpperCase();
}

/**
 * Couleur de la pastille, tiree du texte lui-meme.
 *
 * Deterministe et non aleatoire : la meme entreprise garde la meme couleur d'un
 * rafraichissement a l'autre, ce qui est tout l'interet — une pastille qui change de couleur
 * a chaque chargement ne sert plus a reconnaitre quoi que ce soit.
 */
const COULEURS_PASTILLE = ['#8E4B2E', '#2E7D4F', '#8C2F39', '#1E4C8A', '#6B5B3E', '#5B3E7D'];
function couleurPastille(texte: string): string {
  let somme = 0;
  for (let i = 0; i < texte.length; i++) somme = (somme + texte.charCodeAt(i)) % 997;
  return COULEURS_PASTILLE[somme % COULEURS_PASTILLE.length]!;
}

/**
 * Une de mes annonces, et surtout SON ETAT.
 *
 * C'est la seule information que l'employeur vient chercher : a-t-elle ete publiee, attend-elle
 * encore mon versement, a-t-elle ete refusee. Le reste — secteur, titre — ne sert qu'a la
 * reconnaitre parmi les siennes.
 */
function MienneLigne({ annonce }: { annonce: MyJobOffer }) {
  const { t } = useTranslation();
  const emoji = SECTEURS_EMPLOI.find((s) => s.cle === annonce.sector)?.emoji ?? '💼';
  const couleur =
    annonce.status === 'active' ? VERT : annonce.status === 'rejected' ? '#C0392B' : '#8A6A10';
  const expire = dateDepuisServeur(annonce.expiresAt);

  return (
    <View style={styles.carte}>
      <View style={styles.carteTete}>
        <Text style={styles.mienneEmoji}>{emoji}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.carteTitre} numberOfLines={2}>
            {annonce.title}
          </Text>
          {/* `dateDepuisServeur` et non `new Date` : le serveur renvoie l'horodatage de
              PostgreSQL, qu'Hermes refuse. C'est ce qui affichait « Invalid Date » sous
              chaque annonce. Une date illisible n'affiche plus rien plutot qu'un mot
              anglais incomprehensible. */}
          <Text style={styles.carteEntreprise}>
            {dateDepuisServeur(annonce.createdAt)?.toLocaleDateString() ?? ''}
            {expire ? ` · ${t('jobs.until', { when: expire.toLocaleDateString() })}` : ''}
          </Text>
        </View>
      </View>
      <Text style={[styles.etat, { color: couleur }]}>{t(`jobs.status.${annonce.status}`)}</Text>
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

/** Un bouton de contact : fond plein a la couleur du canal, texte blanc — comme la maquette. */
function Contact({ libelle, fond, onPress }: { libelle: string; fond: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      style={({ pressed }) => [styles.contact, { backgroundColor: fond, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={styles.contactTexte} numberOfLines={1}>
        {libelle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Plein ecran : le fond couvre la totalite, barre d'etat comprise (statusBarTranslucent),
   * et `contenu` redescend sous l'encoche grace a l'inset haut. Le bandeau vert passe ainsi
   * SOUS la barre d'etat au lieu de s'arreter avant, comme sur la maquette. */
  plein: { flex: 1, backgroundColor: FOND },
  contenu: { flex: 1, backgroundColor: FOND },

  /* Le bandeau et son sous-bandeau vont d'un bord a l'autre. Plus d'angles arrondis en haut :
   * en plein ecran ils laisseraient deux coins de fond blanc au-dessus du vert. */
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: VERT,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retour: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' as const },
  bandeauTitre: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' as const },
  bandeauSousTitre: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 1 },
  carreOr: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: OR, alignItems: 'center', justifyContent: 'center' },
  carreOrTexte: { color: '#2A1F00', fontSize: 20, fontWeight: '800' as const },

  sousBandeau: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0A4A24',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  localisation: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  puceOr: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: OR },
  sousBandeauTexte: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '700' as const },

  rangeeChips: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  chip: { borderWidth: 1.5, borderColor: PUCE, backgroundColor: PUCE, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  chipActif: { backgroundColor: VERT, borderColor: VERT },
  chipTexte: { color: TEXTE_DOUX, fontSize: 12.5, fontWeight: '700' as const },
  chipTexteActif: { color: '#FFFFFF' },

  liste: { flex: 1, marginTop: 2 },
  listeContenu: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  vide: { color: TEXTE_DOUX, fontSize: 13, textAlign: 'center', paddingVertical: spacing.xl },

  badgeFormule: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 2,
  },
  badgeFormuleTexte: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' as const },

  carte: {
    borderWidth: 1,
    borderColor: PUCE,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  carteTete: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  /* LA PASTILLE A L'INITIALE : 34 points, comme la maquette. */
  pastille: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pastilleLettre: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' as const },
  mienneEmoji: { fontSize: 24 },
  carteTitre: { color: TEXTE, fontSize: 15.5, fontWeight: '800' as const },
  carteEntreprise: { color: TEXTE_DOUX, fontSize: 12.5, marginTop: 1 },
  /* La distance en CHIP vert, et non en simple texte : la maquette en fait une etiquette,
   * ce qui la detache du titre et la rend lisible sans la chercher. */
  chipDistance: { backgroundColor: VERT, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  chipDistanceTexte: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' as const },
  carteDescription: { color: TEXTE_DOUX, fontSize: 12.5, lineHeight: 17 },

  etat: { fontSize: 12.5, fontWeight: '800' as const },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: PUCE, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  tagTexte: { color: TEXTE_DOUX, fontSize: 11, fontWeight: '700' as const },
  /* LE SALAIRE EN OR, sans cadre : la maquette le pose comme un texte fort a cote des
   * etiquettes, pas comme une etiquette de plus. C'est ce qui le fait ressortir. */
  salaire: { color: '#8A6A10', fontSize: 12.5, fontWeight: '800' as const, alignSelf: 'center' },

  contacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  /* Fond PLEIN a la couleur du canal, comme la maquette — l'ancien bouton etait un cadre vert
   * pour les quatre, ce qui ne distinguait rien. */
  contact: {
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  contactTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },

  /* BLEU MARINE, valeur de la maquette : le seul bouton du module qui ne soit ni vert ni or,
   * parce qu'il est le seul a faire QUITTER la liste pour entrer en navigation. */
  naviguer: {
    backgroundColor: BLEU_MARINE,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  naviguerTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' as const },
  distanceExacte: { color: TEXTE_DOUX, fontSize: 11, marginTop: 2 },

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
