/* Configuration de la réservation.
 *
 * Le site reste utilisable tel quel tant que l'URL est vide : les demandes
 * passent alors par le relais de courriel historique. Pour activer le
 * contrôle centralisé de capacité, déployez tools/reservation-capacity/Code.gs
 * comme application web Google Apps Script, puis collez son URL ci-dessous.
 *
 * Ne mettez jamais une clé privée ici : ce fichier est public par nature.
 */
window.LCG_RESERVATION_ENDPOINT = '';
