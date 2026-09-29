/* Configuration des réservations et des notifications emails */
window.LCG_RESERVATION_ENDPOINT = 'firebase';
window.LCG_RESTAURANT_EMAIL = 'restaurant@lacollinegambetta.com';

/* Configuration des emails :
 *
 * OPTION 1 : Google Apps Script (Recommandé & Actif : 100 % de délivrabilité, 0 % de spam)
 * Envoi direct depuis votre compte Google Workspace restaurant@lacollinegambetta.com
 *
 * OPTION 2 : FormSubmit (Repli automatique)
 *
 * OPTION 3 : Web3Forms (Clé d'accès optionnelle)
 */
window.LCG_EMAIL_CONFIG = {
  provider: 'google_script',   // 'google_script', 'formsubmit', ou 'web3forms'
  restaurantEmail: 'restaurant@lacollinegambetta.com',
  googleScriptUrl: 'https://script.google.com/macros/s/AKfycbwbfIXb8hDru30kgS-vzj7hdmu6b2bGnRvpFLeUYcdkNnSRxp_mwZsmDjz3QSQGdKQ/exec',
  web3formsKey: ''
};
