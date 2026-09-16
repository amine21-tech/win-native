// Configuration Metro par defaut.
//
// Aucun watchFolder vers l'exterieur : EAS Build n'envoie que ce dossier, et
// un chemin qui sort de l'archive fait echouer le bundler avec
// « ENOENT ... packages/shared ». Le code partage est recopie dans
// src/shared/ par build-apk.ps1.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
