# -*- coding: utf-8 -*-
"""
UN HOOK APPELE APRES UN `return` CONDITIONNEL FAIT PLANTER L'ECRAN. On les cherche tous.

CE QUE CE SCRIPT A TROUVE, ET POURQUOI IL EXISTE.

Le 19 novembre, chercher un lieu rendait l'ecran entierement noir. La cause, trouvee par le
filet pose a la racine le lendemain : PlaceSheet appelait `useState` APRES son
`if (!place) return null`. Tant qu'aucun lieu n'est choisi, la fiche execute N hooks et sort ;
des qu'on en ouvre un, elle en execute N+1. React compare, constate qu'il en est venu plus
qu'au rendu precedent, et leve « Rendered more hooks than during the previous render ».

L'exception n'etait rattrapee par personne : elle demontait l'arbre entier, et l'utilisateur
voyait un ecran noir sans un mot.

POURQUOI UN SCRIPT ET NON UNE RELECTURE. Ce defaut est INVISIBLE a la lecture — le `useState`
est une ligne parfaitement ordinaire, a trente lignes du `return` qui la condamne, separee de
lui par des commentaires. Il ne se voit ni au typage (TypeScript l'ignore), ni a la
compilation, ni sur l'ecran de celui qui ecrit le code, parce qu'il ne se declenche qu'au
MOMENT OU L'ETAT CHANGE — ici, a l'ouverture d'une fiche.

C'est exactement ce que le projet a appris le 18 novembre : une regle qu'on peut verifier
mecaniquement ne doit pas dependre d'une relecture attentive.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-hooks.py
"""
import io
import os
import re
import sys

RACINE = os.path.join('apps', 'mobile', 'src')
RACINE_APP = os.path.join('apps', 'mobile', 'app')

# Un hook : `useXxx(` avec une majuscule apres `use`. `useState`, `useMemo`, `useQuery`,
# `useMyPlaceIds`... Les fonctions nommees `used...` ou `user...` ne passent pas le filtre.
HOOK = re.compile(r'\b(use[A-Z]\w*)\s*\(')

# Un composant ou un hook personnalise : c'est la seule portee ou la regle s'applique.
DEBUT = re.compile(r'^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_]\w*)\s*\(')

# Un retour anticipe AU PREMIER NIVEAU du corps (deux espaces d'indentation) : `return null;`,
# `return <X />;`, `if (...) return ...;`. C'est lui qui coupe le chemin.
RETOUR = re.compile(r'^  (?:if\s*\(.*\)\s*)?return\b')


def fichiers():
    for base in (RACINE, RACINE_APP):
        for dossier, _, noms in os.walk(base):
            if 'node_modules' in dossier:
                continue
            for nom in noms:
                if nom.endswith(('.tsx', '.ts')):
                    yield os.path.join(dossier, nom)


def analyser(chemin):
    """Rend la liste des (composant, ligne, hook) fautifs du fichier."""
    lignes = io.open(chemin, encoding='utf-8').read().split('\n')
    fautes = []
    composant = None
    retour_vu = 0           # numero de ligne du premier retour anticipe, 0 si aucun
    dans_commentaire = False

    for n, ligne in enumerate(lignes, 1):
        # Les commentaires de bloc contiennent des exemples de code : on les saute.
        nue = ligne.strip()
        if dans_commentaire:
            if '*/' in nue:
                dans_commentaire = False
            continue
        if nue.startswith('/*') and '*/' not in nue:
            dans_commentaire = True
            continue
        if nue.startswith('//') or nue.startswith('*'):
            continue

        debut = DEBUT.match(ligne)
        if debut:
            composant = debut.group(1)
            retour_vu = 0
            continue

        # Fin de la fonction : une accolade fermante SEULE en colonne zero.
        #
        # `ligne.startswith('}')` ne suffit pas, et s'etre trompe ici a failli rendre ce script
        # inutile : un composant dont les proprietes sont destructurees sur plusieurs lignes se
        # termine par `}: Props) {`, qui commence aussi par une accolade en colonne zero. Le
        # script croyait la fonction finie a sa deuxieme ligne et ne regardait plus rien —
        # il annoncait << aucun hook fautif >> sur un fichier qui en contenait un.
        if re.match(r'^\}\s*[;)]?\s*$', ligne):
            composant = None
            retour_vu = 0
            continue

        if composant is None:
            continue

        # Seuls les composants et les hooks personnalises sont concernes.
        majuscule = composant[0].isupper()
        hook_perso = composant.startswith('use') and len(composant) > 3 and composant[3].isupper()
        if not (majuscule or hook_perso):
            continue

        if RETOUR.match(ligne) and retour_vu == 0:
            retour_vu = n
            continue

        if retour_vu:
            trouve = HOOK.search(ligne)
            if trouve:
                fautes.append((composant, n, trouve.group(1), retour_vu))
    return fautes


total = 0
for chemin in sorted(fichiers()):
    for composant, n, hook, retour in analyser(chemin):
        total += 1
        rel = chemin.replace(os.sep, '/')
        print('  FAUX  %s:%d  %s() appele dans %s APRES le retour de la ligne %d'
              % (rel, n, hook, composant, retour))

if total == 0:
    print('\n  ok    Aucun hook appele apres un retour anticipe.\n')
    print('Tous les composants executent le meme nombre de hooks a chaque rendu.\n')
    sys.exit(0)

print('\nA CORRIGER : %d hook(s) appele(s) apres un retour anticipe.' % total)
print("Deplacez-les AVANT le retour. React compte les hooks : en executer un de plus")
print("qu'au rendu precedent leve une exception qui demonte tout l'ecran.\n")
sys.exit(1)
