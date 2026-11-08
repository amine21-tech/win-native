"""Verifie l'ABONNEMENT TUNISIE : annuel, et sans retirer l'acces aux anciens clients.

POURQUOI UN SCRIPT PLUTOT QU'UN ESSAI SUR LA BASE. Les deux defauts qui comptent ici ne se
voient qu'au bout d'un AN de service :

  - un renouvellement qui heurte une contrainte d'unicite : l'administrateur voit une erreur
    de base de donnees, le client a deja vire son argent, et personne ne comprend ;
  - un abonnement expire qui continue d'ouvrir la Tunisie, ou l'inverse — un acces a vie qui
    se ferme parce qu'une migration lui a pose une echeance.

Aucun des deux n'est visible en lisant le code, et aucun ne se declenche pendant un essai de
quelques minutes. Ce script-ci lit les requetes et la migration, et verifie que les quatre
regles y sont ecrites.

CE QU'IL NE PEUT PAS FAIRE : executer du SQL. Il n'y a pas de base de donnees sur la machine de
developpement. Il controle donc le TEXTE — ce qui suffit pour ces quatre regles, parce qu'elles
sont chacune un morceau de requete bien identifiable.

Usage, depuis la racine du depot :
  python -I apps/api/scripts/verifier-abonnement.py
"""
import io
import os
import re

RACINE = os.path.join(os.path.dirname(__file__), '..', '..', '..')
ROUTE = os.path.join(RACINE, 'apps', 'api', 'src', 'routes', 'unlocks.ts')
MIGRATION = os.path.join(
    RACINE, 'apps', 'api', 'db', 'migrations', '0012_abonnement_tunisie_annuel.sql'
)

fautes = []


def verifier(nom, ok, detail=''):
    print('  %s  %s%s' % ('ok  ' if ok else 'FAUX', nom, ('  - ' + detail) if detail else ''))
    if not ok:
        fautes.append(nom)


route = io.open(ROUTE, encoding='utf-8').read()
migration = io.open(MIGRATION, encoding='utf-8').read()

print('\nL ABONNEMENT EST ANNUEL')
verifier(
    "l'approbation pose une echeance",
    re.search(r"expires_at\s*=\s*now\(\)\s*\+\s*\$\{DUREE_ABONNEMENT\}", route) is not None,
    'sans elle, le paiement redonnerait un acces a vie',
)
verifier(
    "la duree est d'un an",
    "interval '1 year'" in route,
    'ecrite en SQL : c est Postgres qui compte les annees bissextiles',
)
verifier(
    'le prix reste 200 DA',
    'TN_PRICE_DA = 200' in route,
)

print('\nUN ABONNEMENT EXPIRE N OUVRE PLUS RIEN')
verifier(
    "l'etat exclut les lignes payees expirees",
    "expires_at IS NULL OR expires_at > now()" in route,
    'c est la seule chose qui distingue un abonne d un ancien abonne',
)
verifier(
    'un abonnement expire rend « none », donc renouvelable',
    "status <> 'paid' OR expires_at IS NULL" in route,
    "sinon l'appareil resterait « paid » et ne pourrait jamais repayer",
)

print('\nLES ANCIENS CLIENTS GARDENT LEUR ACCES A VIE')

# LE CONTROLE LE PLUS IMPORTANT DU FICHIER. La facon evidente d'appliquer le point 9 aurait ete
# de poser `now() + 1 an` sur toutes les lignes payees. Cela aurait transforme, en une commande
# et sans retour possible, l'acces a vie de chaque client existant en acces d'un an.
sans_commentaires = re.sub(r'--[^\n]*', '', migration)
verifier(
    'la migration ne modifie AUCUNE ligne existante',
    not re.search(r'\bUPDATE\b|\bDELETE\b', sans_commentaires, re.I),
    'un UPDATE ici retirerait aux clients ce qu ils ont achete, sans retour possible',
)
verifier(
    'la colonne est ajoutee vide',
    'ADD COLUMN IF NOT EXISTS expires_at timestamptz' in migration
    and 'DEFAULT' not in migration.split('expires_at timestamptz')[1].split('\n')[0],
    'NULL veut dire « a vie » : un DEFAULT poserait une echeance a tout le monde',
)
verifier(
    'le code traite NULL comme « a vie », et le dit',
    'a vie' in route and 'expiresAt' in route,
)

print('\nLE DEUXIEME RENOUVELLEMENT NE HEURTE PLUS RIEN')

# La table portait UNIQUE (device_id, country, status) : un appareil ne pouvait avoir qu'une
# seule ligne payee. C'etait juste tant qu'un paiement valait a vie. Avec un abonnement annuel,
# la deuxieme annee aurait echoue — un an apres la mise en service.
verifier(
    "l'unicite sur (device_id, country, status) est levee",
    'DROP CONSTRAINT IF EXISTS country_unlocks_device_id_country_status_key' in migration,
    'elle interdisait une seconde ligne payee, donc tout renouvellement',
)
verifier(
    "elle est remplacee par l'unicite des DEMANDES seules",
    re.search(r"CREATE UNIQUE INDEX[^;]*WHERE status = 'pending'", migration, re.S) is not None,
    'une seule demande en attente par appareil ; les paiements, eux, s empilent',
)
verifier(
    "le ON CONFLICT redonne le predicat de l'index partiel",
    "ON CONFLICT (device_id, country) WHERE status = 'pending'" in route,
    'Postgres n infere un index partiel que si on lui redonne son predicat',
)

print('\nLE PAIEMENT RESTE VERIFIE A LA MAIN')
verifier(
    "l'approbation est reservee aux administrateurs",
    re.search(r"'/admin/unlocks/:id/approve',\s*\{\s*preHandler: \[app\.requireAdmin\]", route)
    is not None,
    'un appareil qui pourrait s approuver lui-meme rendrait l abonnement gratuit',
)
verifier(
    "l'acces est lie a l'APPAREIL, pas au numero",
    'device_id = ${deviceId}' in route,
    'sinon il suffirait de saisir le numero d un client ayant paye',
)

print(
    '\nL abonnement est annuel, et les anciens clients gardent leur acces.\n'
    if not fautes
    else '\nA CORRIGER : %d verification(s) en echec.\n' % len(fautes)
)
raise SystemExit(1 if fautes else 0)
