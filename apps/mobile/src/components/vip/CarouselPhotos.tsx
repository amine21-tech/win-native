import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { photoSource } from '../../place/placePhoto';
import { radius, spacing, vip, type Palette } from '../../theme';

/**
 * LE CAROUSEL DE PHOTOS — amelioration 2 de la synthese « Fiche VIP Premium ».
 *
 * Les fiches ordinaires montrent une vignette ; la fiche VIP montre ses photos, en pleine
 * largeur, qu'on fait defiler du doigt, avec des pastilles qui disent combien il en reste.
 *
 * POURQUOI UN ScrollView ET NON ViewPager2. ViewPager2 est un composant Android ; en React
 * Native, un `ScrollView` horizontal avec `pagingEnabled` donne le meme geste, le meme arret
 * cale sur chaque photo, et il est deja dans l'application. Ajouter une dependance pour cela
 * serait du poids sans gain. C'est aussi la reponse aux deux `ViewPager2` que le correctif v2
 * ecrit dans ses exemples de code, aux points B et C.
 *
 * ON AFFICHE TOUTES LES PHOTOS DE LA FICHE, PAS TROIS. Le document dit « 3 photos swipeables »,
 * et trois est le cas courant — c'est ce que la plupart des partenaires envoient. Mais le
 * formulaire en accepte six, et s'arreter a trois jetterait silencieusement les photos qu'un
 * partenaire a prises la peine d'ajouter apres avoir paye. Les pastilles s'adaptent au nombre
 * reel ; une seule photo n'en affiche aucune, puisqu'il n'y a rien a parcourir.
 *
 * LES MINIATURES VIENNENT DU CORRECTIF v2, ET LES DEUX POINTS LES VEULENT A DES ENDROITS
 * DIFFERENTS — c'est pour cela que leur place est une propriete et non un choix ecrit ici.
 *
 *   Point B, fiche VIP : << miniatures cliquables a droite de la zone carrousel >>.
 *   Point C, annonce d'emploi : << miniatures + dots de navigation sous le carrousel >>.
 *
 * UN SEUL COMPOSANT POUR LES DEUX, et ce n'est pas de l'economie de lignes : un carousel porte
 * la mesure de sa page, la position courante, l'etat de chargement de chaque image et le
 * rattrapage de celles qui echouent. Ecrit deux fois, c'est la seconde copie qui garde les
 * defauts qu'on vient de corriger dans la premiere.
 */

/**
 * LES TROIS SEULES COULEURS DONT LE CAROUSEL A BESOIN, et c'est pourquoi il ne demande pas une
 * palette entiere : le fond d'attente d'une image, la couleur du tourniquet de chargement et
 * l'or qui entoure la miniature courante.
 *
 * CE N'EST PAS DE LA COQUETTERIE DE TYPE. La feuille Emploi ne suit PAS le theme de
 * l'application — ses couleurs sont figees depuis le 26 octobre, apres un ecran devenu
 * illisible en mode nuit. Elle ne peut donc pas passer `palette.light`, qui n'est pas la
 * sienne ; avec trois champs nommes, elle passe exactement les trois couleurs de sa maquette.
 * La fiche VIP, elle, continue de passer sa palette complete : un objet plus riche satisfait
 * toujours un type plus pauvre.
 */
export type CouleursCarousel = Pick<Palette, 'accent' | 'gold' | 'surfaceAlt'>;

type Props = {
  /** Adresses des photos, dans l'ordre d'affichage voulu. */
  photos: string[];
  colors: CouleursCarousel;
  /** Le credit pose en bas de l'image, deja traduit. */
  credit?: string;
  /** Hauteur de la zone, en points. Par defaut celle de la fiche VIP. */
  hauteur?: number;
  /** Ou poser les miniatures cliquables. Par defaut : aucune, comme avant le correctif v2. */
  vignettes?: 'aucune' | 'bas' | 'droite';
};

/** Cote d'une miniature de la colonne de droite, et hauteur d'une miniature du bas. */
const VIGNETTE = 54;

