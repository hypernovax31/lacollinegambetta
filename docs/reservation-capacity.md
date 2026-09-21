# Limiter les réservations à 15 demandes ou 30 couverts par heure

La page de réservation est statique et envoyait jusqu'ici chaque demande par
courriel. Un `localStorage`, un compteur JavaScript ou une limite dans le HTML
ne pourrait pas compter les autres visiteurs : ce serait contournable et deux
clients pourraient réserver la dernière place en même temps.

La solution sans serveur à maintenir est donc un **Google Sheet + Google Apps
Script**. Google héberge le petit endpoint et le tableur sert de registre. Le
script fourni dans [`tools/reservation-capacity/Code.gs`](../tools/reservation-capacity/Code.gs)
utilise `LockService` pour que le contrôle soit atomique.

## Règle appliquée

- les horaires sont regroupés en créneaux fixes d'une heure dans le fuseau
  `Europe/Paris` : 12:00–12:59, 13:00–13:59, etc. ;
- un créneau accepte au maximum **15 réservations** ;
- il accepte au maximum **30 couverts** ;
- les deux limites sont appliquées avec un OU : une demande est refusée si
  l'une des deux serait dépassée ;
- les lignes `PENDING` et `CONFIRMED` comptent ; `CANCELLED` et `REJECTED` ne
  comptent pas.

Ainsi, une demande de 4 personnes est refusée si le créneau contient déjà
27 couverts, même s'il reste moins de 15 réservations. La vérification est
refaite côté serveur au moment de l'envoi : un état d'interface périmé ne
peut donc pas créer de course critique.

## Mise en service — environ 5 minutes

1. Créer ou ouvrir un Google Sheet dédié au restaurant.
2. Dans **Extensions → Apps Script**, supprimer le code proposé et coller le
   contenu de `tools/reservation-capacity/Code.gs`.
3. Vérifier dans `CONFIG` l'adresse `RESTAURANT_EMAIL` et les valeurs
   `MAX_RESERVATIONS` / `MAX_COVERS`.
4. Enregistrer, puis exécuter une première fois la fonction `setup` depuis
   l'éditeur. Elle crée l'onglet `Reservations` et déclenche la demande
   d'autorisation d'accès au tableur. Les autorisations sont celles du compte du
   restaurant.
5. Faire **Déployer → Nouveau déploiement → Application web** :
   - exécuter en tant que **Moi** ;
   - accès : **Toute personne** ;
   - copier l'URL qui se termine par `/exec`.
6. Ouvrir `assets/js/reservation-config.js` et renseigner cette URL :

   ```js
   window.LCG_RESERVATION_ENDPOINT =
     'https://script.google.com/macros/s/IDENTIFIANT/exec';
   ```

7. Republier le site. À partir de là, la page n'envoie plus directement par
   FormSubmit : la demande est d'abord acceptée et inscrite dans le Sheet,
   puis le restaurant reçoit le mail. La page utilise un formulaire dans une
   iframe cachée, ce qui évite de dépendre d'un réglage CORS de Google. En cas
   de créneau complet, aucun mail de réservation n'est envoyé et le client est
   invité à choisir une autre heure ou à téléphoner.

## Gestion quotidienne

- changer `PENDING` en `CONFIRMED` après confirmation téléphonique ;
- passer une demande annulée à `CANCELLED` pour libérer immédiatement ses
  couverts ;
- ne pas supprimer les lignes : le registre permet de retrouver l'historique ;
- ne pas modifier les colonnes A à F ; ajouter des notes dans une colonne à
  droite si nécessaire.

Le script ne crée pas de logiciel d'administration supplémentaire. Le Sheet
est l'écran de gestion. Le quota quotidien d'envoi de mails de Google s'applique
néanmoins ; si un jour il est dépassé, la réservation reste enregistrée dans
le Sheet et pourra être traitée depuis celui-ci.

## Important

Le déploiement Apps Script est nécessaire pour rendre la limite réelle entre
plusieurs visiteurs. Tant que `LCG_RESERVATION_ENDPOINT` reste vide, la page
conserve l'ancien mode courriel et **ne peut pas garantir** la capacité. Ne
remplacez pas l'URL par une URL de test `/dev` : elle est réservée à l'éditeur
Apps Script et demande une connexion.

Le regroupement actuel est celui d'un créneau fixe par heure. Si « 1 heure »
doit signifier une fenêtre glissante (par exemple 12:45–13:45), il faut adapter
`slotKey_` et le calcul des chevauchements avant la mise en production.
