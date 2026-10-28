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
import { ApiError, api } from '../api/client';
import { radius, spacing } from '../theme';
import { SECTEURS_EMPLOI } from './JobsSheet';

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

const CONTRATS = ['cdi', 'cdd', 'mission'] as const;
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

  const [secteur, setSecteur] = useState<string | null>(null);
  const [titre, setTitre] = useState('');
  const [entreprise, setEntreprise] = useState('');
  const [contrat, setContrat] = useState<(typeof CONTRATS)[number]>('cdi');
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={fermer}>
      <Pressable style={styles.voile} onPress={envoi ? undefined : fermer} />

      <KeyboardAvoidingView
        style={styles.bas}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={styles.feuille}>
          <View style={styles.tete}>
            <Text style={styles.titre}>{t('jobs.publishTitle')}</Text>
            <Pressable onPress={fermer} hitSlop={12} accessibilityRole="button">
              <Text style={styles.fermer}>✕</Text>
            </Pressable>
          </View>

          {envoye ? (
            /* CE QUI RESTE A FAIRE, et rien d'autre. Apres l'envoi, l'employeur n'a plus qu'une
               question : quand mon annonce paraitra-t-elle ? On y repond sans le renvoyer vers
               un formulaire qu'il vient de remplir. */
            <View style={styles.confirme}>
              <Text style={styles.confirmeEmoji}>📨</Text>
              <Text style={styles.confirmeTitre}>{t('jobs.sentTitle')}</Text>
              <Text style={styles.confirmeTexte}>{t('jobs.sentBody')}</Text>
              <Pressable onPress={fermer} style={styles.valider}>
                <Text style={styles.validerTexte}>{t('jobs.close')}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.defilant}>
              {/* LE PRIX D'ABORD. Voir la note en tete de fichier. */}
              <View style={styles.tarif}>
                <Text style={styles.tarifMontant}>{t('jobs.price')}</Text>
                <Text style={styles.tarifDetail}>{t('jobs.priceDetail')}</Text>
              </View>

              <Text style={styles.label}>{t('jobs.sectorLabel')}</Text>
              {/* GRILLE VISUELLE, comme la maquette : on choisit un secteur en le reconnaissant,
                  pas en lisant une liste deroulante. */}
              <View style={styles.grille}>
                {SECTEURS_EMPLOI.map((s) => {
                  const actif = secteur === s.cle;
                  return (
                    <Pressable
                      key={s.cle}
                      onPress={() => setSecteur(s.cle)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: actif }}
                      style={[styles.caseSecteur, actif ? styles.caseSecteurActive : null]}
                    >
                      <Text style={styles.caseEmoji}>{s.emoji}</Text>
                      <Text
                        style={[styles.caseTexte, actif ? styles.caseTexteActif : null]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {t(`jobs.sector.${s.cle}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Champ label={t('jobs.jobTitle')} valeur={titre} onChange={setTitre} obligatoire />
              <Champ label={t('jobs.company')} valeur={entreprise} onChange={setEntreprise} />

              <Text style={styles.label}>{t('jobs.contractLabel')}</Text>
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

              <Text style={styles.section}>{t('jobs.contactSection')}</Text>
              <Champ label={t('jobs.phone')} valeur={telephone} onChange={setTelephone} clavier="phone-pad" obligatoire />
              <Champ label="WhatsApp" valeur={whatsapp} onChange={setWhatsapp} clavier="phone-pad" />
              <Champ label="Viber" valeur={viber} onChange={setViber} clavier="phone-pad" />
              <Champ label="Email" valeur={email} onChange={setEmail} clavier="email-address" />

              <Text style={styles.section}>{t('jobs.paymentSection')}</Text>
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
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.validerTexte}>{t('jobs.send')}</Text>
                )}
              </Pressable>
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  voile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(21,32,28,0.45)' },
  bas: { flex: 1, justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: FOND,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '92%',
  },
  tete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titre: { flex: 1, color: TEXTE, fontSize: 20, fontWeight: '800' as const },
  fermer: { color: TEXTE_DOUX, fontSize: 18 },
  defilant: { flexShrink: 1, marginTop: spacing.sm },

  tarif: { backgroundColor: `${OR}1F`, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  tarifMontant: { color: '#8A6A10', fontSize: 20, fontWeight: '800' as const },
  tarifDetail: { color: TEXTE_DOUX, fontSize: 12.5, marginTop: 2, textAlign: 'center' },

  section: { color: TEXTE, fontSize: 15, fontWeight: '800' as const, marginTop: spacing.lg },
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

  valider: {
    backgroundColor: VERT,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  validerTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' as const },

  confirme: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  confirmeEmoji: { fontSize: 44 },
  confirmeTitre: { color: TEXTE, fontSize: 18, fontWeight: '800' as const },
  confirmeTexte: { color: TEXTE_DOUX, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
