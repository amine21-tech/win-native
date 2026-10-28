import { speakGuidance } from '../speech/voice';
import { useSpokenLanguage } from '../speech/useSpokenLanguage';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type Language, type Report } from '../shared';
import { REPORT_GENRE } from '../reports/kinds';
import { type Route } from './routing';
/* Les trois regles de l'alerte vivent a part, pour etre eprouvees hors de l'application :
 * voir alerteApproche.ts et scripts/verifier-alertes.ts. */
import {
  decisionAnnonce,
  projeterSurTrace,
  resteAvantSignalement,
  type SurTrace,
} from './alerteApproche';
import { useSession } from '../store/session';

/** Le traducteur fige sur la langue PARLEE, dont le type vient d'i18next. */
type TFixe = ReturnType<ReturnType<typeof useTranslation>['i18n']['getFixedT']>;

type Coords = { lat: number; lon: number };

/* Re-exportes : c'est d'ici qu'on les importait avant que les regles ne soient isolees. */
export { PALIERS_M } from './alerteApproche';


/**
 * Annonce vocale a l'approche d'un signalement pendant la navigation (checkBumpApproach en v83),
 * et ouverture simultanee de la carte « Toujours la ? » facon Waze — l'utilisateur VOIT et
 * ENTEND l'alerte au meme instant, comme le demande le client.
 *
 * Vaut pour TOUS les types de signalement, et pour ceux qui seront ajoutes plus tard : rien ici
 * n'enumere les types. Chaque signalement parle a DEUX PALIERS par passage, 200 m puis 100 m
 * (demande du client, 28 octobre) — et pas une fois de plus.
 *
 * DANS LES DEUX SENS DE CIRCULATION, et sans guidage (point 13 du client). Un signalement est un
 * point GPS qui appartient a la ROUTE, pas a un sens : aucun filtre de direction n'existe nulle
 * part. Il ne manquait que de laisser l'alerte tourner hors navigation — sur le trajet qu'on
 * fait tous les jours, personne ne lance d'itineraire.
 *
 * DEUX FACONS DE MESURER LA DISTANCE, et c'est le coeur de cette correction.
 *
 * Avec un itineraire, la distance est mesuree LE LONG DE LA ROUTE, et seuls les signalements
 * poses sur cette route, DEVANT le vehicule, comptent. C'est la seule mesure qui corresponde a
 * ce que la voix annonce : << dans 200 metres >> veut dire deux cents metres de conduite, pas
 * deux cents metres a vol d'oiseau par-dessus un immeuble.
 *
 * Sans itineraire — le temps qu'il se calcule, ou apres un ecart — on retombe sur la distance
 * directe. Mieux vaut une annonce approximative que pas d'annonce du tout.
 */
