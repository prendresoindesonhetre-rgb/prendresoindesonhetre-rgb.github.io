// Ma Pétanque — physique des boules, en vraies mesures (mètres, secondes, kilos).
// Repère : x vers la droite (0 = milieu du terrain), z vers l'avant depuis le cercle,
// y vers le haut. Une boule au sol a son centre à y = rayon.
'use strict';
var MP = window.MP || (window.MP = {});

MP.GRAVITE = 9.81;
MP.PAS = 1 / 240;

// Tirage au sort reproductible (mulberry32) : même graine, même partie.
MP.Aleatoire = function (graine) {
  var s = (graine >>> 0) || 1;
  this.suivant = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  this.entre = function (a, b) { return a + (b - a) * this.suivant(); };
  this.gauss = function () {
    var u = 1 - this.suivant(), v = this.suivant();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
};

// Réglages de chaque technique : angle de lancer (degrés), hauteur de la main (m),
// part de la vitesse gardée en touchant le sol, et freinage en roulant.
// vol : la portée se mesure à la chute (sinon à l'arrêt, divisé par « marge »).
MP.PARAMS_TECH = {
  roulette:   { angle: 5,  hauteur: 0.35, amorti: 0.95, frein: 1.00, portee: 13.5 },
  demiPortee: { angle: 30, hauteur: 0.55, amorti: 0.60, frein: 1.00, portee: 13.5 },
  portee:     { angle: 48, hauteur: 0.65, amorti: 0.40, frein: 1.10, portee: 13.5 },
  plombee:    { angle: 63, hauteur: 0.75, amorti: 0.17, frein: 1.35, portee: 13.0 },
  // Tir roulé (« tirSimple ») : la boule part au ras du sol et roule jusqu'à la cible (portée utile :
  // là où elle frappe encore, l'arrêt est « marge » fois plus loin). Rafle : lancée basse et vers le
  // sol, elle touche terre à 1 m au plus de la main, puis file avec puissance, bien plus loin (sol :
  // sensibilité au terrain en roulant ; saut : déviation en touchant un sol irrégulier ; dosage :
  // erreur de force en plus). Tir simple (« tirLeve ») : le premier tir en l'air, il tombe où l'on vise
  // et roule encore ; tir devant et tir au fer, plus hauts, roulent moins.
  tirSimple:  { angle: 2,  hauteur: 0.15, amorti: 0.95, frein: 1.00, portee: 8.0, marge: 1.6 },
  rafle:      { angle: -22, hauteur: 0.40, amorti: 0.85, frein: 0.60, portee: 10.0, marge: 1.3, sol: 0.6, saut: 0.25, dosage: 1.1 },
  tirLeve:    { angle: 16, hauteur: 0.85, amorti: 0.70, frein: 1.00, portee: 12.0, vol: true },
  tirDevant:  { angle: 24, hauteur: 1.00, amorti: 0.58, frein: 1.00, portee: 12.0, vol: true },
  tirAuFer:   { angle: 28, hauteur: 1.10, amorti: 0.50, frein: 1.00, portee: 12.0, vol: true }
};

MP.Monde = function (terrain, aleatoire) {
  this.terrain = terrain;
  this.alea = aleatoire || null;
  this.corps = [];
  this.marques = [];      // traces laissées au sol par les boules qui tombent
  this.evenements = [];   // chocs et chutes, pour le son et la poussière
  this.relief = null;     // pentes, boue, trous… (MP.Relief), ou rien sur un terrain plat
  this.vent = null;       // { x, z } : poussée du vent sur les boules en l'air (m/s²)
  this.taille = 1;        // taille des boules et du cochonnet (MP.tailleObjets)
  this.temps = 0;
  this.prochainId = 1;
};

MP.Monde.prototype.ajouter = function (o) {
  var M = MP.MESURES;
  var c = {
    id: this.prochainId++,
    type: o.type || 'boule',
    camp: o.camp || 'adverse',
    x: o.x, z: o.z, y: o.y != null ? o.y : (o.type === 'cochonnet' ? M.rayonCochonnet : M.rayonBoule) * this.taille,
    vx: o.vx || 0, vz: o.vz || 0, vy: o.vy || 0,
    r: (o.type === 'cochonnet' ? M.rayonCochonnet : M.rayonBoule) * this.taille,
    m: o.type === 'cochonnet' ? M.masseCochonnet : M.masseBoule,
    vol: !!o.vol,
    mort: false,
    spin: o.spin || 0,          // poussée de côté en roulant (m/s²), pour les effets
    // Freinage propre à la technique ; le cochonnet, léger et en bois, freine bien plus qu'une boule.
    frein: o.frein || (o.type === 'cochonnet' ? MP.FREIN_COCHONNET : 1),
    amorti: o.amorti || 1,      // part de la vitesse gardée à la chute
    retro: o.retro || 0,
    saut: o.saut || 0,          // déviation en tombant sur un sol irrégulier (rafle)
    aTouche: false,             // la boule a déjà touché le sol au moins une fois
    contacts: [],               // ids des corps touchés, dans l'ordre
    depart: { x: o.x, z: o.z },
    style: o.style || null,
    rotation: 0,
    axe: 0
  };
  this.corps.push(c);
  return c;
};

MP.FREIN_COCHONNET = 2.6;

// Le sol sous la boule (MP.Relief.sous), la part des pentes plafonnée à PENTE_FROTTEMENT fois le
// frottement du terrain : la pente pousse fort, mais une boule peut toujours s'y arrêter. Sur une
// pente courte et raide (PENTE_RAIDE), elle pousse plus fort que le frottement : la boule y file.
MP.PENTE_FROTTEMENT = 0.8;
MP.PENTE_RAIDE = 1.5;
MP.solPlafonne = function (relief, T, x, z) {
  var sol = relief.sous(x, z), p = Math.hypot(sol.pax, sol.paz), lim = (sol.raide ? MP.PENTE_RAIDE : MP.PENTE_FROTTEMENT) * T.frottement;
  if (p > lim) { var k = (p - lim) / p; sol.ax -= sol.pax * k; sol.az -= sol.paz * k; sol.pax -= sol.pax * k; sol.paz -= sol.paz * k; }
  return sol;
};

MP.Monde.prototype.enMouvement = function () {
  for (var i = 0; i < this.corps.length; i++) {
    var c = this.corps[i];
    if (c.vol || c.vx * c.vx + c.vz * c.vz > 1e-6) return true;
  }
  return false;
};

MP.Monde.prototype.etape = function (dt) {
  var T = this.terrain, M = MP.MESURES, i, j;
  this.temps += dt;
  for (i = 0; i < this.corps.length; i++) {
    var c = this.corps[i];
    if (c.vol) {
      c.aBouge = true;
      c.vy -= MP.GRAVITE * dt;
      // Le vent pousse la boule tant qu'elle est en l'air.
      if (this.vent) { c.vx += this.vent.x * dt; c.vz += this.vent.z * dt; }
      c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      if (c.y <= c.r && c.vy < 0) this.chute(c);
    } else {
      var v = Math.hypot(c.vx, c.vz);
      // Une boule arrêtée sur une pente plus raide que le frottement (le bord d'une cuvette) repart
      // vers le bas ; sauf celles posées au début et jamais touchées, déjà en équilibre.
      if (v === 0 && this.relief && c.aBouge && !c.mort) {
        var ici = MP.solPlafonne(this.relief, T, c.x, c.z), p0 = Math.hypot(ici.ax, ici.az);
        if (!ici.trou && p0 > T.frottement * c.frein * ici.frein * 1.05 && !this.calee(c, ici.ax, ici.az)) {
          c.vx = ici.ax / p0 * 0.001; c.vz = ici.az / p0 * 0.001; v = 0.001;
        }
      }
      if (v > 0) {
        c.aBouge = true;
        var ux = c.vx / v, uz = c.vz / v;
        // Effet gauche / droite : poussée sur le côté qui s'use avec le temps.
        if (c.spin) {
          // La droite de la course est la direction (uz, -ux).
          c.vx += uz * c.spin * dt;
          c.vz += -ux * c.spin * dt;
          c.spin *= Math.exp(-dt / 1.6);
          if (Math.abs(c.spin) < 0.002) c.spin = 0;
        }
        // Relief : pente, dévers, bosse ou creux poussent la boule ; boue et creux freinent ; un trou la garde.
        var freinSol = 1, px = 0, pz = 0, poussee = 0;
        if (this.relief) {
          var sol = MP.solPlafonne(this.relief, T, c.x, c.z);
          if (sol.trou && v < MP.PIEGE_TROU) {
            c.x = sol.trou.x; c.z = sol.trou.z; c.vx = c.vz = 0; c.spin = 0;
            if (!c.dansTrou) { c.dansTrou = true; this.evenements.push({ genre: 'trou', corps: c.id, x: c.x, z: c.z }); }
            continue;
          }
          if (sol.trou && c.surTrou !== sol.trou) { c.vx *= 0.7; c.vz *= 0.7; }
          c.surTrou = sol.trou;
          c.vx += sol.ax * dt; c.vz += sol.az * dt;
          freinSol = sol.frein; px = sol.ax; pz = sol.az; poussee = Math.hypot(px, pz);
        }
        // Irrégularités du sol : petites déviations au fil de la course.
        if (this.alea && T.irregulier > 0) {
          var force = T.irregulier * (c.sensibleSol != null ? c.sensibleSol : 1);
          var coup = this.alea.gauss() * force * Math.sqrt(dt) * Math.min(v, 3) * 0.9;
          c.vx += uz * coup; c.vz += -ux * coup;
        }
        v = Math.hypot(c.vx, c.vz);
        var retenue = T.frottement * c.frein * freinSol, nv = v - retenue * dt;
        if (nv < 0.012) {
          // Presque arrêtée : elle s'arrête, sauf si le sol la fait glisser plus fort que le frottement
          // (le bord d'une cuvette ou d'une bosse) et que rien ne la cale.
          if (poussee > retenue * 1.05 && !this.calee(c, px, pz)) {
            nv = Math.max(nv, (poussee - retenue) * dt);
            c.vx = px / poussee * nv; c.vz = pz / poussee * nv;
          } else { c.vx = 0; c.vz = 0; c.spin = 0; }
        }
        else { c.vx *= nv / v; c.vz *= nv / v; }
        c.x += c.vx * dt; c.z += c.vz * dt;
        if (this.relief) this.relief.racines(c);
        c.rotation += (nv > 0 ? nv : 0) * dt / c.r;
        c.axe = Math.atan2(c.vx, c.vz);
      }
    }
    // Contre la bordure : la boule s'y arrête, reste visible, et elle est morte (hors jeu).
    var limX = M.largeurTerrain / 2 - c.r, limZ = M.longueurTerrain - c.r;
    if (Math.abs(c.x) > limX || c.z > limZ || c.z < -1.5) {
      c.x = Math.max(-limX, Math.min(limX, c.x)); c.z = Math.max(-1.5, Math.min(limZ, c.z));
      c.vx = c.vz = c.vy = 0; c.spin = 0;
      if (c.vol) { c.vol = false; c.y = c.r; }
      if (!c.mort) {
        c.mort = true;
        this.evenements.push({ genre: 'sortie', corps: c.id, x: c.x, z: c.z });
      }
    }
  }
  for (i = 0; i < this.corps.length; i++) {
    for (j = i + 1; j < this.corps.length; j++) this.choc(this.corps[i], this.corps[j]);
  }
};

// Une boule poussée par le sol contre une autre boule (ou le cochonnet) au repos s'y appuie et ne glisse pas.
MP.Monde.prototype.calee = function (c, px, pz) {
  for (var i = 0; i < this.corps.length; i++) {
    var o = this.corps[i];
    if (o === c || o.vol) continue;
    var dx = o.x - c.x, dz = o.z - c.z, rr = o.r + c.r + 0.003;
    if (dx * dx + dz * dz < rr * rr && dx * px + dz * pz > 0) return true;
  }
  return false;
};

MP.Monde.prototype.chute = function (c) {
  var T = this.terrain;
  var vitesseChute = -c.vy;
  c.y = c.r;
  this.marques.push({ x: c.x, z: c.z, force: Math.min(1, vitesseChute / 7), corps: c.id });
  this.evenements.push({ genre: 'sol', corps: c.id, force: Math.min(1, vitesseChute / 8), x: c.x, z: c.z });
  if (!c.aTouche) c.premiereChute = { x: c.x, z: c.z };
  // Une boule rasante qui tombe sur un sol irrégulier part un peu de travers.
  if (c.saut && this.alea && T.irregulier > 0) {
    var dev = this.alea.gauss() * T.irregulier * c.saut * (c.sensibleSol != null ? c.sensibleSol : 1);
    var cs = Math.cos(dev), sn = Math.sin(dev), vx = c.vx;
    c.vx = vx * cs - c.vz * sn; c.vz = vx * sn + c.vz * cs;
  }
  var amorti = (c.aTouche ? 0.9 : c.amorti) * T.amorti;
  // Rétro : la boule mord le sol à sa première chute ; il en reste la moitié pour un choc ensuite.
  if (!c.aTouche && c.retro) { amorti *= (1 - c.retro); c.retro *= 0.5; }
  // Effet gauche / droite : en touchant le sol, la boule part franchement de son côté.
  if (!c.aTouche && c.spin) {
    var vh = Math.hypot(c.vx, c.vz);
    if (vh > 0.05) { var kick = c.spin * 0.6, ux = c.vx / vh, uz = c.vz / vh; c.vx += uz * kick; c.vz -= ux * kick; }
  }
  // Dans un trou, la boule reste ; dans la boue, elle s'enfonce et roule à peine.
  var dessous = this.relief ? this.relief.chute(c) : null;
  if (dessous === 'trou') { c.y = c.r; c.vy = 0; c.vol = false; c.aTouche = true; c.dansTrou = true; return; }
  if (dessous === 'boue') amorti *= 0.25;
  c.vx *= amorti; c.vz *= amorti;
  c.aTouche = true;
  var rebond = dessous === 'boue' ? 0 : vitesseChute * T.rebond * (c.rebondFacteur || 1);
  if (rebond > 0.45) { c.vy = rebond; c.vol = true; }
  else { c.vy = 0; c.vol = false; }
};

MP.Monde.prototype.choc = function (a, b) {
  if (a.vol && b.vol) return;
  var ay = a.vol ? a.y : a.r, by = b.vol ? b.y : b.r;
  var dx = b.x - a.x, dz = b.z - a.z, dy = (a.vol || b.vol) ? by - ay : 0;
  var rr = a.r + b.r;
  var d2 = dx * dx + dz * dz + dy * dy;
  // Vue du dessus, l'une recouvre l'autre mais passe au-dessus : on le note (« passée au-dessus »).
  if (d2 >= rr * rr && dx * dx + dz * dz < rr * rr) {
    var haute = a.vol && (!b.vol || a.y > b.y) ? a : b, basse = haute === a ? b : a;
    if (!haute.survole) haute.survole = [];
    if (haute.survole.indexOf(basse.id) < 0) haute.survole.push(basse.id);
  }
  if (d2 >= rr * rr || d2 === 0) return;
  var d = Math.sqrt(d2);
  var nx = dx / d, nz = dz / d, ny = dy / d;
  var vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz + (a.vy - b.vy) * ny;
  // Séparation : les boules ne restent jamais l'une dans l'autre.
  var recouvrement = rr - d;
  var ia = 1 / a.m, ib = 1 / b.m, somme = ia + ib;
  a.x -= nx * recouvrement * ia / somme; a.z -= nz * recouvrement * ia / somme;
  b.x += nx * recouvrement * ib / somme; b.z += nz * recouvrement * ib / somme;
  if (a.vol) a.y -= ny * recouvrement * ia / somme;
  if (b.vol) b.y += ny * recouvrement * ib / somme;
  if (vrel <= 0) return;
  // Une boule avec effet qui frappe avant d'avoir touché le sol (tir au fer) n'a pas encore roulé : son
  // effet agit au choc. On note son sens de course juste avant.
  var auFer = [a, b].filter(function (o) { return o.spin && o.vol && !o.aTouche && !o.contacts.length; }).map(function (o) {
    var v = Math.hypot(o.vx, o.vz) || 1;
    return { o: o, ux: o.vx / v, uz: o.vz / v, spin: o.spin };
  });
  var e = (a.type === 'cochonnet' || b.type === 'cochonnet') ? 0.45 : 0.82;
  var J = (1 + e) * vrel / somme;
  a.vx -= J * ia * nx; a.vz -= J * ia * nz;
  b.vx += J * ib * nx; b.vz += J * ib * nz;
  // Une boule au sol frappée par le dessus ne s'envole pas : le sol absorbe la poussée verticale.
  if (a.vol) a.vy -= J * ia * ny; else a.vy = 0;
  if (b.vol) b.vy += J * ib * ny; else b.vy = 0;
  // Premier choc d'une boule : avait-elle déjà touché le sol ? (tir au fer)
  if (!a.contacts.length) a.premierChocEnVol = !a.aTouche;
  if (!b.contacts.length) b.premierChocEnVol = !b.aTouche;
  if (a.contacts[a.contacts.length - 1] !== b.id) a.contacts.push(b.id);
  if (b.contacts[b.contacts.length - 1] !== a.id) b.contacts.push(a.id);
  // Après un choc, la boule lancée garde l'essentiel de son effet ; celle qu'elle frappe, presque rien.
  a.spin *= a.camp === 'joueur' ? 0.75 : 0.3; b.spin *= b.camp === 'joueur' ? 0.75 : 0.3;
  // Rétro : la boule lancée reste presque sur place après avoir frappé (comme pour un carreau).
  [a, b].forEach(function (o) {
    if (!o.retro) return;
    var garde = Math.max(0.05, 1 - (0.35 + 1.3 * o.retro));
    o.vx *= garde; o.vz *= garde; o.retro = 0;
  });
  this.evenements.push({ genre: 'choc', a: a.id, b: b.id, force: Math.min(1, vrel / 6), x: (a.x + b.x) / 2, z: (a.z + b.z) / 2,
    cochonnet: a.type === 'cochonnet' || b.type === 'cochonnet' });
  if (this.apresChoc) this.apresChoc(a, b);
  // Effet au fer : après le choc, ta boule file de son côté (la droite de la course est (uz, -ux)).
  // Sa vitesse sur le côté, que le choc rend un peu au hasard, est tirée vers celle de l'effet, d'autant
  // plus que tu le maîtrises (o.controle, de 0 à 0,85) ; la cible part un peu de l'autre côté.
  auFer.forEach(function (t) {
    var o = t.o, autre = o === a ? b : a, sens = t.spin > 0 ? 1 : -1, c = o.controle != null ? o.controle : 0.3;
    var lat = o.vx * t.uz - o.vz * t.ux, k = (sens * MP.EFFET_AU_FER - lat) * c;
    o.vx += t.uz * k; o.vz -= t.ux * k;
    var ka = k * MP.EFFET_AU_FER_CIBLE * o.m / autre.m;
    autre.vx -= t.uz * ka; autre.vz += t.ux * ka;
  });
};
// Effet au fer : vitesse sur le côté (m/s) vers laquelle l'effet tire ta boule après le choc, et part
// rendue à la cible.
MP.EFFET_AU_FER = 1.8;
MP.EFFET_AU_FER_CIBLE = 0.5;

// Vitesse de départ (m/s) d'un lancer : direction (radians, 0 = tout droit, positif = à droite),
// angle de la technique, hauteur de la main.
MP.vitesseDepart = function (vitesse, direction, angleDeg) {
  var a = angleDeg * Math.PI / 180;
  var h = vitesse * Math.cos(a);
  return { vx: h * Math.sin(direction), vz: h * Math.cos(direction), vy: vitesse * Math.sin(a) };
};

// Lance une boule seule, sans autre boule ni sol irrégulier : sert à prévoir
// la chute et l'arrêt, et à régler la force maximale de chaque technique.
MP.simulerSeul = function (terrain, lancer, avecTrajet, relief, taille) {
  var monde = new MP.Monde(terrain, null);
  monde.relief = relief || null;
  monde.taille = taille || 1;
  var v = MP.vitesseDepart(lancer.vitesse, lancer.direction, MP.PARAMS_TECH[lancer.technique].angle);
  var b = monde.ajouter({ type: 'boule', camp: 'joueur', x: lancer.x0 || 0, z: lancer.z0 != null ? lancer.z0 : 0.3,
    y: MP.PARAMS_TECH[lancer.technique].hauteur, vx: v.vx, vz: v.vz, vy: v.vy, vol: true,
    spin: lancer.spin, frein: lancer.frein, amorti: lancer.amorti, retro: lancer.retro });
  var trajet = [], chute = null, n = 0;
  while (n++ < 240 * 20) {
    if (avecTrajet && n % 3 === 0 && (b.vol || b.vx || b.vz)) trajet.push({ x: b.x, y: b.vol ? b.y : b.r, z: b.z, vol: b.vol });
    monde.etape(MP.PAS);
    if (!chute && b.aTouche) chute = { x: b.x, z: b.z };
    if (!monde.enMouvement()) break;
  }
  return { chute: chute || { x: b.x, z: b.z }, arret: { x: b.x, z: b.z }, trajet: trajet, mort: b.mort };
};

// Force maximale de chaque technique : la boule lancée tout droit sur le boulodrome
// s'arrête (pointage) ou tombe (tir) à la portée prévue.
MP.vitessesMax = {};
MP.reglerVitesses = function () {
  var boulodrome = MP.TERRAINS[0];
  Object.keys(MP.PARAMS_TECH).forEach(function (id) {
    var p = MP.PARAMS_TECH[id];
    var bas = 1, haut = 25;
    for (var k = 0; k < 30; k++) {
      var milieu = (bas + haut) / 2;
      var r = MP.simulerSeul(boulodrome, { technique: id, vitesse: milieu, direction: 0, spin: 0,
        frein: p.frein, amorti: p.amorti, retro: 0 });
      var dist = p.vol ? r.chute.z : r.arret.z / (p.marge || 1);
      if (dist > p.portee) haut = milieu; else bas = milieu;
    }
    MP.vitessesMax[id] = (bas + haut) / 2;
  });
};
