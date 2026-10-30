// Ma Pétanque — niveaux tirés au hasard, lancers (au glissé ou en l'air) et résultat.
'use strict';
var MP = window.MP || (window.MP = {});

// Écart minimum entre deux objets posés au départ : ils ne se touchent jamais,
// et il reste au moins 2 cm de jour entre eux.
MP.JOUR_MINIMUM = 0.02;

// Taille des objets du niveau en cours de création (voir MP.tailleObjets) : 1 hors création.
MP.tailleEnCours = 1;
MP.rayonObjet = function (type) {
  return (type === 'cochonnet' ? MP.MESURES.rayonCochonnet : MP.MESURES.rayonBoule) * MP.tailleEnCours;
};

MP.ecartMinimum = function (typeA, typeB) {
  return MP.rayonObjet(typeA) + MP.rayonObjet(typeB) + MP.JOUR_MINIMUM * MP.tailleEnCours;
};

// Vérifie qu'aucun objet n'en touche un autre ni ne sort du terrain.
MP.positionsValides = function (objets) {
  var M = MP.MESURES;
  for (var i = 0; i < objets.length; i++) {
    var a = objets[i];
    var ra = MP.rayonObjet(a.type);
    if (Math.abs(a.x) > M.largeurTerrain / 2 - ra - 0.1 || a.z < 2 || a.z > M.longueurTerrain - 1) return false;
    for (var j = i + 1; j < objets.length; j++) {
      var b = objets[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) < MP.ecartMinimum(a.type, b.type) - 1e-9) return false;
    }
  }
  return true;
};

function libre(objets, type, x, z) {
  for (var i = 0; i < objets.length; i++) {
    if (Math.hypot(objets[i].x - x, objets[i].z - z) < MP.ecartMinimum(objets[i].type, type)) return false;
  }
  return true;
}

// Place un objet au hasard dans une zone, sans toucher ceux déjà posés.
// Essaie d'abord la zone demandée, puis l'élargit petit à petit.
MP.placer = function (alea, objets, type, zone) {
  var M = MP.MESURES;
  var r = MP.rayonObjet(type);
  var bordX = M.largeurTerrain / 2 - r - 0.12;
  for (var essai = 0; essai < 400; essai++) {
    var elargi = 1 + Math.floor(essai / 80) * 0.35;
    var angle = alea.entre(zone.angleMin != null ? zone.angleMin : 0, zone.angleMax != null ? zone.angleMax : Math.PI * 2);
    var dist = alea.entre(zone.distMin, zone.distMax * elargi);
    var x = zone.cx + Math.sin(angle) * dist;
    var z = zone.cz + Math.cos(angle) * dist;
    if (Math.abs(x) > bordX || z < 2.2 || z > M.longueurTerrain - 1.2) continue;
    if (libre(objets, type, x, z)) { var o = { type: type, x: x, z: z }; objets.push(o); return o; }
  }
  return null;
};

// Ligne de boules en travers du chemin, à « recul » mètres devant le point visé : les boules
// sont à 2 cm l'une de l'autre, une boule qui roule ne peut pas passer entre elles.
MP.placerLigne = function (objets, cible, recul, nombre, camp) {
  var dirX = cible.x, dirZ = cible.z - 0.3, n = Math.hypot(dirX, dirZ);
  dirX /= n; dirZ /= n;
  var cx = cible.x - dirX * recul, cz = cible.z - dirZ * recul;
  var pas = MP.ecartMinimum('boule', 'boule') + 0.001;
  var poses = 0;
  for (var k = 0; k < nombre; k++) {
    var decal = (k - (nombre - 1) / 2) * pas;
    var x = cx + dirZ * decal, z = cz - dirX * decal;
    if (Math.abs(x) > MP.MESURES.largeurTerrain / 2 - 0.16 || !libre(objets, 'boule', x, z)) continue;
    objets.push({ type: 'boule', x: x, z: z, camp: camp || 'adverse' });
    poses++;
  }
  return poses;
};

// ---------- Tirage d'un niveau ----------
// La difficulté visée dépend du palier du joueur, avec beaucoup de hasard : la plupart des
// niveaux sont à sa mesure, certains sont trop durs tant qu'il n'a pas les bons lancers.

// piste et relief (facultatifs) : le terrain de la piste en cours, et ses accidents à éviter
// pour poser le cochonnet et les boules.
// joueur (facultatif) : { portee, vol } — ce que le joueur peut atteindre ; voir MP.adapterAuJoueur.
MP.creerNiveau = function (mode, palier, graine, ligue, piste, relief, joueur) {
  try { return creerNiveau(mode, palier, graine, ligue, piste, relief, joueur); } finally { MP.tailleEnCours = 1; }
};
function creerNiveau(mode, palier, graine, ligue, piste, relief, joueur) {
  for (var k = 0; k < 60; k++) {
    var n = MP.tirerNiveau(mode, palier, (graine + k * 7919) >>> 0, ligue || 0, piste, joueur);
    if (n && joueur) MP.adapterAuJoueur(n, joueur);
    if (!n || !MP.positionsValides(n.objets)) continue;
    // Le cochonnet évite les pentes raides (sauf si vraiment rien d'autre ne va).
    if (relief && !n.objets.every(function (o) { return relief.placeLibre(o.x, o.z, MP.rayonObjet(o.type), o.type === 'cochonnet' && k < 45); })) continue;
    if (relief) {
      n.difficulte += relief.difficulte();
      n.etoiles = Math.max(1, Math.min(5, 1 + Math.floor(n.difficulte / 3)));
    }
    n.graine = graine;
    return n;
  }
  throw new Error('Niveau impossible à créer');
}

// Terrain tiré selon la difficulté visée : les plus durs n'apparaissent qu'avec la cote, ceux de ligue
// qu'à partir de leur ligue. Un peu plus d'une fois sur deux, le plus dur possible.
MP.choisirTerrain = function (alea, vise, ligue) {
  var possibles = MP.TERRAINS.filter(function (t) { return t.cote <= vise + 1 && (t.ligue || 0) <= (ligue || 0); })
    .sort(function (a, b) { return a.cote - b.cote; });
  return alea.suivant() < 0.55 ? possibles[possibles.length - 1] : possibles[Math.floor(alea.suivant() * possibles.length)];
};

MP.tirerNiveau = function (mode, palier, graine, ligue, piste, joueur) {
  var alea = new MP.Aleatoire(graine);
  var u = alea.suivant();
  // Difficulté visée : de 0 (très facile) à environ 20, autour de 0,85 par palier ;
  // un niveau sur dix est un « défi » nettement plus dur.
  var base = (Math.max(1, palier) - 1) * 0.85;
  var vise = u < 0.1 ? base + alea.entre(3, 5) : Math.max(0, base * alea.entre(0.6, 1.2) + alea.entre(-0.4, 1.2));
  var dore = alea.suivant() < 1 / 12;
  var traits = [];
  var objets = [];
  // Ligne de boules qu'on ne franchit qu'en l'air : marquée, pour l'ôter à qui n'a pas de technique en l'air.
  var ligne = null;
  function marquerLigne(depuis, trait, pts) { for (var q = depuis; q < objets.length; q++) objets[q].ligne = true; ligne = { trait: trait, points: pts }; }
  // Terrain : celui de la piste en cours, sinon tiré selon la difficulté.
  var terrain = piste ? MP.TERRAINS[piste.terrain] : MP.choisirTerrain(alea, vise, ligue);
  var iTerrain = MP.TERRAINS.indexOf(terrain);
  // Distance du but : de 4,5 m (facile) jusqu'à 10 m.
  var distance = Math.min(10, 4.5 + Math.max(0, vise) * 0.32 + alea.entre(-0.6, 1.2));
  distance = Math.max(4.5, distance);
  // Jamais plus loin que ce que le joueur peut atteindre avec ses techniques sur ce terrain (au tir,
  // la cible peut être un peu derrière le cochonnet).
  var atteint = joueur ? joueur.portee - (mode === 'tir' ? 0.65 : 0.15) : Infinity;
  if (atteint > 3.5) distance = Math.min(distance, atteint);
  MP.tailleEnCours = MP.tailleObjets(distance);
  var cochonnet = { type: 'cochonnet', x: alea.entre(-0.8, 0.8), z: distance };
  objets.push(cochonnet);
  var c = cochonnet, i, points = 0, nombreBoules = 1;
  // Niveaux à plusieurs boules, tirés à part pour ne rien changer aux autres niveaux.
  var plus = new MP.Aleatoire((graine ^ 0x51ed27) >>> 0);
  points += (distance - 4.5) * 0.9 + terrain.cote * 0.25;
  if (distance > 7.5) traits.push('But lointain');

  if (mode === 'pointage') {
    // Objectif principal : battre la (ou les) boule(s) adverse(s). Il y en a toujours au moins une.
    var adverses = Math.min(4, 1 + Math.floor(alea.entre(0, 0.6 + vise / 3)));
    var meilleur = Math.max(0.04, 0.45 * Math.pow(0.88, vise) * alea.entre(0.8, 1.2));
    MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: meilleur * 0.85, distMax: meilleur });
    for (i = 1; i < adverses; i++) MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: meilleur + 0.05, distMax: meilleur + 0.5 });
    traits.push(adverses > 1 ? adverses + ' boules à battre' : '1 boule à battre');
    points += adverses * 0.6 + (0.45 - meilleur) * 12;
    // Obstacles : une boule devant, ou une ligne qu'on ne peut franchir qu'en l'air.
    var o = alea.suivant();
    if (vise >= 4 && o < Math.min(0.4, 0.05 * vise)) {
      var nombre = 5 + Math.floor(alea.entre(0, 1 + vise / 4)), avantLigne = objets.length;
      if (MP.placerLigne(objets, c, alea.entre(0.9, 2.2), Math.min(11, nombre)) >= 4) { traits.push('Ligne de boules devant'); points += 4; marquerLigne(avantLigne, 'Ligne de boules devant', 4); }
    } else if (vise >= 2 && o < 0.55) {
      var recul = alea.entre(0.4, 1.4);
      if (MP.placer(alea, objets, 'boule', { cx: c.x * (1 - recul / c.z), cz: c.z - recul, distMin: 0, distMax: 0.08 })) { traits.push('Boule devant'); points += 1.5; }
    }
    // Point très dur : une boule collée au cochonnet ; tu as 3 boules pour reprendre le point.
    if (vise >= 6 && plus.suivant() < Math.min(0.22, 0.02 * vise)) {
      var colle = MP.rayonObjet('boule') + MP.rayonObjet('cochonnet');
      if (MP.placer(plus, objets, 'boule', { cx: c.x, cz: c.z, distMin: colle + 0.005, distMax: colle + 0.03 })) {
        traits.push('Point très dur : 3 boules pour le reprendre'); points += 3; nombreBoules = 3;
      }
    }
    objets.forEach(function (ob) { if (ob.type === 'boule') ob.camp = 'adverse'; });
    return finir({ mode: mode, objets: objets, cible: null });
  }

  // Tir : la cible est tout près du cochonnet, les voisines l'entourent sans la toucher.
  var cible = MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: 0.08, distMax: 0.3,
    angleMin: Math.PI * 0.55, angleMax: Math.PI * 1.45 }) || MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: 0.08, distMax: 0.5 });
  if (!cible) return null;
  cible.camp = 'cible';
  var voisines = vise < 1 ? 0 : Math.min(5, Math.floor(alea.entre(0, 1 + vise / 2.5)));
  var serre = Math.max(0.05, 0.3 * Math.pow(0.9, vise) * alea.entre(0.8, 1.2));
  var jour = MP.rayonObjet('boule') * 2 + serre;
  for (i = 0; i < voisines; i++) {
    var v = MP.placer(alea, objets, 'boule', { cx: cible.x, cz: cible.z, distMin: jour, distMax: jour + 0.3 });
    if (v) v.camp = 'adverse';
  }
  if (voisines) { traits.push(voisines + (voisines > 1 ? ' boules autour' : ' boule autour')); points += voisines * 0.7 + (0.3 - serre) * 10; }
  else traits.push('Cible seule');
  var ob2 = alea.suivant();
  if (vise >= 3 && ob2 < Math.min(0.45, 0.06 * vise)) {
    // Boules devant la cible : il faut passer par-dessus (tir devant ou au fer).
    var n2 = 1 + Math.floor(alea.entre(0, Math.min(4, vise / 3))), avant2 = objets.length;
    if (MP.placerLigne(objets, cible, alea.entre(0.5, 1.4), n2) >= 1) {
      var t2 = n2 > 1 ? 'Boules devant la cible' : 'Boule devant la cible';
      traits.push(t2); points += 3 + n2 * 0.5; marquerLigne(avant2, t2, 3 + n2 * 0.5);
    }
  }
  // Deux boules à toucher : une boule par cible.
  var cibles = [objets.indexOf(cible)];
  if (vise >= 5 && plus.suivant() < Math.min(0.3, 0.03 * vise)) {
    var seconde = MP.placer(plus, objets, 'boule', { cx: c.x, cz: c.z, distMin: 0.25, distMax: 0.6 });
    if (seconde) { seconde.camp = 'cible'; cibles.push(objets.indexOf(seconde)); traits.push('2 boules à toucher'); points += 3; nombreBoules = 2; }
  }
  objets.forEach(function (ob) { if (ob.type === 'boule' && !ob.camp) ob.camp = 'adverse'; });
  return finir({ mode: mode, objets: objets, cible: objets.indexOf(cible), cibles: cibles });

  function finir(n) {
    n.boules = nombreBoules;   // boules à lancer dans ce niveau
    // Pas de vent : ce sont les formes du terrain qui dévient les boules.
    n.vent = null;
    n.taille = MP.tailleEnCours;
    n.dore = dore;
    if (dore) traits.unshift('Niveau doré ×3');
    n.terrain = iTerrain;
    n.traits = traits;
    n.difficulte = points;
    n.etoiles = Math.max(1, Math.min(5, 1 + Math.floor(points / 3)));
    n.defi = MP.tirerDefi(mode, n.etoiles, vise, n.objets.length, alea);
    if (n.defi.id === 'zone') placerZoneDefi(n, [n.defi.cote, -n.defi.cote]);
    n.ligne = ligne;
    return n;
  }
};

