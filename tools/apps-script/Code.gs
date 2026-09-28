/* La Colline Gambetta — notifications de réservation + Google Agenda
 *
 * À coller dans un nouveau projet Apps Script (https://script.google.com/home/my),
 * puis à déployer en « Application Web » avec :
 *   - Exécuter en tant que : Moi
 *   - Qui a accès         : Tout le monde
 *
 * L'URL obtenue (terminée par /exec) doit être recopiée dans
 * assets/js/reservation-config.js, clé googleScriptUrl.
 */

var RESTAURANT_EMAIL = 'restaurant@lacollinegambetta.com';
var CALENDAR_ID = 'primary';          // ou l'ID d'un agenda dédié aux réservations
var DEFAULT_DURATION_MINUTES = 90;    // durée réservée pour une table

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var d = payload.details || {};

    /* 1. E-mail au restaurant */
    var toRestaurant = payload.restaurantEmail || RESTAURANT_EMAIL;
    var optionsRestaurant = {
      to: toRestaurant,
      subject: payload.restaurantSubject || 'Nouvelle réservation',
      body: payload.restaurantBody || JSON.stringify(d, null, 2),
      name: 'La Colline Gambetta'
    };
    if (d.email && String(d.email).indexOf('@') > -1) {
      optionsRestaurant.replyTo = d.email;
    }
    MailApp.sendEmail(optionsRestaurant);

    /* 2. E-mail de confirmation au client */
    if (payload.clientEmail && String(payload.clientEmail).indexOf('@') > -1) {
      MailApp.sendEmail({
        to: payload.clientEmail,
        subject: payload.clientSubject || 'Confirmation de votre réservation',
        body: payload.clientBody || '',
        name: 'La Colline Gambetta'
      });
    }

    /* 3. Événement dans Google Agenda */
    if (d.dateIso && d.heureIso) {
      var p = String(d.dateIso).split('-');
      var hm = String(d.heureIso).split(':');
      var start = new Date(
        Number(p[0]), Number(p[1]) - 1, Number(p[2]),
        Number(hm[0]), Number(hm[1]), 0
      );
      var end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60000);
      var titre = (d.couvertsNb || '?') + ' couverts — ' + (d.nom || 'Réservation');
      var agenda = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
      agenda.createEvent(titre, start, end, {
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

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* Permet de vérifier le déploiement en ouvrant simplement l'URL /exec
   dans un navigateur : doit afficher {"ok":true,...}. */
function doGet() {
  return json({ ok: true, service: 'LCG reservations' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Test manuel depuis l'éditeur : exécuter cette fonction une fois pour
   accorder les autorisations Gmail + Agenda, puis vérifier l'agenda. */
function testReservation() {
  doPost({
    postData: {
      contents: JSON.stringify({
        restaurantEmail: RESTAURANT_EMAIL,
        restaurantSubject: 'TEST — Nouvelle réservation',
        restaurantBody: 'Ceci est un test de configuration.',
        clientEmail: '',
        clientSubject: '',
        clientBody: '',
        details: {
          nom: 'Test Colline',
          telephone: '0000000000',
          email: 'Non renseigné',
          dateIso: Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'),
          heureIso: '20:00',
          couvertsNb: 2,
          preference: 'Salle',
          message: 'Test automatique',
          langue: 'fr'
        }
      })
    }
  });
}
