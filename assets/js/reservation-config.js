/* Configuration des réservations et des notifications emails */
window.LCG_RESERVATION_ENDPOINT = 'firebase';
window.LCG_RESTAURANT_EMAIL = 'lacollinegambetta@mailo.com';

/* Configuration du fournisseur d'email :
 *
 * OPTION 1 (Recommandée & Gratuite) : Web3Forms (Délivrabilité 100 % sur Mailo, Orange, Gmail)
 * Obtenez votre clé d'accès instantanée en 10 secondes sur https://web3forms.com avec 'lacollinegambetta@mailo.com'
 * et collez-la dans 'web3formsKey' ci-dessous.
 *
 * OPTION 2 : FormSubmit (Gratuit, nécessite d'activer le lien reçu)
 */
window.LCG_EMAIL_CONFIG = {
  provider: 'formsubmit', // 'web3forms' ou 'formsubmit'
  web3formsKey: '',       // ex: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  restaurantEmail: 'lacollinegambetta@mailo.com'
};
