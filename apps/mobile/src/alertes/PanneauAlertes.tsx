import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { SeasonalBanner } from '../components/SeasonalBanner';
import {
  CATALOGUE_EVENEMENTS,
  dateArretParDefaut,
  DZ_WILAYA_NAMES,
  evenementParId,
  PHENOMENES,
  type Alerte,
  type Language,
  type Phenomene,
} from '../shared';
import { MOIS_KAB } from '../reports/qibla';
import { radius, spacing, typography, type Palette } from '../theme';

/**
 * PANNEAU DES ALERTES OFFICIELLES — section de l'espace administrateur.
 *
 * IL N'Y A PAS DE CODE A QUATRE CHIFFRES, contrairement au cahier des charges. Le client a
 * pose la bonne question : il a deja un mot de passe pour entrer ici, pourquoi en redemander
 * un second une fois qu'il est dedans ? Ce code etait concu pour la version HTML du site, qui
 * n'avait aucun compte — voir routes/alertesOfficielles.ts.
 *
 * L'APERCU EST OBLIGATOIRE, et c'est la seule contrainte du document qu'on garde telle quelle.
 * << Publier >> reste grise tant que l'apercu n'a pas ete ouvert. Ce n'est pas une formalite :
 * ce bouton allume une banniere chez TOUS les utilisateurs du pays, et il n'existe aucun
 * moyen de la rattraper une fois partie. Obliger a regarder ce qu'on envoie coute une seconde
 * et evite d'envoyer une vigilance meteo sans avoir vu qu'aucune wilaya n'etait cochee.
 *
 * L'APERCU MONTRE LA VRAIE BANNIERE, le meme composant que les utilisateurs verront, avec les
 * donnees du formulaire. Redessiner une imitation serait pire que rien : elle finirait par
 * diverger, et l'apercu mentirait precisement sur ce qu'on lui demande de garantir.
 */

const VERT = '#0B5B2C';
const ROUGE = '#C8102E';
const BLEU = '#0B5FA5';

type AlerteAdmin = Alerte & { updatedAt?: string };

/* ------------------------------------------------------------------ */
/* Le panneau                                                          */
/* ------------------------------------------------------------------ */

