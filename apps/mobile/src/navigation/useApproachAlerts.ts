import { speakGuidance } from '../speech/voice';
import { useSpokenLanguage } from '../speech/useSpokenLanguage';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { haversine, type Language, type Report } from '../shared';
import { useSession } from '../store/session';

type Coords = { lat: number; lon: number };

/** Distance a laquelle on previent : ~50 m laissent le temps de lever le pied. */
const WARN_RADIUS_M = 50;
/** Au-dela, le signalement se rearme — sinon un demi-tour ne redeclencherait jamais l'alerte.
 * L'ecart avec WARN_RADIUS_M evite qu'un GPS qui oscille autour du seuil ne repete l'annonce. */
const REARM_RADIUS_M = 120;

/**
 * Annonce vocale a l'approche d'un signalement pendant la navigation (checkBumpApproach en v83),
 * et ouverture simultanee de la carte « Toujours la ? » facon Waze.
 *
 * Vaut pour TOUS les types de signalement, pas seulement les dos d'ane : un bouchon ou une route
 * inondee non annonces sont exactement ce qui rendait l'ancienne version dangereuse a l'usage.
 * Chaque signalement ne parle qu'une fois par passage.
 */
export function useApproachAlerts(params: {
  active: boolean;
  position: Coords | null;
  reports: Report[];
  lang: Language;
  onApproach: (report: Report) => void;
}) {
  const { active, position, reports, lang, onApproach } = params;
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

  // Fin de navigation : tout se rearme pour le trajet suivant.
  useEffect(() => {
    if (!active) alertedRef.current.clear();
  }, [active]);

  useEffect(() => {
    if (!active || !position) return;

    for (const report of reportsRef.current) {
      const distance = haversine(position.lat, position.lon, report.lat, report.lon);
      const alreadyWarned = alertedRef.current.has(report.id);

      if (distance < WARN_RADIUS_M && !alreadyWarned) {
        alertedRef.current.add(report.id);

        if (voiceRef.current) {
          // Compose a partir du libelle deja traduit du type : « Attention, » + « dos d'ane ».
          const label = String(tRef.current(`report.${report.kind}`)).toLocaleLowerCase();
          speakGuidance(`${tRef.current('approach.prefix')} ${label}`, spokenLang);
        }

        onApproachRef.current(report);
      } else if (distance > REARM_RADIUS_M && alreadyWarned) {
        alertedRef.current.delete(report.id);
      }
    }
  }, [active, position, spokenLang]);
}
