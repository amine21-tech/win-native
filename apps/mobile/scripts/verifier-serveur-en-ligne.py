# -*- coding: utf-8 -*-
"""
LE SEUL VERIFICATEUR QUI PARLE A LA MACHINE REELLE. Tous les autres lisent le depot.

CE QU'IL EST VENU CORRIGER, ET POURQUOI AUCUN AUTRE NE POUVAIT LE VOIR.

Le 20 novembre, les cinquante et un verificateurs du projet etaient au vert. La synthese du
18 novembre etait declaree appliquee, sous-exigence par sous-exigence — et elle l'etait, DANS LE
DEPOT. Sur le serveur, deux fichiers n'avaient jamais ete copies :

  - routes/health.ts : GET /v2/config repondait << route inconnue >>. Le rayon VIP ne pouvait
    donc pas etre ajuste depuis le serveur, alors que c'etait la demande meme du point A.

Un seul fichier manquait donc reellement. J'avais accuse routes/jobs.ts du meme retard, sur la
foi d'un test de ce script qui mesurait la mauvaise chose : il interrogeait de tres loin, ou les
offres sont hors de la portee que l'employeur a payee, et prenait ce vide pour un parametre
ignore. Le curseur emploi fonctionnait. Le test est refait plus bas, et le raisonnement est
explique a l'endroit ou il sert.

Le script de deploiement ne copiait que les fichiers du DERNIER commit touchant l'API ; un
correctif suivi d'un autre commit disparaissait de la liste pour toujours. Cela est corrige dans
deploy/maj-api.sh, qui recopie desormais l'API entiere. Mais un script corrige ne prouve rien :
il faut pouvoir INTERROGER LA MACHINE.

C'est la pire categorie de panne, celle ou le code est juste et ou tout le monde croit la chose
reglee : << ca marche sur le site, c'est casse sur Android >>. Une relecture du depot ne peut pas
la voir, par construction. Seule une question posee au serveur peut y repondre.

CE SCRIPT N'EST PAS DANS LA CHAINE DE CONSTRUCTION, et c'est voulu : il depend du reseau et d'une
machine qui peut etre arretee. Il se lance A LA MAIN, APRES CHAQUE DEPLOIEMENT.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-serveur-en-ligne.py
"""
import io
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

# L'adresse n'est pas ecrite en dur : on la lit la ou l'application la lit, pour qu'un changement
# de serveur ne laisse pas ce script interroger l'ancien.
app_json = io.open(os.path.join('apps', 'mobile', 'app.json'), encoding='utf-8').read()
trouve = re.search(r'"apiBaseUrl"\s*:\s*"([^"]+)"', app_json)
if not trouve:
    print('  NON   apiBaseUrl introuvable dans apps/mobile/app.json')
    sys.exit(1)
BASE = trouve.group(1).rstrip('/')

# Le certificat de nip.io est valide, mais l'autorite peut manquer dans le magasin de Python sous
# Windows. On verifie la LOGIQUE du serveur, pas sa chaine de certification : celle-ci est
# controlee par le telephone lui-meme a chaque appel.
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

resultats = []


def demander(chemin, delai=25):
    """Rend (code HTTP, objet JSON) ou (0, None) si le serveur est injoignable."""
    try:
        with urllib.request.urlopen(BASE + chemin, timeout=delai, context=CTX) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, None
    except Exception as e:
        print('  NON   serveur injoignable : %s' % e)
        sys.exit(1)


def verifier(titre, vrai, pourquoi=''):
    resultats.append(vrai)
    print('  %s  %s%s' % ('ok  ' if vrai else 'NON ', titre, '  - ' + pourquoi if pourquoi else ''))


print('')
print('============================================================')
print('LE SERVEUR REEL : %s' % BASE)
print('============================================================')

code, corps = demander('/status')
verifier("l'API repond", code == 200 and isinstance(corps, dict) and corps.get('ok') is True)

print('')
print('POINT A - LE RAYON VIP SE REGLE DEPUIS LE SERVEUR')
code, corps = demander('/config')
verifier(
    'la route /config existe',
    code == 200,
    'si elle manque, routes/health.ts n a pas ete deploye et le rayon est fige dans l APK',
)
verifier(
    'et elle rend un rayon VIP exploitable',
    isinstance(corps, dict) and isinstance(corps.get('vipRadiusKm'), (int, float)),
    '<< modifiable depuis le serveur sans mise a jour de l app >>',
)
if isinstance(corps, dict) and corps.get('vipRadiusKm') is not None:
    print('        rayon annonce par le serveur : %s km' % corps['vipRadiusKm'])

