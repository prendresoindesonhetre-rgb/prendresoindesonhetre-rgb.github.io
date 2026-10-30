// Ma Pétanque — relief du terrain : pentes, dévers, bosses, creux, boue, trous et racines.
// Chaque accident est une zone du sol ; la physique demande au relief ce qu'il y a sous la boule.
// Les premiers paliers sont plats ; plus on monte, plus le terrain est accidenté. Une piste sert
// 10 niveaux de suite et s'use : chaque boule qui tombe y laisse un creux. Puis elle est refaite.
'use strict';
var MP = window.MP || (window.MP = {});

// Zones (coordonnées du terrain, en mètres) :
//  pente  : rectangle x1..x2, z1..z2 ; ax, az = poussée vers le bas (m/s²) : descente az > 0, montée az < 0, dévers ax ≠ 0.
//  bosse  : cercle x, z, r ; force > 0 pousse vers l'extérieur (bosse), < 0 attire vers le centre (creux).
//  boue   : ellipse x, z, rx, rz, angle ; freine 4 fois plus, une boule qui tombe dedans s'enfonce.
//  trou   : cercle x, z, r ; une boule lente qui y entre, ou qui tombe dedans, y reste.
//  racine : segment x1, z1 → x2, z2 ; une boule lente bute dessus et s'arrête, une rapide la franchit en ralentissant.
//  creux  : cercle x, z, r, profondeur (0 à 1) ; laissé par les boules tombées : attire et freine un peu.
MP.PIEGE_TROU = 2.0;      // m/s : en dessous, la boule reste dans le trou
MP.SEUIL_RACINE = 1.1;    // m/s : en dessous (vitesse vers la racine), la boule bute et s'arrête
MP.FREIN_BOUE = 4;
// Bosse ou cuvette : poussée la plus forte (m/s², à mi-pente) selon sa force (0,2 à 1,3).
// Une cuvette aspire un peu plus fort qu'une bosse ne repousse : la boule y glisse vers le fond.
MP.pousseeBosse = function (force) { return (force < 0 ? 1.25 : 1) * (1.4 + 2 * Math.min(1.2, Math.abs(force))); };
MP.POUSSEE_CREUX = 7;     // m/s² par unité de pente d'un creux d'usure

MP.Relief = function (zones) { this.zones = zones || []; };

// ---------- Formes partagées par la physique et le dessin ----------
// La boule réagit exactement là où l'on voit le relief : bords irréguliers de la boue, des trous,
// des cuvettes, et racine qui ondule et ne sort de terre que par endroits.

