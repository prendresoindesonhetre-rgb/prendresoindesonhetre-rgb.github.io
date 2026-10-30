// Ma Pétanque — écrans des menus : Jouer, Améliorations, Compétences, Boules, Réglages.
'use strict';
var MP = window.MP || (window.MP = {});

// Petit constructeur d'éléments : h('div', {class: 'carte'}, [enfants…]).
MP.h = function (balise, attributs, enfants) {
  var el = document.createElement(balise);
  if (attributs) Object.keys(attributs).forEach(function (k) {
    var v = attributs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'texte') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  (enfants || []).forEach(function (e) {
    if (e == null || e === false) return;
    el.appendChild(typeof e === 'string' || typeof e === 'number' ? document.createTextNode(String(e)) : e);
  });
  return el;
};

MP.Ecrans = (function () {
  var h = MP.h;
  var onglet = 'jouer';
  var branche = 'geste';
  var contenu;

  function etat() { return MP.etat; }
  function vue() { return MP.etat.vue; }
  function d() { return MP.etat[vue()]; }
  function D() { return MP.trouver(MP.DISCIPLINES, vue()); }

  function enregistrer() {
    annoncerSucces(MP.verifierSucces(MP.etat, vue()));
    MP.sauver(MP.etat);
  }

  // Nouveaux succès : un message pour chacun, l'un après l'autre.
  var annoncesEnAttente = [];
  function annoncerSucces(nouveaux) {
    nouveaux.forEach(function (x, i) {
      annoncesEnAttente.push(setTimeout(function () { toast('Succès : ' + x.nom + ' · +3 % de Points pour toujours'); MP.Son.palier(); }, 400 + i * 2700));
    });
  }

  // Dès qu'on touche le terrain pour viser, les annonces s'effacent (et celles en attente aussi).
  function effacerAnnonces() {
    annoncesEnAttente.forEach(clearTimeout); annoncesEnAttente = [];
    document.querySelectorAll('.toast, .fete').forEach(function (x) { x.remove(); });
  }

  function toast(message) {
    var ancien = document.querySelector('.toast');
    if (ancien) ancien.remove();
    var t = h('div', { class: 'toast', role: 'status', texte: message });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  function majEntete() {
    document.getElementById('appli').setAttribute('data-vue', vue());
    document.querySelectorAll('.bascule button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-d') === vue() ? 'true' : 'false');
    });
    document.getElementById('points').textContent = MP.formatPoints(d().points);
    document.getElementById('unite').textContent = vue() === 'pointage' ? 'pts pointage' : 'pts tir';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f2eef8');
  }

  function jauge(valeur, max) {
    return h('div', { class: 'jauge' }, [h('i', { style: 'width:' + Math.round(100 * valeur / max) + '%' })]);
  }
  // Jauge d'une statistique réglée : la base, puis ce que le réglage ajoute (vert) ou retire (hachuré).
  function jaugeReglage(base, avec, max) {
    var p = function (v) { return Math.max(0, Math.round(100 * v / max)) + '%'; };
    return h('div', { class: 'jauge jauge-reglage' }, [
      h('i', { style: 'width:' + p(Math.min(base, avec)) }),
      avec > base ? h('i', { class: 'ajout', style: 'width:' + p(avec - base) }) : null,
      avec < base ? h('i', { class: 'retrait', style: 'width:' + p(base - avec) }) : null
    ]);
  }

  function boutonPrix(texte, prix, possible, action) {
    var b = h('button', { type: 'button', class: 'bouton large', onclick: action }, [
      texte, prix != null ? h('span', { class: 'prix', texte: '· ' + MP.formatPoints(prix) + ' pts' }) : null
    ]);
    if (!possible) b.disabled = true;
    return b;
  }

  // Aperçu d'un terrain (vu de dessus) pour les cartes : la texture du sol, avec une boule
  // et le cochonnet à leurs vraies proportions.
  function apercuTerrain(t) {
    var c = h('canvas', { width: 240, height: 90 });
    var ctx = c.getContext('2d'), img = ctx.createImageData(240, 90);
    var tex = MP.textureSol(t, 128), col = [0, 0, 0], m = 0.006;   // 6 mm par pixel
    for (var y = 0, i = 0; y < 90; y++) for (var x = 0; x < 240; x++, i += 4) {
      MP.couleurSol(tex, x * m, y * m, m, col);
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    MP.dessinerBoule(ctx, 140, 46, MP.MESURES.rayonBoule / m, 'acier', 0.6, 0.3, 2);
    MP.dessinerCochonnet(ctx, 182, 56, MP.MESURES.rayonCochonnet / m, 0);
    return c;
  }

  function dessinBoule(boule, taille, texte) {
    var ratio = Math.min(window.devicePixelRatio || 1, 3);
    var c = h('canvas', { width: Math.round(taille * ratio), height: Math.round(taille * ratio), 'aria-hidden': 'true' });
    var ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    var g = ctx.createRadialGradient(taille * 0.55, taille * 0.82, 0, taille * 0.55, taille * 0.82, taille * 0.45);
    g.addColorStop(0, 'rgba(110,90,150,0.28)'); g.addColorStop(1, 'rgba(110,90,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(taille * 0.55, taille * 0.82, taille * 0.42, taille * 0.12, 0, 0, 7); ctx.fill();
    MP.dessinerBoule(ctx, taille / 2, taille * 0.46, taille * 0.38, texte !== undefined ? MP.teinteJoueur(boule) : boule.teinte, 0.7, 0.4, boule.stries, texte);
    return c;
  }

  // ---------- Montagne ----------
  // Le dessin : une montagne à l'aquarelle, un sentier en lacets et ses 10 étapes ; celles déjà
  // passées pleines, l'étape en cours entourée, la plus haute atteinte marquée, un drapeau au sommet.
  function dessinMontagne(M, nE) {
    var L = 320, H = 170, pts = [];
    for (var k = 0; k < nE; k++) {
      var t = k / (nE - 1), y = H - 18 - t * (H - 52);
      pts.push([L / 2 + Math.sin(k * 1.9) * (1 - t) * 92, y]);
    }
    var chemin = pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
    var svg = '<svg viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="Étape ' + (M.etape + 1) + ' sur ' + nE + '">' +
      '<path d="M0 ' + H + ' L' + (L / 2 - 30) + ' 22 Q' + (L / 2) + ' 6 ' + (L / 2 + 30) + ' 22 L' + L + ' ' + H + ' Z" fill="rgba(184,168,208,0.35)"/>' +
      '<path d="M' + (L / 2 - 30) + ' 22 Q' + (L / 2) + ' 6 ' + (L / 2 + 30) + ' 22 L' + (L / 2 + 14) + ' 38 L' + (L / 2) + ' 30 L' + (L / 2 - 16) + ' 40 Z" fill="rgba(255,255,255,0.85)"/>' +
      '<path d="' + chemin + '" fill="none" stroke="rgba(110,93,147,0.55)" stroke-width="2" stroke-dasharray="4 4"/>';
    pts.forEach(function (q, k) {
      var fait = k < M.etape, ici = k === M.etape, record = k === M.record - 1 && M.record > M.etape;
      svg += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (ici ? 8 : 5.5) + '" fill="' + (fait ? '#2f6e70' : (ici ? '#fff' : 'rgba(255,255,255,0.9)')) +
        '" stroke="' + (ici ? '#2f6e70' : (record ? '#c48f2c' : 'rgba(110,93,147,0.7)')) + '" stroke-width="' + (ici || record ? 3 : 1.5) + '"/>';
    });
    var s0 = pts[nE - 1];
    svg += '<path d="M' + s0[0] + ' ' + (s0[1] - 6) + ' L' + s0[0] + ' ' + (s0[1] - 26) + ' L' + (s0[0] + 15) + ' ' + (s0[1] - 21) + ' L' + s0[0] + ' ' + (s0[1] - 16) + '" fill="#c48f2c" stroke="#7d5614" stroke-width="1.5"/></svg>';
    var div = h('div', { class: 'montagne-dessin' });
    div.innerHTML = svg;
    return div;
  }
  function carteMontagne(p, m) {
    var M = p.montagne, nE = MP.MONTAGNES[m].length, ouverte = MP.montagneOuverte(p, m);
    var elite = MP.BOULES.filter(function (b) { return b.sommet === m; })[0], etape = MP.MONTAGNES[m][M.etape];
    return h('section', { class: 'carte montagne-carte' }, [
      h('span', { class: 'etiquette', texte: 'Défi d’élite' }),
      h('h3', { texte: m === 'pointage' ? 'La Montagne du pointage' : 'La Montagne du tir' }),
      h('p', { texte: nE + ' étapes, toujours les mêmes, chacune avec sa technique imposée. ' + MP.MONTAGNE_BOULES + ' boules par étape : ' +
        (m === 'pointage' ? 'une dans la zone' : 'une sur la cible') + ' et tu montes ; les ' + MP.MONTAGNE_BOULES + ' ratées, tu redescends tout en bas.' }),
      dessinMontagne(M, nE),
      h('p', { class: 'discret', texte: 'Au sommet : ' + elite.nom + ' — toutes les techniques, les meilleures qualités, tous tes Points ×2.' +
        (M.sommets ? ' Sommets atteints : ' + M.sommets + '.' : (M.record ? ' Plus haute étape : ' + M.record + '/' + nE + '.' : '')) }),
      ouverte ? h('button', { type: 'button', class: 'bouton large', onclick: function () { MP.Partie.commencer(m, false, null, null, false, false, true); } },
        [M.etape || M.boule ? 'Reprendre : étape ' + (M.etape + 1) + ', ' + etape.nom.toLowerCase() : 'Grimper'])
        : h('p', { class: 'etape-info', texte: 'S’ouvre quand toutes tes épreuves de ' + (m === 'pointage' ? 'pointage' : 'tir') + ' sont réussies, avec une boule pour chaque technique.' })
    ]);
  }

  // ---------- Jouer ----------
  function ecranJouer() {
    var p = d(), Ds = D(), m = vue();
    var boule = MP.trouver(MP.BOULES, p.equipee);
    var tech = MP.trouver(MP.TECHNIQUES, p.technique);
    var portee = MP.porteeMax(p, boule, p.technique).toFixed(1).replace('.', ',');
    var reussite = p.lances ? Math.round(100 * p.victoires / p.lances) + ' %' : '—';
    var besoin = MP.xpPourPalier(p.palier);
    var heros = h('section', { class: 'carte heros' }, [
      h('span', { class: 'etiquette', texte: Ds.joueur + ' · ' + MP.nomLigue(p.ligue) + ' · saison ' + p.saison + (p.trophees ? ' · ' + p.trophees + ' trophée' + (p.trophees > 1 ? 's' : '') : '') }),
      h('h2', { texte: m === 'pointage' ? 'Prêt à pointer ?' : 'Prêt à tirer ?' }),
      h('div', { class: 'palier' }, [
        h('div', { class: 'ligne espace' }, [h('b', { texte: 'Palier ' + p.palier }), h('span', { class: 'discret', texte: 'encore ' + (besoin - p.xp) + ' ★ pour le palier ' + (p.palier + 1) })]),
        h('span', { class: 'barre-palier' }, [h('i', { style: 'width:' + Math.round(100 * p.xp / besoin) + '%' })]),
        h('span', { class: 'discret', texte: 'Chaque victoire remplit la barre (★ du niveau). Palier suivant : niveaux plus durs et +15 % de Points. Trois défaites de suite font redescendre.' })
      ]),
      h('div', { class: 'pastilles' }, [
        h('span', { class: 'pastille', texte: 'Portée : ' + portee + ' m' }),
        h('span', { class: 'pastille', texte: tech.nom + (tech.famille === 'roule' ? ' : glisser' : ' : maintenir') }),
        MP.productionClub(p, Date.now(), false) > 0 ? h('span', { class: 'pastille', texte: 'Club : +' + taux(MP.productionClub(p, Date.now(), false)) + ' pts/s' }) : null,
        p.serie >= 2 ? h('span', { class: 'pastille', texte: 'Série : ' + p.serie + (MP.multiplicateurSerie(p.serie) > 1 ? ' (×' + String(MP.multiplicateurSerie(p.serie)).replace('.', ',') + ')' : '') }) : null
      ]),
      h('div', { class: 'actions' }, [
        h('button', { type: 'button', class: 'bouton grand', onclick: function () { MP.Partie.commencer(m, false); } }, ['Lancer une boule'])
      ])
    ]);

    var lancers = h('div', { class: 'liste-lancers' }, MP.TECHNIQUES.filter(function (t) { return t.mode === m; }).map(function (t) {
      var appris = MP.techniqueDisponible(p, t.id), ok = appris && MP.boulePermet(boule, t.id);
      var c = t.competence ? MP.trouver(MP.ARBRES[m], t.competence) : null;
      var ep = MP.trouver(MP.EPREUVES, t.id), etatTexte;
      if (ok) etatTexte = c ? 'N' + MP.niveau(p, c.id) : 'De base';
      else if (appris) etatTexte = 'Avec une autre boule';
      else if (ep && MP.epreuvesOuvertes(p, m).indexOf(ep) >= 0) etatTexte = 'Épreuve !';
      else if (ep && MP.techniqueDisponible(p, ep.apres)) { var mt = MP.maitriseEpreuve(p, ep); etatTexte = mt.n + '/' + mt.besoin + ' en ' + mt.technique.nom.toLowerCase(); }
      else etatTexte = 'Plus tard';
      return h('div', { class: 'lancer' + (ok ? '' : ' bloque') }, [
        h('span', { class: 'geste', texte: t.famille === 'roule' ? 'Glisser' : 'Maintenir' }),
        h('b', { texte: t.nom }),
        h('span', { class: 'discret', texte: etatTexte })
      ]);
    }));

    // Épreuves ouvertes : le « boss » à battre pour débloquer la technique suivante.
    var epreuves = MP.epreuvesOuvertes(p, m).map(function (ep) {
      var nom = MP.trouver(MP.ARBRES[m], ep.id).nom;
      return h('section', { class: 'carte epreuve-carte' }, [
        h('span', { class: 'etiquette', texte: 'Épreuve à relever' }),
        h('h3', { texte: nom }),
        h('p', { texte: ep.regle }),
        h('p', { class: 'discret', texte: 'Pas de Points pendant l’épreuve. Réussie, elle débloque ' + nom + ' pour toujours' +
          (MP.trouver(MP.TECHNIQUES, ep.id) ? ', à jouer dès la nouvelle saison.' : '.') })
      ].concat(boutonEpreuve(p, m, ep)));
    });

    // Prochaine étape : ce qu'il y a de mieux à faire maintenant.
    var etape = MP.prochaineEtape(etat(), m);
    var prochaine = h('section', { class: 'carte prochaine-etape' }, [
      h('span', { class: 'etiquette', texte: 'Prochaine étape' }),
      h('p', { texte: etape.texte }),
      etape.bouton ? h('button', { type: 'button', class: 'bouton secondaire', onclick: function () { afficher(etape.ecran); } }, [etape.bouton]) : null
    ]);

    var terrains = h('div', { class: 'terrains' }, MP.TERRAINS.map(function (t, i) {
      var palierTerrain = 1 + Math.ceil(t.cote / 1.02);
      var ligueOk = (t.ligue || 0) <= p.ligue, vu = ligueOk && p.palier >= palierTerrain;
      return h('div', { class: 'terrain' + (vu ? '' : ' bloque') }, [
        apercuTerrain(t),
        h('span', { class: 'texte' }, [
          h('b', { texte: t.nom }),
          h('span', { class: 'discret', texte: vu ? t.desc : (ligueOk ? 'Vers le palier ' + palierTerrain : 'Ligue ' + MP.nomLigue(t.ligue)) })
        ])
      ]);
    }));

    var stats = h('div', { class: 'stats' }, [
      h('div', { class: 'stat' }, [h('b', { texte: MP.formatPoints(p.lances) }), h('span', { texte: 'boules lancées' })]),
      h('div', { class: 'stat' }, [h('b', { texte: reussite }), h('span', { texte: 'de réussite' })]),
      h('div', { class: 'stat' }, [h('b', { texte: p.meilleureSerie }), h('span', { texte: 'meilleure série' })]),
      h('div', { class: 'stat' }, [h('b', { texte: p.meilleurNiveau ? '★'.repeat(p.meilleurNiveau) : '—' }), h('span', { texte: 'niveau le plus dur' })]),
      m === 'pointage'
        ? h('div', { class: 'stat' }, [h('b', { texte: p.meilleurPoint == null ? '—' : MP.formatEcart(p.meilleurPoint) }), h('span', { texte: 'meilleur point' })])
        : h('div', { class: 'stat' }, [h('b', { texte: p.carreaux }), h('span', { texte: 'carreaux' })]),
      m === 'pointage'
        ? h('div', { class: 'stat' }, [h('b', { texte: p.biberons }), h('span', { texte: 'biberons' })])
        : h('div', { class: 'stat' }, [h('b', { texte: MP.formatPoints(p.gagnes) }), h('span', { texte: 'points gagnés' })])
    ]);

    var possible = MP.saisonPossible(p);
    var saison = h('section', { class: 'carte saison' }, [
      h('div', { class: 'ligne espace' }, [h('h3', { texte: 'Nouvelle saison' }), h('span', { class: 'trophees', texte: '🏆 ' + p.trophees })]),
      p.trophees ? h('p', { class: 'discret', style: 'margin:0', texte: 'Tes trophées donnent +' + (10 * p.trophees) + ' % de Points, jusqu’à la prochaine ligue.' }) : null,
      p.techniqueAttente ? h('p', { style: 'margin:0', texte: '✨ ' + MP.trouver(MP.TECHNIQUES, p.techniqueAttente).nom + ' t’attend : elle se joue dès la nouvelle saison.' }) : null,
      possible
        ? h('p', { style: 'margin:0', texte: 'Tu peux commencer la saison ' + (p.saison + 1) + ' et gagner ' + MP.tropheesGagnes(p) + ' trophée' + (MP.tropheesGagnes(p) > 1 ? 's' : '') + ' (+10 % de Points chacun). Tes boules, succès et épreuves restent ; Points, compétences, améliorations, club et palier repartent à zéro.' })
        : h('div', { class: 'palier' }, [
          h('span', { class: 'discret', texte: 'Atteins le palier ' + MP.PALIER_SAISON + ' pour recommencer avec des trophées. Meilleur palier de la saison : ' + p.palierMaxSaison + '.' }),
          h('span', { class: 'barre-palier' }, [h('i', { style: 'width:' + Math.round(100 * Math.min(1, p.palierMaxSaison / MP.PALIER_SAISON)) + '%' })])
        ]),
      possible ? h('button', { type: 'button', class: 'bouton large', onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.getAttribute('data-confirmer') !== 'oui') {
          b.setAttribute('data-confirmer', 'oui'); b.textContent = 'Toucher encore pour commencer la saison ' + (p.saison + 1); return;
        }
        var t = MP.nouvelleSaison(etat(), m);
        enregistrer(); MP.Son.palier(); toast('Saison ' + etat()[m].saison + ' : +' + t + ' trophée' + (t > 1 ? 's' : '') + ' !'); afficher('jouer');
      }, texte: 'Commencer la saison ' + (p.saison + 1) }) : null
    ]);

    // Ligue : le 2e prestige. Gains ×4 pour toujours, saisons et trophées à zéro.
    var besoinLigue = MP.tropheesLigue(p.ligue), suivante = MP.nomLigue(p.ligue + 1), okLigue = MP.liguePossible(p);
    var terrainLigue = MP.TERRAINS.filter(function (t) { return t.ligue === p.ligue + 1; })[0];
    var bouleLigue = MP.BOULES.filter(function (b) { return b.ligue === p.ligue + 1; })[0];
    var ligue = h('section', { class: 'carte saison ligue' }, [
      h('div', { class: 'ligne espace' }, [h('h3', { texte: 'Ligue ' + MP.nomLigue(p.ligue) }),
        h('span', { class: 'trophees', texte: p.ligue ? 'gains ×' + MP.formatPoints(Math.pow(4, p.ligue)) : 'départ' })]),
      h('p', { style: 'margin:0', texte: 'Monte en ligue ' + suivante + ' : tous tes gains ×4 pour toujours' +
        (terrainLigue ? ', nouveau terrain (' + terrainLigue.nom + ')' : '') + (bouleLigue ? ', nouvelle boule (' + bouleLigue.nom + ')' : '') +
        '. Saisons et trophées repartent à zéro ; boules, succès et épreuves restent.' }),
      h('div', { class: 'palier' }, [
        h('span', { class: 'discret', texte: 'Trophées : ' + p.trophees + '/' + besoinLigue }),
        h('span', { class: 'barre-palier' }, [h('i', { style: 'width:' + Math.round(100 * Math.min(1, p.trophees / besoinLigue)) + '%' })])
      ]),
      okLigue ? h('button', { type: 'button', class: 'bouton large', onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.getAttribute('data-confirmer') !== 'oui') {
          b.setAttribute('data-confirmer', 'oui'); b.textContent = 'Toucher encore pour monter en ' + suivante; return;
        }
        MP.monterLigue(etat(), m);
        enregistrer(); MP.Son.palier(); toast('Ligue ' + suivante + ' : gains ×4 !'); afficher('jouer');
      }, texte: 'Monter en ligue ' + suivante }) : null
    ]);

    // Mode libre : des niveaux mixtes où l'on tire et où l'on pointe ; les Points vont aux deux disciplines.
    var libreCarte = h('section', { class: 'carte mode-libre' }, [
      h('span', { class: 'etiquette', texte: 'Mode libre' }),
      h('h3', { texte: 'Tirer et pointer' }),
      h('p', { texte: 'Une boule adverse tient le point : tire celle qui gêne, puis pointe (ou l’inverse), avec toutes tes techniques des deux disciplines. Les Points gagnés vont pour moitié au pointage, pour moitié au tir.' }),
      h('button', { type: 'button', class: 'bouton large secondaire', onclick: function () { MP.Partie.commencer(m, false, null, null, true); } }, ['Jouer en mode libre'])
    ]);

    // Parcours (pointage) : des lancers imposés, sans boule adverse, à réussir l'un après l'autre.
    var pc = p.parcours, parcoursCarte = m !== 'pointage' ? null : h('section', { class: 'carte mode-libre parcours-carte' }, [
      h('span', { class: 'etiquette', texte: 'Lancers imposés' }),
      h('h3', { texte: 'Parcours n° ' + pc.numero }),
      h('p', { texte: 'Chaque lancer impose sa technique, sans boule adverse, sur un terrain plein de relief : lis la pente, ajuste ta visée et finis dans le cercle. Raté ? Tu rejoues le même lancer jusqu’à le réussir.' }),
      h('div', { class: 'palier' }, [
        h('span', { class: 'discret', texte: 'Lancer ' + (pc.lancer + 1) + '/' + MP.PARCOURS_LANCERS + (pc.essais ? ' · ' + pc.essais + ' essai' + (pc.essais > 1 ? 's' : '') + ' raté' + (pc.essais > 1 ? 's' : '') : '') +
          (pc.reussis ? ' · ' + pc.reussis + ' parcours terminé' + (pc.reussis > 1 ? 's' : '') : '') }),
        h('span', { class: 'barre-palier' }, [h('i', { style: 'width:' + Math.round(100 * pc.lancer / MP.PARCOURS_LANCERS) + '%' })])
      ]),
      h('button', { type: 'button', class: 'bouton large secondaire', onclick: function () { MP.Partie.commencer('pointage', false, null, null, false, true); } },
        [pc.lancer || pc.essais ? 'Continuer le parcours' : 'Commencer le parcours'])
    ]);

    return h('div', { class: 'ecran' }, [
      heros, prochaine
    ].concat(epreuves, [carteMontagne(p, m), parcoursCarte, libreCarte,
      h('div', { class: 'grille' }, [
        h('section', { class: 'carte', style: 'display:grid;gap:12px' }, [h('h3', { texte: 'Tes lancers' }), lancers]),
        h('section', { class: 'carte', style: 'display:grid;gap:12px' }, [h('h3', { texte: 'Statistiques' }), stats]),
        carteSucces()
      ]),
      h('div', { class: 'grille' }, [
        h('section', { class: 'carte boule-carte' }, [
          dessinBoule(boule, 96, etat().initiales),
          h('div', {}, [
            h('span', { class: 'etiquette', texte: 'Boule de ' + (m === 'pointage' ? 'pointage' : 'tir') }),
            h('h3', { texte: boule.nom }),
            h('p', { class: 'discret', style: 'margin:6px 0 0', texte: 'Précision ' + MP.surCent(boule.precision) + ' · Puissance ' + MP.surCent(boule.puissance) + ' · ' + (m === 'pointage' ? 'Pointage ' + MP.surCent(boule.pointage) : 'Tir ' + MP.surCent(boule.tir)) + ' (sur 100)' })
          ]),
          h('button', { type: 'button', class: 'bouton secondaire large', onclick: function () { afficher('boules'); }, texte: 'Changer de boule' })
        ]),
        h('section', { class: 'carte', style: 'display:grid;gap:12px' }, [
          h('div', { class: 'ligne espace' }, [h('h3', { texte: 'Terrains' }), h('span', { class: 'discret', texte: 'Tirés au hasard à chaque niveau' })]),
          terrains
        ])
      ]),
      saison,
      ligue
    ]));
  }

  // ---------- Améliorations ----------
  function ecranBoutique() {
    var liste = MP.AMELIORATIONS[vue()].map(function (a) {
      var n = MP.niveauAm(d(), a.id), s = MP.etatAmelioration(etat(), vue(), a.id);
      if (s.raison === 'vol') {
        return h('section', { class: 'carte amelioration bloquee' }, [
          h('h3', { texte: a.nom }), h('p', { texte: a.desc }),
          h('div', { class: 'verrou' }, ['🔒 Pour les lancers en l’air : débloque d’abord la ' + (vue() === 'pointage' ? 'Demi-portée' : 'technique Tir devant')])
        ]);
      }
      return h('section', { class: 'carte amelioration' + (s.raison === 'max' ? ' max' : '') }, [
        h('h3', { texte: a.nom }),
        h('p', { texte: a.desc }),
        h('div', { class: 'niveau' }, [h('span', { texte: 'N' + n }), jauge(n, a.max), h('span', { class: 'discret', texte: a.max })]),
        s.raison === 'max' ? boutonPrix('Maximum atteint', null, false) : boutonLot('amelioration', a.id, 'Améliorer')
      ]);
    });
    return h('div', { class: 'ecran' }, [
      h('h2', { texte: 'Améliorations · ' + D().nom }),
      h('p', { class: 'intro', texte: 'Payées avec tes Points de ' + (vue() === 'pointage' ? 'pointage' : 'tir') + '. Chaque niveau coûte 15 % de plus.' }),
      selecteurLot(),
      h('div', { class: 'arbre' }, liste)
    ]);
  }

  // ---------- Compétences ----------
  function ecranCompetences() {
    var arbre = MP.ARBRES[vue()];
    var selecteur = h('div', { class: 'branches', role: 'group', 'aria-label': 'Branche' }, MP.BRANCHES.map(function (b) {
      var total = 0, max = 0;
      arbre.forEach(function (c) { if (c.branche === b.id) { total += MP.niveau(d(), c.id); max += c.max; } });
      return h('button', { type: 'button', 'aria-pressed': branche === b.id ? 'true' : 'false', onclick: function () { branche = b.id; afficher(); } },
        [b.nom + ' ', h('span', { style: 'opacity:.7;font-weight:600', texte: total + '/' + max })]);
    }));
    var cartes = arbre.filter(function (c) { return c.branche === branche; }).map(function (c) {
      var n = MP.niveau(d(), c.id), s = MP.etatCompetence(etat(), vue(), c.id);
      var bloque = s.raison === 'requis' || s.raison === 'epreuve';
      if (s.raison === 'epreuve') return carteEpreuve(c);
      // Une technique se précise à chaque niveau (MP.precision) : on le dit.
      var technique = MP.TECHNIQUES.some(function (t) { return t.competence === c.id; });
      return h('section', { class: 'carte amelioration' + (bloque ? ' bloquee' : '') + (s.raison === 'max' ? ' max' : '') }, [
        h('div', { class: 'ligne espace' }, [h('h3', { texte: c.nom }), c.max === 1 ? h('span', { class: 'etiquette', texte: 'Aide' }) : null]),
        h('p', { texte: c.desc + (technique ? ' Chaque niveau la rend plus juste : deux fois moins d’erreur au niveau 8.' : '') }),
        bloque ? h('div', { class: 'verrou' }, ['🔒 Il faut d’abord ' + s.texte]) : null,
        h('div', { class: 'niveau' }, [h('span', { texte: 'N' + n }), jauge(n, c.max), h('span', { class: 'discret', texte: c.max })]),
        s.raison === 'max' ? boutonPrix(c.max === 1 ? 'Acquis' : 'Maximum atteint', null, false) :
          (bloque || c.max === 1 ? boutonPrix(n ? 'Progresser' : 'Apprendre', s.prix, s.possible, function () {
            if (MP.acheterCompetence(etat(), vue(), c.id)) { MP.Son.achat(); enregistrer(); afficher(); }
          }) : boutonLot('competence', c.id, n ? 'Progresser' : 'Apprendre'))
      ]);
    });
    return h('div', { class: 'ecran' }, [
      h('h2', { texte: 'Compétences · ' + D().nom }),
      h('p', { class: 'intro', texte: 'Ton arbre de ' + D().joueur.toLowerCase() + ' : ' + MP.totalNiveaux(d()) + ' niveaux appris. Il est séparé de celui du ' + (vue() === 'pointage' ? 'tir' : 'pointage') + '.' }),
      selecteur,
      selecteurLot(),
      h('div', { class: 'arbre' }, cartes)
    ]);
  }

  // ---------- Club ----------
  function taux(v) {
    if (v >= 100) return MP.formatPoints(v);
    return String(Math.round(v * (v < 1 ? 100 : 10)) / (v < 1 ? 100 : 10)).replace('.', ',');
  }
  function texteElan(p) {
    var reste = Math.ceil((p.elan - Date.now()) / 1000);
    return reste > 0 ? 'Élan : production doublée encore ' + reste + ' s.' : 'Gagne un niveau pour donner de l’élan à ton club : production doublée pendant 30 s.';
  }
  function majClub() {
    var p = d(), a = document.getElementById('club-production'), b = document.getElementById('club-elan');
    if (a) a.firstChild.textContent = '+' + taux(MP.productionClub(p, Date.now(), false)) + ' ';
    if (b) { b.textContent = texteElan(p); b.classList.toggle('elan', p.elan > Date.now()); }
  }

  function ecranClub() {
    var p = d(), m = vue(), mult = MP.multiplicateurDurable(p);
    var tete = h('section', { class: 'carte heros club-heros' }, [
      h('span', { class: 'etiquette', texte: 'Ton club de ' + (m === 'pointage' ? 'pointeurs' : 'tireurs') }),
      h('h2', { id: 'club-production' }, ['+' + taux(MP.productionClub(p, Date.now(), false)) + ' ', h('small', { texte: 'pts par seconde' })]),
      h('p', { id: 'club-elan', class: p.elan > Date.now() ? 'elan' : 'discret', style: 'margin:0', texte: texteElan(p) }),
      h('p', { style: 'margin:0', texte: 'Ton club gagne ' + taux(MP.partiesClub(p)) + ' partie' + (MP.partiesClub(p) >= 2 ? 's' : '') + ' par minute (au plus ' + taux(MP.CLUB_MAX) + '), chacune ' + taux(MP.VALEUR_CLUB * mult) + ' pts. Force du club : ' + MP.formatPoints(MP.forceClub(p)) + '.' }),
      h('p', { class: 'discret', style: 'margin:0', texte: 'Tes coéquipiers jouent tout seuls : plus le club est fort, plus il approche du maximum. Appli fermée, ils continuent à mi-régime, jusqu’à 8 h. Une nouvelle saison remet le club à zéro.' })
    ]);
    var cartes = MP.CLUB.map(function (r) {
      var n = p.club[r.id], s = MP.etatRecrue(etat(), m, r.id), nom = MP.nomRecrue(r, m);
      if (s.raison === 'requis' && !n) {
        return h('section', { class: 'carte amelioration bloquee' }, [h('h3', { texte: nom }),
          h('div', { class: 'verrou' }, ['🔒 Recrute d’abord un ' + s.texte.charAt(0).toLowerCase() + s.texte.slice(1)])]);
      }
      var prochain = MP.PALIERS_CLUB.filter(function (x) { return x > n; })[0];
      return h('section', { class: 'carte amelioration recrue' }, [
        h('div', { class: 'ligne espace' }, [h('h3', { texte: nom }), h('b', { class: 'compte', texte: '×' + n })]),
        h('p', { texte: 'Chacun ajoute ' + MP.formatPoints(r.force) + ' de force au club.' + (n ? ' Ensemble : ' + MP.formatPoints(MP.forceRecrue(p, r.id)) + '.' : '') }),
        prochain ? h('span', { class: 'discret', texte: 'Force ×2 à ' + prochain + ' recrues' + (n ? ' (encore ' + (prochain - n) + ')' : '') + '.' }) : null,
        boutonLot('recrue', r.id, 'Recruter')
      ]);
    });
    return h('div', { class: 'ecran' }, [
      h('h2', { texte: 'Club · ' + D().nom }),
      tete,
      selecteurLot(),
      h('div', { class: 'arbre' }, cartes)
    ]);
  }

  // Retour dans l'appli : ce que le club a gagné pendant l'absence.
  function absence(g) {
    var duree = g.secondes >= 3600 ? Math.floor(g.secondes / 3600) + ' h ' + String(Math.floor(g.secondes % 3600 / 60)).padStart(2, '0')
      : Math.floor(g.secondes / 60) + ' min';
    var voile = h('div', { class: 'voile', onclick: function (ev) { if (ev.target === voile) voile.remove(); } });
    voile.appendChild(h('div', { class: 'carte absence', role: 'dialog', 'aria-label': 'Pendant ton absence' }, [
      h('h3', { texte: 'Pendant ton absence (' + duree + ')' }),
      h('p', { class: 'discret', style: 'margin:0', texte: 'Ton club a continué à jouer, à mi-régime :' }),
      g.pointage >= 1 ? h('p', { class: 'gros', texte: '+' + MP.formatPoints(g.pointage) + ' pts de pointage' }) : null,
      g.tir >= 1 ? h('p', { class: 'gros', texte: '+' + MP.formatPoints(g.tir) + ' pts de tir' }) : null,
      h('button', { type: 'button', class: 'bouton large', onclick: function () { voile.remove(); afficher(); }, texte: 'Super !' })
    ]));
    document.body.appendChild(voile);
  }

  // ---------- Gravure du début ----------
  // Au premier lancement (et après « Recommencer à zéro ») : on grave ses initiales sur sa boule,
  // c'est le début de l'aventure. On peut le faire plus tard dans Boules.
  function graverAuDebut() {
    if (document.querySelector('.gravure')) return;
    var e = etat(), bE = MP.bouleEquipee(e.pointage);
    var apercu = h('canvas', { width: 280, height: 280, 'aria-hidden': 'true', class: 'gravure-boule' });
    var angle = 0.7, anime = null;
    function dessiner() {
      var cx = apercu.getContext('2d');
      cx.setTransform(2, 0, 0, 2, 0, 0); cx.clearRect(0, 0, 140, 140);
      var g = cx.createRadialGradient(76, 116, 0, 76, 116, 52);
      g.addColorStop(0, 'rgba(110,90,150,0.28)'); g.addColorStop(1, 'rgba(110,90,150,0)');
      cx.fillStyle = g; cx.beginPath(); cx.ellipse(76, 116, 50, 13, 0, 0, 7); cx.fill();
      MP.dessinerBoule(cx, 70, 64, 52, MP.teinteJoueur(bE), angle, 0.25, MP.striesJoueur(bE), MP.initialesPropres(champ.value));
    }
    var champ = h('input', { type: 'text', maxlength: '3', placeholder: 'ABC', 'aria-label': 'Tes initiales', autocapitalize: 'characters', spellcheck: 'false',
      oninput: function (ev) { var v = MP.initialesPropres(ev.target.value); if (v !== ev.target.value) ev.target.value = v; bouton.disabled = !v; dessiner(); } });
    var voile = h('div', { class: 'voile' });
    function fermer() { if (anime) cancelAnimationFrame(anime); voile.remove(); }
    var bouton = h('button', { type: 'button', class: 'bouton large', disabled: true, onclick: function () {
      var v = MP.initialesPropres(champ.value);
      if (!v) return;
      // La boule tourne une fois sur elle-même, gravée, puis l'aventure commence.
      var debut = performance.now();
      (function tourne(t) {
        angle = 0.7 + Math.min(1, (t - debut) / 900) * Math.PI * 2;
        dessiner();
        if (t - debut < 900) anime = requestAnimationFrame(tourne);
        else {
          e.initiales = v; e.graveDemandee = true; enregistrer(); MP.Son.palier(); fermer(); afficher();
          toast('Ta boule est gravée : ' + v + '. Bonne partie !');
        }
      })(debut);
    } }, ['Graver ma boule']);
    voile.appendChild(h('div', { class: 'carte gravure', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Grave ta boule' }, [
      h('h2', { texte: 'Grave ta boule' }),
      h('p', { texte: 'Chaque joueur grave ses initiales sur ses boules. Les tiennes te suivront sur toutes tes boules, partie après partie : c’est le début de ton aventure.' }),
      apercu,
      h('label', { class: 'initiales' }, [h('span', {}, [h('b', { texte: 'Tes initiales' }), h('small', { texte: '3 lettres au plus' })]), champ]),
      bouton,
      h('button', { type: 'button', class: 'lien-discret', onclick: function () { e.graveDemandee = true; enregistrer(); fermer(); }, texte: 'Plus tard (dans Boules)' })
    ]));
    document.body.appendChild(voile);
    dessiner();
    setTimeout(function () { champ.focus(); }, 50);
  }

  // ---------- Succès ----------
  function carteSucces() {
    var p = d(), liste = MP.succesDe(vue()), n = MP.nombreSucces(p);
    return h('section', { class: 'carte', style: 'display:grid;gap:12px' }, [
      h('div', { class: 'ligne espace' }, [h('h3', { texte: 'Succès' }), h('b', { texte: n + '/' + liste.length })]),
      jauge(n, liste.length),
      h('p', { class: 'discret', style: 'margin:0', texte: 'Chaque succès donne +3 % de Points pour toujours. Bonus actuel : +' + Math.round(n * MP.BONUS_SUCCES * 100) + ' %.' }),
      h('button', { type: 'button', class: 'bouton secondaire large', onclick: function () { afficher('succes'); } }, ['Voir les succès'])
    ]);
  }

  function ecranSucces() {
    var p = d(), liste = MP.succesDe(vue()), n = MP.nombreSucces(p);
    var cartes = liste.map(function (x) {
      var ok = !!p.succes[x.id], v = Math.min(x.objectif, x.mesure(p) || 0);
      return h('div', { class: 'succes' + (ok ? ' obtenu' : '') }, [
        h('span', { class: 'medaille', 'aria-hidden': 'true', texte: ok ? '★' : '☆' }),
        h('div', null, [
          h('b', { texte: x.nom }),
          h('span', { class: 'discret', texte: x.desc }),
          ok ? null : h('div', { class: 'niveau' }, [jauge(v, x.objectif), h('span', { class: 'discret', texte: MP.formatPoints(v) + '/' + MP.formatPoints(x.objectif) })])
        ])
      ]);
    });
    return h('div', { class: 'ecran' }, [
      h('button', { type: 'button', class: 'bouton secondaire', style: 'justify-self:start', onclick: function () { afficher('jouer'); } }, ['← Retour']),
      h('h2', { texte: 'Succès · ' + D().nom }),
      h('p', { class: 'intro', texte: n + ' sur ' + liste.length + ' obtenus : +' + Math.round(n * MP.BONUS_SUCCES * 100) + ' % de Points, pour toujours (même après une nouvelle saison ou une ligue).' }),
      h('div', { class: 'liste-succes' }, cartes)
    ]);
  }

  // Achat par lots : ×1, ×10 ou Max (le plus possible avec tes Points).
  function lot() { var l = etat().reglages.lot; return l === 0 ? 'max' : l; }
  function selecteurLot() {
    return h('div', { class: 'lots', role: 'group', 'aria-label': 'Quantité' }, [h('span', { class: 'discret', texte: 'Acheter' })].concat(
      [[1, '×1'], [10, '×10'], [0, 'Max']].map(function (x) {
        return h('button', { type: 'button', 'aria-pressed': etat().reglages.lot === x[0] ? 'true' : 'false',
          onclick: function () { etat().reglages.lot = x[0]; enregistrer(); afficher(); } }, [x[1]]);
      })));
  }
  function boutonLot(genre, id, libelle) {
    var devis = MP.devisLot(etat(), vue(), genre, id, lot());
    return boutonPrix(libelle + (devis.nombre > 1 ? ' ×' + devis.nombre : ''), devis.prix, devis.possible, function () {
      if (MP.acheterLot(etat(), vue(), genre, id, lot())) { MP.Son.achat(); enregistrer(); afficher(); }
    });
  }

  // Technique pas encore débloquée : la maîtrise, puis l'épreuve.
  function carteEpreuve(c) {
    var p = d(), ep = MP.trouver(MP.EPREUVES, c.id), mt = MP.maitriseEpreuve(p, ep);
    var ouverte = MP.epreuvesOuvertes(p, vue()).indexOf(ep) >= 0;
    var avant = MP.techniqueDisponible(p, ep.apres);
    return h('section', { class: 'carte amelioration bloquee epreuve-carte' + (ouverte ? ' ouverte' : '') }, [
      h('div', { class: 'ligne espace' }, [h('h3', { texte: c.nom }), h('span', { class: 'etiquette', texte: ouverte ? 'Épreuve' : 'À débloquer' })]),
      h('p', { texte: c.desc }),
      h('div', { class: 'verrou' }, [avant
        ? '1. Maîtrise : ' + mt.n + '/' + mt.besoin + ' victoires en ' + mt.technique.nom.toLowerCase()
        : '1. Maîtrise : débloque d’abord ' + mt.technique.nom]),
      avant ? h('div', { class: 'niveau' }, [jauge(mt.n, mt.besoin)]) : null,
      ep.requis ? h('p', { class: 'discret', texte: 'Il faut aussi : ' + ep.requis.map(function (id) {
        return MP.trouver(MP.ARBRES[vue()], id).nom + (MP.niveau(p, id) >= 1 ? ' ✓' : ' (à apprendre)');
      }).join(', ') + '.' }) : null,
      MP.trouver(MP.TECHNIQUES, ep.id) ? h('p', { class: 'discret', texte: '2. Palier ' + MP.PALIER_SAISON + ' dans cette saison : ' +
        Math.min(p.palierMaxSaison, MP.PALIER_SAISON) + '/' + MP.PALIER_SAISON + (MP.palierEpreuve(p, ep) ? ' ✓' : '') }) : null,
      h('p', { class: 'discret', texte: (MP.trouver(MP.TECHNIQUES, ep.id) ? '3' : '2') + '. Épreuve : ' + ep.regle +
        (MP.trouver(MP.TECHNIQUES, ep.id) ? ' Réussie, la technique se joue dès la nouvelle saison (palier 1, compétences et améliorations à zéro).' : '') }),
      h('p', { class: 'discret', texte: (MP.trouver(MP.TECHNIQUES, ep.id) ? '4' : '3') + '. Boule : il en faut une qui permet ' + MP.articleTechnique(MP.trouver(MP.TECHNIQUES, ep.technique).nom) +
        ' (' + MP.boulesPourTechnique(vue(), ep.technique).slice(0, 3).map(function (b) { return b.nom; }).join(', ') + '…).' })
    ].concat(ouverte ? boutonEpreuve(p, vue(), ep) : [boutonPrix('Épreuve pas encore ouverte', null, false)]));
  }

  // Bouton pour relever une épreuve, avec une de tes boules qui permet la technique ; sinon, quoi acheter.
  function boutonEpreuve(p, m, ep) {
    var bc = MP.bouleCompatible(p, ep.technique);
    if (bc) return [h('button', { type: 'button', class: 'bouton large', onclick: function () { MP.Partie.commencer(m, false, bc, ep.id); } },
      ['Relever l’épreuve' + (bc.id !== p.equipee ? ' (avec ' + bc.nom + ')' : '')])];
    var b = MP.boulesPourTechnique(m, ep.technique)[0];
    return [h('p', { class: 'verrou', texte: 'Il te faut une boule qui permet ' + MP.articleTechnique(MP.trouver(MP.TECHNIQUES, ep.technique).nom) + ' : ' + b.nom + ' (' + MP.formatPoints(MP.prixBoule(p, b.id)) + ' pts), dans Boules.' }),
      h('button', { type: 'button', class: 'bouton secondaire large', onclick: function () { afficher('boules'); } }, ['Voir les boules'])];
  }

  // ---------- Boules ----------
  function ecranBoules() {
    var techniques = MP.TECHNIQUES.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return x.t.mode === vue(); });
    var cartes = MP.boulesDe(vue()).map(function (b) {
      var s = MP.etatBoule(etat(), vue(), b.id);
      var possede = d().boules.indexOf(b.id) >= 0;
      // Statistiques de base, et celles avec ton réglage (boule achetée) : la différence se voit sur la barre.
      var st = possede ? MP.statsBoule(d(), b, vue()) : b;
      var cle = vue() === 'pointage' ? 'pointage' : 'tir';
      var barres = [['Précision', 'precision'], ['Puissance', 'puissance'], [vue() === 'pointage' ? 'Pointage' : 'Tir', cle], ['Contrôle', 'controle']]
        .map(function (x) { return [x[0], MP.surCent(b[x[1]]), MP.surCent(st[x[1]])]; });
      var action;
      if (s.raison === 'equipee') action = boutonPrix('Équipée', null, false);
      else if (s.raison === 'ligue') action = boutonPrix('Ligue ' + s.texte, s.prix, false);
      else if (s.raison === 'sommet') action = boutonPrix('Au sommet de la Montagne', null, false);
      else if (possede) action = boutonPrix('Équiper', null, true, function () { MP.acheterOuEquiperBoule(etat(), vue(), b.id); enregistrer(); afficher(); });
      else action = boutonPrix('Acheter', s.prix, s.possible, function () {
        if (MP.acheterOuEquiperBoule(etat(), vue(), b.id)) { MP.Son.achat(); enregistrer(); toast(b.nom + ' achetée et équipée'); afficher(); }
      });
      return h('section', { class: 'carte boule-carte' + (s.raison === 'equipee' ? ' equipee' : '') }, [
        dessinBoule(b, 96, possede ? etat().initiales : undefined),
        h('div', {}, [
          h('h3', { texte: b.nom }),
          h('div', { class: 'barres' }, barres.map(function (x) {
            var ecart = x[2] - x[1];
            return h('div', { class: 'barre' }, [h('span', { texte: x[0] }), jaugeReglage(x[1], x[2], 100),
              h('b', {}, [String(x[2]), ecart ? h('small', { class: ecart > 0 ? 'plus' : 'moins', texte: (ecart > 0 ? ' +' : ' −') + Math.abs(ecart) }) : null])]);
          })),
          h('p', { class: 'permet', texte: 'Permet : ' + techniques.filter(function (x) { return MP.boulePermet(b, x.t.id); }).map(function (x) { return x.t.nom; }).join(', ') }),
          b.terrains ? h('p', { class: 'specialite', texte: b.terrains['*'] ? 'Tout terrain : les terrains difficiles le sont moins.'
            : 'Faite pour : ' + Object.keys(b.terrains).map(function (id) { return MP.trouver(MP.TERRAINS, id).nom.toLowerCase(); }).join(', ') + ' (bien moins de difficulté).' }) : null,
          h('div', { class: 'affinites' }, techniques.filter(function (x) { return MP.boulePermet(b, x.t.id); }).map(function (x) {
            var v = b.affinites[x.i];
            return h('span', { class: 'affinite' + (v > 0 ? ' plus' : (v < 0 ? ' moins' : '')), texte: x.t.nom + ' ' + (v > 0 ? '+' : '') + v });
          })),
          possede ? null : h('p', { class: 'discret', texte: 'Réglage : ' + MP.pointsReglage(b) + ' points à répartir (poids, tendreté, adhérence) une fois achetée.' })
        ]),
        possede ? reglageBoule(b) : null,
        action,
        !possede ? h('button', { type: 'button', class: 'bouton secondaire large', onclick: function () { MP.Partie.commencer(vue(), true, b); } }, ['Essayer (sans Points)']) : null
      ]);
    });
    // Réglage d'une boule achetée : des points à répartir entre poids, tendreté et adhérence ; chacun
    // dit ce qu'il change aux statistiques, par point.
    function reglageBoule(b) {
      var NOMS_STATS = { precision: 'Précision', puissance: 'Puissance', pointage: 'Pointage', tir: 'Tir', controle: 'Contrôle' };
      var r = MP.reglageBoule(d(), b.id), total = MP.pointsReglage(b), pris = r.poids + r.tendrete + r.adherence;
      return h('div', { class: 'reglage-boule' }, [
        h('b', { texte: 'Réglage : ' + pris + '/' + total + ' points' })
      ].concat(MP.REGLAGES.map(function (x) {
        return h('div', { class: 'reglage-ligne' }, [
          h('span', { class: 'reglage-nom' }, [h('b', { texte: x.nom }), h('small', { texte: vue() === 'tir' ? x.descTir : x.desc }),
            h('small', { class: 'reglage-stats', texte: 'Par point : ' + Object.keys(x.stats[vue()]).map(function (k) {
              var v = x.stats[vue()][k]; return NOMS_STATS[k] + '\u00a0' + (v > 0 ? '+' : '−') + Math.max(1, Math.round(Math.abs(v) / MP.ECHELLE_STATS));
            }).join(', ') })]),
          h('button', { type: 'button', class: 'pas', 'aria-label': 'Moins de ' + x.nom.toLowerCase(), disabled: r[x.id] <= 0,
            onclick: function () { if (MP.reglerBoule(d(), b.id, x.id, -1)) { enregistrer(); afficher(); } } }, ['−']),
          h('span', { class: 'reglage-valeur', texte: String(r[x.id]) }),
          h('button', { type: 'button', class: 'pas', 'aria-label': 'Plus de ' + x.nom.toLowerCase(), disabled: pris >= total,
            onclick: function () { if (MP.reglerBoule(d(), b.id, x.id, 1)) { enregistrer(); afficher(); } } }, ['+'])
        ]);
      })));
    }
    // Couleurs de tes boules : à acheter, ou gagnées dans la Montagne ; et tes initiales gravées.
    var champ = h('input', { type: 'text', maxlength: '3', value: etat().initiales, placeholder: 'ABC', 'aria-label': 'Initiales à graver', autocapitalize: 'characters', spellcheck: 'false',
      oninput: function (ev) { var v = MP.initialesPropres(ev.target.value); if (v !== ev.target.value) ev.target.value = v; },
      onchange: function (ev) { etat().initiales = MP.initialesPropres(ev.target.value); enregistrer(); afficher(); toast(etat().initiales ? 'Initiales gravées : ' + etat().initiales : 'Initiales effacées'); } });
    var couleurs = h('section', { class: 'carte couleurs-carte' }, [
      h('h3', { texte: 'Couleur et motif de tes boules' }),
      h('label', { class: 'initiales' }, [h('span', {}, [h('b', { texte: 'Initiales gravées' }), h('small', { texte: '3 lettres au plus, sur toutes tes boules' })]), champ]),
      h('p', { class: 'discret', texte: 'Pour toutes tes boules, au pointage comme au tir.' }),
      h('div', { class: 'couleurs' }, MP.COULEURS.map(function (c) {
        var s = MP.etatCouleur(etat(), vue(), c.id), ech = h('canvas', { width: 88, height: 88, 'aria-hidden': 'true' });
        var cx = ech.getContext('2d'); cx.scale(2, 2);
        var bE = MP.bouleEquipee(d());
        MP.dessinerBoule(cx, 22, 22, 17, c.id === 'boule' ? bE.teinte : c.id, 0.7, 0.4, MP.striesJoueur(bE), etat().initiales);
        var etiquette = s.raison === 'choisie' ? 'Choisie' : (s.raison === 'choisir' ? 'Choisir' : (s.raison === 'gagnee' ? s.texte : MP.formatPoints(c.prix) + ' pts'));
        return h('button', { type: 'button', class: 'couleur' + (s.raison === 'choisie' ? ' choisie' : ''), disabled: !s.possible, 'aria-pressed': s.raison === 'choisie' ? 'true' : 'false',
          onclick: function () {
            var achat = s.raison === 'acheter';
            if (MP.acheterOuChoisirCouleur(etat(), vue(), c.id)) { if (achat) { MP.Son.achat(); toast(c.nom + ' : couleur achetée'); } enregistrer(); afficher(); }
          } }, [ech, h('b', { texte: c.nom }), h('small', { texte: etiquette })]);
      })),
      h('h3', { texte: 'Couleur de la gravure' }),
      h('div', { class: 'couleurs' }, MP.GRAVURES.map(function (c) {
        var s = MP.etatGravure(etat(), vue(), c.id), ech = h('canvas', { width: 88, height: 88, 'aria-hidden': 'true' });
        var cx = ech.getContext('2d'); cx.scale(2, 2);
        var bE = MP.bouleEquipee(d());
        MP.dessinerBoule(cx, 22, 22, 17, MP.teinteJoueur(bE), 0.7, 0.4, MP.striesJoueur(bE), { t: etat().initiales || 'ABC', encre: c.encre });
        var etiquette = s.raison === 'choisie' ? 'Choisie' : (s.raison === 'choisir' ? 'Choisir' : MP.formatPoints(c.prix) + ' pts');
        return h('button', { type: 'button', class: 'couleur' + (s.raison === 'choisie' ? ' choisie' : ''), disabled: !s.possible, 'aria-pressed': s.raison === 'choisie' ? 'true' : 'false',
          onclick: function () {
            var achat = s.raison === 'acheter';
            if (MP.acheterOuChoisirGravure(etat(), vue(), c.id)) { if (achat) { MP.Son.achat(); toast(c.nom + ' : gravure achetée'); } enregistrer(); afficher(); }
          } }, [ech, h('b', { texte: c.nom }), h('small', { texte: etiquette })]);
      })),
      h('h3', { texte: 'Police de la gravure' }),
      h('div', { class: 'couleurs' }, MP.POLICES.map(function (c) {
        var s = MP.etatPolice(etat(), vue(), c.id), ech = h('canvas', { width: 88, height: 88, 'aria-hidden': 'true' });
        var cx = ech.getContext('2d'); cx.scale(2, 2);
        var bE = MP.bouleEquipee(d());
        MP.dessinerBoule(cx, 22, 22, 17, MP.teinteJoueur(bE), 0.7, 0.4, MP.striesJoueur(bE), { t: etat().initiales || 'ABC', encre: MP.encreGravure(), police: c });
        var etiquette = s.raison === 'choisie' ? 'Choisie' : (s.raison === 'choisir' ? 'Choisir' : MP.formatPoints(c.prix) + ' pts');
        return h('button', { type: 'button', class: 'couleur' + (s.raison === 'choisie' ? ' choisie' : ''), disabled: !s.possible, 'aria-pressed': s.raison === 'choisie' ? 'true' : 'false',
          onclick: function () {
            var achat = s.raison === 'acheter';
            if (MP.acheterOuChoisirPolice(etat(), vue(), c.id)) { if (achat) { MP.Son.achat(); toast(c.nom + ' : police achetée'); } enregistrer(); afficher(); }
          } }, [ech, h('b', { texte: c.nom }), h('small', { texte: etiquette })]);
      })),
      h('h3', { texte: 'Stries de tes boules' }),
      h('div', { class: 'couleurs' }, MP.STRIES.map(function (c) {
        var s = MP.etatStrie(etat(), vue(), c.id), ech = h('canvas', { width: 88, height: 88, 'aria-hidden': 'true' });
        var cx = ech.getContext('2d'); cx.scale(2, 2);
        var bE = MP.bouleEquipee(d());
        MP.dessinerBoule(cx, 22, 22, 17, MP.teinteJoueur(bE), 0.7, 0.4, c.id === 'boule' ? bE.stries : c, null);
        var etiquette = s.raison === 'choisie' ? 'Choisies' : (s.raison === 'choisir' ? 'Choisir' : MP.formatPoints(c.prix) + ' pts');
        return h('button', { type: 'button', class: 'couleur' + (s.raison === 'choisie' ? ' choisie' : ''), disabled: !s.possible, 'aria-pressed': s.raison === 'choisie' ? 'true' : 'false',
          onclick: function () {
            var achat = s.raison === 'acheter';
            if (MP.acheterOuChoisirStrie(etat(), vue(), c.id)) { if (achat) { MP.Son.achat(); toast(c.nom + ' : stries achetées'); } enregistrer(); afficher(); }
          } }, [ech, h('b', { texte: c.nom }), h('small', { texte: etiquette })]);
      }))
    ]);
    return h('div', { class: 'ecran' }, [
      h('h2', { texte: 'Boules de ' + (vue() === 'pointage' ? 'pointage' : 'tir') }),
      h('p', { class: 'intro', texte: 'Chaque boule permet certaines techniques : sans la bonne boule, une technique apprise reste fermée. Certaines boules sont faites pour un terrain. Les affinités rendent une boule plus sûre (+) ou moins sûre (−) avec chaque technique ; le réglage se répartit entre poids, tendreté et adhérence, et se voit dans les statistiques.' + (MP.remiseAtelier(d()) ? ' Remise atelier : −' + MP.remiseAtelier(d()) + ' %.' : '') }),
      couleurs,
      h('div', { class: 'grille' }, cartes)
    ]);
  }

  // ---------- Réglages ----------
  function reglages() {
    var e = etat();
    var voile = h('div', { class: 'voile', onclick: function (ev) { if (ev.target === voile) voile.remove(); } });
    // Un curseur de réglage, avec sa valeur écrite ; l'essai se redessine en direct.
    function curseur(libelle, cle, min, max, pas, texte) {
      var valeur = h('b', { texte: texte(e.reglages[cle]) });
      return h('label', { class: 'curseur' }, [
        h('span', { class: 'ligne espace' }, [h('span', { texte: libelle }), valeur]),
        h('input', { type: 'range', min: String(min), max: String(max), step: String(pas), value: String(e.reglages[cle]),
          oninput: function (ev) { e.reglages[cle] = Number(ev.target.value); valeur.textContent = texte(e.reglages[cle]); essai.dessiner(); },
          onchange: function () { enregistrer(); } })
      ]);
    }
    // Le cadre d'essai : un doigt (posé au repos en bas, ou le tien) et la croix là où elle serait.
    var essai = (function () {
      var toile = h('canvas', { class: 'essai-croix', 'aria-label': 'Essai de la croix' }), doigtEssai = null;
      function dessiner() {
        var r = toile.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        if (!r.width) return;
        if (toile.width !== Math.round(r.width * dpr)) { toile.width = Math.round(r.width * dpr); toile.height = Math.round(r.height * dpr); }
        var cx = toile.getContext('2d'), L = r.width, H = r.height;
        cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, L, H);
        var f = doigtEssai || { x: L / 2, y: H - 34 }, dc = MP.decalageCroix(e.reglages), c = { x: f.x + dc.x, y: f.y + dc.y };
        cx.strokeStyle = 'rgba(47,110,112,0.55)'; cx.lineWidth = 1.2; cx.setLineDash([3, 5]);
        cx.beginPath(); cx.moveTo(f.x, f.y); cx.lineTo(c.x, c.y); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = doigtEssai ? 'rgba(47,110,112,0.18)' : 'rgba(47,110,112,0.1)'; cx.strokeStyle = 'rgba(47,110,112,0.8)'; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(f.x, f.y, 24, 0, 7); cx.fill(); cx.stroke();
        cx.strokeStyle = 'rgba(47,110,112,0.95)'; cx.lineWidth = 2.5;
        cx.beginPath(); cx.arc(c.x, c.y, 9, 0, 7); cx.stroke();
        cx.beginPath(); cx.moveTo(c.x - 15, c.y); cx.lineTo(c.x - 4, c.y); cx.moveTo(c.x + 4, c.y); cx.lineTo(c.x + 15, c.y);
        cx.moveTo(c.x, c.y - 15); cx.lineTo(c.x, c.y - 4); cx.moveTo(c.x, c.y + 4); cx.lineTo(c.x, c.y + 15); cx.stroke();
        if (!doigtEssai) { cx.fillStyle = 'rgba(47,74,74,0.6)'; cx.font = '700 12px Nunito, system-ui, sans-serif'; cx.textAlign = 'center'; cx.fillText('ton doigt', f.x, f.y + 4); }
      }
      function position(ev) { var r = toile.getBoundingClientRect(); doigtEssai = { x: ev.clientX - r.left, y: ev.clientY - r.top }; dessiner(); }
      toile.addEventListener('pointerdown', function (ev) { toile.setPointerCapture(ev.pointerId); position(ev); });
      toile.addEventListener('pointermove', function (ev) { if (doigtEssai) position(ev); });
      ['pointerup', 'pointercancel'].forEach(function (n) { toile.addEventListener(n, function () { doigtEssai = null; dessiner(); }); });
      return { toile: toile, dessiner: dessiner };
    })();
    function interrupteur(libelle, cle) {
      return h('label', { class: 'interrupteur' }, [libelle, h('input', { type: 'checkbox', checked: e.reglages[cle], onchange: function (ev) {
        e.reglages[cle] = ev.target.checked; MP.Son.regler(e.reglages.son, e.reglages.vibrations); enregistrer();
      } })]);
    }
    var fenetre = h('div', { class: 'fenetre', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Réglages' }, [
      // En-tête collé en haut : on ferme sans descendre tout en bas.
      h('div', { class: 'fenetre-entete' }, [
        h('h2', { texte: 'Réglages' }),
        h('button', { type: 'button', class: 'fermer-rond', 'aria-label': 'Fermer les réglages', onclick: function () { voile.remove(); } }, ['×'])
      ]),
      interrupteur('Sons', 'son'),
      interrupteur('Vibrations', 'vibrations'),
      // Croix des lancers en l'air : à quelle distance du doigt, et dans quelle direction ; à essayer.
      h('h3', { texte: 'Croix des lancers en l’air' }),
      h('p', { class: 'discret', style: 'margin:0', texte: 'Où la croix se place par rapport à ton doigt. Pose le doigt dans le cadre pour essayer.' }),
      curseur('Écart', 'decalage', 60, 260, 5, function (v) { return v + ' px'; }),
      curseur('Angle', 'angle', -80, 80, 5, function (v) { return v === 0 ? 'au-dessus' : Math.abs(v) + '° ' + (v < 0 ? 'à gauche' : 'à droite'); }),
      essai.toile,
      h('div', { class: 'aide' }, [
        h('h3', { texte: 'Comment jouer' }),
        h('p', { texte: 'La technique choisie sous le terrain décide du geste. Glisser (roulette, tir roulé, rafle) : la direction du geste vise, sa longueur donne la force. Au tir, on débloque dans l’ordre le tir roulé, la rafle (elle touche le sol tout près et file plus loin), le tir simple en l’air, le tir devant puis le tir au fer. Certains terrains rendent une technique très imprécise (« imprécise ici » dans la liste des techniques) : une autre technique, ou une boule faite pour ce terrain, ira mieux.' }),
        h('p', { texte: 'Maintenir (lancers en l’air) : pose le doigt, la croix apparaît à côté et le suit (son écart et son angle se règlent ci-dessus). Place-la où la boule doit tomber, puis lâche.' }),
        h('p', { texte: 'Aides de visée (dans Améliorer), propres à chaque discipline. Pointage : le Mètre du pointeur (à quelle distance du cochonnet ta boule s’arrêtera) et la Donnée marquée (où faire tomber ta boule en l’air). Tir : la Hauteur de passage (ta boule passe-t-elle au-dessus de la boule devant ?).' }),
        h('p', { texte: 'Effets gauche et droite : en roulant, la boule tourne de ce côté ; pendant la visée, une flèche montre de combien. Au tir au fer, l’effet agit au choc : ta boule file de son côté et la cible part un peu de l’autre.' }),
        h('p', { texte: 'Zone après le choc (tir) : un ovale dessiné à côté de la cible. Frappe la cible, et ta boule doit finir dedans : joue l’effet de ce côté ; le Carreau la garde près, et Diriger au fer (gagnée à son épreuve) la rend plus sûre. On la trouve en défi dans les niveaux, dans l’épreuve « Diriger au fer » et dans la Montagne du tir.' }),
        h('p', { texte: 'Annuler un lancer : pendant que tu vises, ramène le doigt dans le cercle de lancer, puis lâche.' }),
        h('p', { texte: 'Après 3 ratés d’affilée, un conseil te dit ce qui fait rater (force, direction, relief, vent, terrain…) et l’amélioration qui t’aiderait le plus.' }),
        h('p', { texte: 'Initiales : dans Boules, grave jusqu’à 3 lettres sur toutes tes boules.' }),
        h('p', { texte: 'Nouvelles techniques : gagne des niveaux avec la technique d’avant (maîtrise) et atteins le palier ' + MP.PALIER_SAISON + ' dans la saison, puis réussis son épreuve. La technique gagnée se joue dès la nouvelle saison (palier 1, compétences et améliorations à zéro). Chaque boule ne permet que certaines techniques (onglet Boules) : pour jouer une technique, il faut aussi une boule qui la permet.' }),
        h('p', { texte: 'Pendant le lancer, touche l’écran pour voir tout de suite le résultat. Touche encore pour le niveau suivant, tiré au hasard.' }),
        h('p', { texte: 'Pointage : finis plus près du cochonnet que la boule à battre (violette), dans la zone bleu pastel qui va jusqu’à elle, ou dans le cercle demandé. Biberon (au contact) : Points ×2.' }),
        h('p', { texte: 'Tir : frappe la boule à toucher (la seule violette, dorée sur un niveau doré) sans toucher les autres avant. Si ta boule reste dans la zone bleu pastel autour d’elle, c’est un carreau ; carreau, reprise du point et fourchette rapportent des bonus.' }),
        h('p', { texte: 'Chaque victoire remplit la barre de palier. Palier suivant : niveaux plus durs et +15 % de Points. Trois défaites de suite font redescendre d’un palier.' }),
        h('p', { texte: 'Série : ×1,15 dès 3 victoires de suite, ×1,3 dès 5, ×1,6 dès 8. Niveau doré : ×3.' }),
        h('p', { texte: 'Club : tes coéquipiers gagnent des Points tout seuls, même appli fermée (à mi-régime, 8 h au plus). Tes victoires leur donnent de l’élan.' }),
        h('p', { texte: 'Terrain : boue (freine), trous et racines (arrêtent une boule lente), pentes petites et grandes, dans tous les sens (descentes, montées, dévers), dos d’âne (une boule lente ne passe pas), cuvettes (des creux : la boule glisse vers le fond) et bosses (la boule en descend). Une pente part du ras du sol (le bas) et monte jusqu’à son sommet, plus clair, avec une ombre sur le côté qui s’amincit vers le bas : la boule descend vers le bas de la pente. Plus elle monte haut, plus elle est raide. Les formes ne se chevauchent jamais : chacune se lit seule.' }),
        h('p', { texte: 'Terrains durs, plus haut dans les paliers : gros gravier (tout ce qui roule dévie fort), bitume (ça roule loin et ça rebondit), terre glaise mouillée (une boule en l’air s’y plante) et terrain en pente (des pentes partout, surtout d’un côté, des petites pentes raides et des dos d’âne).' }),
        h('p', { texte: 'Mode libre : des niveaux mixtes où l’on pointe ou l’on tire selon la situation ; la technique se choisit parmi celles des deux disciplines, et les Points vont aux deux.' }),
        h('p', { texte: 'La Montagne (une au pointage, une au tir) : 10 étapes toujours les mêmes, chacune avec sa technique imposée, de plus en plus dures. 3 boules par étape, qui restent sur le terrain : une dans la zone (ou sur la cible) et tu montes ; les 3 ratées, tu redescends tout en bas. Au sommet, la boule d’élite de la discipline : toutes les techniques et tous tes Points ×2. Elle s’ouvre quand toutes les épreuves de la discipline sont réussies.' }),
        h('p', { texte: 'Couleurs : dans Boules, choisis la couleur de toutes tes boules (à acheter, ou à gagner dans la Montagne).' }),
        h('p', { texte: 'Parcours (pointage) : cinq lancers imposés, sans boule adverse, sur un terrain plein de relief. Finis dans le cercle avec la technique demandée ; raté, tu rejoues le même lancer (ta boule d’avant reste en gris) jusqu’à le réussir. Le cercle se resserre et le relief se corse de parcours en parcours.' }),
        h('p', { texte: 'Succès : chacun donne +3 % de Points pour toujours.' }),
        h('p', { texte: 'Au palier 10, tu peux commencer une nouvelle saison : tout repart à zéro sauf tes boules, tes succès et tes épreuves, et tu gagnes des trophées (+10 % de Points chacun).' }),
        h('p', { texte: 'Avec assez de trophées, monte de ligue (Régional, National, Mondial) : gains ×4 pour toujours, nouveaux terrains et boules ; saisons et trophées repartent à zéro.' }),
        h('p', { texte: 'Le pointage et le tir progressent chacun de leur côté, avec leurs propres Points.' })
      ]),
      h('button', { type: 'button', class: 'bouton secondaire', onclick: function (ev) {
        var b = ev.currentTarget;
        if (b.getAttribute('data-confirmer') !== 'oui') {
          b.setAttribute('data-confirmer', 'oui');
          b.textContent = 'Toucher encore pour tout effacer (définitif)';
          return;
        }
        MP.etat = MP.etatNeuf(); enregistrer(); voile.remove(); afficher('jouer'); toast('Nouvelle partie : tout est remis à zéro');
        graverAuDebut();
      }, texte: 'Recommencer à zéro' }),
      h('button', { type: 'button', class: 'bouton', onclick: function () { voile.remove(); }, texte: 'Fermer' })
    ]);
    voile.appendChild(fenetre);
    document.body.appendChild(voile);
    requestAnimationFrame(essai.dessiner);
  }

  function afficher(nouvelOnglet) {
    if (nouvelOnglet) onglet = nouvelOnglet;
    contenu = contenu || document.getElementById('contenu');
    var defilement = nouvelOnglet ? 0 : contenu.scrollTop;
    contenu.innerHTML = '';
    var ecran = onglet === 'boutique' ? ecranBoutique() : onglet === 'competences' ? ecranCompetences() : onglet === 'boules' ? ecranBoules()
      : onglet === 'succes' ? ecranSucces() : onglet === 'club' ? ecranClub() : ecranJouer();
    signature = signatureEcran();
    contenu.appendChild(ecran);
    contenu.scrollTop = defilement;
    document.querySelectorAll('.onglets button').forEach(function (b) {
      if (b.getAttribute('data-onglet') === onglet) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    majEntete();
  }

  // Chaque seconde (le club joue) : compteur à jour, et l'écran redessiné seulement si un
  // achat devient possible ou impossible (pour ne pas gêner les doigts).
  var signature = '';
  function signatureEcran() {
    var e = etat(), D = vue(), q = lot();
    if (onglet === 'club') return MP.CLUB.map(function (r) { return MP.devisLot(e, D, 'recrue', r.id, q).possible ? 1 : 0; }).join('');
    if (onglet === 'boutique') return MP.AMELIORATIONS[D].map(function (a) { return MP.devisLot(e, D, 'amelioration', a.id, q).possible ? 1 : 0; }).join('');
    if (onglet === 'competences') return MP.ARBRES[D].map(function (c) { return MP.etatCompetence(e, D, c.id).possible ? 1 : 0; }).join('');
    if (onglet === 'boules') return MP.boulesDe(D).concat(MP.COULEURS).map(function (b) {
      return (b.pour ? MP.etatBoule(e, D, b.id) : MP.etatCouleur(e, D, b.id)).possible ? 1 : 0;
    }).join('');
    return '';
  }
  function tic() {
    majEntete();
    if (onglet === 'club') majClub();
    if (signatureEcran() !== signature && !document.querySelector('.voile')) afficher();
  }

  return { afficher: afficher, majEntete: majEntete, toast: toast, reglages: reglages, annoncerSucces: annoncerSucces, effacerAnnonces: effacerAnnonces, tic: tic,
    absence: absence, graverAuDebut: graverAuDebut, onglet: function () { return onglet; } };
})();
