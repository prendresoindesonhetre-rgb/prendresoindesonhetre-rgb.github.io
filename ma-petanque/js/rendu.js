// Ma Pétanque — textures du sol, boules, cochonnet, poussière et loupe (aquarelle « Prendre soin de son Hêtre »).
'use strict';
var MP = window.MP || (window.MP = {});

// Le bruit (MP.hachage, MP.bruit) est dans relief.js : la physique s'en sert aussi.

function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function melange(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rgb(c, alpha) {
  return alpha == null ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
    : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + alpha + ')';
}

// ---------- Texture du sol ----------
// Un carreau de 2 m × 2 m qui se répète sans raccord, calculé une seule fois par terrain,
// avec ses versions floutées (mipmaps) pour le lointain : le décor se dessine vite,
// sans scintillement.

MP.bruitPeriodique = function (x, z, periode, graine) {
  var ix = Math.floor(x), iz = Math.floor(z);
  var fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  var x0 = ((ix % periode) + periode) % periode, z0 = ((iz % periode) + periode) % periode;
  var x1 = (x0 + 1) % periode, z1 = (z0 + 1) % periode;
  var a = MP.hachage(x0, z0, graine), b = MP.hachage(x1, z0, graine);
  var c = MP.hachage(x0, z1, graine), d = MP.hachage(x1, z1, graine);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
};

// Cailloux : distance aux deux germes les plus proches (bruit cellulaire, qui se répète
// tous les « periode » cases). Renvoie [f1, f2, teinte de la case].
MP.cellules = function (x, z, periode, graine, sortie) {
  var ix = Math.floor(x), iz = Math.floor(z), f1 = 9, f2 = 9, teinte = 0;
  for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
    var cx = ix + dx, cz = iz + dz;
    var wx = ((cx % periode) + periode) % periode, wz = ((cz % periode) + periode) % periode;
    var px = cx + MP.hachage(wx, wz, graine), pz = cz + MP.hachage(wx, wz, graine + 1);
    var d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < f1) { f2 = f1; f1 = d; teinte = MP.hachage(wx, wz, graine + 2); } else if (d < f2) f2 = d;
  }
  sortie[0] = Math.sqrt(f1); sortie[1] = Math.sqrt(f2); sortie[2] = teinte;
  return sortie;
};

MP.TAILLE_CARREAU = 2;      // mètres couverts par la texture
MP.texturesSol = {};

// finesse : côté de la texture en texels (512 en jeu, 128 suffit pour les petits aperçus).
MP.textureSol = function (terrain, finesse) {
  var N = finesse || 512, cle = terrain.id + '/' + N;
  if (MP.texturesSol[cle]) return MP.texturesSol[cle];
  var graine = MP.TERRAINS.indexOf(terrain) * 101 + 7;
  var base = hexRgb(terrain.sol[0]), fonce = hexRgb(terrain.sol[1]), clair = hexRgb(terrain.sol[2]);
  var M = MP.TAILLE_CARREAU, grain = terrain.grain;
  var pMoyen = 6;
  var px = new Float32Array(N * N * 3);
  // Grain de sable : bruit blanc légèrement adouci (raccord sans couture) : aucun motif en carrés.
  var alea = new MP.Aleatoire(graine + 2), blanc = new Float32Array(N * N), doux = new Float32Array(N * N);
  for (var w = 0; w < N * N; w++) blanc[w] = alea.suivant() - 0.5;
  for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) {
    var somme = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      somme += blanc[((yy + dy + N) % N) * N + ((xx + dx + N) % N)] * (dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1));
    }
    doux[yy * N + xx] = somme / 16;
  }
  // Petits grains plus clairs ou plus sombres, posés au hasard.
  var taches = new Float32Array(N * N), nb = Math.round(N * N * 0.012 * (0.6 + grain * 0.4));
  for (var t2 = 0; t2 < nb; t2++) {
    var cx2 = Math.floor(alea.suivant() * N), cy2 = Math.floor(alea.suivant() * N);
    var val = alea.suivant() < 0.55 ? 0.35 : -0.3, ray = alea.suivant() < 0.8 ? 0 : 1;
    for (var oy = -ray; oy <= ray; oy++) for (var ox = -ray; ox <= ray; ox++) taches[((cy2 + oy + N) % N) * N + ((cx2 + ox + N) % N)] += val;
  }
  // Cailloux selon le terrain (aucun sur le boulodrome et le sable).
  var tailleCaillou = terrain.caillou || (grain >= 1 ? 0.004 * grain + 0.004 : 0);
  var pCellules = tailleCaillou ? Math.round(M / tailleCaillou) : 0, cel = [0, 0, 0];
  for (var j = 0, i = 0; j < N; j++) {
    for (var k = 0; k < N; k++, i += 3) {
      var u = k / N, v = j / N, ind = j * N + k;
      var moyen = MP.bruitPeriodique(u * pMoyen, v * pMoyen, pMoyen, graine + 1);
      var c = melange(base, moyen > 0.5 ? clair : fonce, Math.abs(moyen - 0.5) * 0.9);
      var mult = 1 + doux[ind] * (0.15 + grain * 0.06) + taches[ind] * 0.16;
      if (pCellules) {
        MP.cellules(u * pCellules, v * pCellules, pCellules, graine + 4, cel);
        var joint = Math.min(1, (cel[1] - cel[0]) * 3.2);          // 0 dans les creux entre cailloux
        var bombe = 1 - Math.min(1, cel[0] * 1.3);                  // reflet au centre du caillou
        mult = mult * (0.87 + 0.13 * joint) * (0.97 + cel[2] * 0.08) + bombe * 0.05 * joint;
      }
      px[i] = c[0] * mult; px[i + 1] = c[1] * mult; px[i + 2] = c[2] * mult;
    }
  }
  // Versions de plus en plus floues : 512, 256, 128… jusqu'à 4 texels.
  var niveaux = [{ n: N, px: px }];
  while (niveaux[niveaux.length - 1].n > 4) {
    var prec = niveaux[niveaux.length - 1], n = prec.n / 2, q = new Float32Array(n * n * 3);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      for (var ch = 0; ch < 3; ch++) {
        var a = ((2 * y) * prec.n + 2 * x) * 3 + ch, b = a + prec.n * 3;
        q[(y * n + x) * 3 + ch] = (prec.px[a] + prec.px[a + 3] + prec.px[b] + prec.px[b + 3]) / 4;
      }
    }
    niveaux.push({ n: n, px: q });
  }
  var moyenne = niveaux[niveaux.length - 1].px;
  var t = { niveaux: niveaux, moyenne: [moyenne[0], moyenne[1], moyenne[2]], base: base, clair: clair, fonce: fonce };
  MP.texturesSol[cle] = t;
  return t;
};

// Couleur du sol au point (x, z) du monde, pour une taille de pixel donnée (en mètres).
function lireNiveau(L, x, z, sortie, poids) {
  var n = L.n, P = L.px;
  var fu = (x / MP.TAILLE_CARREAU) * n - 0.5, fv = (z / MP.TAILLE_CARREAU) * n - 0.5;
  var u0 = Math.floor(fu), v0 = Math.floor(fv), au = fu - u0, av = fv - v0;
  u0 %= n; v0 %= n; if (u0 < 0) u0 += n; if (v0 < 0) v0 += n;
  var u1 = (u0 + 1) % n, v1 = (v0 + 1) % n;
  var i00 = (v0 * n + u0) * 3, i10 = (v0 * n + u1) * 3, i01 = (v1 * n + u0) * 3, i11 = (v1 * n + u1) * 3;
  var w00 = (1 - au) * (1 - av) * poids, w10 = au * (1 - av) * poids, w01 = (1 - au) * av * poids, w11 = au * av * poids;
  sortie[0] += P[i00] * w00 + P[i10] * w10 + P[i01] * w01 + P[i11] * w11;
  sortie[1] += P[i00 + 1] * w00 + P[i10 + 1] * w10 + P[i01 + 1] * w01 + P[i11 + 1] * w11;
  sortie[2] += P[i00 + 2] * w00 + P[i10 + 2] * w10 + P[i01 + 2] * w01 + P[i11 + 2] * w11;
}

