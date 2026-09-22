# Réservations autonomes et limitation avec Firebase

La réservation utilise directement **Cloud Firestore** du projet Firebase dédié
`la-colline-gambetta`. Il n'y a pas de Google Sheet, pas de Cloud Function
payante et pas de créneaux à remplir manuellement.

Le navigateur s'authentifie anonymement puis réalise une transaction Firestore
atomique. Le projet reste 100 % compatible avec l'offre gratuite Firebase Spark.

---

## 1. Règles de capacité et limitation

Chaque réservation occupe une durée de **60 minutes** à partir de l'heure
choisie. La limite est calculée sur les réservations qui se chevauchent :

- **15 tables simultanées** maximum dans une fenêtre glissante de 60 min (par défaut) ;
- **30 personnes/couverts simultanés** maximum dans cette même fenêtre (par défaut) ;
- **Règle d'attribution des tables** : 1 à 2 personnes = 1 table, 3 à 4 personnes = 2 tables, 5 à 6 personnes = 3 tables, etc. ;
- Les créneaux sont générés de 15 en 15 minutes, de 12h00 à 22h45 ;
- Tout créneau complet est immédiatement grisé et annoté `(Complet)`.

---

## 2. Personnalisation des limites via la console Firebase

Vous pouvez modifier les règles de limitation en direct sans toucher au code,
en créant ou modifiant le document suivant dans **Cloud Firestore** :

* **Collection** : `reservationSettings`
* **Document** : `config`

### Champs disponibles :

| Champ | Type | Description | Valeur par défaut |
|---|---|---|---|
| `maxTables` | `number` | Nombre maximum de tables simultanées | `15` |
| `maxCovers` | `number` | Nombre maximum de couverts simultanés | `30` |
| `durationMinutes` | `number` | Durée moyenne d'occupation d'une table (min) | `60` |
| `minNoticeMinutes` | `number` | Délai minimum avant le créneau pour le jour même | `15` |
| `maxDaysInAdvance` | `number` | Nombre maximum de jours ouvrables à l'avance | `90` |
| `maxGuestsPerBooking` | `number` | Nombre max de personnes par réservation en ligne | `10` |
| `onlineBookingEnabled` | `boolean` | Activer ou suspendre les réservations en ligne | `true` |
| `closedDates` | `array` | Dates d'indisponibilité (ex: `["2026-12-25"]`) | `[]` |
| `closedSlots` | `map` | Créneaux fermés par date (ex: `{"2026-10-15": ["12:00"]}`) | `{}` |

---

## 3. Structure des données Firestore

```text
reservationSettings/config         --> Paramètres globaux de limitation
reservationCapacity/{YYYY-MM-DD}   --> Registre journalier des réservations
reservations/{id}                  --> Fiche détaillée de la réservation
```

---

## 4. Déploiement des règles Firestore

Le fichier `firestore.rules` protège la base :
- Les paramètres (`reservationSettings`) sont en lecture seule pour les clients.
- Les capacités (`reservationCapacity`) sont modifiées uniquement par transaction atomique.
- Les réservations (`reservations`) sont créées après validation stricte des champs.

Pour déployer manuellement les règles :

```bash
npm install -g firebase-tools
firebase login
firebase deploy --project la-colline-gambetta --only firestore
```
