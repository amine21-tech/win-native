"""Verifie que les enregistrements tamazight et le code se repondent.

POURQUOI CE SCRIPT A COTE DE verifier-voix.ts. L'autre eprouve les REGLES : quel clip pour
quelle distance, quel clip pour quelle manoeuvre. Il ne peut pas regarder les FICHIERS —
`require` d'un .wav est resolu par Metro, jamais par Node, si bien qu'un script qui importerait
la table des clips echouerait au chargement.

Or c'est precisement la que vit le defaut le plus silencieux de cette fonctionnalite : une cle
qui designe un fichier absent. Metro ne construit alors tout simplement pas l'application — mais
l'erreur n'apparait qu'au moment de la compilation de l'APK, vingt minutes plus tard, dans un
journal d'integration continue. Ici, elle apparait en une seconde.

CE QUI EST VERIFIE :
  - chaque cle de la table a son fichier, et chaque fichier a sa cle ;
  - chaque clip est bien au format attendu — 16 kHz, mono, 16 bits ;
  - aucun clip n'est vide ni absurde (une prise ratee de 0,1 s, un fichier de 30 s) ;
  - le poids total reste raisonnable pour un APK.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-voix.py
"""
import io
import os
import re
import struct

RACINE = os.path.join(os.path.dirname(__file__), '..')
CLIPS = os.path.join(RACINE, 'assets', 'voix', 'kab')
REGLES = os.path.join(RACINE, 'src', 'speech', 'voixKabRegles.ts')
TABLE = os.path.join(RACINE, 'src', 'speech', 'voixKab.ts')

FREQUENCE = 16000
CANAUX = 1
BITS = 16

# Bornes de duree. En deca, c'est une prise ratee — un souffle, un clic. Au-dela, c'est que le
# locuteur a enregistre une phrase entiere la ou on attendait un morceau, et l'enchainement de
# deux clips durerait plus longtemps que le virage.
DUREE_MIN_S = 0.3
DUREE_MAX_S = 4.0

# Poids total admis dans l'APK. Trois megaoctets aujourd'hui ; au-dela de cinq, il faudra
# passer a un format compresse plutot que de laisser grossir en silence.
POIDS_MAX_MO = 5.0

fautes = []


def verifier(nom, ok, detail=''):
    print('  %s  %s%s' % ('ok  ' if ok else 'FAUX', nom, ('  — ' + detail) if detail else ''))
    if not ok:
        fautes.append(nom)


def entete(chemin):
    with io.open(chemin, 'rb') as f:
        d = f.read(44)
    if d[:4] != b'RIFF' or d[8:12] != b'WAVE' or d[12:16] != b'fmt ':
        return None
    tag, canaux, freq, _bps, _align, bits = struct.unpack('<HHIIHH', d[20:36])
    taille = struct.unpack('<I', d[40:44])[0]
    return tag, canaux, freq, bits, taille


print('\nLES CLES ET LES FICHIERS SE REPONDENT')

texte_regles = io.open(REGLES, encoding='utf-8').read()
bloc = re.search(r'export const CLES_VOIX = \[(.*?)\] as const;', texte_regles, re.S)
cles = set(re.findall(r"'([A-Za-z0-9]+)'", bloc.group(1))) if bloc else set()

texte_table = io.open(TABLE, encoding='utf-8').read()
requis = set(re.findall(r"^  ([A-Za-z0-9]+): require\('\.\./\.\./assets/voix/kab/([A-Za-z0-9]+)\.wav'\)",
                        texte_table, re.M))
cles_table = {c for c, _ in requis}
fichiers = {f[:-4] for f in os.listdir(CLIPS) if f.endswith('.wav')}

verifier('la liste de reference contient des cles', len(cles) > 0, '%d cles' % len(cles))
verifier(
    'la table des require correspond a la liste',
    cles_table == cles,
    'en trop : %s · manquantes : %s' % (sorted(cles_table - cles), sorted(cles - cles_table)),
)
verifier(
    'chaque require designe son propre fichier',
    all(c == f for c, f in requis),
    'une cle qui pointe vers un autre clip jouerait la mauvaise phrase',
)
verifier(
    'chaque cle a son fichier sur le disque',
    cles <= fichiers,
    'absents : %s' % sorted(cles - fichiers),
)
verifier(
    'aucun enregistrement n\'est orphelin',
    fichiers <= cles,
    'jamais joues : %s' % sorted(fichiers - cles),
)

print('\nLE FORMAT DE CHAQUE CLIP')

mauvais_format, trop_court, trop_long, octets = [], [], [], 0
for nom in sorted(fichiers):
    chemin = os.path.join(CLIPS, nom + '.wav')
    octets += os.path.getsize(chemin)
    e = entete(chemin)
    if e is None:
        mauvais_format.append('%s (entete illisible)' % nom)
        continue
    tag, canaux, freq, bits, taille = e
    if (tag, canaux, freq, bits) != (1, CANAUX, FREQUENCE, BITS):
        mauvais_format.append('%s (%d Hz, %d canaux, %d bits)' % (nom, freq, canaux, bits))
        continue
    duree = taille / (freq * canaux * bits / 8)
    if duree < DUREE_MIN_S:
        trop_court.append('%s (%.2f s)' % (nom, duree))
    elif duree > DUREE_MAX_S:
        trop_long.append('%s (%.1f s)' % (nom, duree))

verifier(
    '%d clips en %d kHz mono %d bits' % (len(fichiers), FREQUENCE // 1000, BITS),
    not mauvais_format,
    ' · '.join(mauvais_format[:4]),
)
verifier(
    'aucune prise ratee (plus de %.1f s)' % DUREE_MIN_S,
    not trop_court,
    ' · '.join(trop_court[:4]) or 'un clip plus court est un souffle, pas un mot',
)
verifier(
    'aucun clip interminable (moins de %.0f s)' % DUREE_MAX_S,
    not trop_long,
    ' · '.join(trop_long[:4]) or 'deux clips enchaines doivent tenir dans l\'approche du virage',
)
verifier(
    'poids total : %.1f Mo' % (octets / 1048576),
    octets / 1048576 <= POIDS_MAX_MO,
    'au-dela de %.0f Mo il faudra un format compresse' % POIDS_MAX_MO,
)

print(
    '\nLa voix tamazight est complete et au bon format.\n'
    if not fautes
    else '\nA CORRIGER : %d verification(s) en echec.\n' % len(fautes)
)
raise SystemExit(1 if fautes else 0)