export function PanneauAlertes({
  token,
  colors,
  lang,
}: {
  token: string;
  colors: Palette;
  lang: Language;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'alertes'],
    queryFn: () => api<{ alertes: AlerteAdmin[] }>('/admin/alertes', { adminToken: token }),
    retry: false,
  });

  const [listeFetes, setListeFetes] = useState(false);

  const alertes = data?.alertes ?? [];
  const feu = alertes.find((a) => a.type === 'fire');
  const meteo = alertes.find((a) => a.type === 'weather');
  const fetes = alertes.filter((a) => a.type === 'event');
  const fetesActives = fetes.filter((f) => f.active);

  if (isLoading) return <ActivityIndicator color={colors.accent} />;

  /* L'ECHEC DU CHARGEMENT EST DIT, pas avale. Sans ce bloc, un serveur qui ne connait pas
   * encore la route rendait un panneau d'apparence normale : les douze fetes s'affichaient
   * — elles viennent du catalogue LOCAL — avec tous les interrupteurs eteints, et appuyer
   * dessus ne faisait rien. C'est exactement ce que le client a vu, et il n'avait aucun
   * moyen de deviner que le defaut etait sur le serveur et non dans l'application.
   *
   * Le 404 a son propre message : il ne veut pas dire << panne >> mais << API pas encore
   * mise a jour >>, et le remede n'est pas du tout le meme. */
  if (error) {
    const quatreCentQuatre = error instanceof ApiError && error.status === 404;
    return (
      <Text style={[typography.caption, { color: ROUGE }]}>
        {quatreCentQuatre
          ? t('admin.alertsUnavailable')
          : t('admin.alertsFailed', { raison: error instanceof Error ? error.message : String(error) })}
      </Text>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.alertsHint')}</Text>

      {feu ? (
        <Vigilance
          alerte={feu}
          teinte={ROUGE}
          titre={`🔥 ${t('seasonalAlert.fireTitle')}`}
          token={token}
          colors={colors}
          lang={lang}
          onPublie={() => void qc.invalidateQueries({ queryKey: ['admin', 'alertes'] })}
        />
      ) : null}

      {meteo ? (
        <Vigilance
          alerte={meteo}
          teinte={BLEU}
          titre={`🌧️ ${t('alertes.weatherTitle')}`}
          token={token}
          colors={colors}
          lang={lang}
          onPublie={() => void qc.invalidateQueries({ queryKey: ['admin', 'alertes'] })}
        />
      ) : null}

      {/* Les fetes : un resume, et la liste complete derriere. Douze interrupteurs deplies
          ici noieraient les deux vigilances, qui sont ce qu'on vient regler le plus souvent. */}
      <View style={[styles.carte, { borderColor: colors.border }]}>
        <Text style={[styles.titre, { color: colors.text }]}>🇩🇿 {t('admin.eventsTitle')}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {fetesActives.length === 0
            ? t('admin.eventsNone')
            : `${t('admin.eventsActive', { count: fetesActives.length })} : ${fetesActives
                .map((f) => t(`alertes.event.${f.id}.title`))
                .join(' · ')}`}
        </Text>
        <Pressable onPress={() => setListeFetes(true)} style={[styles.lien, { borderColor: colors.accent }]}>
          <Text style={[styles.lienTexte, { color: colors.accent }]}>{t('admin.eventsOpen')}</Text>
        </Pressable>
      </View>

      <ListeFetes
        visible={listeFetes}
        onClose={() => setListeFetes(false)}
        fetes={fetes}
        token={token}
        colors={colors}
        onChange={() => void qc.invalidateQueries({ queryKey: ['admin', 'alertes'] })}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Une vigilance : foret ou meteo                                      */
/* ------------------------------------------------------------------ */

function Vigilance({
  alerte,
  teinte,
  titre,
  token,
  colors,
  lang,
  onPublie,
}: {
  alerte: AlerteAdmin;
  teinte: string;
  titre: string;
  token: string;
  colors: Palette;
  lang: Language;
  onPublie: () => void;
}) {
  const { t } = useTranslation();

  /* L'ETAT DU FORMULAIRE EST LOCAL, et ne part au serveur qu'au moment de publier. Cocher une
   * wilaya ne doit pas allumer une banniere chez cinquante mille personnes : on prepare, on
   * regarde, puis on envoie. C'est tout le sens de l'apercu obligatoire. */
  const [active, setActive] = useState(alerte.active);
  const [wilayas, setWilayas] = useState<string[]>(alerte.wilayas ?? []);
  const [phenomenes, setPhenomenes] = useState<Phenomene[]>(alerte.phenomena ?? []);
  const [vuEnApercu, setVuEnApercu] = useState(false);
  const [apercu, setApercu] = useState(false);
  const [choixZones, setChoixZones] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const meteo = alerte.type === 'weather';
  const manquePhenomene = meteo && active && phenomenes.length === 0;

  /**
   * LE FORMULAIRE DIFFERE-T-IL DE CE QUI EST PUBLIE ?
   *
   * C'est la question que l'ecran ne posait pas, et c'est tout le defaut. L'etat du formulaire
   * est local jusqu'a la publication — ce qui est juste — mais la ligne d'etat lisait ce meme
   * etat local et annoncait << Alerte desactivee : rien n'est affiche >> des qu'on touchait
   * l'interrupteur. Le fondateur eteignait, lisait que c'etait eteint, fermait l'ecran, et la
   * banniere continuait d'apparaitre chez tout le monde. L'ecran ne mentait pas par erreur de
   * calcul : il repondait a une autre question que celle qu'on lui posait.
   */
  const memeListe = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  const nonPublie =
    active !== alerte.active ||
    !memeListe(wilayas, alerte.wilayas ?? []) ||
    (meteo && !memeListe(phenomenes, alerte.phenomena ?? []));

  const publier = useMutation({
    mutationFn: () =>
      api(`/admin/alertes/${alerte.type}`, {
        method: 'PUT',
        adminToken: token,
        body: { active, wilayas, phenomena: meteo ? phenomenes : undefined },
      }),
    onSuccess: () => {
      setMessage(t('admin.alertSaved'));
      setVuEnApercu(false);
      onPublie();
    },
    onError: (e: unknown) => setMessage(e instanceof Error ? e.message : String(e)),
  });

  /** L'alerte telle qu'elle serait publiee : c'est elle qu'on passe a l'apercu. */
  const projet: Alerte = useMemo(
    () => ({
      type: alerte.type,
      active: true,
      wilayas,
      phenomena: meteo ? (phenomenes.length > 0 ? phenomenes : ['rain']) : undefined,
    }),
    [alerte.type, wilayas, phenomenes, meteo],
  );

  /**
   * ETEINDRE NE DEMANDE PAS D'APERCU, et c'est le second defaut corrige.
   *
   * L'apercu est obligatoire parce que publier allume une banniere chez tous les utilisateurs
   * du pays et que rien ne la rattrape. Eteindre fait l'inverse : cela ne montre rien a
   * personne. Exiger l'apercu d'une banniere qui ne sera plus affichee n'etait pas une
   * precaution, c'etait un obstacle — et un obstacle place precisement sur le geste urgent,
   * celui qu'on fait quand l'alerte n'a plus lieu d'etre.
   */
  const publiable = (!active || vuEnApercu) && !manquePhenomene && !publier.isPending;

  return (
    <View style={[styles.carte, { borderColor: colors.border }]}>
      <View style={styles.ligne}>
        <Text style={[styles.titre, { color: colors.text, flex: 1 }]}>{titre}</Text>
        <Switch value={active} onValueChange={setActive} trackColor={{ true: teinte }} />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.alertActive')}</Text>

      {meteo ? (
        <View style={{ marginTop: spacing.sm, gap: 4 }}>
          <Text style={[styles.sousTitre, { color: colors.text }]}>{t('admin.phenomenaLabel')}</Text>
          {PHENOMENES.map((p) => {
            const coche = phenomenes.includes(p);
            return (
              <Pressable
                key={p}
                onPress={() =>
                  setPhenomenes((v) => (coche ? v.filter((x) => x !== p) : [...v, p]))
                }
                style={styles.case}
              >
                <Text style={{ color: coche ? teinte : colors.textMuted, fontSize: 15 }}>
                  {coche ? '☑' : '☐'}
                </Text>
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  {t(`admin.phenomenon${p[0]!.toUpperCase()}${p.slice(1)}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Text style={[typography.caption, { color: colors.text, marginTop: spacing.sm }]}>
        {wilayas.length === 0
          ? t('admin.alertZonesAll')
          : t('admin.alertZonesCount', { count: wilayas.length })}
      </Text>
      <Pressable onPress={() => setChoixZones(true)} style={[styles.lien, { borderColor: colors.accent }]}>
        <Text style={[styles.lienTexte, { color: colors.accent }]}>{t('admin.alertChooseZones')}</Text>
      </Pressable>

      <View style={[styles.ligne, { marginTop: spacing.sm, gap: spacing.sm }]}>
        <Pressable
          onPress={() => {
            setVuEnApercu(true);
            setApercu(true);
          }}
          style={[styles.bouton, { borderWidth: 1.5, borderColor: colors.accent }]}
        >
          <Text style={[styles.boutonTexte, { color: colors.accent }]}>{t('admin.alertPreview')}</Text>
        </Pressable>
        <Pressable
          onPress={() => publiable && publier.mutate()}
          disabled={!publiable}
          style={[styles.bouton, { backgroundColor: teinte, opacity: publiable ? 1 : 0.45 }]}
        >
          {publier.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.boutonTexte, { color: '#fff' }]}>{t('admin.alertPublish')}</Text>
          )}
        </Pressable>
      </View>

      {/* CE QUI EMPECHE DE PUBLIER EST DIT, pas seulement grise. Un bouton eteint sans
          explication se lit comme une panne, et on recommence au lieu de corriger. */}
      {manquePhenomene ? (
        <Text style={[typography.caption, { color: ROUGE }]}>{t('admin.alertNeedPhenomenon')}</Text>
      ) : active && !vuEnApercu ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('admin.alertPreviewFirst')}
        </Text>
      ) : null}

      {/* CETTE LIGNE DECRIT CE QUI EST PUBLIE, jamais ce qui est coche. C'est la correction du
          3 novembre : elle lisait l'interrupteur, donc elle annoncait l'extinction avant qu'elle
          soit partie. Une ligne d'etat qui parle du formulaire ne sert a rien — le formulaire
          est sous les yeux, c'est l'etat du SERVEUR qu'on ne voit pas. */}
      <Text style={[typography.caption, { color: alerte.active ? VERT : colors.textMuted }]}>
        {alerte.active ? t('admin.alertOn') : t('admin.alertOffPublished')}
      </Text>
      {nonPublie ? (
        <Text style={[typography.caption, { color: ROUGE, fontWeight: '800' }]}>
          {t('admin.alertNotPublished')}
        </Text>
      ) : null}
      {message ? <Text style={[typography.caption, { color: colors.textMuted }]}>{message}</Text> : null}

      <Apercu
        visible={apercu}
        onClose={() => setApercu(false)}
        onPublier={() => {
          setApercu(false);
          if (!manquePhenomene) publier.mutate();
        }}
        alerte={projet}
        colors={colors}
        lang={lang}
      />

      <ChoixWilayas
        visible={choixZones}
        onClose={() => setChoixZones(false)}
        valeur={wilayas}
        onValider={(v) => {
          setWilayas(v);
          /* CHANGER LES ZONES ANNULE L'APERCU DEJA VU. Il montrait d'autres wilayas : le
           * valider vaudrait publier quelque chose qu'on n'a pas regarde. */
          setVuEnApercu(false);
          setChoixZones(false);
        }}
        colors={colors}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* L'apercu                                                            */
/* ------------------------------------------------------------------ */

function Apercu({
  visible,
  onClose,
  onPublier,
  alerte,
  colors,
  lang,
}: {
  visible: boolean;
  onClose: () => void;
  onPublier: () => void;
  alerte: Alerte;
  colors: Palette;
  lang: Language;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fond}>
        <View style={[styles.boiteApercu, { backgroundColor: colors.surface }]}>
          <Text style={[styles.badgeApercu, { color: colors.text }]}>{t('admin.previewBadge')}</Text>

          {/* LA VRAIE BANNIERE, le meme composant que les utilisateurs verront. La hauteur
              est reservee a la main parce qu'elle se place en absolu : sans cela elle
              sortirait de la boite. */}
          <View style={styles.scene}>
            <SeasonalBanner top={12} right={12} position={null} alertes={[alerte]} lang={lang} />
          </View>

          <View style={[styles.ligne, { gap: spacing.sm }]}>
            <Pressable onPress={onClose} style={[styles.bouton, { borderWidth: 1.5, borderColor: colors.border }]}>
              <Text style={[styles.boutonTexte, { color: colors.text }]}>{t('admin.previewEdit')}</Text>
            </Pressable>
            <Pressable onPress={onPublier} style={[styles.bouton, { backgroundColor: VERT }]}>
              <Text style={[styles.boutonTexte, { color: '#fff' }]}>{t('admin.previewPublishNow')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Le choix des wilayas                                                */
/* ------------------------------------------------------------------ */

/** Sans accents ni casse : « bejaia » doit trouver « Béjaïa », et « tiz » « Tizi Ouzou ». */
function sansAccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ChoixWilayas({
  visible,
  onClose,
  valeur,
  onValider,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  valeur: string[];
  onValider: (v: string[]) => void;
  colors: Palette;
}) {
  const { t } = useTranslation();
  const [filtre, setFiltre] = useState('');
  const [choisies, setChoisies] = useState<string[]>(valeur);

  /* LA LISTE EST TRIEE ALPHABETIQUEMENT ICI, et non dans la source partagee : celle-ci est
   * dans l'ordre des numeros de wilaya, qui sert ailleurs. On cherche un nom, pas un numero. */
  const triees = useMemo(() => [...DZ_WILAYA_NAMES].sort((a, b) => a.localeCompare(b, 'fr')), []);
  const visibles = useMemo(
    () => triees.filter((w) => sansAccent(w).includes(sansAccent(filtre.trim()))),
    [triees, filtre],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fond}>
        <View style={[styles.boiteListe, { backgroundColor: colors.surface }]}>
          <View style={styles.ligne}>
            <Text style={[styles.titre, { color: colors.text, flex: 1 }]}>🌧️ {t('admin.alertChooseZones')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '800' }}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            value={filtre}
            onChangeText={setFiltre}
            placeholder={t('admin.filterWilaya')}
            placeholderTextColor={colors.textMuted}
            style={[styles.champ, { borderColor: colors.border, color: colors.text }]}
          />

          <View style={[styles.ligne, { gap: spacing.sm }]}>
            <Pressable onPress={() => setChoisies([...triees])} style={[styles.petit, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 12 }}>{t('admin.selectAll')}</Text>
            </Pressable>
            <Pressable onPress={() => setChoisies([])} style={[styles.petit, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 12 }}>{t('admin.clearAll')}</Text>
            </Pressable>
          </View>

          {/* Les puces des wilayas choisies, en haut : sur une liste de 58, on ne voit pas ce
              qu'on a coche plus bas. Un tap sur ✕ la retire. */}
          {choisies.length > 0 ? (
            <View style={styles.puces}>
              {choisies.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setChoisies((v) => v.filter((x) => x !== w))}
                  style={[styles.puce, { borderColor: colors.accent }]}
                >
                  <Text style={{ color: colors.accent, fontSize: 12 }}>{w} ✕</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
            {visibles.map((w) => {
              const coche = choisies.includes(w);
              return (
                <Pressable
                  key={w}
                  onPress={() => setChoisies((v) => (coche ? v.filter((x) => x !== w) : [...v, w]))}
                  style={styles.case}
                >
                  <Text style={{ color: coche ? colors.accent : colors.textMuted, fontSize: 15 }}>
                    {coche ? '☑' : '☐'}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 14 }}>{w}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={() => onValider(choisies)} style={[styles.bouton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.boutonTexte, { color: '#fff' }]}>
              {choisies.length === 0
                ? t('admin.alertZonesAll')
                : t('admin.validateCount', { count: choisies.length })}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* La liste des douze fetes                                            */
/* ------------------------------------------------------------------ */

/** « 18 février » : le mois vient d'Intl, sauf en kabyle qu'Intl ne connait pas. */
function dateLisible(dateFixe: string | null, lang: Language, t: (c: string) => string): string {
  if (!dateFixe) return t('admin.variableDate');
  const [jour, mois] = dateFixe.split('-').map(Number);
  const d = new Date(Date.UTC(2000, (mois ?? 1) - 1, jour ?? 1));
  /* EN TAMAZIGHT, PAS DE FRANCAIS, meme ici. Cet ecran est reserve a l'administrateur et la
   * tentation serait de laisser passer — mais le client a ete net : quand le tamazight est
   * choisi, tout est en tamazight. Les noms de mois viennent de qibla.ts, ou ils servent deja
   * a la date de l'ecran Qibla : les ecrire deux fois les ferait diverger. */
  if (lang === 'kab') return `${jour} ${MOIS_KAB[(mois ?? 1) - 1]}`;
  const locale = lang === 'en' ? 'en-US' : lang === 'ar' || lang === 'dz' ? 'ar-DZ' : 'fr-FR';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  } catch {
    return dateFixe;
  }
}

function ListeFetes({
  visible,
  onClose,
  fetes,
  token,
  colors,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  fetes: AlerteAdmin[];
  token: string;
  colors: Palette;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) ?? 'fr';
  const [enCours, setEnCours] = useState<string | null>(null);
  const [echec, setEchec] = useState<string | null>(null);

  const basculer = async (id: string, active: boolean) => {
    const evenement = evenementParId(id);
    setEnCours(id);
    setEchec(null);
    try {
      await api(`/admin/alertes/event/${id}`, {
        method: 'PUT',
        adminToken: token,
        /* L'ARRET AUTOMATIQUE EST POSE A L'ALLUMAGE, pas laisse a la main. Le document le
         * propose pour qu'on n'oublie pas d'eteindre — un jour pour les dates nationales,
         * trois pour les Aid. En l'eteignant, on efface la date : elle n'a plus de sens. */
        body: {
          active,
          until: active && evenement ? dateArretParDefaut(evenement) : null,
        },
      });
      onChange();
    } catch (e) {
      /* UN INTERRUPTEUR QUI NE BOUGE PAS DOIT DIRE POURQUOI. Il revenait a sa place sans un
       * mot : le fondateur appuyait, rien ne se passait, et il ne pouvait que recommencer. */
      setEchec(
        e instanceof ApiError && e.status === 404
          ? t('admin.alertsUnavailable')
          : t('admin.alertsFailed', { raison: e instanceof Error ? e.message : String(e) }),
      );
    } finally {
      setEnCours(null);
    }
  };

  const parCategorie = (cat: 'memoire' | 'religieux') =>
    CATALOGUE_EVENEMENTS.filter((e) => e.categorie === cat);

  const etat = (id: string) => fetes.find((f) => f.id === id)?.active ?? false;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fond}>
        <View style={[styles.boiteListe, { backgroundColor: colors.surface }]}>
          <View style={styles.ligne}>
            <Text style={[styles.titre, { color: colors.text, flex: 1 }]}>🇩🇿 {t('admin.eventsTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '800' }}>✕</Text>
            </Pressable>
          </View>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('admin.eventsHint')}</Text>
          {echec ? <Text style={[typography.caption, { color: ROUGE }]}>{echec}</Text> : null}

          <ScrollView style={{ maxHeight: 420 }}>
            {(['memoire', 'religieux'] as const).map((cat) => (
              <View key={cat}>
                <Text style={[styles.rubrique, { color: colors.textMuted }]}>
                  {cat === 'memoire' ? t('admin.eventsMemory') : t('admin.eventsReligious')}
                </Text>
                {parCategorie(cat).map((e) => (
                  <View key={e.id} style={[styles.ligne, styles.ligneFete, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                        {e.icone} {t(`alertes.event.${e.id}.title`)}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {dateLisible(e.dateFixe, lang, t)} · {t('admin.autoStop', { n: e.arretAutoJours })}
                      </Text>
                    </View>
                    {enCours === e.id ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Switch
                        value={etat(e.id)}
                        onValueChange={(v) => void basculer(e.id, v)}
                        trackColor={{ true: VERT }}
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  carte: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center' },
  titre: { fontSize: 14, fontWeight: '800' as const },
  sousTitre: { fontSize: 12, fontWeight: '700' as const },
  case: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  lien: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  lienTexte: { fontSize: 12, fontWeight: '800' as const },
  bouton: { flex: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  boutonTexte: { fontSize: 13, fontWeight: '800' as const },
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: spacing.lg },
  boiteApercu: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  /* La banniere se place en absolu : on lui reserve la place pour qu'elle reste dans la boite. */
  scene: { height: 190 },
  badgeApercu: { fontSize: 12, fontWeight: '800' as const, textAlign: 'center' },
  boiteListe: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  champ: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14 },
  petit: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  rubrique: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0.5, marginTop: spacing.md, marginBottom: 4 },
  ligneFete: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, gap: spacing.sm },
});
