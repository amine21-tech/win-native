/**
 * Installe la cle de signature dans le projet Android genere par `expo prebuild`.
 *
 * Pourquoi c'est necessaire : le gabarit d'Expo signe la version de production avec la cle de
 * DEVELOPPEMENT d'Android. Un APK ainsi signe s'installe et fonctionne, mais Android refuse de
 * l'installer par-dessus une application signee avec une autre cle — il faudrait desinstaller
 * WIN, et l'utilisateur perdrait ses favoris et son historique. En reutilisant la cle d'origine
 * (celle d'Expo), la mise a jour se fait normalement.
 *
 * Sans les secrets, ce script ne fait rien et la compilation continue avec la cle de
 * developpement : c'est voulu, pour qu'un essai reste possible sans configurer quoi que ce soit.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE64 = process.env.WIN_KEYSTORE_BASE64;
if (!BASE64) {
  console.log('Pas de secret WIN_KEYSTORE_BASE64 : signature avec la cle de developpement.');
  console.log("L'APK produit ne pourra pas s'installer par-dessus la version actuelle.");
  process.exit(0);
}

const storePassword = process.env.WIN_KEYSTORE_PASSWORD ?? '';
const keyAlias = process.env.WIN_KEY_ALIAS ?? '';
const keyPassword = process.env.WIN_KEY_PASSWORD ?? '';
if (!storePassword || !keyAlias || !keyPassword) {
  console.error('Secrets incomplets : WIN_KEYSTORE_PASSWORD, WIN_KEY_ALIAS et WIN_KEY_PASSWORD');
  console.error('sont obligatoires des lors que WIN_KEYSTORE_BASE64 est fourni.');
  process.exit(1);
}

const gradlePath = resolve('android/app/build.gradle');
if (!existsSync(gradlePath)) {
  console.error('android/app/build.gradle introuvable : `expo prebuild` a-t-il ete lance ?');
  process.exit(1);
}

writeFileSync(resolve('android/app/win-release.jks'), Buffer.from(BASE64, 'base64'));

let gradle = readFileSync(gradlePath, 'utf8');

// 1) Ajouter une configuration de signature « release » a cote de celle de developpement.
const marker = 'signingConfigs {';
if (!gradle.includes(marker)) {
  console.error("Bloc `signingConfigs` introuvable : le gabarit d'Expo a change.");
  process.exit(1);
}
// Les mots de passe transitent par des variables d'environnement, jamais ecrits dans le
// fichier : le journal de compilation de GitHub affiche les fichiers modifies en cas d'erreur.
const releaseConfig = `signingConfigs {
        release {
            storeFile file('win-release.jks')
            storePassword System.getenv("WIN_KEYSTORE_PASSWORD")
            keyAlias System.getenv("WIN_KEY_ALIAS")
            keyPassword System.getenv("WIN_KEY_PASSWORD")
        }`;
gradle = gradle.replace(marker, releaseConfig);

// 2) Faire pointer la version de production sur cette configuration.
const buildTypesAt = gradle.indexOf('buildTypes {');
if (buildTypesAt < 0) {
  console.error('Bloc `buildTypes` introuvable.');
  process.exit(1);
}
const before = gradle.slice(0, buildTypesAt);
const after = gradle.slice(buildTypesAt).replaceAll('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
gradle = before + after;

writeFileSync(gradlePath, gradle);
console.log('Cle de signature installee : la mise a jour par-dessus la version actuelle fonctionnera.');
