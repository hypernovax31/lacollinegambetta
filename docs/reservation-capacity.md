# Réservations autonomes et fenêtre glissante

La réservation fonctionne maintenant avec une petite API Node intégrée au
projet et une base SQLite locale. Il n'y a pas de Google Sheet, pas de créneaux
à remplir à la main et pas de service de réservation externe à administrer.

Le serveur crée sa base et ses créneaux au démarrage. Il suffit de lancer :

```bash
npm start
```

La page est alors disponible sur `http://localhost:4173`.

## Règle de capacité

Chaque réservation occupe une durée de **60 minutes** à partir de l'heure
choisie. La limite est calculée sur les réservations qui se chevauchent, quelle
que soit leur heure de début :

- maximum **15 réservations simultanées** dans une fenêtre glissante de 60 min ;
- maximum **30 couverts simultanés** dans cette même fenêtre ;
- une nouvelle demande est refusée si l'une des deux limites est dépassée ;
- les heures proposées sont générées automatiquement de 15 en 15 minutes,
  de 12h00 à 22h45, tous les jours comme dans le formulaire actuel.

Exemple : une réservation à 12h45 chevauche celle de 12h00 jusqu'à 13h00.
Une réservation à 13h00 ne chevauche plus celle de 12h00, mais chevauche une
réservation commencée à 12h15. Il n'existe aucune séparation artificielle entre
12h59 et 13h00.

Le contrôle se fait dans une transaction SQLite (`BEGIN IMMEDIATE`) : deux
clients qui envoient leur demande au même instant ne peuvent pas prendre la
dernière place simultanément.

## Ce qui est géré automatiquement

- création de la base `data/reservations.sqlite` ;
- création des créneaux disponibles à partir de la politique du serveur ;
- validation du fuseau `Europe/Paris` ;
- refus des heures passées ;
- refus atomique lorsque les 15 réservations ou les 30 couverts sont atteints ;
- conservation des demandes dans la base ;
- notification du restaurant par le relais e-mail déjà utilisé par le site,
  uniquement **après** l'acceptation par l'API.

La base SQLite est ignorée par Git : les données de clients ne sont jamais
commitées dans le dépôt.

## Paramètres

Ils se trouvent dans `server/reservation-policy.mjs` :

```js
maxReservations: 15,
maxCovers: 30,
durationMinutes: 60,
firstSlotMinutes: 12 * 60,
lastSlotMinutes: 22 * 60 + 45,
slotStepMinutes: 15
```

Il n'est pas nécessaire de créer chaque créneau : le serveur les déduit de ces
valeurs à chaque demande.

## Mise en ligne

Le dépôt était jusqu'ici un site purement statique. Pour que la limite soit
réelle entre plusieurs visiteurs, le site doit désormais être servi par un
hébergement capable d'exécuter Node 22 ou supérieur et de conserver le fichier
SQLite, par exemple un serveur Node avec disque persistant.

Commande de production minimale :

```bash
npm ci
npm start
```

Le serveur écoute sur `0.0.0.0` et respecte la variable `PORT` fournie par la
plupart des hébergeurs. Pour déplacer la base sans modifier le code :

```bash
RESERVATION_DB=/chemin/persistant/reservations.sqlite npm start
```

Un hébergement statique de type GitHub Pages ne peut pas appliquer cette limite
à lui seul : il ne peut ni exécuter `server.mjs`, ni conserver les réservations.
Il faudrait alors un hébergement Node ou une API hébergée séparément. Je n'ai
pas changé automatiquement le dépôt en un hébergement externe, car cela
nécessiterait l'accès au compte et au domaine de publication.
