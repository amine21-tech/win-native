import { speakGuidance } from '../speech/voice';
import { useSpokenLanguage } from '../speech/useSpokenLanguage';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { haversine, type Language, type Report } from '../shared';
import { REPORT_GENRE } from '../reports/kinds';
import { locateOnRoute, traveledMeters, type Route } from './routing';
import { useSession } from '../store/session';

/** Le traducteur fige sur la langue PARLEE, dont le type vient d'i18next. */
type TFixe = ReturnType<ReturnType<typeof useTranslation>['i18n']['getFixedT']>;

type Coords = { lat: number; lon: number };

/**
 * DISTANCE D'ANNONCE : 100 METRES, ET LA VOIX LE DIT.
 *
 * Elle etait a cinquante. Le client le signale comme un defaut de securite, et il a raison :
 * a 80 km/h, cinquante metres sont deux secondes et demie — le temps de l'entendre, pas celui
 * de lever le pied, de regarder dans le retroviseur et de se rabattre. Cent metres en donnent
 * cinq, ce qui change la nature de l'information : elle cesse d'etre un constat pour redevenir
 * un avertissement.
 *
 * La valeur est aussi celle que la voix PRONONCE (<< dans 100 metres >>). Les deux ne doivent
 * pas pouvoir diverger, d'ou une seule constante pour les deux usages.
 */
export const ANNONCE_M = 100;

/**
 * Au-dela, le signalement se rearme — sinon un demi-tour ne redeclencherait jamais l'alerte.
 * L'ecart avec la distance d'annonce evite qu'un GPS qui oscille autour du seuil ne repete
 * l'annonce : il faut vraiment s'en eloigner pour qu'elle puisse revenir.
 */
const REARM_M = 200;

/**
 * Ecart maximal entre un signalement et le trace pour qu'il nous concerne.
 *
 * C'est la contrepartie indispensable du passage a cent metres. A cinquante, un signalement
 * pose sur la rue parallele etait rarement assez proche pour parler ; a cent, il l'est presque
 * toujours — et le conducteur entendrait << accident dans 100 metres >> pour un accident qui
 * n'est pas sur sa route. Trente-cinq metres couvrent une chaussee large et ses abords, sans
 * attraper la voie d'a cote.
 */
const SUR_LA_ROUTE_M = 35;

/** Position d'un signalement le long de l'itineraire, calculee une fois pour toutes. */
type SurTrace = { id: string; distanceDepuisDepart: number };

/**
 * Annonce vocale a l'approche d'un signalement pendant la navigation (checkBumpApproach en v83),
 * et ouverture simultanee de la carte « Toujours la ? » facon Waze — l'utilisateur VOIT et
 * ENTEND l'alerte au meme instant, comme le demande le client.
 *
 * Vaut pour TOUS les types de signalement, et pour ceux qui seront ajoutes plus tard : rien ici
 * n'enumere les types. Chaque signalement ne parle qu'une fois par passage.
 *
 * DEUX FACONS DE MESURER LA DISTANCE, et c'est le coeur de cette correction.
 *
 * Avec un itineraire, la distance est mesuree LE LONG DE LA ROUTE, et seuls les signalements
 * poses sur cette route, DEVANT le vehicule, comptent. C'est la seule mesure qui corresponde a
 * ce que la voix annonce : << dans 100 metres >> veut dire cent metres de conduite, pas cent
 * metres a vol d'oiseau par-dessus un immeuble.
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

  /** Signalements deja annonces pendant ce passage, par identifiant serveur. */
  const alertedRef = useRef<Set<string>>(new Set());
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
  const surTrace = useMemo<Map<string, SurTrace>>(() => {
    const table = new Map<string, SurTrace>();
    if (!route) return table;
    for (const r of reports) {
      const projection = locateOnRoute([r.lon, r.lat], route.geometry);
      if (projection.distanceM > SUR_LA_ROUTE_M) continue; // il n'est pas sur notre route
      table.set(r.id, { id: r.id, distanceDepuisDepart: traveledMeters(route, projection) });
    }
    return table;
  }, [route, reports]);

  const surTraceRef = useRef(surTrace);
  surTraceRef.current = surTrace;

  // Fin de navigation : tout se rearme pour le trajet suivant.
  useEffect(() => {
    if (!active) alertedRef.current.clear();
  }, [active]);

  useEffect(() => {
    if (!active || !position) return;

    for (const report of reportsRef.current) {
      /* Distance restante jusqu'au signalement, et les deux seuls cas qui existent.
       *
       * AVEC itineraire : on ne garde que ce qui est pose SUR notre route (la table ne
       * contient qu'eux) et la distance se compte le long de la chaussee. Un signalement
       * absent de la table est sur une autre rue : il ne nous concerne pas, on passe.
       *
       * SANS itineraire : on retombe sur la distance directe. C'est approximatif, mais le
       * conducteur roule quand meme et merite d'etre prevenu.
       *
       * Un signalement DERRIERE nous donne un reste negatif, ecarte par le test suivant : on
       * n'annonce pas ce qu'on vient de depasser. */
      let restant: number;
      if (route) {
        const place = surTraceRef.current.get(report.id);
        if (!place) continue;
        restant = place.distanceDepuisDepart - traveledRef.current;
      } else {
        restant = haversine(position.lat, position.lon, report.lat, report.lon);
      }

      const dejaDit = alertedRef.current.has(report.id);

      if (restant >= 0 && restant <= ANNONCE_M && !dejaDit) {
        alertedRef.current.add(report.id);

        if (voiceRef.current) {
          speakGuidance(phraseAnnonce(tRef.current, report), spokenLang);
        }

        onApproachRef.current(report);
      } else if (restant > REARM_M && dejaDit) {
        alertedRef.current.delete(report.id);
      }
    }
  }, [active, position, spokenLang, route]);
}

/**
 * « Barrage de police signale dans 100 metres. »
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
function phraseAnnonce(t: TFixe, report: Report): string {
  // Certains types portent un libelle different a l'oral : la carte affiche << Barrage >> avec
  // les trois ecussons, la voix doit dire laquelle des trois forces le tient.
  const label = t(`report.voice_${report.kind}`, { defaultValue: t(`report.${report.kind}`) });
  const genre = REPORT_GENRE[report.kind] ?? 'm';
  return t(`approach.announce_${genre}`, { label, metres: ANNONCE_M });
}