// Lecture bilinéaire, avec un fondu entre deux niveaux de flou : ni « pavés » de près,
// ni cassure nette quand on passe d'un niveau à l'autre au loin.
MP.couleurSol = function (tex, x, z, taillePixel, sortie) {
  var texels = taillePixel * tex.niveaux[0].n / MP.TAILLE_CARREAU;
  var max = tex.niveaux.length - 1;
  var niveau = texels <= 1 ? 0 : Math.min(max, Math.log2(texels));
  var n0 = Math.floor(niveau), t = niveau - n0;
  sortie[0] = sortie[1] = sortie[2] = 0;
  lireNiveau(tex.niveaux[n0], x, z, sortie, n0 < max ? 1 - t : 1);
  if (n0 < max && t > 0.01) lireNiveau(tex.niveaux[n0 + 1], x, z, sortie, t);
  return sortie;
};

// ---------- Boules ----------

// Tes boules ont la couleur que tu as choisie (sinon l'argent de leur modèle), sans anneau ; les boules
// à toucher (au pointage, celle à battre) sont violettes, dorées sur un niveau doré ; les autres sont
// bleu pastel. Aucune couleur à choisir n'est violette ni bleu pastel.
MP.TEINTES = {
  acier:   { clair: '#ffffff', moyen: '#eef1f4', fonce: '#bcc4cc', bord: '#7f8a94' },
  inox:    { clair: '#ffffff', moyen: '#f3f5f8', fonce: '#c9d0d8', bord: '#8a96a2' },
  carbone: { clair: '#ffffff', moyen: '#e6eaf0', fonce: '#aab3c0', bord: '#6f7a88' },
  bronze:  { clair: '#ffffff', moyen: '#f4eee8', fonce: '#cdbfb2', bord: '#8f8073' },
  or:      { clair: '#ffffff', moyen: '#f6f1e2', fonce: '#d3c69f', bord: '#928462' },
  adverse: { clair: '#ffffff', moyen: '#d6e3f7', fonce: '#93afdf', bord: '#4a669c' },
  cible:   { clair: '#f7f3fc', moyen: '#c6b9df', fonce: '#9a88c0', bord: '#6e5d93' },   // le violet « prune » de Prendre soin de son Hêtre
  cibleDoree: { clair: '#fff6d8', moyen: '#f2cf72', fonce: '#c48f2c', bord: '#7d5614' },
  // Couleurs de boule (MP.COULEURS) : claires, pour ne jamais ressembler aux boules adverses.
  bleuPastel: { clair: '#ffffff', moyen: '#dcf4f4', fonce: '#9fd8da', bord: '#3f8f95' },
  lavande:    { clair: '#ffffff', moyen: '#e9e3f6', fonce: '#c0b3e2', bord: '#6e6099' },
  rose:       { clair: '#ffffff', moyen: '#f7e4e7', fonce: '#dfb4bd', bord: '#955f6b' },
  menthe:     { clair: '#ffffff', moyen: '#def2eb', fonce: '#a7d6c6', bord: '#4d8a77' },
  peche:      { clair: '#ffffff', moyen: '#fce9db', fonce: '#edc2a2', bord: '#a1694a' },
  cuivre:     { clair: '#fff4ec', moyen: '#ecc8ab', fonce: '#c4875a', bord: '#7b4a2a' },
  nacre:      { clair: '#ffffff', moyen: '#f8f3f4', fonce: '#ddd3e8', bord: '#8c86a3' },
  edelweiss:  { clair: '#ffffff', moyen: '#fcfbf3', fonce: '#e1e7d2', bord: '#7f8f6a' },
  // Finitions de vraies boules.
  satine:        { clair: '#fbfbfa', moyen: '#e3e5e7', fonce: '#bcc0c5', bord: '#7c8187' },
  chrome:        { clair: '#ffffff', moyen: '#f6f8fa', fonce: '#a3adb8', bord: '#454e58' },
  bronzeVieilli: { clair: '#f6ece2', moyen: '#cda885', fonce: '#8c6443', bord: '#4a321c' },
  carboneNoir:   { clair: '#d2d5d9', moyen: '#6d727a', fonce: '#2f333a', bord: '#111316', sombre: true },
  bleui:         { clair: '#cdd5e6', moyen: '#5d6c8e', fonce: '#27334f', bord: '#0f1424', sombre: true },
  turquoise:  { clair: '#ffffff', moyen: '#d3f1ec', fonce: '#7ccdc1', bord: '#2d8a7f' },
  bleuRoi:    { clair: '#f2f5ff', moyen: '#a9bcf2', fonce: '#4f6fd6', bord: '#24388f' },
  bleuNuit:   { clair: '#e3e7f2', moyen: '#7c88b0', fonce: '#3a4673', bord: '#1c2340', sombre: true },
  corail:     { clair: '#fff3f0', moyen: '#f8c3b8', fonce: '#ec8f7d', bord: '#a44a3b' },
  framboise:  { clair: '#fff1f6', moyen: '#efb3c9', fonce: '#d26a92', bord: '#86304f' },
  sapin:      { clair: '#eef6f1', moyen: '#a9cdb7', fonce: '#4f8e6c', bord: '#244d38' },
  anthracite: { clair: '#e8e9eb', moyen: '#9da2a9', fonce: '#5b6068', bord: '#2c2f34', sombre: true },
  sable:      { clair: '#ffffff', moyen: '#f5ecd9', fonce: '#d8c49a', bord: '#8c7449' },
  rouge:      { clair: '#fff0ee', moyen: '#f2a8a0', fonce: '#d94b3f', bord: '#8c2219' },
  mandarine:  { clair: '#fff4ea', moyen: '#fbc795', fonce: '#f08a3c', bord: '#9a4a12' },
  ivoire:     { clair: '#ffffff', moyen: '#fbf7ea', fonce: '#e8dfc5', bord: '#a39878' },
  olive:      { clair: '#f6f7ea', moyen: '#cfd3a2', fonce: '#8f9550', bord: '#4f5328' },
  emeraude:   { clair: '#effaf5', moyen: '#9fdcc0', fonce: '#2f9e72', bord: '#145c40' },
  bordeaux:   { clair: '#f7e9ec', moyen: '#c98593', fonce: '#8a2e44', bord: '#4d1424', sombre: true },
  chocolat:   { clair: '#f3ebe6', moyen: '#c3a493', fonce: '#7a5341', bord: '#3f271c', sombre: true },
  // Motifs : une teinte de fond et un dessin (motif, encre) qui tourne avec la boule (MP.dessinerMotif).
  mariniere:  { clair: '#ffffff', moyen: '#f6f8fc', fonce: '#d3dae8', bord: '#6f7a90', motif: 'rayures', encre: 'rgba(36,52,104,0.78)' },
  poisCorail: { clair: '#fff3f0', moyen: '#f8c3b8', fonce: '#ec8f7d', bord: '#a44a3b', motif: 'pois', encre: 'rgba(255,255,255,0.9)' },
  vagues:     { clair: '#ffffff', moyen: '#d3f1ec', fonce: '#7ccdc1', bord: '#2d8a7f', motif: 'vagues', encre: 'rgba(255,255,255,0.85)' },
  etoilee:    { clair: '#e3e7f2', moyen: '#7c88b0', fonce: '#3a4673', bord: '#1c2340', sombre: true, motif: 'etoiles', encre: 'rgba(255,255,255,0.92)' },
  damier:     { clair: '#e8e9eb', moyen: '#9da2a9', fonce: '#5b6068', bord: '#2c2f34', sombre: true, motif: 'damier', encre: 'rgba(235,238,242,0.55)' },
  poisNoirs:  { clair: '#ffffff', moyen: '#f7f7f5', fonce: '#d6d6d2', bord: '#77776f', motif: 'pois', encre: 'rgba(30,30,34,0.85)' },
  coeurs:     { clair: '#ffffff', moyen: '#f7e4e7', fonce: '#dfb4bd', bord: '#955f6b', motif: 'coeurs', encre: 'rgba(255,255,255,0.92)' },
  tricolore:  { clair: '#ffffff', moyen: '#f8f8f8', fonce: '#d9d9dc', bord: '#7a7a82', motif: 'rayures', encre: 'rgba(30,60,140,0.85)', encre2: 'rgba(206,44,52,0.85)' },
  zebre:      { clair: '#ffffff', moyen: '#f7f7f5', fonce: '#d6d6d2', bord: '#77776f', motif: 'zebre', encre: 'rgba(25,25,28,0.88)' },
  feuilles:   { clair: '#f4f8ec', moyen: '#cfe3b8', fonce: '#88b36e', bord: '#3f6a2f', motif: 'feuilles', encre: 'rgba(52,96,40,0.8)' },
  glacier:    { clair: '#ffffff', moyen: '#e7f5fb', fonce: '#b0d8ea', bord: '#4a88a4' }
};
// Couleur des boules à toucher (sans anneau) : violettes (toutes, s'il y en a deux), dorées seulement
// sur un niveau doré ; au pointage, la boule à battre aussi ; toutes les autres en bleu pastel.
MP.styleCible = function (partie) { return partie.niveau && partie.niveau.dore ? 'cibleDoree' : 'cible'; };
// Au pointage, la boule adverse la plus près du cochonnet (celle à battre) est violette elle aussi.
MP.bouleABattre = function (partie) {
  if (partie.cible || !partie.cochonnet || !partie.monde) return null;
  var c = partie.cochonnet, meilleure = null, dm = Infinity;
  partie.monde.corps.forEach(function (o) {
    if (o.type !== 'boule' || o.camp === 'joueur' || o.mort) return;
    var dd = Math.hypot(o.x - c.x, o.z - c.z);
    if (dd < dm) { dm = dd; meilleure = o; }
  });
  return meilleure;
};
MP.styleAutre = function (partie, o) {
  return o.camp === 'cible' || (o.type === 'boule' && o.camp !== 'joueur' && MP.bouleABattre(partie) === o) ? MP.styleCible(partie) : 'adverse';
};

