// Ma Pétanque — toutes les tables du jeu.
// Le pointage et le tir sont deux progressions complètement séparées : chacun a ses
// Points, son arbre de compétences, ses améliorations, ses boules et ses défis.
// Les valeurs de départ viennent de l'ancien jeu (APK du 29 août 2026).
'use strict';
var MP = window.MP || (window.MP = {});

// Mesures réelles d'une partie de pétanque, en mètres.
MP.MESURES = {
  rayonBoule: 0.0375,      // boule de 75 mm
  rayonCochonnet: 0.015,   // cochonnet de 30 mm
  masseBoule: 0.70,        // kg
  masseCochonnet: 0.018,
  largeurTerrain: 4,       // terrain réglementaire de 4 m sur 15 m
  longueurTerrain: 15,
  cercle: 0.25             // rayon du cercle de lancer (50 cm de diamètre)
};

// Taille des boules et du cochonnet selon la distance du but : comme si la caméra descendait pour
// les lancers courts, tout est plus gros de près (×2,2 à 4,5 m), en vraie taille à 9,5 m et au-delà.
// Ce n'est pas qu'un dessin : la collision, les écarts au départ et les mesures suivent la même taille.
MP.tailleObjets = function (distance) {
  return 1 + 1.2 * Math.max(0, Math.min(1, (9.5 - distance) / 5));
};

MP.DISCIPLINES = [
  { id: 'pointage', nom: 'Pointage', joueur: 'Pointeur', monnaie: 'Points de pointage', court: 'pts' },
  { id: 'tir', nom: 'Tir', joueur: 'Tireur', monnaie: 'Points de tir', court: 'pts' }
];

MP.BRANCHES = [
  { id: 'geste', nom: 'Geste' },
  { id: 'techniques', nom: 'Techniques' },
  { id: 'effets', nom: 'Effets' },
  { id: 'progression', nom: 'Progression' }
];

// Branches communes aux deux arbres (chacun a ses propres niveaux) ; les descriptions disent ce que
// chaque compétence change dans la discipline (effets mesurés par tests/tests.js, section 21).
function brancheGeste(mode) {
  var tir = mode === 'tir';
  return [
    { id: 'stabilite', nom: 'Main stable', branche: 'geste', max: 40, prix: 4, requis: null,
      desc: 'Moins d’erreur de direction sur tous tes ' + (tir ? 'tirs' : 'lancers') + ' : deux fois moins au niveau 6, trois fois moins au niveau 20 ; la zone de chute se resserre à chaque niveau et la croix tremble moins en l’air. N3 ouvre les premiers ' + (tir ? 'tirs' : 'lancers') + ' en l’air, N4 Lecture du sol et Dosage de la force, N7 les effets.' },
    { id: 'lectureSol', nom: 'Lecture du sol', branche: 'geste', max: 30, prix: 7, requis: ['stabilite', 4],
      desc: tir
        ? 'Le sol dévie moins tes tirs qui roulent ou rebondissent avant la cible (tir roulé, rafle, tir simple, tir devant) : deux fois et demie moins au niveau 15. Le tir au fer, qui frappe sans toucher le sol, n’en dépend pas. Tu lis aussi mieux le relief (bosses, cuvettes) et la bande du Repère de force en tient compte.'
        : 'Le sol (graviers, cailloux) dévie moins tes boules qui roulent : deux fois et demie moins au niveau 15. Tu lis aussi mieux le relief : les bosses et cuvettes se voient mieux, la force des pentes est nommée, et le Repère de force comme la Donnée marquée en tiennent compte.' },
    { id: 'dosage', nom: 'Dosage de la force', branche: 'geste', max: 40, prix: 7, requis: ['stabilite', 4],
      desc: 'Moins d’erreur de force sur tous tes ' + (tir ? 'tirs' : 'lancers') + ' : ' + (tir ? 'ils arrivent' : 'ta boule va') + ' plus juste en longueur (deux fois moins d’erreur au niveau 5, trois fois moins au niveau 20).' }
  ];
}
function brancheEffets(mode) {
  var tir = mode === 'tir';
  function cote(nom) {
    return tir
      ? 'Ta boule part vers la ' + nom + ' en touchant le sol : au tir roulé, à la rafle, au tir simple et au tir devant, elle tourne avant la cible. Au tir au fer, l’effet agit au choc : ta boule file vers la ' + nom + ' et chasse la cible un peu de l’autre côté. Une flèche montre l’effet pendant la visée. Plus fort à chaque niveau.'
      : 'La boule part vers la ' + nom + ' en touchant le sol, puis tourne en roulant (et encore après un choc) : pour contourner une boule ou suivre un dévers. Une flèche montre de combien pendant la visée. Plus fort à chaque niveau.';
  }
  return [
    { id: 'effetGauche', nom: 'Effet gauche', branche: 'effets', max: 30, prix: 16, requis: ['stabilite', 7], desc: cote('gauche') },
    { id: 'effetDroite', nom: 'Effet droite', branche: 'effets', max: 30, prix: 16, requis: ['stabilite', 7], desc: cote('droite') },
    { id: 'retro', nom: 'Rétro', branche: 'effets', max: 30, prix: 28, requis: ['effetDroite', 8],
      desc: tir
        ? 'Ta boule reste presque sur place après avoir frappé la cible : le meilleur moyen de faire un carreau. Au tir roulé, elle freine en roulant : lance plus fort.'
        : 'La boule mord le sol à sa chute et roule bien moins ; après avoir frappé une boule, elle reste presque en place.' },
    { id: 'effetsForts', nom: 'Effets forts', branche: 'effets', max: 30, prix: 34, requis: ['retro', 5],
      desc: 'Tous les effets sont plus prononcés et plus réguliers d’un lancer à l’autre.' }
  ];
}
function brancheProgression() {
  return [
    { id: 'serie', nom: 'Bonus de série', branche: 'progression', max: 30, prix: 10, requis: null,
      desc: 'Plus de Points quand tu enchaînes les victoires.' },
    { id: 'atelier', nom: 'Remise atelier', branche: 'progression', max: 30, prix: 10, requis: null,
      desc: '−1 % sur le prix des boules par niveau (jusqu’à −20 %).' }
  ];
}

// Compétences et améliorations retirées (doublons, presque inutiles ou trop faciles) : leurs Points
// sont rendus aux anciennes sauvegardes. Prix du premier niveau, par discipline.
MP.RETIREES = {
  competences: { sponsor: [8, 8], collection: [14, 14], legende: [25, 25], spinStable: [40, 40], zoneArret: [60, 0], pointImpact: [0, 60] },
  ameliorations: { precision: [4, 5], controle: [4, 6] }
};

