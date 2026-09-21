# Réservations autonomes avec Firebase

La réservation est conservée dans **Cloud Firestore** et contrôlée par une
**Cloud Function Firebase**. Il n'y a pas de Google Sheet, pas de créneaux à
remplir à la main et pas de base SQLite locale en production.

Le dépôt contient déjà :

- `functions/index.js` : API sécurisée et transactionnelle ;
- `functions/reservation-policy.mjs` : politique de fenêtre glissante ;
- `firebase.json` : hébergement du site et réécriture de `/api/reservations` ;
- `firestore.rules` : accès direct au Firestore bloqué ;
- `assets/js/reservation-config.js` : endpoint relatif au même domaine.

## Règle de capacité

Chaque réservation occupe une durée de **60 minutes** à partir de l'heure
choisie. La limite est calculée sur les réservations qui se chevauchent :

- maximum **15 réservations simultanées** dans une fenêtre glissante de 60 min ;
- maximum **30 couverts simultanés** dans cette même fenêtre ;
- une nouvelle demande est refusée si l'une des deux limites est dépassée ;
- les heures sont générées automatiquement de 15 en 15 minutes, de 12h00 à
  22h45, tous les jours comme dans le formulaire actuel.

Exemple : une réservation à 12h45 chevauche celle de 12h00 jusqu'à 13h00.
Une réservation à 13h00 ne chevauche plus celle de 12h00, mais chevauche une
réservation commencée à 12h15. Il n'existe aucune séparation artificielle entre
12h59 et 13h00.

La capacité est vérifiée dans une transaction Firestore sur un document de
registre par date. Deux demandes simultanées ne peuvent donc pas prendre la
dernière place en même temps. Chaque réservation est également conservée dans
la collection `reservations` pour pouvoir être consultée et administrée plus
tard.

## Connexion du dépôt GitHub à Firebase

Une seule configuration initiale est nécessaire : créer ou utiliser un projet
Firebase, puis le relier au dépôt. Aucun fichier de secret Firebase ne doit
être commité.

1. Installer la CLI Firebase :

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. Créer un projet Firebase dans la console Firebase et activer :
   - **Firestore Database** ;
   - **Firebase Hosting** ;
   - **Cloud Functions**.

3. Dans le dépôt, associer le projet local à l'identifiant Firebase :

   ```bash
   firebase use --add
   ```

   Choisir le projet, puis conserver le fichier `.firebaserc` créé localement.
   Ce fichier contient uniquement l'identifiant public du projet ; il n'est pas
   nécessaire d'y mettre un mot de passe ou une clé privée.

4. Déployer depuis la racine du dépôt :

   ```bash
   npm ci
   npm run firebase:deploy
   ```

Firebase déploie alors le site et la fonction `reservationApi`. La réécriture
présente dans `firebase.json` fait correspondre :

```text
https://VOTRE_PROJET.web.app/api/reservations
```

à la Cloud Function qui écrit dans Firestore.

## Déploiement automatique depuis GitHub

Dans Firebase App Hosting ou dans une GitHub Action, utiliser la commande :

```bash
npx firebase-tools deploy --token "$FIREBASE_TOKEN" \
  --only hosting,functions,firestore
```

Le projet doit être indiqué par le secret ou la variable GitHub
`FIREBASE_PROJECT_ID`, et le token doit être conservé uniquement comme secret
GitHub Actions nommé `FIREBASE_TOKEN`, jamais dans le dépôt. Une alternative
sans token permanent est de lancer le déploiement depuis une machine déjà
connectée avec `firebase login`.

Pour une action GitHub, le principe est :

```yaml
name: Deploy Firebase
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx firebase-tools deploy --project "${{ secrets.FIREBASE_PROJECT_ID }}" --only hosting,functions,firestore --token "${{ secrets.FIREBASE_TOKEN }}"
```

La gestion courante ne demande pas de créer des créneaux : la fonction les
déduit de la politique. Les valeurs sont dans
`functions/reservation-policy.mjs` :

```js
maxReservations: 15,
maxCovers: 30,
durationMinutes: 60,
firstSlotMinutes: 12 * 60,
lastSlotMinutes: 22 * 60 + 45,
slotStepMinutes: 15
```

## Important

Le code est prêt côté dépôt, mais je ne peux pas créer le projet Firebase ni
l'associer à un compte GitHub sans accès à ce compte. Cette étape est
inévitable : Firebase doit posséder le projet Firestore et les quotas de
Cloud Functions. Aucun mot de passe ou token ne doit être partagé dans le
chat ; il suffit de connecter Firebase CLI ou GitHub Actions de votre côté.