MP.hachage = function (ix, iz, graine) {
  var h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(graine | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
MP.bruit = function (x, z, graine) {
  var ix = Math.floor(x), iz = Math.floor(z);
  var fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  var a = MP.hachage(ix, iz, graine), b = MP.hachage(ix + 1, iz, graine);
  var c = MP.hachage(ix, iz + 1, graine), d = MP.hachage(ix + 1, iz + 1, graine);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
};
MP.fbm = function (x, z, g) { return 0.55 * MP.bruit(x, z, g) + 0.3 * MP.bruit(x * 2.1 + 3.7, z * 2.1, g + 1) + 0.15 * MP.bruit(x * 4.3, z * 4.3 + 1.3, g + 2); };
MP.graineDe = function (x, z) { return Math.floor(x * 733 + z * 2459 + 1e6) >>> 0; };
MP.lisse = function (a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
var lisse = MP.lisse;

var formes = typeof WeakMap === 'function' ? new WeakMap() : null;
function memoForme(o, faire) {
  if (!formes) return faire();
  var f = formes.get(o);
  if (!f) { f = faire(); formes.set(o, f); }
  return f;
}

// Force des pentes : la boule y prend nettement de la vitesse en descente et cale en montée (deux fois
// la pente nominale ; le terrain entier en pente, un peu moins). La physique la plafonne selon le sol
// (MP.PENTE_FROTTEMENT), pour qu'une boule puisse toujours s'arrêter, même sur le bitume.
MP.FORCE_PENTE = 2;
// Les pentes courtes des niveaux sont plus raides (RAIDEUR) et peuvent dépasser le frottement : une
// boule ne s'y arrête pas (MP.solPlafonne, PENTE_RAIDE).
MP.RAIDEUR = 2.2;
MP.FORCE_PENTE_TERRAIN = 1.4;
// attenue : les étapes de la Montagne, réglées une à une, gardent leur force de pente d'origine.
MP.forcePente = function (o) { return (o.globale ? MP.FORCE_PENTE_TERRAIN : MP.FORCE_PENTE) * (o.attenue || 1); };
// Petite pente locale (type « plan ») : un rectangle incliné posé n'importe où, dans n'importe quel
// sens : centre (x, z), sens de la descente (dx, dz), longueur L dans ce sens, largeur W en travers,
// force f (m/s² avant MP.forcePente). locPlan : coordonnées locales u (vers le bas) et v (en travers).
MP.locPlan = function (o, x, z) {
  var ex = x - o.x, ez = z - o.z;
  return { u: ex * o.dx + ez * o.dz, v: -ex * o.dz + ez * o.dx };
};
MP.plan = function (x, z, ang, L, W, f, raide) {
  return { type: 'plan', x: x, z: z, dx: Math.sin(ang), dz: Math.cos(ang), L: L, W: W, f: f, raide: !!raide };
};
// Dos d'âne en travers, centré en (x, z) : deux petites pentes raides dos à dos (crête au milieu), la
// boule ralentit en montant et file en redescendant ; une boule lente ne passe pas. tilt : son biais.
MP.dosDane = function (x, z, tilt, L, W, f) {
  var ux = Math.sin(tilt), uz = Math.cos(tilt);
  var montee = MP.plan(x - ux * L / 4, z - uz * L / 4, tilt + Math.PI, L / 2, W, f, true), descente = MP.plan(x + ux * L / 4, z + uz * L / 4, tilt, L / 2, W, f, true);
  montee.dos = descente.dos = true;
  montee.paire = descente.paire = Math.round(x * 1000) + ',' + Math.round(z * 1000);
  return [montee, descente];
};
// Empreinte au sol d'une forme (ce qu'on en voit, ombre comprise) : un rectangle orienté
// { x, z, ux, uz, a, b } (centre, axe, demi-longueur sur l'axe, demi-largeur en travers).
MP.empreinte = function (o) {
  var l;
  switch (o.type) {
    case 'plan':
      // Une pente se voit aussi derrière son sommet, là où le haut se fond dans le terrain.
      // Une pente en relief porte une ombre sur ses côtés : elle compte aussi.
      var P = o.dos ? 0 : 0.25 + 0.35 * o.L, ombre = o.raide || o.dos ? 0.2 : 0;
      return { x: o.x - o.dx * P / 2, z: o.z - o.dz * P / 2, ux: o.dx, uz: o.dz, a: (o.L + P) / 2 + ombre / 2, b: o.W / 2 + ombre };
    case 'bosse': return { x: o.x, z: o.z, ux: 1, uz: 0, a: o.r * 1.25, b: o.r * 1.25 };
    case 'trou': return { x: o.x, z: o.z, ux: 1, uz: 0, a: o.r + 0.05, b: o.r + 0.05 };
    case 'boue': return { x: o.x, z: o.z, ux: Math.cos(o.angle || 0), uz: Math.sin(o.angle || 0), a: o.rx + 0.06, b: o.rz + 0.06 };
    case 'racine':
      l = Math.hypot(o.x2 - o.x1, o.z2 - o.z1) || 1;
      return { x: (o.x1 + o.x2) / 2, z: (o.z1 + o.z2) / 2, ux: (o.x2 - o.x1) / l, uz: (o.z2 - o.z1) / l, a: l / 2 + 0.05, b: 0.08 };
    case 'pente':
      return o.globale ? null : { x: (o.x1 + o.x2) / 2, z: (o.z1 + o.z2) / 2, ux: 0, uz: 1, a: (o.z2 - o.z1) / 2, b: (o.x2 - o.x1) / 2 };
  }
  return null;   // usure de la piste : des marques, pas des formes
};
// Deux rectangles orientés se touchent-ils (à la marge près) ? (Axes séparateurs.)
MP.empreintesTouchent = function (e, f, marge) {
  var axes = [[e.ux, e.uz], [-e.uz, e.ux], [f.ux, f.uz], [-f.uz, f.ux]], dx = f.x - e.x, dz = f.z - e.z;
  return axes.every(function (n) {
    var re = e.a * Math.abs(e.ux * n[0] + e.uz * n[1]) + e.b * Math.abs(-e.uz * n[0] + e.ux * n[1]);
    var rf = f.a * Math.abs(f.ux * n[0] + f.uz * n[1]) + f.b * Math.abs(-f.uz * n[0] + f.ux * n[1]);
    return Math.abs(dx * n[0] + dz * n[1]) <= re + rf + marge;
  });
};
// Rien ne se chevauche : pentes (petites, grandes, dos d'âne) et accidents (bosse, cuvette, boue,
// trou, racine) restent chacun à leur place. Seules les deux moitiés d'un dos d'âne se touchent.
MP.genreForme = function (o) {
  if (o.type === 'plan') return o.raide || o.dos ? 'relief' : 'fond';
  if (o.type === 'pente') return o.globale ? null : 'relief';
  return MP.empreinte(o) ? 'objet' : null;
};
MP.formesChevauchent = function (o, p) {
  var g = MP.genreForme(o), h = MP.genreForme(p);
  if (!g || !h || (o.paire && o.paire === p.paire)) return false;
  return MP.empreintesTouchent(MP.empreinte(o), MP.empreinte(p), 0.12);
};
// Ajoute à zones une forme (ou un dos d'âne) tirée par fabrique(), retirée (jusqu'à essais fois, 10 par
// défaut) tant qu'elle chevaucherait une autre forme ; sinon, rien. Rend vrai si elle est posée.
MP.placerForme = function (zones, fabrique, essais) {
  for (var e = 0; e < (essais || 10); e++) {
    var f = [].concat(fabrique());
    if (f.every(function (o) { return zones.every(function (p) { return !MP.formesChevauchent(o, p); }); })) {
      zones.push.apply(zones, f); return true;
    }
  }
  return false;
};
// Ajoute à zones les formes d'une autre liste, sauf celles qui en chevaucheraient une (un dos d'âne
// reste entier ou part en entier).
MP.ajouterFormes = function (zones, formes) {
  var vus = {};
  formes.forEach(function (o) {
    if (!o.paire) { MP.placerForme(zones, function () { return o; }, 1); return; }
    if (vus[o.paire]) return;
    vus[o.paire] = true;
    MP.placerForme(zones, function () { return formes.filter(function (p) { return p.paire === o.paire; }); }, 1);
  });
  return zones;
};
// Les zones sans les petites pentes raides sous (x, z) (un dos d'âne part en entier).
MP.sansRaideSous = function (zones, x, z, marge) {
  var ote = {};
  zones.forEach(function (o) { if (MP.raideSous(o, x, z, marge)) ote[o.paire || ''] = true; });
  return zones.filter(function (o) { return !MP.raideSous(o, x, z, marge) && !(o.paire && ote[o.paire]); });
};
// Terrain en pente : tout le terrain est fait de formes. De grandes pentes douces penchent surtout
// d'un côté (cote), avec de petites pentes raides dans tous les sens et un ou deux dos d'âne.
MP.formesEnPente = function (graine, cote, zMax) {
  var a = new MP.Aleatoire((graine ^ 0x2545f491) >>> 0), zones = [], k, z = a.entre(0.3, 1), zm = Math.min(10.5, zMax || 10.5);
  // Une grande pente douce, puis les formes en relief, puis d'autres grandes pentes dans la place qui reste.
  function douce() {
    return MP.plan(a.entre(-0.9, 0.9), a.entre(z, zm), cote * Math.PI / 2 + a.entre(-0.35, 0.35), a.entre(1.2, 1.8), a.entre(1.4, 2.2), a.entre(0.26, 0.34), false);
  }
  MP.placerForme(zones, douce);
  MP.placerForme(zones, function () { return MP.dosDane(a.entre(-0.6, 0.6), a.entre(2.5, Math.min(9, zm - 0.5)), a.entre(-0.3, 0.3), a.entre(0.35, 0.55), a.entre(1.4, 2.4), MP.RAIDEUR * a.entre(0.3, 0.45)); });
  for (k = 0; k < 3; k++) MP.placerForme(zones, function () { return MP.plan(a.entre(-1.3, 1.3), a.entre(1.5, zm), a.entre(0, 2 * Math.PI), a.entre(0.5, 1), a.entre(0.5, 1.1), MP.RAIDEUR * a.entre(0.35, 0.55), true); });
  for (k = 0; k < 5; k++) MP.placerForme(zones, douce, 20);
  return zones;
};
// Une zone raide (où une boule ne tient pas) sous le point (x, z), à la marge près.
MP.raideSous = function (o, x, z, marge) {
  if (!o.raide) return false;
  if (o.type === 'plan') { var q = MP.locPlan(o, x, z); return Math.abs(q.u) < o.L / 2 + marge && Math.abs(q.v) < o.W / 2 + marge; }
  return o.type === 'pente' && z > o.z1 - marge && z < o.z2 + marge;
};
// Pente : pleine au milieu de sa bande, elle se fond aux deux bouts (comme dessinée).
MP.fenetrePente = function (o, z) {
  if (o.globale) return 1;   // tout le terrain penche : pas de bords
  var t = (z - o.z1) / (o.z2 - o.z1); return lisse(0, 0.2, t) * lisse(1, 0.8, t);
};

// Bosse ou cuvette : hauteur sans unité en fonction de (u, v) = position / rayon ; 1 au sommet d'une
// bosse, -1 au fond d'une cuvette (avec un léger bourrelet), bord ondulé, fond un peu décentré.
MP.formeBosse = function (o) {
  return memoForme(o, function () {
    var creuse = o.force < 0, h = new MP.Aleatoire(MP.graineDe(o.x, o.z));
    var ondes = [[2, h.entre(0.05, 0.1), h.entre(0, 6.3)], [3, h.entre(0.03, 0.07), h.entre(0, 6.3)], [5, h.entre(0.01, 0.03), h.entre(0, 6.3)]];
    var bx = h.entre(-0.15, 0.15), bz = h.entre(-0.15, 0.15);
    return function (u, v) {
      // Le bord ondule, mais pas le fond (sinon une pointe se dessine au centre).
      var w = Math.max(0, 1 - u * u - v * v), pu = u - bx * w, pv = v - bz * w, d2 = pu * pu + pv * pv;
      var an = Math.atan2(pv, pu), rr = 0;
      for (var i = 0; i < 3; i++) rr += ondes[i][1] * Math.cos(ondes[i][0] * an + ondes[i][2]);
      var rho = Math.sqrt(d2) / (1 + rr * d2 / (d2 + 0.12)), b = rho < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * rho) : 0;
      if (!creuse) return b;
      return -b + 0.07 * Math.exp(-Math.pow((rho - 1.03) / 0.16, 2));
    };
  });
};

// Creux d'usure : hauteur en rayons, petit cratère au bord légèrement relevé.
MP.formeCreux = function (o) {
  return memoForme(o, function () {
    var gr = MP.graineDe(o.x, o.z);
    return function (u, v) {
      var rho = Math.hypot(u, v) / (1 + 0.2 * (MP.bruit(u * 1.5 + 4, v * 1.5, gr) - 0.5));
      return -0.2 * o.profondeur * lisse(1, 0.2, rho) + 0.04 * Math.exp(-Math.pow((rho - 1.1) / 0.2, 2));
    };
  });
};

// Boue : « distance au bord » en repère de la plaque (u, v) : moins de 1 dedans, bord irrégulier.
MP.bordBoue = function (o, u, v) {
  var gr = MP.graineDe(o.x, o.z);
  return Math.hypot(u / o.rx, v / o.rz) + (MP.fbm(u * 4.5, v * 4.5, gr) - 0.5) * 0.5 + (MP.bruit(u * 16, v * 16, gr + 7) - 0.5) * 0.1;
};
MP.dansBoue = function (o, x, z) {
  var c = Math.cos(o.angle || 0), s = Math.sin(o.angle || 0), dx = x - o.x, dz = z - o.z;
  var u = dx * c + dz * s, v = -dx * s + dz * c;
  if (Math.hypot(u / o.rx, v / o.rz) > 1.5) return false;
  return MP.bordBoue(o, u, v) < 0.97;
};

// Trou : distance au centre rapportée à son bord irrégulier (1 = le bord).
MP.rhoTrou = function (o, x, z) {
  var u = x - o.x, v = z - o.z, an = Math.atan2(v, u), gr = MP.graineDe(o.x, o.z);
  return Math.hypot(u, v) / (o.r * (1 + 0.32 * (MP.bruit(Math.cos(an) * 1.6 + 3, Math.sin(an) * 1.6 + 3, gr) - 0.5)));
};

// Racine : une suite de points [x, z, rayon, profondeur de l'axe sous le sol]. Elle ondule, s'amincit,
// a des nœuds, et sort de terre en deux ou trois bosses ; enterrée aux deux bouts.
MP.formeRacine = function (o) {
  return memoForme(o, function () {
    var gr = MP.graineDe(o.x1 + o.x2, o.z1 + o.z2), a = new MP.Aleatoire(gr);
    var dx = o.x2 - o.x1, dz = o.z2 - o.z1, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
    var R0 = a.entre(0.036, 0.046), bosses = a.suivant() < 0.5 ? 2 : 3, ph = a.entre(0, 6.3), pts = [];
    for (var k = 0; k <= 36; k++) {
      var t = k / 36, s = 1 - t;
      var c1x = o.x1 + dx * 0.33 + nx * 0.04, c1z = o.z1 + dz * 0.33 + nz * 0.04, c2x = o.x1 + dx * 0.66 - nx * 0.035, c2z = o.z1 + dz * 0.66 - nz * 0.035;
      var px = s * s * s * o.x1 + 3 * s * s * t * c1x + 3 * s * t * t * c2x + t * t * t * o.x2;
      var pz = s * s * s * o.z1 + 3 * s * s * t * c1z + 3 * s * t * t * c2z + t * t * t * o.z2;
      var R = R0 * (1 - 0.35 * t) * (0.8 + 0.4 * MP.bruit(t * 9, 0.5, gr)), ond = 0.018 * Math.sin(t * 9 + ph) + 0.008 * Math.sin(t * 23);
      var sort = Math.pow(Math.abs(Math.sin(Math.PI * t * bosses)), 0.6) * lisse(0, 0.08, t) * lisse(1, 0.92, t);
      pts.push([px + nx * ond, pz + nz * ond, R, R * (1.15 - 1.05 * sort + 0.2 * (MP.bruit(t * 6, 1.5, gr) - 0.5))]);
    }
    var boite = [Infinity, -Infinity, Infinity, -Infinity];
    pts.forEach(function (q) { boite[0] = Math.min(boite[0], q[0]); boite[1] = Math.max(boite[1], q[0]); boite[2] = Math.min(boite[2], q[1]); boite[3] = Math.max(boite[3], q[1]); });
    return { pts: pts, boite: boite, longueur: l };
  });
};
// Point de la racine le plus proche de (x, z) : distance, côté, rayon et profondeur à cet endroit.
MP.procheRacine = function (f, x, z) {
  var c = f.pts, best = Infinity, bi = 0, bt = 0, bs = 0, tx = 0, tz = 0;
  for (var i = 0; i < c.length - 1; i++) {
    var ax = c[i][0], az = c[i][1], ux = c[i + 1][0] - ax, uz = c[i + 1][1] - az, ll = ux * ux + uz * uz || 1e-9;
    var t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / ll));
    var ex = x - ax - ux * t, ez = z - az - uz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; bi = i; bt = t; bs = ux * ez - uz * ex; tx = ux; tz = uz; }
  }
  var q0 = c[bi], q1 = c[bi + 1], n = Math.hypot(tx, tz) || 1;
  return { d: Math.sqrt(best), cote: bs >= 0 ? 1 : -1, R: q0[2] + (q1[2] - q0[2]) * bt, prof: q0[3] + (q1[3] - q0[3]) * bt,
    t: (bi + bt) / (c.length - 1), nx: -tz / n, nz: tx / n };
};

