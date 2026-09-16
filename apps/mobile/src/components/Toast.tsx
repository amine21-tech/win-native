import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  message: string | null;
  onHide: () => void;
  durationMs?: number;
};

/** Message ephemere centre a l'ecran, repris de `.toast` en v83. */
export function Toast({ message, onHide, durationMs = 2200 }: Props) {
  // `onHide` est presque toujours ecrit en ligne par l'appelant, donc redefini a chaque
  // rendu. En dependance de l'effet, il relancait le compte a rebours a chaque rendu de
  // l'ecran de carte : pendant la navigation, qui se re-rend chaque seconde, le message
  // ne disparaissait plus jamais. Il passe donc par une reference, et le minuteur ne
  // depend plus que du message lui-meme.
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => onHideRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  if (!message) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.box}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '45%',
    alignItems: 'center',
  },
  box: {
    maxWidth: '80%',
    backgroundColor: 'rgba(21,32,28,0.92)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
