/**
 * L'ADRESSE D'UNE OFFRE D'EMPLOI, mise en une ligne lisible.
 *
 * POURQUOI CE FICHIER EXISTE A PART. La fonction tient en quatre lignes, mais elle vit dans un
 * composant qui importe React Native : un script de verification qui l'importerait chargerait
 * tout React Native et echouerait au demarrage, avant d'avoir rien verifie. Meme decoupage que
 * degradeTrace.ts, manoeuvreRatee.ts et voiesRegles.ts, et pour la meme raison.
 *
 * Voir scripts/verifier-emploi-adresse.ts.
 */

export type AdresseOffre = {
  houseNumber?: string | null;
  street?: string | null;
  postcode?: string | null;
  city?: string | null;
};

/**
 * L'adresse en une ligne, ou une chaine VIDE quand on n'a rien.
 *
 * LES MORCEAUX ABSENTS DISPARAISSENT, ET C'EST TOUT L'INTERET. Un simple
 * `${numero} ${rue}, ${cp} ${ville}` sur une annonce qui n'a que la ville afficherait
 * << , Oran >> — une virgule orpheline qui donne l'impression d'un champ perdu, voire d'une
 * application cassee.
 *
 * CE N'EST PAS UN CAS RARE, c'est le cas le plus courant au contraire : toutes les annonces
 * publiees avant le 10 novembre n'ont aucune adresse, et beaucoup des suivantes n'auront que la
 * ville — c'est le seul champ que le formulaire exige.
 *
 * LA VIRGULE SEPARE LA VOIE DE LA LOCALITE, pas chaque morceau. << 12 Rue Didouche Mourad,
 * 16000 Alger >> se lit comme une adresse ; << 12, Rue Didouche Mourad, 16000, Alger >> se lit
 * comme une liste.
 */
export function adresseLisible(o: AdresseOffre): string {
  const voie = [o.houseNumber, o.street].filter(Boolean).join(' ').trim();
  const localite = [o.postcode, o.city].filter(Boolean).join(' ').trim();
  return [voie, localite].filter(Boolean).join(', ');
}

/**
 * La requete a envoyer au geocodeur pour situer le lieu de travail.
 *
 * ELLE N'EST PAS LA MEME QUE L'AFFICHAGE : pas de virgule, et le code postal AVANT la ville,
 * parce qu'un geocodeur segmente sur les espaces et se sert du code postal comme d'un indice de
 * localite. La ponctuation, elle, ne lui apporte rien et peut le gener.
 */
export function requeteGeocodage(o: AdresseOffre): string {
  return [o.houseNumber, o.street, o.postcode, o.city]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
    .join(' ');
}
