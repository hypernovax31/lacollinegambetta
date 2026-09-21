/**
 * La Colline Gambetta — capacité des réservations
 *
 * À utiliser dans un projet Apps Script lié à un Google Sheet.
 * Le tableur devient le registre des demandes et LockService rend le
 * contrôle atomique : deux clients qui envoient au même moment ne peuvent
 * pas dépasser les 15 réservations ou 30 couverts du même créneau.
 *
 * Créneau : heure civile fixe dans Europe/Paris (12:00–12:59, 13:00–13:59,
 * etc.). Une réservation à 12:45 compte donc dans le créneau 12:00. Si le
 * restaurant veut une fenêtre glissante de 60 minutes, il faudra remplacer
 * slotKey_ par un contrôle des intervalles qui se chevauchent.
 */

var CONFIG = {
  SHEET_NAME: 'Reservations',
  TIME_ZONE: 'Europe/Paris',
  MAX_RESERVATIONS: 15,
  MAX_COVERS: 30,
  ACTIVE_STATUSES: ['PENDING', 'CONFIRMED'],
  RESTAURANT_EMAIL: 'lacollinegambetta@mailo.com',
  HEADERS: [
    'Créé le', 'Date', 'Heure demandée', 'Créneau', 'Couverts', 'Statut',
    'Nom', 'Téléphone', 'Mail', 'Préférence', 'Message'
  ]
};

/* À exécuter une fois depuis l'éditeur Apps Script : crée la feuille et
   déclenche la demande d'autorisation du compte propriétaire. */
function setup() {
  sheet_();
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'availability') {
    return json_({ ok: true, service: 'reservation-capacity' });
  }

  var date = clean_(p.date);
  var time = clean_(p.time);
  if (!validDate_(date) || !validTime_(time)) {
    return json_({ ok: false, code: 'INVALID_INPUT', message: 'Date ou heure invalide.' });
  }

  return json_(availability_(date, slotKey_(time)));
}

function doPost(e) {
  var data = parameters_(e);
  if (data.action && data.action !== 'reserve') {
    return capacityResponse_({ ok: false, code: 'INVALID_ACTION', message: 'Action inconnue.' });
  }

  var date = clean_(data.date);
  var time = clean_(data.heure || data.time);
  var guests = Number(data.couverts || data.guests);
  var name = clean_(data.nom || data.Nom);
  var phone = clean_(data.telephone || data.Téléphone);
  var mail = clean_(data.email || data.Mail);
  var preference = clean_(data.preference || data.Préférence);
  var message = clean_(data.message || data.Message);

  if (!name || !phone || !validDate_(date) || !validTime_(time) ||
      !isFinite(guests) || guests < 1 || guests > 10) {
    return capacityResponse_({ ok: false, code: 'INVALID_INPUT', message: 'Les informations de réservation sont invalides.' });
  }

  /* Le verrou doit couvrir lecture + décision + écriture. C'est cette
     section qui empêche deux envois simultanés de prendre la dernière
     place en même temps. */
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return capacityResponse_({ ok: false, code: 'BUSY', message: 'Réessayez dans quelques secondes.' });
  }

  try {
    var sheet = sheet_();
    var slot = slotKey_(time);
    var current = availability_(date, slot, sheet);

    if (current.reservations >= CONFIG.MAX_RESERVATIONS ||
        current.covers + guests > CONFIG.MAX_COVERS) {
      return capacityResponse_({
        ok: false,
        code: 'CAPACITY_FULL',
        message: 'Ce créneau est complet.',
        reservations: current.reservations,
        covers: current.covers,
        remainingReservations: Math.max(0, CONFIG.MAX_RESERVATIONS - current.reservations),
        remainingCovers: Math.max(0, CONFIG.MAX_COVERS - current.covers)
      });
    }

    var row = [
      new Date(), date, time, slot, guests, 'PENDING', name, phone, mail,
      preference, message
    ];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

    var after = {
      reservations: current.reservations + 1,
      covers: current.covers + guests
    };

    /* Le courriel est une notification, pas la source de vérité. Si MailApp
       est temporairement indisponible, la ligne déjà écrite conserve la
       réservation et pourra être traitée depuis le tableur. */
    try {
      sendNotification_(date, time, guests, name, phone, mail, preference, message);
    } catch (mailError) {
      console.log('Notification non envoyée : ' + mailError);
    }

    return capacityResponse_({
      ok: true,
      code: 'ACCEPTED',
      reservations: after.reservations,
      covers: after.covers,
      remainingReservations: CONFIG.MAX_RESERVATIONS - after.reservations,
      remainingCovers: CONFIG.MAX_COVERS - after.covers
    });
  } finally {
    lock.releaseLock();
  }
}

