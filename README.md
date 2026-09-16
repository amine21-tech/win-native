# WIN — application native

Réécriture complète de WIN en Node.js : une API Fastify sur PostGIS, et une
application React Native (Expo) qui produit un APK Android et un build iOS.

La version web `win-v83` reste en production pendant toute la durée du
chantier. Ce dépôt ne la touche pas.

```
win-native/
├── apps/
│   ├── api/          API Fastify + PostgreSQL/PostGIS + Socket.io
│   └── mobile/       Application Expo / React Native
├── packages/
│   └── shared/       Types, schémas de validation et constantes partagés
└── docker-compose.yml
```

`packages/shared` est le point important : les types de signalement, le seuil
de suppression par vote, les catégories de lieux et les schémas de validation
y sont écrits **une seule fois**. Le serveur et l'application les importent
tous les deux, donc ils ne peuvent plus diverger — c'est exactement ce qui
arrivait quand `index.html` et `server.js` définissaient chacun leur liste.

---

## Démarrage

Prérequis : Node 22 ou plus, et Docker.

```bash
npm install
cp apps/api/.env.example apps/api/.env
# générer un vrai secret :
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# ... et le coller dans JWT_SECRET

npm run infra:up        # PostgreSQL + PostGIS + Redis
npm run build           # compile packages/shared, dont l'API dépend
npm run db:push         # crée les tables
npm run api:dev         # API sur http://localhost:3001
```

Vérification :

```bash
curl http://localhost:3001/status
curl http://localhost:3001/status/full   # base, PostGIS et Valhalla
```

### Compte administrateur

```bash
npm run seed:admin -w @win/api -- --email vous@exemple.dz --name "Amiir" --role admin
```

Le mot de passe est demandé au clavier, jamais passé en argument.
Ce compte remplace le code `1154` qui était écrit en dur dans `index.html` —
donc lisible par quiconque affichait le code source de la page.

---

## Migration des données existantes

**À faire avant toute chose : récupérer les vrais fichiers depuis le VPS.**
La copie présente dans `Downloads` date du 9 août et il lui manque tout ce qui
a été ajouté depuis (édition et suppression d'adresses, journal de modération,
classement des contributeurs, déclassement VIP, vote « n'existe plus »).

```bash
# sur le VPS
tar czf ~/win-data.tgz -C ~/winbackend data

# en local, après téléchargement
tar xzf win-data.tgz -C /tmp
npm run migrate:legacy -w @win/api -- --source /tmp/data/db --dry-run
```

Le mode `--dry-run` n'écrit rien et affiche un rapport ligne à ligne : combien
d'enregistrements lus, combien importables, et lesquels sont écartés avec la
raison. **On ne relance sans `--dry-run` que lorsque ce rapport est propre.**

Le script est rejouable : chaque enregistrement conserve son identifiant
d'origine dans `legacy_id`, donc un second passage ne crée pas de doublon.

---

## Déploiement sur le VPS

Le pas-à-pas complet est dans **`deploy-guide.html`** (ouvrez-le dans un
navigateur) : sauvegardes, envoi du code, configuration, démarrage, migration
des données, Nginx, compilation de l'APK, et retour arrière.

En résumé, l'API tourne en conteneur — le VPS garde son Node 20 pour l'ancien
backend, qui continue de fonctionner :

```bash
cd ~/win-native
cp .env.example .env && cp apps/api/.env.example apps/api/.env   # puis renseigner les secrets
docker compose up -d --build
docker compose exec api node dist/src/db/migrate.js
```

Nginx expose la nouvelle API sous `/v2/` (port 3002, lié à `127.0.0.1`), sans
toucher à `/`, `/api/`, `/uploads/`, `/socket.io/` ni `/valhalla/`. Le bloc à
coller est dans `deploy/nginx-win-v2.conf`.

---

## Application mobile

```bash
cd apps/mobile
npm install
npx expo start          # développement, avec Expo Go ou un dev client
```

Pour un APK installable, sous Windows, une seule commande depuis `apps\mobile` :

```powershell
.\build-apk.ps1
```

Le script vérifie Node, installe les dépendances, compile `@win/shared`, met en
place `eas-cli`, crée le projet Expo au premier lancement, puis lance la
compilation. **Rien ne se compile sur votre PC** : le code part chez Expo, qui
renvoie un lien de téléchargement pour le `.apk`. Ni Android Studio ni le SDK
Android ne sont nécessaires.

L'équivalent à la main :

```bash
npm install -g eas-cli
eas login
eas init
npm run build:apk
```

Pour iOS, `npm run build:store` compile sur les serveurs macOS d'Expo : **un
Mac n'est pas nécessaire**. Il faut en revanche un compte Apple Developer.

---

## Routes de l'API

| Méthode | Route | Accès |
|---|---|---|
| `GET` | `/status`, `/status/full` | public |
| `POST` | `/devices/register`, `/devices/heartbeat` | public / appareil |
| `GET` | `/places/search`, `/places/in-bounds`, `/places/:id` | public |
| `GET` | `/places/check-duplicate` | public |
| `POST` | `/places` | appareil |
| `PATCH`, `DELETE` | `/places/:id` | administrateur |
| `GET` | `/reports/nearby` | public |
| `POST` | `/reports`, `/reports/:id/vote` | appareil |
| `POST` | `/corrections`, `/partner-leads` | public |
| `GET` | `/contributors/me`, `/contributors/top` | appareil / public |
| `GET` | `/partners` | public |
| `POST` | `/partners/:id/declass`, `/reclass` | administrateur |
| `POST` | `/photos` | appareil |
| `POST` | `/routing/route` | public (débit limité) |
| `POST` | `/admin/login` | public (débit limité) |
| `GET` | `/admin/corrections`, `/admin/moderation-log` | administrateur |
| `POST` | `/admin/moderation-log/:id/restore` | administrateur |

Temps réel : `socket.io` sur `/socket.io/`. L'application envoie
`subscribe { lat, lon }` et reçoit `report:new`, `report:updated` et
`report:removed` **uniquement pour les cellules autour d'elle**. La v83
diffusait chaque alerte à tous les clients connectés du pays.

---

## Ce que la réécriture corrige

- **Recherche d'adresse** : index trigramme et index géographique, au lieu
  d'une relecture intégrale de `addresses.json` à chaque appel.
- **Votes** : une ligne par vote rattachée à un appareil, au lieu d'un
  compteur. Un même téléphone ne peut plus faire disparaître un radar seul, et
  l'historique reste auditable.
- **Suppressions** : logiques, donc restaurables depuis le journal de
  modération.
- **Secrets** : plus aucun code en dur côté client ; `ADMIN_KEY` disparaît au
  profit de comptes avec mots de passe hachés en argon2id.
- **Configuration** : validée au démarrage. Une variable manquante arrête le
  serveur avec un message clair, au lieu de le laisser démarrer à moitié
  configuré comme le faisait l'environnement figé par `pm2 save`.
- **Photos** : envoi multipart et vignette générée à la réception, au lieu de
  base64 dans le corps JSON avec une limite de 15 Mo.

## Ce qui ne change pas

**Valhalla.** Le conteneur `valhalla_win` et ses 2916 tuiles restent en
l'état. L'API se contente de l'exposer derrière `/routing/route`, parce qu'il
écoute sur `127.0.0.1:8002` et n'est pas joignable depuis un téléphone.