print('')
print('POINT A - LES PARTENAIRES SEULS, SUR LEUR PROPRE RAYON')
BOITE = 'bbox=2.8,36.5,3.3,37.0'
_, tous = demander('/places/in-bounds?' + BOITE)
_, vip = demander('/places/in-bounds?' + BOITE + '&partners=1')
lignes_tous = (tous or {}).get('items', [])
lignes_vip = (vip or {}).get('items', [])
verifier(
    'partners=1 ne rend que des partenaires',
    len(lignes_vip) > 0 and all(l.get('isPartner') for l in lignes_vip),
    'l application appelle cette route deux fois, sur deux rayons differents',
)
verifier(
    'et il filtre reellement',
    len(lignes_vip) < len(lignes_tous),
    'sinon les vingt kilometres chargeraient toute la ville',
)
print('        %d lieux dans la boite, dont %d partenaires' % (len(lignes_tous), len(lignes_vip)))

print('')
print('POINT E.3 - LE CURSEUR DE L EMPLOI AGIT SUR LE SERVEUR')
# LE PREMIER TEST ECRIT ICI MESURAIT LA MAUVAISE CHOSE, ET IL A PRODUIT UNE FAUSSE ACCUSATION.
#
# Il interrogeait depuis Constantine avec un rayon de 2000 km, et concluait d'un resultat vide
# que le serveur ignorait le parametre. C'etait faux. La requete compose DEUX conditions qui ne
# se remplacent pas :
#
#   - portee_m, la PERMISSION de l'annonce : jusqu'ou l'employeur a paye pour etre vu ;
#   - le rayon du curseur, la PREFERENCE du chercheur : jusqu'ou il accepte d'aller travailler.
#
# Depuis Constantine, les offres d'Alger sont hors de LEUR PROPRE portee : zero resultat est le
# comportement correct, et aucun curseur au monde ne doit les faire apparaitre. Un chercheur ne
# peut pas voir plus loin que ce qui lui est destine.
#
# LE TEST JUSTE ISOLE LE CURSEUR : on se place a une dizaine de kilometres d'une offre reelle —
# assez loin pour qu'un petit rayon l'exclue, assez pres pour rester dans la portee payee — et on
# compare un rayon serre a un rayon large. Si le curseur agit, le premier ne la voit pas et le
# second la voit.
_, toutes = demander('/jobs?lat=36.75&lon=3.06&radiusKm=2000')
offres = (toutes or {}).get('items', [])
if not offres:
    print('  --    aucune offre dans la base : le curseur ne peut pas etre mis a l epreuve')
else:
    # Un dixieme de degre de latitude fait environ onze kilometres, partout.
    cible = offres[0]
    sonde = 'lat=%.5f&lon=%.5f' % (cible['lat'] + 0.09, cible['lon'])
    _, serre = demander('/jobs?' + sonde + '&radiusKm=1')
    _, large = demander('/jobs?' + sonde + '&radiusKm=50')
    n_serre = len((serre or {}).get('items', []))
    n_large = len((large or {}).get('items', []))
    if n_large == 0:
        print('  --    aucune offre ne porte jusqu a dix kilometres : rien a mettre a l epreuve')
    else:
        verifier(
            'un rayon de 1 km exclut une offre situee a dix kilometres',
            n_serre < n_large,
            'le curseur est valide de 0 a 2000 km : un rayon ignore le rend decoratif',
        )
        print('        a dix kilometres de l offre : %d a 1 km, %d a 50 km'
              % (n_serre, n_large))

print('')
print('FICHE VIP PREMIUM - LES DEUX CHAMPS ARRIVENT JUSQU AU TELEPHONE')
_, rech = demander('/places/search?q=clinique&lat=36.75&lng=3.06')
items = (rech or {}).get('items', [])
if not items:
    print('  --    aucun lieu renvoye : les champs ne peuvent pas etre mis a l epreuve')
else:
    premier = items[0]
    verifier('le champ horaires est renvoye', 'horaires' in premier,
             'ameliorations 4 : sans lui, aucun horaire ne peut s afficher')
    verifier('la note moyenne est renvoyee', 'avisNote' in premier)
    verifier('le nombre d avis aussi', 'avisCount' in premier,
             'amelioration 5 : le seuil de trois avis se calcule dessus')

print('')
if all(resultats):
    print('Le serveur en ligne est a jour : tout ce que les syntheses demandent y repond.')
    print('')
    sys.exit(0)

print('LE SERVEUR EST EN RETARD SUR LE DEPOT. Le code peut etre juste et la machine ancienne :')
print("c'est exactement le defaut que ce script existe pour montrer. A lancer SUR LE VPS :")
print('')
print('  curl -fsSL "https://raw.githubusercontent.com/amine21-tech/win-native/main'
      '/deploy/maj-api.sh?v=$(date +%s)" | bash')
print('')
sys.exit(1)
