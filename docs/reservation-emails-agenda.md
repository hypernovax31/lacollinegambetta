# Réservations — e-mails et Google Agenda

Ce document explique comment retrouver, redéployer ou recréer le script Google
qui envoie les e-mails de réservation et crée les événements dans Google Agenda.

## 1. Retrouver le script existant

Le site appelle aujourd'hui l'URL configurée dans
`assets/js/reservation-config.js`, clé `googleScriptUrl`.

Identifiant du projet Apps Script correspondant :

```text
1nmbYwo7_Re03TLxZpgYqFrAHKGB8iNbIezfHAZahteRkoPXz9NE4Vxbf
```

Lien d'édition direct (à ouvrir **connecté avec restaurant@lacollinegambetta.com**) :

```text
https://script.google.com/macros/edit?lib=1nmbYwo7_Re03TLxZpgYqFrAHKGB8iNbIezfHAZahteRkoPXz9NE4Vxbf
```

Autres chemins d'accès :

- <https://script.google.com/home/my> → liste de tous les projets Apps Script du compte ;
- <https://drive.google.com> → recherche `type:script` ;
- si le script appartient à un autre compte, c'est ce compte qu'il faut utiliser.

## 2. Redéployer en accès public

1. Dans le projet, cliquer sur **Déployer → Gérer les déploiements**.
2. Modifier le déploiement « Application Web » (icône crayon).
3. Régler :
   - **Exécuter en tant que** : `Moi (restaurant@lacollinegambetta.com)` ;
   - **Qui a accès** : `Tout le monde`.
4. **Déployer**, puis copier l'URL qui se termine par `/exec`.
5. Reporter cette URL dans `assets/js/reservation-config.js`, clé `googleScriptUrl`.

Tant que « Qui a accès » n'est pas `Tout le monde`, Google répond
« Access Denied » : aucun e-mail n'est envoyé et aucun événement d'agenda
n'est créé.

## 3. Recréer le script depuis zéro (si l'ancien est perdu)

Créer un nouveau projet sur <https://script.google.com/home/my>, coller le code
ci-dessous dans `Code.gs`, puis déployer en **Application Web** avec les
réglages du point 2.

```javascript
/* La Colline Gambetta — notifications de réservation + Google Agenda */

var RESTAURANT_EMAIL = 'restaurant@lacollinegambetta.com';
var CALENDAR_ID = 'primary';          // ou l'ID d'un agenda dédié
var DEFAULT_DURATION_MINUTES = 90;    // durée d'un couvert

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var d = payload.details || {};

    // 1. E-mail au restaurant
    MailApp.sendEmail({
      to: payload.restaurantEmail || RESTAURANT_EMAIL,
      subject: payload.restaurantSubject || 'Nouvelle réservation',
      body: payload.restaurantBody || JSON.stringify(d, null, 2),
      replyTo: d.email && d.email.indexOf('@') > -1 ? d.email : undefined
    });

    // 2. E-mail de confirmation au client
    if (payload.clientEmail && payload.clientEmail.indexOf('@') > -1) {
      MailApp.sendEmail({
        to: payload.clientEmail,
        subject: payload.clientSubject || 'Confirmation de votre réservation',
        body: payload.clientBody || ''
      });
    }

    // 3. Événement dans Google Agenda
    if (d.dateIso && d.heureIso) {
      var parts = String(d.dateIso).split('-');
      var hm = String(d.heureIso).split(':');
      var start = new Date(
        Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]),
        Number(hm[0]), Number(hm[1]), 0
      );
      var end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60000);
      var titre = (d.couvertsNb || '?') + ' couverts — ' + (d.nom || 'Réservation');
      CalendarApp.getCalendarById(CALENDAR_ID).createEvent(titre, start, end, {
        description:
          'Nom : ' + (d.nom || '') + '\n' +
          'Téléphone : ' + (d.telephone || '') + '\n' +
          'E-mail : ' + (d.email || '') + '\n' +
          'Couverts : ' + (d.couvertsNb || '') + '\n' +
          'Préférence : ' + (d.preference || '') + '\n' +
          'Message : ' + (d.message || '') + '\n' +
          'Langue : ' + (d.langue || '')
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'LCG réservations' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 4. Vérifier que tout fonctionne

Ouvrir l'URL `/exec` dans un navigateur : elle doit afficher

```json
{"ok":true,"service":"LCG réservations"}
```

Si une page de connexion Google ou « Access Denied » apparaît, le déploiement
n'est pas public : reprendre le point 2.

Ensuite, faire une réservation de test sur le site : un e-mail doit arriver au
restaurant, un e-mail de confirmation au client, et un événement doit apparaître
dans l'agenda.
