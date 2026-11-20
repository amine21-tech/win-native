# -*- coding: utf-8 -*-
"""
UN HOOK APPELE APRES UN `return` CONDITIONNEL FAIT PLANTER L'ECRAN. On les cherche tous.

CE QUE CE SCRIPT A TROUVE, ET POURQUOI IL EXISTE.

Les 19 et 20 novembre, deux ecrans noirs de suite, meme cause. PlaceSheet appelait `useState`
APRES son `if (!place) return null`. PanneauDirection appelait `useRef` et `useEffect` APRES le
`return` de l'arrivee. Dans les deux cas : tant que la condition est vraie le composant execute
N hooks et sort, puis un jour elle devient fausse et il en execute N+1. React les compte, et
leve << Rendered more hooks than during the previous render >>. L'exception demonte l'arbre
entier : l'utilisateur voit un ecran noir, sans un mot.

POURQUOI UN SCRIPT ET NON UNE RELECTURE. Le second cas repond mieux que n'importe quel
argument : le fichier PORTAIT LE COMMENTAIRE qui enonce la regle — << un hook ne peut pas etre
appele apres un retour conditionnel [...] l'animation est donc declaree avant >> — et la ligne
suivante la violait. Celui qui l'a ecrit connaissait la regle, l'avait ecrite, croyait l'avoir
appliquee. Une relecture ne rattrape pas cela ; un compte de lignes, oui.

Ni TypeScript, ni la compilation, ni l'ecran de developpement ne voient ce defaut : il ne se
declenche qu'au MOMENT OU LA CONDITION CHANGE — a l'ouverture d'une fiche, a l'arrivee d'une
manoeuvre.

CE SCRIPT A EU DEUX DEFAUTS A LUI, ET ILS MERITENT D'ETRE RACONTES.

  1. Il prenait `}: Props) {` — la fin des proprietes destructurees sur plusieurs lignes — pour
     la fin de la fonction, et ne regardait plus rien ensuite. Il annonçait << aucun hook
     fautif >> sur le fichier qui en contenait un.

  2. Il ne reconnaissait que les retours d'UNE SEULE LIGNE (`if (x) return null;`).
     PanneauDirection ecrit le sien dans un bloc, sur plusieurs lignes : il est passe au
     travers, et le script s'est tu le jour meme du second ecran noir.

Un verificateur qui se tait est pire que pas de verificateur : il donne une garantie fausse.
On le fait donc echouer sur un cas connu AVANT de le croire.

COMMENT IL LIT LE CODE. Il saute l'en-tete de la fonction jusqu'a l'accolade qui ouvre son
corps, puis suit la profondeur des accolades en retenant, pour chaque bloc ouvert, s'il s'agit
d'une FONCTION ou d'un simple bloc (`if`, `else`, `for`, `try`). Un `return` pose dans un simple
bloc appartient au composant : c'est un retour anticipe. Un `return` pose dans une fonction
imbriquee — le corps d'un `.map()`, un gestionnaire d'evenement — ne concerne que celle-ci et
doit etre ignore, sans quoi la moindre fonction flechee ferait crier le script sur un fichier
sain.

Usage, depuis la racine du depot :
  python -I apps/mobile/scripts/verifier-hooks.py
"""
import io
import os
import re
import sys

DOSSIERS = (os.path.join('apps', 'mobile', 'src'), os.path.join('apps', 'mobile', 'app'))

# Un hook : `useXxx(` avec une majuscule apres `use`. Cela couvre les hooks de React comme les
# notres (useMyPlaceIds, useAdminSession). `used...`, `user...` ne passent pas.
HOOK = re.compile(r'\b(use[A-Z]\w*)\s*\(')

# Le debut d'un composant ou d'un hook personnalise, en colonne zero : c'est la seule portee
# ou la regle des hooks s'applique.
DEBUT = re.compile(r'^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z_]\w*)\s*\(')

# Un `return` en debut d'instruction. Peu importe son indentation : c'est la pile des blocs,
# plus bas, qui decide s'il appartient au composant ou a une fonction imbriquee.
RETOUR = re.compile(r'(?:^|[{;}]|\)\s*)\s*return\b')

# Ouvre-t-on une FONCTION sur cette ligne, ou un simple bloc ? Une fleche ou le mot `function`
# avant l'accolade signe une fonction.
FONCTION = re.compile(r'(=>|\bfunction\b)')


