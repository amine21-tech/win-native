import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

/**
 * Service de premier plan : le guidage continue ecran eteint et application quittee.
 *
 * Ce qui se passait avant : le suivi reposait sur `watchPositionAsync` seul. Android coupe les
 * mesures de position d'une application qui passe en arriere-plan, et suspend ses minuteries
 * des que l'ecran s'eteint. Autrement dit, le guidage s'arretait — position figee, plus aucune
 * consigne vocale — des que le conducteur eteignait l'ecran ou prenait un appel. En voiture,
 * c'est precisement la que l'on en a besoin.
 *
 * Android n'accorde les mesures en arriere-plan qu'a un service de premier plan, c'est-a-dire un
 * service accompagne d'une notification permanente : l'utilisateur voit toujours qu'une
 * application le localise. C'est ainsi que fonctionnent Google Maps et Waze, et c'est ce que
 * `startLocationUpdatesAsync` met en place ici. La notification sert aussi de raccourci pour
 * revenir a l'itineraire.
 *
 * La tache est declaree AU CHARGEMENT DU MODULE, et non au demarrage du guidage : Android peut
 * relancer le processus pour delivrer une position, et il faut alors que la tache soit deja
 * connue. C'est la regle d'expo-task-manager.
 */
export const NAV_LOCATION_TASK = 'win-navigation-location';

type CoordsHandler = (coords: Location.LocationObjectCoords) => void;

/* Le destinataire des mesures. Une simple variable de module, et non un contexte React : la
 * tache peut s'executer alors qu'aucun composant n'est monte. */
let handler: CoordsHandler | null = null;

export function setServiceFixHandler(fn: CoordsHandler | null): void {
  handler = fn;
}

// La signature attendue est asynchrone, d'ou le `async` : le traitement, lui, est immediat.
TaskManager.defineTask(NAV_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  // Android groupe parfois plusieurs mesures : seule la derniere decrit ou l'on est.
  const last = locations?.[locations.length - 1];
  if (last && handler) handler(last.coords);
});

/**
 * Demarre le service. Rend `false` si Android le refuse — l'appelant garde alors le suivi
 * ordinaire, qui fonctionne tant que l'application reste a l'ecran. Un guidage degrade vaut
 * mieux qu'un guidage absent.
 */
export async function startNavigationService(labels: { title: string; body: string }): Promise<boolean> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(NAV_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(NAV_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      // Android met en pause les mesures quand il juge l'appareil immobile. En navigation,
      // cela fige le guidage a un feu rouge.
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: labels.title,
        notificationBody: labels.body,
        notificationColor: '#0D6E4F',
        // Le service survit a la fermeture de l'ecran d'accueil : c'est tout l'objet.
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Arrete le service et retire la notification. Ne leve jamais. */
export async function stopNavigationService(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(NAV_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(NAV_LOCATION_TASK);
    }
  } catch {
    /* service deja arrete, ou jamais demarre */
  }
}
