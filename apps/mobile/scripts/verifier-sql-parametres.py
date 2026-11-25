# -*- coding: utf-8 -*-
"""
UN PARAMETRE SQL N'A PAS DE TYPE. CE SCRIPT CHERCHE LES ENDROITS OU CELA TUE LA REQUETE.

CE QUI EST ARRIVE LE 16 NOVEMBRE, ET QUI N'A ETE VU QUE LE 25.

Une valeur interpolee dans un gabarit `sql` de drizzle n'est pas ecrite dans la requete : elle
part comme PARAMETRE, et PostgreSQL la recoit de type `unknown`. Dans la plupart des contextes
il devine : `WHERE kind = $1` resout `unknown` en `text` sans rien demander.

MAIS PAS AVEC UN OPERATEUR. Quand une seule operande est `unknown`, PostgreSQL suppose qu'elle a
le type de l'autre. Pour `$1 * interval '1 day'` il cherche donc `interval * interval`, qui
n'existe pas, et il refuse LA REQUETE ENTIERE avec le code 42883. Le meme nombre ecrit en clair
dans la chaine aurait fonctionne. C'est tout l'ecart entre un `7` et un `${JOURS}` :

    sql`... ${JOURS} * interval '1 day'`              -> 42883, la requete ne part jamais
    sql`... ${JOURS}::double precision * interval ...` -> correcte

CE QUE CELA A COUTE. L'expression fautive etait dans le WHERE de GET /reports/nearby, la seule
route par laquelle l'application charge les symboles de la carte. Elle a repondu 500 pendant
neuf jours, pour tout le monde, partout. Le depot des signalements et les votes ne passent pas
par elle : la base s'est remplie normalement — cinquante-et-un dos d'ane, vingt-trois trous,
deux radars — pendant que la carte restait vide. Le client a rapporte << les symboles
n'apparaissent pas comme avant >>, et il avait exactement raison.

POURQUOI UN CONTROLE STATIQUE, ALORS QU'IL EXISTE UN CONTROLE EN LIGNE. Parce que celui en ligne
demande une machine allumee et un deploiement deja fait : il constate la panne, il ne l'empeche
pas. Celui-ci se lance sans reseau, avant le commit, et il nomme le fichier et la ligne.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-sql-parametres.py
"""
import io
import os
import re
import sys

RACINE = os.path.join('apps', 'api', 'src')

fautes = []
lus = 0


def verifier(titre, vrai, pourquoi=''):
    print('  %s  %s%s' % ('ok  ' if vrai else 'FAUX', titre, '  - ' + pourquoi if pourquoi else ''))
    if not vrai:
        fautes.append(titre)


# UN PARAMETRE MULTIPLIE PAR UN INTERVAL, DANS LES DEUX SENS, SANS TRANSTYPAGE.
#
# `[^:]` avant le `*` : ce qui porte deja un `::quelque chose` est accepte. On regarde aussi
# `END *`, parce que le cas reel etait un CASE dont LES DEUX BRANCHES etaient des parametres —
# le resultat du CASE est alors `unknown` lui aussi, et l'operateur echoue de la meme facon.
PARAM_FOIS_INTERVAL = re.compile(r'\$\{[^}]*\}\s*\*\s*interval', re.I)
INTERVAL_FOIS_PARAM = re.compile(r"interval\s*'[^']*'\s*\*\s*\$\{", re.I)
CASE_DE_PARAMS_FOIS_INTERVAL = re.compile(
    r'CASE\b[^$]*\$\{[^}]*\}(?![^$]*::)[\s\S]{0,200}?END\s*\*\s*interval', re.I
)

print('')
print('============================================================')
print('AUCUN PARAMETRE NON TRANSTYPE MULTIPLIE PAR UN INTERVAL')
print('============================================================')

for dossier, _, fichiers in os.walk(RACINE):
    for nom in sorted(fichiers):
        if not nom.endswith('.ts'):
            continue
        chemin = os.path.join(dossier, nom)
        source = io.open(chemin, encoding='utf-8').read().replace('\r\n', '\n')
        lus += 1
        # Les commentaires CITENT la ligne fautive pour expliquer la panne : les retirer est
        # indispensable, sinon ce script se declencherait sur sa propre explication.
        code = re.sub(r'/\*[\s\S]*?\*/', ' ', source)
        code = re.sub(r'//[^\n]*', ' ', code)
        for numero, ligne in enumerate(code.split('\n'), start=1):
            for motif, quoi in (
                (PARAM_FOIS_INTERVAL, 'parametre * interval'),
                (INTERVAL_FOIS_PARAM, 'interval * parametre'),
            ):
                for trouve in motif.finditer(ligne):
                    # Le transtypage peut etre pose juste avant l'etoile : on regarde le
                    # fragment lui-meme plutot que de compliquer l'expression reguliere.
                    if '::' in trouve.group(0):
                        continue
                    fautes.append('%s:%d' % (chemin, numero))
                    print('  FAUX  %s:%d — %s' % (chemin, numero, quoi))
                    print('        %s' % ligne.strip()[:110])
        for trouve in CASE_DE_PARAMS_FOIS_INTERVAL.finditer(code):
            numero = code[: trouve.start()].count('\n') + 1
            fautes.append('%s:%d' % (chemin, numero))
            print('  FAUX  %s:%d — CASE de parametres * interval' % (chemin, numero))

verifier('%d fichier(s) du serveur relus' % lus, lus > 0)
verifier(
    'aucun parametre non transtype au contact d un interval',
    len([f for f in fautes if ':' in f]) == 0,
    'un seul suffit a faire repondre 500 a la route entiere',
)

# ET LA LIGNE QUI A CASSE LA CARTE EST NOMMEMENT TRANSTYPEE, pour que le correctif ne reparte
# pas au premier remaniement de ce fichier.
reports = io.open(os.path.join(RACINE, 'routes', 'reports.ts'), encoding='utf-8').read()
print('')
print('LA LIGNE QUI A VIDE LA CARTE PENDANT NEUF JOURS')
verifier(
    'le delai de reouverture transtype ses deux branches',
    "${JOURS_TRAVAUX}::double precision" in reports
    and "${JOURS_SANS_ISSUE}::double precision" in reports,
    'le CASE rendait `unknown`, et `unknown * interval` n existe pas',
)
verifier(
    'les heures de probation sont transtypees aussi',
    "${PROBATION_HEURES}::double precision * interval '1 hour'" in reports,
    'la seconde moitie de la meme expression',
)
verifier(
    'et le seuil de deblocage est un entier declare',
    "${OUI_POUR_DEBLOQUER}::int" in reports,
    'il est compare a un count(*)::int : autant le dire',
)

print('')
if fautes:
    print('A CORRIGER : %d probleme(s).' % len(fautes))
    print('')
    sys.exit(1)
print('Aucun parametre ne touche un interval sans dire son type.')
print('')
sys.exit(0)
