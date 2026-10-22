"""
Verifie que chaque cle etrangere des migrations porte le MEME type que la colonne visee.

POURQUOI CE SCRIPT EXISTE. La migration 0005 declarait `used_by text REFERENCES devices(id)`
alors que `devices.id` est en `uuid`. Postgres ne l'a signale qu'au moment de l'appliquer, sur
le serveur du client :

  foreign key constraint "contributor_codes_used_by_fkey" cannot be implemented
  Key columns "used_by" and "id" are of incompatible types: text and uuid.

Rien n'avait ete casse — le script de migration travaille dans une transaction, et l'echec a
tout annule — mais il a fallu un aller-retour sur le serveur pour l'apprendre. Une relecture
n'evite pas cela : le type de la colonne visee se trouve dans un AUTRE fichier, souvent a des
centaines de lignes. Une machine compare mieux.

CE QUE LE SCRIPT NE FAIT PAS. Il ne remplace pas Postgres. Il ne verifie pas les cles
composees, ni les types que Postgres saurait rapprocher par une conversion implicite. Il
couvre les trois formes employees dans ce projet, et c'est l'une d'elles qui a coute
l'aller-retour.

Usage, depuis la racine du depot :
  python -I apps/api/scripts/verifier-cles-etrangeres.py
"""
import glob
import io
import os
import re
import sys

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'db', 'migrations')

DEBUT_TABLE = re.compile(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(', re.IGNORECASE)

TYPES = r'uuid|text|integer|bigint|boolean|timestamptz|real|double\s+precision|numeric|jsonb|serial|bigserial|smallint|date'
COLONNE = re.compile(r'^\s*(?P<col>\w+)\s+(?P<type>' + TYPES + r')\b', re.IGNORECASE)
AJOUT_COLONNE = re.compile(
    r'ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+(' + TYPES + r')\b',
    re.IGNORECASE,
)

# Mots qui ouvrent une contrainte, et non une colonne.
RESERVES = ('primary', 'unique', 'constraint', 'check', 'foreign', 'exclude', 'like')

# Orthographes differentes d'un meme type.
EQUIVALENTS = {
    'serial': 'integer',
    'bigserial': 'bigint',
    'int': 'integer',
    'int4': 'integer',
    'int8': 'bigint',
    'bool': 'boolean',
}


def normaliser(t):
    t = ' '.join(t.lower().split())
    return EQUIVALENTS.get(t, t)


def sans_commentaires(texte):
    """Les commentaires de ce projet contiennent du SQL d'exemple : il fausserait la lecture."""
    return re.sub(r'--[^\n]*', '', texte)


def fin_de_parenthese(texte, i):
    """Position de la parenthese fermante correspondant a celle ouverte en i."""
    profondeur = 0
    while i < len(texte):
        if texte[i] == '(':
            profondeur += 1
        elif texte[i] == ')':
            profondeur -= 1
            if profondeur == 0:
                return i
        i += 1
    return len(texte)


def lire_schema(fichiers):
    """{table: {colonne: type}} — les migrations se lisent dans l'ordre, les ajouts compris."""
    schema = {}
    for chemin in fichiers:
        texte = sans_commentaires(io.open(chemin, encoding='utf-8').read())

        # Une colonne ajoutee apres coup compte autant que celle d'une creation.
        for m in AJOUT_COLONNE.finditer(texte):
            schema.setdefault(m.group(1).lower(), {})[m.group(2).lower()] = normaliser(m.group(3))

        for m in DEBUT_TABLE.finditer(texte):
            table = m.group(1).lower()
            corps = texte[m.end():fin_de_parenthese(texte, m.end() - 1)]
            cols = schema.setdefault(table, {})
            for ligne in corps.splitlines():
                c = COLONNE.match(ligne)
                if c and c.group('col').lower() not in RESERVES:
                    cols[c.group('col').lower()] = normaliser(c.group('type'))
    return schema


def origine(texte, position):
    """
    A quelle table et a quelle colonne appartient le REFERENCES trouve a `position` ?

    Trois formes existent dans ce projet, et les trois sont de vraies cles etrangeres :
      1.  col uuid REFERENCES t(c)                            dans un CREATE TABLE
      2.  ALTER TABLE t ADD COLUMN col uuid REFERENCES t2(c)
      3.  FOREIGN KEY (col) REFERENCES t2(c)                  contrainte nommee a part
    Les sauter serait reintroduire le defaut qu'on traque. Le type local n'est pas relu ici :
    il est pris dans le schema deja constitue, seule source fiable quand la colonne a ete
    creee dans un autre fichier.
    """
    instruction = texte[texte.rfind(';', 0, position) + 1:position]

    alter = re.search(r'ALTER\s+TABLE\s+(\w+)', instruction, re.IGNORECASE)
    creations = list(DEBUT_TABLE.finditer(instruction))
    table = alter.group(1).lower() if alter else (
        creations[-1].group(1).lower() if creations else None
    )

    # Forme 3 : la colonne est nommee juste avant le REFERENCES.
    fk = list(re.finditer(r'FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s*$', instruction, re.IGNORECASE))
    if fk:
        return table, fk[-1].group(1).lower()

    # Forme 2.
    ajout = list(re.finditer(
        r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\b', instruction, re.IGNORECASE))
    if ajout:
        return table, ajout[-1].group(1).lower()

    # Forme 1 : le nom de la colonne ouvre la ligne courante.
    ligne = instruction[instruction.rfind('\n') + 1:]
    m = re.match(r'\s*(\w+)\s+\w+', ligne)
    if m and m.group(1).lower() not in RESERVES:
        return table, m.group(1).lower()
    return table, None


def main():
    fichiers = sorted(glob.glob(os.path.join(RACINE, '*.sql')))
    if not fichiers:
        print('Aucune migration trouvee dans %s' % RACINE)
        return 1

    schema = lire_schema(fichiers)
    fautes = []
    verifiees = 0

    for chemin in fichiers:
        texte = sans_commentaires(io.open(chemin, encoding='utf-8').read())
        nom = os.path.basename(chemin)
        for m in re.finditer(r'REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)', texte, re.IGNORECASE):
            cible, cible_col = m.group(1).lower(), m.group(2).lower()
            ligne = texte.count('\n', 0, m.start()) + 1
            table, col = origine(texte, m.start())

            if table is None or col is None:
                fautes.append('%s:%d  -> %s(%s) : colonne porteuse introuvable'
                              % (nom, ligne, cible, cible_col))
                continue

            type_local = schema.get(table, {}).get(col)
            type_cible = schema.get(cible, {}).get(cible_col)

            if type_local is None:
                fautes.append('%s:%d  %s.%s : type absent du schema'
                              % (nom, ligne, table, col))
            elif type_cible is None:
                fautes.append('%s:%d  %s.%s -> %s(%s) : colonne visee introuvable'
                              % (nom, ligne, table, col, cible, cible_col))
            elif type_local != type_cible:
                fautes.append('%s:%d  %s.%s (%s) -> %s.%s (%s) : TYPES INCOMPATIBLES'
                              % (nom, ligne, table, col, type_local, cible, cible_col, type_cible))
            else:
                verifiees += 1

    print('%d cle(s) etrangere(s) verifiee(s) dans %d migration(s).' % (verifiees, len(fichiers)))
    if fautes:
        print("\nA CORRIGER avant d'appliquer sur le serveur :")
        for f in fautes:
            print('  ' + f)
        return 1
    print('Tous les types concordent.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