function availability_(date, slot, optSheet) {
  var sheet = optSheet || sheet_();
  var rows = sheet.getDataRange().getValues();
  var reservations = 0;
  var covers = 0;

  /* Ligne 0 = en-tête. Les index restent lisibles si la feuille est
     déplacée : ils correspondent à CONFIG.HEADERS. */
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowDate = cell_(row[1]);
    var rowSlot = cell_(row[3]);
    var status = cell_(row[5]).toUpperCase();
    if (rowDate === date && rowSlot === slot && CONFIG.ACTIVE_STATUSES.indexOf(status) !== -1) {
      reservations += 1;
      covers += Number(row[4]) || 0;
    }
  }

  return {
    ok: true,
    date: date,
    slot: slot,
    reservations: reservations,
    covers: covers,
    remainingReservations: Math.max(0, CONFIG.MAX_RESERVATIONS - reservations),
    remainingCovers: Math.max(0, CONFIG.MAX_COVERS - covers),
    available: reservations < CONFIG.MAX_RESERVATIONS && covers < CONFIG.MAX_COVERS
  };
}

function sheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Le script doit être lié à un Google Sheet.');
  var sheet = book.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = book.insertSheet(CONFIG.SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function parameters_(e) {
  var result = {};
  var parameter = (e && e.parameter) || {};
  Object.keys(parameter).forEach(function (key) { result[key] = parameter[key]; });

  /* Utile si un autre client envoie du JSON. Le formulaire du site utilise
     application/x-www-form-urlencoded pour rester une requête CORS simple. */
  if (e && e.postData && e.postData.contents &&
      String(e.postData.type || '').indexOf('application/json') !== -1) {
    try {
      var body = JSON.parse(e.postData.contents);
      Object.keys(body).forEach(function (key) { result[key] = body[key]; });
    } catch (ignore) {}
  }
  return result;
}

function sendNotification_(date, time, guests, name, phone, mail, preference, message) {
  var subject = 'Réservation — ' + name + ' — ' + date + ' à ' + time.replace(':', 'h') +
    ' (' + guests + (guests === 1 ? ' personne' : ' personnes') + ')';
  var body = [
    'Bonjour,', '', 'Nouvelle demande de réservation.', '',
    'Nom : ' + name,
    'Téléphone : ' + phone,
    'Mail : ' + (mail || '—'),
    'Date : ' + date,
    'Heure : ' + time.replace(':', 'h'),
    'Couverts : ' + guests,
    'Préférence : ' + (preference || '—'),
    'Message : ' + (message || '—'), '',
    'La demande est enregistrée dans le Google Sheet avec le statut PENDING.'
  ].join('\n');
  var options = {};
  if (mail) options.replyTo = mail;
  MailApp.sendEmail(CONFIG.RESTAURANT_EMAIL, subject, body, options);
}

function slotKey_(time) {
  return time.substring(0, 2) + ':00';
}

function validDate_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime_(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function clean_(value) {
  return String(value == null ? '' : value).trim().slice(0, 2000);
}

function cell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  }
  return String(value == null ? '' : value).trim();
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Le site est statique : la réponse du POST est chargée dans une iframe
   cachée, puis remonte à la page par postMessage. Cela évite de dépendre
   des en-têtes CORS que Google Apps Script ne permet pas de configurer de
   manière fiable sur ContentService. Aucun contenu saisi par le client
   n'est réinjecté dans cette réponse. */
function capacityResponse_(value) {
  var data = JSON.stringify({ source: 'lcg-reservation-capacity', payload: value });
  var html = '<!doctype html><meta charset="utf-8"><script>' +
    'window.parent.postMessage(' + data + ', "*");' +
    '</script>';
  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
