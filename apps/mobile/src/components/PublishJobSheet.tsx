import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../api/client';
import { radius, spacing } from '../theme';
import { SECTEURS_EMPLOI } from './JobsSheet';
import {
  DUREES,
  FORMULES,
  FORMULES_EMPLOI,
  joursEmploi,
  prixEmploi,
  type DureeEmploi,
  type FormuleEmploi,
} from '../shared';

/**
 * MODULE EMPLOI — publication d'une annonce par un employeur (point 11, 27 octobre).
 *
 * TARIF ET DELAI SONT ANNONCES AVANT LE FORMULAIRE, pas apres. Un employeur qui decouvre
 * « 1 500 DA » une fois les huit champs remplis a le sentiment d'avoir ete mene ; l'annoncer
 * d'emblee est a la fois plus honnete et plus efficace — celui que le prix rebute s'arrete
 * tout de suite.
 *
 * CE QUI SE PASSE APRES L'ENVOI EST DIT AUSSI. L'annonce n'est pas publiee : elle attend que
 * le versement soit constate par un administrateur. Le taire laisserait l'employeur guetter
 * pendant des jours une annonce qui ne paraitra jamais parce qu'il n'a pas payé.
 *
 * Les couleurs sont celles de la maquette et sont FIGEES, comme le fond blanc de la feuille.
 */

const VERT = '#0B5B2C';
const OR = '#D4A017';
const FOND = '#FFFFFF';
const TEXTE = '#15201C';
const TEXTE_DOUX = '#5E6B64';
const PUCE = '#F3F4F6';
const ROUGE = '#C0392B';

/* CDI / CDD / Interim / Saisonnier (doc 196, 5.2). « Mission » quitte la SAISIE sans quitter
 * la base : des annonces le portent deja, et le serveur continue de l'accepter en lecture
 * comme en relecture. Le proposer encore n'aurait servi qu'a creer de nouvelles annonces dans
 * un vocabulaire que le client n'emploie plus. */
/** Les trois fonds de carte de la maquette du 29 octobre. */
const FONDS_FORMULE: Record<string, string> = {
  essentiel: '#F2F8F4',
  standard: '#FFF8E6',
  premium: '#FDF1F1',
};

const CONTRATS = ['cdi', 'cdd', 'interim', 'saisonnier'] as const;
const PAIEMENTS = ['baridimob', 'virement', 'email'] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Position de l'employeur : c'est d'elle que part le perimetre de 50 km. */
  position: { lat: number; lon: number } | null;
};

/* Pas de `onPublished` : une annonce qui vient d'etre envoyee est EN ATTENTE de paiement et
 * n'apparait donc dans aucune liste. Prevenir le parent ne lui donnerait rien a rafraichir. */