// prix : prix du premier niveau ; chaque niveau coûte 15 % de plus (MP.prixCompetence).
// requis : [compétence, niveau] du même arbre, nécessaire avant de pouvoir l'acheter.
MP.ARBRES = {
  pointage: [].concat(
    brancheGeste('pointage'),
    [
      { id: 'puissance', nom: 'Force du bras', branche: 'techniques', max: 40, prix: 5, requis: null,
        desc: 'Tu lances plus loin : +15 cm de portée par niveau. Au début, tu ne dépasses pas 6 m.' },
      { id: 'demiPortee', nom: 'Demi-portée', branche: 'techniques', max: 30, prix: 14, requis: null,
        desc: 'Premier lancer en l’air : pose le doigt, la croix le suit à côté. La boule tombe où tu vises, puis roule encore un bon bout.' },
      { id: 'portee', nom: 'Portée', branche: 'techniques', max: 30, prix: 24, requis: null,
        desc: 'Arc haut : la boule tombe près du but et roule peu. Passe par-dessus une boule devant.' },
      { id: 'plombee', nom: 'Plombée', branche: 'techniques', max: 30, prix: 38, requis: null,
        desc: 'Chute très haute : la boule s’arrête presque où elle tombe. Passe par-dessus une ligne de boules.' },
      { id: 'toucher', nom: 'Toucher', branche: 'techniques', max: 30, prix: 10, requis: ['stabilite', 3],
        desc: 'Ta boule lancée en l’air roule moins après sa chute : elle s’arrête plus près de là où tu vises.' }
    ],
    brancheEffets('pointage'), brancheProgression()),
  tir: [].concat(
    brancheGeste('tir'),
    [
      { id: 'puissance', nom: 'Force du bras', branche: 'techniques', max: 40, prix: 5, requis: null,
        desc: 'Tu tires plus loin : +15 cm de portée par niveau (le tir roulé reste limité à 7 m : plus loin, rafle ou tir en l’air).' },
      { id: 'frappe', nom: 'Frappe', branche: 'techniques', max: 30, prix: 9, requis: null,
        desc: 'Ta boule frappe plus lourd : au tir roulé et à la rafle, la cible part bien plus loin (un tiers de plus au niveau 15), moins de « la cible a à peine bougé ». Un tir en l’air bien placé chasse déjà la cible.' },
      { id: 'oeil', nom: 'Œil du tireur', branche: 'techniques', max: 30, prix: 12, requis: ['stabilite', 3],
        desc: 'Tes tirs en l’air tombent plus juste en longueur : deux fois moins de tirs trop courts ou trop longs au niveau 5.' },
      { id: 'rafle', nom: 'Rafle', branche: 'techniques', max: 30, prix: 12, requis: null,
        desc: 'Au glissé, lancée basse et forte vers le sol : la boule touche terre à 1\u00a0m de toi au plus, puis file avec puissance, bien plus loin que le tir roulé. Sur les cailloux, elle saute.' },
      { id: 'tirLeve', nom: 'Tir simple', branche: 'techniques', max: 30, prix: 16, requis: null,
        desc: 'Premier tir en l’air : la boule se lève, passe par-dessus ce qui gêne, tombe où tu vises et roule encore un peu.' },
      { id: 'tirDevant', nom: 'Tir devant', branche: 'techniques', max: 30, prix: 20, requis: null,
        desc: 'Tir en l’air plus précis : la boule tombe juste devant la cible et roule peu avant de la frapper.' },
      { id: 'tirAuFer', nom: 'Tir au fer', branche: 'techniques', max: 30, prix: 38, requis: null,
        desc: 'La boule frappe la cible directement, sans toucher le sol. Passe par-dessus les boules devant.' },
      { id: 'carreau', nom: 'Carreau', branche: 'techniques', max: 30, prix: 45, requis: null,
        desc: 'Après l’impact, ta boule reste plus souvent à la place de la cible.' },
      { id: 'diriger', nom: 'Diriger au fer', branche: 'techniques', max: 30, prix: 40, requis: null,
        desc: 'Au tir au fer, ta boule part plus sûrement du côté de ton effet après le choc, moins au hasard du choc. Pour l’envoyer là où tu veux : une zone, le point à reprendre.' }
    ],
    brancheEffets('tir'), brancheProgression())
};

// Améliorations de la boutique, propres à chaque discipline : le pointeur veut savoir où sa boule
// s'arrêtera, le tireur si elle passe au-dessus des boules devant.
// vol : seulement utile aux lancers en l'air (s'achète une fois un lancer en l'air appris).
MP.AMELIORATIONS = {
  pointage: [
    { id: 'guide', nom: 'Guide de glisse', max: 50, prix: 3, desc: 'Quand tu glisses, le trajet prévu s’affiche : 1 m au départ, 12 cm de plus par niveau.' },
    { id: 'arcVol', nom: 'Arc de vol', max: 20, prix: 12, vol: true,
      desc: 'Quand tu maintiens, la courbe de la boule en l’air apparaît : un peu plus longue à chaque niveau, en entier au niveau 20.' },
    { id: 'suiteSol', nom: 'Suite au sol', max: 30, prix: 15, vol: true,
      desc: 'Quand tu maintiens, montre où la boule roule après sa chute : 10 cm au départ, 10 cm de plus à chaque niveau.' },
    { id: 'donnee', nom: 'Donnée marquée', max: 20, prix: 16, vol: true,
      desc: 'En l’air, un grand rond marque la région de la donnée : là où faire tomber ta boule pour qu’elle finisse près du cochonnet. Il reste toujours large (80 cm au début, 40 cm au mieux) et un peu à côté : à toi de trouver le point exact. La Lecture du sol y ajoute le relief, peu à peu.' },
    { id: 'metre', nom: 'Mètre du pointeur', max: 20, prix: 8,
      desc: 'Pendant la visée, annonce à quelle distance du cochonnet ta boule devrait s’arrêter si rien ne la gêne. Approximatif au début, au centimètre près à la fin.' },
    { id: 'lecturePuissance', nom: 'Repère de force', max: 20, prix: 4,
      desc: 'Montre sur la jauge la force qui amène la boule au cochonnet, comme sur un terrain plat (la Lecture du sol y ajoute le relief). Large au début, plus fine à chaque niveau.' },
    { id: 'bonusPoints', nom: 'Bonus de points', max: 200, prix: 7, desc: '+8 % de Points par niveau.' }
  ],
  tir: [
    { id: 'guide', nom: 'Guide de glisse', max: 50, prix: 3, desc: 'Quand tu glisses (tir roulé, rafle), le trajet prévu s’affiche : 1 m au départ, 12 cm de plus par niveau.' },
    { id: 'arcVol', nom: 'Arc de vol', max: 20, prix: 12, vol: true,
      desc: 'Quand tu maintiens, la courbe de la boule en l’air apparaît : un peu plus longue à chaque niveau, en entier au niveau 20.' },
    { id: 'passage', nom: 'Hauteur de passage', max: 15, prix: 10, vol: true,
      desc: 'Tir en l’air : dit si ta boule passe au-dessus de chaque boule devant (vert), de justesse (orange) ou la touche (rouge). À partir du niveau 10, donne la hauteur en centimètres.' },
    { id: 'lecturePuissance', nom: 'Repère de force', max: 20, prix: 4,
      desc: 'Montre sur la jauge la force qui amène la boule sur la cible, comme sur un terrain plat (la Lecture du sol y ajoute le relief). Large au début, plus fine à chaque niveau.' },
    { id: 'bonusPoints', nom: 'Bonus de points', max: 200, prix: 7, desc: '+8 % de Points par niveau.' }
  ]
};
// Aides retirées d'une seule discipline, où elles ne servaient pas (la Suite au sol au tir : le tireur
// veut toucher, pas savoir où sa boule roule) : leurs Points sont rendus une fois. Prix du premier niveau.
MP.AIDES_RETIREES = { pointage: {}, tir: { suiteSol: 15 } };
// Aides du tir retirées ensuite (trop fortes, loin de la pétanque) : remboursées une fois aussi.
MP.AIDES_RETIREES_2 = { pointage: {}, tir: { mire: 8, impact: 12 } };

