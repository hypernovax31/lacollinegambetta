# Consignes de maintenance du site

## Traductions obligatoires à chaque modification

À la demande du propriétaire, chaque ajout ou modification de texte du site doit inclure, dans la même livraison, ses traductions dans les 14 langues proposées : en, es, de, it, pt, nl, ar, zh, uk, ja, ko, pl, tr, hi. Le français reste la langue source.

- Mettre à jour `assets/js/i18n.js` et les dictionnaires spécifiques concernés (widgets, horaires, etc.).
- Vérifier les clés correspondant aux nœuds texte réels : modifier le balisage peut scinder une phrase et invalider une traduction existante.
- Couvrir les titres, boutons, descriptions, messages, infobulles et libellés d'accessibilité lorsque le moteur les prend en charge ; compléter sa prise en charge si nécessaire.
- Vérifier la présence des traductions pour les textes touchés dans les 14 langues, ainsi que le retour au français.
- Actualiser la version du fichier de traductions dans le HTML lorsqu'il change pour éviter les anciennes traductions en cache.
- Les noms propres, marques, adresses et valeurs numériques ne nécessitent pas de traduction artificielle.
- Ne pas modifier ni régénérer le PDF téléchargeable sans demande explicite.

Cette consigne concerne les interventions sur le dépôt : elle ne constitue pas un service de traduction automatique des changements faits hors de ces interventions.