// Ce qu'il y a sous une boule au sol : poussée (ax, az), freinage, trou.
MP.Relief.prototype.sous = function (x, z) {
  var r = { ax: 0, az: 0, pax: 0, paz: 0, raide: false, frein: 1, trou: null, boue: false };
  for (var i = 0; i < this.zones.length; i++) {
    var o = this.zones[i], u, v, f, k, e = 0.01;
    switch (o.type) {
      case 'pente':
        if (x >= o.x1 && x <= o.x2 && z >= o.z1 && z <= o.z2) {
          k = MP.fenetrePente(o, z) * MP.forcePente(o);
          r.ax += o.ax * k; r.az += o.az * k; r.pax += o.ax * k; r.paz += o.az * k;   // pax, paz : la part des pentes
          if (o.raide) r.raide = true;
        }
        break;
      case 'plan':
        u = MP.locPlan(o, x, z); v = u.v; u = u.u;
        if (Math.abs(u) < o.L / 2 && Math.abs(v) < o.W / 2) {
          k = lisse(o.L / 2, o.L / 2 - 0.05, Math.abs(u)) * lisse(o.W / 2, o.W * 0.3, Math.abs(v)) * o.f * MP.forcePente(o);
          r.ax += o.dx * k; r.az += o.dz * k; r.pax += o.dx * k; r.paz += o.dz * k;
          if (o.raide) r.raide = true;
        }
        break;
      case 'bosse':
        // La boule descend la pente du relief dessiné, d'autant plus fort que la bosse est marquée.
        u = (x - o.x) / o.r; v = (z - o.z) / o.r;
        if (u * u + v * v < 1.69) {
          f = MP.formeBosse(o);
          k = MP.pousseeBosse(o.force) * 2 / Math.PI;   // la poussée la plus forte, là où la pente l'est
          r.ax -= k * (f(u + e, v) - f(u - e, v)) / (2 * e); r.az -= k * (f(u, v + e) - f(u, v - e)) / (2 * e);
        }
        break;
      case 'creux':
        u = (x - o.x) / o.r; v = (z - o.z) / o.r;
        if (u * u + v * v < 2.25) {
          f = MP.formeCreux(o);
          r.ax -= MP.POUSSEE_CREUX * (f(u + e, v) - f(u - e, v)) / (2 * e); r.az -= MP.POUSSEE_CREUX * (f(u, v + e) - f(u, v - e)) / (2 * e);
          if (u * u + v * v < 1) r.frein *= 1 + 0.6 * o.profondeur;
        }
        break;
      case 'boue':
        if (MP.dansBoue(o, x, z)) { r.frein *= MP.FREIN_BOUE; r.boue = true; }
        break;
      case 'trou':
        if (Math.abs(x - o.x) < o.r * 1.3 && Math.abs(z - o.z) < o.r * 1.3 && MP.rhoTrou(o, x, z) < 1) r.trou = o;
        break;
    }
  }
  return r;
};

