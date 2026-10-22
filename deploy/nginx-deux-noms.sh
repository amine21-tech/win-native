#!/usr/bin/env bash
#
# Fait repondre nginx aux DEUX noms du serveur, avec les memes redirections.
#
# POURQUOI. L'application n'etait joignable que par `51.77.194.25.nip.io`. Quand le DNS d'un
# reseau refuse de traduire ce nom — ce qui arrive, nip.io etant souvent filtre —, tout
# s'arrete : plus d'enregistrement, plus de photo, plus de recherche. Le client l'a constate
# sur son telephone :
#
#   java.net.UnknownHostException: Unable to resolve host "51.77.194.25.nip.io"
#
# L'application sait depuis la version 66 basculer sur `51.77.194.25.sslip.io`, qui rend le
# meme service sous une autre autorite. Le certificat couvre deja les deux noms.
#
# CE QUI MANQUE, et que ce script corrige : certbot, en ajoutant le second nom, a cree un bloc
# serveur NEUF au lieu d'ajouter le nom au bloc existant. Ce bloc neuf porte le bon certificat
# mais aucune redirection — il contient `return 404`, et c'est donc ce qu'il repond a tout.
#
# Deux modifications, et rien d'autre :
#   1. le bloc PRINCIPAL (celui qui inclut win-v2.conf) repond aux deux noms ;
#   2. le bloc 443 que certbot a ajoute pour sslip.io est retire, puisqu'il ne sert qu'a
#      renvoyer 404 sur un nom desormais traite par le bloc principal.
#
# Le bloc 80 de sslip.io est CONSERVE : il redirige vers https, ce qui est exactement ce qu'on
# veut.
#
# Rien n'est fait sans filet : sauvegarde, verification par `nginx -t`, et retour automatique a
# la version precedente si nginx refuse la configuration.
#
# Usage, sur le VPS :
#   sudo bash nginx-deux-noms.sh
set -euo pipefail

FICHIER=/etc/nginx/sites-enabled/default
SAUVEGARDE="$FICHIER.avant-deux-noms"
PRINCIPAL=51.77.194.25.nip.io
SECOND=51.77.194.25.sslip.io

bleu()  { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
bien()  { printf '   \033[0;32mOK\033[0m   %s\n' "$1"; }
stop()  { printf '   \033[0;31mNON\033[0m  %s\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || stop "a lancer avec sudo."
[ -f "$FICHIER" ] || stop "$FICHIER introuvable."

bleu "Sauvegarde"
cp "$FICHIER" "$SAUVEGARDE"
bien "copie dans $SAUVEGARDE"

bleu "Modification"
python3 - "$FICHIER" "$PRINCIPAL" "$SECOND" <<'PY'
import io
import re
import sys

chemin, principal, second = sys.argv[1], sys.argv[2], sys.argv[3]
texte = io.open(chemin, encoding='utf-8').read()

# ---------------------------------------------------------------- decoupage en blocs
# On ne parse pas nginx : on repere les blocs `server { ... }` de premier niveau en comptant
# les accolades. C'est suffisant ici, et bien plus sur qu'une expression reguliere qui
# essaierait d'attraper un bloc entier d'un seul coup.
def blocs_server(t):
    for m in re.finditer(r'(?m)^server\s*\{', t):
        debut = m.start()
        profondeur = 0
        i = m.end() - 1
        while i < len(t):
            if t[i] == '{':
                profondeur += 1
            elif t[i] == '}':
                profondeur -= 1
                if profondeur == 0:
                    yield debut, i + 1
                    break
            i += 1

blocs = list(blocs_server(texte))
print('   %d blocs serveur trouves' % len(blocs))

# ---------------------------------------------------------------- 1. le bloc principal
# C'est celui qui inclut le fragment portant /v2 : c'est lui, et lui seul, qui sait parler a
# l'API. On le reconnait a cela plutot qu'a sa position, qui pourrait changer.
principal_idx = None
for k, (a, b) in enumerate(blocs):
    if 'win-v2.conf' in texte[a:b]:
        principal_idx = k
        break
if principal_idx is None:
    raise SystemExit("   ECHEC : aucun bloc n'inclut win-v2.conf, je ne sais pas lequel est le principal.")

a, b = blocs[principal_idx]
corps = texte[a:b]
if second in corps:
    print('   le bloc principal repond deja aux deux noms, rien a changer de ce cote')
    nouveau_corps = corps
else:
    motif = re.compile(r'(server_name\s+)' + re.escape(principal) + r'(\s*;)')
    if not motif.search(corps):
        raise SystemExit("   ECHEC : 'server_name %s;' introuvable dans le bloc principal." % principal)
    # REMPLACEMENT PAR FONCTION, ET NON PAR CHAINE — la difference n'est pas cosmetique.
    #
    # Une chaine de remplacement est relue par le moteur d'expressions regulieres, qui y
    # cherche ses propres echappements. Le renvoi au premier groupe, colle devant une
    # adresse commencant par 51, formait une sequence de trois chiffres que Python a lue
    # comme un code OCTAL : le caractere << i >>. La ligne server_name etait donc DETRUITE
    # et remplacee par << i.77.194.25... >>, sans la moindre erreur signalee.
    #
    # Une fonction ne subit aucune relecture. Le defaut a ete trouve a l'essai, sur une
    # copie de la vraie configuration, avant d'approcher le serveur.
    nouveau_corps = motif.sub(
        lambda m: m.group(1) + principal + ' ' + second + m.group(2), corps, count=1
    )
    print('   bloc principal : server_name porte desormais les deux noms')

texte = texte[:a] + nouveau_corps + texte[b:]

# ---------------------------------------------------------------- 2. le bloc de trop
# Celui que certbot a ajoute : il nomme le second nom, ecoute en 443, et ne fait que
# renvoyer 404. On le retire ENTIEREMENT. On ne touche pas a celui qui ecoute en 80 : sa
# redirection vers https est utile.
blocs = list(blocs_server(texte))
a_retirer = [
    (a, b) for a, b in blocs
    if ('server_name %s;' % second) in texte[a:b].replace('; # managed by Certbot', ';')
    and 'listen 443' in texte[a:b]
    and 'return 404' in texte[a:b]
    and 'win-v2.conf' not in texte[a:b]
]
if not a_retirer:
    print("   aucun bloc 443 en trop a retirer (deja fait ?)")
else:
    for a, b in reversed(a_retirer):
        texte = texte[:a] + texte[b:]
    print('   %d bloc(s) 443 inutile(s) retire(s)' % len(a_retirer))

io.open(chemin, 'w', encoding='utf-8').write(texte)
print('   fichier ecrit')
PY

bleu "Verification par nginx"
if nginx -t 2>&1 | sed 's/^/   /'; then
  bien "configuration valide"
else
  cp "$SAUVEGARDE" "$FICHIER"
  stop "nginx refuse la configuration — l'ancienne a ete remise en place, rien n'a change."
fi

bleu "Rechargement"
systemctl reload nginx
bien "nginx recharge"

bleu "Controle sur les deux noms"
for h in "$PRINCIPAL" "$SECOND"; do
  code=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' "https://$h/v2/status" || echo 000)
  printf '   %-24s /v2/status -> %s\n' "$h" "$code"
done
echo
echo "   Les deux doivent afficher 200."
echo "   En cas de souci :  sudo cp $SAUVEGARDE $FICHIER && sudo systemctl reload nginx"
