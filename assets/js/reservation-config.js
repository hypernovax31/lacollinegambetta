/* Configuration des réservations et des notifications emails */
window.LCG_RESERVATION_ENDPOINT = 'firebase';
window.LCG_RESTAURANT_EMAIL = 'restaurant@lacollinegambetta.com';

/* Configuration des emails :
 *
 * OPTION 1 : FormSubmit (Par défaut, envoi au restaurant + auto-réponse au client)
 *
 * OPTION 2 (Recommandée pour 0 % de spam avec Google Workspace) :
 * Script Google Apps rattaché à restaurant@lacollinegambetta.com.
 * L'e-mail de confirmation part directement depuis votre compte officiel Google Workspace.
 *
 * OPTION 3 : Web3Forms (Clé d'accès sur https://web3forms.com)
 */
window.LCG_EMAIL_CONFIG = {
  provider: 'formsubmit',      // 'formsubmit', 'google_script', ou 'web3forms'
  restaurantEmail: 'restaurant@lacollinegambetta.com',
  googleScriptUrl: '',         // URL de votre Web App Google Apps Script si configurée
  web3formsKey: ''             // Clé Web3Forms si utilisée
};