// Dessine une boule de métal (ou le cochonnet) de rayon r pixels ; texte : initiales gravées.
MP.dessinerBoule = function (ctx, x, y, r, style, roulement, axe, stries, texte) {
  if (r < 0.6) return;
  if (style === 'cochonnet') return MP.dessinerCochonnet(ctx, x, y, r, roulement);
  var T = MP.TEINTES[style] || MP.TEINTES.acier;
  var g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.15);
  g.addColorStop(0, T.clair); g.addColorStop(0.22, T.moyen); g.addColorStop(0.7, T.fonce); g.addColorStop(1, T.bord);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // Reflet chaud du sol en bas, et liseré de lumière.
  var g2 = ctx.createLinearGradient(x, y - r, x, y + r);
  g2.addColorStop(0, 'rgba(184,168,208,' + (T.sombre ? 0.10 : 0.18) + ')'); g2.addColorStop(0.55, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(212,149,106,' + (T.sombre ? 0.12 : 0.22) + ')');
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (T.motif && r > 3) MP.dessinerMotif(ctx, x, y, r, T, roulement, axe);
  // Stries : un nombre (celles du modèle) ou un choix de MP.STRIES { n, fines, croisees, tressees }.
  var S = stries && typeof stries === 'object' ? stries : { n: stries || 0 };
  if (r > 5 && S.n) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r * 0.97, 0, Math.PI * 2); ctx.clip();
    var series = S.croisees ? [[Math.cos(roulement || 0.6), Math.PI / 2], [Math.cos((roulement || 0.6) + 1.2) * 0.5 + 0.5, 0]] : [[Math.cos(roulement || 0.6), Math.PI / 2]];
    var ecart = r * (S.fines ? 0.12 : 0.22), epais = r * (S.fines ? 0.026 : 0.045);
    series.forEach(function (serie) {
      var penche = serie[0];
      for (var k = 0; k < S.n; k++) {
        var decal = (k - (S.n - 1) / 2) * ecart;
        ctx.lineWidth = Math.max(0.5, S.tressees && k % 2 ? epais * 0.5 : epais);
        ctx.save();
        ctx.translate(x, y); ctx.rotate((axe || 0) + serie[1]);
        ctx.strokeStyle = T.sombre ? 'rgba(0,0,0,0.45)' : 'rgba(70,85,100,0.32)';
        ctx.beginPath(); ctx.ellipse(decal * Math.sign(penche || 1), 0, Math.max(0.5, Math.abs(r * penche) * 0.98), r * 0.98, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.ellipse(decal * Math.sign(penche || 1) + ctx.lineWidth, 0, Math.max(0.5, Math.abs(r * penche) * 0.98), r * 0.98, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    });
    ctx.restore();
  }
  // Initiales gravées : elles tournent avec la boule (de face au repos, elles passent derrière en roulant).
  // texte : les lettres, ou { t, encre } pour essayer une autre couleur de gravure ; sinon l'encre
  // choisie (MP.encreGravure), ou la gravure d'origine, foncée.
  var essai = texte && typeof texte === 'object' ? texte : null;
  var encre = essai && 'encre' in essai ? essai.encre : (MP.encreGravure ? MP.encreGravure() : null);
  var police = (essai && essai.police) || (MP.policeGravure ? MP.policeGravure() : null) || { poids: 800, famille: 'Nunito, system-ui, sans-serif', echelle: 1 };
  if (essai) texte = essai.t;
  if (texte && r > 6) {
    var angle = (roulement == null ? 0.7 : roulement) - 0.7, face = Math.cos(angle);
    if (face > 0.12) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r * 0.97, 0, Math.PI * 2); ctx.clip();
      ctx.translate(x, y); ctx.rotate(axe || 0);
      ctx.translate(Math.sin(angle) * r * 0.6, 0); ctx.scale(face, 1);
      ctx.font = police.poids + ' ' + (r * (texte.length > 2 ? 0.5 : 0.62) * police.echelle).toFixed(1) + 'px ' + police.famille;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.min(1, face * 1.4);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(texte, r * 0.035, r * 0.045);
      if (encre) {
        // Gravure peinte : un fin creux sombre sous la couleur, comme une vraie encre dans la gravure.
        ctx.fillStyle = 'rgba(20,24,30,0.45)'; ctx.fillText(texte, -r * 0.02, -r * 0.02);
        ctx.fillStyle = encre; ctx.fillText(texte, 0, 0);
      } else {
        ctx.fillStyle = T.sombre ? 'rgba(0,0,0,0.6)' : 'rgba(40,52,64,0.55)'; ctx.fillText(texte, 0, 0);
      }
      ctx.restore();
    }
  }
  // Point de lumière.
  var s = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x - r * 0.4, y - r * 0.45, r * 0.45);
  s.addColorStop(0, 'rgba(255,255,255,' + (T.sombre ? 0.7 : 0.95) + ')'); s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = T.sombre ? 'rgba(10,10,14,0.8)' : 'rgba(40,58,70,0.55)'; ctx.lineWidth = Math.max(0.7, r * 0.05);
  ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
};