// Les 9 techniques, dans l'ordre des affinités des boules. La technique choisie décide du geste :
// famille « roule » : on glisse le doigt (direction + force) ; famille « vol » : on maintient
// le doigt, la croix le suit à côté, et on lâche pour lancer.
MP.TECHNIQUES = [
  { id: 'roulette', nom: 'Roulette', mode: 'pointage', famille: 'roule', competence: null },
  { id: 'demiPortee', nom: 'Demi-portée', mode: 'pointage', famille: 'vol', competence: 'demiPortee' },
  { id: 'portee', nom: 'Portée', mode: 'pointage', famille: 'vol', competence: 'portee' },
  { id: 'plombee', nom: 'Plombée', mode: 'pointage', famille: 'vol', competence: 'plombee' },
  // « tirSimple » est le tir roulé du début (l'identifiant reste pour les sauvegardes) ; le tir simple
  // en l'air, qui se lève, s'appelle « tirLeve ». Il est en fin de liste : les affinités des boules
  // suivent l'ordre de cette liste.
  { id: 'tirSimple', nom: 'Tir roulé', mode: 'tir', famille: 'roule', competence: null },
  { id: 'rafle', nom: 'Rafle', mode: 'tir', famille: 'roule', competence: 'rafle' },
  { id: 'tirDevant', nom: 'Tir devant', mode: 'tir', famille: 'vol', competence: 'tirDevant' },
  { id: 'tirAuFer', nom: 'Tir au fer', mode: 'tir', famille: 'vol', competence: 'tirAuFer' },
  { id: 'tirLeve', nom: 'Tir simple', mode: 'tir', famille: 'vol', competence: 'tirLeve' }
];

// Déblocage des techniques : d'abord la maîtrise (des victoires avec la technique d'avant),
// puis une épreuve précise à réussir. L'épreuve réussie donne le niveau 1 de la compétence ;
// les niveaux suivants s'achètent avec les Points. Une épreuve réussie l'est pour toujours.
// essais : nombre de lancers permis (null : les réussites doivent s'enchaîner, un raté remet à zéro).
MP.EPREUVES = [
  { id: 'demiPortee', mode: 'pointage', apres: 'roulette', victoires: 30, technique: 'demiPortee', reussir: 3, essais: null,
    regle: 'Battre la boule adverse en demi-portée, à moins de 25 cm du cochonnet, 3 fois de suite, sur gravier.' },
  { id: 'portee', mode: 'pointage', apres: 'demiPortee', victoires: 36, technique: 'portee', reussir: 3, essais: null,
    regle: 'Passer par-dessus la boule devant et finir à moins de 20 cm du cochonnet en portée, 3 fois de suite.' },
  { id: 'plombee', mode: 'pointage', apres: 'portee', victoires: 45, technique: 'plombee', reussir: 3, essais: null,
    regle: 'Franchir la ligne de boules et finir à moins de 18 cm du cochonnet en plombée, 3 fois de suite.' },
  { id: 'rafle', mode: 'tir', apres: 'tirSimple', victoires: 30, technique: 'rafle', reussir: 3, essais: null,
    regle: 'Toucher la cible en rafle, plus loin que le tir roulé ne va, et la chasser à plus de 60 cm, 3 fois de suite.' },
  { id: 'tirLeve', mode: 'tir', apres: 'rafle', victoires: 36, technique: 'tirLeve', reussir: 3, essais: null,
    regle: 'Passer par-dessus la boule devant et chasser la cible à plus d’un mètre en tir simple, 3 fois de suite.' },
  { id: 'tirDevant', mode: 'tir', apres: 'tirLeve', victoires: 36, technique: 'tirDevant', reussir: 3, essais: null,
    regle: 'Passer par-dessus la boule devant, tomber à moins de 30 cm devant la cible et la toucher, 3 fois de suite.' },
  { id: 'tirAuFer', mode: 'tir', apres: 'tirDevant', victoires: 45, technique: 'tirAuFer', reussir: 3, essais: null,
    regle: 'Frapper la cible au fer (sans toucher le sol avant), par-dessus la boule devant, 3 fois de suite.' },
  { id: 'carreau', mode: 'tir', apres: 'tirAuFer', victoires: 45, technique: 'tirAuFer', reussir: 3, essais: 4,
    regle: 'Faire 3 vrais carreaux (ta boule reste à moins de 16 cm de la place de la cible) en 4 tirs au fer.' },
  // requis : compétences à avoir (au moins au niveau 1) pour ouvrir l'épreuve.
  { id: 'diriger', mode: 'tir', apres: 'tirAuFer', victoires: 60, technique: 'tirAuFer', reussir: 3, essais: 12,
    requis: ['carreau', 'effetGauche', 'effetDroite'],
    regle: 'Frapper la cible au fer, puis faire finir ta boule dans la zone dessinée à côté (à gauche ou à droite), 3 fois en 12 tirs. Joue l’effet du côté de la zone ; le Carreau garde ta boule près de la cible.' }
];

