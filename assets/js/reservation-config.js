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
  googleScriptUrl: 'https://script.google.com/macros/s/AKfycbxZNJmrmT7BBEEVO78QQGSby0BWdEdSco_jBR16KjoEOH-U20eAQdcX9q4ZTT5nsdlF/exec',
  web3formsKey: ''
};
