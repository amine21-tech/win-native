import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * L'APPLICATION NE DOIT JAMAIS DEVENIR UN ECRAN NOIR.
 *
 * CE QUI S'EST PASSE LE 19 NOVEMBRE. Une recherche de lieu a rendu l'ecran entierement noir,
 * sans un mot. L'application tournait toujours — la barre d'etat et les boutons d'Android
 * etaient la — mais React avait demonte l'arbre entier a cause d'une exception levee pendant
 * un rendu. C'est exactement le defaut deja rencontre dans l'espace d'administration, et pour
 * lequel SectionSure avait ete ecrit ; l'ecran principal, lui, n'avait aucun filet.
 *
 * POURQUOI C'EST PLUS GRAVE ICI QU'AILLEURS. WIN est une application de navigation. Un ecran
 * noir chez un administrateur fait perdre une liste d'annonces ; un ecran noir chez un
 * conducteur lui retire sa carte, son itineraire et sa position — au volant, et parfois sur une
 * route qu'il ne connait pas. Aucune panne ne justifie cela : mieux vaut un cadre qui dit ce
 * qui s'est casse et un bouton pour repartir.
 *
 * ET IL REND LA PANNE RAPPORTABLE. Le message et le NOM DU COMPOSANT fautif sont affiches.
 * C'est tout ce qui separe << ca bug, ecran noir >> — ou personne ne peut rien faire — d'une
 * capture d'ecran qui designe la ligne a corriger. Le telephone de test n'est pas branche en
 * USB et n'a pas de console : cet encadre EST la console.
 *
 * CE N'EST PAS UNE EXCUSE POUR LAISSER LA CAUSE EN PLACE. Un filet qui transforme une panne en
 * cadre rouge la rend supportable, jamais acceptable. Il sert a ce qu'on la voie.
 *
 * Voir aussi SectionSure, qui fait la meme chose a l'echelle d'un bloc : celui-ci est le
 * dernier recours, pose a la racine, pour ce qu'aucun autre n'a rattrape.
 */

type Props = { children: ReactNode };
type State = { erreur: Error | null; composant: string | null };

export class EcranSur extends Component<Props, State> {
  state: State = { erreur: null, composant: null };

  static getDerivedStateFromError(erreur: Error): Partial<State> {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    /* LA PILE DES COMPOSANTS EST CE QUI DESIGNE LE COUPABLE, bien plus surement que le message :
     * << Cannot read property 'x' of undefined >> ne dit rien, << at PartnerRow >> dit tout.
     * On n'en garde que les premieres lignes — au-dela, ce sont les enveloppes de navigation,
     * les memes pour toutes les pannes. */
    const lignes = (info.componentStack ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join('\n');
    this.setState({ composant: lignes || null });
    console.error('[EcranSur]', erreur, lignes);
  }

  reprendre = () => this.setState({ erreur: null, composant: null });

  render() {
    const { erreur, composant } = this.state;
    if (!erreur) return this.props.children;

    return (
      <View style={styles.fond}>
        <ScrollView contentContainerStyle={styles.corps}>
          <Text style={styles.titre}>⚠  WIN s&apos;est arrêté un instant</Text>
          <Text style={styles.phrase}>
            Une partie de l&apos;écran n&apos;a pas pu s&apos;afficher. Appuyez sur
            «&nbsp;Reprendre&nbsp;» pour continuer.
          </Text>

          {/* MONTRE SANS DETOUR : cet encadre n'existe que pour etre photographie et envoye. */}
          <Text style={styles.etiquette}>Message</Text>
          <Text style={styles.technique} selectable>
            {erreur.message || String(erreur)}
          </Text>

          {composant ? (
            <>
              <Text style={styles.etiquette}>Où</Text>
              <Text style={styles.technique} selectable>
                {composant}
              </Text>
            </>
          ) : null}

          <Pressable onPress={this.reprendre} style={styles.bouton}>
            <Text style={styles.boutonTexte}>Reprendre</Text>
          </Pressable>

          <Text style={styles.note}>
            Merci d&apos;envoyer une photo de cet écran : il indique précisément ce qui a échoué.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

/* Couleurs fixes, et non celles du theme : le theme vient d'un store, et ce composant doit
 * pouvoir s'afficher meme quand c'est le store qui a echoue. Fond clair, car un cadre sombre
 * sur un ecran deja noir serait a peine distinguable de la panne qu'il remplace. */
const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: '#FFF8F6' },
  corps: { padding: 20, paddingTop: 72, gap: 8 },
  titre: { color: '#C0392B', fontSize: 18, fontWeight: '800' },
  phrase: { color: '#7B241C', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  etiquette: { color: '#C0392B', fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginTop: 8 },
  technique: {
    color: '#5A1A12',
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderRadius: 8,
    padding: 10,
  },
  bouton: {
    marginTop: 20,
    backgroundColor: '#0B5B2C',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  note: { color: '#7B241C', fontSize: 12, marginTop: 12, lineHeight: 17 },
});
