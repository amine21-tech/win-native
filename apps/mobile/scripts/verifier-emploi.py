"""
Verifie que les secteurs et les types de contrat du module Emploi concordent PARTOUT.

POURQUOI CE SCRIPT. La meme liste est ecrite a quatre endroits qui ne se parlent pas :
  - `SECTEURS_EMPLOI` dans l'application, qui dessine les chips et la grille du formulaire ;
  - `SECTEURS` dans apps/api/src/routes/jobs.ts, qui valide ce qu'on depose et ce qu'on filtre ;
  - la contrainte CHECK de PostgreSQL, qui a le dernier mot ;
  - les quatre fichiers de langue, qui donnent le libelle affiche.

Une liste qui diverge d'une autre ne se voit pas a la lecture et ne casse rien a la
compilation. Elle casse a l'usage, et de la pire facon : un secteur propose dans l'application
mais absent de la contrainte SQL fait echouer le DEPOT de l'annonce — apres que l'employeur a
rempli douze champs. L'inverse est plus silencieux encore : un secteur accepte par la base mais
absent de l'application devient un filtre que personne ne peut plus selectionner, et les
annonces qu'il contient disparaissent de la vue sans que rien ne le signale.

Les trois listes doivent etre EXACTEMENT les memes, et chacune doit avoir sa traduction.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-emploi.py
"""
import io
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]
APP = RACINE / 'apps/mobile/src/components/JobsSheet.tsx'
FORMULAIRE = RACINE / 'apps/mobile/src/components/PublishJobSheet.tsx'
SERVEUR = RACINE / 'apps/api/src/routes/jobs.ts'
LOCALES = RACINE / 'apps/mobile/src/i18n/locales'
MIGRATIONS = RACINE / 'apps/api/db/migrations'

fautes = []


def lire(chemin):
    return io.open(chemin, encoding='utf-8-sig').read()


def bloc(texte, debut, fin=']'):
    """Contenu entre `debut` et le premier `fin` qui suit."""
    i = texte.find(debut)
    if i < 0:
        return None
    j = texte.find(fin, i)
    return texte[i:j] if j > 0 else None


def valeur(texte, motif):
    """Premier groupe capture par `motif`, ou None."""
    m = re.search(motif, texte)
    return m.group(1) if m else None


def verifier(nom, ok, detail=''):
    print(f"  {'ok  ' if ok else 'FAUX'}  {nom}{('  — ' + detail) if detail else ''}")
    if not ok:
        fautes.append(nom)


# ------------------------------------------------------------------ les listes
app_bloc = bloc(lire(APP), 'export const SECTEURS_EMPLOI = [')
secteurs_app = re.findall(r"cle:\s*'([a-z]+)'", app_bloc or '')

srv_bloc = bloc(lire(SERVEUR), 'const SECTEURS = [')
secteurs_srv = re.findall(r"'([a-z]+)'", srv_bloc or '')

# La contrainte qui fait foi est celle de la DERNIERE migration qui la redefinit.
secteurs_sql = []
for fichier in sorted(MIGRATIONS.glob('*.sql')):
    texte = lire(fichier)
    m = re.search(r'CHECK\s*\(\s*sector\s+IN\s*\((.*?)\)\s*\)', texte, re.S)
    if m:
        secteurs_sql = re.findall(r"'([a-z]+)'", m.group(1))
        source_sql = fichier.name

print('\nSECTEURS — les trois listes doivent etre identiques')
verifier(f'application : {len(secteurs_app)} secteurs', len(secteurs_app) == 12, ', '.join(secteurs_app))
verifier(f'serveur     : {len(secteurs_srv)} secteurs', len(secteurs_srv) == 12, ', '.join(secteurs_srv))
verifier(f'SQL ({source_sql}) : {len(secteurs_sql)} secteurs', len(secteurs_sql) == 12, ', '.join(secteurs_sql))

verifier(
    'application et serveur disent la meme chose, dans le meme ordre',
    secteurs_app == secteurs_srv,
    f'application seule : {sorted(set(secteurs_app) - set(secteurs_srv))} · '
    f'serveur seul : {sorted(set(secteurs_srv) - set(secteurs_app))}',
)
verifier(
    'le serveur et la contrainte SQL disent la meme chose',
    sorted(secteurs_srv) == sorted(secteurs_sql),
    f'serveur seul : {sorted(set(secteurs_srv) - set(secteurs_sql))} · '
    f'SQL seul : {sorted(set(secteurs_sql) - set(secteurs_srv))}',
)
verifier(
    '« bureaux » a bien disparu des trois listes',
    'bureaux' not in secteurs_app + secteurs_srv + secteurs_sql,
)

# ------------------------------------------------------------------ les libelles
print('\nLIBELLES — chaque secteur doit etre dit dans les quatre langues')
for langue in ('fr', 'en', 'ar', 'dz'):
    d = json.loads(lire(LOCALES / f'{langue}.json'))
    dits = d.get('jobs', {}).get('sector', {})
    manquants = [s for s in secteurs_app if s not in dits]
    inutiles = [s for s in dits if s not in secteurs_app]
    verifier(
        f'{langue} : les {len(secteurs_app)} secteurs ont un libelle',
        not manquants,
        f'manquants : {manquants}' if manquants else '',
    )
    if inutiles:
        verifier(f'{langue} : aucun libelle orphelin', False, f'orphelins : {inutiles}')

# ------------------------------------------------------------------ les contrats
print('\nCONTRATS — ce qu\'on propose doit etre accepte partout')
form_bloc = bloc(lire(FORMULAIRE), 'const CONTRATS = [')
contrats_form = re.findall(r"'([a-z]+)'", form_bloc or '')