export function PublishJobSheet({ visible, onClose, position }: Props) {
  const { t } = useTranslation();
  /* La barre systeme Android ne doit JAMAIS etre couverte : le client l'ecrit deux fois. */
  const insets = useSafeAreaInsets();

  const [secteur, setSecteur] = useState<string | null>(null);
  const [titre, setTitre] = useState('');
  const [entreprise, setEntreprise] = useState('');
  const [contrat, setContrat] = useState<(typeof CONTRATS)[number]>('cdi');
  /* LA FORMULE ET LA DUREE sont deux choix separes, et c'est ce que demande le document :
   * << semaine ou mois au choix >> vaut pour les TROIS formules. Les melanger en six boutons
   * ferait relire six prix pour en comparer deux. */
  const [formule, setFormule] = useState<FormuleEmploi>('essentiel');
  const [duree, setDuree] = useState<DureeEmploi>('mois');
  const [salaire, setSalaire] = useState('');
  const [description, setDescription] = useState('');
  const [telephone, setTelephone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [viber, setViber] = useState('');
  const [email, setEmail] = useState('');
  const [paiement, setPaiement] = useState<(typeof PAIEMENTS)[number]>('baridimob');

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  const publier = async () => {
    if (!secteur) return setErreur(t('jobs.needSector'));
    if (titre.trim().length < 3) return setErreur(t('jobs.needTitle'));
    if (telephone.trim().length < 6) return setErreur(t('jobs.needPhone'));
    if (!position) return setErreur(t('jobs.needPosition'));

    setErreur(null);
    setEnvoi(true);
    try {
      await api('/jobs', {
        method: 'POST',
        body: {
          sector: secteur,
          title: titre.trim(),
          company: entreprise.trim() || undefined,
          contract: contrat,
          formule,
          duree,
          salary: salaire.trim() || undefined,
          description: description.trim() || undefined,
          phone: telephone.trim(),
          whatsapp: whatsapp.trim() || undefined,
          viber: viber.trim() || undefined,
          email: email.trim() || undefined,
          lat: position.lat,
          lon: position.lon,
          paymentMethod: paiement,
        },
      });
      setEnvoye(true);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : t('errors.unknown'));
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Fermer remet le formulaire a zero APRES un envoi reussi, et seulement dans ce cas.
   *
   * La distinction compte. Apres un envoi, garder les champs ferait reapparaitre l'annonce
   * precedente a la prochaine ouverture, et un employeur qui en publie deux a la suite
   * republierait la premiere sans s'en apercevoir. Mais fermer SANS avoir envoye — par erreur,
   * ou pour verifier un numero — ne doit rien effacer : il vient de taper huit champs.
   */
  const fermer = () => {
    if (envoye) {
      setSecteur(null);
      setTitre('');
      setEntreprise('');
      setContrat('cdi');
      setFormule('essentiel');
      setDuree('mois');
      setSalaire('');
      setDescription('');
      setTelephone('');
      setWhatsapp('');
      setViber('');
      setEmail('');
      setPaiement('baridimob');
      setEnvoye(false);
    }
    setErreur(null);
    onClose();
  };

  return (
    /* PLEIN ECRAN, comme l'ecran des offres (doc 196 v2.0). Un formulaire de douze champs dans
     * une feuille plafonnee a 92 % perdait ses derniers champs sous le bord de l'ecran des que
     * le clavier s'ouvrait — et le bouton d'envoi avec eux. */
    <Modal visible={visible} animationType="slide" onRequestClose={fermer} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.plein}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.contenu, { paddingTop: insets.top }]}>
          {/* Bandeau vert plein, comme l'ecran des offres : les deux appartiennent au meme
              module et doivent se reconnaitre comme tels. */}
          <View style={styles.bandeau}>
            <Pressable onPress={fermer} hitSlop={12} accessibilityRole="button">
              <Text style={styles.retour}>←</Text>
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.bandeauTitre}>{t('jobs.publishTitle')}</Text>
              <Text style={styles.bandeauSousTitre}>{t('jobs.employerSub')}</Text>
            </View>
          </View>

          {envoye ? (
            /* CE QUI RESTE A FAIRE, et rien d'autre. Apres l'envoi, l'employeur n'a plus qu'une
               question : quand mon annonce paraitra-t-elle ? On y repond sans le renvoyer vers
               un formulaire qu'il vient de remplir. */
            <View style={styles.confirme}>
              <Text style={styles.confirmeEmoji}>📨</Text>
              <Text style={styles.confirmeTitre}>{t('jobs.sentTitle')}</Text>
              {/* LE PRIX CITE EST CELUI DE SA FORMULE. Un message fige a 1 500 DA promettait
                  le tarif Essentiel a un employeur qui vient de choisir Premium a 5 000 — et
                  ce genre d'ecart ne se decouvre qu'au moment de payer. */}
              <Text style={styles.confirmeTexte}>
                {t('jobs.sentBody', {
                  prix: prixEmploi(formule, duree) ?? '—',
                  jours: joursEmploi(duree) ?? '—',
                })}
              </Text>
              <Pressable onPress={fermer} style={styles.valider}>
                <Text style={styles.validerTexte}>{t('jobs.close')}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.defilant}>
              {/* LE PRIX D'ABORD. Voir la note en tete de fichier. */}
              {/* LA CARTE DU TARIF, en or, avant tout le reste — maquette du client. Le montant
                  est a droite et en grand : c'est ce qu'on cherche des qu'on ouvre cet ecran. */}
              {/* LABEL EN TEXTE SIMPLE, pas en bande verte — c'est la maquette du 29 octobre.
                  Les bandes vertes decoupaient bien un formulaire de douze champs, mais elles
                  donnaient a « Tarif » le meme poids qu'a « Coordonnees », alors que le tarif
                  est la seule chose qu'on regarde en arrivant. Un simple intitule laisse les
                  trois cartes porter le regard. */}
              <Text style={styles.intituleSection}>{t('jobs.priceLabel')}</Text>

              {/* SEMAINE OU MOIS, au-dessus des formules et non dans chacune d'elles. Le
                  document dit << semaine ou mois au choix >> pour les TROIS : le demander une
                  fois evite de relire six prix pour en comparer deux, et le montant affiche
                  dans chaque carte suit immediatement ce choix. */}
              {/* LA MAQUETTE NE MONTRE AUCUN SELECTEUR DE DUREE : chaque carte y affiche les
                  deux prix separes par « ou ». Il en faut pourtant un, sans quoi l'application
                  ne peut pas savoir quel montant attendre — et l'administrateur non plus au
                  moment d'activer. Il est donc garde, mais ramene a deux petites pastilles
                  discretes, sous l'intitule qui parle deja de duree. */}
              <View style={styles.durees}>
                {DUREES.map((d) => {
                  const actif = duree === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDuree(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: actif }}
                      style={[
                        styles.duree,
                        actif ? { backgroundColor: VERT, borderColor: VERT } : { borderColor: PUCE },
                      ]}
                    >
                      <Text style={[styles.dureeTexte, { color: actif ? '#FFFFFF' : TEXTE }]}>
                        {t(`jobs.duration.${d}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* LES TROIS FORMULES, en cartes. Le prix de la duree choisie est en grand a
                  droite ; l'autre est rappele en petit, parce qu'on compare toujours les deux
                  avant de se decider. */}
              {FORMULES.map((f) => {
                const actif = formule === f;
                const autre = duree === 'mois' ? 'semaine' : 'mois';
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFormule(f)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: actif }}
                    style={[
                      styles.formule,
                      {
                        borderColor: actif ? OR : PUCE,
                        /* Les trois fonds de la maquette : vert tres pale pour Essentiel, or
                           pale pour Standard, rose pour Premium. Ils rangent les formules
                           avant qu'on ait lu un seul prix. */
                        backgroundColor: FONDS_FORMULE[f],
                      },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.formuleTitreLigne}>
                        <Text style={styles.formuleNom}>{t(`jobs.formula.${f}`)}</Text>
                        {/* Le badge POPULAIRE se pose TOUT SEUL sur Standard : c'est une regle
                            du document, pas un choix d'ecran. */}
                        {f === 'standard' ? (
                          <View style={styles.badgePopulaire}>
                            <Text style={styles.badgeTexte}>{t('jobs.popular')}</Text>
                          </View>
                        ) : null}
                        {FORMULES_EMPLOI[f].prioritaire ? (
                          <View style={styles.badgePrioritaire}>
                            <Text style={styles.badgeTexte}>{t('jobs.priority')}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.formuleDetail}>{t(`jobs.formulaDetail.${f}`)}</Text>
                      <Text style={styles.formuleAutre}>
                        {t('jobs.orPrice', {
                          prix: prixEmploi(f, autre) ?? '—',
                          duree: t(`jobs.durationShort.${autre}`),
                        })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.tarifMontant}>{prixEmploi(f, duree) ?? '—'} DA</Text>
                      <Text style={styles.tarifUnite}>{t(`jobs.durationShort.${duree}`)}</Text>
                    </View>

                    {/* LA PASTILLE RADIO, A DROITE, comme la maquette. Elle dit ce que la
                        bordure or seule disait mal : qu'on CHOISIT une formule parmi trois, et
                        non qu'on en consulte une mise en avant. */}
                    <View style={[styles.radio, actif ? styles.radioActif : null]}>
                      {actif ? <View style={styles.radioPoint} /> : null}
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.intituleSection}>{t('jobs.sectorLabel')}</Text>
              {/* GRILLE VISUELLE, comme la maquette : on choisit un secteur en le reconnaissant,
                  pas en lisant une liste deroulante. */}
              {/* DES CHIPS QUI S'ENROULENT, et non une grille de tuiles — c'est la maquette.
                  La grille donnait a chaque secteur une tuile de la taille d'un bouton, soit
                  quatre rangees pour douze secteurs : le formulaire commencait sous la ligne
                  de flottaison. Les chips tiennent en trois lignes et se lisent comme ce
                  qu'ils sont, une liste de choix. */}
              <View style={styles.chipsSecteurs}>
                {SECTEURS_EMPLOI.map((s) => {
                  const actif = secteur === s.cle;
                  return (
                    <Pressable
                      key={s.cle}
                      onPress={() => setSecteur(s.cle)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: actif }}
                      style={[styles.chipSecteur, actif ? styles.chipSecteurActif : null]}
                    >
                      <Text
                        style={[styles.chipSecteurTexte, actif ? styles.chipSecteurTexteActif : null]}
                        numberOfLines={1}
                      >
                        {t(`jobs.sector.${s.cle}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.intituleSection}>{t('jobs.detailsSection')}</Text>
              <Champ
                label={t('jobs.jobTitle')}
                valeur={titre}
                onChange={setTitre}
                indice={t('jobs.jobTitleHint')}
                obligatoire
              />
              <Champ label={t('jobs.company')} valeur={entreprise} onChange={setEntreprise} />

              <Text style={styles.intituleSection}>{t('jobs.contractLabel')}</Text>
              <View style={styles.rangee}>
                {CONTRATS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setContrat(c)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: contrat === c }}
                    style={[styles.option, contrat === c ? styles.optionActive : null]}
                  >
                    <Text style={[styles.optionTexte, contrat === c ? styles.optionTexteActif : null]}>
                      {t(`jobs.contract.${c}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Champ label={t('jobs.salary')} valeur={salaire} onChange={setSalaire} indice={t('jobs.salaryHint')} />
              <Champ label={t('jobs.description')} valeur={description} onChange={setDescription} lignes={4} />

              <Text style={styles.intituleSection}>{t('jobs.contactSection')}</Text>
              <Champ
                label={t('jobs.phone')}
                valeur={telephone}
                onChange={setTelephone}
                indice="0550 000 000"
                clavier="phone-pad"
                obligatoire
              />
              <Champ label="WhatsApp" valeur={whatsapp} onChange={setWhatsapp} clavier="phone-pad" />
              <Champ label="Viber" valeur={viber} onChange={setViber} clavier="phone-pad" />
              <Champ label="Email" valeur={email} onChange={setEmail} clavier="email-address" />

              <Text style={styles.intituleSection}>{t('jobs.paymentSection')}</Text>
              <View style={styles.colonne}>
                {PAIEMENTS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPaiement(p)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: paiement === p }}
                    style={[styles.paiement, paiement === p ? styles.paiementActif : null]}
                  >
                    <Text style={[styles.paiementTitre, paiement === p ? { color: VERT } : null]}>
                      {t(`jobs.payment.${p}`)}
                    </Text>
                    <Text style={styles.paiementDetail}>{t(`jobs.paymentHint.${p}`)}</Text>
                  </Pressable>
                ))}
              </View>

              {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

              <Pressable
                onPress={() => void publier()}
                disabled={envoi}
                accessibilityRole="button"
                style={({ pressed }) => [styles.valider, { opacity: pressed || envoi ? 0.8 : 1 }]}
              >
                {envoi ? (
                  <ActivityIndicator color="#2A1F00" />
                ) : (
                  <Text style={styles.validerTexte}>{t('jobs.send')}</Text>
                )}
              </Pressable>
              <View style={{ height: spacing.xl + insets.bottom }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Bande de section verte — maquette du client.
 *
 * Un formulaire de douze champs se lit mal d'un trait. Les bandes le decoupent en quatre temps
 * — le secteur, l'offre, les contacts, le paiement — et chacun se remplit sans avoir a tenir
 * les autres en tete. C'est aussi ce qui permet de savoir ou l'on en est en faisant defiler.
 */
function Bande({ titre }: { titre: string }) {
  return (
    <View style={styles.bande}>
      <Text style={styles.bandeTexte}>{titre.toUpperCase()}</Text>
    </View>
  );
}

function Champ({
  label,
  valeur,
  onChange,
  indice,
  lignes = 1,
  clavier,
  obligatoire = false,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  indice?: string;
  lignes?: number;
  clavier?: 'phone-pad' | 'email-address';
  obligatoire?: boolean;
}) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.label}>
        {label}
        {obligatoire ? <Text style={{ color: ROUGE }}> *</Text> : null}
      </Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={indice}
        placeholderTextColor={TEXTE_DOUX}
        keyboardType={clavier}
        multiline={lignes > 1}
        numberOfLines={lignes}
        style={[styles.saisie, lignes > 1 ? { height: 22 * lignes, textAlignVertical: 'top' } : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plein: { flex: 1, backgroundColor: FOND },
  contenu: { flex: 1, backgroundColor: FOND },
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
  defilant: { flexShrink: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  /* L'intitule de section : gras, sombre, suivi de deux-points — la maquette n'a plus de
   * bandes vertes. */
  chipsSecteurs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipSecteur: {
    borderWidth: 1.5,
    borderColor: PUCE,
    backgroundColor: FOND,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSecteurActif: { backgroundColor: VERT, borderColor: VERT },
  chipSecteurTexte: { color: TEXTE_DOUX, fontSize: 12.5, fontWeight: '700' as const },
  chipSecteurTexteActif: { color: '#FFFFFF' },

  intituleSection: { color: TEXTE, fontSize: 14.5, fontWeight: '800' as const, marginTop: spacing.md, marginBottom: spacing.sm },

  durees: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  duree: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dureeTexte: { fontSize: 14, fontWeight: '800' as const },

  formule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: PUCE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActif: { borderColor: OR },
  radioPoint: { width: 10, height: 10, borderRadius: 5, backgroundColor: OR },

  formuleTitreLigne: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  formuleNom: { color: TEXTE, fontSize: 15, fontWeight: '800' as const },
  formuleDetail: { color: TEXTE_DOUX, fontSize: 12, marginTop: 2 },
  formuleAutre: { color: TEXTE_DOUX, fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  badgePopulaire: { backgroundColor: OR, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgePrioritaire: { backgroundColor: VERT, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeTexte: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' as const },

  tarif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: `${OR}1F`,
    borderWidth: 1.5,
    borderColor: OR,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tarifLibelle: { color: '#8A6A10', fontSize: 13.5, fontWeight: '800' as const },
  tarifMontant: { color: '#8A6A10', fontSize: 22, fontWeight: '800' as const },
  tarifUnite: { color: '#8A6A10', fontSize: 11, fontWeight: '700' as const },
  tarifDetail: { color: TEXTE_DOUX, fontSize: 12, marginTop: 2 },

  bande: {
    backgroundColor: VERT,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    marginTop: spacing.lg,
  },
  bandeTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const, letterSpacing: 0.6 },
  label: { color: TEXTE_DOUX, fontSize: 12, fontWeight: '700' as const, marginTop: spacing.md, marginBottom: 4 },
  saisie: {
    borderWidth: 1,
    borderColor: PUCE,
    backgroundColor: PUCE,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: TEXTE,
    fontSize: 14,
  },

  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  caseSecteur: {
    width: '30%',
    borderWidth: 1.5,
    borderColor: PUCE,
    backgroundColor: PUCE,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  caseSecteurActive: { borderColor: VERT, backgroundColor: '#EAF3EE' },
  caseEmoji: { fontSize: 22 },
  caseTexte: { color: TEXTE_DOUX, fontSize: 11, fontWeight: '700' as const },
  caseTexteActif: { color: VERT },

  rangee: { flexDirection: 'row', gap: spacing.sm },
  colonne: { gap: spacing.sm, marginTop: spacing.sm },
  option: { flex: 1, borderWidth: 1.5, borderColor: PUCE, backgroundColor: PUCE, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  optionActive: { borderColor: VERT, backgroundColor: '#EAF3EE' },
  optionTexte: { color: TEXTE_DOUX, fontSize: 13, fontWeight: '800' as const },
  optionTexteActif: { color: VERT },

  paiement: { borderWidth: 1.5, borderColor: PUCE, backgroundColor: PUCE, borderRadius: radius.md, padding: spacing.md },
  paiementActif: { borderColor: VERT, backgroundColor: '#EAF3EE' },
  paiementTitre: { color: TEXTE, fontSize: 14, fontWeight: '800' as const },
  paiementDetail: { color: TEXTE_DOUX, fontSize: 12, marginTop: 2 },

  erreur: { color: ROUGE, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },

  /* LE BOUTON D'ENVOI EST OR, pas vert — maquette du client. Ce n'est pas une coquetterie :
   * l'or est, dans tout le module, la couleur de ce qui concerne l'employeur et l'argent, le
   * vert celle de ce qui concerne le conducteur. Un bouton vert ici brouillerait cette
   * distinction au moment ou elle compte le plus. */
  valider: {
    backgroundColor: OR,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  validerTexte: { color: '#2A1F00', fontSize: 15, fontWeight: '800' as const },

  confirme: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  confirmeEmoji: { fontSize: 44 },
  confirmeTitre: { color: TEXTE, fontSize: 18, fontWeight: '800' as const },
  confirmeTexte: { color: TEXTE_DOUX, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