// Plus de niveau perdu d'avance : le but n'est jamais posé hors de portée de toutes les techniques du
// joueur sur ce terrain (voir tirerNiveau), et sans technique en l'air, pas de ligne de boules qu'on
// ne franchit qu'en l'air. Les niveaux atteignables ne changent pas.
MP.porteeJoueur = function (d, boule, mode, terrain) {
  var max = 0;
  MP.TECHNIQUES.forEach(function (t) {
    if (t.mode === mode && MP.techniqueJouable(d, t.id, boule)) max = Math.max(max, MP.porteeTerrain(d, boule, t.id, terrain));
  });
  return max;
};
MP.volJouable = function (d, boule, mode) {
  return MP.TECHNIQUES.some(function (t) { return t.mode === mode && t.famille === 'vol' && MP.techniqueJouable(d, t.id, boule); });
};
// Défi de zone : du côté demandé si rien n'y est posé, sinon de l'autre ; sinon un autre défi.
// cotes : les côtés possibles, dans l'ordre de préférence.
function placerZoneDefi(n, cotes) {
  var cible = n.objets[n.cible];
  for (var i = 0; i < cotes.length; i++) {
    var z = MP.zoneApresChoc(cible, cotes[i]);
    if (cotes.indexOf(z.cote) < 0) continue;   // repoussée de l'autre côté par la bordure
    if (n.objets.some(function (o) { return o !== cible && MP.dansZone(z, o.x, o.z); })) continue;
    n.defi.zone = z; n.defi.cote = z.cote; n.defi.texte = MP.texteZone(z);
    return;
  }
  n.defi = { id: 'pres', texte: 'Ta boule finit à moins de 40 cm de la place de la cible', gain: 2 + Math.floor(n.etoiles / 2) };
}
MP.adapterAuJoueur = function (n, joueur) {
  // Défi de zone : du côté d'un effet que le joueur a ; sans effet du tout, un autre défi.
  var ef = joueur.effets;
  if (n.defi && n.defi.id === 'zone' && ef) placerZoneDefi(n, [n.defi.cote, -n.defi.cote].filter(function (c) { return c > 0 ? ef.droite : ef.gauche; }));
  if (!joueur.vol && n.ligne) {
    var garde = [], index = {};
    n.objets.forEach(function (o, i) { if (!o.ligne) { index[i] = garde.length; garde.push(o); } });
    n.objets = garde;
    if (n.cible != null) n.cible = index[n.cible];
    if (n.cibles) n.cibles = n.cibles.map(function (i) { return index[i]; });
    n.traits = n.traits.filter(function (t) { return t !== n.ligne.trait; });
    n.difficulte -= n.ligne.points;
    n.etoiles = Math.max(1, Math.min(5, 1 + Math.floor(n.difficulte / 3)));
    n.ligne = null;
  }
};

// ---------- Mode libre : niveaux mixtes ----------
// Une boule adverse tient le point, collée au cochonnet, parfois avec une boule devant : tu as deux
// boules (trois quand c'est très serré) pour le reprendre, en tirant celle qui gêne puis en pointant,
// ou l'inverse, avec les techniques des deux disciplines. On gagne si, à la fin, ta meilleure boule
// est la plus près.
MP.creerMixte = function (palier, graine, ligue) {
  try {
    for (var k = 0; k < 60; k++) {
      var n = tirerMixte(palier, (graine + k * 7919) >>> 0, ligue || 0);
      if (n && MP.positionsValides(n.objets)) { n.graine = graine; return n; }
    }
  } finally { MP.tailleEnCours = 1; }
  throw new Error('Niveau mixte impossible à créer');
};
function tirerMixte(palier, graine, ligue) {
  var alea = new MP.Aleatoire(graine), vise = (Math.max(1, palier) - 1) * 0.85;
  var terrain = MP.choisirTerrain(alea, vise, ligue);
  var distance = alea.entre(5, Math.min(9.5, 6 + vise * 0.25));
  MP.tailleEnCours = MP.tailleObjets(distance);
  var objets = [], c = { type: 'cochonnet', x: alea.entre(-0.6, 0.6), z: distance }, traits = ['Point adverse collé au cochonnet'];
  objets.push(c);
  var colle = MP.rayonObjet('boule') + MP.rayonObjet('cochonnet');
  if (!MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: colle + 0.008, distMax: colle + 0.05 })) return null;
  for (var i = 0, n = 1 + Math.floor(alea.entre(0, 2.2)); i < n; i++) MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: colle + 0.12, distMax: colle + 0.5 });
  var difficulte = 4 + vise * 0.3;
  if (alea.suivant() < 0.45) {
    var recul = alea.entre(0.5, 1.2);
    if (MP.placer(alea, objets, 'boule', { cx: c.x * (1 - recul / c.z), cz: c.z - recul, distMin: 0, distMax: 0.08 })) { traits.push('Boule devant'); difficulte += 2; }
  }
  objets.forEach(function (o) { if (o.type === 'boule') o.camp = 'adverse'; });
  var boules = difficulte > 8 && alea.suivant() < 0.4 ? 3 : 2;
  traits.push(boules + ' boules pour reprendre le point');
  var vent = null;
  return { mode: 'pointage', mixte: true, objets: objets, cible: null, terrain: MP.TERRAINS.indexOf(terrain), traits: traits,
    taille: MP.tailleEnCours, boules: boules, vent: vent, difficulte: difficulte, etoiles: Math.max(2, Math.min(5, 1 + Math.floor(difficulte / 3))),
    dore: false, defi: null };
}

// ---------- Épreuves ----------
// Niveaux faits exprès pour chaque épreuve : il faut la technique visée, et de la précision.
// La distance s'adapte à la portée du joueur pour que l'épreuve reste possible.

MP.creerEpreuve = function (id, d, boule, graine) {
  try {
    for (var k = 0; k < 60; k++) {
      var n = MP.tirerEpreuve(id, d, boule, (graine + k * 7919) >>> 0);
      if (n && MP.positionsValides(n.objets)) { n.graine = graine; return n; }
    }
  } finally { MP.tailleEnCours = 1; }
  throw new Error('Épreuve impossible à créer');
};