// Motif d'une boule personnalisée, posé sur la sphère : les bandes, pois, étoiles ou cases suivent la
// rotation de la boule (roulement, en radians) dans le sens de sa course (axe), et s'amincissent vers
// les bords, comme sur une vraie sphère ; seule la face visible est dessinée.
MP.dessinerMotif = function (ctx, x, y, r, T, roulement, axe) {
  var rot = roulement || 0, i, j;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r * 0.98, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y); ctx.rotate(axe || 0);
  ctx.fillStyle = T.encre; ctx.strokeStyle = T.encre;
  // Méridiens : position sur la face (sin) et largeur apparente (cos) d'un angle autour de l'axe de roulement.
  function meridiens(n, faire) {
    for (var k = 0; k < n; k++) {
      var phi = rot + k * 2 * Math.PI / n, c = Math.cos(phi);
      if (c > 0.05) faire(r * Math.sin(phi), c, k);
    }
  }
  if (T.motif === 'rayures') {
    // Deux encres en alternance (tricolore) ou une seule (marinière).
    meridiens(10, function (xc, c, k) {
      var w = r * 0.2 * c;
      ctx.fillStyle = T.encre2 && k % 2 ? T.encre2 : T.encre;
      ctx.fillRect(xc - w / 2, -r, w, 2 * r);
    });
  } else if (T.motif === 'vagues' || T.motif === 'zebre') {
    ctx.lineWidth = Math.max(1, r * (T.motif === 'zebre' ? 0.16 : 0.09)); ctx.lineCap = 'round';
    meridiens(8, function (xc, c) {
      ctx.beginPath();
      for (j = 0; j <= 16; j++) { var yy = -r + 2 * r * j / 16; ctx[j ? 'lineTo' : 'moveTo'](xc + Math.sin(yy / r * 5) * r * 0.08 * c, yy); }
      ctx.stroke();
    });
  } else if (T.motif === 'pois' || T.motif === 'etoiles' || T.motif === 'coeurs' || T.motif === 'feuilles') {
    [-0.62, -0.2, 0.2, 0.62].forEach(function (lat, li) {
      var cl = Math.cos(Math.asin(lat)), y0 = r * lat;
      for (i = 0; i < 8; i++) {
        var phi = rot + (i + li * 0.5) * Math.PI / 4, c = Math.cos(phi);
        if (c < 0.15) continue;
        var x0 = r * cl * Math.sin(phi), t = r * (T.motif === 'pois' ? 0.11 : 0.13) * Math.sqrt(c * cl);
        ctx.save(); ctx.translate(x0, y0); ctx.scale(Math.max(0.2, c), 1);
        ctx.beginPath();
        if (T.motif === 'pois') ctx.arc(0, 0, t, 0, Math.PI * 2);
        else if (T.motif === 'coeurs') {
          // Un petit cœur : deux arrondis en haut, la pointe en bas.
          ctx.moveTo(0, t * 0.9);
          ctx.bezierCurveTo(-t * 1.3, -t * 0.1, -t * 0.6, -t * 1.1, 0, -t * 0.4);
          ctx.bezierCurveTo(t * 0.6, -t * 1.1, t * 1.3, -t * 0.1, 0, t * 0.9);
        } else if (T.motif === 'feuilles') {
          // Une feuille de hêtre : ovale pointu, penchée, avec sa nervure.
          ctx.rotate(0.6 + li * 0.5);
          ctx.moveTo(0, -t * 1.3); ctx.quadraticCurveTo(t * 0.9, 0, 0, t * 1.3); ctx.quadraticCurveTo(-t * 0.9, 0, 0, -t * 1.3);
        }
        else for (j = 0; j < 10; j++) { var a = -Math.PI / 2 + j * Math.PI / 5, rr = j % 2 ? t * 0.45 : t; ctx[j ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        if (T.motif === 'feuilles') {
          ctx.strokeStyle = 'rgba(240,248,230,0.7)'; ctx.lineWidth = Math.max(0.5, t * 0.15);
          ctx.beginPath(); ctx.moveTo(0, -t * 1.1); ctx.lineTo(0, t * 1.1); ctx.stroke();
        }
        ctx.restore();
      }
    });
  } else if (T.motif === 'damier') {
    for (i = 0; i < 12; i++) {
      var p1 = rot + i * Math.PI / 6, p2 = p1 + Math.PI / 6, c1 = Math.cos(p1), c2 = Math.cos(p2);
      if (c1 <= 0 && c2 <= 0) continue;
      var xa = r * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ((p1 % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)));
      var xb = r * Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ((p2 % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI)));
      for (j = 0; j < 6; j++) {
        if ((i + j) % 2) continue;
        var ya = r * Math.sin(-Math.PI / 2 + j * Math.PI / 6), yb = r * Math.sin(-Math.PI / 2 + (j + 1) * Math.PI / 6);
        ctx.fillRect(Math.min(xa, xb), ya, Math.abs(xb - xa), yb - ya);
      }
    }
  }
  ctx.restore();
};

MP.dessinerCochonnet = function (ctx, x, y, r, roulement) {
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.1);
  g.addColorStop(0, '#fff0dc'); g.addColorStop(0.3, '#fbb35c'); g.addColorStop(0.78, '#e47f1e'); g.addColorStop(1, '#a1520c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (r > 3) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(150,70,10,0.3)'; ctx.lineWidth = Math.max(0.5, r * 0.1);
    var dec = Math.sin(roulement || 0) * r * 0.4;
    for (var k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.ellipse(x + dec + k * r * 0.45, y, r * 0.25, r * 1.1, 0.3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  var s = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x - r * 0.4, y - r * 0.45, r * 0.5);
  s.addColorStop(0, 'rgba(255,255,255,0.8)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,55,5,0.6)'; ctx.lineWidth = Math.max(0.7, r * 0.12);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
};

// ---------- Poussière ----------

MP.Poussiere = function () { this.grains = []; };
MP.Poussiere.prototype.souffler = function (x, z, force, couleur, alea) {
  var n = Math.round(8 + force * 22);
  for (var i = 0; i < n; i++) {
    var a = alea.entre(0, Math.PI * 2), v = alea.entre(0.2, 1.2) * (0.4 + force);
    this.grains.push({ x: x, y: 0.02, z: z, vx: Math.cos(a) * v * 0.6, vz: Math.sin(a) * v * 0.6, vy: alea.entre(0.3, 1.4) * (0.3 + force),
      vie: 0, duree: alea.entre(0.6, 1.4), taille: alea.entre(0.008, 0.02) * (0.6 + force), couleur: couleur });
  }
};
MP.Poussiere.prototype.avancer = function (dt) {
  this.grains = this.grains.filter(function (g) {
    g.vie += dt; g.vy -= 2.5 * dt; g.vx *= 0.97; g.vz *= 0.97;
    g.x += g.vx * dt; g.y = Math.max(0, g.y + g.vy * dt); g.z += g.vz * dt;
    return g.vie < g.duree;
  });
};
MP.Poussiere.prototype.dessiner = function (ctx, vue) {
  this.grains.forEach(function (g) {
    var p = vue.ecran(g.x, g.z);
    var a = 0.5 * (1 - g.vie / g.duree);
    ctx.fillStyle = rgb(g.couleur, a.toFixed(3));
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, g.taille * vue.s * (1 + g.vie + g.y * 2)), 0, Math.PI * 2); ctx.fill();
  });
};

// ---------- Loupe : vue de dessus autour du cochonnet ----------