// Racines : seules les parties sorties de terre arrêtent la boule. Une boule qui arrive doucement
// s'y arrête ; vite, elle passe par-dessus en perdant de la vitesse (plus la racine est haute, plus).
MP.Relief.prototype.racines = function (c) {
  for (var i = 0; i < this.zones.length; i++) {
    var o = this.zones[i];
    if (o.type !== 'racine') continue;
    var f = MP.formeRacine(o), b = f.boite, cle = 'r' + i, marge = c.r + 0.1;
    if (c.x < b[0] - marge || c.x > b[1] + marge || c.z < b[2] - marge || c.z > b[3] + marge) { if (c.racine === cle) c.racine = null; continue; }
    var p = MP.procheRacine(f, c.x, c.z), haut = p.R - p.prof;
    // Distance (vue de dessus) à laquelle la boule touche la racine, si elle dépasse du sol.
    var contact = haut > 0.006 ? Math.sqrt(Math.max(0, Math.pow(c.r + p.R, 2) - Math.pow(c.r + p.prof, 2))) : 0;
    if (!contact || p.d > contact + 0.02) { if (c.racine === cle && p.d > c.r + 0.06) c.racine = null; continue; }
    if (p.d > contact || c.racine === cle) continue;
    var nx = p.nx * p.cote, nz = p.nz * p.cote, vn = c.vx * nx + c.vz * nz;
    if (vn >= 0) continue;   // elle s'en éloigne
    var seuil = MP.SEUIL_RACINE * Math.min(1.25, Math.sqrt(haut / 0.03));
    if (-vn < seuil) {
      // Bloquée net, contre la racine, du côté d'où elle venait.
      c.vx = 0; c.vz = 0; c.spin = 0;
      c.x += nx * (contact - p.d); c.z += nz * (contact - p.d);
    } else {
      var garde = 1 - 0.45 * Math.min(1, haut / 0.03);
      c.vx *= garde; c.vz *= garde;
      c.racine = cle;
    }
  }
};

