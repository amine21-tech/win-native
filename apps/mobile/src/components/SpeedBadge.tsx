import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FixListener } from '../navigation/useLiveLocation';
import { spacing, type Palette } from '../theme';

type Props = {
  subscribe: (listener: FixListener) => () => void;
  colors: Palette;
  /** Placement : `top` OU `bottom`, jamais les deux. Le site le place en haut a gauche pendant
   * le guidage ; le mode paysage le renvoie en bas a droite, ou la colonne de consignes ne
   * l'atteint pas. */
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

/**
 * Compteur de vitesse, branche directement sur le flux de position.
 *
 * Il s'abonne lui-meme plutot que de recevoir la vitesse en propriete : ainsi, une
 * variation de vitesse ne re-rend que ce petit cadre, jamais l'ecran de carte entier.
 * C'est la meme raison qui fait passer la camera par un abonnement (voir useSmoothCamera).
 *
 * La valeur affichee est la vitesse MESUREE par le GPS. Une limite reglementaire (#7)
 * demanderait une source de donnees dont on ne dispose pas encore — Valhalla n'expose pas
 * la vitesse maximale par troncon dans notre integration — et afficher un chiffre invente
 * serait dangereux au volant.
 */
export const SpeedBadge = memo(function SpeedBadge({ subscribe, colors, top, bottom, left, right }: Props) {
  const [kmh, setKmh] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribe((fix) => {
      const next = Math.round(fix.speedMps * 3.6);
      // Le flux arrive a la cadence de l'ecran : on ne re-rend que quand le chiffre
      // AFFICHE change, soit au plus une fois par km/h franchi.
      if (shownRef.current === next) return;
      shownRef.current = next;
      setKmh(next);
    });
  }, [subscribe]);

  if (kmh == null) return null;

  return (
    <View
      style={[
        styles.badge,
        right != null ? { right } : { left: left ?? spacing.md },
        top != null ? { top } : { bottom },
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.value, { color: colors.text }]}>{kmh}</Text>
      <Text style={[styles.unit, { color: colors.textMuted }]}>km/h</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  value: { fontSize: 19, fontWeight: '800' as const, lineHeight: 22 },
  unit: { fontSize: 9, fontWeight: '700' as const, marginTop: -2 },
});