MP.dessinerLoupe = function (ctx, partie, cx, cy, rayonEcran, rayonMonde, mesures) {
  var c = partie.cochonnet, terrain = partie.terrain;
  var echelle = rayonEcran / rayonMonde;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rayonEcran, 0, Math.PI * 2);
  ctx.fillStyle = terrain.sol[0]; ctx.fill();
  ctx.clip();
  // Texture de dessus, mise en cache, à la finesse de l'écran.
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (!partie.loupeFond || partie.loupeFond.r !== rayonEcran || partie.loupeFond.m !== rayonMonde) {
    var t = document.createElement('canvas'), d = Math.ceil(rayonEcran * 2 * dpr);
    t.width = d; t.height = d;
    var tc = t.getContext('2d'), img = tc.createImageData(d, d);
    var tex = MP.textureSol(terrain), col = [0, 0, 0], taille = 1 / (echelle * dpr);
    for (var j = 0, i = 0; j < d; j++) for (var k = 0; k < d; k++, i += 4) {
      var wx = c.depart.x + (k - d / 2) / (echelle * dpr), wz = c.depart.z - (j - d / 2) / (echelle * dpr);
      MP.couleurSol(tex, wx, wz, taille, col);
      var g = 1 + (MP.bruit(wx * 0.9, wz * 0.9, partie.graine) - 0.5) * 0.16;
      img.data[i] = col[0] * g; img.data[i + 1] = col[1] * g; img.data[i + 2] = col[2] * g; img.data[i + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
    partie.loupeFond = { toile: t, r: rayonEcran, m: rayonMonde, x: c.depart.x, z: c.depart.z, dpr: dpr };
  }
  var F = partie.loupeFond;
  // Le fond suit le cochonnet s'il a bougé.
  var cote = F.toile.width / F.dpr;
  ctx.drawImage(F.toile, cx - cote / 2 + (F.x - c.x) * echelle, cy - cote / 2 - (F.z - c.z) * echelle, cote, cote);
  if (partie.relief) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(echelle, -echelle); ctx.translate(-c.x, -c.z);
    MP.dessinerRelief(ctx, partie.relief, MP.niveau(partie.d, 'lectureSol'));
    ctx.restore();
  }
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(echelle, -echelle); ctx.translate(-c.x, -c.z);
  MP.dessinerMarques(ctx, partie.monde.marques);
  ctx.restore();
  function ecran(o) { return { x: cx + (o.x - c.x) * echelle, y: cy - (o.z - c.z) * echelle }; }
  var corps = partie.monde.corps;
  corps.forEach(function (o) {
    // Ombre : sous la boule au sol, écartée quand elle est en l'air (comme sur le terrain).
    var p = ecran(o), r = o.r * echelle, h = Math.max(0, o.y - o.r);
    ctx.fillStyle = h > 0.01 ? 'rgba(40,42,70,0.4)' : 'rgba(60,50,95,0.22)';
    ctx.beginPath(); ctx.arc(p.x + r * 0.15 + h * 0.4 * echelle, p.y + r * 0.15 + h * 0.3 * echelle, r * (1.0 + h * 0.2), 0, 7); ctx.fill();
  });
  corps.forEach(function (o) {
    var p = ecran(o), r = o.r * echelle;
    var style = o.type === 'cochonnet' ? 'cochonnet' : (o.camp === 'joueur' ? MP.teinteJoueur(o.style) : MP.styleAutre(partie, o));
    MP.dessinerBoule(ctx, p.x, p.y, r, style, o.rotation, o.axe, o.camp === 'joueur' ? MP.striesJoueur(o.style) : 1, o.camp === 'joueur' ? MP.etat.initiales : null);
  });
  if (mesures) mesures.forEach(function (m) {
    var a = ecran(c), b = ecran(m.boule);
    var ang = Math.atan2(b.y - a.y, b.x - a.x);
    var a2 = { x: a.x + Math.cos(ang) * c.r * echelle, y: a.y + Math.sin(ang) * c.r * echelle };
    var b2 = { x: b.x - Math.cos(ang) * m.boule.r * echelle, y: b.y - Math.sin(ang) * m.boule.r * echelle };
    ctx.strokeStyle = m.couleur; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.setLineDash([]);
    var mx = (a2.x + b2.x) / 2, my = (a2.y + b2.y) / 2;
    var texte = MP.formatEcart(m.ecart);
    ctx.font = '700 ' + Math.round(Math.max(11, rayonEcran * 0.12)) + 'px Nunito, system-ui, sans-serif';
    var w = ctx.measureText(texte).width + 10, h = Math.max(16, rayonEcran * 0.15);
    ctx.fillStyle = m.couleur;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(mx - w / 2, my - h / 2 - h * 0.9, w, h, h / 2) : ctx.rect(mx - w / 2, my - h / 2 - h * 0.9, w, h); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texte, mx, my - h * 0.9);
  });
  ctx.restore();
  // Cadre de la loupe : bleu-canard et lavande.
  ctx.lineWidth = Math.max(3, rayonEcran * 0.05);
  var g = ctx.createLinearGradient(cx - rayonEcran, cy - rayonEcran, cx + rayonEcran, cy + rayonEcran);
  g.addColorStop(0, '#eef5f5'); g.addColorStop(0.5, '#8fbcbe'); g.addColorStop(1, '#b8a8d0');
  ctx.strokeStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, rayonEcran, 0, Math.PI * 2); ctx.stroke();
};

MP.formatEcart = function (m) {
  if (m < 0.0095) return m < 0.002 ? 'au contact' : Math.round(m * 1000) + ' mm';
  if (m < 1) return Math.round(m * 100) + ' cm';
  return (Math.round(m * 100) / 100).toFixed(2).replace('.', ',') + ' m';
};

// ---------- Relief ----------
// Chaque accident du terrain est peint au naturel : une petite carte de hauteurs (en mètres), éclairée
// pixel par pixel d'en haut à gauche de l'écran comme les boules, avec sa couleur (boue, terre, écorce).
// L'image est calculée une fois par accident et par sens de la lumière, puis posée à sa place.
// Boue, trous, racines et pentes se voient toujours (les pentes comme un plan incliné vu du dessus). Bosses et cuvettes se voient de mieux en mieux avec la Lecture du sol.

// Lumière crème et ombre lavande-taupe, légères : le relief reste doux, comme un lavis.
var CLAIR = [255, 252, 246], SOMBRE = [118, 104, 128], ELEV = 1.1;
// Les formes (bords de la boue, des trous, cuvettes, racines) sont celles de la physique (relief.js).
var lisse = MP.lisse, fbm = MP.fbm, graineDe = MP.graineDe;