MP.tirerEpreuve = function (id, d, boule, graine) {
  var ep = MP.trouver(MP.EPREUVES, id), alea = new MP.Aleatoire(graine);
  var portee = MP.porteeMax(d, boule, ep.technique);
  var objets = [], traits = [], terrain = 0, c, cible = null, z;
  // Les boules ont la taille de tout niveau à cette distance (même caméra que le reste du jeu).
  function cochonnet(zVoulu) {
    MP.tailleEnCours = MP.tailleObjets(zVoulu);
    c = { type: 'cochonnet', x: alea.entre(-0.5, 0.5), z: zVoulu };
    objets.push(c);
  }
  // Boule adverse à dMin–dMax (de centre à centre) du cochonnet ; le trait donne le jour réel.
  function adverse(dMin, dMax) {
    // Distances de centre à centre prévues pour la vraie taille : on garde le même jour avec des boules plus grosses.
    var plus = MP.rayonObjet('boule') + MP.rayonObjet('cochonnet') - MP.MESURES.rayonBoule - MP.MESURES.rayonCochonnet;
    var o = MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: dMin + plus, distMax: dMax + plus, angleMin: Math.PI * 0.6, angleMax: Math.PI * 1.4 });
    if (!o) return false;
    o.camp = 'adverse';
    var jour = Math.hypot(o.x - c.x, o.z - c.z) - MP.rayonObjet('boule') - MP.rayonObjet('cochonnet');
    traits.push('1 boule à ' + Math.round(jour * 100) + ' cm');
    return true;
  }
  if (ep.mode === 'pointage') {
    if (id === 'demiPortee') {
      terrain = 1; cochonnet(Math.max(4.6, Math.min(5.6, portee - 0.3)));
      if (!adverse(0.29, 0.33)) return null;
    } else if (id === 'portee') {
      terrain = 1; cochonnet(Math.max(4.8, Math.min(5.8, portee - 0.2)));
      if (!adverse(0.21, 0.24)) return null;
      if (MP.placerLigne(objets, c, alea.entre(1.0, 1.3), 1) < 1) return null;
      traits.push('Boule devant');
    } else {
      terrain = 0; cochonnet(Math.max(5, Math.min(6, portee - 0.2)));
      if (!adverse(0.19, 0.21)) return null;
      if (MP.placerLigne(objets, c, alea.entre(0.9, 1.1), 7) < 6) return null;
      traits.push('Ligne de boules devant');
    }
    objets.forEach(function (o) { if (o.type === 'boule' && !o.camp) o.camp = 'adverse'; });
  } else {
    // La rafle se joue au-delà de la portée du tir roulé ; le tir simple par-dessus une boule devant.
    if (id === 'rafle') { terrain = 0; z = Math.max(6.4, Math.min(7.2, portee - 0.6)); }
    else if (id === 'tirLeve') { terrain = 0; z = Math.max(5.6, Math.min(6.6, portee + 0.4)); }
    else if (id === 'tirDevant') { terrain = 0; z = Math.max(4.8, Math.min(5.6, portee)); }
    else { terrain = 0; z = Math.max(4.6, Math.min(5.4, portee - 0.2)); }
    // Diriger au fer : la cible seule, un peu plus près ; la zone d'un côté ou de l'autre.
    if (id === 'diriger') z = Math.max(4.4, Math.min(5.2, portee - 0.4));
    cochonnet(z + alea.entre(0.15, 0.3));
    cible = MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: 0.12, distMax: 0.25, angleMin: Math.PI * 0.8, angleMax: Math.PI * 1.2 });
    if (!cible) return null;
    cible.camp = 'cible';
    if (id === 'tirDevant') { if (MP.placerLigne(objets, cible, alea.entre(1.0, 1.2), 1) < 1) return null; traits.push('Boule devant la cible'); }
    if (id === 'tirLeve') { if (MP.placerLigne(objets, cible, alea.entre(0.6, 0.8), 1) < 1) return null; traits.push('Boule devant la cible'); }
    if (id === 'tirAuFer') { if (MP.placerLigne(objets, cible, alea.entre(0.6, 0.8), 1) < 1) return null; traits.push('Boule devant la cible'); }
    if (!traits.length) traits.push('Cible seule');
    objets.forEach(function (o) { if (o.type === 'boule' && !o.camp) o.camp = 'adverse'; });
    if (id === 'diriger') { var zoneE = MP.zoneApresChoc(cible, alea.suivant() < 0.5 ? -1 : 1); traits.push('Zone ' + (zoneE.cote > 0 ? 'à droite' : 'à gauche')); }
  }
  return { mode: ep.mode, objets: objets, cible: cible ? objets.indexOf(cible) : null, epreuve: id, dore: false, taille: MP.tailleEnCours,
    terrain: terrain, traits: traits, difficulte: 0, etoiles: 1, defi: null, zone: zoneE || null };
};

// Le lancer réussit-il l'épreuve ? (en plus de l'objectif du niveau)
MP.coupEpreuve = function (partie, res) {
  var ep = MP.trouver(MP.EPREUVES, partie.niveau.epreuve), b = partie.joueur, cible = partie.cible;
  if (!ep || !b || !res.gagne || partie.technique !== ep.technique) return false;
  switch (ep.id) {
    case 'demiPortee': return res.ecart <= 0.25;
    case 'portee': return res.ecart <= 0.20;
    case 'plombee': return res.ecart <= 0.18;
    case 'rafle': return cible.mort || Math.hypot(cible.x - cible.depart.x, cible.z - cible.depart.z) >= 0.6;
    // Touchée en premier (donc passée par-dessus la boule devant) et chassée d'au moins un mètre.
    case 'tirLeve': return cible.mort || Math.hypot(cible.x - cible.depart.x, cible.z - cible.depart.z) >= 1;
    case 'tirDevant':
      var ch = b.premiereChute;
      return !!ch && !b.premierChocEnVol && ch.z <= cible.depart.z + 0.02 && Math.hypot(ch.x - cible.depart.x, ch.z - cible.depart.z) <= 0.3 + b.r;
    case 'tirAuFer': return !!b.premierChocEnVol;
    // Un vrai carreau : ta boule reste à moins de 16 cm de la place de la cible.
    case 'carreau': return !!res.carreau && Math.hypot(b.x - cible.depart.x, b.z - cible.depart.z) <= 0.16;
    // Frappée au fer, et ta boule finit dans la zone.
    case 'diriger': return !!b.premierChocEnVol && !b.mort && MP.dansZone(partie.niveau.zone, b.x, b.z);
  }
  return false;
};

// Avance une épreuve en cours d'un lancer : { reussites, essais, finie, ratee }.
MP.avancerEpreuve = function (suivi, reussi) {
  var ep = MP.trouver(MP.EPREUVES, suivi.id);
  suivi.essais += 1;
  suivi.ratee = false;
  if (reussi) suivi.reussites += 1;
  else if (ep.essais == null) { suivi.ratee = suivi.reussites > 0; suivi.reussites = 0; suivi.essais = 0; }
  suivi.finie = suivi.reussites >= ep.reussir;
  // En nombre d'essais limité : quand il n'en reste plus assez, on recommence.
  if (!suivi.finie && ep.essais != null && ep.reussir - suivi.reussites > ep.essais - suivi.essais) {
    suivi.ratee = true; suivi.reussites = 0; suivi.essais = 0;
  }
  return suivi;
};

// ---------- Zone après le choc (tir) ----------
// Un ovale à côté de la cible, où ta boule doit finir après l'avoir frappée : côté 1 à droite de la
// ligne de tir, −1 à gauche. Repère : u = de ton cercle vers la cible ; l'ovale est centré à 70 cm
// sur le côté et 20 cm en avant, large de 2 × 50 cm et long de 2 × 70 cm. L'effet du côté de la zone
// y emmène ta boule ; le Carreau l'empêche de partir trop loin.
MP.ZONE_CHOC = { cote: 0.7, avant: 0.2, lat: 0.5, lon: 0.7 };
MP.zoneApresChoc = function (cible, cote) {
  var Z = MP.ZONE_CHOC, ux = cible.x, uz = cible.z - 0.3, l = Math.hypot(ux, uz) || 1;
  ux /= l; uz /= l;
  // Pas contre la bordure : la zone passe de l'autre côté.
  if (Math.abs(cible.x + uz * cote * Z.cote) > 1.55) cote = -cote;
  return { x: cible.x + uz * cote * Z.cote + ux * Z.avant, z: cible.z - ux * cote * Z.cote + uz * Z.avant, ux: ux, uz: uz, cote: cote, lat: Z.lat, lon: Z.lon };
};
MP.dansZone = function (zone, x, z) {
  var dx = x - zone.x, dz = z - zone.z, av = dx * zone.ux + dz * zone.uz, co = dx * zone.uz - dz * zone.ux;
  return Math.pow(co / zone.lat, 2) + Math.pow(av / zone.lon, 2) <= 1;
};
MP.texteZone = function (zone) { return 'Après le choc, ta boule finit dans la zone ' + (zone.cote > 0 ? 'à droite' : 'à gauche'); };

// ---------- Défis ----------
// Chaque niveau propose un défi en plus de l'objectif principal : il rapporte des Points
// supplémentaires s'il est réussi en même temps que l'objectif.

MP.tirerDefi = function (mode, etoiles, vise, nombre, alea) {
  var bonus = Math.floor(etoiles / 2);
  var choix = mode === 'pointage'
    ? ['ecart', 'ecart', 'propre', 'technique', 'biberon']
    : ['auFer', 'pres', 'carreau', 'technique', 'propre', 'zone'];
  var id = choix[Math.floor(alea.suivant() * choix.length)];
  if (id === 'propre' && nombre < 3) id = mode === 'pointage' ? 'ecart' : 'pres';
  if (id === 'ecart') {
    var ecart = Math.max(0.04, Math.round((0.25 - vise * 0.012) * 100) / 100);
    return { id: id, ecart: ecart, texte: 'Finir à moins de ' + Math.round(ecart * 100) + ' cm du cochonnet', gain: 2 + bonus + (ecart <= 0.1 ? 1 : 0) };
  }
  if (id === 'propre') return { id: id, texte: mode === 'pointage' ? 'Sans toucher aucune boule' : 'Toucher la cible et aucune autre boule', gain: 2 + bonus };
  if (id === 'biberon') return { id: id, texte: 'Faire un biberon (au contact du cochonnet)', gain: 4 + bonus };
  if (id === 'auFer') return { id: id, texte: 'Tir au fer : frapper la cible sans toucher le sol avant', gain: 3 + bonus };
  if (id === 'pres') return { id: id, texte: 'Ta boule finit à moins de 40 cm de la place de la cible', gain: 2 + bonus };
  if (id === 'carreau') return { id: id, texte: 'Faire un carreau', gain: 4 + bonus };
  // La zone se place une fois la cible connue (voir finir, dans tirerNiveau).
  if (id === 'zone') return { id: id, cote: alea.suivant() < 0.5 ? -1 : 1, texte: '', gain: 4 + bonus };
  var techniques = mode === 'pointage' ? ['demiPortee', 'portee', 'plombee'] : ['rafle', 'tirLeve', 'tirDevant', 'tirAuFer'];
  var t = MP.trouver(MP.TECHNIQUES, techniques[Math.floor(alea.suivant() * techniques.length)]);
  return { id: 'technique', technique: t.id, texte: 'Réussir en ' + t.nom.toLowerCase(), gain: 3 + bonus };
};

MP.defiReussi = function (partie, res) {
  var defi = partie.niveau.defi, b = partie.joueur;
  if (!defi || !res.gagne || !b) return false;
  var bouleTouchee = b.contacts.some(function (id) {
    var o = partie.monde.corps.filter(function (x) { return x.id === id; })[0];
    return o && o.type === 'boule' && o !== partie.cible;
  });
  switch (defi.id) {
    case 'ecart': return res.ecart != null && res.ecart <= defi.ecart;
    case 'propre': return !bouleTouchee;
    case 'biberon': return !!res.biberon;
    case 'auFer': return !!b.premierChocEnVol;
    case 'pres': return !b.mort && Math.hypot(b.x - partie.cible.depart.x, b.z - partie.cible.depart.z) <= 0.4;
    case 'carreau': return !!res.carreau;
    case 'zone': return !b.mort && MP.dansZone(defi.zone, b.x, b.z);
    case 'technique': return partie.technique === defi.technique;
  }
  return false;
};

