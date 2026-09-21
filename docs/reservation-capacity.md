# Réservations autonomes avec Firebase gratuit

La réservation utilise directement **Cloud Firestore** du projet Firebase déjà
utilisé par `mission-nautilus`. Il n'y a pas de Google Sheet, pas de Cloud
Function payante et pas de créneaux à remplir à la main.

Le navigateur s'authentifie anonymement puis réalise une transaction Firestore
atomique. Le projet reste compatible avec l'offre gratuite Firebase utilisée
par Nautilus.

## Règle de capacité

Chaque réservation occupe une durée de **60 minutes** à partir de l'heure
choisie. La limite est calculée sur les réservations qui se chevauchent :

- maximum **15 réservations simultanées** dans une fenêtre glissante de 60 min ;
- maximum **30 couverts simultanés** dans cette même fenêtre ;
- une nouvelle demande est refusée si l'une des deux limites est dépassée ;
- les heures sont générées automatiquement de 15 en 15 minutes, de 12h00 à
  22h45.

Exemple : une réservation à 12h45 chevauche celle de 12h00 jusqu'à 13h00.
Une réservation à 13h00 ne chevauche plus celle de 12h00, mais chevauche une
réservation commencée à 12h15.

Les écritures sont réparties dans deux endroits :

```text
reservationCapacity/{YYYY-MM-DD}
reservations/{id}
```

Le document par date contient le registre utilisé par la transaction de
capacité ; la collection `reservations` conserve les détails de chaque demande.

## Pourquoi cela reste gratuit

Il n'y a pas de Cloud Function : la page utilise le SDK Firebase Web et la
transaction Firestore directement. L'authentification anonyme permet de
refuser les écritures totalement anonymes. La configuration Firebase visible
dans le navigateur n'est pas un secret ; la protection repose sur les règles
Firestore.

La limite est fiable pour les utilisateurs normaux et les envois simultanés,
car Firestore sérialise les transactions qui modifient le même document de
capacité. Comme toute solution purement client gratuite, un développeur qui
voudrait contourner volontairement la page pourrait appeler Firebase avec une
session anonyme et tenter une écriture autorisée. Une protection absolue
contre ce scénario nécessiterait une fonction serveur et donc l'offre Blaze.

## Projet utilisé

La configuration reprend le projet déjà présent dans le dépôt GitHub
`hypernovax31/mission-nautilus` :

```text
projectId: mission-nautilus
authDomain: mission-nautilus.firebaseapp.com
```

L'authentification anonyme doit rester activée dans Firebase Authentication,
comme elle l'est déjà pour Nautilus.

## Déployer les règles depuis GitHub

Les règles Nautilus sont conservées dans `firestore.rules` et les chemins de
réservation ont été ajoutés sans supprimer les collections existantes du jeu.
Le dépôt ne déploie que les règles Firestore : il ne remplace pas le Hosting de
Nautilus.

Pour un déploiement manuel :

```bash
npm install -g firebase-tools
firebase login
firebase deploy --project mission-nautilus --only firestore
```

Pour le déploiement automatique, ajouter dans les secrets GitHub Actions :

```text
FIREBASE_PROJECT_ID=mission-nautilus
FIREBASE_TOKEN=votre_token_firebase
```

Le workflow `.github/workflows/firebase-deploy.yml` se déclenche sur `main` et
met à jour uniquement les règles Firestore. Aucun token ne doit être ajouté au
dépôt ou partagé dans le chat.

## Activation à vérifier dans Firebase

Dans la console du projet `mission-nautilus` :

1. ouvrir **Authentication → Sign-in method** ;
2. vérifier que **Anonymous** est activé ;
3. dans **Authentication → Settings → Authorized domains**, ajouter le domaine
   qui sert la page de réservation (par exemple le domaine GitHub Pages ou le
   domaine personnalisé) ;
4. vérifier que **Firestore Database** est bien la base utilisée par Nautilus ;
5. déployer les règles du dépôt.

La page de réservation utilisera alors directement Firestore. Il n'y a pas de
URL d'API supplémentaire à renseigner : `assets/js/reservation-config.js`
contient simplement le marqueur `firebase`.