// Peint une carte de hauteurs sur le rectangle [x0, x0 + l] × [z0, z0 + h], éclairée depuis (lx, lz).
// opt.hauteur(x, z, k) en mètres ; opt.couleur(x, z, haut, c, k) remplit c = [r, v, b, a] (a de 0 à 1) ;
// k est le même pour un point dans les deux appels : la forme peut y garder ce qu'elle a calculé.
// opt.fond(x, z, g) ajoute une pente douce g = [gx, gz] ; opt.raideur exagère le relief ;
// opt.portee : longueur maximale des ombres portées ; opt.brillance(k) de 0 à 1 : surface mouillée qui brille ;
// opt.masque(x, z) de 0 à 1 : efface doucement une partie de l'image (le relief continue, on ne le montre plus).
MP.peindreRelief = function (x0, z0, l, h, ppm, lx, lz, opt) {
  ppm = Math.min(ppm, 420 / Math.max(l, h));
  var W = Math.max(2, Math.ceil(l * ppm)), H = Math.max(2, Math.ceil(h * ppm)), px = l / W, pz = h / H;
  var toile = document.createElement('canvas'); toile.width = W; toile.height = H;
  var cx = toile.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  var W2 = W + 2, hs = new Float32Array(W2 * (H + 2)), i, j;
  if (opt.hauteur) for (j = 0; j < H + 2; j++) for (i = 0; i < W2; i++) hs[j * W2 + i] = opt.hauteur(x0 + (i - 0.5) * px, z0 + (j - 0.5) * pz, j * W2 + i);
  var n = Math.hypot(lx, lz) || 1; lx /= n; lz /= n;
  var ln = Math.hypot(1, ELEV), Lx = lx / ln, Lz = lz / ln, Ly = ELEV / ln;
  var raideur = opt.raideur || 1, clair = opt.clair || 4.5, sombre = opt.sombre || 3;
  var col = [0, 0, 0, 0], g = [0, 0], portee = opt.portee ? Math.ceil(opt.portee / px) : 0;
  for (j = 0; j < H; j++) for (i = 0; i < W; i++) {
    var k = (j + 1) * W2 + i + 1, u = x0 + (i + 0.5) * px, v = z0 + (j + 0.5) * pz, hc = hs[k];
    var gu = (hs[k + 1] - hs[k - 1]) / (2 * px) * raideur, gv = (hs[k + W2] - hs[k - W2]) / (2 * pz) * raideur;
    if (opt.fond) { g[0] = g[1] = 0; opt.fond(u, v, g); gu += g[0]; gv += g[1]; }
    var e = (-gu * Lx - gv * Lz + Ly) / Math.hypot(gu, gv, 1) - Ly;
    // Ombre portée : un relief plus haut entre ce point et la lumière.
    for (var s = 1; s <= portee; s++) {
      var ii = Math.round(i + lx * s), jj = Math.round(j + lz * s);
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) break;
      if ((hs[(jj + 1) * W2 + ii + 1] - hc) * raideur > s * px * ELEV) { e = Math.min(e, 0) - 0.12; break; }
    }
    col[0] = col[1] = col[2] = col[3] = 0;
    if (opt.couleur) opt.couleur(u, v, hc, col, k);
    var br = opt.brillance ? opt.brillance(k) : 0;
    var sa = e > 0 ? 0.7 * Math.tanh(e * clair * (1 + 2 * br)) : 0.55 * Math.tanh(-e * sombre), sc = e > 0 ? CLAIR : SOMBRE;
    var ao = (sa + col[3] * (1 - sa)) * (opt.masque ? opt.masque(u, v) : 1), p = (j * W + i) * 4;
    if (ao <= 0.002) continue;
    var b = col[3] * (1 - sa);
    d[p] = (sc[0] * sa + col[0] * b) / ao; d[p + 1] = (sc[1] * sa + col[1] * b) / ao; d[p + 2] = (sc[2] * sa + col[2] * b) / ao;
    d[p + 3] = ao * 255;
  }
  cx.putImageData(img, 0, 0);
  // Un léger flou, comme un lavis : pas de bord net.
  var flou = opt.flou == null ? 1.2 : opt.flou;
  if (flou > 0 && 'filter' in cx) {
    var nette = document.createElement('canvas'); nette.width = W; nette.height = H;
    nette.getContext('2d').drawImage(toile, 0, 0);
    cx.clearRect(0, 0, W, H); cx.filter = 'blur(' + flou + 'px)'; cx.drawImage(nette, 0, 0); cx.filter = 'none';
  }
  return { c: toile, x0: x0, z0: z0, l: l, h: h };
};

// Une image par accident, gardée tant que l'accident, la lumière (et ce qu'on en voit) ne changent pas :
// la piste revient d'un niveau à l'autre, ses images aussi. Pour ne pas saccader, pas plus d'une
// dizaine de millisecondes de peinture par image : le reste apparaît aux images suivantes.
MP._peints = typeof Map === 'function' ? new Map() : null;
var trame = { debut: 0, depense: 0 };
function peint(o, cle, faire) {
  if (!MP._peints) return faire();
  cle = JSON.stringify(o) + '|' + cle;
  var m = MP._peints.get(cle);
  if (m) return m;
  var t = performance.now();
  if (t - trame.debut > 12) { trame.debut = t; trame.depense = 0; }
  if (trame.depense > 10) return null;
  m = faire();
  trame.depense += performance.now() - t;
  MP._peints.set(cle, m);
  if (MP._peints.size > 240) MP._peints.delete(MP._peints.keys().next().value);
  return m;
}
function poser(ctx, m, alpha, centre) {
  if (!m) return;
  ctx.save();
  if (centre) { ctx.translate(centre.x, centre.z); ctx.rotate(centre.angle); }
  ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(m.c, m.x0, m.z0, m.l, m.h);
  ctx.restore();
}
// Direction de la lumière (le haut-gauche de l'écran) ramenée en mètres sur le terrain.
function lumiere(ctx) {
  var m = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: -1 };
  var det = m.a * m.d - m.b * m.c || 1, lx = (-m.d + m.c) / det, lz = (m.b - m.a) / det, n = Math.hypot(lx, lz) || 1;
  return { x: lx / n, z: lz / n, cle: Math.round(lx / n * 10) + ',' + Math.round(lz / n * 10) };
}

MP.dessinerRelief = function (ctx, relief, lecture) {
  var L = lumiere(ctx);
  // Les grandes pentes douces d'abord, les petites pentes et les dos d'âne par-dessus.
  var dos = {};
  relief.zones.forEach(function (o) { if (o.type === 'pente') pente(o); else if (o.type === 'plan' && !o.raide) plan(o); });
  relief.zones.forEach(function (o) {
    if (o.type !== 'plan' || !o.raide) return;
    if (!o.dos || !o.paire) plan(o);
    else if (dos[o.paire]) dosDane(dos[o.paire], o);
    else dos[o.paire] = o;
  });
  relief.zones.forEach(function (o) { if (o.type === 'bosse') bosse(o); else if (o.type === 'creux') creux(o); });
  relief.zones.forEach(function (o) {
    if (o.type === 'boue') boue(o);
    else if (o.type === 'trou') trou(o);
    else if (o.type === 'racine') racine(o);
  });

  // Une pente en bande (ancien relief) se dessine comme les autres : une pente en relief.
  function pente(o) {
    if (o.globale) return;
    var f = Math.hypot(o.ax, o.az) || 1, dx = o.ax / f, dz = o.az / f, enLong = Math.abs(dz) > 0.5;
    plan({ type: 'plan', x: (o.x1 + o.x2) / 2, z: (o.z1 + o.z2) / 2, dx: dx, dz: dz, f: f, raide: !!o.raide,
      L: enLong ? o.z2 - o.z1 : o.x2 - o.x1, W: enLong ? o.x2 - o.x1 : o.z2 - o.z1 });
  }
  function plan(o) { poser(ctx, peint(o, 'plan' + L.cle, function () { return peindrePlan(o, L); }), 1); }
  function dosDane(a, b) { poser(ctx, peint(a, 'dos' + L.cle, function () { return peindrePlan(a, L, b); }), 1); }
  // Bosses et cuvettes se voient toujours bien ; la Lecture du sol les marque encore un peu plus.
  function bosse(o) {
    var m = peint(o, L.cle, function () { return peindreBosse(o, L); });
    poser(ctx, m, Math.min(1, (0.82 + 0.06 * Math.min(3, lecture)) * (0.75 + 0.25 * Math.min(1, Math.abs(o.force)))));
  }
  function creux(o) { poser(ctx, peint(o, L.cle, function () { return peindreCreux(o, L); }), 1); }
  function boue(o) {
    var an = o.angle || 0, c = Math.cos(an), s = Math.sin(an);
    var m = peint(o, L.cle, function () { return peindreBoue(o, L.x * c + L.z * s, -L.x * s + L.z * c); });
    poser(ctx, m, 1, { x: o.x, z: o.z, angle: an });
  }
  function trou(o) { poser(ctx, peint(o, L.cle, function () { return peindreTrou(o, L); }), 1); }
  function racine(o) { poser(ctx, peint(o, L.cle, function () { return peindreRacine(o, L); }), 1); }
};