// ---------- Précision ----------
// Écart type de la direction (radians) et de la force (part de la vitesse).
// Plus la boule, les compétences et les améliorations sont bonnes, plus il est petit.

MP.facteurStat = function (s) { return 95 / (s + 50); };
// Erreur de départ (sans entraînement) : une fois et demie celle d'avant pour le geste, un peu plus
// pour une technique tout juste apprise.
MP.DEPART_GESTE = 1.5;
MP.DEPART_TECHNIQUE = 1.25;
// Ce qui reste de l'erreur au niveau n d'une compétence : depart / (1 + n / pas). Vers le niveau 5, on
// retrouve l'ancienne courbe (1 / (1 + n / ancien)) ; plus haut, jamais plus de 15 % mieux qu'elle.
MP.gainNiveau = function (n, depart, pas, ancien) { return Math.max(depart / (1 + n / pas), 0.85 / (1 + n / ancien)); };

MP.precision = function (d, boule, technique, mode, distance, idTerrain) {
  var T = MP.trouver(MP.TECHNIQUES, technique);
  var iTech = MP.TECHNIQUES.indexOf(T);
  var affinite = Math.max(-20, boule.affinites[iTech] || 0);
  var B = MP.statsBoule(d, boule, mode), stat = mode === 'pointage' ? B.pointage : B.tir;
  var fDirection = Math.pow(MP.facteurStat(B.precision), 0.7) * Math.pow(MP.facteurStat(stat), 0.6);
  var fForce = Math.pow(MP.facteurStat(mode === 'pointage' ? B.controle : B.puissance), 0.7) * Math.pow(MP.facteurStat(stat), 0.6);
  // Main stable : la direction (et un peu la force) ; Dosage : la force ; Œil du tireur : la longueur
  // des tirs en l'air ; le niveau de la technique : les deux. On part moins précis (MP.DEPART_*) et
  // chaque niveau se sent davantage ; plus haut, on retrouve à peu près la même précision qu'avant.
  var nStab = MP.niveau(d, 'stabilite'), nDos = MP.niveau(d, 'dosage');
  fDirection *= MP.gainNiveau(nStab, MP.DEPART_GESTE, 6, 16);
  fForce *= MP.gainNiveau(nDos, MP.DEPART_GESTE, 5, 15) / (1 + nStab / 40);
  if (mode === 'tir' && T.famille === 'vol') fForce *= MP.gainNiveau(MP.niveau(d, 'oeil'), MP.DEPART_TECHNIQUE, 5, 12);
  if (T.competence) {
    var gTech = MP.gainNiveau(MP.niveau(d, T.competence), MP.DEPART_TECHNIQUE, 8, 20);
    fDirection *= gTech; fForce *= gTech;
  }
  var fAff = 1 / (1 + affinite / 50);
  fDirection *= fAff; fForce *= fAff;
  // Près de la limite de sa portée, le geste devient moins sûr.
  var portee = MP.porteeMax(d, boule, technique);
  var fDistance = 1 + Math.max(0, distance - portee * 0.8) * 0.15;
  // Terrain : certaines techniques y sont bien plus imprécises, sauf avec une boule faite pour ce terrain.
  var fTerrain = MP.difficulteAvecBoule(idTerrain, technique, boule);
  return {
    direction: Math.max(0.0015, 0.032 * fDirection * fDistance * fTerrain),
    force: Math.max(0.002, 0.038 * fForce * fDistance * fTerrain * (MP.PARAMS_TECH[technique].dosage || 1))
  };
};

// Portée maximale (m) : arrêt de la boule roulante au pointage, chute de la boule sinon.
// Au début on ne dépasse pas 6 m ; la Force du bras et la boule l'allongent.
MP.porteeMax = function (d, boule, technique) {
  var T = MP.trouver(MP.TECHNIQUES, technique);
  // La rafle, lancée fort et bas, va bien plus loin que le tir roulé.
  var base = T.famille === 'roule' ? (T.mode === 'pointage' ? 5.8 : (technique === 'rafle' ? 7.4 : 5.4)) : 5.6;
  // Le tir roulé ne dépasse jamais 7 m : plus loin, il faut la rafle ou un tir en l'air.
  return Math.min(technique === 'tirSimple' ? 7 : 12.5, base + 0.15 * MP.niveau(d, 'puissance') + (MP.statsBoule(d, boule, T.mode).puissance - 45) * 0.02);
};

function effets(d, choix, P, alea, boule) {
  var forts = (1 + MP.niveau(d, 'effetsForts') / 15) * MP.effetsReglage(d, boule).spin;
  var regulier = 0.35 / (1 + MP.niveau(d, 'effetsForts') / 10);
  var spin = 0, frein = P.frein, retro = 0;
  if (choix.effet === 'gauche' || choix.effet === 'droite') {
    var n = MP.niveau(d, choix.effet === 'gauche' ? 'effetGauche' : 'effetDroite');
    spin = 0.35 * (1 + n / 20) * forts * (choix.effet === 'gauche' ? -1 : 1);
    if (alea) spin *= Math.max(0.2, 1 + alea.gauss() * regulier);
  } else if (choix.effet === 'retro') {
    var nr = MP.niveau(d, 'retro');
    retro = Math.min(0.75, (0.3 + nr * 0.008) * forts);
    frein *= 1.25 + nr / 60;
    if (alea) retro = Math.min(0.85, Math.max(0, retro * (1 + alea.gauss() * regulier)));
  }
  var reg = MP.effetsReglage(d, boule);
  return { spin: spin, frein: frein * reg.frein, retro: retro, amorti: Math.min(0.98, P.amorti * reg.amorti) };
}

// Lancer au glissé : direction (radians, 0 = tout droit) et force de 0 à 1.
MP.lancerAuGlisse = function (d, boule, choix, direction, puissance, distanceBut, alea) {
  var P = MP.PARAMS_TECH[choix.technique];
  var mode = MP.trouver(MP.TECHNIQUES, choix.technique).mode;
  // Vitesse réglée pour que la force maximale atteigne tout juste la portée du joueur.
  var vmax = MP.vitessesMax[choix.technique] * Math.sqrt(MP.porteeMax(d, boule, choix.technique) / P.portee);
  var prec = MP.precision(d, boule, choix.technique, mode, distanceBut, choix.terrain);
  var e = effets(d, choix, P, alea, boule);
  var lancer = { technique: choix.technique, effet: choix.effet, direction: direction,
    vitesse: vmax * (0.2 + 0.8 * Math.max(0, Math.min(1, puissance))),
    spin: e.spin, frein: e.frein, amorti: e.amorti, retro: e.retro, x0: 0, z0: 0.3, precision: prec };
  if (alea) {
    lancer.direction += alea.gauss() * prec.direction;
    lancer.vitesse *= 1 + alea.gauss() * prec.force;
  }
  return lancer;
};

// Vitesse qui fait tomber la boule à « distance » mètres de la main (lancer en l'air).
MP.vitessePourChute = function (technique, distance, taille) {
  var P = MP.PARAMS_TECH[technique], a = P.angle * Math.PI / 180, r = MP.MESURES.rayonBoule * (taille || 1);
  var h = P.hauteur - r + distance * Math.tan(a);
  return Math.sqrt(MP.GRAVITE * distance * distance / (2 * Math.cos(a) * Math.cos(a) * Math.max(0.05, h)));
};

// Point de chute réellement visable : dans la portée du joueur, devant le cercle.
MP.chuteAtteignable = function (d, boule, technique, x, z) {
  var portee = MP.porteeMax(d, boule, technique);
  var dx = x, dz = Math.max(1.0, z) - 0.3, dist = Math.hypot(dx, dz);
  var k = dist > portee ? portee / dist : 1;
  return { x: dx * k, z: 0.3 + dz * k, horsPortee: dist > portee };
};

// Lancer en l'air : la boule doit tomber au point (x, z).
MP.lancerEnLAir = function (d, boule, choix, x, z, alea, taille) {
  var P = MP.PARAMS_TECH[choix.technique];
  var mode = MP.trouver(MP.TECHNIQUES, choix.technique).mode;
  var vise = MP.chuteAtteignable(d, boule, choix.technique, x, z);
  var distance = Math.hypot(vise.x, vise.z - 0.3);
  var prec = MP.precision(d, boule, choix.technique, mode, distance, choix.terrain);
  var e = effets(d, choix, P, alea, boule);
  // Toucher (pointage) : la boule garde moins de vitesse en retombant, elle roule moins.
  if (mode === 'pointage') e.amorti *= 1 - MP.niveau(d, 'toucher') / 90;
  var lancer = { technique: choix.technique, effet: choix.effet, direction: Math.atan2(vise.x, vise.z - 0.3),
    vitesse: MP.vitessePourChute(choix.technique, distance, taille),
    spin: e.spin, frein: e.frein, amorti: e.amorti, retro: e.retro, x0: 0, z0: 0.3, precision: prec, vise: vise };
  if (alea) {
    lancer.direction += alea.gauss() * prec.direction;
    lancer.vitesse *= 1 + alea.gauss() * prec.force;
  }
  return lancer;
};

// ---------- Parcours : lancers imposés ----------
// Cinq lancers par parcours, chacun avec sa technique imposée, sans boule adverse, sur un terrain
// plein de relief : il faut finir dans le cercle autour du cochonnet. Raté, on rejoue le même
// lancer (même terrain, même relief, même vent) jusqu'à le réussir. Le cercle se resserre d'un
// lancer à l'autre et d'un parcours à l'autre ; le relief devient plus fort et plus varié.
MP.PARCOURS_LANCERS = 5;
MP.RAYONS_PARCOURS = [0.5, 0.4, 0.3, 0.22, 0.15];
MP.TECHNIQUES_PARCOURS = ['roulette', 'demiPortee', 'portee', 'plombee'];
MP.rayonParcours = function (numero, lancer) {
  return Math.max(0.06, MP.RAYONS_PARCOURS[lancer] * Math.max(0.5, Math.pow(0.93, numero - 1)));
};
// Le lancer en cours garde sa graine tant qu'il n'est pas réussi.
MP.graineParcours = function (P) {
  return (P.graine ^ Math.imul(P.numero, 0x9e3779b1) ^ Math.imul(P.lancer + 1, 0x85ebca77)) >>> 0;
};

// Portée d'une technique sur un terrain (sans relief) : jusqu'où la boule s'arrête, lancée à fond
// (en l'air : jusqu'où elle tombe au plus loin).
MP._portees = {};
MP.porteeTerrain = function (d, boule, idTech, terrain) {
  var cle = [terrain.id, idTech, boule.id, MP.niveau(d, 'puissance'), JSON.stringify(MP.effetsReglage(d, boule))].join('|');
  if (MP._portees[cle] == null) {
    var P = MP.PARAMS_TECH[idTech];
    var essai = MP.simulerSeul(terrain, MP.lancerAuGlisse(d, boule, { technique: idTech, effet: 'neutre' }, 0, 1, 6, null));
    MP._portees[cle] = P.vol ? essai.chute.z : essai.arret.z / (P.marge || 1);
  }
  return MP._portees[cle];
};

