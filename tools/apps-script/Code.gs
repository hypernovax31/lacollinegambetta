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

var SCRIPT_VERSION = '2026-09-29-j';

/* Bloc de diagnostic en bas du mail reçu par le restaurant.
   false = mails propres, sans aucune mention technique (réglage normal).
   true  = à n'activer que le temps d'un dépannage. */
var DIAGNOSTIC = false;

/* ⬇️ REMPLACEZ CETTE ADRESSE PAR UNE VRAIE ADRESSE À VOUS ⬇️
   C'est elle qui sera utilisée par la fonction de test testReservation.
   Tant qu'elle vaut exemple.com, aucun message ne peut arriver : ce
   domaine n'existe pas. */
var TEST_EMAIL = 'adresse-de-test@exemple.com';
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
      /* GmailApp plutôt que MailApp : le message est archivé dans
         « Messages envoyés » du compte, ce qui permet de vérifier
         visuellement l'envoi et de voir un éventuel retour d'erreur. */
      var optionsClient = {
        name: 'La Colline Gambetta',
        replyTo: RESTAURANT_EMAIL,
        htmlBody: corps.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
      };
      var alias = aliasRestaurant();
      if (alias) optionsClient.from = alias;
      report.envoyeDepuis = alias || expediteur();
      GmailApp.sendEmail(
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

  /* style=plain    : message nu, strictement identique à un mail écrit à la main
     style=branded  : nom affiché + Reply-To + HTML (comportement normal)
     Permet de savoir lequel de ces éléments déclenche le filtrage. */
  var style = String(params.style || 'branded').toLowerCase();
  var res = {
    ok: true, service: 'LCG reservations', version: SCRIPT_VERSION,
    selftest: cible, style: style, sent: false, error: ''
  };
  try {
    var corps = 'Ceci est un test technique du script de réservation (' + style + ').\n\n' +
      'Si vous recevez ce message, l\u2019envoi automatique fonctionne.';
    var sujet = 'Test envoi client — La Colline Gambetta';

    if (style === 'plain') {
      GmailApp.sendEmail(cible, sujet, corps);
      res.envoyeDepuis = expediteur();
    } else {
      var opts = { name: 'La Colline Gambetta', replyTo: RESTAURANT_EMAIL };
      var alias = aliasRestaurant();
      if (alias) opts.from = alias;
      GmailApp.sendEmail(cible, sujet, corps, opts);
      res.envoyeDepuis = alias || expediteur();
      res.aliasDisponible = alias ? true : false;
    }
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

/* Test manuel depuis l'éditeur.
   ATTENTION : ce test ne teste QUE le script, jamais le site web.
   1. renseignez TEST_EMAIL en haut du fichier avec une vraie adresse ;
   2. exécutez testReservation ;
   3. vérifiez la boîte de réception de cette adresse.
   Si clientEmailUsed contient encore exemple.com, c'est que TEST_EMAIL
   n'a pas été modifié. */
function testReservation() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        restaurantEmail: RESTAURANT_EMAIL,
        restaurantSubject: 'TEST — Nouvelle réservation',
        restaurantBody: 'Ceci est un test de configuration.',
        clientEmail: TEST_EMAIL,
        clientSubject: 'TEST — Confirmation de votre réservation',
        clientBody: '',
        details: {
          nom: 'Test Colline',
          telephone: '0000000000',
          email: TEST_EMAIL,
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
