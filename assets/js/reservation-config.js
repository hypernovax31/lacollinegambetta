/* L'API locale crée et contrôle les créneaux automatiquement.
 *
 * Le serveur Node (`npm start`) utilise une base SQLite locale : aucune
 * feuille Google ou configuration de créneaux n'est nécessaire. Si le site
 * et l'API sont hébergés sur deux domaines, remplacer cette valeur par l'URL
 * publique de l'API.
 */
window.LCG_RESERVATION_ENDPOINT = '/api/reservations';