// Le relief d'un lancer : toujours une pente juste avant le cochonnet (un dévers en grande pente douce le
// plus souvent, sinon une descente ou une montée sur le chemin), puis, de plus en plus, un dos d'âne en
// travers du chemin, une bosse ou une cuvette près du chemin, de la boue de l'autre côté (il reste un
// passage), une petite pente raide sur le chemin, un trou. Rien ne se chevauche (MP.placerForme).
// pente : { devers, sens } tirés avant la distance du but.
MP.reliefParcours = function (alea, numero, lancer, c, pente) {
  var zones = [], force = Math.min(1, 0.25 + 0.1 * (numero - 1) + 0.06 * lancer);
  function signe() { return alea.suivant() < 0.5 ? 1 : -1; }
  function surLigne(z) { return c.x * z / c.z; }        // la ligne droite du cercle de lancer au but
  var z1 = c.z - alea.entre(1.6, 3), z2 = c.z + alea.entre(0.7, 1.3), f = alea.entre(0.85, 1), biais = alea.entre(-0.3, 0.3);
  if (pente.devers) { var zv = c.z - alea.entre(1.2, 1.7); zones.push(MP.plan(surLigne(zv) + alea.entre(-0.2, 0.2), zv, pente.sens * Math.PI / 2 + biais, alea.entre(1.4, 2), alea.entre(1.4, 1.9), (0.3 + 0.4 * force) * f)); }
  else zones.push(MP.plan(surLigne((z1 + z2) / 2), (z1 + z2) / 2, pente.sens > 0 ? 0 : Math.PI, z2 - z1, alea.entre(1.8, 2.4), (pente.sens > 0 ? 0.3 + 0.4 * force : 0.25 + 0.25 * force) * f));
  var cote = signe();
  if (numero >= 2 && alea.suivant() < 0.35 && c.z > 3.8) MP.placerForme(zones, function () {
    var zd = alea.entre(1.4, c.z - 2.2);
    return MP.dosDane(surLigne(zd), zd, alea.entre(-0.25, 0.25), alea.entre(0.35, 0.5), alea.entre(1.6, 2.6), MP.RAIDEUR * (0.3 + 0.2 * force));
  });
  if (numero + lancer >= 2) MP.placerForme(zones, function () {
    var zb = alea.entre(1.8, Math.max(2, c.z - 1.4)), bosse = alea.suivant() < 0.6;
    return { type: 'bosse', x: surLigne(zb) + cote * alea.entre(0.2, 0.45), z: zb, r: alea.entre(0.3, 0.5), force: (bosse ? 1 : -1) * (0.35 + 0.45 * force) * alea.entre(0.8, 1) };
  });
  if (numero >= 2 && alea.suivant() < 0.6) MP.placerForme(zones, function () {
    var zm = alea.entre(2.2, Math.max(2.4, c.z - 1));
    return { type: 'boue', x: surLigne(zm) - cote * alea.entre(0.45, 0.8), z: zm, rx: alea.entre(0.2, 0.35), rz: alea.entre(0.2, 0.4), angle: alea.entre(0, Math.PI) };
  });
  if (numero >= 3 && alea.suivant() < 0.55 && z1 > 2.6) MP.placerForme(zones, function () {
    var z3 = alea.entre(1.2, z1 - 1.2);
    return MP.plan(surLigne(z3) + alea.entre(-0.3, 0.3), z3, signe() * Math.PI / 2 + alea.entre(-0.5, 0.5), alea.entre(0.6, 1), alea.entre(0.8, 1.3), MP.RAIDEUR * (0.3 + 0.3 * force), true);
  });
  if (numero >= 4 && alea.suivant() < 0.45) MP.placerForme(zones, function () {
    var zt = alea.entre(2, c.z - 0.9);
    return { type: 'trou', x: surLigne(zt) + cote * alea.entre(0.5, 0.8), z: zt, r: alea.entre(0.05, 0.08) };
  });
  return zones;
};

// Le niveau du lancer en cours (P = d.parcours). La technique imposée est retenue dans P pour
// que les essais suivants gardent la même ; elle change si la boule ne la permet plus.
MP.creerParcours = function (d, boule, P) {
  var graine = MP.graineParcours(P), alea = new MP.Aleatoire(graine);
  var dispo = MP.TECHNIQUES_PARCOURS.filter(function (id) { return MP.techniqueJouable(d, id, boule); });
  var vise = (Math.max(1, d.palier) - 1) * 0.85;
  // Un terrain où la technique n'est pas « imprécise ici » et porte assez loin (au moins 5,2 m)
  // (sinon un autre, puis le boulodrome).
  var tech = P.technique && dispo.indexOf(P.technique) >= 0 ? P.technique : null, terrain = null;
  for (var k = 0; k < 12 && !terrain; k++) {
    var t = k < 11 ? MP.choisirTerrain(alea, vise, d.ligue) : MP.TERRAINS[0];
    var bonnes = dispo.filter(function (id) {
      return MP.difficulteAvecBoule(t.id, id, boule) < 1.5 && (k === 11 || MP.porteeTerrain(d, boule, id, t) >= 5.2);
    });
    if (!bonnes.length || (tech && bonnes.indexOf(tech) < 0)) continue;
    terrain = t;
    // Le premier lancer d'un parcours se joue toujours en roulette. (On tire toujours le dé, pour que
    // la suite du niveau soit la même à chaque essai.)
    var u = alea.suivant();
    if (!tech) tech = P.lancer === 0 && bonnes.indexOf('roulette') >= 0 ? 'roulette' : bonnes[Math.floor(u * bonnes.length)];
  }
  if (!terrain) { terrain = MP.TERRAINS[0]; tech = tech || 'roulette'; }
  P.technique = tech;
  // La pente principale est tirée d'abord : un dévers fort ou une montée freinent la boule, le but
  // est alors plus près (une montée trop longue pour la technique devient une descente).
  var pente = { devers: alea.suivant() < 0.65, sens: alea.suivant() < 0.5 ? 1 : -1 };
  var force = Math.min(1, 0.25 + 0.1 * (P.numero - 1) + 0.06 * P.lancer), plat = MP.porteeTerrain(d, boule, tech, terrain);
  if (!pente.devers && pente.sens < 0 && plat * 0.75 < 4.2) pente.sens = 1;
  // Le but, à portée de la technique sur ce terrain, de plus en plus loin au fil des parcours.
  var portee = plat * (pente.devers ? 0.85 - 0.12 * force : (pente.sens < 0 ? 0.75 : 0.85));
  var zMin = Math.min(3.6, portee - 0.6), u = Math.max(0, Math.min(1, 0.3 + 0.07 * (P.numero - 1) + 0.05 * P.lancer + alea.entre(-0.3, 0.3)));
  var z = zMin + (portee - zMin) * u;
  MP.tailleEnCours = MP.tailleObjets(z);
  var c = { type: 'cochonnet', x: alea.entre(-0.6, 0.6), z: z };
  var zones = MP.reliefParcours(alea, P.numero, P.lancer, c, pente);
  if (terrain.formes) zones = MP.ajouterFormes(zones, MP.sansRaideSous(MP.formesEnPente(graine, graine & 1 ? 1 : -1), c.x, c.z, 0.3));
  var vent = null;   // pas de vent
  var rayon = MP.rayonParcours(P.numero, P.lancer);
  var niveau = { mode: 'pointage', objets: [c], cible: null, terrain: MP.TERRAINS.indexOf(terrain), taille: MP.tailleEnCours,
    traits: ['Sans boule adverse'], difficulte: 0, etoiles: Math.min(5, 1 + Math.floor((P.numero - 1) / 2) + (P.lancer >= 3 ? 1 : 0)),
    dore: false, defi: null, vent: vent, zones: zones, graine: graine,
    parcours: { numero: P.numero, lancer: P.lancer, essais: P.essais, technique: tech, rayon: rayon } };
  MP.tailleEnCours = 1;
  return niveau;
};

// Vent de côté (à 30° près) : il faut viser à côté. Jamais de face ni dans le dos, où il rendrait
// le but hors de portée (ou trop facile) pour les boules en l'air.

// ---------- Montagne ----------
// Chaque étape est toujours la même (graine fixe) : terrain, relief, vent et but ne changent pas d'une
// ascension à l'autre ; seul le but se rapproche si la technique ne porte pas assez loin.
MP.GRAINES_MONTAGNE = { pointage: 0x4d6f6e74, tir: 0x53756d6d };
MP.creerEtapeMontagne = function (d, mode, k) {
  try {
    for (var essai = 0; essai < 30; essai++) {
      var n = tirerEtapeMontagne(d, mode, k, (MP.GRAINES_MONTAGNE[mode] ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(essai, 0x632be5ab)) >>> 0, essai >= 20);
      if (n) return n;
    }
  } finally { MP.tailleEnCours = 1; }
  throw new Error('Étape de montagne impossible à créer');
};
function tirerEtapeMontagne(d, mode, k, graine, toutAccepter) {
  var E = MP.MONTAGNES[mode][k], alea = new MP.Aleatoire(graine);
  var terrain = MP.trouver(MP.TERRAINS, E.terrain), boule = MP.bouleMontagne(d, E.technique, E.terrain) || MP.bouleEquipee(d);
  // Le but à la distance prévue, ou juste à portée de la technique sur ce terrain.
  var portee = MP.porteeTerrain(d, boule, E.technique, terrain);
  var z = Math.max(3.8, Math.min(E.distance, mode === 'pointage' ? portee * 0.85 : portee - 0.6));
  MP.tailleEnCours = MP.tailleObjets(z);
  var c = { type: 'cochonnet', x: alea.entre(-0.5, 0.5), z: z }, objets = [c], cible = null, traits = [];
  if (mode === 'tir') {
    // La cible tout près du cochonnet, ses voisines à « serre » d'elle, parfois une boule devant.
    cible = MP.placer(alea, objets, 'boule', { cx: c.x, cz: c.z, distMin: 0.1, distMax: 0.25, angleMin: Math.PI * 0.7, angleMax: Math.PI * 1.3 });
    if (!cible) return null;
    cible.camp = 'cible';
    var jour = MP.rayonObjet('boule') * 2 + (E.serre || 0.2), posees = 0;
    for (var i = 0; i < (E.voisines || 0); i++) {
      var v = MP.placer(alea, objets, 'boule', { cx: cible.x, cz: cible.z, distMin: jour, distMax: jour + 0.12 });
      if (v) { v.camp = 'adverse'; posees++; }
    }
    if (posees < (E.voisines || 0)) return null;
    traits.push(posees ? posees + (posees > 1 ? ' boules autour' : ' boule autour') : 'Cible seule');
    if (E.devant) {
      if (MP.placerLigne(objets, cible, alea.entre(0.6, 0.9), 1) < 1) return null;
      traits.push('Boule devant la cible');
    }
    objets.forEach(function (o) { if (o.type === 'boule' && !o.camp) o.camp = 'adverse'; });
    if (E.carreau) traits.push('Carreau exigé');
    if (E.zone) {
      var zoneM = MP.zoneApresChoc(cible, alea.suivant() < 0.5 ? -1 : 1);
      // Rien dans la zone : ta boule doit pouvoir s'y poser.
      if (objets.some(function (o) { return o !== cible && MP.dansZone(zoneM, o.x, o.z); })) return null;
      traits.push('Zone ' + (zoneM.cote > 0 ? 'à droite' : 'à gauche') + ' après le choc');
    }
  } else traits.push('Sans boule adverse');
  if (!MP.positionsValides(objets)) return null;
  // Les embûches de l'étape, de plus en plus fortes en montant.
  var zones = MP.reliefMontagne(alea, E.embuches || [], k, c, mode === 'tir');
  // Toutes les embûches de l'étape, sans chevauchement ; sinon, une autre disposition (et, faute de
  // place, après 20 essais, celles qui tiennent).
  var attendu = (E.embuches || []).length + ((E.embuches || []).indexOf('devers2') >= 0 ? 1 : 0);
  if (zones.length < attendu && !toutAccepter) return null;
  if (terrain.formes) zones = MP.ajouterFormes(zones, MP.formesEnPente(graine, graine & 1 ? 1 : -1));
  zones = MP.sansRaideSous(zones, c.x, c.z, 0.3);
  // La Montagne garde la force des pentes douces pour laquelle ses étapes ont été réglées une à une.
  zones.forEach(function (o) { if (o.type === 'pente' || (o.type === 'plan' && !o.raide)) o.attenue = 1 / (o.globale ? MP.FORCE_PENTE_TERRAIN : MP.FORCE_PENTE); });
  var relief = new MP.Relief(zones);
  if (!objets.every(function (o) { return relief.placeLibre(o.x, o.z, MP.rayonObjet(o.type)); })) return null;
  var vent = null;   // pas de vent
  return { mode: mode, objets: objets, cible: cible ? objets.indexOf(cible) : null, cibles: cible ? [objets.indexOf(cible)] : [],
    terrain: MP.TERRAINS.indexOf(terrain), taille: MP.tailleEnCours, traits: traits, difficulte: 0, etoiles: Math.min(5, 1 + Math.floor(k / 2)),
    dore: false, defi: null, vent: vent, zones: zones, graine: graine, boule: boule.id,
    montagne: { mode: mode, etape: k, nom: E.nom, technique: E.technique, rayon: E.rayon || null, carreau: !!E.carreau, zone: zoneM || null } };
}

