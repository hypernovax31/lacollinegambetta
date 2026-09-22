/* Configuration des réservations et des notifications emails */
window.LCG_RESERVATION_ENDPOINT = 'firebase';

/* Configuration Brevo (Sendinblue) pour l'envoi d'emails transactionnels (Délivrabilité 100%)
 * Obtenez votre clé API v3 gratuitement sur : https://app.brevo.com/settings/keys/api
 * Collez votre clé dans 'apiKey' ci-dessous. */
window.LCG_BREVO_CONFIG = {
  apiKey: '',
  senderEmail: 'lacollinegambetta@mailo.com',
  senderName: 'La Colline Gambetta',
  restaurantEmail: 'lacollinegambetta@mailo.com'
};