// Traces des boules tombées : un petit cratère de terre tassée, le même pour toutes, à la taille du choc.
MP.dessinerMarques = function (ctx, marques) {
  if (!marques.length) return;
  var L = lumiere(ctx);
  // Un cratère par sens de lumière (la loupe et la vue en paysage n'ont pas le même).
  MP._marques = MP._marques || {};
  if (!MP._marques[L.cle]) {
    var gr = 4242, mottes = [], a = new MP.Aleatoire(gr);
    for (var k = 0; k < 6; k++) { var an = a.entre(0, 6.3), r = a.entre(1.0, 1.4); mottes.push([Math.cos(an) * r, Math.sin(an) * r, a.entre(0.07, 0.13)]); }
    MP._marques[L.cle] = MP.peindreRelief(-1.5, -1.5, 3, 3, 40, L.x, L.z, {
      hauteur: function (x, z) {
        var rho = Math.hypot(x, z) / (1 + 0.25 * (MP.bruit(x * 1.6 + 5, z * 1.6 + 5, gr) - 0.5));
        var h = -0.16 * lisse(1, 0.3, rho) + 0.03 * Math.exp(-Math.pow((rho - 1.05) / 0.2, 2));
        mottes.forEach(function (b) { h += 0.5 * b[2] * Math.exp(-(Math.pow(x - b[0], 2) + Math.pow(z - b[1], 2)) / (b[2] * b[2])); });
        return h;
      },
      couleur: function (x, z, h, c) { c[0] = 150; c[1] = 134; c[2] = 136; c[3] = 0.12 * lisse(1, 0.3, Math.hypot(x, z)); }
    });
  }
  var m = MP._marques[L.cle];
  ctx.save(); ctx.imageSmoothingEnabled = true;
  marques.forEach(function (q) {
    var r = 0.045 + 0.035 * q.force;
    ctx.globalAlpha = 0.35 + 0.35 * Math.min(1, q.force);
    ctx.drawImage(m.c, q.x - 1.5 * r, q.z - 1.5 * r, 3 * r, 3 * r);
  });
  ctx.restore();
};

// Une pente (« plan ») en relief, peinte et éclairée comme les bosses et les cuvettes. Du creux, au ras
// du sol, le terrain monte jusqu'au sommet, de plus en plus clair ; derrière, il reste en haut puis se
// fond dans le terrain : une seule pente. Ses côtés portent une ombre douce qui s'amincit jusqu'au
// creux, ses coins sont arrondis, deux fines lignes de niveau suivent la pente. Plus elle est raide,
// plus elle monte haut sur peu de longueur. Un dos d'âne (ses deux moitiés o, b) : une arête en travers.
function peindrePlan(o, Lum, b) {
  // La forme est celle que suit la boule (MP.formePlan) : ce qu'on voit, c'est ce qui la pousse.
  var F = MP.formePlan(o, b), dos = F.dos, cx = F.cx, cz = F.cz, dx = F.dx, dz = F.dz, Wm = F.Wm, h2 = F.h2, H = F.H, P = F.P;
  var monte = F.monte, cote = F.cote, loc = F.loc;
  // Une grande pente douce ne porte pas d'ombre (pas de longue ombre en trait).
  var doux = !o.raide && !dos, lo = doux ? 0 : Math.min(0.35, H * 1.4), m = lo + 0.1;
  var u0 = -h2 - P - m, u1 = h2 + m, v0 = Wm + m, xs = [], zs = [];
  [[u0, -v0], [u0, v0], [u1, -v0], [u1, v0]].forEach(function (c) { xs.push(cx + dx * c[0] - dz * c[1]); zs.push(cz + dz * c[0] + dx * c[1]); });
  var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Z0 = Math.min.apply(null, zs), Z1 = Math.max.apply(null, zs);
  return MP.peindreRelief(X0, Z0, X1 - X0, Z1 - Z0, 90, Lum.x, Lum.z, {
    hauteur: F.hauteur,
    masque: F.masque,
    portee: lo, sombre: 2.4, clair: 6, flou: 1.8,
    couleur: function (x, z, h, c) {
      var q = loc(x, z), t = monte(q[0]), w = cote(q[0], q[1]), lignes = 0;
      if (!dos && q[0] > -h2 && q[0] < h2) [1 / 3, 2 / 3].forEach(function (n) { lignes += Math.exp(-Math.pow((t - n) * o.L / 0.012, 2)); });
      var cl = 0.42 * Math.pow(t * w, 0.85), sb = 0.12 * lignes * w, a = cl + sb + 1e-6;
      c[0] = (255 * cl + 112 * sb) / a; c[1] = (252 * cl + 94 * sb) / a; c[2] = (244 * cl + 110 * sb) / a; c[3] = Math.min(0.55, a);
    }
  });
}

// Cuvette (creux) ou bosse : un relief doux au bord irrégulier ; une cuvette a un léger bourrelet.
// Vue du dessus, une cuvette et une bosse se ressemblent : on les distingue par des indices naturels.
// Cuvette : plus creuse, ombre du bord portée à l'intérieur, fond sombre et humide, et les traces en
// cercles de l'eau qui y a séché. Bosse : dessus plus clair et sec, ombre portée derrière elle.
function peindreBosse(o, L) {
  var creuse = o.force < 0, r = o.r, E = 1.35, forme = MP.formeBosse(o), H = (creuse ? 0.65 : 0.45) * r;
  return MP.peindreRelief(o.x - E * r, o.z - E * r, 2 * E * r, 2 * E * r, 112 / (2 * E * r), L.x, L.z, {
    hauteur: function (x, z) { return H * forme((x - o.x) / r, (z - o.z) / r); },
    portee: 0.35 * r, sombre: creuse ? 3.6 : 2.1, clair: creuse ? 4.5 : 6.5,
    couleur: creuse ? function (x, z, hh, c) {
      var p = Math.max(0, -hh / H), traces = 0;
      [0.3, 0.55, 0.8].forEach(function (n) { traces += Math.exp(-Math.pow((p - n) / 0.035, 2)); });
      c[0] = 126; c[1] = 106; c[2] = 104; c[3] = Math.min(0.5, 0.3 * p * p + 0.09 * traces);
    } : function (x, z, hh, c) {
      c[0] = 255; c[1] = 252; c[2] = 244; c[3] = 0.4 * Math.pow(Math.max(0, hh / H), 0.8);
    }
  });
}

// Usure : là où les boules tombent souvent, le sol se creuse un peu.
function peindreCreux(o, L) {
  var r = o.r, gr = graineDe(o.x, o.z), E = 1.7, forme = MP.formeCreux(o);
  return MP.peindreRelief(o.x - E * r, o.z - E * r, 2 * E * r, 2 * E * r, 220, L.x, L.z, {
    hauteur: function (x, z) {
      var u = (x - o.x) / r, v = (z - o.z) / r;
      return r * (forme(u, v) + 0.03 * (MP.bruit(u * 4, v * 4, gr + 3) - 0.5) * lisse(1.4, 0.8, Math.hypot(u, v)));
    },
    couleur: function (x, z, h, c) { c[0] = 150; c[1] = 134; c[2] = 136; c[3] = 0.12 * o.profondeur * lisse(1.1, 0.4, Math.hypot(x - o.x, z - o.z) / r); }
  });
}