// Une boule qui tombe : dans un trou elle y reste, dans la boue elle s'enfonce.
MP.Relief.prototype.chute = function (c) {
  var r = this.sous(c.x, c.z);
  if (r.trou) { c.x = r.trou.x; c.z = r.trou.z; c.vx = c.vz = 0; c.spin = 0; return 'trou'; }
  if (r.boue) return 'boue';
  return null;
};

// ---------- Génération ----------
// Les accidents arrivent avec le palier : petites pentes dès le palier 3, bosses dès 4, boue et dos
// d'âne dès 5, grande pente douce dès 6, trous dès 8, racines dès 11. Les ligues les rendent plus nombreux et plus forts.
MP.creerRelief = function (graine, palier, ligue, zMax) {
  var a = new MP.Aleatoire((graine ^ 0x5bd1e995) >>> 0), zones = [];
  // Distance tirée entre lo et hi, sans aller bien au-delà de là où le joueur joue (zMax).
  function Z(lo, hi) { return a.entre(lo, Math.max(lo + 0.5, Math.min(hi, zMax || 11))); }
  var force = Math.min(1.3, Math.max(0, (palier - 2) / 15) + (ligue || 0) * 0.15);
  var plus = Math.floor(force * 2);
  function chance(p) { return a.suivant() < p; }
  // Formes du terrain : de petites pentes dans tous les sens, parfois une grande pente douce, des dos
  // d'âne en travers, puis les accidents ; rien ne se chevauche (MP.placerForme). Les petites pentes
  // sont raides (une boule n'y tient pas) ; le cochonnet n'y est pas posé (placeLibre).
  var plan = MP.plan, k, n, fPetite = MP.RAIDEUR * (0.3 + 0.5 * force);
  if (palier >= 6 && chance(0.45)) MP.placerForme(zones, function () {
    return plan(a.entre(-0.5, 0.5), Z(3.5, 9), a.entre(0, 2 * Math.PI), a.entre(1.6, 2.4), a.entre(1.8, 2.6), (0.18 + 0.12 * force) * a.entre(0.8, 1), false);
  });
  if (palier >= 5 && chance(0.4)) MP.placerForme(zones, function () {
    return MP.dosDane(a.entre(-0.8, 0.8), Z(2.5, 9.5), a.entre(-0.25, 0.25), a.entre(0.35, 0.6), a.entre(1.2, 2.6), fPetite * a.entre(0.7, 0.9));
  });
  if (palier >= 3) for (k = 0, n = (chance(0.8) ? 1 : 0) + (palier >= 6 && chance(0.6) ? 1 : 0) + Math.min(1, plus); k < n; k++) MP.placerForme(zones, function () {
    return plan(a.entre(-1.3, 1.3), Z(2.2, 10.5), a.entre(0, 2 * Math.PI), a.entre(0.5, 1.2), a.entre(0.5, 1.2), fPetite * a.entre(0.75, 1), true);
  });
  if (palier >= 4) for (k = 0, n = (chance(0.6) ? 1 : 0) + (plus > 1 ? 1 : 0); k < n; k++) MP.placerForme(zones, function () {
    return { type: 'bosse', x: a.entre(-1.4, 1.4), z: Z(3, 11), r: a.entre(0.3, 0.7), force: (chance(0.5) ? 1 : -1) * (0.3 + 0.6 * force) * a.entre(0.6, 1) };
  });
  if (palier >= 5) for (k = 0, n = (chance(0.7) ? 1 : 0) + Math.min(2, plus); k < n; k++) MP.placerForme(zones, function () {
    return { type: 'boue', x: a.entre(-1.4, 1.4), z: Z(3, 11), rx: a.entre(0.18, 0.5), rz: a.entre(0.18, 0.6), angle: a.entre(0, Math.PI) };
  });
  if (palier >= 8) for (k = 0, n = (chance(0.6) ? 1 : 0) + Math.min(2, plus); k < n; k++) MP.placerForme(zones, function () {
    return { type: 'trou', x: a.entre(-1.5, 1.5), z: Z(3, 11), r: a.entre(0.05, 0.1) };
  });
  if (palier >= 11) for (k = 0, n = (chance(0.6) ? 1 : 0) + Math.min(1, plus); k < n; k++) MP.placerForme(zones, function () {
    var cx = a.entre(-1.2, 1.2), cz = Z(3, 10.5), ang = a.entre(-0.5, 0.5) + (chance(0.8) ? 0 : Math.PI / 2), l = a.entre(0.4, 1.1);
    return { type: 'racine', x1: cx - Math.cos(ang) * l / 2, z1: cz - Math.sin(ang) * l / 2, x2: cx + Math.cos(ang) * l / 2, z2: cz + Math.sin(ang) * l / 2 };
  });
  return zones;
};

