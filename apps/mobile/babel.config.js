module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 delegue ses transformations a react-native-worklets ;
    // ce greffon doit rester le dernier de la liste.
    plugins: ['react-native-worklets/plugin'],
  };
};