srv_contrats = re.findall(
    r"contract:\s*z\.enum\(\[(.*?)\]\)", lire(SERVEUR), re.S)
contrats_srv = re.findall(r"'([a-z]+)'", srv_contrats[0]) if srv_contrats else []

contrats_sql = []
for fichier in sorted(MIGRATIONS.glob('*.sql')):
    m = re.search(r'CHECK\s*\(\s*contract\s+IN\s*\((.*?)\)\s*\)', lire(fichier), re.S)
    if m:
        contrats_sql = re.findall(r"'([a-z]+)'", m.group(1))
        source_contrat = fichier.name

verifier(f'formulaire : {contrats_form}', len(contrats_form) == 4)
verifier(f'serveur    : {contrats_srv}', len(contrats_srv) >= 4)
verifier(f'SQL ({source_contrat}) : {contrats_sql}', len(contrats_sql) >= 4)

# Le formulaire peut proposer MOINS que ce que la base accepte — c'est le cas de « mission »,
# garde en base pour les annonces existantes mais retire de la saisie. L'inverse serait un
# defaut : proposer un contrat que la base refuse fait echouer le depot.
verifier(
    'tout contrat propose est accepte par le serveur',
    set(contrats_form) <= set(contrats_srv),
    f'proposes mais refuses : {sorted(set(contrats_form) - set(contrats_srv))}',
)
verifier(
    'tout contrat accepte par le serveur l\'est aussi par la base',
    set(contrats_srv) <= set(contrats_sql),
    f'acceptes par le serveur mais refuses par la base : {sorted(set(contrats_srv) - set(contrats_sql))}',
)

# ------------------------------------------------------------------ les formules
#
# Les trois formules du doc 196 (5.1). Le tableau ci-dessous est recopie du PDF, a la main et
# une seule fois : c'est la reference contre laquelle le code est verifie. Si le client change
# ses prix, c'est ICI qu'on le constate — et le script dira exactement ou le code ne suit pas.
#
#   ESSENTIEL   500 / 1 500 DA    50 km
#   STANDARD  1 000 / 3 000 DA   100 km
#   PREMIUM   1 500 / 5 000 DA   Algerie entiere
print('\nFORMULES — les prix du document, au dinar pres')
PARTAGE = RACINE / 'packages/shared/src/constants.ts'
partage = lire(PARTAGE)

ATTENDU = {
    'essentiel': (500, 1500, '50_000'),
    'standard': (1000, 3000, '100_000'),
    'premium': (1500, 5000, 'null'),
}

for nom, (semaine, mois, portee) in ATTENDU.items():
    m = re.search(rf'{nom}: \{{([^}}]*)\}}', partage)
    ligne = m.group(1) if m else ''
    sem = valeur(ligne, r'semaine: ([\d_]+)')
    moi = valeur(ligne, r'mois: ([\d_]+)')
    por = valeur(ligne, r'porteeM: ([\w_]+)')
    verifier(
        f'{nom} : {semaine} DA / semaine, {mois} DA / mois',
        (sem or '').replace('_', '') == str(semaine) and (moi or '').replace('_', '') == str(mois),
        f'trouve {sem} et {moi}',
    )
    verifier(f'{nom} : portee {portee}', por == portee, f'trouve {por}')

verifier('une semaine vaut 7 jours', 'semaine: 7' in partage)
verifier('un mois vaut 30 jours', 'mois: 30' in partage)

# La contrainte SQL doit accepter exactement ces trois formules et ces deux durees.
formules_sql, durees_sql = [], []
for fichier in sorted(MIGRATIONS.glob('*.sql')):
    texte = lire(fichier)
    m = re.search(r'CHECK\s*\(\s*formule\s+IN\s*\((.*?)\)\s*\)', texte, re.S)
    if m:
        formules_sql = re.findall(r"'([a-z]+)'", m.group(1))
    m = re.search(r'CHECK\s*\(\s*duree\s+IN\s*\((.*?)\)\s*\)', texte, re.S)
    if m:
        durees_sql = re.findall(r"'([a-z]+)'", m.group(1))

verifier('la base accepte les trois formules', sorted(formules_sql) == sorted(ATTENDU), f'{formules_sql}')
verifier('la base accepte les deux durees', sorted(durees_sql) == ['mois', 'semaine'], f'{durees_sql}')

# LE RAYON EST CALCULE PAR LA BASE, jamais transmis : c'est ce qui le rend indivergeable.
verifier(
    'le rayon est une colonne GENEREE, pas une donnee transmise',
    'GENERATED ALWAYS AS' in ''.join(lire(f) for f in MIGRATIONS.glob('*.sql')),
    'sinon une annonce Essentiel pourrait garder une portee Premium',
)
serveur = lire(SERVEUR)
verifier(
    "le serveur n'ecrit jamais portee_m lui-meme",
    'portee_m)' not in serveur.split('INSERT INTO job_offers')[1].split('VALUES')[0]
    if 'INSERT INTO job_offers' in serveur else False,
)
verifier(
    'la visibilite utilise la portee de l\'ANNONCE',
    'portee_m IS NULL OR ST_DWithin' in serveur,
)
verifier(
    'le Premium passe en tete de liste',
    "(formule = 'premium') DESC" in serveur,
)

print(
    '\nLes listes du module Emploi concordent.\n'
    if not fautes
    else f'\nA CORRIGER : {len(fautes)} verification(s) en echec.\n'
)
sys.exit(0 if not fautes else 1)
