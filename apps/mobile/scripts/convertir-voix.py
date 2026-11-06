# -*- coding: utf-8 -*-
"""Convertit les enregistrements tamazight en clips utilisables par l'application.

POURQUOI UNE CONVERSION. Les fichiers livres par le locuteur sont du WAV FLOTTANT 32 bits a
44,1 kHz : le format d'une station de travail audio, parfait pour enregistrer et retoucher,
absurde pour une application. Soixante et onze fichiers, une minute quarante-trois de parole
en tout, et dix-sept megaoctets — soit dix fois ce que la meme parole demande une fois mise au
format d'une voix de guidage.

CE QU'ON EN FAIT : 16 kHz, 16 bits, mono.
  - 16 kHz suffit a la parole. La voix humaine porte son intelligibilite sous 8 kHz, et c'est
    exactement la frequence que retiennent les voix de synthese d'Android.
  - 16 bits parce que le flottant ne sert qu'a la retouche : une fois le niveau fixe, il n'y a
    plus rien a gagner.
  - Mono parce qu'une consigne de conduite n'a pas de scene stereo. Un seul fichier arrivait en
    stereo — il est replie.

Resultat : environ trois megaoctets pour les soixante et onze clips, embarques dans l'APK. On
ne les telecharge pas : une consigne de conduite doit se prononcer dans un tunnel.

POURQUOI PAS DU MP3 OU DE L'OPUS. Ce serait plus petit encore — quelques centaines de
kilo-octets. Mais cela demanderait ffmpeg, absent de la machine, donc une dependance de plus
a installer et a tenir. Le WAV a de surcroit un avantage reel ici : il se joue SANS DECODAGE,
donc sans le delai de quelques dizaines de millisecondes qu'un format compresse impose au
demarrage. Sur une annonce de virage, ce delai se paie en metres.

LES NOMS DE FICHIERS DEVIENNENT DES CLES. Les noms livres sont des phrases francaises, avec
accents, apostrophes, espaces et quelques fautes de frappe (<< distination >>, << traveaux >>,
<< zst >>). Metro ne sait pas resoudre un `require` dont le chemin est calcule : il lui faut un
chemin litteral, donc un nom stable et ASCII. La table ci-dessous est la seule source de
verite de cette correspondance.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/convertir-voix.py <dossier-des-wav>
"""
import array
import audioop
import io
import os
import struct
import sys
import unicodedata

SORTIE = os.path.join(os.path.dirname(__file__), '..', 'assets', 'voix', 'kab')

FREQUENCE_CIBLE = 16000

# ------------------------------------------------------------------ la correspondance
#
# A gauche le nom du fichier livre, sans l'extension. A droite la cle employee par le code.
# Les fautes de frappe du locuteur sont CONSERVEES a gauche : c'est le nom reel du fichier, et
# le corriger ici ferait echouer la conversion sans rien expliquer.
CLES = {
    # --- manoeuvres -------------------------------------------------------------------
    'tourner a droite kab': 'tournerDroite',
    'tourner a gauche kab': 'tournerGauche',
    'continuez tout droit kab': 'toutDroit',
    'faites demi tour kab': 'demiTour',
    'restez a droite kab': 'resterDroite',
    'restez a gauche kab': 'resterGauche',
    'prenez le rond point kab': 'rondPoint',
    'prenez la premiere sortie kab': 'sortie1',
    'prenez la deuxieme sortie kab': 'sortie2',
    'prenez la troisieme sortie kab': 'sortie3',
    'prenez la quatrieme sortie kab': 'sortie4',
    "prenez la sortie de l'autoroute kab": 'sortieAutoroute',
    'passez le pont kab': 'pont',
    'entrez dans le tunnel kab': 'tunnelEntree',
    'vous sortez du tunnel kab': 'tunnelSortie',

    # --- distances --------------------------------------------------------------------
    'dans 50 m kab': 'd50m',
    'dans 100 m kab': 'd100m',
    'dans 200 m kab': 'd200m',
    'dans 300 m kab': 'd300m',
    'dans 500 m kab': 'd500m',
    'dans 1 km kab': 'd1km',
    'dans 2 km kab': 'd2km',
    'dans 5 km kab': 'd5km',
    'dans 10 km kab': 'd10km',

    # --- destination ------------------------------------------------------------------
    'vous approchez de votre distination kab': 'approcheDestination',
    'vous etes arrivez a votre distination': 'arrivee',
    'votre distination est a droite': 'destinationDroite',
    'votre distination zst a gauche kab': 'destinationGauche',
    'votre distination est tout droit kab': 'destinationToutDroit',

    # --- avertissements ---------------------------------------------------------------
    'attention': 'attention',
    'attention virage dangeureux kab': 'virageDangereux',
    'rallentissez kab': 'ralentissez',
    'rallentir': 'ralentir',
    'zone scollaire': 'zoneScolaire',
    'radar': 'radar',
    'accident signalé sur la route': 'accident',
    'emboutillage signalé sur la route': 'bouchon',
    'traveaux sur la route kab': 'travaux',

    # --- etat de la navigation --------------------------------------------------------
    'navigation démarée': 'navigationDemarree',
    'navigation arrêteé': 'navigationArretee',
    "recalcul de l'itinéraire": 'recalculEnCours',
    'itinéraire recalculé': 'itineraireRecalcule',
    "reprise de l'itinéraire": 'repriseItineraire',
    'nouvel itnéraire disponible': 'nouvelItineraire',

    # --- reseau et position -----------------------------------------------------------
    'signal gps perdu': 'gpsPerdu',
    'signal gps faible': 'gpsFaible',
    'signal gps retrouvé': 'gpsRetrouve',
    'signal internet perdu': 'internetPerdu',
    'mode hors ligne activé': 'horsLigne',

    # --- recherche --------------------------------------------------------------------
    'bienvenu sur win': 'bienvenue',
    'recherche': 'recherche',
    'dites votre distination': 'ditesDestination',
    'vous voulez dire': 'vousVoulezDire',
    'plusiurs resultats trouvé': 'plusieursResultats',
    'address introuvable': 'adresseIntrouvable',

    # --- categories de lieux ----------------------------------------------------------
    'hopital': 'hopital',
    'pharmacie': 'pharmacie',
    'protection civil': 'protectionCivile',
    'commisariat de police': 'police',
    'station service': 'stationService',
    'parking': 'parking',
    'restaurant': 'restaurant',
    'hôtel': 'hotel',
    'banque': 'banque',
    'supermarché': 'supermarche',
    'mosqué': 'mosquee',
    'aéroport': 'aeroport',
    'arrêt de bus': 'arretBus',
}

