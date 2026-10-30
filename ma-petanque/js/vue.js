// Ma Pétanque — vue du dessus : le terrain comme un plan, du cercle de lancer jusqu'au fond.
// Une seule échelle pour la largeur et la longueur : les proportions sont exactes.
// En portrait, on lance vers le haut de l'écran ; en paysage, vers la droite.
'use strict';
var MP = window.MP || (window.MP = {});

MP.Vue = function () {
  this.s = 60;          // pixels par mètre
  this.cx = 0;          // point du terrain au centre de la zone libre
  this.cz = 5;
  this.paysage = false;
  this.ox = 0; this.oy = 0;
};

// Point du terrain (x, z) → point de l'écran.
MP.Vue.prototype.ecran = function (x, z) {
  if (this.paysage) return { x: this.ox + (z - this.cz) * this.s, y: this.oy + (x - this.cx) * this.s };
  return { x: this.ox + (x - this.cx) * this.s, y: this.oy - (z - this.cz) * this.s };
};

// Point de l'écran → point du terrain.
MP.Vue.prototype.monde = function (sx, sy) {
  if (this.paysage) return { x: this.cx + (sy - this.oy) / this.s, z: this.cz + (sx - this.ox) / this.s };
  return { x: this.cx + (sx - this.ox) / this.s, z: this.cz - (sy - this.oy) / this.s };
};

// Déplacement à l'écran → direction sur le terrain.
MP.Vue.prototype.versMonde = function (dx, dy) {
  return this.paysage ? { x: dy, z: dx } : { x: dx, z: -dy };
};

// Pour dessiner directement en mètres (sol, bordures, cercle) : ctx.setTransform(...vue.matrice(ratio)).
MP.Vue.prototype.matrice = function (ratio) {
  var s = this.s * ratio;
  if (this.paysage) return [0, s, s, 0, (this.ox - this.cz * this.s) * ratio, (this.oy - this.cx * this.s) * ratio];
  return [s, 0, 0, -s, (this.ox - this.cx * this.s) * ratio, (this.oy + this.cz * this.s) * ratio];
};

// Cadrage : la boîte du terrain [x1, x2] × [z1, z2] tient dans la zone libre de l'écran.
MP.Vue.prototype.cadrage = function (zone, x1, x2, z1, z2, sMax) {
  var larg = x2 - x1, long = z2 - z1;
  var s = this.paysage ? Math.min(zone.l / long, zone.h / larg) : Math.min(zone.l / larg, zone.h / long);
  return { s: Math.min(s, sMax || 1e9), cx: (x1 + x2) / 2, cz: (z1 + z2) / 2 };
};

MP.Vue.prototype.regler = function (zone, c) {
  this.s = c.s; this.cx = c.cx; this.cz = c.cz;
  this.ox = zone.x + zone.l / 2; this.oy = zone.y + zone.h / 2;
};

// Rapproche doucement la vue d'un cadrage (pour les mouvements de caméra).
MP.Vue.prototype.suivre = function (zone, c, k) {
  this.s += (c.s - this.s) * k; this.cx += (c.cx - this.cx) * k; this.cz += (c.cz - this.cz) * k;
  this.ox = zone.x + zone.l / 2; this.oy = zone.y + zone.h / 2;
};

// ---------- Sol ----------

