/* Configuration des réservations et des notifications emails */
window.LCG_RESERVATION_ENDPOINT = 'firebase';
window.LCG_RESTAURANT_EMAIL = 'restaurant@lacollinegambetta.com';

/* Configuration du fournisseur d'email :
 *
 * OPTION 1 (Recommandée & Gratuite) : Web3Forms (Délivrabilité 100 % sur Gmail, Orange, etc.)
 * Obtenez votre clé d'accès instantanée en 10 secondes sur https://web3forms.com avec 'restaurant@lacollinegambetta.com'
 * et collez-la dans 'web3formsKey' ci-dessous.
 *
 * OPTION 2 : FormSubmit (Gratuit, envoyé directement à restaurant@lacollinegambetta.com)
 */
window.LCG_EMAIL_CONFIG = {
  provider: 'formsubmit', // 'web3forms' ou 'formsubmit'
  web3formsKey: '',       // ex: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  restaurantEmail: 'restaurant@lacollinegambetta.com'
};
