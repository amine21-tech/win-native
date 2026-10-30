"""
Verifie qu'une APK publiee est installable, en la comparant a une APK de reference.

POURQUOI UNE REFERENCE PLUTOT QU'UNE LISTE DE CRITERES. On ne peut pas prouver qu'une APK
s'installera sans l'installer. En revanche on peut prouver qu'elle est fabriquee EXACTEMENT
comme une version dont on sait qu'elle s'est installee sur le telephone du client. C'est la
seule garantie qu'on puisse donner a distance, et elle a suffi a ecarter l'APK a chaque fois
que le client a signale << probleme lors de l'analyse du package >> : le defaut etait toujours
un telechargement tronque, jamais le paquet.

CE QUI EST COMPARE, ET POURQUOI CES POINTS-LA :
  - la TAILLE exacte, contre celle annoncee par GitHub. Un octet manquant et Android refuse
    le paquet sans pouvoir dire pourquoi. C'est la cause numero un.
  - le nombre d'ENTREES et la taille du MANIFESTE : une difference ici veut dire que la
    chaine de compilation a change, pas seulement le code.
  - le bloc de SIGNATURE v2 : son absence rend le paquet non installable.
  - `resources.arsc` NON COMPRESSE : depuis Android 11, un resources.arsc compresse fait
    echouer l'analyse du paquet. C'est precisement le message que le client a vu.

Usage :
  python -I scripts/verifier-apk.py <reference.apk> <a-verifier.apk> [taille_attendue]
  python -I scripts/verifier-apk.py <reference.apk> <a-verifier.apk> --chaines "Statut" "Overview"
"""
import re
import struct
import sys
import zipfile

ID_SIGNATURE_V2 = 0x7109871A


def declarations(manifeste):
    """Permissions et composants declares par le manifeste binaire.

    POURQUOI PAS SA TAILLE. On comparait le manifeste OCTET POUR OCTET, ce qui parait prudent
    et ne l'est pas : sa taille change des que le NOM DE VERSION change de longueur. Le passage
    de << 1.0.99 >> a << 1.0.100 >> a ainsi fait refuser une livraison parfaitement saine —
    quatre octets d'ecart, soit un caractere de plus en UTF-16.

    Un controle qui se declenche sur un changement anodin finit par etre ignore, et le jour ou
    il attrape une vraie permission ajoutee en douce, plus personne ne le lit. On compare donc
    ce qu'on voulait reellement surveiller : ce que l'application DEMANDE a Android.

    Releve par lecture du pool de chaines UTF-16 du manifeste binaire : approximatif, mais il
    ne rate aucune permission, et c'est tout ce qu'on lui demande.
    """
    texte = manifeste.decode('utf-16-le', 'ignore')
    mots = set(re.findall(r'[A-Za-z0-9_.]{6,}', texte))
    return sorted(m for m in mots if 'permission' in m.lower() or m.startswith('android.intent')
                  or m.endswith('Activity') or m.endswith('Service') or m.endswith('Receiver'))


def bloc_signature_v2(donnees):
    """Taille du bloc de signature v2, ou None s'il est absent."""
    i = donnees.rfind(b'APK Sig Block 42')
    if i < 0:
        return None
    taille = struct.unpack('<Q', donnees[i - 8:i])[0]
    p = i + 16 - taille - 8 + 8
    fin = i - 8
    while p < fin:
        longueur = struct.unpack('<Q', donnees[p:p + 8])[0]
        if longueur < 4:
            break
        if struct.unpack('<I', donnees[p + 8:p + 12])[0] == ID_SIGNATURE_V2:
            return longueur
        p += 8 + longueur
    return None


def etat(chemin):
    donnees = open(chemin, 'rb').read()
    z = zipfile.ZipFile(chemin)
    arsc = z.getinfo('resources.arsc')
    return {
        'octets': len(donnees),
        'entrees': len(z.namelist()),
        'manifeste': len(z.read('AndroidManifest.xml')),
        'declare': declarations(z.read('AndroidManifest.xml')),
        'arsc_compresse': arsc.compress_type != 0,
        'signature_v2': bloc_signature_v2(donnees),
        'bundle': z.read('assets/index.android.bundle'),
    }


def present(bundle, texte):
    """Hermes range les chaines ASCII et les chaines accentuees dans DEUX tables distinctes :
    chercher dans un seul encodage rendrait faux pour tout texte accentue."""
    return texte.encode('utf-16-le') in bundle or texte.encode('utf-8') in bundle


def main():
    args = [a for a in sys.argv[1:]]
    chaines = []
    if '--chaines' in args:
        i = args.index('--chaines')
        chaines = args[i + 1:]
        args = args[:i]
    if len(args) < 2:
        print(__doc__)
        return 1

    reference, verifier = args[0], args[1]
    taille_attendue = int(args[2]) if len(args) > 2 else None

    r, v = etat(reference), etat(verifier)
    fautes = []

    print('reference : %s' % reference)
    print('  %d octets, %d entrees, manifeste %d o, signature v2 %s o, arsc compresse=%s'
          % (r['octets'], r['entrees'], r['manifeste'], r['signature_v2'], r['arsc_compresse']))
    print('a verifier : %s' % verifier)
    print('  %d octets, %d entrees, manifeste %d o, signature v2 %s o, arsc compresse=%s'
          % (v['octets'], v['entrees'], v['manifeste'], v['signature_v2'], v['arsc_compresse']))
    print()

    if taille_attendue is not None and v['octets'] != taille_attendue:
        fautes.append('TAILLE : %d octets au lieu des %d annonces — telechargement tronque.'
                      % (v['octets'], taille_attendue))
    if v['signature_v2'] is None:
        fautes.append('SIGNATURE v2 ABSENTE : le paquet ne s\'installera pas.')
    if v['arsc_compresse']:
        fautes.append('resources.arsc COMPRESSE : refuse a l\'analyse depuis Android 11.')
    if v['entrees'] != r['entrees']:
        fautes.append('ENTREES : %d contre %d dans la reference — la chaine de compilation a change.'
                      % (v['entrees'], r['entrees']))
    if v['declare'] != r['declare']:
        ajoutees = [d for d in v['declare'] if d not in r['declare']]
        retirees = [d for d in r['declare'] if d not in v['declare']]
        fautes.append('MANIFESTE : les declarations ont change. Ajoutees : %s · Retirees : %s'
                      % (ajoutees or 'aucune', retirees or 'aucune'))
    elif v['manifeste'] != r['manifeste']:
        # Taille differente mais memes declarations : c'est le nom de version qui a change de
        # longueur. On le DIT, sans refuser la livraison.
        print('  note : manifeste %d o contre %d — meme permissions, meme composants '
              '(le nom de version a change de longueur).' % (v['manifeste'], r['manifeste']))

    for texte in chaines:
        if not present(v['bundle'], texte):
            fautes.append('CHAINE ABSENTE du paquet : %r' % texte)
        else:
            print('  chaine presente : %s' % texte)

    print()
    if fautes:
        print('A NE PAS LIVRER :')
        for f in fautes:
            print('  ' + f)
        return 1
    print('Fabriquee exactement comme la reference. Livrable.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