// Un objet posé au départ ne doit être ni dans un trou ni sur une racine.
// sansRaide : refuser aussi une pente raide (pour le cochonnet : une boule ne pourrait pas s'y arrêter près de lui).
MP.Relief.prototype.placeLibre = function (x, z, r, sansRaide) {
  for (var i = 0; i < this.zones.length; i++) {
    var o = this.zones[i];
    if (sansRaide && MP.raideSous(o, x, z, r + 0.05)) return false;
    if (o.type === 'trou' && Math.hypot(x - o.x, z - o.z) < o.r * 1.2 + r + 0.02) return false;
    if (o.type === 'racine') {
      var f = MP.formeRacine(o), b = f.boite, m = r + 0.1;
      if (x > b[0] - m && x < b[1] + m && z > b[2] - m && z < b[3] + m && MP.procheRacine(f, x, z).d < r + 0.06) return false;
    }
  }
  return true;
};

// Ce que le joueur voit écrit dans le bandeau : la boue, les trous et les racines se voient ;
// le nom et la force des pentes, dévers et bosses seulement avec la Lecture du sol.
MP.Relief.prototype.traits = function (lecture) {
  var t = [], vus = {};
  var noms = { boue: 'Boue', trou: 'Trou', racine: 'Racine' };
  this.zones.forEach(function (o) {
    var nom = noms[o.type];
    // Un terrain tout en pente se voit sans aide : on dit de quel côté il penche.
    if (o.globale) nom = o.ax > 0 ? 'Penche à droite' : 'Penche à gauche';
    else if (!nom && lecture >= 1) {
      if (o.type === 'pente') {
        var f = Math.hypot(o.ax, o.az), fort = f >= 0.6, doux = f < 0.35;
        nom = o.ax ? 'Dévers' + (fort ? ' fort' : (doux ? ' léger' : '')) + (o.ax > 0 ? ' à droite' : ' à gauche')
          : (o.az > 0 ? 'Descente' : 'Montée') + (fort ? ' forte' : (doux ? ' douce' : ''));
      }
      if (o.type === 'plan') nom = o.dos ? 'Dos d’âne' : (o.raide ? 'Petite pente raide' : 'Grande pente douce');
      if (o.type === 'bosse' && lecture >= 3) nom = o.force > 0 ? 'Bosse' : 'Cuvette';
    }
    if (nom && !vus[nom]) { vus[nom] = true; t.push(nom); }
  });
  var creux = this.zones.filter(function (o) { return o.type === 'creux'; }).length;
  if (creux >= 4) t.push('Terrain usé');
  return t;
};

