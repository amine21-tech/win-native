# WIN v47 — note de version pour Google Play

Champ « Notes de version » de la Play Console, en francais. Play limite ce champ a
500 caracteres par langue ; ce texte en fait 439, accents compris. Les balises <fr-FR> sont celles que la Play Console attend.

Il est ecrit pour un UTILISATEUR, pas pour un developpeur : on dit ce qui change a l'ecran,
jamais le nom d'un fichier ni celui d'un moteur.

---

```
<fr-FR>
• Tracé plus épais et bordé : les panneaux de route restent lisibles par-dessus.
• Nouvelle flèche de position, avec halo.
• Voies à prendre affichées avant les bifurcations.
• Recalcul plus rapide : seuil adapté à la vitesse, demi-tour détecté, routes coupées contournées.
• Relief des montagnes et pictogrammes des lieux (mosquées, pharmacies, stations) dès le zoom 13, jour et nuit.
• Enregistrement de lieux réservé aux contributeurs.
</fr-FR>
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