def fichiers():
    for base in DOSSIERS:
        for dossier, _, noms in os.walk(base):
            if 'node_modules' in dossier:
                continue
            for nom in sorted(noms):
                if nom.endswith(('.tsx', '.ts')):
                    yield os.path.join(dossier, nom)


def nettoyer(ligne):
    """Retire les chaines et les commentaires : leurs accolades fausseraient le compte, et un
    `return` cite dans un commentaire n'est pas un `return`."""
    sans = re.sub(r'/\*.*?\*/', '', ligne)
    sans = re.sub(r"'(?:[^'\\]|\\.)*'", "''", sans)
    sans = re.sub(r'"(?:[^"\\]|\\.)*"', '""', sans)
    sans = re.sub(r'`(?:[^`\\]|\\.)*`', '``', sans)
    sans = re.sub(r'//.*$', '', sans)
    return sans


PAREN = 0


def avaler_entete(morceau):
    """Avale un morceau d'en-tete et dit si le corps commence. On compte les parentheses : des
    qu'elles sont refermees, la premiere accolade rencontree ouvre le corps."""
    global PAREN
    for car in morceau:
        if car == '(':
            PAREN += 1
        elif car == ')':
            PAREN -= 1
        elif car == '{' and PAREN <= 0:
            return True
    return False


def analyser(chemin):
    """Rend la liste des (composant, ligne, hook, ligne du retour) fautifs."""
    lignes = io.open(chemin, encoding='utf-8').read().split('\n')
    fautes = []

    global PAREN
    PAREN = 0
    composant = None
    entete = False       # on traverse encore la signature, pas le corps
    pile = []            # pour chaque bloc ouvert dans le corps : 'fn' ou 'bloc'
    retour = 0           # ligne du premier retour anticipe rencontre, 0 si aucun
    commentaire = False

    for n, brute in enumerate(lignes, 1):
        nue = brute.strip()

        # --- commentaires de bloc : ils contiennent des exemples de code, on les saute.
        if commentaire:
            if '*/' in nue:
                commentaire = False
            continue
        if nue.startswith('/*') and '*/' not in nue:
            commentaire = True
            continue
        if nue.startswith('//') or nue.startswith('*'):
            continue

        ligne = nettoyer(brute)

        # --- LA TRAVERSEE DE L'EN-TETE, QUI PEUT TENIR SUR PLUSIEURS LIGNES.
        #
        # On suit les PARENTHESES, pas les accolades : `function F({ place }: Props) {` et
        # `function F({` ouvrent autant d'accolades l'une que l'autre, et prendre la premiere
        # ligne finissant par une accolade pour la fin de l'en-tete faisait sauter le corps
        # entier des composants dont la signature tient sur une seule ligne. L'en-tete s'arrete
        # a l'accolade qui suit la fermeture de la liste des parametres.
        if entete:
            entete = not avaler_entete(ligne)
            continue

        # --- hors composant : on cherche le suivant.
        if composant is None:
            debut = DEBUT.match(ligne)
            if debut:
                nom = debut.group(1)
                perso = nom.startswith('use') and len(nom) > 3 and nom[3].isupper()
                if nom[0].isupper() or perso:
                    composant = nom
                    pile = []
                    retour = 0
                    # La signature commence SUR CETTE LIGNE : on la traverse des maintenant,
                    # sans quoi une signature d'une seule ligne n'aurait jamais de fin.
                    PAREN = 0
                    entete = not avaler_entete(ligne[debut.end() - 1:])
            continue

        # --- LA FIN D'UN COMPOSANT EST UNE ACCOLADE EN COLONNE ZERO, ET RIEN D'AUTRE.
        #
        # La version precedente la deduisait du compte d'accolades, et ce compte derivait : sur
        # les 600 lignes de JSX de PlaceSheet, une seule accolade mal lue — dans un texte, un
        # gabarit, une expression — suffisait a ne jamais refermer le composant. Il a ainsi
        # accuse `usePhotoSelection`, une fonction independante declaree 600 lignes plus bas,
        # d'appeler un hook apres le retour de PlaceSheet. Un signal typographique ne derive
        # pas : dans un fichier formate, la fonction de premier niveau se ferme en colonne zero.
        if ligne.startswith('}'):
            composant = None
            retour = 0
            continue

        propre = 'fn' not in pile      # sommes-nous dans le corps du composant lui-meme ?

        # --- un hook APRES un retour anticipe : c'est la faute cherchee.
        if retour and propre:
            trouve = HOOK.search(ligne)
            if trouve:
                fautes.append((composant, n, trouve.group(1), retour))

        # --- le premier retour anticipe du composant.
        if not retour and propre and RETOUR.search(ligne):
            retour = n

        # --- suivi de la profondeur, caractere par caractere.
        fini = False
        for i, car in enumerate(ligne):
            if car == '{':
                pile.append('fn' if FONCTION.search(ligne[:i + 1]) else 'bloc')
            elif car == '}':
                if pile:
                    pile.pop()
                else:
                    composant = None     # l'accolade qui ferme le composant lui-meme
                    retour = 0
                    fini = True
                    break
        if fini:
            continue

    return fautes


