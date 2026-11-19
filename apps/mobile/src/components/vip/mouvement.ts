import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * « L'UTILISATEUR A-T-IL DEMANDE A SON TELEPHONE D'ARRETER LES ANIMATIONS ? »
 *
 * Trois des cinq ameliorations de la fiche VIP bougent en boucle, sans fin : le lisere dore, la
 * brillance du badge, le point vert qui bat. C'est ce que le client veut, et sur la plupart des
 * telephones c'est exactement l'effet « carte Gold » recherche.
 *
 * Mais Android offre un reglage « Supprimer les animations », et les gens qui l'activent le font
 * pour une raison : vertiges, migraines, troubles vestibulaires, ou simplement un telephone
 * faible. Trois boucles infinies sur la meme fiche sont alors exactement ce qu'ils ont demande
 * a ne plus voir. On lit donc le reglage, et dans ce cas on rend les trois elements dans leur
 * etat STATIQUE — le lisere reste dore, le badge reste dore, le point reste vert.
 *
 * RIEN N'EST PERDU EN CHEMIN : la synthese elle-meme le dit pour le lisere, « un gradient
 * drawable statique suffit si l'animation est jugee trop lourde ». L'identification VIP tient a
 * l'or et a la bordure, pas au mouvement.
 */
export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(false);

  useEffect(() => {
    let vivant = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (vivant) setReduit(Boolean(v));
    });
    /* On ecoute aussi le changement : le reglage se modifie sans redemarrer l'application, et
     * une fiche restee ouverte continuerait sinon de clignoter apres que l'utilisateur vient
     * precisement de demander l'arret. */
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduit(Boolean(v)),
    );
    return () => {
      vivant = false;
      abonnement.remove();
    };
  }, []);

  return reduit;
}