export function useApproachAlerts(params: {
  active: boolean;
  position: Coords | null;
  reports: Report[];
  lang: Language;
  /** Itineraire suivi, quand il existe : permet de mesurer le long de la route. */
  route: Route | null;
  /** Distance deja parcourue sur cet itineraire, en metres. */
  traveledM: number;
  onApproach: (report: Report) => void;
}) {
  const { active, position, reports, lang, route, traveledM, onApproach } = params;
  const { i18n } = useTranslation();
  // Alerte parlee dans la langue que le telephone sait prononcer (voir useSpokenLanguage).
  const spokenLang = useSpokenLanguage(lang);
  const t = i18n.getFixedT(spokenLang);
  const voiceGuidanceEnabled = useSession((s) => s.voiceGuidanceEnabled);

  /**
   * Paliers deja traites pendant ce passage, par identifiant de signalement.
   *
   * Un ENSEMBLE DE PALIERS par signalement, et non un simple « deja dit » : depuis le
   * 28 octobre la voix previent deux fois, a 200 m puis a 100 m. Le second palier doit donc
   * pouvoir parler alors que le premier a deja parle.
   */
  const alertedRef = useRef<Map<string, Set<number>>>(new Map());

  /**
   * Reste mesure au point GPS PRECEDENT, par signalement.
   *
   * Hors itineraire la distance est a vol d'oiseau et ne porte aucun signe : cent metres devant
   * et cent metres derriere se ressemblent. Comparer a la mesure d'avant est le seul moyen de
   * savoir si l'on s'approche ou si l'on s'en va — et c'est ce qui permet d'alerter dans les
   * deux sens de circulation sans annoncer ce qu'on vient de depasser.
   */
  const precedentRef = useRef<Map<string, number>>(new Map());
  // Refs plutot que dependances : ces valeurs changent a chaque frappe GPS ou re-rendu, et
  // l'effet ne doit se declencher que sur un vrai deplacement.
  const onApproachRef = useRef(onApproach);
  onApproachRef.current = onApproach;
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const voiceRef = useRef(voiceGuidanceEnabled);
  voiceRef.current = voiceGuidanceEnabled;
  const tRef = useRef(t);
  tRef.current = t;
  const traveledRef = useRef(traveledM);
  traveledRef.current = traveledM;

  /**
   * Chaque signalement est projete sur l'itineraire UNE SEULE FOIS, pas a chaque seconde.
   *
   * La projection parcourt toute la geometrie du trajet — plusieurs milliers de points sur un
   * Alger-Oran. La refaire pour treize signalements a chaque point GPS reviendrait a balayer
   * le trajet entier une fois par seconde, pour une reponse qui ne change pas : ni le trace ni
   * la position des signalements ne bougent entre deux mesures.
   */
  const surTrace = useMemo<Map<string, SurTrace>>(
    () => projeterSurTrace(route, reports),
    [route, reports],
  );

  const surTraceRef = useRef(surTrace);
  surTraceRef.current = surTrace;

  // Fin de navigation : tout se rearme pour le trajet suivant.
  useEffect(() => {
    if (!active) {
      alertedRef.current.clear();
      precedentRef.current.clear();
    }
  }, [active]);

  useEffect(() => {
    if (!active || !position) return;

    for (const report of reportsRef.current) {
      /* Le calcul de la distance restante et la decision sont des fonctions pures, eprouvees
       * hors de l'application : on n'annonce pas ce qu'on vient de depasser, ni ce qui est
       * pose sur la rue d'a cote. */
      const restant = resteAvantSignalement({
        report,
        route,
        surTrace: surTraceRef.current,
        traveledM: traveledRef.current,
        position,
      });

      const dejaDits = alertedRef.current.get(report.id) ?? new Set<number>();
      const precedent = precedentRef.current.get(report.id) ?? null;
      const decision = decisionAnnonce({
        restant,
        precedent,
        dejaDits,
        surItineraire: route != null,
      });

      // La mesure de ce tour devient la reference du suivant, quelle que soit la decision.
      if (restant != null) precedentRef.current.set(report.id, restant);

      if (decision.quoi === 'rearmer') {
        alertedRef.current.delete(report.id);
        continue;
      }

      if (decision.consommes.length > 0) {
        for (const palier of decision.consommes) dejaDits.add(palier);
        alertedRef.current.set(report.id, dejaDits);
      }

      if (decision.quoi === 'annoncer') {
        if (voiceRef.current) {
          speakGuidance(phraseAnnonce(tRef.current, report, decision.palierM!), spokenLang);
        }

        /* La carte « Toujours la ? » se rouvre au second palier. Le signalement est le MEME
         * objet : la fenetre ne se demonte pas, son minuteur de six secondes repart. */
        onApproachRef.current(report);
      }
    }
  }, [active, position, spokenLang, route]);
}

/**
 * « Barrage de police signale dans 200 metres. »
 *
 * LE FRANCAIS ACCORDE LE PARTICIPE, ce que la concatenation ne sait pas faire : on dit
 * << travaux signalES >>, << inondation signalEE >>, << accident signalE >>. Coller un mot
 * invariable derriere le libelle aurait donne une phrase fautive une fois sur quatre, dite a
 * voix haute, en boucle, a des conducteurs algeriens. Le type porte donc son genre et son
 * nombre (voir REPORT_GENRE), et la phrase existe en trois formes.
 *
 * Rien n'enumere les types ici : un type ajoute demain est annonce sans qu'on y touche, comme
 * le demande le client. S'il oublie de declarer son genre, il sera masculin singulier — la
 * forme la plus courante, et une phrase correcte dans le doute.
 */
function phraseAnnonce(t: TFixe, report: Report, metres: number): string {
  // Certains types portent un libelle different a l'oral : la carte affiche << Barrage >> avec
  // les trois ecussons, la voix doit dire laquelle des trois forces le tient.
  const label = t(`report.voice_${report.kind}`, { defaultValue: t(`report.${report.kind}`) });
  const genre = REPORT_GENRE[report.kind] ?? 'm';
  // `metres` est le palier ATTEINT, pas une constante : la voix dit 200 puis 100.
  return t(`approach.announce_${genre}`, { label, metres });
}
