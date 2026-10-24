# Ton photographique du site

### Courgettes des six couscous : morceaux, pas rondelles
Correction explicite du propriétaire : courgettes coupées en morceaux
allongés dans la longueur, peau verte visible, et non en rondelles/disques.
Appliqué aux six visuels, y compris La Colline Royale. Conserver le reste
des plats, leurs viandes, le cadrage et le décor existants.


### Nouvelle exception demandée : six couscous et décor du restaurant
Après la restauration des originaux, le propriétaire a demandé de reprendre
uniquement les six couscous à partir de IMG3117/2829/2830. Table carrée noire
à bord doré, cuir noir, jaune/noir des banquettes, niche jaune TV, bar sombre,
murs chauds et lumière ambre. Format16:9,1280×720, nourriture nette, fond bokeh.
Les images sont inspirées des photos réelles, sans garantie de reproduction
architecturale exacte. Assiette entière, perspective cohérente ; LaColline
contient poulet, agneau et bœuf, sans merguez. Aucun autre visuel à retoucher
sans demande explicite. La correction séparée des tagliatelles est conservée.


### Affichage 16:9 demandé pour les quatre rubriques
Les66photos des entrées, plats, desserts et crêpes s’affichent dans un cadre
16:9, dans les tiroirs et la visionneuse, sur mobile et ordinateur. Les fichiers
originaux restent intacts ; `object-fit:contain` évite de déformer ou couper
les assiettes (bandes discrètes possibles pour les sources carrées). Les
illustrations des formules crêpes et le PDF sont exclus de ce changement.
Aucune reprise de génération ou de décor n’est autorisée par ce simple
changement d’affichage. Vérification : `npm run test:photos`.


### Exception expressément demandée après restauration
Uniquement `tagliatelles-au-saumon.jpg` : le propriétaire a choisi des petits
morceaux de saumon mêlés aux pâtes. Photo corrigée en conservant le décor
original. Les23autres restent identiques aux originaux. Ne pas relancer
la campagne de décor/cadrage ; les consignes historiques restent suspendues.


## Priorité actuelle : RESTAURATION DES ORIGINAUX — STOP AUX RETOUCHES
Le propriétaire a rejeté les nouvelles photos et demandé le retour aux
originaux. Les24photos de Nos plats ont été restaurées **octet pour octet**
depuis29ef6c1 :18photos avant la campagne de retouches,6couscous lors de
leur ajout initial. Les classes de recadrage ajoutées ont été retirées et les
URL d’images versionnées pour vider le cache. Propositions rejetées supprimées.
**Ne pas poursuivre la génération ni la modification de décor/cadrage/bokeh**
sans nouvelle demande explicite. Les anciennes consignes ci-dessous sont
historiques et ne doivent pas relancer cette campagne. Textes, prix, traductions,
réservation et PDF ne sont pas restaurés ni modifiés par ce retour des photos.

Les gabarits historiques ci-dessous ne priment pas sur ce bloc pour Nos plats.

Un seul ton pour TOUTES les photos : plats, entrées, desserts, boissons,
cocktails, vins. Référence : `assets/plats/*.jpg`.

## Gabarit commun — plats, entrées, desserts
Bistro parisien **en pleine lumière du jour**, table de **marbre blanc**,
chaises bistrot en bois courbé, grande vitrine à gauche qui inonde la
scène. **Encadrements de fenêtres et de portes NOIRS** (menuiseries
noir mat, style bistrot parisien). Au fond, **un tableau ardoise** —
jamais de miroir — portant des lignes de menu à la craie **floutées,
illisibles**, aucun mot déchiffrable. Brique claire, appliques allumées
en petits halos chauds. Objectif 85 mm à f/1.8, faible profondeur de champ,
**bokeh crémeux** sur la salle. Lumière naturelle douce et **enveloppante**,
image **claire et lumineuse**, blancs propres, ombres douces jamais
bouchées. Photographie éditoriale. **Aucune personne reconnaissable** : salle vide
ou, au plus, une silhouette lointaine entièrement fondue dans le flou,
jamais un visage net.