// Succès : objectifs permanents, propres à chaque discipline. Chacun donne +3 % de Points
// pour toujours (ils restent après une nouvelle saison ou une ligue).
// mesure(d) : où en est le joueur ; objectif : valeur à atteindre.
MP.BONUS_SUCCES = 0.03;
MP.SUCCES = (function () {
  var liste = [];
  function s(id, nom, objectif, desc, mesure, mode) { liste.push({ id: id, nom: nom, objectif: objectif, desc: desc, mesure: mesure, mode: mode || null }); }
  function nb(n) {
    var mots = { 1e6: 'un million de', 1e9: 'un milliard de', 1e12: 'mille milliards de' };
    return mots[n] || String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  }
  [[10, 'Premiers pas'], [100, 'Habitué du terrain'], [1000, 'Mille et une'], [10000, 'Increvable']].forEach(function (x) {
    s('victoires' + x[0], x[1], x[0], 'Gagner ' + nb(x[0]) + ' niveaux.', function (d) { return d.victoires; });
  });
  [[5, 'Sur sa lancée'], [10, 'Intouchable'], [20, 'Légende vivante']].forEach(function (x) {
    s('serie' + x[0], x[1], x[0], 'Gagner ' + x[0] + ' niveaux de suite.', function (d) { return d.meilleureSerie; });
  });
  [[5, 'Ça monte'], [10, 'Haut niveau'], [20, 'Élite'], [30, 'Au sommet']].forEach(function (x) {
    s('palier' + x[0], x[1], x[0], 'Atteindre le palier ' + x[0] + '.', function (d) { return d.palierRecord; });
  });
  [[1e3, 'Petite cagnotte'], [1e6, 'Millionnaire'], [1e9, 'Milliardaire'], [1e12, 'Fortune du boulodrome']].forEach(function (x) {
    s('points' + x[0], x[1], x[0], 'Gagner ' + nb(x[0]) + ' Points en tout.', function (d) { return d.gagnes; });
  });
  [[500, 'Bras solide'], [5000, 'Bras d’acier']].forEach(function (x) {
    s('lances' + x[0], x[1], x[0], 'Lancer ' + nb(x[0]) + ' boules.', function (d) { return d.lances; });
  });
  s('saison2', 'Nouvelle saison', 2, 'Commencer une deuxième saison.', function (d) { return d.saison; });
  s('saison5', 'Vétéran', 5, 'Commencer une cinquième saison.', function (d) { return d.saison; });
  s('epreuve1', 'Premier boss', 1, 'Réussir une épreuve.', function (d) { return Object.keys(d.epreuves).filter(function (k) { return d.epreuves[k]; }).length; });
  s('dores10', 'Chercheur d’or', 10, 'Gagner 10 niveaux dorés.', function (d) { return d.dores; });
  s('defis25', 'Défi relevé', 25, 'Réussir 25 défis.', function (d) { return d.defisReussis; });
  s('defis250', 'Amateur de défis', 250, 'Réussir 250 défis.', function (d) { return d.defisReussis; });
  s('etoiles1', 'Cinq étoiles', 1, 'Gagner un niveau ★★★★★.', function (d) { return d.cinqEtoiles; });
  s('etoiles25', 'Grand chef', 25, 'Gagner 25 niveaux ★★★★★.', function (d) { return d.cinqEtoiles; });
  s('boules5', 'Collectionneur', 5, 'Posséder 5 boules.', function (d) { return d.boules.length; });
  s('ligue1', 'Champion départemental', 1, 'Monter en ligue Régional.', function (d) { return d.ligue; });
  s('ligue2', 'Sur la scène nationale', 2, 'Monter en ligue National.', function (d) { return d.ligue; });
  s('ligue3', 'Mondial !', 3, 'Monter en ligue Mondial.', function (d) { return d.ligue; });
  function recrues(d) { return Object.keys(d.club).reduce(function (t, k) { return t + d.club[k]; }, 0); }
  s('club10', 'Esprit d’équipe', 10, 'Avoir 10 coéquipiers au club.', recrues);
  s('club100', 'Grand club', 100, 'Avoir 100 coéquipiers au club.', recrues);
  s('clubPoints', 'Le club tourne', 1e6, 'Ton club gagne un million de Points en tout.', function (d) { return d.clubGagnes; });
  // Pointage
  s('epreuvesP', 'Maître pointeur', 3, 'Réussir les 3 épreuves du pointage.', function (d) { return Object.keys(d.epreuves).filter(function (k) { return d.epreuves[k]; }).length; }, 'pointage');
  [[1, 'Premier biberon'], [10, 'Biberons en série'], [100, 'Roi du biberon']].forEach(function (x) {
    s('biberons' + x[0], x[1], x[0], x[0] > 1 ? 'Faire ' + x[0] + ' biberons.' : 'Faire un biberon (au contact du cochonnet).', function (d) { return d.biberons; }, 'pointage');
  });
  // Tir
  s('epreuvesT', 'Maître tireur', 4, 'Réussir les 4 épreuves du tir.', function (d) { return Object.keys(d.epreuves).filter(function (k) { return d.epreuves[k]; }).length; }, 'tir');
  [[1, 'Premier carreau'], [10, 'Carreaux en série'], [100, 'Roi du carreau']].forEach(function (x) {
    s('carreaux' + x[0], x[1], x[0], x[0] > 1 ? 'Faire ' + x[0] + ' carreaux.' : 'Faire un carreau.', function (d) { return d.carreaux; }, 'tir');
  });
  s('fourchettes10', 'Fourchette', 10, 'Faire 10 fourchettes (toucher deux boules).', function (d) { return d.fourchettes; }, 'tir');
  s('reprises50', 'Je reprends tout', 50, 'Reprendre le point 50 fois.', function (d) { return d.reprises; }, 'tir');
  return liste;
})();

MP.succesDe = function (mode) { return MP.SUCCES.filter(function (x) { return !x.mode || x.mode === mode; }); };

// Club : des coéquipiers qui jouent tout seuls. Chaque recrue ajoute de la force au club ; le club
// gagne au plus 3 parties par minute (de moins en moins vite en approchant), chacune valant
// 3 Points × tes multiplicateurs : un bonus à côté de tes lancers, environ un quart de tes gains.
// Le prix monte de 15 % à chaque recrue ; la force d'un rang double à 10, 25, 50, 100… recrues.
MP.CLUB = [
  { id: 'apprenti', noms: { pointage: 'Apprenti pointeur', tir: 'Apprenti tireur' }, force: 1, prix: 25 },
  { id: 'habitue', noms: { pointage: 'Pointeur du dimanche', tir: 'Tireur du dimanche' }, force: 6, prix: 150 },
  { id: 'competiteur', noms: { pointage: 'Pointeur de concours', tir: 'Tireur de concours' }, force: 40, prix: 1500 },
  { id: 'champion', noms: { pointage: 'Champion régional', tir: 'Champion régional' }, force: 250, prix: 20000 },
  { id: 'legende', noms: { pointage: 'Légende du boulodrome', tir: 'Légende du tir' }, force: 1500, prix: 300000 }
];
MP.CLUB_MAX = 3;         // parties gagnées par minute, au plus
MP.CLUB_DEMI = 60;       // force qui donne la moitié du maximum
MP.VALEUR_CLUB = 3;      // Points d'une partie gagnée par le club, avant multiplicateurs
MP.PALIERS_CLUB = [10, 25, 50, 100, 200, 400];

// Ligues : le 2e prestige, au-dessus des saisons. Chaque ligue multiplie tous les gains par 4
// (pour toujours), remet saisons et trophées à zéro, et ouvre un terrain et une boule.
MP.LIGUES = ['Départemental', 'Régional', 'National', 'Mondial'];
MP.nomLigue = function (n) { return n < MP.LIGUES.length ? MP.LIGUES[n] : 'Mondial ★' + (n - MP.LIGUES.length + 2); };
MP.tropheesLigue = function (n) { return 15 * Math.pow(4, n); };   // trophées pour passer de la ligue n à n + 1

MP.EFFETS = [
  { id: 'neutre', nom: 'Neutre', competence: null },
  { id: 'gauche', nom: 'Gauche', competence: 'effetGauche' },
  { id: 'droite', nom: 'Droite', competence: 'effetDroite' },
  { id: 'retro', nom: 'Rétro', competence: 'retro' }
];