// Difficulté ajoutée au niveau (pour les étoiles).
MP.Relief.prototype.difficulte = function () {
  var p = 0;
  this.zones.forEach(function (o) {
    if (o.type === 'pente') p += 1.5 * Math.hypot(o.ax, o.az) / (o.raide ? MP.RAIDEUR : 1);
    else if (o.type === 'plan') p += o.dos ? 0.45 : (o.raide ? 0.8 : 0.6);
    else if (o.type === 'bosse') p += 0.6;
    else if (o.type === 'boue') p += 0.8;
    else if (o.type === 'trou') p += 1;
    else if (o.type === 'racine') p += 1.2;
    else if (o.type === 'creux') p += 0.1 * o.profondeur;
  });
  return p;
};

// ---------- Piste : 10 niveaux sur le même terrain, qui s'use ----------

MP.NIVEAUX_PISTE = 10;

// Avec mode et boule : un terrain où l'une des techniques du joueur porte à 5 m au moins (le sable
// arrive quand on a de quoi le jouer).
MP.PORTEE_PISTE = 5;
MP.nouvellePiste = function (d, graine, mode, boule) {
  var alea = new MP.Aleatoire(graine >>> 0);
  var vise = (Math.max(1, d.palier) - 1) * 0.85;
  var terrain = MP.choisirTerrain(alea, vise, d.ligue);
  function court(t) { return mode && boule && MP.porteeJoueur(d, boule, mode, t) < MP.PORTEE_PISTE; }
  for (var k = 0; k < 8 && court(terrain); k++) terrain = MP.choisirTerrain(alea, vise, d.ligue);
  if (court(terrain)) terrain = MP.TERRAINS[0];
  // La portée du joueur sur ce terrain : le relief est posé là où il joue.
  var portee = mode && boule ? MP.porteeJoueur(d, boule, mode, terrain) : 0;
  return { graine: graine >>> 0, terrain: MP.TERRAINS.indexOf(terrain), palier: d.palier, ligue: d.ligue, niveaux: 0, usure: [], portee: Math.round(portee * 10) / 10 };
};