## Gabarit BOISSONS (v2 — en vigueur)
Recette distincte du gabarit ci-dessus. Cadrage **serré**, 85 mm f/1.4
(f/1.8 pour les verres hauts), **appareil à hauteur de table**.

**Le sujet est la star.** Le verre occupe le cadre, reste net, et il est
**entièrement visible** — pied, base et couronne de mousse ou de
chantilly compris — avec une **marge libre au-dessus et en dessous**.
Rien ne touche le bord de l'image.

**Décor neutre.** Table ronde en marbre blanc et chaises bistrot
**conservées mais fondues dans un bokeh maximal**. Sont **proscrits** :
mur en brique, ardoise, verrière, montants de fenêtre, banquette,
enseigne, texte, architecture reconnaissable, personnes.
Lumière du jour **claire**, tons crème neutres.

**Condiments.** Dès qu'un intitulé annonce un **goût ou un ingrédient**,
le condiment correspondant est posé sur la table — **petit et
franchement hors mise au point**, jamais en concurrence avec le verre.
Exemples : noisettes pour le café noisette, caramel et gousse de vanille
pour le café allongé, pomme verte pour la Manzana, orge maltée pour les
whiskies, houblon et malt pour les pressions. Les **fruits frais**
remplacent les fioles de sirop : une étiquette générée est toujours
illisible, le fruit raconte mieux le goût.

**Intitulés multiples.** Quand la carte annonce plusieurs boissons ou
plusieurs contenances, la photo les montre **toutes** : Martini blanc et
rouge, Crème et Chocolat Viennois, les trois formats de Vittel.

**Verres jumeaux.** Deux verres servis à l'identique sont
indiscernables. Chaque paire doit être **contrastée** : pastis pur ambre
contre pastis à l'eau trouble, Amaretto ambre contre Fernet noir. Quand
les liquides sont réellement identiques (eaux-de-vie incolores), c'est
le **fruit posé devant chaque verre** qui identifie.

**Grandes contenances** : bouteilles en **verre**, conformes aux
contenances de la carte.

## Marques
Reproduire fidèlement la **vraie marque** quand la carte la nomme
(Vittel, Perrier, Coca-Cola, Heineken…). Sinon, aucun logo.

## À proscrire
Bar sombre de nuit, ambiance « moody », fond noir, éclairage tamisé,
marbre noir. Miroir au mur. Visages nets. Texte lisible sur l'ardoise.
Pour les BOISSONS, voir aussi la liste de proscriptions du gabarit v2
(brique, ardoise, verrière, banquette).

Les **cocktails** font exception : lumière cosy de soirée, validée.

## Exception demandée pour les couscous
Les six photos `assets/plats/couscous-*.jpg` conservent la lumière naturelle
et le décor bistrot des plats, mais sont présentées sur une **table noire**,
à la demande explicite du propriétaire. Cette exception ne change pas le
style des autres catégories. Visuels illustratifs générés, pas des photos
prises au restaurant.

Mise à jour couscous : cadrage **16:9** (1280 × 720), lumière dorée douce,
ambiance plus chaleureuse, tables noires conservées. Pas de filtre orange excessif.

Décor des couscous affiné d’après la photo intérieure fournie par le propriétaire :
comptoir noir à façade rainurée, étagères sombres de bouteilles et verres suspendus,
petites suspensions sphériques crème, plafond pêche/ambre et banquette jaune moutarde.
Cadrage serré sur l’assiette, faible profondeur de champ (esprit 85 mm f/1.4),
arrière-plan en bokeh lumineux et avant-plan doux. Pas de personnes identifiables
ni de texte lisible ; garder le plat net, l’assiette entière et le format 16:9.

