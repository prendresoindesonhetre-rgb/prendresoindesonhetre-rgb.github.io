// Ma Pétanque — sons fabriqués à la volée (aucun fichier audio) et vibrations.
// Des sons de vraie pétanque : le « clac » acier contre acier (un claquement net puis une résonance
// métallique aiguë et brève), le « toc » du cochonnet en bois, la boule qui tombe (bruit sourd et
// crissement du sol : gravier, sable, terre ou bitume) et un petit souffle quand la boule quitte la main.
// Pas de bruit de roulement.
'use strict';
var MP = window.MP || (window.MP = {});

MP.Son = (function () {
  var ctx = null, maitre = null, actif = true, vibrer = true;
  function contexte() {
    if (!actif) return null;
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
      maitre = sortieDe(ctx);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Un léger compresseur évite que plusieurs chocs à la fois ne saturent.
  function sortieDe(c) {
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
    comp.connect(c.destination);
    return comp;
  }

  // ---------- Matières premières ----------
  var tampons = {};
  function bruitBlanc(c) {
    var cle = 'blanc' + c.sampleRate;
    if (!tampons[cle]) {
      var n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      tampons[cle] = b;
    }
    return tampons[cle];
  }
  // Grains : pas un souffle, mais une suite de petits clics au hasard, comme des cailloux qui
  // s'entrechoquent sous la boule (densité : clics par seconde).
  function grains(c, densite) {
    var cle = 'grains' + densite + '/' + c.sampleRate;
    if (!tampons[cle]) {
      var n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      var nb = densite, sr = c.sampleRate;
      for (var k = 0; k < nb; k++) {
        var debut = Math.floor(Math.random() * n), amp = 0.3 + Math.random() * 0.7, duree = Math.floor(sr * (0.0006 + Math.random() * 0.0025));
        for (var i = 0; i < duree; i++) d[(debut + i) % n] += amp * (Math.random() * 2 - 1) * Math.exp(-i / (duree / 3));
      }
      tampons[cle] = b;
    }
    return tampons[cle];
  }
  // Le sol sous la boule : chaque terrain a son grain et sa couleur de son.
  var SOLS = {
    gravier: { densite: 2600, filtre: 'bandpass', freq: 2600, q: 0.7, sourd: 1, crisse: 1 },
    cailloux: { densite: 1500, filtre: 'bandpass', freq: 2000, q: 0.6, sourd: 1.1, crisse: 1.2 },
    sable:   { densite: 4200, filtre: 'lowpass', freq: 900, q: 0.5, sourd: 0.5, crisse: 0.55 },
    terre:   { densite: 1800, filtre: 'lowpass', freq: 1300, q: 0.6, sourd: 1.2, crisse: 0.6 },
    dur:     { densite: 900, filtre: 'highpass', freq: 1800, q: 0.7, sourd: 0.7, crisse: 0.8 }
  };
  var TYPE_SOL = { boulodrome: 'terre', terreBattue: 'terre', glaise: 'terre', pente: 'terre', gravierFin: 'gravier', mixte: 'gravier', expert: 'cailloux',
    cailloux: 'cailloux', grosGravier: 'cailloux', sable: 'sable', bordDeMer: 'sable', bitume: 'dur', paves: 'dur' };
  function sol(id) { return SOLS[TYPE_SOL[id] || 'gravier']; }

  function enveloppe(c, g, t, volume, attaque, duree) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + attaque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attaque + duree);
  }

  // ---------- Les sons ----------
  // Acier contre acier : un claquement très court (le contact), puis des résonances aiguës et
  // inharmoniques qui s'éteignent vite, comme deux boules qui se frappent. Plus fort, plus brillant.
  function clac(c, dest, t, force) {
    var v = 0.08 + 0.32 * Math.min(1, force), clic = c.createBufferSource(), fc = c.createBiquadFilter(), gc = c.createGain();
    clic.buffer = bruitBlanc(c); fc.type = 'highpass'; fc.frequency.value = 1800;
    enveloppe(c, gc, t, v * 1.1, 0.0008, 0.006);
    clic.connect(fc); fc.connect(gc); gc.connect(dest); clic.start(t, Math.random() * 0.5, 0.03);
    var doux = c.createBiquadFilter(); doux.type = 'lowpass'; doux.frequency.value = 6500 + 2500 * force; doux.connect(dest);
    [[2780, 1, 0.11], [4310, 0.55, 0.085], [6170, 0.3, 0.06], [1450, 0.35, 0.025]].forEach(function (m) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = m[0] * (1 + (Math.random() - 0.5) * 0.04);
      enveloppe(c, g, t, v * m[1] * 0.5, 0.001, m[2] * (0.7 + 0.6 * force));
      o.connect(g); g.connect(doux); o.start(t); o.stop(t + 0.4);
    });
  }
  // Le cochonnet (bois) : un « toc » sec et court, sans résonance métallique.
  function toc(c, dest, t, force) {
    var v = 0.06 + 0.2 * Math.min(1, force);
    [[1150, 1, 0.04], [1980, 0.45, 0.025]].forEach(function (m) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = m[0] * (1 + (Math.random() - 0.5) * 0.06);
      enveloppe(c, g, t, v * m[1], 0.001, m[2]);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.15);
    });
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g2 = c.createGain();
    s.buffer = bruitBlanc(c); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.2;
    enveloppe(c, g2, t, v * 0.6, 0.0008, 0.01);
    s.connect(f); f.connect(g2); g2.connect(dest); s.start(t, Math.random() * 0.5, 0.03);
  }
  // La boule tombe : un bruit sourd (la boule de 700 g qui s'écrase) et le crissement du sol.
  function chute(c, dest, t, force, idTerrain) {
    var S = sol(idTerrain), v = Math.min(1, 0.15 + force);
    var o = c.createOscillator(), go = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    enveloppe(c, go, t, 0.45 * v * S.sourd, 0.003, 0.14);
    o.connect(go); go.connect(dest); o.start(t); o.stop(t + 0.2);
    var gr = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    gr.buffer = grains(c, S.densite); f.type = S.filtre; f.frequency.value = S.freq; f.Q.value = S.q;
    enveloppe(c, g, t, 0.55 * v * S.crisse, 0.004, 0.12 + 0.12 * force);
    gr.connect(f); f.connect(g); g.connect(dest); gr.start(t, Math.random() * 0.7, 0.3);
    if (idTerrain === 'bitume' || idTerrain === 'paves') clac(c, dest, t, force * 0.25);   // sol dur : la boule tinte un peu
  }
  // Le lancer : un petit souffle doux quand la boule quitte la main (plus net quand on lance fort).
  function souffle(c, dest, t, force) {
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), d = 0.16 + 0.08 * force;
    s.buffer = bruitBlanc(c); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(450, t); f.frequency.exponentialRampToValueAtTime(1300 + 900 * force, t + d);
    enveloppe(c, g, t, 0.12 + 0.14 * force, 0.04, d);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5, d + 0.1);
  }
  // Notes de marimba : attaque douce, son rond et grave qui s'éteint vite, avec une harmonique légère.
  function notes(liste, ecart, volume) {
    var c = contexte(); if (!c) return;
    var t = c.currentTime;
    liste.forEach(function (n, i) {
      var d = t + i * (ecart || 0.1);
      [[1, 1], [2, 0.12], [3, 0.04]].forEach(function (h) {
        var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = n * h[0];
        var g = c.createGain();
        g.gain.setValueAtTime(0, d); g.gain.linearRampToValueAtTime((volume || 0.16) * h[1], d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0008, d + (h[0] > 1 ? 0.18 : 0.6));
        o.connect(g); g.connect(maitre); o.start(d); o.stop(d + 0.6);
      });
    });
  }
  function vibration(ms) {
    if (!vibrer) return;
    try {
      if (window.AndroidJeu && window.AndroidJeu.vibrer) window.AndroidJeu.vibrer(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* pas de vibreur */ }
  }
  function jouer(faire) { var c = contexte(); if (c) faire(c, maitre, c.currentTime); }
  return {
    regler: function (son, vib) { actif = !!son; vibrer = !!vib; },
    debloquer: function () { contexte(); },
    // cochonnet : vrai si le choc touche le cochonnet (bois) ; sinon acier contre acier.
    choc: function (force, cochonnet) {
      jouer(function (c, d, t) { (cochonnet ? toc : clac)(c, d, t, force); });
      vibration(cochonnet ? 8 : Math.round(12 + force * 30));
    },
    sol: function (force, idTerrain) { jouer(function (c, d, t) { chute(c, d, t, force, idTerrain); }); if (force > 0.35) vibration(10); },
    lancer: function (force) { jouer(function (c, d, t) { souffle(c, d, t, Math.max(0, Math.min(1, force))); }); },
    victoire: function () { notes([392, 494, 587, 784], 0.09, 0.18); vibration(30); },
    defaite: function () { notes([262, 220], 0.17, 0.12); },
    achat: function () { notes([587, 784], 0.08, 0.16); vibration(12); },
    piece: function () { notes([784 + Math.random() * 80], 0.05, 0.06); },
    palier: function () { notes([392, 494, 587, 659, 784, 988], 0.08, 0.18); vibration(40); },
    toucher: function () { vibration(6); },
    // Pour écouter les sons hors du jeu (tests) : rend un son dans un contexte hors ligne.
    _rendre: function (c, nom, force, idTerrain, t0, duree, dest) {
      dest = dest || sortieDe(c); t0 = t0 || 0.02;
      if (nom === 'clac') clac(c, dest, t0, force);
      else if (nom === 'toc') toc(c, dest, t0, force);
      else if (nom === 'chute') chute(c, dest, t0, force, idTerrain);
      else if (nom === 'lancer') souffle(c, dest, t0, force);
      return dest;
    }
  };
})();