// Boules : prix, 5 statistiques, puis affinités pour les 9 techniques (même ordre que MP.TECHNIQUES).
// techniques : celles que la boule permet, en plus de la roulette et du tir roulé (« * » : toutes) ;
// sans la bonne boule, une technique apprise reste fermée. terrains : part de la difficulté du
// terrain qui reste avec cette boule (MP.DIFFICULTE_TERRAIN ; « * » : tous les terrains).
// pour : disciplines où la boule est vendue (chacune achète les siennes).
MP.BOULES = [
  { id: 'classique', nom: 'Classique', prix: 0, precision: 45, puissance: 45, pointage: 45, tir: 45, controle: 45,
    affinites: [0, 0, 0, 0, 0, 0, 0, 0, 0], techniques: [], teinte: 'acier', stries: 2, pour: ['pointage', 'tir'] },
  { id: 'pointeuse', nom: 'Pointeuse', prix: 35, precision: 58, puissance: 38, pointage: 70, tir: 35, controle: 72,
    affinites: [10, 7, 1, -3, 0, -4, -3, -5, -3], techniques: ['demiPortee'], teinte: 'acier', stries: 3, pour: ['pointage'] },
  { id: 'equilibre', nom: 'Équilibre', prix: 90, precision: 62, puissance: 58, pointage: 62, tir: 60, controle: 62,
    affinites: [4, 4, 3, 2, 3, 3, 3, 2, 3], techniques: ['demiPortee', 'rafle'], teinte: 'inox', stries: 1, pour: ['pointage', 'tir'] },
  { id: 'tireuse', nom: 'Tireuse', prix: 170, precision: 55, puissance: 78, pointage: 42, tir: 78, controle: 48,
    affinites: [-3, -2, -4, -5, 5, 8, 12, 10, 12], techniques: ['rafle', 'tirLeve'], teinte: 'carbone', stries: 0, pour: ['tir'] },
  { id: 'tendrePro', nom: 'Tendre Pro', prix: 320, precision: 70, puissance: 64, pointage: 72, tir: 68, controle: 78,
    affinites: [11, 13, 6, 3, 3, 2, 4, 2, 4], techniques: ['demiPortee', 'portee'], teinte: 'acier', stries: 4, pour: ['pointage'] },
  { id: 'sabliere', nom: 'Sablière', prix: 400, precision: 66, puissance: 62, pointage: 68, tir: 64, controle: 70,
    affinites: [2, 4, 4, 0, 0, 4, 0, 0, 2], techniques: ['demiPortee', 'portee', 'rafle', 'tirLeve'], terrains: { sable: 0.4, bordDeMer: 0.4, glaise: 0.45 },
    teinte: 'bronze', stries: 2, pour: ['pointage', 'tir'] },
  { id: 'elite', nom: 'Compétition', prix: 650, precision: 82, puissance: 82, pointage: 82, tir: 82, controle: 82,
    affinites: [6, 6, 6, 6, 6, 6, 6, 6, 6], techniques: ['demiPortee', 'portee', 'rafle', 'tirLeve', 'tirDevant'], teinte: 'inox', stries: 2, pour: ['pointage', 'tir'] },
  { id: 'rocaille', nom: 'Rocaille', prix: 900, precision: 72, puissance: 70, pointage: 72, tir: 72, controle: 70,
    affinites: [0, 3, 5, 6, 0, 0, 3, 3, 3], techniques: ['demiPortee', 'portee', 'plombee', 'tirLeve', 'tirDevant'], terrains: { cailloux: 0.4, paves: 0.4, gravierFin: 0.5, grosGravier: 0.4, bitume: 0.5 },
    teinte: 'carbone', stries: 4, pour: ['pointage', 'tir'] },
  { id: 'roulierPro', nom: 'Roulier Pro', prix: 1200, precision: 86, puissance: 62, pointage: 92, tir: 70, controle: 96,
    affinites: [20, 13, 3, -5, 2, 0, -2, -4, -2], techniques: ['demiPortee', 'portee'], teinte: 'bronze', stries: 3, pour: ['pointage'] },
  { id: 'percuteuse', nom: 'Percuteuse', prix: 1500, precision: 84, puissance: 92, pointage: 60, tir: 90, controle: 60,
    affinites: [-2, -2, -3, -4, 10, 6, 9, 12, 9], techniques: ['rafle', 'tirLeve', 'tirDevant'], teinte: 'carbone', stries: 2, pour: ['tir'] },
  { id: 'hautePortee', nom: 'Haute Portée', prix: 2200, precision: 89, puissance: 70, pointage: 98, tir: 72, controle: 88,
    affinites: [2, 9, 20, 16, 1, -1, 1, 0, 1], techniques: ['demiPortee', 'portee', 'plombee'], teinte: 'inox', stries: 5, pour: ['pointage'] },
  { id: 'impactPro', nom: 'Impact Pro', prix: 3800, precision: 88, puissance: 102, pointage: 68, tir: 100, controle: 62,
    affinites: [-4, -2, -3, -5, 6, 5, 13, 22, 13], techniques: ['tirLeve', 'tirDevant', 'tirAuFer'], teinte: 'carbone', stries: 1, pour: ['tir'] },
  { id: 'toutTerrain', nom: 'Tout-terrain', prix: 4500, precision: 84, puissance: 84, pointage: 86, tir: 86, controle: 84,
    affinites: [4, 4, 4, 4, 4, 4, 4, 4, 4], techniques: '*', terrains: { '*': 0.65 },
    teinte: 'inox', stries: 3, pour: ['pointage', 'tir'] },
  { id: 'rafleExpert', nom: 'Rafle Expert', prix: 6500, precision: 91, puissance: 94, pointage: 72, tir: 106, controle: 72,
    affinites: [0, 1, -1, -2, 8, 24, 10, 4, 10], techniques: ['rafle', 'tirLeve', 'tirDevant'], teinte: 'carbone', stries: 3, pour: ['tir'] },
  { id: 'precisionOr', nom: 'Précision Or', prix: 11000, precision: 104, puissance: 84, pointage: 110, tir: 96, controle: 102,
    affinites: [8, 13, 18, 23, 4, 3, 7, 8, 7], techniques: ['demiPortee', 'portee', 'plombee'], teinte: 'or', stries: 2, pour: ['pointage'] },
  { id: 'carreau120', nom: 'Carreau 120', prix: 18500, precision: 103, puissance: 114, pointage: 74, tir: 120, controle: 70,
    affinites: [-3, -2, -4, -6, 8, 6, 15, 28, 15], techniques: ['tirLeve', 'tirDevant', 'tirAuFer'], teinte: 'bronze', stries: 4, pour: ['tir'] },
  { id: 'maestro120', nom: 'Maestro 120', prix: 26000, precision: 108, puissance: 82, pointage: 120, tir: 88, controle: 114,
    affinites: [14, 18, 24, 30, 2, 0, 3, 4, 3], techniques: ['demiPortee', 'portee', 'plombee'], teinte: 'bronze', stries: 5, pour: ['pointage'] },
  { id: 'legende', nom: 'Légende', prix: 42000, precision: 116, puissance: 108, pointage: 116, tir: 110, controle: 116,
    affinites: [12, 14, 16, 18, 12, 14, 16, 18, 16], techniques: '*', teinte: 'or', stries: 3, pour: ['pointage', 'tir'] },
  // Boules de ligue : vendues seulement à partir de la ligue indiquée.
  { id: 'regionale', nom: 'Régionale', prix: 250000, ligue: 1, precision: 124, puissance: 116, pointage: 124, tir: 120, controle: 124,
    affinites: [15, 16, 18, 20, 15, 16, 18, 20, 18], techniques: '*', teinte: 'inox', stries: 4, pour: ['pointage', 'tir'] },
  { id: 'tricolore', nom: 'Tricolore', prix: 5000000, ligue: 2, precision: 134, puissance: 126, pointage: 134, tir: 130, controle: 134,
    affinites: [18, 20, 22, 24, 18, 20, 22, 24, 22], techniques: '*', teinte: 'bronze', stries: 3, pour: ['pointage', 'tir'] },
  { id: 'mondiale', nom: 'Mondiale', prix: 100000000, ligue: 3, precision: 146, puissance: 138, pointage: 146, tir: 142, controle: 146,
    affinites: [22, 24, 26, 28, 22, 24, 26, 28, 26], techniques: '*', teinte: 'or', stries: 5, pour: ['pointage', 'tir'] },
  // Boules d'élite : jamais vendues, offertes au sommet de la Montagne de leur discipline. Toutes les
  // techniques, les meilleures qualités du jeu, et tous les Points de la discipline ×2 (bonusPoints).
  { id: 'elitePointeur', nom: 'Élite du Pointeur', prix: 0, sommet: 'pointage', precision: 162, puissance: 150, pointage: 166, tir: 120, controle: 166,
    affinites: [28, 30, 32, 34, 8, 8, 8, 8, 8], techniques: '*', terrains: { '*': 0.55 }, bonusPoints: 2, teinte: 'edelweiss', stries: 4, pour: ['pointage'] },
  { id: 'eliteTireur', nom: 'Élite du Tireur', prix: 0, sommet: 'tir', precision: 162, puissance: 166, pointage: 120, tir: 166, controle: 150,
    affinites: [8, 8, 8, 8, 28, 30, 32, 36, 32], techniques: '*', terrains: { '*': 0.55 }, bonusPoints: 2, teinte: 'glacier', stries: 4, pour: ['tir'] }
];