## Harmonisation de tout l’onglet « Nos plats » — en cours
Demande du propriétaire : réutiliser ses trois photos intérieures pour toutes
les 24 photos (plats, burgers, salades, pâtes, couscous). Angle plongeant **45°**,
format **16:9**, tables **noires** à bord fin doré, chaises **cuir noir**,
banquettes jaunes/noires, murs pêche texturés, suspensions ambrées.
Bokeh d’arrière-plan marqué, plat net et entier. Pas de personnes identifiables.
L’état d’avancement est dans `tools/plats-photos-progress.json`.

Précision du décor pour la deuxième série et la suite : grande baie vitrée
à encadrement noir ; grande télévision noire éteinte sur le mur jaune
**à gauche du bar**, visibles comme formes floutées dans le bokeh.

Dernières précisions : toutes les tables doivent rester noir uni (aucun
marbre blanc ni bois clair), chaises cuir noir ; accentuer le bokeh sans
couper l’assiette. Le plat de poisson reprend désormais un pavé de saumon
sur des pâtes d’après la photo fournie. Le couscous signature s’appelle
« La Colline » et contient poulet, agneau et bœuf, sans merguez.

## Précision finale de l’angle et du décor (confirmée)
L’appareil est **au-dessus** de l’assiette, à **45–60° vers le bas** (cible55°),
pour montrer le contenu ; jamais au ras de la table. Assiette posée à plat.
La grande baie vitrée noire est l’entrée, **à gauche de la TV dans sa niche
jaune** ; le bar est à droite de la TV. À droite du bar : salle longue avec
une rangée de tables le long de chaque mur. Tables noir uni, chaises cuir noir.
Mise en scène professionnelle : couverts, serviette, boisson et pain/sauce
selon le plat, sans modifier la recette ni ajouter de suppléments implicites.
Conserver les plats nets et le bokeh d’arrière-plan marqué. La nouvelle passe
suit `tools/plats-photos-progress.json` (10/24 traitées pour ce brief révisé).

## Correction prioritaire : zoom et fond réellement flou
Le propriétaire a rejeté la salle trop visible et inventée. Cette correction
**remplace les précédents briefs montrant toute la disposition**. Utiliser les
3 photos réelles comme références, mais cadrer serré sur la nourriture :
assiette environ80–90% de la largeur, angle élevé45–60°, contenu net. Très peu
de fond visible, complètement dissous en bokeh crémeux noir/jaune/ambre.
Ne pas reconstruire une entrée, TV ou salle détaillée ; le décor n’est pas
le sujet. Accessoires discrets en bordure, pas de concurrence avec le plat.
Les10photos de la précédente série ont été reprises ;14restantes à traiter.

## Ajustement suivant : dézoom très léger
À la demande du propriétaire : viser75–80% de largeur pour l’assiette,
un peu plus d’air autour et d’accessoires visibles, toujours sans plan large
sur le restaurant. Conserver la vue élevée et le bokeh très prononcé.
La série burgers poisson/végétarien,4salades,3pâtes,couscous poulet est
réalisée dans ce cadrage ;4couscous restent à terminer.

## Fin de série : quatre couscous restants
Merguez, agneau, bœuf et végétarien repris avec un très léger recul
(assiette environ72–78% de largeur), vue élevée et fond bokeh intense.
La passe couvre les24photos ; les10premières restent au gros plan précédent,
les14suivantes ont reçu le cadrage légèrement élargi demandé ensuite.

## Correction des couscous et des tagliatelles au saumon
Les six couscous ont été harmonisés en prenant la salade Nordique comme
référence de cadrage et de lumière : présentation naturelle dans une assiette
blanche posée à plat, vue élevée, table noire et arrière-plan discret flouté.
Le couscous La Colline montre poulet, agneau et bœuf, sans merguez.
**Tagliatelles au saumon** : rubans de pâtes avec morceaux de saumon mêlés
à la sauce, et non un pavé entier posé sur les pâtes. Cette correction ne
change pas le visuel du plat « Poisson » (pavé accompagné de pâtes).
