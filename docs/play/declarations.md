# Déclarations Google Play — ce qui a été répondu, et pourquoi

Ces formulaires sont des déclarations signées auprès de Google. Une réponse fausse ne vaut pas
un refus : elle vaut un retrait de l'application, parfois des mois plus tard. Ce fichier garde
donc la trace de chaque réponse ET de son fondement, pour qu'elle puisse être défendue ou
corrigée en connaissance de cause.

Compte développeur `8670402259399980487` · application `4974525116327150512` (`com.windz.app`).

---

## Fiche Play Store — fait

| Champ | Valeur |
|---|---|
| Nom affiché | WIN — Navigation Algérie |
| Description courte | Navigation, radars et signalements en Algérie, Tunisie et France. (65 / 80) |
| Description complète | 2 562 / 4 000 caractères (voir fiche-play.md) |
| Icône | `docs/play/icone-512.png` |
| Image de présentation | `docs/play/bandeau-1024x500.png` |
| Captures d'écran | **manquantes — 2 minimum exigées** |

## Canal de test fermé « Alpha » — fait

| | |
|---|---|
| Version | 47 (1.0.0), notes de version en français |
| Pays | Algérie, France, Tunisie |
| Testeurs | liste « testeurs win » rattachée — **5 personnes sur les 12 exigées** |

## Cible et contenu — fait

**18 ans et plus.** WIN est une application de conduite ; viser une tranche plus jeune
déclencherait les obligations du programme « Familles », qui n'ont aucun sens ici.

## Identifiant publicitaire — fait

**Non.** Vérifié dans le bundle lui-même : le manifeste de `win-v47.aab` ne contient ni
`AD_ID` ni `ADVERTISING_ID`. L'application n'affiche aucune publicité et n'embarque aucune
régie.

## Applis gouvernementales — fait

**Non.** WIN n'est éditée ni pour le compte d'une administration.

## Fonctionnalités financières — fait

**Aucune.** La version publiée sur Play est compilée avec `EXPO_PUBLIC_PAID_UNLOCKS=0` : le
déblocage payant de la Tunisie n'y existe pas. Aucun paiement, aucun abonnement, aucun achat
intégré.

## Applis de santé — contourné à la source

Google ouvrait cette déclaration pour une seule raison, qu'il énonce lui-même : le manifeste
contenait `android.permission.ACTIVITY_RECOGNITION`.

Cette permission ne venait pas de nous : `expo-sensors` la déclare pour son podomètre, et le
gestionnaire de paquets la fusionne dans notre manifeste. Or nous n'utilisons de cette
bibliothèque que `DeviceMotion`, pour la boussole de la Qibla, qui n'en a aucun besoin.

Elle est donc **bloquée** depuis la version 48 (`android.blockedPermissions` dans `app.json`).
Déclarer une fonctionnalité de santé que l'application n'a pas aurait été une fausse
déclaration ; supprimer une permission inutile est la bonne réponse, et c'est celle que Google
recommande dans le formulaire.

**Le bouton SOS n'est pas une fonctionnalité de santé** : il ouvre le composeur du téléphone
sur des numéros publics (14, 17, 16 en Algérie). Aucun contenu médical, aucun conseil, aucune
donnée de santé. À signaler si Google revenait dessus.

## Autorisations du service de premier plan — EN ATTENTE D'UNE VIDÉO

Tâche déclarée : **Navigation**.

Texte de la déclaration, à ressaisir tel quel (le formulaire ne permet pas de l'enregistrer
sans la vidéo) :

> WIN est une application de navigation routiere. Pendant un guidage, elle continue de lire la
> position du conducteur lorsque l'ecran est eteint ou qu'une autre application passe au
> premier plan : sans cela, le guidage s'arreterait au premier appel recu et le conducteur
> perdrait ses instructions en pleine route. Une notification permanente reste affichee pendant
> toute la duree du trajet ; elle disparait des que le guidage prend fin, et la lecture de la
> position s'arrete avec elle. Aucune position n'est lue en dehors d'un guidage demarre par
> l'utilisateur.

**Google exige un lien vidéo** montrant la fonctionnalité. À filmer : démarrer un guidage,
éteindre l'écran ou passer à une autre application, montrer la notification de navigation, puis
revenir à WIN. Déposer sur YouTube en « non répertoriée » et coller le lien.

## Sécurité des données — COMMENCÉ, À TERMINER

Attention : à l'ouverture, le formulaire s'était enregistré tout seul sur « aucune collecte de
données », ce qui est **faux**. Corrigé.

Réponses posées :

| Question | Réponse | Fondement |
|---|---|---|
| L'appli collecte-t-elle ou partage-t-elle des données ? | **Oui** | position, photos, identifiant d'appareil |
| Tout est-il chiffré en transit ? | **Oui** | tous les appels sont en HTTPS, vérifié |
| Création de compte | **Aucune** | l'application ne demande jamais de compte |
| Moyen de demander la suppression | **Oui** + lien vers la politique | elle décrit la marche à suivre au point 5 |

Restent les étapes 3 et 4 : les **types de données**. Ce qu'il faudra déclarer :

- **Position approximative et précise** — collectée. Finalité : fonctionnement de l'appli.
- **Photos** — collectées (celles jointes aux lieux). Publiées à l'initiative de l'utilisateur.
- **Identifiant d'appareil** — collecté (identifiant aléatoire tiré au premier lancement).

### Un point qui demande une décision

La recherche d'adresses appelle **photon.komoot.io** et **nominatim.openstreetmap.org**
DIRECTEMENT depuis le téléphone (`apps/mobile/src/search/geocode.ts`). Ce sont des tiers : la
position et le texte recherché leur parviennent.

Deux conséquences :

1. La politique de confidentialité ne les mentionne pas. **Elle devrait.**
2. Au sens de Google, il faudrait cocher « partagées avec des tiers » pour la position — ce qui
   affiche sur la fiche Play un bandeau « cette application peut partager votre position avec
   des tiers ».

L'alternative propre : faire passer ces deux appels par notre propre serveur, comme c'est déjà
le cas du calcul d'itinéraire. L'application ne parlerait alors qu'à notre API, la déclaration
redeviendrait « collectées, non partagées », et la politique resterait exacte. C'est un
chantier d'une demi-journée, pas davantage.