// Couleurs de tes boules (toutes, au pointage comme au tir) : à acheter avec des Points (ceux de la
// discipline affichée), ou à gagner dans la Montagne. « boule » : la couleur propre de chaque boule.
// Elles restent claires : l'anneau sous ta boule la distingue toujours de la boule à toucher.
// Ni violet ni bleu pastel : le violet est réservé aux boules à toucher, le bleu pastel aux autres
// boules adverses (les anciennes « Lavande » et « Ciel » sont retirées et remboursées, voir MP.reparerEtat).
MP.COULEURS = [
  { id: 'boule', nom: 'Couleur de la boule', prix: 0 },
  // Finitions de vraies boules de pétanque.
  { id: 'satine', nom: 'Inox satiné', prix: 800 },
  { id: 'chrome', nom: 'Chromée', prix: 1000 },
  { id: 'bronzeVieilli', nom: 'Bronze vieilli', prix: 2500 },
  { id: 'carboneNoir', nom: 'Carbone noir', prix: 3500 },
  { id: 'bleui', nom: 'Acier bleui', prix: 3500 },
  // Couleurs.
  { id: 'rose', nom: 'Rosé', prix: 900 },
  { id: 'menthe', nom: 'Menthe', prix: 900 },
  { id: 'peche', nom: 'Pêche', prix: 2500 },
  { id: 'cuivre', nom: 'Cuivre', prix: 6000 },
  { id: 'turquoise', nom: 'Turquoise', prix: 700 },
  { id: 'corail', nom: 'Corail', prix: 1200 },
  { id: 'bleuRoi', nom: 'Bleu roi', prix: 1500 },
  { id: 'framboise', nom: 'Framboise', prix: 1800 },
  { id: 'bleuNuit', nom: 'Bleu nuit', prix: 2500 },
  { id: 'sapin', nom: 'Vert sapin', prix: 2500 },
  { id: 'anthracite', nom: 'Anthracite', prix: 4000 },
  { id: 'sable', nom: 'Sable', prix: 1000 },
  { id: 'rouge', nom: 'Rouge', prix: 1500 },
  { id: 'mandarine', nom: 'Mandarine', prix: 1500 },
  { id: 'ivoire', nom: 'Ivoire', prix: 2000 },
  { id: 'olive', nom: 'Olive', prix: 2000 },
  { id: 'emeraude', nom: 'Émeraude', prix: 2500 },
  { id: 'bordeaux', nom: 'Bordeaux', prix: 3000 },
  { id: 'chocolat', nom: 'Chocolat', prix: 3000 },
  // Motifs : ils tournent avec la boule quand elle roule.
  { id: 'mariniere', nom: 'Marinière', prix: 5000 },
  { id: 'poisCorail', nom: 'Pois corail', prix: 5000 },
  { id: 'poisNoirs', nom: 'Pois noirs', prix: 5000 },
  { id: 'coeurs', nom: 'Cœurs', prix: 6000 },
  { id: 'vagues', nom: 'Vagues', prix: 7000 },
  { id: 'tricolore', nom: 'Tricolore', prix: 8000 },
  { id: 'zebre', nom: 'Zèbre', prix: 8000 },
  { id: 'etoilee', nom: 'Nuit étoilée', prix: 9000 },
  { id: 'feuilles', nom: 'Feuilles de hêtre', prix: 10000 },
  { id: 'damier', nom: 'Damier', prix: 12000 },
  { id: 'nacre', nom: 'Nacre', gagnee: 'Atteindre l’étape 6 d’une Montagne' },
  { id: 'edelweiss', nom: 'Edelweiss', gagnee: 'Sommet de la Montagne du pointage' },
  { id: 'glacier', nom: 'Glacier', gagnee: 'Sommet de la Montagne du tir' }
];

// Couleur de la gravure de tes initiales, comme les encres qu'on fait mettre sur de vraies boules.
// encre : couleur des lettres (null : la gravure d'origine, foncée, juste creusée dans le métal).
MP.GRAVURES = [
  { id: 'classique', nom: 'Gravure simple', encre: null, prix: 0 },
  { id: 'blanche', nom: 'Blanche', encre: 'rgba(255,255,255,0.95)', prix: 200 },
  { id: 'noire', nom: 'Noire', encre: 'rgba(18,18,22,0.9)', prix: 200 },
  { id: 'rouge', nom: 'Rouge', encre: 'rgba(200,38,46,0.95)', prix: 400 },
  { id: 'marine', nom: 'Bleu marine', encre: 'rgba(24,40,96,0.95)', prix: 400 },
  { id: 'verte', nom: 'Verte', encre: 'rgba(30,112,68,0.95)', prix: 400 },
  { id: 'rose', nom: 'Rose', encre: 'rgba(222,92,142,0.95)', prix: 600 },
  { id: 'cuivree', nom: 'Cuivrée', encre: 'rgba(184,104,52,0.98)', prix: 800 },
  { id: 'argentee', nom: 'Argentée', encre: 'rgba(232,236,240,0.98)', prix: 1000 }
];