// Relief complet d'une piste : ses accidents et l'usure.
MP.reliefPiste = function (piste) {
  var zMax = piste.portee ? piste.portee + 0.4 : 0;
  var zones = MP.creerRelief(piste.graine, piste.palier, piste.ligue, zMax);
  // Terrain en pente : ses formes (tirées avec la piste), sous le relief.
  var terrain = MP.TERRAINS[piste.terrain];
  if (terrain && terrain.formes) zones = MP.ajouterFormes(MP.formesEnPente(piste.graine, piste.graine & 1 ? 1 : -1, zMax), zones);
  piste.usure.forEach(function (u) { zones.push({ type: 'creux', x: u.x, z: u.z, r: u.r, profondeur: u.profondeur }); });
  return new MP.Relief(zones);
};

// Après un lancer : chaque chute de ta boule creuse un peu le terrain.
MP.userPiste = function (piste, marques) {
  piste.niveaux += 1;
  marques.forEach(function (m) {
    if (m.force < 0.2) return;
    var proche = piste.usure.filter(function (u) { return Math.hypot(u.x - m.x, u.z - m.z) < 0.07; })[0];
    if (proche) { proche.profondeur = Math.min(1, proche.profondeur + 0.25 * m.force); proche.r = Math.min(0.12, proche.r + 0.01); }
    else piste.usure.push({ x: m.x, z: m.z, r: 0.05 + 0.03 * m.force, profondeur: 0.2 + 0.3 * m.force });
  });
  // Pas plus de 40 creux : les moins profonds s'effacent.
  piste.usure.sort(function (a, b) { return b.profondeur - a.profondeur; });
  piste.usure.length = Math.min(piste.usure.length, 40);
};
