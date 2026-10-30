import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * UNE SECTION QUI TOMBE NE DOIT PAS EMPORTER L'ECRAN.
 *
 * POURQUOI CECI EXISTE. L'espace d'administration affiche ses sections les unes sous les
 * autres : le tableau de bord, les annonces, les remarques, les photos, les codes, les
 * deblocages. Une exception levee pendant le rendu de L'UNE d'elles efface TOUT — React
 * demonte l'arbre entier, et l'ecran devient noir.
 *
 * Ce n'est pas une hypothese : c'est arrive. La liste des annonces lisait le tarif d'une
 * formule inconnue, ce qui revenait a lire une propriete sur `undefined`. L'administrateur
 * n'a pas vu une liste d'annonces cassee — il a vu un ecran noir, sans un mot, et sans aucun
 * moyen de savoir d'ou cela venait ni d'atteindre les autres sections, pourtant intactes.
 *
 * CE QUE CHANGE CETTE ENVELOPPE. La section fautive est remplacee par un cadre rouge qui dit
 * ce qui s'est passe ; tout le reste de l'ecran continue de fonctionner. Un administrateur
 * peut toujours traiter ses remarques et ses photos pendant que les annonces attendent une
 * correction.
 *
 * ELLE NE DISPENSE PAS DE CORRIGER LA CAUSE. Un filet de securite qui transforme une panne en
 * cadre rouge rend la panne SUPPORTABLE, pas acceptable — et le message affiche est fait pour
 * qu'on puisse la rapporter : il donne le nom de la section et le texte de l'erreur.
 *
 * Une classe et non un hook : React n'offre encore aucun equivalent fonctionnel a
 * `componentDidCatch`, et c'est le seul endroit de l'application ou cela se justifie.
 */

type Props = { nom: string; children: ReactNode };
type State = { erreur: Error | null };

export class SectionSure extends Component<Props, State> {
  state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error) {
    // La console de developpement garde la trace complete ; l'ecran n'en montre que l'essentiel.
    console.error(`[${this.props.nom}]`, erreur);
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;

    return (
      <View style={styles.cadre}>
        <Text style={styles.titre}>⚠  {this.props.nom}</Text>
        <Text style={styles.texte}>
          Cette section n&apos;a pas pu s&apos;afficher. Le reste de l&apos;écran fonctionne.
        </Text>
        {/* LE MESSAGE TECHNIQUE EST MONTRE, et c'est voulu : cet ecran n'est vu que par un
            administrateur, et c'est la seule chose qui permette de rapporter la panne
            utilement. Le cacher reviendrait a redonner un ecran muet. */}
        <Text style={styles.detail} selectable>
          {erreur.message || String(erreur)}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  cadre: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#C0392B',
    borderRadius: 12,
    backgroundColor: 'rgba(192,57,43,0.08)',
    padding: 12,
    gap: 4,
  },
  titre: { color: '#C0392B', fontSize: 14, fontWeight: '800' },
  texte: { color: '#C0392B', fontSize: 12.5 },
  detail: { color: '#7B241C', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
});
