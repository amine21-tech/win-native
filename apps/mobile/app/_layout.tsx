import { Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold } from '@expo-google-fonts/cairo';
import {
  PlayfairDisplay_700Bold_Italic,
} from '@expo-google-fonts/playfair-display';
import { Sora_400Regular, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../src/i18n';
import { useSession } from '../src/store/session';
import { useAutoScheme } from '../src/utils/clock';
import { palette } from '../src/theme';

// Le splash natif (logo WIN, voir app.json) reste affiche tant qu'on ne l'a
// pas explicitement masque : depuis expo-splash-screen, il ne se cache plus
// tout seul au premier rendu, sinon on verrait un flash de police systeme
// avant la bascule sur Sora/Cairo.
void SplashScreen.preventAutoHideAsync();

/**
 * Le cache tolere le hors-ligne : en Algerie, une coupure de reseau au milieu
 * d'un trajet est ordinaire. On garde les donnees une heure et on ne vide pas
 * l'ecran pendant une reprise.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 60 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const themeOverride = useSession((s) => s.themeOverride);
  // Meme regle que l'ecran de carte : le choix de l'utilisateur (bouton lune) l'emporte, et a
  // defaut c'est l'heure qui decide — sans quoi le fond et la barre d'etat restaient sombres
  // derriere une carte devenue blanche, ou l'inverse.
  const autoScheme = useAutoScheme(themeOverride === 'auto');
  const scheme = themeOverride === 'auto' ? autoScheme : themeOverride;
  const colors = useMemo(() => palette[scheme === 'dark' ? 'dark' : 'light'], [scheme]);
  const bootstrap = useSession((s) => s.bootstrap);

  const [fontsLoaded, fontError] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
    PlayfairDisplay_700Bold_Italic,
  });

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Une police qui ne se charge pas ne doit JAMAIS bloquer l'application. Sans le second
  // terme, un echec de chargement (cache Expo abime, memoire insuffisante sur un telephone
  // d'entree de gamme) laissait `fontsLoaded` a faux pour toujours : l'ecran de demarrage
  // restait affiche et l'application paraissait plantee. On demarre alors avec la police
  // du systeme — moins joli, mais utilisable.
  const fontsReady = fontsLoaded || fontError != null;

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) {
    // Le splash Expo natif (voir plus haut) reste affiche par-dessus tant
    // que ceci est monte.
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