// Les embûches d'une étape, placées pour compter : dévers juste avant le but (une grande pente douce), petites
// pentes raides sur le chemin, descente ou montée sur le chemin, bosse ou cuvette près de la ligne, boue
// de l'autre côté (il reste un passage), trou et cuvette juste à côté de la zone, racine en travers du
// chemin un peu avant le but. Rien ne se chevauche.
MP.reliefMontagne = function (alea, embuches, k, c, tir) {
  var zones = [], f = Math.min(1, 0.3 + 0.075 * k), cote = alea.suivant() < 0.5 ? 1 : -1;
  function signe() { return alea.suivant() < 0.5 ? 1 : -1; }
  function surLigne(z) { return c.x * z / c.z; }        // la ligne droite du cercle au but
  var petite = MP.RAIDEUR * (0.3 + 0.3 * f);
  // Chaque embûche est retirée tant qu'elle chevaucherait une autre forme (MP.placerForme).
  var fabriques = {
    devers: function () {
      var zv = c.z - alea.entre(1.2, 1.8);
      return MP.plan(surLigne(zv) + alea.entre(-0.2, 0.2), zv, signe() * Math.PI / 2 + alea.entre(-0.3, 0.3), alea.entre(1.4, 2), alea.entre(1.4, 2), 0.25 + 0.4 * f);
    },
    // Petites pentes sur le chemin, ou juste à côté s'il est déjà pris.
    devers2: function () {
      var z0 = alea.entre(1.2, Math.max(1.4, c.z - 1));
      return MP.plan(Math.max(-1.5, Math.min(1.5, surLigne(z0) + signe() * alea.entre(0, 1.4))), z0, signe() * Math.PI / 2 + alea.entre(-0.5, 0.5), alea.entre(0.5, 0.8), alea.entre(0.6, 1), petite, true);
    },
    pente: function (e) {
      // (Plus courte quand le but est proche : il reste de la place pour les autres embûches.)
      var z0 = alea.entre(1, Math.max(1.2, c.z - 3.8)), lg = Math.min(c.z - 0.4, z0 + Math.min(alea.entre(1.6, 2.4), 0.3 * c.z)) - z0;
      return MP.plan(surLigne(z0 + lg / 2), z0 + lg / 2, (e === 'descente' ? 0 : Math.PI) + alea.entre(-0.1, 0.1), lg, alea.entre(1.2, 1.7), 0.25 + 0.3 * f);
    },
    bosse: function (e) {
      var z0 = alea.entre(1.5, Math.max(2, c.z - 0.6)), x0 = surLigne(z0) + signe() * alea.entre(0.2, 1.4);
      return { type: 'bosse', x: Math.max(-1.6, Math.min(1.6, x0)), z: z0, r: alea.entre(0.3, 0.5), force: (e === 'bosse' ? 1 : -1) * (0.35 + 0.45 * f) };
    },
    cuvetteZone: function () {
      return { type: 'bosse', x: c.x + signe() * alea.entre(0.35, 0.55), z: c.z + alea.entre(-0.3, 0.3), r: alea.entre(0.25, 0.35), force: -(0.35 + 0.4 * f) };
    },
    boue: function () {
      var z0 = alea.entre(1.6, Math.max(2.4, c.z - 0.6));
      return { type: 'boue', x: Math.max(-1.6, Math.min(1.6, surLigne(z0) - cote * alea.entre(0.45, 1.4))), z: z0, rx: alea.entre(0.2, 0.35), rz: alea.entre(0.2, 0.4), angle: alea.entre(0, Math.PI) };
    },
    trou: function () {
      return { type: 'trou', x: c.x + signe() * alea.entre(0.35, 0.6), z: c.z + alea.entre(-0.4, 0.2), r: alea.entre(0.05, 0.08) };
    },
    racine: function () {
      var z0 = c.z - alea.entre(0.6, 2.8), cx = surLigne(z0) + signe() * alea.entre(0.15, 0.5), l = alea.entre(0.5, 0.9), an = alea.entre(-0.4, 0.4);
      return { type: 'racine', x1: cx - Math.cos(an) * l / 2, z1: z0 - Math.sin(an) * l / 2, x2: cx + Math.cos(an) * l / 2, z2: z0 + Math.sin(an) * l / 2 };
    }
  };
  embuches.forEach(function (e) {
    var fab = e === 'descente' || e === 'montee' ? fabriques.pente : (e === 'cuvette' ? fabriques.bosse : fabriques[e]);
    if (!fab) return;
    MP.placerForme(zones, function () { return fab(e); }, 30);
    // Deux petites pentes pour un dévers sur le chemin.
    if (e === 'devers2') MP.placerForme(zones, function () { return fab(e); }, 30);
  });
  return zones;
};

