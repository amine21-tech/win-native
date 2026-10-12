# WIN v46 — note de version pour Google Play

Champ « Notes de version » de la Play Console, en francais. Play limite ce champ a
500 caracteres par langue ; ce texte en fait moins de 450, accents compris.

Il est ecrit pour un UTILISATEUR, pas pour un developpeur : on dit ce qui change a l'ecran,
jamais le nom d'un fichier ni celui d'un moteur.

---

```
• Trace de navigation plus epais et borde : les panneaux et numeros de route restent lisibles par-dessus.
• Nouvelle fleche de position, avec halo.
• Voies a prendre affichees a l'approche des bifurcations.
• Recalcul plus rapide : seuil adapte a la vitesse, demi-tour detecte, routes signalees coupees contournees.
• Relief des montagnes et pictogrammes des lieux (mosquees, pharmacies, stations, ecoles) des le zoom 13, de jour comme de nuit.
• Enregistrement de lieux reserve aux contributeurs.
```

---

## Ce qui n'est PAS annonce, et pourquoi

**Le guidage de voies n'apparait que la ou OpenStreetMap connait les marquages au sol**, et
seulement une fois le moteur d'itineraire passe en 3.6 (voir deploy/valhalla-mise-a-niveau.sh).
La formulation retenue — « affichees a l'approche des bifurcations » — ne promet donc pas
qu'elles apparaissent partout. Annoncer une fonction que l'utilisateur ne voit pas sur SA route
se paie en avis a une etoile.

**Le relief 3D en vue inclinee** n'est pas fait : la bibliotheque de carte de l'application ne
l'expose pas. Seul l'ombrage des collines est en place, d'ou « relief des montagnes » et non
« carte en 3D ».
