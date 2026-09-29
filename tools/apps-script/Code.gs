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

var SCRIPT_VERSION = '2026-09-29-m';

/* Bloc de diagnostic en bas du mail reçu par le restaurant.
   false = mails propres, sans aucune mention technique (réglage normal).
   true  = à n'activer que le temps d'un dépannage. */
var DIAGNOSTIC = false;

/* Copie cachée du mail de confirmation client vers la boîte du restaurant.
   Sert de preuve d'envoi : si cette copie arrive, le message est bien parti
   de Google ; si elle n'arrive pas, l'envoi échoue en amont. */
var COPIE_CLIENT_AU_RESTAURANT = true;

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
    var corpsResto = payload.restaurantBody || JSON.stringify(d, null, 2);
    if (DIAGNOSTIC) {
      corpsResto += '\n\n— — —\nDiagnostic technique\n' +
        'clientEmail reçu : ' + (payload.clientEmail || '(vide)') + '\n' +
        'details.email reçu : ' + (d.email || '(vide)') + '\n' +
        'expéditeur utilisé : ' + expediteur() + '\n' +
        'quota d\'envoi restant : ' + MailApp.getRemainingDailyQuota() + '\n' +
        'version du script : ' + SCRIPT_VERSION;
    }
    var optionsRestaurant = {
      to: payload.restaurantEmail || RESTAURANT_EMAIL,
      subject: payload.restaurantSubject || 'Nouvelle réservation',
      body: corpsResto,
      name: 'La Colline Gambetta'
    };
    var replyTo = cleanEmail(d.email);
    if (replyTo) optionsRestaurant.replyTo = replyTo;
    report.modeRestaurant = envoyerMail(
      optionsRestaurant.to, optionsRestaurant.subject, optionsRestaurant.body,
      { name: optionsRestaurant.name, replyTo: optionsRestaurant.replyTo }
    );
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
      /* GmailApp plutôt que MailApp : le message est archivé dans
         « Messages envoyés » du compte, ce qui permet de vérifier
         visuellement l'envoi et de voir un éventuel retour d'erreur. */
      var optionsClient = {
        name: 'La Colline Gambetta',
        replyTo: RESTAURANT_EMAIL,
        htmlBody: corps.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
      };
      if (COPIE_CLIENT_AU_RESTAURANT) optionsClient.bcc = RESTAURANT_EMAIL;
      report.modeClient = envoyerMail(
        clientEmail,
        payload.clientSubject || 'Confirmation de votre réservation — La Colline Gambetta',
        corps,
        optionsClient
      );
      report.clientMail = true;
      report.expediteur = expediteur();
      report.quotaRestant = MailApp.getRemainingDailyQuota();
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

/* Envoi résilient.
   GmailApp permet d'expédier sous l'alias du restaurant et archive le
   message dans « Messages envoyés », mais il réclame une autorisation
   Gmail supplémentaire. Si cette autorisation n'a pas été accordée, on
   retombe automatiquement sur MailApp, qui fonctionne sans elle.
   Le mode d'envoi réellement utilisé est renvoyé pour diagnostic. */
function envoyerMail(destinataire, sujet, corps, options) {
  var opts = options || {};
  try {
    var gmailOpts = {};
    if (opts.name) gmailOpts.name = opts.name;
    if (opts.replyTo) gmailOpts.replyTo = opts.replyTo;
    if (opts.htmlBody) gmailOpts.htmlBody = opts.htmlBody;
    if (opts.bcc) gmailOpts.bcc = opts.bcc;
    var alias = aliasRestaurant();
    if (alias) gmailOpts.from = alias;
    GmailApp.sendEmail(destinataire, sujet, corps, gmailOpts);
    return 'gmail:' + (alias || expediteur());
  } catch (errGmail) {
    var mailOpts = { to: destinataire, subject: sujet, body: corps };
    if (opts.name) mailOpts.name = opts.name;
    if (opts.replyTo) mailOpts.replyTo = opts.replyTo;
    if (opts.htmlBody) mailOpts.htmlBody = opts.htmlBody;
    if (opts.bcc) mailOpts.bcc = opts.bcc;
    MailApp.sendEmail(mailOpts);
    return 'mailapp:' + expediteur();
  }
}

/* Si le compte qui exécute le script possède restaurant@lacollinegambetta.com
   comme alias « Envoyer des e-mails en tant que », on expédie sous cette
   adresse : le message est alors signé par le domaine (SPF + DKIM) et cesse
   d'être filtré par Outlook / Hotmail. Sinon Gmail utilise l'adresse du
   compte, sans erreur. */
function aliasRestaurant() {
  try {
    var aliases = GmailApp.getAliases() || [];
    for (var i = 0; i < aliases.length; i++) {
      if (String(aliases[i]).toLowerCase() === RESTAURANT_EMAIL.toLowerCase()) return RESTAURANT_EMAIL;
    }
  } catch (e) {}
  return '';
}

/* Adresse réellement utilisée par Google pour expédier les messages. */
function expediteur() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '(inconnu)';
  } catch (e) {
    return '(inconnu)';
  }
}

function cleanEmail(value) {
  var v = String(value || '').trim();
  if (!v || v.indexOf('@') < 1) return '';
  if (/non renseign/i.test(v)) return '';
  return v;
}

/* Vérification du déploiement : ouvrir l'URL /exec dans un navigateur.
   Affiche uniquement la version publiée. Aucun envoi de mail n'est
   déclenché par cette adresse. */
function doGet() {
  return json({ ok: true, service: 'LCG reservations', version: SCRIPT_VERSION });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