# ---------------------------------------------------------------------------------------------
# L'EPREUVE DU VERIFICATEUR LUI-MEME. Elle tourne a chaque execution, et elle passe en premier.
#
# Ce script s'est tu deux fois sur un fichier fautif. Une garantie fausse est pire qu'aucune
# garantie : avant de rien affirmer sur le projet, il se prouve sur des cas dont on connait la
# reponse — les deux formes du defaut, et deux pieges qui ne doivent pas le faire crier.
# ---------------------------------------------------------------------------------------------
CAS = [
    ('retour sur une seule ligne', 1, """
export function Fiche({ place }: Props) {
  const nom = useNom();
  if (!place) return null;
  const [ouvert, setOuvert] = useState(false);
  return <Vue />;
}
"""),
    ('retour dans un bloc, sur plusieurs lignes', 2, """
export function Panneau({ arrive, manoeuvre }: Props) {
  const { t } = useTranslation();
  if (arrive || !manoeuvre) {
    return (
      <Vue>
        <Texte>{t('arrive')}</Texte>
      </Vue>
    );
  }
  const clignote = useRef(new Valeur(1)).current;
  useEffect(() => {}, [clignote]);
  return <Vue />;
}
"""),
    ('un retour dans une fonction imbriquee ne compte pas', 0, """
export function Liste({ items }: Props) {
  const rendus = items.map((x) => {
    if (!x) return null;
    return <Ligne />;
  });
  const [choisi, setChoisi] = useState(null);
  return <Vue>{rendus}</Vue>;
}
"""),
    ('une fonction voisine n est pas la suite de la precedente', 0, """
export function Fiche({ place }: Props) {
  if (!place) return null;
  return <Vue />;
}

function usePhoto(galerie: string[]): string | null {
  const [choisie, setChoisie] = useState(null);
  return choisie ?? galerie[0];
}
"""),
    ('en-tete sur plusieurs lignes', 1, """
export function Grande({
  place,
  onClose,
}: Props) {
  const nom = useNom();
  if (!place) return null;
  const [x, setX] = useState(0);
  return <Vue />;
}
"""),
]

echecs = []
for nom, attendu, source in CAS:
    tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.epreuve-hooks.tsx')
    io.open(tmp, 'w', encoding='utf-8').write(source)
    try:
        obtenu = len(analyser(tmp))
    finally:
        os.remove(tmp)
    if obtenu != attendu:
        echecs.append('  %s : %d faute(s) attendue(s), %d trouvee(s)' % (nom, attendu, obtenu))

if echecs:
    print()
    print('LE VERIFICATEUR LUI-MEME EST FAUX.')
    print('Il ne dira rien du projet avant d etre repare.')
    for echec in echecs:
        print(echec)
    print()
    sys.exit(2)


total = 0
for chemin in fichiers():
    for composant, n, hook, retour in analyser(chemin):
        total += 1
        print('  FAUX  %s:%d  %s() appele dans %s APRES le retour de la ligne %d'
              % (chemin.replace(os.sep, '/'), n, hook, composant, retour))

if total == 0:
    print('\n  ok    Aucun hook appele apres un retour anticipe.')
    print('        Tous les composants executent le meme nombre de hooks a chaque rendu.\n')
    sys.exit(0)

print('\nA CORRIGER : %d hook(s) appele(s) apres un retour anticipe.' % total)
print("Deplacez-les AVANT le retour. React compte les hooks : en executer un de plus qu'au")
print("rendu precedent leve une exception qui demonte tout l'ecran.\n")
sys.exit(1)