// La partie d'une étape : 3 boules (moins celles déjà lancées), qui restent sur le terrain.
MP.partieMontagne = function (etat, mode) {
  var d = etat[mode], M = d.montagne;
  var niveau = MP.creerEtapeMontagne(d, mode, M.etape);
  var relief = new MP.Relief(niveau.zones);
  niveau.relief = relief.traits(MP.niveau(d, 'lectureSol'));
  var terrain = MP.TERRAINS[niveau.terrain];
  var alea = new MP.Aleatoire((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  var monde = new MP.Monde(terrain, alea);
  monde.taille = niveau.taille;
  monde.vent = niveau.vent;
  monde.relief = relief;
  var cochonnet = null, cible = null;
  niveau.objets.forEach(function (o, i) {
    var c = monde.ajouter(o);
    if (o.type === 'cochonnet') cochonnet = c;
    if (i === niveau.cible) cible = c;
  });
  return {
    d: d, mode: mode, mixte: false, libre: false, montagne: true, niveau: niveau, graine: niveau.graine, terrain: terrain, monde: monde, alea: alea,
    cochonnet: cochonnet, cible: cible, cibles: cible ? [cible] : [], boule: MP.trouver(MP.BOULES, niveau.boule), joueur: null, lances: [],
    boulesRestantes: MP.MONTAGNE_BOULES - M.boule, resultat: null, piste: null, relief: relief, pisteRefaite: false, taille: monde.taille
  };
};

// ---------- Partie ----------

// Installe un niveau tiré au hasard dans un monde physique.
// En essai (libre), on peut prendre n'importe quelle boule, même pas achetée, sans gagner de Points.
MP.nouvellePartie = function (etat, mode, libre, bouleTest, graineImposee, epreuve, mixte, parcours, montagne) {
  if (parcours) return MP.partieParcours(etat);
  if (montagne) return MP.partieMontagne(etat, mode);
  var d = etat[mode];
  var graine = graineImposee != null ? graineImposee >>> 0 : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  // La piste : même terrain et mêmes accidents 10 niveaux de suite, de plus en plus usée.
  // Pas de relief pour les épreuves ni pour les essais.
  var piste = null, relief = null, refaite = false, bouleJ = bouleTest || MP.trouver(MP.BOULES, d.equipee);
  if (!libre && !epreuve && !mixte) {
    // Piste neuve tous les 10 niveaux, ou tout de suite si le joueur n'y atteint plus 5 m (autre boule).
    if (!d.piste || d.piste.niveaux >= MP.NIVEAUX_PISTE || MP.porteeJoueur(d, bouleJ, mode, MP.TERRAINS[d.piste.terrain]) < MP.PORTEE_PISTE) {
      d.piste = MP.nouvellePiste(d, graine ^ 0x2545f491, mode, bouleJ); refaite = true;
    }
    piste = d.piste;
    relief = MP.reliefPiste(piste);
  }
  var joueur = piste ? { portee: MP.porteeJoueur(d, bouleJ, mode, MP.TERRAINS[piste.terrain]), vol: MP.volJouable(d, bouleJ, mode),
    effets: { gauche: MP.niveau(d, 'effetGauche') >= 1, droite: MP.niveau(d, 'effetDroite') >= 1 } } : null;
  var niveau = epreuve ? MP.creerEpreuve(epreuve, d, MP.trouver(MP.BOULES, d.equipee), graine)
    : (mixte ? MP.creerMixte(Math.max(etat.pointage.palier, etat.tir.palier), graine, Math.max(etat.pointage.ligue, etat.tir.ligue))
      : MP.creerNiveau(mode, d.palier, graine, d.ligue, piste, relief, joueur));
  // Cochonnet posé malgré tout sur une pente raide : pour ce niveau, elle redevient une pente douce
  // (on peut s'arrêter près de lui).
  var coch = niveau.objets.filter(function (o) { return o.type === 'cochonnet'; })[0];
  if (relief && coch && relief.zones.some(function (o) { return MP.raideSous(o, coch.x, coch.z, 0.1); })) {
    relief = new MP.Relief(relief.zones.map(function (o) {
      if (!MP.raideSous(o, coch.x, coch.z, 0.1)) return o;
      var douce = {}; Object.keys(o).forEach(function (k) { douce[k] = o[k]; });
      douce.raide = false;
      if (o.type === 'plan') douce.f = o.f * 0.4; else { douce.ax = o.ax / MP.RAIDEUR; douce.az = o.az / MP.RAIDEUR; }
      return douce;
    }));
  }
  niveau.relief = relief ? relief.traits(MP.niveau(d, 'lectureSol')) : [];
  var terrain = MP.TERRAINS[niveau.terrain];
  var alea = new MP.Aleatoire(graine ^ 0x9e3779b9);
  var monde = new MP.Monde(terrain, alea);
  monde.taille = niveau.taille || 1;
  monde.vent = niveau.vent || null;
  monde.relief = relief && relief.zones.length ? relief : null;
  var cochonnet = null, cible = null, cibles = [];
  niveau.objets.forEach(function (o, i) {
    var c = monde.ajouter(o);
    if (o.type === 'cochonnet') cochonnet = c;
    if (i === niveau.cible) cible = c;
    if (niveau.cibles && niveau.cibles.indexOf(i) >= 0) cibles.push(c);
  });
  if (cible && !cibles.length) cibles = [cible];
  return {
    d: d, mode: niveau.mode || mode, mixte: !!mixte, libre: !!libre, niveau: niveau, graine: graine, terrain: terrain, monde: monde, alea: alea,
    cochonnet: cochonnet, cible: cible, cibles: cibles, boule: bouleTest || MP.trouver(MP.BOULES, d.equipee),
    joueur: null, lances: [], boulesRestantes: niveau.boules || 1,
    resultat: null, piste: piste, relief: monde.relief, pisteRefaite: refaite, taille: monde.taille
  };
};

// Partie du parcours : le lancer en cours. Chaque essai a son propre hasard (la main ne tremble
// pas deux fois pareil), mais le terrain, le relief et le vent restent les mêmes.
MP.partieParcours = function (etat) {
  var d = etat.pointage, P = d.parcours, boule = MP.bouleEquipee(d);
  if (!P.graine) P.graine = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 || 1;
  var niveau = MP.creerParcours(d, boule, P);
  var relief = new MP.Relief(niveau.zones);
  niveau.relief = relief.traits(MP.niveau(d, 'lectureSol'));
  var terrain = MP.TERRAINS[niveau.terrain];
  var alea = new MP.Aleatoire((niveau.graine ^ 0x9e3779b9 ^ Math.imul(P.essais + 1, 0x632be5ab)) >>> 0);
  var monde = new MP.Monde(terrain, alea);
  monde.taille = niveau.taille;
  monde.vent = niveau.vent;
  monde.relief = relief;
  var cochonnet = monde.ajouter(niveau.objets[0]);
  return {
    d: d, mode: 'pointage', mixte: false, libre: false, parcours: true, niveau: niveau, graine: niveau.graine, terrain: terrain, monde: monde, alea: alea,
    cochonnet: cochonnet, cible: null, cibles: [], boule: boule, joueur: null, lances: [], boulesRestantes: 1,
    resultat: null, piste: null, relief: relief, pisteRefaite: false, taille: monde.taille
  };
};

MP.lancerBoule = function (partie, lancer) {
  var P = MP.PARAMS_TECH[lancer.technique];
  var v = MP.vitesseDepart(lancer.vitesse, lancer.direction, P.angle);
  var lecture = MP.niveau(partie.d, 'lectureSol');
  var b = partie.monde.ajouter({ type: 'boule', camp: 'joueur', x: lancer.x0, z: lancer.z0, y: P.hauteur,
    vx: v.vx, vz: v.vz, vy: v.vy, vol: true, spin: lancer.spin, frein: lancer.frein, amorti: lancer.amorti,
    retro: lancer.retro, saut: P.saut, style: partie.boule });
  // Réglage de la boule : plus lourde, elle est moins déviée par le sol et frappe plus fort.
  var reg = MP.effetsReglage(partie.d, partie.boule);
  b.sensibleSol = (P.sol || 1) / (1 + lecture / 10) * reg.sol;
  b.rebondFacteur = reg.rebond;   // une boule tendre rebondit moins en tombant
  var modeTech = MP.trouver(MP.TECHNIQUES, lancer.technique).mode;
  b.m *= reg.masse * (modeTech === 'tir' ? 1 + MP.niveau(partie.d, 'frappe') / 40 : 1);
  // Effet au fer : plus tu maîtrises l'effet joué (et Diriger au fer), plus ta boule part sûrement de
  // son côté après un choc en l'air (MP.Monde.choc).
  if (lancer.effet === 'gauche' || lancer.effet === 'droite') {
    b.controle = Math.min(0.85, 0.3 + MP.niveau(partie.d, lancer.effet === 'gauche' ? 'effetGauche' : 'effetDroite') / 60 +
      MP.niveau(partie.d, 'effetsForts') / 100 + (modeTech === 'tir' ? MP.niveau(partie.d, 'diriger') / 50 : 0));
  }
  partie.joueur = b;
  if (partie.lances) { partie.lances.push(b); partie.boulesRestantes -= 1; }
  partie.technique = lancer.technique;
  // Carreau (compétence) et dureté de la boule : après avoir frappé, la boule du tireur garde moins de vitesse.
  var nCarreau = modeTech === 'tir' ? MP.niveau(partie.d, 'carreau') : 0;
  partie.monde.apresChoc = function (a, c) {
    if (a !== b && c !== b) return;
    var garde = reg.garde;
    if (nCarreau && (a === partie.cible || c === partie.cible)) garde *= 1 - Math.min(0.6, nCarreau / 50);
    b.vx *= garde; b.vz *= garde;
  };
  return b;
};

// ---------- Aides de visée propres à chaque discipline ----------
// Elles prévoient le lancer sans vent ni sol irrégulier, comme le Guide de glisse. Chacune est floue au
// premier niveau et se précise niveau après niveau : de « debut » au niveau 1 à « fin » au niveau max.
MP.flouAide = function (n, max, debut, fin) { return debut * Math.pow(fin / debut, (Math.max(1, Math.min(max, n)) - 1) / (max - 1)); };

// Lance une boule prévue, pas à pas, avec ou sans les autres boules du jeu (copiées, au repos).
// rappel(b, avant, monde) après chaque pas ; on s'arrête quand il renvoie vrai ou que tout est arrêté.
function lancerPrevu(partie, lancer, avecBoules, rappel) {
  var monde = new MP.Monde(partie.terrain, null);
  monde.relief = partie.relief || null; monde.taille = partie.taille || 1;
  if (avecBoules) partie.monde.corps.forEach(function (o) {
    if (!o.mort) monde.ajouter({ type: o.type, camp: o.camp, x: o.x, z: o.z }).source = o;
  });
  var P = MP.PARAMS_TECH[lancer.technique], v = MP.vitesseDepart(lancer.vitesse, lancer.direction, P.angle);
  var b = monde.ajouter({ type: 'boule', camp: 'joueur', x: lancer.x0 || 0, z: lancer.z0 != null ? lancer.z0 : 0.3, y: P.hauteur,
    vx: v.vx, vz: v.vz, vy: v.vy, vol: true, spin: lancer.spin, frein: lancer.frein, amorti: lancer.amorti, retro: lancer.retro });
  for (var n = 0; n < 240 * 20; n++) {
    var avant = { x: b.x, z: b.z, vx: b.vx, vz: b.vz };
    monde.etape(MP.PAS);
    if (rappel(b, avant, monde) || !monde.enMouvement()) break;
  }
  return b;
}

// Premier objet que touche ta boule (null : rien), et comment : s = côté de l'objet frappé, de −1 (bord
// gauche de ta course) à 1 (bord droit), 0 = plein fouet ; enVol = sans avoir touché le sol (au fer).
MP.premierContact = function (partie, lancer) {
  var res = null, loin = -1;
  partie.monde.corps.forEach(function (o) { if (!o.mort) loin = Math.max(loin, o.z + 0.3); });
  lancerPrevu(partie, lancer, true, function (b, avant, monde) {
    if (!b.contacts.length) return b.z > loin && b.vz > 0;   // passée derrière tout : elle ne touchera rien
    var o = monde.corps.filter(function (x) { return x.id === b.contacts[0]; })[0];
    var nx = o.x - avant.x, nz = o.z - avant.z, ln = Math.hypot(nx, nz) || 1, v = Math.hypot(avant.vx, avant.vz) || 1;
    var ux = avant.vx / v, uz = avant.vz / v;
    nx /= ln; nz /= ln;
    res = { objet: o.source, cible: (partie.cibles || []).indexOf(o.source) >= 0, s: Math.max(-1, Math.min(1, nx * uz - nz * ux)),
      nx: nx, nz: nz, enVol: !!b.premierChocEnVol };
    return true;
  });
  return res;
};

// Hauteur de passage (tir en l'air) : pour chaque boule ou cochonnet que ta boule survole avant de
// toucher le sol ou la cible, le jour entre elles au plus près (négatif : elle la touche).
MP.hauteursPassage = function (partie, lancer) {
  var cibles = partie.cibles || [], ecarts = {};
  var obstacles = partie.monde.corps.filter(function (o) { return !o.mort && cibles.indexOf(o) < 0; });
  lancerPrevu(partie, lancer, false, function (b) {
    if (!b.vol || b.aTouche) return true;   // tombée : la suite, c'est l'affaire de la Ligne de mire
    obstacles.forEach(function (o) {
      var dx = o.x - b.x, dz = o.z - b.z, rr = o.r + b.r, h2 = dx * dx + dz * dz;
      if (h2 > rr * rr) return;
      var e = Math.sqrt(h2 + Math.pow(b.y - o.r, 2)) - rr;
      if (ecarts[o.id] == null || e < ecarts[o.id]) ecarts[o.id] = e;
    });
    // Arrivée sur la cible (tir au fer) : ce qui est derrière ne compte plus.
    return cibles.some(function (c) { return Math.hypot(c.x - b.x, c.z - b.z) < c.r + b.r && b.y - c.r < c.r + b.r; });
  });
  return obstacles.filter(function (o) { return ecarts[o.id] != null; }).map(function (o) { return { objet: o, ecart: ecarts[o.id] }; });
};

// Donnée marquée (pointage en l'air) : où faire tomber la boule pour qu'elle s'arrête au cochonnet,
// comme sur un terrain plat ; la Lecture du sol y ajoute le relief (entièrement au niveau 20). Le rond
// reste toujours large (80 cm au niveau 1, jamais moins de 40 cm) et décalé au hasard : il dit la
// région où tomber, jamais le point exact ; à toi de lire le terrain pour tomber juste.
MP.donneeMarquee = function (partie, d, boule, choix, n) {
  var c = partie.cochonnet, Dc = Math.hypot(c.x, c.z - 0.3), Ac = Math.atan2(c.x, c.z - 0.3);
  var portee = MP.porteeMax(d, boule, choix.technique);
  // Chute à « dist » mètres dans la direction « ang » : la longueur se cherche par dichotomie (plus
  // loin elle tombe, plus loin elle s'arrête), puis la direction corrige l'écart sur le côté.
  function chercher(relief) {
    var ang = Ac, dist = Dc;
    function arret(di) {
      return MP.simulerSeul(partie.terrain, MP.lancerEnLAir(d, boule, choix, Math.sin(ang) * di, 0.3 + Math.cos(ang) * di, null, partie.taille), false, relief, partie.taille).arret;
    }
    for (var tour = 0; tour < 3; tour++) {
      var bas = 0.7, haut = Math.min(portee, Dc + 0.3);
      for (var k = 0; k < 18; k++) {
        dist = (bas + haut) / 2;
        var r = arret(dist);
        if ((r.x * Math.sin(ang) + (r.z - 0.3) * Math.cos(ang)) > Dc) haut = dist; else bas = dist;
      }
      var a = arret(dist), lat = (a.x - c.x) * Math.cos(ang) - (a.z - c.z) * Math.sin(ang);
      if (Math.abs(lat) < 0.005) break;
      ang -= Math.atan2(lat, Dc);
    }
    return { x: Math.sin(ang) * dist, z: 0.3 + Math.cos(ang) * dist };
  }
  var plat = chercher(null), lu = Math.min(1, MP.niveau(d, 'lectureSol') / 20), p = plat;
  if (partie.relief && lu > 0) {
    var q = chercher(partie.relief);
    p = { x: plat.x + (q.x - plat.x) * lu, z: plat.z + (q.z - plat.z) * lu };
  }
  var rayon = MP.flouAide(n, 20, 0.8, 0.4), a = new MP.Aleatoire((partie.graine || 1) + 31 * n);
  return { x: p.x + a.gauss() * rayon * 0.5, z: p.z + a.gauss() * rayon * 0.5, rayon: rayon };
};

// Mètre du pointeur : le jour prévu entre ta boule arrêtée et le cochonnet, mesuré depuis un point un peu
// décalé (35 cm au niveau 1, 2 cm au niveau 20) ; arrondi à 5 cm, puis au centimètre dès le niveau 12.
MP.metrePointeur = function (partie, arret, n) {
  var c = partie.cochonnet, flou = MP.flouAide(n, 20, 0.35, 0.02), a = new MP.Aleatoire((partie.graine || 1) * 7 + 13 * n);
  var ang = a.entre(0, 2 * Math.PI), x = arret.x + Math.cos(ang) * flou, z = arret.z + Math.sin(ang) * flou;
  var jour = Math.max(0, Math.hypot(x - c.x, z - c.z) - MP.MESURES.rayonBoule * (partie.taille || 1) - c.r);
  var pas = n >= 12 ? 0.01 : 0.05;
  return { jour: Math.round(jour / pas) * pas, pas: pas };
};

// Effet prévu : de combien l'effet gauche ou droite écarte ta boule à hauteur du but (en mètres, positif
// à droite), comparé au même lancer sans effet. avec : la prévision du lancer avec effet (déjà faite).
MP.effetPrevu = function (partie, lancer, butZ, avec) {
  if (!lancer.spin) return 0;
  var sans = {};
  Object.keys(lancer).forEach(function (k) { sans[k] = lancer[k]; });
  sans.spin = 0;
  function aHauteur(r) {
    for (var i = 0; i < r.trajet.length; i++) if (r.trajet[i].z >= butZ) return r.trajet[i];
    return r.arret;
  }
  var a = aHauteur(avec || MP.simulerSeul(partie.terrain, lancer, true, partie.relief, partie.taille));
  // Sans effet : on s'arrête dès la hauteur du but.
  var b = lancerPrevu(partie, sans, false, function (x) { return x.z >= butZ; });
  return (a.x - b.x) * Math.cos(lancer.direction) - (a.z - b.z) * Math.sin(lancer.direction);
};

// Carreau : ta boule reste à moins de 20 cm (de centre à centre) de la place de la boule frappée.
MP.RAYON_CARREAU = 0.2;

// Résultat d'un lancer, une fois toutes les boules arrêtées.
MP.evaluer = function (partie) {
  var b = partie.joueur, c = partie.cochonnet, monde = partie.monde, niveau = partie.niveau;
  // Plusieurs boules lancées au pointage : c'est la meilleure qui compte.
  if (partie.mode === 'pointage' && partie.lances && partie.lances.length > 1) {
    partie.lances.forEach(function (o) {
      if (!o.mort && (b.mort || Math.hypot(o.x - c.x, o.z - c.z) - o.r < Math.hypot(b.x - c.x, b.z - c.z) - b.r)) b = o;
    });
  }
  var res = { mode: partie.mode, libre: partie.libre, technique: partie.technique, gagne: false, raison: '', biberon: false,
    fourchette: false, reprise: false, carreau: false, ecart: null, ecartAdverse: null,
    etoiles: niveau.etoiles, terrain: niveau.terrain, dore: niveau.dore };
  function dist(o) { return Math.hypot(o.x - c.x, o.z - c.z) - o.r - c.r; }  // jour entre la boule et le cochonnet
  var adverses = monde.corps.filter(function (o) { return o.type === 'boule' && o.camp !== 'joueur' && !o.mort; });
  var meilleurAdv = null;
  adverses.forEach(function (o) { if (!meilleurAdv || dist(o) < dist(meilleurAdv)) meilleurAdv = o; });
  if (partie.mode === 'pointage') {
    if (c.mort) { res.raison = 'Le cochonnet a tapé la bordure : il est mort.'; return res; }
    if (b.mort) { res.raison = 'Ta boule a tapé la bordure : elle est morte.'; return res; }
    res.ecart = Math.max(0, dist(b));
    res.ecartAdverse = meilleurAdv ? Math.max(0, dist(meilleurAdv)) : null;
    res.gagne = !meilleurAdv || dist(b) < dist(meilleurAdv);
    res.raison = res.gagne ? 'Tu bats la boule adverse !' : 'Une boule adverse est encore plus près.';
    res.biberon = res.gagne && res.ecart <= 0.01 * (partie.taille || 1);
    if (niveau.parcours) {
      // Parcours : finir dans le cercle, avec la technique imposée.
      var pc = niveau.parcours, cm = function (m) { return Math.round(m * 100) + ' cm'; };
      res.parcours = { rayon: pc.rayon, reussi: res.gagne && res.ecart <= pc.rayon && partie.technique === pc.technique };
      if (res.parcours.reussi) res.raison = 'Dans le cercle !';
      else if (res.gagne && partie.technique !== pc.technique) res.raison = 'Il fallait lancer en ' + MP.trouver(MP.TECHNIQUES, pc.technique).nom.toLowerCase() + '.';
      else if (res.gagne) res.raison = 'Hors du cercle : il fallait finir à moins de ' + cm(pc.rayon) + '.';
      res.gagne = res.parcours.reussi;
    }
    if (niveau.montagne) {
      // Montagne : une de tes boules dans la zone, avec la technique imposée.
      var mo = niveau.montagne;
      res.montagne = { reussi: res.ecart <= mo.rayon && partie.technique === mo.technique };
      res.raison = res.montagne.reussi ? 'Dans la zone !' : (partie.technique !== mo.technique
        ? 'Il fallait lancer en ' + MP.trouver(MP.TECHNIQUES, mo.technique).nom.toLowerCase() + '.'
        : 'Hors de la zone : il fallait finir à moins de ' + Math.round(mo.rayon * 100) + ' cm.');
      res.gagne = res.montagne.reussi;
    }
    finirDefi();
    return res;
  }
  // Tir : la première chose touchée doit être une cible pas encore touchée (s'il y en a plusieurs).
  var premier = b.contacts.length ? b.contacts[0] : null;
  var restantes = (partie.cibles && partie.cibles.length ? partie.cibles : [partie.cible]).filter(function (x) { return !x.touchee; });
  var cible = restantes.filter(function (x) { return x.id === premier; })[0] || restantes[0] || partie.cible;
  var deplacement = Math.hypot(cible.x - cible.depart.x, cible.z - cible.depart.z);
  if (premier === null) {
    res.raison = b.survole && b.survole.indexOf(cible.id) >= 0
      ? 'Ta boule est passée au-dessus de la cible, sans la toucher : trop longue ou trop haute.'
      : 'Ta boule n’a rien touché.';
    return res;
  }
  if (premier !== cible.id) {
    res.raison = premier === c.id ? 'Tu as touché le cochonnet avant la cible.' : 'Tu as touché une autre boule avant la cible.';
    return res;
  }
  if (deplacement < 0.08 && !cible.mort) { res.raison = 'La cible a à peine bougé.'; return res; }
  res.gagne = true;
  res.raison = 'Cible touchée !';
  cible.touchee = true;
  res.ciblesRestantes = restantes.filter(function (x) { return !x.touchee; }).length;
  res.fourchette = b.contacts.some(function (id, i) { return i > 0 && id !== cible.id && id !== c.id; });
  if (!b.mort && !c.mort) {
    res.carreau = Math.hypot(b.x - cible.depart.x, b.z - cible.depart.z) <= MP.RAYON_CARREAU;
    var autres = adverses.filter(function (o) { return o !== cible; });
    var meilleur = null;
    autres.forEach(function (o) { if (!meilleur || dist(o) < dist(meilleur)) meilleur = o; });
    res.ecart = Math.max(0, dist(b));
    res.reprise = !meilleur || dist(b) < dist(meilleur);
  }
  if (niveau.montagne) {
    // Montagne : la cible touchée avec la technique imposée (et en carreau au sommet).
    var mt = niveau.montagne;
    var dansZoneM = !mt.zone || (!b.mort && MP.dansZone(mt.zone, b.x, b.z));
    res.montagne = { reussi: partie.technique === mt.technique && (!mt.carreau || res.carreau) && dansZoneM };
    if (partie.technique !== mt.technique) res.raison = 'Il fallait tirer en ' + MP.trouver(MP.TECHNIQUES, mt.technique).nom.toLowerCase() + '.';
    else if (mt.carreau && !res.carreau) res.raison = 'Cible touchée, mais pas de carreau.';
    else if (!dansZoneM) res.raison = 'Cible touchée, mais ta boule n’a pas fini dans la zone.';
    res.gagne = res.montagne.reussi;
  }
  finirDefi();
  return res;

  function finirDefi() {
    if (!niveau.defi) return;
    res.defi = { texte: niveau.defi.texte, gain: niveau.defi.gain, reussi: MP.defiReussi(partie, res) };
  }
};
