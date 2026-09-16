# Image de l'API WIN.
#
# Le VPS tourne encore sous Node 20 pour l'ancien backend, qui doit continuer
# a fonctionner pendant toute la duree du chantier. Passer par un conteneur
# evite d'avoir a toucher au Node du systeme : la nouvelle API embarque sa
# propre version et les deux cohabitent sans se voir.
#
# Contexte de build : la RACINE du depot, pas ce dossier.
#   docker compose build api

# ---------------------------------------------------------------- build ----
FROM node:22-bookworm-slim AS builder

# argon2 et sharp installent des binaires precompiles quand ils en trouvent
# pour la plateforme ; ces trois paquets ne servent que de filet de secours,
# au cas ou il faudrait compiler. Ils restent dans l'etage de build et ne
# partent pas en production.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Les manifestes d'abord : tant qu'ils ne changent pas, Docker reutilise la
# couche d'installation et le build reste rapide.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --include-workspace-root --workspace @win/shared --workspace @win/api

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @win/shared \
 && npm run build --workspace @win/api

# On retire les dependances de developpement APRES la compilation : les
# modules natifs sont deja construits, et l'image finale reprend telles quelles
# les dependances qui restent.
RUN npm prune --omit=dev

# ----------------------------------------------------------- production ----
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /app /app

# Les photos envoyees par les contributeurs sont montees depuis l'hote :
# elles doivent survivre a une reconstruction de l'image.
RUN mkdir -p /app/apps/api/data/uploads && chown -R node:node /app/apps/api/data

USER node
WORKDIR /app/apps/api
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/server.js"]