// Police de la gravure : poids, famille et taille relative des lettres (echelle).
MP.POLICES = [
  { id: 'ronde', nom: 'Ronde', poids: 800, famille: 'Nunito, system-ui, sans-serif', echelle: 1, prix: 0 },
  { id: 'fine', nom: 'Fine', poids: 300, famille: 'Nunito, system-ui, sans-serif', echelle: 1, prix: 200 },
  { id: 'classique', nom: 'Classique', poids: 700, famille: '"Cormorant Garamond", Georgia, serif', echelle: 1.15, prix: 400 },
  { id: 'manuscrite', nom: 'Manuscrite', poids: 700, famille: '"Dancing Script", cursive', echelle: 1.2, prix: 600 },
  { id: 'machine', nom: 'Machine à écrire', poids: 700, famille: '"Courier New", Courier, monospace', echelle: 0.95, prix: 600 }
];

// Stries de tes boules (les rainures gravées) : « boule » garde celles du modèle. n : nombre de
// stries ; fines : rainures plus fines et serrées ; croisees : une seconde série en travers ;
// tressees : stries épaisses et fines en alternance.
MP.STRIES = [
  { id: 'boule', nom: 'Celles de la boule', prix: 0 },
  { id: 'lisse', nom: 'Lisse', n: 0, prix: 300 },
  { id: 'une', nom: '1 strie', n: 1, prix: 300 },
  { id: 'deux', nom: '2 stries', n: 2, prix: 300 },
  { id: 'trois', nom: '3 stries', n: 3, prix: 500 },
  { id: 'quatre', nom: '4 stries', n: 4, prix: 800 },
  { id: 'fines', nom: 'Fines', n: 7, fines: true, prix: 1500 },
  { id: 'croisees', nom: 'Croisées', n: 2, croisees: true, prix: 2500 },
  { id: 'tressees', nom: 'Tressées', n: 5, tressees: true, prix: 4000 },
  { id: 'quadrillees', nom: 'Quadrillées', n: 4, fines: true, croisees: true, prix: 6000 }
];

// La Montagne : 10 étapes, toujours les mêmes, chacune avec sa technique imposée. 3 boules par étape :
// une boule dans la zone (pointage) ou sur la cible (tir) et tu montes ; les 3 ratées, tu redescends
// tout en bas. Au sommet, la boule d'élite de la discipline. Champs : technique, terrain, distance
// visée (m), rayon de la zone (pointage), embûches (de plus en plus nombreuses : voir
// MP.reliefMontagne), et au tir : voisines autour de la cible, serre (jour entre elles et la cible, m),
// devant (boule devant la cible), carreau (exigé).
MP.MONTAGNE_BOULES = 3;
MP.MONTAGNES = {
  pointage: [
    { nom: 'Le pied', technique: 'roulette', terrain: 'boulodrome', distance: 6, rayon: 0.15, embuches: ['devers'] },
    { nom: 'Le sentier', technique: 'portee', terrain: 'grosGravier', distance: 6.2, rayon: 0.11, embuches: ['descente', 'bosse'] },
    { nom: 'Le raidillon', technique: 'roulette', terrain: 'bitume', distance: 6.5, rayon: 0.12, embuches: ['devers', 'cuvette'] },
    { nom: 'Le pierrier', technique: 'plombee', terrain: 'sable', distance: 6.5, rayon: 0.11, embuches: ['devers', 'boue', 'trou'] },
    { nom: 'Le col du vent', technique: 'portee', terrain: 'glaise', distance: 6.8, rayon: 0.08, embuches: ['devers', 'bosse', 'racine'] },
    { nom: 'La moraine', technique: 'demiPortee', terrain: 'gravierFin', distance: 7, rayon: 0.11, embuches: ['montee', 'cuvette', 'boue', 'trou'] },
    { nom: 'Le refuge', technique: 'plombee', terrain: 'expert', distance: 7.4, rayon: 0.07, embuches: ['devers', 'cuvetteZone', 'racine'] },
    { nom: 'Le glacier', technique: 'demiPortee', terrain: 'mixte', distance: 7.4, rayon: 0.06, embuches: ['descente', 'devers2', 'bosse', 'trou'] },
    { nom: 'L’arête', technique: 'demiPortee', terrain: 'cailloux', distance: 7.8, rayon: 0.09, embuches: ['devers', 'racine', 'cuvette', 'boue', 'trou'] },
    { nom: 'Le sommet', technique: 'roulette', terrain: 'pente', distance: 6.5, rayon: 0.09, embuches: ['devers', 'bosse', 'cuvetteZone', 'racine'] }
  ],
  tir: [
    { nom: 'Le pied', technique: 'tirSimple', terrain: 'boulodrome', distance: 5.5, voisines: 0, embuches: ['devers'] },
    { nom: 'Le sentier', technique: 'tirLeve', terrain: 'pente', distance: 6, voisines: 1, serre: 0.25, devant: true, embuches: [] },
    { nom: 'Le raidillon', technique: 'rafle', terrain: 'gravierFin', distance: 5.6, voisines: 1, serre: 0.2, embuches: ['devers'] },
    { nom: 'Le pierrier', technique: 'tirDevant', terrain: 'sable', distance: 6.5, voisines: 2, serre: 0.18, devant: true, embuches: ['boue'] },
    { nom: 'Le col du vent', technique: 'tirLeve', terrain: 'cailloux', distance: 6.6, voisines: 2, serre: 0.16, embuches: ['devers'] },
    { nom: 'La moraine', technique: 'rafle', terrain: 'bitume', distance: 6.8, voisines: 2, serre: 0.14, embuches: ['devers', 'cuvette', 'racine'] },
    // zone : après le choc, ta boule doit finir dans l'ovale dessiné à côté de la cible (MP.zoneApresChoc).
    { nom: 'Le refuge', technique: 'tirAuFer', terrain: 'gravierFin', distance: 6.5, voisines: 1, serre: 0.2, zone: true, embuches: ['devers'] },
    { nom: 'Le glacier', technique: 'tirDevant', terrain: 'grosGravier', distance: 6.8, voisines: 2, serre: 0.12, embuches: ['bosse', 'devers'] },
    { nom: 'L’arête', technique: 'tirAuFer', terrain: 'mixte', distance: 6.8, voisines: 2, serre: 0.16, zone: true, embuches: ['devers'] },
    { nom: 'Le sommet', technique: 'tirAuFer', terrain: 'expert', distance: 8, voisines: 0, carreau: true, embuches: ['devers', 'cuvetteZone'] }
  ]
};


