/* La Colline Gambetta — notifications de réservation + Google Agenda
 *
 * À coller dans le projet Apps Script du restaurant, puis à redéployer :
 *   Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer
 *   (Exécuter en tant que : Moi — Qui a accès : Tout le monde)
 *
 * L'URL obtenue (terminée par /exec) doit figurer dans
 * assets/js/reservation-config.js, clé googleScriptUrl.
 *
 * Cette version renvoie un compte rendu détaillé : le site journalise la
 * réponse dans la console du navigateur, ce qui permet de voir immédiatement
 * si le mail client est parti, et sinon pourquoi.
 */

var SCRIPT_VERSION = '2026-09-29-c';
var RESTAURANT_EMAIL = 'restaurant@lacollinegambetta.com';
var CALENDAR_ID = 'primary';          // ou l'ID d'un agenda dédié aux réservations
var DEFAULT_DURATION_MINUTES = 90;    // durée réservée pour une table

function doPost(e) {
  var report = {
    ok: true,
    restaurantMail: false,
    clientMail: false,
    calendar: false,
    clientEmailUsed: '',
    errors: []
  };

  var payload = {};
  var d = {};
  try {
    payload = JSON.parse(e.postData.contents);
    d = payload.details || {};
  } catch (errParse) {
    report.ok = false;
    report.errors.push('payload illisible : ' + errParse);
    return json(report);
  }

  /* 1. E-mail au restaurant */
  try {
    var optionsRestaurant = {
      to: payload.restaurantEmail || RESTAURANT_EMAIL,
      subject: payload.restaurantSubject || 'Nouvelle réservation',
      body: payload.restaurantBody || JSON.stringify(d, null, 2),
      name: 'La Colline Gambetta'
    };
    var replyTo = cleanEmail(d.email);
    if (replyTo) optionsRestaurant.replyTo = replyTo;
    MailApp.sendEmail(optionsRestaurant);
    report.restaurantMail = true;
  } catch (errResto) {
    report.ok = false;
    report.errors.push('mail restaurant : ' + errResto);
  }

  /* 2. E-mail de confirmation au client
     L'adresse est cherchée à deux endroits : clientEmail, puis details.email,
     afin qu'une seule des deux suffise. */
  try {
    var clientEmail = cleanEmail(payload.clientEmail) || cleanEmail(d.email);
    report.clientEmailUsed = clientEmail || '(aucune adresse client)';
    if (clientEmail) {
      var corps = payload.clientBody && String(payload.clientBody).trim().length
        ? payload.clientBody
        : corpsClientParDefaut(d);
      MailApp.sendEmail({
        to: clientEmail,
        subject: payload.clientSubject || 'Confirmation de votre réservation — La Colline Gambetta',
        body: corps,
        name: 'La Colline Gambetta',
        replyTo: RESTAURANT_EMAIL
      });
      report.clientMail = true;
    }
  } catch (errClient) {
    report.ok = false;
    report.errors.push('mail client : ' + errClient);
  }

  /* 3. Événement dans Google Agenda */
  try {
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
      report.calendar = true;
    } else {
      report.errors.push('agenda : date ou heure absente du formulaire');
    }
  } catch (errCal) {
    report.ok = false;
    report.errors.push('agenda : ' + errCal);
  }

  console.log(JSON.stringify(report));
  return json(report);
}

/* Filet de sécurité : si le site n'a pas transmis de texte de confirmation. */
function corpsClientParDefaut(d) {
  return [
    'Merci infiniment ' + (d.nom || '') + '.',
    '',
    'Votre demande de table vient de nous parvenir.',
    '',
    'Nous vous attendons le ' + (d.date || d.dateIso || '') + ' à ' + (d.heure || d.heureIso || ''),
    'pour ' + (d.couverts || d.couvertsNb || '') + '.',
    '',
    'Au plaisir de vous recevoir très prochainement,',
    '',
    'L’équipe de La Colline Gambetta',
    '01 43 49 05 93 · ' + RESTAURANT_EMAIL
  ].join('\n');
}

function cleanEmail(value) {
  var v = String(value || '').trim();
  if (!v || v.indexOf('@') < 1) return '';
  if (/non renseign/i.test(v)) return '';
  return v;
}

/* Vérification du déploiement : ouvrir l'URL /exec dans un navigateur.
 *
 * Deux diagnostics disponibles sans rien installer :
 *   /exec                         → version du script actuellement déployée
 *   /exec?selftest=mon@mail.com   → envoie un vrai mail de test à cette adresse
 *                                   et renvoie le résultat de l'envoi
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var cible = cleanEmail(params.selftest);

  if (!cible) {
    return json({ ok: true, service: 'LCG reservations', version: SCRIPT_VERSION });
  }

  var res = { ok: true, service: 'LCG reservations', version: SCRIPT_VERSION, selftest: cible, sent: false, error: '' };
  try {
    MailApp.sendEmail({
      to: cible,
      subject: 'Test envoi client — La Colline Gambetta',
      body: 'Ceci est un test technique du script de réservation.\n\nSi vous recevez ce message, l\u2019envoi des mails clients fonctionne.',
      name: 'La Colline Gambetta',
      replyTo: RESTAURANT_EMAIL
    });
    res.sent = true;
    res.quotaRestant = MailApp.getRemainingDailyQuota();
  } catch (err) {
    res.ok = false;
    res.error = String(err);
  }
  return json(res);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Test manuel depuis l'éditeur : remplacer l'adresse ci-dessous par une
   adresse à vous, exécuter, puis vérifier la boîte de réception. */
function testReservation() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        restaurantEmail: RESTAURANT_EMAIL,
        restaurantSubject: 'TEST — Nouvelle réservation',
        restaurantBody: 'Ceci est un test de configuration.',
        clientEmail: 'adresse-de-test@exemple.com',
        clientSubject: 'TEST — Confirmation de votre réservation',
        clientBody: '',
        details: {
          nom: 'Test Colline',
          telephone: '0000000000',
          email: 'adresse-de-test@exemple.com',
          date: 'aujourd’hui',
          dateIso: Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'),
          heure: '20:00',
          heureIso: '20:00',
          couverts: '2 personnes',
          couvertsNb: 2,
          preference: 'Salle',
          message: 'Test automatique',
          langue: 'fr'
        }
      })
    }
  });
  Logger.log(res.getContent());
}