export function CarouselPhotos({
  photos,
  colors,
  credit,
  hauteur = vip.carouselHeight,
  vignettes = 'aucune',
}: Props) {
  const { t } = useTranslation();
  const { width: largeurEcran } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  /* Un etat PAR PHOTO, et non un seul pour le carousel : la deuxieme image peut echouer quand
   * la premiere s'affiche, et un seul drapeau ferait disparaitre les deux ou mentir sur l'une. */
  const [echecs, setEchecs] = useState<Record<string, boolean>>({});
  const [charges, setCharges] = useState<Record<string, boolean>>({});

  /* La largeur d'une page, c'est la largeur REELLE du carousel. On la mesure plutot que de
   * prendre celle de l'ecran : la fiche a des marges, et une page trop large decalerait
   * l'arret de la pagination d'un cran a chaque photo — l'image s'immobiliserait de travers.
   * Avec les miniatures a droite, elle est en plus amputee de leur colonne : raison de plus
   * pour la mesurer la ou elle sert, et non la deduire. */
  const [largeurPage, setLargeurPage] = useState(Math.round(largeurEcran));

  /* LA REFERENCE QUI REND LES MINIATURES CLIQUABLES. Sans elle, une miniature ne pourrait que
   * mettre a jour la pastille sans deplacer l'image : le carousel resterait ou il est, et la
   * position affichee mentirait sur ce qu'on regarde. */
  const defilement = useRef<ScrollView | null>(null);

  const visibles = photos.filter((p) => !echecs[p]);
  if (visibles.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (largeurPage <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / largeurPage);
    if (i !== index && i >= 0 && i < visibles.length) setIndex(i);
  };

  const allerA = (i: number) => {
    setIndex(i);
    defilement.current?.scrollTo({ x: i * largeurPage, animated: true });
  };

  const carrousel = (
    <View
      style={[
        styles.cadre,
        { height: hauteur, backgroundColor: colors.surfaceAlt },
        /* Dans une rangee, une largeur de 100 % pousserait les miniatures hors de l'ecran. */
        vignettes === 'droite' ? styles.cadreEnRangee : null,
      ]}
      onLayout={(e) => {
        const l = Math.round(e.nativeEvent.layout.width);
        if (l > 0 && l !== largeurPage) setLargeurPage(l);
      }}
    >
      <ScrollView
        ref={defilement}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        /* Sans cela, un geste horizontal commence par faire glisser la fiche entiere : les deux
         * defilements se disputent le doigt, et une photo sur deux ne bouge pas. */
        nestedScrollEnabled
      >
        {visibles.map((url) => (
          <View key={url} style={{ width: largeurPage, height: hauteur }}>
            <Image
              source={photoSource(url)}
              style={styles.photo}
              resizeMode="cover"
              onLoad={() => setCharges((e) => ({ ...e, [url]: true }))}
              onError={() => setEchecs((e) => ({ ...e, [url]: true }))}
            />
            {!charges[url] ? (
              <View style={[StyleSheet.absoluteFill, styles.chargement]}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {/* Le credit reste pose sur l'image, comme sur la fiche ordinaire : il dit d'ou vient ce
          qu'on regarde, et ce n'est pas moins vrai sur une fiche payante. */}
      {credit ? (
        <View style={styles.credit} pointerEvents="none">
          <Text style={styles.creditTexte} numberOfLines={1}>
            📷  {credit}
          </Text>
        </View>
      ) : null}

      {visibles.length > 1 ? (
        <>
          <View style={[styles.pastilles, credit ? null : styles.pastillesSansCredit]} pointerEvents="none">
            {visibles.map((url, i) => (
              <View
                key={url}
                style={[
                  styles.pastille,
                  i === index ? styles.pastilleActive : null,
                ]}
              />
            ))}
          </View>
          {/* « 2 / 3 ». Les pastilles disent la position, le compteur dit le total — sur trois
              points de cinq pixels, l'un ne remplace pas l'autre. */}
          <View style={styles.compteur} pointerEvents="none">
            <Text style={styles.compteurTexte}>
              {t('place.photoCount', { n: index + 1, total: visibles.length })}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );

  /* UNE SEULE PHOTO N'A PAS DE MINIATURES, quelle que soit la demande : une vignette qui
   * reproduit en petit l'image qu'on regarde deja ne sert a rien et vole de la place a
   * celle-ci. C'est la meme regle que les pastilles. */
  if (vignettes === 'aucune' || visibles.length < 2) return carrousel;

  const barreVignettes = (
    <View style={vignettes === 'droite' ? styles.colonneVignettes : styles.rangeeVignettes}>
      {visibles.map((url, i) => (
        <Pressable
          key={url}
          onPress={() => allerA(i)}
          accessibilityRole="button"
          accessibilityLabel={t('place.photoCount', { n: i + 1, total: visibles.length })}
          accessibilityState={{ selected: i === index }}
          style={[
            styles.vignette,
            vignettes === 'droite' ? styles.vignetteHaute : null,
            { borderColor: i === index ? colors.gold : 'transparent' },
          ]}
        >
          <Image source={photoSource(url)} style={styles.photo} resizeMode="cover" />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={vignettes === 'droite' ? styles.enRangee : undefined}>
      {carrousel}
      {barreVignettes}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cadreEnRangee: { width: undefined, flex: 1 },
  photo: { width: '100%', height: '100%' },
  chargement: { alignItems: 'center', justifyContent: 'center' },
  credit: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  creditTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' as const },
  /* Au-dessus du bandeau de credit, et non dessus : poses au meme endroit, les points
   * disparaissaient dans le texte. Sans credit — le cas d'une annonce d'emploi — ils
   * redescendent au bas de la zone, qui est la ou le point C les demande. */
  pastilles: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  pastillesSansCredit: { bottom: 8 },
  pastille: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  pastilleActive: { backgroundColor: '#FFFFFF', width: 16 },
  compteur: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  compteurTexte: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' as const, fontVariant: ['tabular-nums'] },

  /* LES DEUX DISPOSITIONS DES MINIATURES. A droite (point B) : une rangee dont la seconde
   * colonne est etroite et fixe. En bas (point C) : rien de particulier, les miniatures
   * s'alignent sous le carousel. */
  enRangee: { flexDirection: 'row', gap: 6 },
  colonneVignettes: { width: VIGNETTE, gap: 6 },
  rangeeVignettes: { flexDirection: 'row', gap: 6, marginTop: 6 },
  vignette: {
    width: VIGNETTE,
    height: VIGNETTE * 0.78,
    borderRadius: radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  /* A droite, les miniatures se partagent la hauteur du carousel : trois photos et deux ecarts
   * remplissent exactement la colonne, quelle que soit la hauteur demandee. */
  vignetteHaute: { height: undefined, flex: 1 },
});