// Terrains : tirés au hasard avec chaque niveau ; les plus durs arrivent quand tu progresses (cote).
// rebond : part de la vitesse verticale gardée à l'impact ; amorti : part de la vitesse
// horizontale gardée en touchant le sol ; irregulier : déviations du sol ;
// frottement : freinage en roulant (m/s²).
// Certaines techniques sont bien plus dures sur certains terrains : l'imprécision du lancer y est
// multipliée. Les cailloux et le sable gâchent les lancers qui roulent ; les pavés, durs, font
// rebondir les lancers en l'air ; le bord de mer est mou et venteux.
MP.DIFFICULTE_TERRAIN = {
  gravierFin: { rafle: 1.3, tirSimple: 1.2, roulette: 1.15 },
  cailloux: { roulette: 1.8, tirSimple: 1.9, rafle: 2.4, demiPortee: 1.5 },
  sable: { roulette: 2.0, tirSimple: 2.2, rafle: 1.6, demiPortee: 1.3 },
  mixte: { roulette: 1.4, tirSimple: 1.5, rafle: 1.6, demiPortee: 1.3, portee: 1.15 },
  expert: { roulette: 1.7, tirSimple: 1.8, rafle: 2.0, demiPortee: 1.5, portee: 1.3, tirLeve: 1.2 },
  terreBattue: { tirLeve: 1.4, tirDevant: 1.3, demiPortee: 1.3 },
  bordDeMer: { roulette: 1.9, tirSimple: 2.0, rafle: 1.5, portee: 1.25, tirLeve: 1.25 },
  paves: { plombee: 2.2, portee: 1.8, demiPortee: 1.5, tirLeve: 1.7, tirDevant: 1.6, tirAuFer: 1.3 },
  grosGravier: { roulette: 2.2, tirSimple: 2.3, rafle: 2.8, demiPortee: 1.7, portee: 1.2 },
  bitume: { plombee: 2.4, portee: 2.0, demiPortee: 1.6, tirLeve: 1.8, tirDevant: 1.8, tirAuFer: 1.4 },
  glaise: { roulette: 2.4, tirSimple: 2.5, rafle: 2.2, demiPortee: 1.6 },
  pente: { roulette: 1.4, tirSimple: 1.4, rafle: 1.3, demiPortee: 1.2 }
};
MP.difficulteTerrain = function (idTerrain, idTechnique) {
  var t = MP.DIFFICULTE_TERRAIN[idTerrain];
  return (t && t[idTechnique]) || 1;
};

MP.TERRAINS = [
  { id: 'boulodrome', nom: 'Boulodrome', cote: 0, rebond: 0.13, amorti: 1.00, irregulier: 0.015, frottement: 1.20,
    sol: ['#ecdcc2', '#ddc7a6', '#f6ecdc'], grain: 0.6, bordure: 'bois', desc: 'Sol damé et régulier.' },
  { id: 'gravierFin', nom: 'Gravier fin', cote: 3, rebond: 0.10, amorti: 0.94, irregulier: 0.045, frottement: 1.40,
    sol: ['#e4dde2', '#d1c8d3', '#f1ecf1'], grain: 1.0, bordure: 'bois', desc: 'Roule un peu moins, dévie un peu.' },
  { id: 'cailloux', nom: 'Cailloux', cote: 6, rebond: 0.18, amorti: 0.90, irregulier: 0.12, frottement: 1.58,
    sol: ['#ddd6dc', '#c8bfca', '#eee9ee'], grain: 1.8, bordure: 'pierre', desc: 'Rebonds et déviations.' },
  { id: 'sable', nom: 'Sable', cote: 9, rebond: 0.035, amorti: 0.58, irregulier: 0.025, frottement: 2.05,
    sol: ['#f4e5bf', '#e8d3a3', '#fbf2db'], grain: 0.4, bordure: 'bois', desc: 'Freine beaucoup : il faut lancer fort.' },
  { id: 'mixte', nom: 'Terrain mixte', cote: 12, rebond: 0.11, amorti: 0.82, irregulier: 0.10, frottement: 1.56,
    sol: ['#e9dac8', '#d8c4ad', '#f4eadd'], grain: 1.4, bordure: 'pierre', desc: 'Un peu de tout : imprévisible.' },
  { id: 'expert', nom: 'Terrain expert', cote: 15, rebond: 0.16, amorti: 0.86, irregulier: 0.16, frottement: 1.76,
    sol: ['#dfd3c6', '#cbbcab', '#ece4da'], grain: 2.0, bordure: 'pierre', desc: 'Le plus dur, le mieux payé.' },
  // Terrains de ligue : ils n'apparaissent qu'à partir de la ligue indiquée.
  { id: 'terreBattue', nom: 'Terre battue', cote: 4, ligue: 1, rebond: 0.08, amorti: 0.9, irregulier: 0.05, frottement: 1.3,
    sol: ['#ecd3c2', '#ddb9a3', '#f6e6da'], grain: 0.8, bordure: 'bois', desc: 'Terre ocre et souple : roule bien, dévie un peu.' },
  { id: 'bordDeMer', nom: 'Bord de mer', cote: 8, ligue: 2, rebond: 0.03, amorti: 0.6, irregulier: 0.06, frottement: 1.9,
    sol: ['#e5dfcf', '#d2c8b0', '#f1ece1'], grain: 1.2, bordure: 'bois', desc: 'Sable mouillé et coquillages : freine et dévie.' },
  { id: 'paves', nom: 'Pavés', cote: 13, ligue: 3, rebond: 0.22, amorti: 0.85, irregulier: 0.2, frottement: 1.5,
    sol: ['#dcd8dd', '#c3bdc6', '#eceaee'], grain: 2.2, bordure: 'pierre', desc: 'Vieux pavés : rebonds et déviations partout.' },
  // Terrains difficiles, plus haut dans les paliers (en fin de liste : les pistes sauvegardées gardent le leur).
  { id: 'grosGravier', nom: 'Gros gravier', cote: 10, rebond: 0.2, amorti: 0.86, irregulier: 0.24, frottement: 1.75,
    sol: ['#d8d2d6', '#bfb6be', '#ebe7ea'], grain: 2.6, caillou: 0.028, bordure: 'pierre', desc: 'Gros cailloux roulants : tout ce qui roule dévie fort.' },
  { id: 'bitume', nom: 'Bitume', cote: 11, rebond: 0.32, amorti: 0.97, irregulier: 0.01, frottement: 0.85,
    sol: ['#cfcbd4', '#b8b3c0', '#e2dfe6'], grain: 0.3, bordure: 'pierre', desc: 'Dur et rapide : ça roule loin et ça rebondit.' },
  { id: 'glaise', nom: 'Terre glaise mouillée', cote: 13, rebond: 0.01, amorti: 0.32, irregulier: 0.04, frottement: 2.9,
    sol: ['#d9bfa6', '#c4a284', '#e8d6c2'], grain: 0.5, bordure: 'bois', desc: 'Colle et freine énormément : une boule en l’air s’y plante.' },
  { id: 'pente', nom: 'Terrain en pente', cote: 14, formes: true, rebond: 0.12, amorti: 0.92, irregulier: 0.04, frottement: 1.35,
    sol: ['#e3dcc4', '#cfc5a6', '#efe9d8'], grain: 0.9, bordure: 'bois', desc: 'Des pentes partout, surtout d’un côté, des petites pentes raides et des dos d’âne : lis le terrain.' }
];

MP.trouver = function (liste, id) {
  for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
  return null;
};