// Boue : une plaque de terre mouillée au bord irrégulier, luisante, avec des flaques qui reflètent
// le ciel et quelques éclaboussures autour. Dessinée dans son propre repère (tournée de o.angle) :
// (lx, lz) y est ramené.
function peindreBoue(o, lx, lz) {
  var rx = o.rx, rz = o.rz, gr = graineDe(o.x, o.z), E = 1.5, info = [], a = new MP.Aleatoire(gr), taches = [];
  for (var k = 0; k < 5; k++) {
    var an = a.entre(0, 6.3), dd = a.entre(1.05, 1.3);
    taches.push([Math.cos(an) * rx * dd, Math.sin(an) * rz * dd, a.entre(0.01, 0.02)]);
  }
  return MP.peindreRelief(-E * rx, -E * rz, 2 * E * rx, 2 * E * rz, 100, lx, lz, {
    hauteur: function (u, v, k) {
      var b = MP.bordBoue(o, u, v);
      var dedans = lisse(1.05, 0.8, b);
      var w = lisse(0.47, 0.63, fbm(u * 2.6 + 11, v * 2.6, gr + 9)) * lisse(0.8, 0.45, b);
      var t = fbm(u * 10, v * 10, gr + 3);
      info[k] = [b, w, t];
      return (-0.003 + 0.0025 * (t - 0.5)) * dedans * (1 - w) - 0.0035 * w;
    },
    raideur: 1.3, flou: 1.5,
    brillance: function (k) { var q = info[k]; return Math.max(q[1], 0.4 * lisse(1.05, 0.85, q[0])); },
    couleur: function (u, v, h, c, k) {
      var q = info[k], b = q[0], w = q[1], t = q[2], dedans = lisse(1.06, 0.88, b), halo = lisse(1.4, 1.0, b);
      // Terre mouillée, sombre, avec des parties luisantes, et un halo humide autour.
      var lui = lisse(0.55, 0.75, t);
      c[0] = 146 + 30 * lui; c[1] = 120 + 26 * lui; c[2] = 102 + 22 * lui; c[3] = 0.12 * halo + 0.5 * dedans;
      // Éclaboussures autour de la plaque.
      if (dedans < 0.5) for (var n = 0; n < taches.length; n++) {
        var e = taches[n], dd = (Math.pow(u - e[0], 2) + Math.pow(v - e[1], 2)) / (e[2] * e[2]);
        if (dd < 2.5) { c[0] = 146; c[1] = 120; c[2] = 102; c[3] = Math.max(c[3], 0.35 * lisse(1.3, 0.6, dd)); }
      }
      if (w > 0) {
        // L'eau reflète le ciel, avec un reflet plus clair et un bord plus sombre.
        var reflet = lisse(0.35, 0.75, fbm(u * 4 + v * 1.5, v * 1.2, gr + 13)), bordEau = 4 * w * (1 - w);
        c[0] += (178 + 50 * reflet - c[0]) * w - 16 * bordEau; c[1] += (172 + 52 * reflet - c[1]) * w - 14 * bordEau; c[2] += (190 + 46 * reflet - c[2]) * w - 10 * bordEau;
        c[3] = Math.max(c[3], 0.6 * w);
      }
    }
  });
}

// Trou : des parois raides, un fond sombre, un bourrelet de terre et quelques mottes autour.
function peindreTrou(o, L) {
  var r = o.r, gr = graineDe(o.x, o.z), a = new MP.Aleatoire(gr), E = 2.2, mottes = [], info = [];
  for (var k = 0; k < 4; k++) { var an = a.entre(0, 6.3), dd = a.entre(1.25, 1.8) * r; mottes.push([o.x + Math.cos(an) * dd, o.z + Math.sin(an) * dd, a.entre(0.12, 0.2) * r]); }
  return MP.peindreRelief(o.x - E * r, o.z - E * r, 2 * E * r, 2 * E * r, 240, L.x, L.z, {
    hauteur: function (x, z, k) {
      var p = MP.rhoTrou(o, x, z), m = 0;
      if (p > 0.9 && p < 2.4) mottes.forEach(function (q) { m = Math.max(m, Math.exp(-(Math.pow(x - q[0], 2) + Math.pow(z - q[1], 2)) / (q[2] * q[2]))); });
      info[k] = [p, m];
      return -0.9 * r * lisse(1, 0.55, p) + 0.1 * r * Math.exp(-Math.pow((p - 1.12) / 0.18, 2)) + 0.12 * r * m;
    },
    portee: 1.2 * r,
    couleur: function (x, z, h, c, k) {
      var p = info[k][0], m = info[k][1], dedans = lisse(1.04, 0.82, p), fond = lisse(0.85, 0.3, p);
      c[0] = 150 - 46 * fond; c[1] = 124 - 40 * fond; c[2] = 108 - 26 * fond; c[3] = dedans * (0.45 + 0.35 * fond);
      // Terre remuée autour du trou, et les mottes.
      var remue = 0.3 * Math.exp(-Math.pow((p - 1.15) / 0.25, 2)) * (1 - dedans);
      if (m > 0.3 || remue > c[3]) { c[0] = 176; c[1] = 152; c[2] = 130; c[3] = Math.max(c[3], 0.7 * remue, lisse(0.3, 0.6, m) * 0.5); }
    }
  });
}

// Racine : ronde, en écorce striée, qui sort de terre en deux ou trois bosses et s'y enfonce entre
// elles (la forme est celle de la physique) ; la terre est un peu soulevée le long de son chemin.
function peindreRacine(o, L) {
  var gr = graineDe(o.x1 + o.x2, o.z1 + o.z2), f = MP.formeRacine(o), b = f.boite, l = f.longueur;
  var x0 = b[0] - 0.14, x1 = b[1] + 0.14, z0 = b[2] - 0.14, z1 = b[3] + 0.14;
  var ecorce = [], terre = [];
  function evalue(x, z, k) {
    var p = MP.procheRacine(f, x, z), R = p.R, d = p.d, h = 0;
    var monte = 0.4 * R * Math.exp(-Math.pow(d / (2.2 * R), 2)) * lisse(0, 0.1, p.t) * lisse(1, 0.9, p.t);
    var dessus = d < R ? Math.sqrt(R * R - d * d) - p.prof : -1;
    ecorce[k] = 0; terre[k] = 0;
    if (dessus > 0 && dessus > monte) {
      h = dessus;
      // Stries de l'écorce : lentes dans le sens de la racine, serrées en travers.
      ecorce[k] = 0.4 + 0.6 * MP.bruit(p.t * l * 12, p.cote * d / R * 2.5 + 3, gr + 4);
    } else if (monte > 0) { h = monte; terre[k] = monte / (0.4 * R); }
    return h;
  }
  return MP.peindreRelief(x0, z0, x1 - x0, z1 - z0, 170, L.x, L.z, {
    hauteur: evalue,
    portee: 0.07, clair: 2.6,
    couleur: function (x, z, h, c, k) {
      if (ecorce[k]) {
        // Écorce : brun chaud, striée dans le sens de la racine, salie de terre là où elle sort du sol.
        var st = lisse(0.4, 0.8, ecorce[k]), sale = lisse(0.012, 0.002, h);
        c[0] = 184 - 36 * st; c[1] = 150 - 30 * st; c[2] = 122 - 22 * st; c[3] = 0.92;
        c[0] += (178 - c[0]) * sale; c[1] += (156 - c[1]) * sale; c[2] += (136 - c[2]) * sale;
      } else { c[0] = 170; c[1] = 146; c[2] = 126; c[3] = 0.16 * terre[k]; }
    }
  });
}

// ---------- Papier aquarelle ----------
// Grain du papier, posé par-dessus tout le dessin, et taches de couleur aux bords de l'écran.
MP.grainPapier = function () {
  if (MP._grain) return MP._grain;
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var x = c.getContext('2d'), img = x.createImageData(256, 256), a = new MP.Aleatoire(77);
  for (var i = 0; i < img.data.length; i += 4) {
    var v = 128 + (a.suivant() - 0.5) * 70 + (a.suivant() - 0.5) * 40;
    img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 1.03; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // Fibres : quelques traits très doux.
  x.globalAlpha = 0.05; x.strokeStyle = '#1e3a3a';
  for (var k = 0; k < 120; k++) {
    var px = a.suivant() * 256, py = a.suivant() * 256, an = a.suivant() * Math.PI;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * 14, py + Math.sin(an) * 14); x.stroke();
  }
  MP._grain = c;
  return c;
};

MP.habillageAquarelle = function (ctx, L, H, ratio) {
  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = ctx.createPattern(MP.grainPapier(), 'repeat');
  ctx.fillRect(0, 0, L, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  [[0, 0, 'rgba(184,168,208,0.32)'], [L, 0, 'rgba(68,137,140,0.16)'], [L, H, 'rgba(122,170,106,0.20)'], [0, H, 'rgba(212,149,106,0.14)']].forEach(function (t) {
    var r = Math.max(L, H) * 0.42;
    var g = ctx.createRadialGradient(t[0], t[1], 0, t[0], t[1], r);
    g.addColorStop(0, t[2]); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, H);
  });
  ctx.restore();
};