# FICHIERS ECARTES, ET POURQUOI. Les laisser passer en silence serait pire : on croirait que
# tout a ete converti, et il manquerait trois clips sans que rien ne le dise.
ECARTES = {
    'mosqué(1)': "doublon de « mosqué »",
    "recalcule de l'itinéraire": "quasi-doublon de « recalcul de l'itinéraire »",
    'untitled - Track 72': "sans titre : on ignore ce qu'il dit",
}


def lire_wav(chemin):
    """Rend (donnees PCM 16 bits mono, frequence). Accepte le flottant 32 bits et l'entier."""
    with io.open(chemin, 'rb') as f:
        brut = f.read()
    if brut[:4] != b'RIFF' or brut[8:12] != b'WAVE':
        raise ValueError('ce n est pas un fichier WAV')

    i, fmt, donnees = 12, None, None
    while i < len(brut) - 8:
        nom = brut[i:i + 4]
        taille = struct.unpack('<I', brut[i + 4:i + 8])[0]
        corps = brut[i + 8:i + 8 + taille]
        if nom == b'fmt ':
            fmt = struct.unpack('<HHIIHH', corps[:16])
        elif nom == b'data':
            donnees = corps
            break
        i += 8 + taille + (taille & 1)

    if fmt is None or donnees is None:
        raise ValueError('entete incomplet')
    tag, canaux, freq, _bps, _align, bits = fmt

    if tag == 3 and bits == 32:
        # FLOTTANT -> ENTIER. Les echantillons vont de -1 a 1 ; on les ramene sur 16 bits en
        # BORNANT, parce qu'un enregistrement un peu chaud depasse parfois 1,0 et qu'un
        # debordement s'entendrait comme un claquement.
        flottants = array.array('f')
        flottants.frombytes(donnees[:len(donnees) - len(donnees) % 4])
        if sys.byteorder == 'big':
            flottants.byteswap()
        entiers = array.array('h', (max(-32768, min(32767, int(v * 32767))) for v in flottants))
        if sys.byteorder == 'big':
            entiers.byteswap()
        donnees = entiers.tobytes()
    elif tag == 1 and bits == 16:
        pass
    elif tag == 1:
        donnees = audioop.lin2lin(donnees, bits // 8, 2)
    else:
        raise ValueError('format %d / %d bits non gere' % (tag, bits))

    if canaux == 2:
        donnees = audioop.tomono(donnees, 2, 0.5, 0.5)
    return donnees, freq


def convertir(source, cible):
    donnees, freq = lire_wav(source)
    if freq != FREQUENCE_CIBLE:
        donnees, _ = audioop.ratecv(donnees, 2, 1, freq, FREQUENCE_CIBLE, None)

    with io.open(cible, 'wb') as f:
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + len(donnees)))
        f.write(b'WAVEfmt ')
        f.write(struct.pack('<IHHIIHH', 16, 1, 1, FREQUENCE_CIBLE, FREQUENCE_CIBLE * 2, 2, 16))
        f.write(b'data')
        f.write(struct.pack('<I', len(donnees)))
        f.write(donnees)
    return len(donnees)


def normaliser(nom):
    """Compare deux noms sans se soucier des accents ni de la casse : Windows et le navigateur
    du locuteur ne composent pas les accents de la meme facon (NFC contre NFD)."""
    return unicodedata.normalize('NFC', nom).lower().strip()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    dossier = sys.argv[1]
    os.makedirs(SORTIE, exist_ok=True)

    presents = {}
    for f in os.listdir(dossier):
        if f.lower().endswith('.wav'):
            presents[normaliser(f[:-4])] = os.path.join(dossier, f)

    attendus = {normaliser(k): v for k, v in CLES.items()}
    ecartes = {normaliser(k): v for k, v in ECARTES.items()}

    faits, octets, manquants = 0, 0, []
    for nom, cle in attendus.items():
        source = presents.get(nom)
        if source is None:
            manquants.append(cle)
            continue
        octets += convertir(source, os.path.join(SORTIE, '%s.wav' % cle))
        faits += 1

    inconnus = [n for n in presents if n not in attendus and n not in ecartes]

    print('convertis   : %d clips, %.1f Mo' % (faits, octets / 1048576))
    if manquants:
        print('MANQUANTS   : %d -> %s' % (len(manquants), ', '.join(sorted(manquants))))
    for nom, raison in ECARTES.items():
        print('ecarte      : %-34s %s' % (nom[:34], raison))
    if inconnus:
        print('SANS CLE    : %d -> %s' % (len(inconnus), ', '.join(sorted(inconnus))))
    print('\nsortie : %s' % os.path.normpath(SORTIE))
    sys.exit(1 if manquants else 0)


if __name__ == '__main__':
    main()
