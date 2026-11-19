import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
 * serait du poids sans gain.
 *
 * ON AFFICHE TOUTES LES PHOTOS DE LA FICHE, PAS TROIS. Le document dit « 3 photos swipeables »,
 * et trois est le cas courant — c'est ce que la plupart des partenaires envoient. Mais le
 * formulaire en accepte six, et s'arreter a trois jetterait silencieusement les photos qu'un
 * partenaire a prises la peine d'ajouter apres avoir paye. Les pastilles s'adaptent au nombre
 * reel ; une seule photo n'en affiche aucune, puisqu'il n'y a rien a parcourir.
 */

type Props = {
  /** Adresses des photos, dans l'ordre d'affichage voulu. */
  photos: string[];
  colors: Palette;
  /** Le credit pose en bas de l'image, deja traduit. */
  credit?: string;
};

export function CarouselPhotos({ photos, colors, credit }: Props) {
  const { t } = useTranslation();
  const { width: largeurEcran } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  /* Un etat PAR PHOTO, et non un seul pour le carousel : la deuxieme image peut echouer quand
   * la premiere s'affiche, et un seul drapeau ferait disparaitre les deux ou mentir sur l'une. */
  const [echecs, setEchecs] = useState<Record<string, boolean>>({});
  const [charges, setCharges] = useState<Record<string, boolean>>({});

  /* La largeur d'une page, c'est la largeur REELLE du carousel. On la mesure plutot que de
   * prendre celle de l'ecran : la fiche a des marges, et une page trop large decalerait
   * l'arret de la pagination d'un cran a chaque photo — l'image s'immobiliserait de travers. */
  const [largeurPage, setLargeurPage] = useState(Math.round(largeurEcran));

  const visibles = photos.filter((p) => !echecs[p]);
  if (visibles.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (largeurPage <= 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / largeurPage);
    if (i !== index && i >= 0 && i < visibles.length) setIndex(i);
  };

  return (
    <View
      style={[styles.cadre, { backgroundColor: colors.surfaceAlt }]}
      onLayout={(e) => {
        const l = Math.round(e.nativeEvent.layout.width);
        if (l > 0 && l !== largeurPage) setLargeurPage(l);
      }}
    >
      <ScrollView
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
          <View key={url} style={{ width: largeurPage, height: vip.carouselHeight }}>
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
          <View style={styles.pastilles} pointerEvents="none">
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
}

const styles = StyleSheet.create({
  cadre: {
    width: '100%',
    height: vip.carouselHeight,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
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
   * disparaissaient dans le texte. */
  pastilles: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
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
});