// Une tache douce (ellipse floue) de rayons rx, rz, tournée de an, d'opacité a au centre.
function tacheUsee(ctx, x, z, rx, rz, an, a) {
  ctx.save();
  ctx.translate(x, z); ctx.rotate(an); ctx.scale(rx, rz);
  var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(104,84,78,' + a + ')'); g.addColorStop(0.55, 'rgba(104,84,78,' + (a * 0.6).toFixed(3) + ')'); g.addColorStop(1, 'rgba(104,84,78,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
}
// Le terrain tassé par le jeu, du cercle (0, 0) au but (cx, cz).
function zoneJouee(ctx, cx, cz) {
  var L = Math.hypot(cx, cz) || 1, an = Math.atan2(cz, cx) - Math.PI / 2;
  tacheUsee(ctx, cx / 2, cz / 2, 0.6, L / 2 + 0.5, an, 0.1);                      // le couloir
  tacheUsee(ctx, cx * 0.62, cz * 0.62, 0.55, Math.max(0.7, L * 0.22), an, 0.13);    // la donnée
  tacheUsee(ctx, cx, cz, 0.65, 0.65, 0, 0.1);                                       // autour du but
}

// Carreaux de texture (2 m × 2 m) à plusieurs finesses : on prend celui qui correspond au zoom.
MP.tuilesSol = function (terrain) {
  var cle = '_tuiles';
  if (terrain[cle]) return terrain[cle];
  var tex = MP.textureSol(terrain);
  var tuiles = tex.niveaux.filter(function (n) { return n.n >= 16; }).map(function (niv) {
    var c = document.createElement('canvas');
    c.width = c.height = niv.n;
    var ctx = c.getContext('2d'), img = ctx.createImageData(niv.n, niv.n);
    for (var i = 0, j = 0; i < niv.n * niv.n; i++, j += 3) {
      img.data[i * 4] = niv.px[j]; img.data[i * 4 + 1] = niv.px[j + 1]; img.data[i * 4 + 2] = niv.px[j + 2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
  // Version fine (1024 px pour 2 m) pour les gros plans : la texture agrandie en douceur,
  // avec un grain d'un millimètre par-dessus pour qu'elle ne paraisse jamais floue ni en pavés.
  var fine = document.createElement('canvas');
  fine.width = fine.height = 1024;
  var fc = fine.getContext('2d');
  fc.imageSmoothingEnabled = true;
  fc.imageSmoothingQuality = 'high';
  fc.drawImage(tuiles[0], 0, 0, 1024, 1024);
  var donnees = fc.getImageData(0, 0, 1024, 1024), px = donnees.data, alea = new MP.Aleatoire(MP.TERRAINS.indexOf(terrain) + 99);
  for (var k = 0; k < px.length; k += 4) {
    var g = (alea.suivant() - 0.5) * 22 * Math.min(1.4, terrain.grain + 0.4);
    px[k] += g; px[k + 1] += g; px[k + 2] += g;
  }
  fc.putImageData(donnees, 0, 0);
  tuiles.unshift(fine);
  terrain[cle] = tuiles;
  return tuiles;
};

function motif(ctx, tuiles, pxParMetre) {
  ctx.imageSmoothingEnabled = true;
  // Tuile la plus petite qui garde au moins un texel par pixel.
  var voulu = pxParMetre * MP.TAILLE_CARREAU, choix = tuiles[0];
  for (var i = 0; i < tuiles.length; i++) if (tuiles[i].width >= voulu) choix = tuiles[i];
  var m = ctx.createPattern(choix, 'repeat');
  var k = MP.TAILLE_CARREAU / choix.width;
  if (m.setTransform) m.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return m;
}

// Lavis d'aquarelle sur le sol (taches lavande et pêche très légères), propres à chaque niveau.
MP.tachesSol = function (graine, terrain) {
  var c = document.createElement('canvas');
  c.width = 40; c.height = 170;                     // 10 px par mètre : x de −2 à 2, z de −1 à 16
  var ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height);
  for (var y = 0, i = 0; y < c.height; y++) for (var x = 0; x < c.width; x++, i += 4) {
    var wx = -2 + x / 10, wz = -1 + y / 10;
    var n = MP.bruit(wx * 0.7, wz * 0.7, graine) * 0.65 + MP.bruit(wx * 2.1, wz * 2.1, graine + 1) * 0.35;
    var teinte = MP.bruit(wx * 0.35, wz * 0.35, graine + 9);
    // Allée plus claire au milieu, là où les boules roulent.
    var milieu = Math.exp(-wx * wx / 0.9) * Math.min(1, Math.max(0, wz / 2));
    if (n > 0.55 || milieu > 0.4) {
      img.data[i] = 255; img.data[i + 1] = 252; img.data[i + 2] = 245;
      img.data[i + 3] = Math.round(Math.min(0.5, (n - 0.5) * 0.9 + milieu * 0.3) * 255);
    } else {
      var lav = teinte > 0.5;
      img.data[i] = lav ? 170 : 238; img.data[i + 1] = lav ? 150 : 160; img.data[i + 2] = lav ? 215 : 130;
      img.data[i + 3] = Math.round(Math.max(0, 0.5 - n) * 0.5 * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

// Tache d'aquarelle ronde, en mètres (décor autour du terrain).
function tache(ctx, x, z, r, couleur) {
  var g = ctx.createRadialGradient(x, z, 0, x, z, r);
  g.addColorStop(0, couleur); g.addColorStop(0.7, couleur.replace(/[\d.]+\)$/, '0.12)')); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, z, r, 0, Math.PI * 2); ctx.fill();
}

// Dessine tout le décor au sol : papier, terrain, lavis, bordures peintes, cercle de lancer.
MP.dessinerTerrain = function (ctx, vue, partie, ratio, L, H) {
  var M = MP.MESURES, d = M.largeurTerrain / 2, fond = M.longueurTerrain, avant = -1.1;
  var terrain = partie.terrain;
  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#f2eef8';
  ctx.fillRect(0, 0, L, H);
  ctx.setTransform.apply(ctx, vue.matrice(ratio));
  // Grandes taches d'aquarelle autour du terrain.
  if (!partie.decor) {
    var a = new MP.Aleatoire(partie.graine + 5), couleurs = ['rgba(184,168,208,0.42)', 'rgba(143,188,190,0.36)', 'rgba(122,170,106,0.30)', 'rgba(212,149,106,0.22)'];
    partie.decor = [];
    for (var k = 0; k < 14; k++) {
      var cote = k % 2 ? 1 : -1;
      partie.decor.push({ x: cote * a.entre(2.6, 5.5), z: a.entre(-1.5, 17), r: a.entre(0.8, 2.2), c: couleurs[k % couleurs.length] });
    }
    partie.decor.push({ x: a.entre(-1.5, 1.5), z: 17.2, r: 2.4, c: 'rgba(122,170,106,0.34)' });
  }
  partie.decor.forEach(function (t) { tache(ctx, t.x, t.z, t.r, t.c); });
  // Ombre douce du terrain sur le papier.
  ctx.fillStyle = 'rgba(90,74,122,0.09)';
  ctx.fillRect(-d - 0.04, avant - 0.1, 2 * d + 0.2, fond - avant + 0.16);
  // Le terrain.
  var tuiles = MP.tuilesSol(terrain);
  ctx.fillStyle = motif(ctx, tuiles, vue.s * ratio);
  ctx.fillRect(-d, avant, 2 * d, fond - avant);
  if (!partie.taches) partie.taches = MP.tachesSol(partie.graine, terrain);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(-d, -1); ctx.scale(0.1, 0.1);
  ctx.drawImage(partie.taches, 0, 0);
  ctx.restore();
  // La partie du terrain où l'on joue, un peu plus sombre, comme une vraie piste tassée : le couloir
  // du cercle au but, plus marqué là où les boules tombent (la donnée) et autour du but.
  if (partie.cochonnet) zoneJouee(ctx, partie.cochonnet.x, partie.cochonnet.z);
  // Lavis lavande le long des bordures, à la place d'une ombre dure.
  var o1 = ctx.createLinearGradient(-d, 0, -d + 0.4, 0);
  o1.addColorStop(0, 'rgba(122,106,154,0.26)'); o1.addColorStop(1, 'rgba(122,106,154,0)');
  ctx.fillStyle = o1; ctx.fillRect(-d, avant, 0.4, fond - avant);
  var o3 = ctx.createLinearGradient(d, 0, d - 0.25, 0);
  o3.addColorStop(0, 'rgba(68,137,140,0.14)'); o3.addColorStop(1, 'rgba(68,137,140,0)');
  ctx.fillStyle = o3; ctx.fillRect(d - 0.25, avant, 0.25, fond - avant);
  var o2 = ctx.createLinearGradient(0, fond, 0, fond - 0.3);
  o2.addColorStop(0, 'rgba(122,106,154,0.20)'); o2.addColorStop(1, 'rgba(122,106,154,0)');
  ctx.fillStyle = o2; ctx.fillRect(-d, fond - 0.3, 2 * d, 0.3);
  // Relief : pentes, bosses, boue, trous, racines, creux d'usure.
  if (partie.relief) MP.dessinerRelief(ctx, partie.relief, MP.niveau(partie.d, 'lectureSol'));
  // Traces des boules tombées.
  MP.dessinerMarques(ctx, partie.monde.marques);
  // Bordures peintes (bois clair ou pierre lavande) sur les quatre côtés.
  var bois = terrain.bordure === 'bois', e = 0.07;
  var couleurs2 = bois ? ['#f0dfc9', '#e0c7a8', '#cdb08f'] : ['#ebe6f3', '#d8d0e6', '#c3b9d6'];
  function planche(x, z, l, h, horizontale) {
    var g = horizontale ? ctx.createLinearGradient(0, z, 0, z + h) : ctx.createLinearGradient(x, 0, x + l, 0);
    g.addColorStop(0, couleurs2[0]); g.addColorStop(0.6, couleurs2[1]); g.addColorStop(1, couleurs2[2]);
    ctx.fillStyle = g; ctx.fillRect(x, z, l, h);
  }
  planche(-d - e, avant - e, e, fond - avant + 2 * e, false);
  planche(d, avant - e, e, fond - avant + 2 * e, false);
  planche(-d - e, fond, 2 * d + 2 * e, e, true);
  planche(-d - e, avant - e, 2 * d + 2 * e, e, true);
  if (bois) {
    ctx.strokeStyle = 'rgba(160,120,90,0.25)'; ctx.lineWidth = 0.005;
    for (var k2 = 0; k2 < 2; k2++) {
      ctx.beginPath(); ctx.moveTo(-d - e * (0.3 + k2 * 0.4), avant); ctx.lineTo(-d - e * (0.3 + k2 * 0.4), fond); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d + e * (0.3 + k2 * 0.4), avant); ctx.lineTo(d + e * (0.3 + k2 * 0.4), fond); ctx.stroke();
    }
  }
  // Cercle de lancer (50 cm), lavande, et les deux pieds du joueur dedans.
  ctx.lineWidth = 0.024;
  ctx.strokeStyle = 'rgba(26,122,122,0.18)';
  ctx.beginPath(); ctx.arc(0.008, -0.01, M.cercle, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#44898c';
  ctx.beginPath(); ctx.arc(0, 0, M.cercle, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.006;
  ctx.beginPath(); ctx.arc(-0.004, 0.004, M.cercle + 0.004, Math.PI * 0.6, Math.PI * 1.3); ctx.stroke();
  ctx.restore();
};

// Pieds du joueur dans le cercle : il lance d'ici.
MP.dessinerPieds = function (ctx, vue) {
  [-1, 1].forEach(function (cote) {
    var p = vue.ecran(cote * 0.07, -0.04);
    var w = 0.05 * vue.s, h = 0.13 * vue.s;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (vue.paysage) ctx.rotate(-Math.PI / 2);
    ctx.rotate(cote * 0.12);
    var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#7a6a9a'); g.addColorStop(1, '#4f4470');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
};

// Ombre d'une boule sur le sol : plus elle est haute, plus l'ombre s'éloigne et s'étale.
// Ombre au sol, comme sous un soleil de biais : collée à la boule quand elle roule, elle s'en écarte
// (en bas à droite) dès que la boule monte. On voit tout de suite qu'une boule est en l'air.
MP.dessinerOmbreDessus = function (ctx, vue, c) {
  var h = Math.max(0, c.y - c.r);
  // Posée, l'ombre déborde à peine : elle ne doit pas faire croire qu'elle touche la boule voisine.
  var p = vue.ecran(c.x + 0.15 * c.r + h * 0.4, c.z - 0.12 * c.r - h * 0.3);
  var r = c.r * vue.s * (1.02 + h * 0.2);
  var a = h > 0.01 ? Math.max(0.3, 0.55 - h * 0.1) : 0.55;
  var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, 'rgba(40,42,70,' + a.toFixed(3) + ')'); g.addColorStop(0.7, 'rgba(40,42,70,' + (a * 0.8).toFixed(3) + ')'); g.addColorStop(1, 'rgba(40,42,70,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
};

// Cercle tracé sur le sol, en mètres.
MP.cercleDessus = function (ctx, vue, x, z, rayon, couleur, epaisseur, pointille) {
  var p = vue.ecran(x, z);
  ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, rayon * vue.s), 0, Math.PI * 2);
  ctx.strokeStyle = couleur; ctx.lineWidth = epaisseur || 2;
  ctx.setLineDash(pointille ? [6, 5] : []);
  ctx.stroke();
  ctx.setLineDash([]);
};
