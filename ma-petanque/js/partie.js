// Ma Pétanque — écran de jeu en vue du dessus.
// La technique choisie décide du geste. Technique qui roule : on glisse (direction + force).
// Technique en l'air : on pose le doigt, la croix apparaît à côté (écart et angle choisis dans les
// Réglages : le doigt ne la cache jamais) et le suit ; on lâche pour lancer.
// Ramener le doigt dans le cercle de lancer annule le lancer.
// Pendant le lancer, un appui passe directement au résultat ; après le résultat, un appui
// tire un nouveau niveau au hasard.
'use strict';
var MP = window.MP || (window.MP = {});

MP.Partie = (function () {
  var h = MP.h;
  var jeu, toile, ctx, vue = new MP.Vue();
  var partie = null, mode = 'pointage', libre = false, bouleTest = null;
  // Mode libre (niveaux mixtes) : on peut pointer et tirer ; la technique choisie décide de la discipline
  // (ses aides, sa boule, ses compétences).
  var mixte = false, techMixte = 'roulette';
  var phase = 'repos';            // visee | lancer | resultat
  var doigt = null;               // geste en cours
  var visee = null;               // lancer prévu pendant le geste
  var poussiere = new MP.Poussiere(), flottants = [], petales = [], jetons = [];
  var dernierTemps = 0, reserve = 0, vuEvenements = 0, boucle = null, debutResultat = 0;
  var ratio = 1, zone = null, cadrageVise = null;
  var alea = new MP.Aleatoire(12345);
  var STABLE = 90;                // ms : au lâcher, on garde la position d'un instant avant
  var epreuve = null;             // épreuve en cours : { id, reussites, essais, finie }
  // Parcours de lancers imposés : la technique est imposée, et la boule de l'essai raté reste
  // dessinée en gris (où elle s'est arrêtée, et où elle est tombée) pour ajuster la visée.
  var parcours = false, fantome = null;
  // La Montagne : étapes fixes, technique imposée, 3 boules par étape qui restent sur le terrain.
  var montagne = false;
  // Échecs d'affilée (toutes parties confondues) et ce qui les a causés : au 3e, un conseil d'achat.
  var echecsSuite = 0, diagnostics = [];

  function d() { return MP.etat[mixte ? technique().mode : mode]; }
  function boule() { return mixte ? MP.bouleEquipee(d()) : partie.boule; }
  // Ce que demande le niveau : pointer (gagner le point) ou tirer (toucher la cible).
  function jeuMode() { return partie ? partie.mode : mode; }
  function butZ() { return (partie.cible || partie.cochonnet).z; }
  function epreuveDef() { return epreuve ? MP.trouver(MP.EPREUVES, epreuve.id) : null; }
  // Technique du prochain lancer : celle de l'épreuve, sinon celle choisie (si la boule la permet).
  function technique() {
    if (epreuve) return MP.trouver(MP.TECHNIQUES, epreuveDef().technique);
    if (parcours && partie && partie.niveau.parcours) return MP.trouver(MP.TECHNIQUES, partie.niveau.parcours.technique);
    if (montagne && partie && partie.niveau.montagne) return MP.trouver(MP.TECHNIQUES, partie.niveau.montagne.technique);
    if (mixte) {
      var tm = MP.trouver(MP.TECHNIQUES, techMixte);
      return MP.techniqueJouable(MP.etat[tm.mode], tm.id) ? tm : MP.trouver(MP.TECHNIQUES, 'roulette');
    }
    var b = partie ? partie.boule : MP.bouleEquipee(d());
    return MP.trouver(MP.TECHNIQUES, MP.techniqueJouable(d(), d().technique, b) ? d().technique : (mode === 'pointage' ? 'roulette' : 'tirSimple'));
  }

  // ---------- Démarrage et niveaux ----------

  function commencer(m, estLibre, bouleEssai, idEpreuve, estMixte, estParcours, estMontagne) {
    jeu = jeu || document.getElementById('jeu');
    toile = toile || document.getElementById('toile');
    ctx = ctx || toile.getContext('2d');
    MP.Son.debloquer();
    if (!MP.vitessesMax.roulette) MP.reglerVitesses();
    mode = m; libre = !!estLibre; bouleTest = bouleEssai || null; mixte = !!estMixte;
    parcours = !!estParcours; fantome = null; montagne = !!estMontagne;
    if (parcours) mode = 'pointage';
    epreuve = idEpreuve ? { id: idEpreuve, reussites: 0, essais: 0, finie: false, ratee: false } : null;
    jeu.hidden = false;
    jeu.setAttribute('data-vue', mode);
    nouveauNiveau(true);
    if (!boucle) { dernierTemps = performance.now(); boucle = requestAnimationFrame(image); }
    if (window.history && history.pushState) history.pushState({ jeu: true }, '');
  }

  function nouveauNiveau(immediat) {
    // Épreuve réussie : on reprend les niveaux normaux, avec la boule équipée.
    if (epreuve && epreuve.finie) { epreuve = null; if (!libre) bouleTest = null; }
    partie = MP.nouvellePartie(MP.etat, mode, libre, bouleTest, null, epreuve ? epreuve.id : null, mixte, parcours, montagne);
    phase = 'visee'; visee = null; doigt = null; aidesAvant = null; flottants = [];
    poussiere = new MP.Poussiere(); vuEvenements = 0; reserve = 0;
    ouvrirFeuille(null);
    document.getElementById('resultat').hidden = true;
    document.getElementById('commandes').hidden = false;
    var n = partie.niveau;
    var ep = epreuveDef();
    majTitre();
    jeu.querySelector('.hud').classList.toggle('dore', !!n.dore);
    jeu.querySelector('.hud').classList.toggle('epreuve', !!ep || parcours || montagne);
    document.getElementById('hud-defi').textContent = ep ? ep.regle
      : parcours ? technique().nom + ' imposée : finis à moins de ' + Math.round(n.parcours.rayon * 100) + ' cm'
      : montagne ? objectifMontagne()
      : (mixte ? 'Reprends le point : tire la boule qui gêne puis pointe, ou l’inverse.'
        : (n.defi ? 'Défi +' + n.defi.gain + ' : ' + n.defi.texte.charAt(0).toLowerCase() + n.defi.texte.slice(1) : ''));
    majPalier();
    // La distance du but en grand ; le terrain et son relief en une courte ligne, à côté du palier.
    document.getElementById('hud-distance').textContent = butZ().toFixed(1).replace('.', ',') + '\u00a0m';
    var rel = n.relief || [];
    document.getElementById('hud-sous-titre').textContent = partie.terrain.nom +
      (partie.monde.vent ? ' · vent ' + qualiteVent(partie.monde.vent.force) : '') +
      (partie.piste ? ' · piste ' + (partie.piste.niveaux + 1) + '/' + MP.NIVEAUX_PISTE : '') +
      (rel.length ? ' · ' + rel.slice(0, 3).join(', ').toLowerCase() + (rel.length > 3 ? '…' : '') : '');
    if (partie.pisteRefaite && d().lances > 0) MP.Ecrans.toast('Terrain refait : ' + partie.terrain.nom + ', pour ' + MP.NIVEAUX_PISTE + ' niveaux');
    majPoints();
    puces();
    consigne();
    redimensionner(immediat);
  }

  // Ce que demande l'étape de montagne, en une ligne.
  function objectifMontagne() {
    var mo = partie.niveau.montagne, t = technique(), imp = /^(Tir|Carreau)/.test(t.nom) ? ' imposé' : ' imposée';
    return t.nom + imp + (mo.mode === 'pointage' ? ' : finis à moins de ' + Math.round(mo.rayon * 100) + ' cm'
      : (mo.carreau ? ' : fais un carreau' : (mo.zone ? ', puis zone ' + (mo.zone.cote > 0 ? 'à droite' : 'à gauche') : ' : touche la boule violette')));
  }

  function majPoints() { document.getElementById('hud-points').textContent = MP.formatPoints(d().points); }
  function qualiteVent(f) { return f < 0.55 ? 'léger' : (f < 1.1 ? 'moyen' : 'fort'); }

  // Titre du bandeau ; avec plusieurs boules à lancer, laquelle on joue.
  function majTitre() {
    var n = partie.niveau, ep = epreuveDef(), total = n.boules || 1;
    document.getElementById('hud-titre').textContent = ep ? 'Épreuve · ' + MP.trouver(MP.ARBRES[mode], ep.id).nom
      : parcours ? 'Parcours n° ' + n.parcours.numero + ' · lancer ' + (n.parcours.lancer + 1) + '/' + MP.PARCOURS_LANCERS
      : montagne ? 'Montagne · ' + n.montagne.nom
      : (mixte ? 'Mode libre' : (mode === 'pointage' ? 'Pointage' : 'Tir')) + ' ' + '★'.repeat(n.etoiles) + (libre ? ' · essai' : '') +
        (total > 1 ? ' · boule ' + Math.min(total, partie.lances.length + 1) + '/' + total : '');
  }

  function majPalier() {
    var p = d(), ep = epreuveDef();
    // En mode libre, pas de palier : la barre laisse sa place au nom du terrain.
    document.getElementById('hud-xp').parentNode.style.display = mixte ? 'none' : '';
    if (montagne) {
      var M = d().montagne, nE = MP.MONTAGNES[mode].length;
      document.getElementById('hud-palier').textContent = 'Étape ' + (M.etape + 1) + '/' + nE +
        (phase === 'resultat' ? '' : ' · boule ' + (MP.MONTAGNE_BOULES - partie.boulesRestantes + 1) + '/' + MP.MONTAGNE_BOULES);
      document.getElementById('hud-xp').style.width = Math.round(100 * M.etape / nE) + '%';
      document.getElementById('hud-serie').hidden = true;
      return;
    }
    if (parcours) {
      var pc = partie.niveau.parcours;
      document.getElementById('hud-palier').textContent = pc.essais ? 'Essai ' + (pc.essais + 1) : '1er essai';
      document.getElementById('hud-xp').style.width = Math.round(100 * pc.lancer / MP.PARCOURS_LANCERS) + '%';
      document.getElementById('hud-serie').hidden = true;
      return;
    }
    if (mixte) {
      document.getElementById('hud-palier').textContent = 'Points : pointage + tir';
      document.getElementById('hud-xp').style.width = '0%';
      document.getElementById('hud-serie').hidden = true;
      return;
    }
    if (ep) {
      document.getElementById('hud-palier').textContent = 'Réussites ' + epreuve.reussites + '/' + ep.reussir + (ep.essais ? ' · essai ' + (epreuve.essais + 1) + '/' + ep.essais : '');
      document.getElementById('hud-xp').style.width = Math.round(100 * epreuve.reussites / ep.reussir) + '%';
      document.getElementById('hud-serie').hidden = true;
      return;
    }
    document.getElementById('hud-palier').textContent = 'Palier ' + p.palier;
    document.getElementById('hud-xp').style.width = Math.round(100 * p.xp / MP.xpPourPalier(p.palier)) + '%';
    var m = MP.multiplicateurSerie(p.serie), chip = document.getElementById('hud-serie');
    chip.hidden = m <= 1;
    chip.textContent = 'Série ' + p.serie + ' · ×' + String(m).replace('.', ',');
  }

  function consigne(texte) {
    var c = document.getElementById('consigne');
    if (texte) { c.textContent = texte; return; }
    var t = technique(), P = MP.PARAMS_TECH[t.id];
    if (MP.difficulteAvecBoule(partie.terrain.id, t.id, boule()) >= 1.5) {
      c.textContent = t.nom + ' : très imprécise sur ' + partie.terrain.nom.toLowerCase() + '. ' + (parcours || montagne || epreuve
        ? 'Elle est imposée : lis bien le sol et vise avec soin.' : 'Une autre technique ira mieux ici.');
      return;
    }
    if (t.famille === 'vol') {
      c.textContent = t.nom + ' : pose le doigt, la croix le suit à côté. Place-la où la boule doit tomber, lâche pour lancer.';
      return;
    }
    // Portée réelle sur ce terrain : le sable ou les cailloux freinent plus que le boulodrome.
    var essai = MP.simulerSeul(partie.terrain, MP.lancerAuGlisse(d(), boule(), { technique: t.id, effet: 'neutre' }, 0, 1, butZ(), null));
    var portee = (P.vol ? essai.chute.z : essai.arret.z / (P.marge || 1)).toFixed(1).replace('.', ',');
    c.textContent = t.nom + ' : glisse vers le but, la direction vise, la longueur donne la force. ' +
      (P.vol ? 'Chute au plus loin' : 'Portée ici') + '\u00a0: ' + portee + '\u00a0m.';
  }

  // Barre compacte sous le terrain : un bouton pour la technique, un pour l'effet ;
  // toucher l'un ouvre la liste au-dessus, choisir la referme.
  var feuilleOuverte = null;
  function puces() {
    var zoneT = document.getElementById('puces-techniques'), zoneE = document.getElementById('puces-effets');
    zoneT.innerHTML = ''; zoneE.innerHTML = '';
    var te = technique();
    var bT = document.getElementById('choix-technique'), bE = document.getElementById('choix-effet');
    bT.textContent = te.nom + (te.famille === 'roule' ? ' · glisser' : ' · maintenir');
    bT.disabled = !!epreuve || parcours || montagne;
    var effet = MP.trouver(MP.EFFETS, d().effet);
    bE.textContent = d().effet === 'neutre' ? 'Sans effet' : 'Effet ' + effet.nom.toLowerCase();
    bT.onclick = function () { ouvrirFeuille(feuilleOuverte === 'technique' ? null : 'technique'); };
    bE.onclick = function () { ouvrirFeuille(feuilleOuverte === 'effet' ? null : 'effet'); };
    if (!epreuve && mixte) {
      ['pointage', 'tir'].forEach(function (m) {
        ['roule', 'vol'].forEach(function (f) {
          zoneT.appendChild(h('span', { class: 'puce-titre', texte: (m === 'pointage' ? 'Pointer' : 'Tirer') + ' · ' + (f === 'roule' ? 'glisser' : 'maintenir') }));
          MP.TECHNIQUES.filter(function (t) { return t.mode === m && t.famille === f; }).forEach(function (t) { zoneT.appendChild(puceTechnique(t)); });
        });
      });
    } else if (!epreuve && !parcours && !montagne) {
      var roule = MP.TECHNIQUES.filter(function (t) { return t.mode === mode && t.famille === 'roule'; });
      // En l'air, dans l'ordre où on les débloque (le tir simple d'abord).
      var ordre = ['demiPortee', 'portee', 'plombee', 'tirLeve', 'tirDevant', 'tirAuFer'];
      var vol = MP.TECHNIQUES.filter(function (t) { return t.mode === mode && t.famille === 'vol'; })
        .sort(function (a, b) { return ordre.indexOf(a.id) - ordre.indexOf(b.id); });
      zoneT.appendChild(h('span', { class: 'puce-titre', texte: 'Glisser' }));
      roule.forEach(function (t) { zoneT.appendChild(puceTechnique(t)); });
      zoneT.appendChild(h('span', { class: 'puce-titre', texte: 'Maintenir' }));
      vol.forEach(function (t) { zoneT.appendChild(puceTechnique(t)); });
    }
    MP.EFFETS.forEach(function (e) {
      var ok = MP.effetDisponible(d(), e.id);
      zoneE.appendChild(h('button', { type: 'button', class: 'puce', 'aria-pressed': d().effet === e.id ? 'true' : 'false', disabled: !ok,
        title: ok ? e.nom : 'À apprendre dans les compétences',
        onclick: function () { d().effet = e.id; MP.sauver(MP.etat); ouvrirFeuille(null); puces(); } },
        [ok ? null : cadenas(), e.id === 'neutre' ? 'Sans effet' : 'Effet ' + e.nom.toLowerCase()]));
    });
  }

  function ouvrirFeuille(quoi) {
    feuilleOuverte = quoi;
    var f = document.getElementById('feuille');
    f.hidden = !quoi;
    document.getElementById('puces-techniques').hidden = quoi !== 'technique';
    document.getElementById('puces-effets').hidden = quoi !== 'effet';
    document.getElementById('choix-technique').setAttribute('aria-expanded', quoi === 'technique' ? 'true' : 'false');
    document.getElementById('choix-effet').setAttribute('aria-expanded', quoi === 'effet' ? 'true' : 'false');
  }

  function puceTechnique(t) {
    var dt = MP.etat[t.mode], bt = mixte ? MP.bouleEquipee(dt) : boule();
    var appris = MP.techniqueDisponible(dt, t.id), ok = appris && MP.boulePermet(bt, t.id);
    var choisie = technique().id === t.id && ok;
    var dur = MP.difficulteAvecBoule(partie.terrain.id, t.id, bt) >= 1.5;
    return h('button', { type: 'button', class: 'puce' + (dur ? ' dur' : ''), 'aria-pressed': choisie ? 'true' : 'false', disabled: !ok,
      title: ok ? t.nom + (dur ? ' : très imprécise sur ce terrain' : '') : (appris ? 'Ta boule ne permet pas cette technique'
        : (dt.techniqueAttente === t.id ? 'Gagnée : jouable à la nouvelle saison' : 'À débloquer : maîtrise, palier ' + MP.PALIER_SAISON + ' puis épreuve')),
      onclick: function () { if (mixte) techMixte = t.id; else { d().technique = t.id; MP.sauver(MP.etat); } ouvrirFeuille(null); puces(); consigne(); majPoints(); } },
      [ok ? null : cadenas(), t.nom, appris && !ok ? h('small', { class: 'boule-manque', texte: 'autre boule' }) : null, dur && ok ? h('small', { texte: 'imprécise ici' }) : null]);
  }

  function cadenas() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.innerHTML = '<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>';
    return s;
  }

  // ---------- Cadrage ----------

  // Zone de l'écran que ne cachent ni la barre du haut ni les commandes.
  function mesurerZone() {
    var L = window.innerWidth, H = window.innerHeight;
    var hud = jeu.querySelector('.hud').getBoundingClientRect();
    var com = document.getElementById('commandes');
    var r = com.getBoundingClientRect();
    // Rien d'important sous le texte du bandeau : le terrain commence juste en dessous.
    var haut = hud.bottom + 2;
    var z = { x: 8, y: haut, l: L - 16, h: H - haut - 8 };
    if (!com.hidden && r.width > 0) {
      var choix = com.querySelector('.choix').getBoundingClientRect();
      // La barre compacte prend le bas de l'écran (en paysage, le coin en bas à droite) : rien ne passe dessous.
      z.h = choix.top - 6 - haut;
    }
    z.h = Math.max(120, z.h);
    return z;
  }

  // Tout le lancer, et seulement lui : du cercle jusqu'un peu après le jeu. La vue reste centrée sur
  // ton cercle (le milieu du terrain) et s'élargit autant qu'il faut des deux côtés pour montrer le
  // cochonnet et les boules. Plus le lancer est court, plus tout est gros.
  function cadrageEnsemble() {
    var c = partie.cochonnet, demi = 0.7, zMax = c.z + 0.6;
    partie.monde.corps.forEach(function (o) { demi = Math.max(demi, Math.abs(o.x) + 0.45); zMax = Math.max(zMax, o.z + 0.35); });
    demi = Math.min(2.15, demi);
    // En paysage, un peu de place derrière le cercle pour la jauge de force.
    return vue.cadrage(zone, -demi, demi, vue.paysage ? -0.65 : -0.38, Math.min(15.2, zMax));
  }

  // Gros plan sur le jeu : le cochonnet, la boule du joueur et les boules proches.
  function cadrageJeu(inclureBoule) {
    var c = partie.cochonnet, x1 = c.x - 0.55, x2 = c.x + 0.55, z1 = c.z - 0.55, z2 = c.z + 0.55;
    var importants = partie.monde.corps.filter(function (o) {
      return o !== c && Math.hypot(o.x - c.x, o.z - c.z) < 1.3 && !(o === partie.joueur && !inclureBoule);
    });
    if (partie.joueur && inclureBoule) importants.push(partie.joueur);
    if (partie.cible) importants.push({ x: partie.cible.depart.x, z: partie.cible.depart.z });
    importants.forEach(function (o) {
      x1 = Math.min(x1, o.x - 0.25); x2 = Math.max(x2, o.x + 0.25); z1 = Math.min(z1, o.z - 0.25); z2 = Math.max(z2, o.z + 0.25);
    });
    return vue.cadrage(zone, Math.max(-2.2, x1), Math.min(2.2, x2), z1, z2, zoomMax());
  }

  // Zoom maximal : la texture fine (512 pixels par mètre) n'est jamais trop agrandie.
  function zoomMax() { return Math.min(300, 620 / ratio); }

  function redimensionner(immediat) {
    if (!partie) return;
    ratio = Math.min(window.devicePixelRatio || 1, 2.5);
    var L = window.innerWidth, H = window.innerHeight;
    toile.width = Math.round(L * ratio); toile.height = Math.round(H * ratio);
    vue.paysage = L > H * 1.05;
    zone = mesurerZone();
    cadrageVise = phase === 'resultat' ? cadrageJeu(true) : cadrageEnsemble();
    if (immediat !== false) vue.regler(zone, cadrageVise);
    partie.loupeFond = null;
  }

  // ---------- Gestes ----------

  function longueurReference() { return Math.max(130, Math.min(380, Math.min(window.innerWidth, window.innerHeight) * 0.45)); }

  // Décalage de la croix par rapport au doigt (Réglages : écart et angle), pour que le doigt ne la
  // cache jamais.
  function decalageCroix() { return MP.decalageCroix(MP.etat.reglages); }
  // Le doigt revenu dans le cercle de lancer (après en être sorti) : le lancer est annulé au lâcher.
  function dansCercle(x, y) {
    var c = vue.ecran(0, 0);
    return Math.hypot(x - c.x, y - c.y) < Math.max(46, MP.MESURES.cercle * vue.s * 1.8);
  }

  function majVisee() {
    if (!doigt || !doigt.geste) { visee = null; return; }
    var dedans = dansCercle(doigt.x, doigt.y);
    if (!dedans) doigt.sorti = true;
    doigt.annule = doigt.sorti && dedans;
    if (doigt.annule) { visee = null; return; }
    var choixT = { technique: technique().id, effet: d().effet, terrain: partie.terrain.id };
    if (doigt.geste === 'glisse') {
      var w = vue.versMonde(doigt.x - doigt.x0, doigt.y - doigt.y0);
      var longueur = Math.hypot(doigt.x - doigt.x0, doigt.y - doigt.y0);
      if (longueur < 10 || w.z <= 0.05) { visee = null; return; }
      var direction = Math.atan2(w.x, w.z), puissance = Math.min(1, longueur / longueurReference());
      var l = MP.lancerAuGlisse(d(), boule(), choixT, direction, puissance, butZ(), null);
      visee = { genre: 'glisse', choix: choixT, direction: direction, puissance: puissance, lancer: l, apercu: MP.simulerSeul(partie.terrain, l, true, partie.relief, partie.taille) };
      aidesVisee(visee);
    } else {
      // La croix suit le doigt, décalée pour qu'il ne la cache pas ; elle tremble un peu.
      var dc = decalageCroix();
      var p = vue.monde(doigt.x + dc.x, doigt.y + dc.y), tr = tremblement(Math.hypot(p.x, p.z - 0.3));
      p.x += tr.x; p.z += tr.z;
      var lv = MP.lancerEnLAir(d(), boule(), choixT, p.x, p.z, null, partie.taille);
      visee = { genre: 'vol', choix: choixT, point: lv.vise, lancer: lv, apercu: MP.simulerSeul(partie.terrain, lv, true, partie.relief, partie.taille) };
      aidesVisee(visee);
    }
  }

  // Aides de visée propres à la discipline (achetées à la boutique) et effet prévu. Elles demandent
  // plusieurs prévisions (et en l'air, la croix tremble sans cesse) : au plus dix fois par seconde.
  var aidesAvant = null, donneeCache = {};
  function aidesVisee(g) {
    var t = performance.now();
    if (aidesAvant && aidesAvant.genre === g.genre && t - aidesAvant.t < 100) { g.aides = aidesAvant.aides; return; }
    var A = {}, D = d(), but = partie.cible || partie.cochonnet;
    A.effet = MP.effetPrevu(partie, g.lancer, but.z, g.apercu);
    if (technique().mode === 'pointage') {
      var nD = MP.niveauAm(D, 'donnee');
      if (nD && g.genre === 'vol') {
        var c = partie.cochonnet, cle = [partie.graine, g.choix.technique, g.choix.effet, nD, MP.niveau(D, 'lectureSol'), c.x.toFixed(3), c.z.toFixed(3)].join('/');
        A.donnee = donneeCache[cle] || (donneeCache[cle] = MP.donneeMarquee(partie, D, boule(), g.choix, nD));
      }
    } else if (partie.cible) {
      var nP = MP.niveauAm(D, 'passage');
      if (nP && g.genre === 'vol') A.passages = { n: nP, liste: MP.hauteursPassage(partie, g.lancer) };
    }
    g.aides = A;
    aidesAvant = { t: t, genre: g.genre, aides: A };
  }

  // La croix tremble comme une main : plus de loin, plus au tir qu'au pointage, moins avec la Main stable.
  // On lâche au bon moment.
  function tremblement(dist) {
    var A = (0.035 + 0.012 * dist) / (1 + MP.niveau(d(), 'stabilite') / 8) * (technique().mode === 'tir' ? 1 : 0.6);
    var t = performance.now() / 1000;
    return { x: A * (0.6 * Math.sin(t * 1.3 + 0.4) + 0.4 * Math.sin(t * 2.9 + 1.7)),
      z: A * (0.6 * Math.sin(t * 1.1 + 2.2) + 0.4 * Math.sin(t * 2.3 + 0.9)) };
  }

  function lancer() {
    var g = visee;
    if (!g) return;
    if (g.genre === 'glisse' && g.puissance < 0.04) return;
    var l = g.genre === 'glisse'
      ? MP.lancerAuGlisse(d(), boule(), g.choix, g.direction, g.puissance, butZ(), partie.alea)
      : MP.lancerEnLAir(d(), boule(), g.choix, g.point.x, g.point.z, partie.alea, partie.taille);
    if (mixte) { partie.boule = boule(); partie.d = d(); }
    MP.lancerBoule(partie, l);
    dernieresForces[jeuMode() + '/' + g.choix.technique] = g.genre === 'glisse' ? g.puissance : forceEnLAir();
    MP.Son.lancer(g.genre === 'glisse' ? g.puissance : forceEnLAir());
    phase = 'lancer'; visee = null; aidesAvant = null;
    document.getElementById('commandes').hidden = true;
    consigne();
    MP.Son.toucher();
  }

  function finirTout() {
    var n = 0;
    while (partie.monde.enMouvement() && n++ < 240 * 30) partie.monde.etape(MP.PAS);
    vuEvenements = partie.monde.evenements.length;
    poussiere = new MP.Poussiere();
  }

  // ---------- Résultat ----------

  function terminer() {
    phase = 'resultat';
    debutResultat = performance.now();
    var res = MP.evaluer(partie);
    if (epreuve) return terminerEpreuve(res);
    if (parcours) return terminerParcours(res);
    if (montagne) return terminerMontagne(res);
    // Plusieurs boules : on continue tant qu'il en reste et que le niveau n'est ni gagné ni perdu.
    if (!libre || partie.niveau.boules > 1) {
      var encore = jeuMode() === 'pointage' ? !res.gagne : (res.gagne && res.ciblesRestantes > 0);
      if (encore && partie.boulesRestantes > 0) return pause(res);
      if (jeuMode() === 'tir' && res.gagne && res.ciblesRestantes > 0) { res.gagne = false; res.raison = 'Il reste une cible à toucher, et plus de boule.'; }
      else if (jeuMode() === 'tir' && res.gagne && partie.cibles.length > 1) res.raison = 'Les ' + partie.cibles.length + ' cibles sont touchées !';
    }
    // Chaque chute de tes boules creuse un peu la piste.
    var ids = partie.lances.map(function (o) { return o.id; });
    if (partie.piste && partie.joueur) MP.userPiste(partie.piste, partie.monde.marques.filter(function (m) { return ids.indexOf(m.corps) >= 0; }));
    var gain = mixte ? MP.enregistrerMixte(MP.etat, res) : MP.enregistrerResultat(MP.etat, res);
    if (!libre) noterLancer(res.gagne, res);
    if (mixte) gain.lignes = res.gagne ? [{ libelle: 'Pointage', valeur: '+' + MP.formatPoints(gain.parts.pointage) }, { libelle: 'Tir', valeur: '+' + MP.formatPoints(gain.parts.tir) }] : [];
    MP.Ecrans.annoncerSucces(MP.verifierSucces(MP.etat, mode));
    MP.sauver(MP.etat);
    partie.resultat = res;
    MP.Ecrans.majEntete();
    majPalier();
    if (res.gagne) MP.Son.victoire(); else MP.Son.defaite();
    if (res.gagne && !libre) {
      // Les Points s'envolent vers le compteur, des pétales tombent.
      var depart = partie.joueur ? vue.ecran(partie.joueur.x, partie.joueur.z) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      var bourse = document.getElementById('hud-bourse').getBoundingClientRect();
      var n = Math.min(14, 3 + Math.floor(gain.total / 4));
      for (var i = 0; i < n; i++) jetons.push({ x0: depart.x, y0: depart.y, x1: bourse.left + bourse.width / 2, y1: bourse.top + bourse.height / 2,
        t: -i * 0.06, dx: (alea.suivant() - 0.5) * 120, dy: -40 - alea.suivant() * 80 });
      // Feuilles seulement pour les beaux coups (le palier et les épreuves ont les leurs).
      if (res.biberon || res.carreau || partie.niveau.dore) lancerPetales(30);
      if (partie.joueur) flottants.push({ texte: '+' + MP.formatPoints(gain.total), x: partie.joueur.x, z: partie.joueur.z, vie: 0 });
    } else {
      majPoints();
    }
    if (gain.palier && gain.palier.apres > gain.palier.avant) feter(gain.palier.apres);
    cadrageVise = cadrageJeu(true);
    var carte = document.getElementById('resultat');
    carte.className = 'resultat ' + (res.gagne ? 'gagne' : 'perdu');
    carte.innerHTML = '';
    var titre = res.gagne ? (res.biberon ? 'Biberon !' : (res.carreau ? 'Carreau !' : (partie.niveau.dore ? 'Doré !' : 'Gagné !'))) : 'Perdu';
    carte.appendChild(h('div', { class: 'ligne espace' }, [
      h('h2', { texte: titre }),
      res.gagne && !libre ? h('b', { class: 'gain-total', texte: '+' + MP.formatPoints(gain.total) + ' pts' }) : null
    ]));
    carte.appendChild(h('p', { class: 'discret', style: 'margin:0', texte: res.raison + ecarts(res) }));
    if (gain.lignes.length) {
      carte.appendChild(h('div', { class: 'gains-ligne' }, gain.lignes.map(function (l) {
        return h('span', { class: l.multiplicateur ? 'mult' : null, texte: l.libelle + ' ' + l.valeur });
      })));
    }
    if (res.defi && res.gagne) {
      carte.appendChild(h('p', { class: 'defi-info' + (res.defi.reussi ? ' reussi' : ''), style: 'margin:0',
        texte: (res.defi.reussi ? 'Défi réussi : ' : 'Défi manqué : ') + res.defi.texte.charAt(0).toLowerCase() + res.defi.texte.slice(1) + (res.defi.reussi ? ' (+' + res.defi.gain + ')' : '') }));
    }
    if (gain.palier && gain.palier.apres > gain.palier.avant) {
      carte.appendChild(h('p', { class: 'palier-info monte', style: 'margin:0', texte: 'Palier ' + gain.palier.apres + ' atteint : niveaux plus durs, +15 % de Points.' }));
    } else if (gain.palier && gain.palier.apres < gain.palier.avant) {
      carte.appendChild(h('p', { class: 'palier-info baisse', style: 'margin:0', texte: 'Trois défaites de suite : retour au palier ' + gain.palier.apres + '.' }));
    } else if (!res.gagne && !libre && d().defaitesSuite === 2 && d().palier > 1) {
      carte.appendChild(h('p', { class: 'palier-info baisse', style: 'margin:0', texte: 'Attention : encore une défaite et tu redescends d’un palier.' }));
    }
    if (!libre) {
      // Prochaine étape (épreuve, boule, maîtrise…) ; sinon le prochain achat avec sa barre.
      var etape = MP.prochaineEtape(MP.etat, mode);
      if (!etape.achat) carte.appendChild(h('p', { class: 'etape-info', style: 'margin:0', texte: 'Prochaine étape : ' + etape.texte }));
      var achat = MP.prochainAchat(MP.etat, mode);
      if (achat) carte.appendChild(h('div', { class: 'prochain' }, [
        h('span', { texte: achat.manque ? 'Prochain achat : ' + achat.nom + ', encore ' + MP.formatPoints(achat.manque) + ' pts' : 'Tu peux acheter ' + achat.nom + ' !' }),
        h('span', { class: 'barre-palier' }, [h('i', { style: 'width:' + Math.round(100 * Math.min(1, d().points / achat.prix)) + '%' })])
      ]));
    }
    if (gain.epreuve) {
      carte.appendChild(h('p', { class: 'palier-info monte', style: 'margin:0',
        texte: 'Épreuve ouverte : ' + MP.trouver(MP.ARBRES[mode], gain.epreuve.id).nom + ' ! Relève-la depuis l’écran Jouer.' }));
    }
    if (libre) carte.appendChild(h('p', { class: 'discret', style: 'margin:0', texte: 'Essai : pas de Points.' }));
    ajouterConseil(carte);
    carte.appendChild(h('p', { class: 'suite', texte: 'Touche l’écran pour le niveau suivant' }));
    carte.hidden = false;
  }

  // Entre deux boules d'un même niveau : on revient à la visée, sans rien remettre en place.
  function pause(res, message) {
    phase = 'visee'; visee = null; doigt = null; aidesAvant = null;
    vuEvenements = partie.monde.evenements.length;
    if (jeuMode() === 'tir') partie.cible = partie.cibles.filter(function (x) { return !x.touchee; })[0] || partie.cible;
    document.getElementById('commandes').hidden = false;
    majTitre();
    var reste = partie.boulesRestantes, s = reste > 1 ? 's' : '';
    MP.Ecrans.toast(message ? message + ' Encore ' + reste + ' boule' + s + '.'
      : jeuMode() === 'tir' ? 'Cible touchée ! Encore ' + reste + ' boule' + s + ' pour la suivante.'
      : 'Pas encore le point : encore ' + reste + ' boule' + s + '.');
    cadrageVise = cadrageEnsemble();
    consigne();
  }

  // Épreuve : pas de Points ni de palier ; il faut enchaîner les réussites.
  function terminerEpreuve(res) {
    var ep = epreuveDef(), nom = MP.trouver(MP.ARBRES[mode], ep.id).nom;
    var reussi = MP.coupEpreuve(partie, res);
    noterLancer(reussi, res);
    MP.avancerEpreuve(epreuve, reussi);
    partie.resultat = res;
    if (epreuve.finie) {
      MP.validerEpreuve(MP.etat, mode, ep.id);
      MP.Ecrans.annoncerSucces(MP.verifierSucces(MP.etat, mode));
      MP.sauver(MP.etat);
      MP.Ecrans.majEntete();
      feter(null, nom + ' débloquée !', MP.trouver(MP.TECHNIQUES, ep.id) ? 'Commence une nouvelle saison pour la jouer' : 'Améliore-la dans les compétences');
    } else if (reussi) MP.Son.victoire(); else MP.Son.defaite();
    majPalier();
    cadrageVise = cadrageJeu(true);
    var carte = document.getElementById('resultat');
    carte.className = 'resultat ' + (reussi ? 'gagne' : 'perdu');
    carte.innerHTML = '';
    carte.appendChild(h('div', { class: 'ligne espace' }, [
      h('h2', { texte: epreuve.finie ? 'Épreuve réussie !' : (reussi ? 'Réussi !' : 'Raté') }),
      h('b', { class: 'gain-total', texte: epreuve.reussites + '/' + ep.reussir })
    ]));
    var pourquoi = res.gagne ? (reussi ? 'C’est ce qu’il fallait.' : 'Objectif atteint, mais pas assez précis pour l’épreuve.') : res.raison;
    if (res.gagne && partie.technique !== ep.technique) pourquoi = 'Il faut lancer en ' + technique().nom.toLowerCase() + '.';
    carte.appendChild(h('p', { class: 'discret', style: 'margin:0', texte: pourquoi + ecarts(res) }));
    carte.appendChild(h('p', { class: 'defi-info' + (reussi ? ' reussi' : ''), style: 'margin:0', texte: ep.regle }));
    if (epreuve.finie) {
      carte.appendChild(h('p', { class: 'palier-info monte', style: 'margin:0', texte: nom + ' est à toi : choisis-la sous le terrain.' }));
    } else if (epreuve.ratee) {
      carte.appendChild(h('p', { class: 'palier-info baisse', style: 'margin:0', texte: 'La série repart de zéro. Tu peux réessayer autant que tu veux.' }));
    }
    ajouterConseil(carte);
    carte.appendChild(h('p', { class: 'suite', texte: epreuve.finie ? 'Touche l’écran pour reprendre le jeu' : 'Touche l’écran pour le lancer suivant' }));
    carte.hidden = false;
  }

  // Parcours : réussi, on passe au lancer suivant ; raté, on rejoue le même, la boule d'avant en gris.
  function terminerParcours(res) {
    var pc = partie.niveau.parcours, b = partie.joueur;
    var gain = MP.enregistrerParcours(MP.etat, res);
    noterLancer(gain.reussi, res);
    fantome = gain.reussi || !b ? null : { x: b.x, z: b.z, r: b.r, chute: technique().famille === 'vol' && b.premiereChute ? { x: b.premiereChute.x, z: b.premiereChute.z } : null };
    MP.Ecrans.annoncerSucces(MP.verifierSucces(MP.etat, mode));
    MP.sauver(MP.etat);
    partie.resultat = res;
    MP.Ecrans.majEntete();
    if (gain.reussi) {
      MP.Son.victoire();
      if (b) flottants.push({ texte: '+' + MP.formatPoints(gain.total), x: b.x, z: b.z, vie: 0 });
      if (gain.fini) feter(null, 'Parcours n° ' + gain.numero + ' terminé !', '+' + MP.formatPoints(gain.total) + ' pts');
      else if (res.biberon) lancerPetales(30);
    } else MP.Son.defaite();
    majPoints();
    cadrageVise = cadrageJeu(true);
    var carte = document.getElementById('resultat');
    carte.className = 'resultat ' + (gain.reussi ? 'gagne' : 'perdu');
    carte.innerHTML = '';
    carte.appendChild(h('div', { class: 'ligne espace' }, [
      h('h2', { texte: gain.reussi ? (gain.fini ? 'Parcours terminé !' : (res.biberon ? 'Biberon !' : 'Réussi !')) : 'Raté' }),
      gain.reussi ? h('b', { class: 'gain-total', texte: '+' + MP.formatPoints(gain.total) + ' pts' }) : null
    ]));
    carte.appendChild(h('p', { class: 'discret', style: 'margin:0', texte: res.raison + ecarts(res) }));
    if (gain.lignes.length) {
      carte.appendChild(h('div', { class: 'gains-ligne' }, gain.lignes.map(function (l) {
        return h('span', { class: l.multiplicateur ? 'mult' : null, texte: l.libelle + ' ' + l.valeur });
      })));
    }
    if (gain.reussi) {
      carte.appendChild(h('p', { class: 'defi-info reussi', style: 'margin:0', texte: gain.essais > 1 ? 'Réussi en ' + gain.essais + ' essais.' : 'Réussi du premier coup !' }));
    } else {
      carte.appendChild(h('p', { class: 'defi-info', style: 'margin:0',
        texte: technique().nom + ' imposée, à moins de ' + Math.round(pc.rayon * 100) + ' cm. Rejoue le même lancer : ta boule d’avant reste en gris pour ajuster ta visée.' }));
      // Un lancer qui résiste vraiment : on peut en tirer un autre (jamais bloqué).
      if (MP.etat.pointage.parcours.essais >= MP.ESSAIS_CHANGER_LANCER) {
        carte.appendChild(h('button', { type: 'button', class: 'bouton secondaire', onclick: function (ev) {
          ev.stopPropagation();
          MP.changerLancerParcours(MP.etat); MP.sauver(MP.etat); fantome = null; nouveauNiveau(false);
        } }, ['Tirer un autre lancer']));
      }
    }
    ajouterConseil(carte);
    carte.appendChild(h('p', { class: 'suite', texte: gain.reussi ? (gain.fini ? 'Touche l’écran pour le parcours suivant' : 'Touche l’écran pour le lancer suivant') : 'Touche l’écran pour réessayer' }));
    carte.hidden = false;
  }

  // Montagne : une boule réussie et tu montes ; ratée, la suivante ; les 3 ratées, retour en bas.
  function terminerMontagne(res) {
    var mo = partie.niveau.montagne, nE = MP.MONTAGNES[mode].length, b = partie.joueur;
    var g = MP.enregistrerMontagne(MP.etat, mode, res);
    noterLancer(g.reussi, res);
    MP.Ecrans.annoncerSucces(MP.verifierSucces(MP.etat, mode));
    MP.sauver(MP.etat);
    MP.Ecrans.majEntete();
    majPalier();
    if (!g.reussi && !g.chute) { MP.Son.defaite(); majPoints(); return pause(res, res.raison); }
    partie.resultat = res;
    if (g.reussi) {
      MP.Son.victoire();
      if (b) flottants.push({ texte: '+' + MP.formatPoints(g.total), x: b.x, z: b.z, vie: 0 });
      if (g.sommet) { feter(null, 'Sommet !', 'La Montagne est à toi'); lancerPetales(40); }
      else if (res.biberon || res.carreau) lancerPetales(30);
    } else MP.Son.defaite();
    majPoints();
    cadrageVise = cadrageJeu(true);
    var carte = document.getElementById('resultat');
    carte.className = 'resultat ' + (g.reussi ? 'gagne' : 'perdu');
    carte.innerHTML = '';
    carte.appendChild(h('div', { class: 'ligne espace' }, [
      h('h2', { texte: g.sommet ? 'Sommet !' : (g.reussi ? 'Étape réussie !' : 'Chute !') }),
      g.reussi ? h('b', { class: 'gain-total', texte: '+' + MP.formatPoints(g.total) + ' pts' }) : null
    ]));
    carte.appendChild(h('p', { class: 'discret', style: 'margin:0', texte: res.raison + ecarts(res) }));
    if (g.lignes.length) {
      carte.appendChild(h('div', { class: 'gains-ligne' }, g.lignes.map(function (l) {
        return h('span', { class: l.multiplicateur ? 'mult' : null, texte: l.libelle + ' ' + l.valeur });
      })));
    }
    var M = d().montagne, suivante = MP.MONTAGNES[mode][M.etape];
    if (g.reussi && !g.sommet) {
      carte.appendChild(h('p', { class: 'defi-info reussi', style: 'margin:0', texte: 'Tu montes : étape ' + (M.etape + 1) + '/' + nE + ', ' + suivante.nom.toLowerCase() + '.' }));
    } else if (g.chute) {
      carte.appendChild(h('p', { class: 'palier-info baisse', style: 'margin:0', texte: 'Tes ' + MP.MONTAGNE_BOULES + ' boules ont raté ' + mo.nom.toLowerCase() + ' : retour au pied de la montagne. Plus haute étape : ' + M.record + '/' + nE + '.' }));
    }
    g.cadeaux.forEach(function (c) {
      var texte = c.boule ? 'Nouvelle boule : ' + MP.trouver(MP.BOULES, c.boule).nom + ' (toutes les techniques, Points ×2). Équipe-la dans Boules !'
        : 'Nouvelle couleur de boule : ' + MP.trouver(MP.COULEURS, c.couleur).nom + ' (dans Boules).';
      carte.appendChild(h('p', { class: 'palier-info monte', style: 'margin:0', texte: texte }));
    });
    ajouterConseil(carte);
    carte.appendChild(h('p', { class: 'suite', texte: g.sommet ? 'Touche l’écran pour repartir du pied' : (g.reussi ? 'Touche l’écran pour l’étape suivante' : 'Touche l’écran pour recommencer l’ascension') }));
    carte.hidden = false;
  }

  // ---------- Conseil après plusieurs échecs ----------

  // Pourquoi la dernière boule a raté : force, direction, portée, relief, vent, terrain (pointage) ;
  // au tir aussi : cible à peine bougée, autre boule touchée d'abord, carreau manqué.
  function diagnostic(res) {
    var b = partie.joueur, t = technique();
    if (!b) return null;
    if (MP.difficulteAvecBoule(partie.terrain.id, t.id, boule()) >= 1.5) return 'terrain';
    var vent = partie.monde.vent && t.famille === 'vol';
    if (t.mode === 'pointage') {
      var c = partie.cochonnet, ux = c.x, uz = c.z - 0.3, n = Math.hypot(ux, uz) || 1;
      ux /= n; uz /= n;
      var dx = b.x - c.x, dz = b.z - c.z, long = dx * ux + dz * uz, lat = Math.abs(dx * uz - dz * ux);
      if (long < -0.4 && MP.porteeTerrain(d(), boule(), t.id, partie.terrain) < c.z) return 'portee';
      if (lat > Math.abs(long)) return vent ? 'vent' : (partie.relief && MP.niveau(d(), 'lectureSol') < 10 ? 'relief' : 'direction');
      return 'force';
    }
    var cible = partie.cible, premier = b.contacts.length ? b.contacts[0] : null;
    if (!cible) return null;
    if (premier === cible.id) return res.montagne && partie.niveau.montagne && partie.niveau.montagne.carreau ? 'carreau' : 'frappe';
    if (premier !== null) return 'devant';
    if ((b.survole && b.survole.indexOf(cible.id) >= 0) || b.z < cible.depart.z - 0.3) return 'force';
    return vent ? 'vent' : 'direction';
  }
  function noterLancer(reussi, res) {
    if (reussi) { echecsSuite = 0; diagnostics = []; return; }
    echecsSuite += 1;
    var g = diagnostic(res);
    if (g) diagnostics.push(g);
    if (diagnostics.length > 3) diagnostics.shift();
  }
  // Au 3e échec d'affilée (puis tous les 3) : la cause la plus fréquente et l'achat qui aide le plus.
  function ajouterConseil(carte) {
    if (echecsSuite < 3 || echecsSuite % 3 || !diagnostics.length) return;
    var compte = {}, genre = diagnostics[diagnostics.length - 1];
    diagnostics.forEach(function (x) { compte[x] = (compte[x] || 0) + 1; if (compte[x] > compte[genre]) genre = x; });
    var t = technique(), c = MP.conseilAmelioration(MP.etat, t.mode, genre, t.id);
    if (!c) return;
    carte.appendChild(h('div', { class: 'conseil' }, [
      h('p', { texte: echecsSuite + ' ratés d’affilée. ' + c.texte }),
      c.ecran ? h('button', { type: 'button', class: 'bouton secondaire', onclick: function (ev) {
        ev.stopPropagation(); quitter(); MP.Ecrans.afficher(c.ecran);
      } }, [c.bouton]) : null
    ]));
  }

  function lancerPetales(n) {
    var couleurs = ['rgba(184,168,208,0.85)', 'rgba(68,137,140,0.75)', 'rgba(122,170,106,0.8)', 'rgba(224,178,94,0.9)', 'rgba(255,255,255,0.9)'];
    for (var i = 0; i < n; i++) {
      petales.push({ x: alea.entre(0, window.innerWidth), y: alea.entre(-60, -10), vx: alea.entre(-20, 20), vy: alea.entre(240, 380),
        rot: alea.entre(0, 6.28), vr: alea.entre(-3, 3), taille: alea.entre(5, 10), couleur: couleurs[i % couleurs.length], vie: 0, oscille: alea.entre(0, 6.28) });
    }
  }

  function feter(palier, titre, texte) {
    var f = h('div', { class: 'fete', role: 'status' }, [h('b', { texte: titre || 'Palier ' + palier + ' !' }), h('span', { texte: texte || '+15 % de Points, niveaux plus durs' })]);
    jeu.appendChild(f);
    setTimeout(function () { f.remove(); }, 2300);
    MP.Son.palier();
    lancerPetales(36);
  }

  function ecarts(res) {
    if (partie.mode === 'pointage' && res.ecart != null) {
      return ' Ta boule : ' + MP.formatEcart(res.ecart) + (res.ecartAdverse != null ? ', meilleure adverse : ' + MP.formatEcart(res.ecartAdverse) : '') + '.';
    }
    return '';
  }

  function quitter() {
    if (!partie) return;
    if (phase === 'lancer') { finirTout(); terminer(); }
    jeu.hidden = true;
    partie = null; phase = 'repos';
    if (boucle) { cancelAnimationFrame(boucle); boucle = null; }
    MP.Ecrans.afficher();
  }

  // ---------- Animation ----------

  function image(t) {
    boucle = requestAnimationFrame(image);
    if (!partie || jeu.hidden) return;
    var dt = Math.min(0.05, (t - dernierTemps) / 1000);
    dernierTemps = t;
    if (phase === 'lancer') {
      reserve += dt;
      while (reserve >= MP.PAS) { partie.monde.etape(MP.PAS); reserve -= MP.PAS; }
      evenements();
      cadrageVise = cadrageSuivi();
      if (!partie.monde.enMouvement()) { reserve = 0; terminer(); }
    }
    vue.suivre(zone, cadrageVise, 1 - Math.exp(-dt * (phase === 'lancer' ? 2.2 : 3.5)));
    if (phase === 'visee' && doigt && doigt.geste === 'maintien') majVisee();
    poussiere.avancer(dt);
    flottants.forEach(function (f) { f.vie += dt; });
    flottants = flottants.filter(function (f) { return f.vie < 1.6; });
    petales.forEach(function (p) { p.vie += dt; p.x += (p.vx + Math.sin(p.vie * 2 + p.oscille) * 30) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; });
    // Elles s'effacent en 2 secondes environ.
    petales = petales.filter(function (p) { return p.y < window.innerHeight + 20 && p.vie < 2; });
    var arrives = 0;
    jetons.forEach(function (j) { j.t += dt; if (j.t >= 0.75 && !j.fini) { j.fini = true; arrives++; } });
    if (arrives) { majPoints(); var b = document.getElementById('hud-bourse'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); MP.Son.piece(); }
    jetons = jetons.filter(function (j) { return !j.fini; });
    dessiner(t / 1000);
  }

  // Pendant le lancer : vue d'ensemble, puis on se rapproche du jeu quand la boule arrive.
  function cadrageSuivi() {
    var b = partie.joueur, c = partie.cochonnet;
    var avance = (b.z - 0.3) / Math.max(1, c.z - 0.3);
    if (avance < 0.6 && b.vol !== false) return cadrageEnsemble();
    if (avance < 0.6) return cadrageEnsemble();
    var x1 = Math.min(c.x - 0.8, b.x - 0.4), x2 = Math.max(c.x + 0.8, b.x + 0.4);
    var z1 = Math.min(c.z - 0.8, b.z - 0.5), z2 = Math.max(c.z + 0.8, b.z + 0.4);
    return vue.cadrage(zone, Math.max(-2.2, x1), Math.min(2.2, x2), z1, Math.min(15.2, z2), zoomMax() * 0.8);
  }

  function evenements() {
    var ev = partie.monde.evenements;
    for (; vuEvenements < ev.length; vuEvenements++) {
      var e = ev[vuEvenements];
      if (e.genre === 'sol') {
        // Le lancer reste silencieux : la boule posée juste devant le cercle (roulette, tir roulé) ne
        // fait pas de bruit ; on n'entend que les impacts plus loin.
        if (e.z > 1.4) MP.Son.sol(e.force, partie.terrain.id);
        if (e.force > 0.08) poussiere.souffler(e.x, e.z, e.force, couleurSol(), alea);
      } else if (e.genre === 'choc') {
        MP.Son.choc(e.force, e.cochonnet);
      } else if (e.genre === 'sortie') {
        MP.Son.choc(0.5, false);
      } else if (e.genre === 'trou') {
        MP.Son.sol(0.6, partie.terrain.id);
        poussiere.souffler(e.x, e.z, 0.4, couleurSol(), alea);
      }
    }
  }

  function couleurSol() {
    var n = parseInt(partie.terrain.sol[2].slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function dessiner(temps) {
    var L = window.innerWidth, H = window.innerHeight;
    MP.dessinerTerrain(ctx, vue, partie, ratio, L, H);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    MP.dessinerPieds(ctx, vue);
    var monde = partie.monde, c = partie.cochonnet, t = partie.taille;

    // La boule à toucher se reconnaît à sa seule couleur (violette, dorée sur un niveau doré) : pas d'anneau.
    if (phase === 'visee') dessinerObjectifs();
    // Pendant le lancer, la zone « à battre » suit le cochonnet et la boule à battre : elle grandit si le
    // cochonnet s'éloigne.
    if (phase === 'lancer') { var rbL = rayonABattre(); if (rbL !== null) rondABattre(rbL); }
    // Au tir, une seule zone : celle où l'on demande à ta boule d'aller après le tir (zone demandée,
    // sinon la place du carreau).
    if ((phase === 'visee' || phase === 'lancer') && !zoneJeu) zonesCarreau();
    // Zone où ta boule doit finir après le choc (défi, épreuve ou Montagne) : visible jusqu'au résultat.
    var zoneJeu = partie.niveau.zone || (partie.niveau.montagne && partie.niveau.montagne.zone) ||
      (partie.niveau.defi && partie.niveau.defi.id === 'zone' ? partie.niveau.defi.zone : null);
    if (zoneJeu && (phase === 'visee' || phase === 'lancer')) ovaleZone(zoneJeu);
    if (visee && phase === 'visee') dessinerVisee();
    if (doigt && doigt.annule && phase === 'visee') dessinerAnnulation();

    monde.corps.forEach(function (o) { MP.dessinerOmbreDessus(ctx, vue, o); });
    // La boule du joueur attend dans sa main, au-dessus du cercle.
    if (phase === 'visee') {
      var m = vue.ecran(0, 0.12);
      MP.dessinerBoule(ctx, m.x, m.y, Math.max(2.2, MP.MESURES.rayonBoule * t * vue.s * 1.15), MP.teinteJoueur(boule()), 0.7, 0.3, MP.striesJoueur(boule()), MP.etat.initiales);
    }
    monde.corps.slice().sort(function (a, b) { return (a.vol ? a.y : 0) - (b.vol ? b.y : 0); }).forEach(function (o) {
      var p = vue.ecran(o.x, o.z);
      var hauteur = o.vol ? Math.max(0, o.y - o.r) : 0;
      var r = o.r * vue.s * (1 + hauteur * 1.2);   // en l'air, elle paraît plus grosse
      if (o.type === 'cochonnet') return MP.dessinerCochonnet(ctx, p.x, p.y, Math.max(1.4, r), o.rotation);
      var style = o.camp === 'joueur' ? MP.teinteJoueur(o.style || boule()) : MP.styleAutre(partie, o);
      var dir = vue.paysage ? Math.atan2(o.vx, o.vz) : Math.atan2(-o.vz, o.vx);
      MP.dessinerBoule(ctx, p.x, p.y, Math.max(2, r), style, o.rotation, dir, o.camp === 'joueur' ? MP.striesJoueur(o.style || boule()) : 1, o.camp === 'joueur' ? MP.etat.initiales : null);
    });
    poussiere.dessiner(ctx, vue);
    if (phase === 'resultat') dessinerMesures();
    flottants.forEach(function (f) {
      var p = vue.ecran(f.x, f.z);
      ctx.globalAlpha = Math.max(0, 1 - f.vie / 1.6);
      ctx.textAlign = 'center';
      ctx.font = '700 28px "Cormorant Garamond", Georgia, serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(253,252,255,0.9)';
      ctx.strokeText(f.texte, p.x, p.y - 20 - f.vie * 40);
      ctx.fillStyle = '#2f6e70'; ctx.fillText(f.texte, p.x, p.y - 20 - f.vie * 40);
      ctx.globalAlpha = 1;
    });
    if (doigt && visee) dessinerJauge();
    if (partie.monde.vent && phase !== 'resultat') dessinerVent(temps);
    // Loupe sur le jeu tant que la vue est loin.
    if (phase === 'visee' && vue.s < 230) dessinerLoupe();
    // Les aides de visée par-dessus tout (la loupe ne doit pas les cacher).
    if (visee && phase === 'visee' && visee.departEffet) dessinerAides(visee, visee.departEffet);
    MP.habillageAquarelle(ctx, L, H, ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    petales.forEach(function (p) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, (2 - p.vie) / 0.6));
      ctx.fillStyle = p.couleur;
      ctx.beginPath(); ctx.ellipse(0, 0, p.taille, p.taille * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    jetons.forEach(function (j) {
      if (j.t < 0) return;
      var t = Math.min(1, j.t / 0.75), e = t * t * (3 - 2 * t);
      var x = j.x0 + (j.x1 - j.x0) * e + j.dx * Math.sin(Math.PI * t), y = j.y0 + (j.y1 - j.y0) * e + j.dy * Math.sin(Math.PI * t);
      var g = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 8);
      g.addColorStop(0, '#fff8df'); g.addColorStop(0.5, '#f0d08a'); g.addColorStop(1, 'rgba(226,180,92,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    });
  }

  function point(q) { return vue.ecran(q.x, q.z); }

  // Ronds d'objectif pendant la visée (et le lancer). Autour du cochonnet, deux traits pleins : le rond
  // « à battre », où le centre de ta boule doit finir pour battre la meilleure boule adverse (pointage),
  // et le rond du défi, sa distance écrite à côté. La Montagne et le Parcours (sans boule adverse)
  // gardent leur rond à atteindre.
  // Rayon de la zone à battre : jusqu'au bord de la boule à battre côté cochonnet (sans la couper).
  function rayonABattre() {
    if (jeuMode() !== 'pointage') return null;
    var c = partie.cochonnet, meilleur = null, rb = 0;
    partie.monde.corps.forEach(function (o) {
      if (o.type !== 'boule' || o.camp === 'joueur' || o.mort) return;
      var dd = Math.hypot(o.x - c.x, o.z - c.z);
      if (meilleur === null || dd < meilleur) { meilleur = dd; rb = o.r; }
    });
    return meilleur === null ? null : Math.max(c.r * 1.5, meilleur - rb);
  }
  // Une zone de couleur douce, sans trait, bleu pastel comme les autres boules, un peu plus soutenue vers
  // son bord : au pointage, là où battre la boule à battre ; au tir, là où rester pour le carreau.
  function zoneDouce(x, z, rayon) {
    var c = vue.ecran(x, z), R = rayon * vue.s;
    if (R < 6) return;
    var g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
    g.addColorStop(0, 'rgba(147,175,223,0.12)'); g.addColorStop(0.85, 'rgba(147,175,223,0.24)'); g.addColorStop(1, 'rgba(147,175,223,0.06)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 7); ctx.fill();
  }
  function rondABattre(rayon) { zoneDouce(partie.cochonnet.x, partie.cochonnet.z, rayon); }
  // Au tir : la zone du carreau autour de la place de chaque boule à toucher (MP.evaluer : ta boule
  // reste à moins de 20 cm de cette place). Elle reste là pendant le lancer, même si la boule part.
  function zonesCarreau() {
    if (!partie.cible || !partie.cibles) return;
    partie.cibles.forEach(function (x) { if (!x.touchee || phase === 'lancer') zoneDouce(x.depart.x, x.depart.z, MP.RAYON_CARREAU); });
  }
  function dessinerObjectifs() {
    var c = partie.cochonnet, rB = MP.MESURES.rayonBoule * partie.taille, defi = partie.niveau.defi;
    var rb = rayonABattre();
    if (rb !== null) rondABattre(rb);
    if (partie.niveau.montagne && partie.niveau.montagne.rayon) {
      rondObjectif(c.x, c.z, c.r + partie.niveau.montagne.rayon + rB, 'rgba(47,110,112,0.9)', Math.round(partie.niveau.montagne.rayon * 100) + ' cm');
    }
    if (partie.niveau.parcours) {
      var pc = partie.niveau.parcours;
      if (fantome) dessinerFantome(fantome);
      rondObjectif(c.x, c.z, c.r + pc.rayon + rB, 'rgba(47,110,112,0.9)', Math.round(pc.rayon * 100) + ' cm');
    }
  }
  // Doigt revenu dans le cercle : on le montre, le lancer sera annulé au lâcher.
  function dessinerAnnulation() {
    var c = vue.ecran(0, 0), R = Math.max(46, MP.MESURES.cercle * vue.s * 1.8);
    ctx.fillStyle = 'rgba(176,96,112,0.14)'; ctx.strokeStyle = 'rgba(176,96,112,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '800 13px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var t = 'Relâche pour annuler', w = ctx.measureText(t).width + 16, y = c.y - R - 16;
    ctx.fillStyle = 'rgba(253,252,255,0.94)'; arrondi(c.x - w / 2, y - 12, w, 24, 12); ctx.fill();
    ctx.fillStyle = 'rgba(150,70,88,1)'; ctx.fillText(t, c.x, y);
    ctx.textBaseline = 'alphabetic';
  }
  // L'essai d'avant, en gris : où la boule est tombée (petit rond) et où elle s'est arrêtée.
  function dessinerFantome(f) {
    var p = vue.ecran(f.x, f.z), R = Math.max(3, f.r * vue.s);
    if (f.chute) {
      var q = vue.ecran(f.chute.x, f.chute.z);
      ctx.strokeStyle = 'rgba(96,88,112,0.55)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(4, R * 0.9), 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(96,88,112,0.28)'; ctx.strokeStyle = 'rgba(253,252,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.fill(); ctx.stroke();
  }
  // L'ovale de la zone où ta boule doit aller après le choc, peint en bleu pastel doux sur le terrain
  // (repère de la zone : côté = (uz, −ux), avant = (ux, uz)).
  function ovaleZone(Z) {
    // Deux ovales l'un dans l'autre : le bord un peu plus soutenu, sans trait, comme les autres zones.
    [[1, 'rgba(147,175,223,0.16)'], [0.8, 'rgba(147,175,223,0.10)']].forEach(function (o) {
      ctx.beginPath();
      for (var k = 0; k <= 48; k++) {
        var a = k / 48 * 2 * Math.PI, co = Math.cos(a) * Z.lat * o[0], av = Math.sin(a) * Z.lon * o[0];
        var p = vue.ecran(Z.x + Z.uz * co + Z.ux * av, Z.z - Z.ux * co + Z.uz * av);
        if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.fillStyle = o[1]; ctx.fill();
    });
  }
  function rondObjectif(x, z, rayon, couleur, texte) {
    var p = vue.ecran(x, z), R = rayon * vue.s;
    if (R < 6) return;
    ctx.strokeStyle = 'rgba(253,252,255,0.7)'; ctx.lineWidth = 3.2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = couleur; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (!texte) return;
    ctx.font = '700 11px Nunito, system-ui, sans-serif';
    var w = ctx.measureText(texte).width + 10, y = p.y - R;
    ctx.fillStyle = 'rgba(253,252,255,0.92)'; arrondi(p.x - w / 2, y - 8, w, 16, 8); ctx.fill();
    ctx.fillStyle = couleur; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(texte, p.x, y);
    ctx.textBaseline = 'alphabetic';
  }

  function dessinerVisee() {
    var mt = technique().mode, ap = visee.apercu, accent = mt === 'pointage' ? 'rgba(47,110,112,0.95)' : 'rgba(110,93,147,0.95)';
    var i, q, p;
    if (visee.genre === 'glisse') {
      // Trajet prévu : 1 m, puis 12 cm de plus par niveau de Guide de glisse, de plus en plus pâle.
      var portee = 1 + MP.niveauAm(d(), 'guide') * 0.12, parcouru = 0, prec = null, fin = null;
      ctx.fillStyle = mt === 'pointage' ? 'rgba(54,111,113,0.85)' : 'rgba(110,93,147,0.85)';
      for (i = 0; i < ap.trajet.length; i++) {
        q = ap.trajet[i];
        if (prec) parcouru += Math.hypot(q.x - prec.x, q.z - prec.z);
        prec = q;
        if (parcouru > portee) break;
        fin = q;
        if (i % 3) continue;
        p = point(q);
        ctx.globalAlpha = 0.95 - 0.6 * Math.min(1, parcouru / Math.min(portee, 12));
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.4, 0.016 * vue.s * (1 + (q.vol ? q.y : 0) * 0.35)), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      visee.departEffet = fin ? point(fin) : vue.ecran(0, 0.6);
      return;
    }
    // Lancer en l'air : portée maximale, trajet en vol, repère de chute.
    var portee2 = MP.porteeMax(d(), boule(), visee.choix.technique);
    MP.cercleDessus(ctx, vue, 0, 0.3, portee2, 'rgba(122,106,154,0.35)', 1.5, true);
    // Au départ, seul le repère : l'arc en l'air et la suite au sol s'achètent.
    var nArc = MP.niveauAm(d(), 'arcVol'), nSuite = MP.niveauAm(d(), 'suiteSol');
    var longArc = nArc >= 20 ? 99 : (nArc ? 1 + 0.6 * (nArc - 1) : 0), longSuite = 0.1 + nSuite * 0.1;
    var enVol = 0, auSol = 0, posee = false, avant = null;
    ctx.fillStyle = mt === 'pointage' ? 'rgba(54,111,113,0.85)' : 'rgba(110,93,147,0.85)';
    for (i = 0; i < ap.trajet.length; i++) {
      q = ap.trajet[i];
      if (avant) { var pas = Math.hypot(q.x - avant.x, q.z - avant.z); if (posee) auSol += pas; else enVol += pas; }
      avant = q;
      if (!q.vol && i > 0) posee = true;
      if (posee ? (!longSuite || auSol > longSuite) : (!longArc || enVol > longArc)) { if (posee) break; else continue; }
      if (i % 3) continue;
      p = point(q);
      ctx.globalAlpha = posee ? 0.5 : 0.9;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.2, 0.014 * vue.s * (1 + (q.vol ? q.y : 0) * 0.5)), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    var pt = visee.point, c = point(pt);
    // Zone où la boule peut vraiment tomber : grande au début, elle se resserre avec la précision.
    var dist = Math.hypot(pt.x, pt.z - 0.3), pr = visee.lancer.precision;
    ctx.save();
    ctx.translate(c.x, c.y);
    var ang = Math.atan2(pt.x, pt.z - 0.3);
    ctx.rotate(vue.paysage ? ang : -ang);
    var lat = Math.max(4, 2 * pr.direction * dist * vue.s), lon = Math.max(4, 4 * pr.force * dist * vue.s);
    ctx.beginPath(); ctx.ellipse(0, 0, vue.paysage ? lon : lat, vue.paysage ? lat : lon, 0, 0, 7);
    ctx.fillStyle = mt === 'pointage' ? 'rgba(68,137,140,0.13)' : 'rgba(122,106,154,0.14)'; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.strokeStyle = pt.horsPortee ? 'rgba(192,80,112,0.95)' : accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.x - 15, c.y); ctx.lineTo(c.x - 4, c.y); ctx.moveTo(c.x + 4, c.y); ctx.lineTo(c.x + 15, c.y);
    ctx.moveTo(c.x, c.y - 15); ctx.lineTo(c.x, c.y - 4); ctx.moveTo(c.x, c.y + 4); ctx.lineTo(c.x, c.y + 15); ctx.stroke();
    if (pt.horsPortee) texteEcran('Trop loin pour ta puissance', c.x, c.y - 22, '#fde4ec');
    visee.departEffet = c;
    // Trait léger du doigt à la croix : on voit qu'elle suit le doigt, à distance.
    if (doigt && doigt.x != null) {
      var ex = c.x - doigt.x, ey = c.y - doigt.y, el = Math.hypot(ex, ey);
      if (el > 50) {
        ex /= el; ey /= el;
        ctx.strokeStyle = 'rgba(253,252,255,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(doigt.x + ex * 26, doigt.y + ey * 26); ctx.lineTo(c.x - ex * 18, c.y - ey * 18); ctx.stroke();
        ctx.strokeStyle = accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(doigt.x + ex * 26, doigt.y + ey * 26); ctx.lineTo(c.x - ex * 18, c.y - ey * 18); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(doigt.x, doigt.y, 24, 0, 7); ctx.stroke();
    }
  }

  // Ce que disent les aides de visée, et l'effet prévu (depart : où dessiner sa flèche, à l'écran).
  var VERT = '#3f8a52', ORANGE = '#c27a1e', ROUGE = '#b8445f';
  function dessinerAides(g, depart) {
    var A = g.aides;
    if (!A) return;
    var c = partie.cochonnet;
    if (A.donnee) {
      var pd = vue.ecran(A.donnee.x, A.donnee.z), R = Math.max(6, A.donnee.rayon * vue.s);
      ctx.fillStyle = 'rgba(68,137,140,0.16)'; ctx.strokeStyle = 'rgba(47,110,112,0.9)'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(pd.x, pd.y, R, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      etiquette('Donnée', pd.x, pd.y + R + 11, '#2f6e70');
    }
    if (A.passages) {
      var flou = MP.flouAide(A.passages.n, 15, 0.10, 0.01);
      A.passages.liste.forEach(function (x) {
        var e = x.ecart, coul = e - flou > 0 ? VERT : (e + flou < 0 ? ROUGE : ORANGE);
        var txt = coul === VERT ? 'Passe' : (coul === ROUGE ? 'La touche' : 'De justesse');
        if (A.passages.n >= 10 && coul !== ROUGE) txt += ' (' + Math.max(0, Math.round(e * 100)) + ' cm)';
        var po = vue.ecran(x.objet.x, x.objet.z), Ro = Math.max(8, x.objet.r * vue.s * 1.8);
        ctx.strokeStyle = coul; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(po.x, po.y, Ro, 0, 7); ctx.stroke();
        etiquette(txt, po.x, po.y + Ro + 11, coul);
      });
    }
    if (g.lancer.spin) dessinerEffet(g, A.effet, depart);
  }

  // Effet gauche ou droite : une flèche qui tourne de son côté, et de combien il écarte ta boule
  // à hauteur du but. Au tir au fer, il agit au choc : ta boule file de son côté.
  function dessinerEffet(g, ecart, p) {
    var sens = g.lancer.spin > 0 ? 1 : -1, o = vue.ecran(0, 0), av = vue.ecran(0, 1), dr = vue.ecran(1, 0);
    var fx = av.x - o.x, fy = av.y - o.y, lf = Math.hypot(fx, fy) || 1, rx = dr.x - o.x, ry = dr.y - o.y, lr = Math.hypot(rx, ry) || 1;
    fx /= lf; fy /= lf; rx = rx / lr * sens; ry = ry / lr * sens;
    // Au fer, l'effet agit au choc : la flèche part presque tout de suite sur le côté.
    var av1 = g.choix.technique === 'tirAuFer' ? 20 : 46, cote1 = g.choix.technique === 'tirAuFer' ? 34 : 26;
    var x0 = p.x + fx * 14, y0 = p.y + fy * 14, x1 = p.x + fx * av1 + rx * cote1, y1 = p.y + fy * av1 + ry * cote1;
    var kx = p.x + fx * av1, ky = p.y + fy * av1;
    ctx.strokeStyle = 'rgba(253,252,255,0.85)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(kx, ky, x1, y1); ctx.stroke();
    ctx.strokeStyle = '#b0603a'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(kx, ky, x1, y1); ctx.stroke();
    // Pointe de la flèche, dans le sens de la fin de la courbe.
    var tx = x1 - kx, ty = y1 - ky, lt = Math.hypot(tx, ty) || 1;
    tx /= lt; ty /= lt;
    ctx.beginPath(); ctx.moveTo(x1 - tx * 8 + ty * 5, y1 - ty * 8 - tx * 5); ctx.lineTo(x1, y1); ctx.lineTo(x1 - tx * 8 - ty * 5, y1 - ty * 8 + tx * 5); ctx.stroke();
    ctx.lineCap = 'butt';
    var cote = sens > 0 ? 'droite' : 'gauche';
    var txt = g.choix.technique === 'tirAuFer' ? 'Effet : au choc, ta boule file à ' + cote
      : 'Effet : ≈ ' + Math.max(5, Math.round(Math.abs(ecart) * 20) * 5) + ' cm à ' + cote;
    // En l'air, le texte va sous la croix (au-dessus, il y a le but et ses aides).
    if (g.genre === 'vol') etiquette(txt, p.x - fx * 36, p.y - fy * 36, '#9a4f2c');
    else etiquette(txt, x1 + rx * 8, y1 + ry * 8 - 14, '#9a4f2c');
  }

  // Une étiquette : texte de couleur sur une pastille blanche. cote : posée à côté du point plutôt
  // que centrée dessus, à cette distance ; à droite (cote > 0) ou à gauche (cote < 0) si la place le permet.
  function etiquette(t, x, y, couleur, cote) {
    ctx.font = '700 12px Nunito, system-ui, sans-serif';
    var w = ctx.measureText(t).width + 12;
    if (cote) {
      var a = Math.abs(cote), droite = x + a + w / 2 <= zone.x + zone.l - 4, gauche = x - a - w / 2 >= zone.x + 4;
      x = (cote > 0 ? droite || !gauche : !gauche && droite) ? x + a + w / 2 : x - a - w / 2;
    }
    x = Math.max(zone.x + w / 2 + 4, Math.min(zone.x + zone.l - w / 2 - 4, x));
    ctx.fillStyle = 'rgba(253,252,255,0.94)'; arrondi(x - w / 2, y - 9, w, 18, 9); ctx.fill();
    ctx.fillStyle = couleur; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  // Manche à air, en bas à droite : elle flotte dans le sens du vent, plus tendue quand il est fort.
  // Le vent ne pousse que les boules en l'air ; les aides de visée n'en tiennent pas compte.
  function dessinerVent(temps) {
    var v = partie.monde.vent, o = vue.ecran(0, 0), q = vue.ecran(v.x, v.z);
    var dx = q.x - o.x, dy = q.y - o.y, l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    var cx = zone.x + zone.l - 46, cy = zone.y + zone.h - 58, r = 30;
    ctx.fillStyle = 'rgba(253,252,255,0.88)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(122,106,154,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    // Mât, puis la manche : trois anneaux qui rétrécissent, un peu ondulants.
    var tension = Math.min(1, v.force / 1.4), long = 14 + 12 * tension, ondule = Math.sin(temps * 6) * (1 - tension) * 3;
    var bx = cx - dx * long / 2, by = cy - dy * long / 2, nx = -dy, ny = dx;
    ctx.strokeStyle = '#7a6a9a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - nx * 8, by - ny * 8); ctx.lineTo(bx + nx * 8, by + ny * 8); ctx.stroke();
    for (var k = 0; k < 3; k++) {
      var t0 = k / 3, t1 = (k + 1) / 3, w0 = 6 * (1 - 0.45 * t0), w1 = 6 * (1 - 0.45 * t1);
      var x0 = bx + dx * long * t0 + nx * ondule * t0, y0 = by + dy * long * t0 + ny * ondule * t0;
      var x1 = bx + dx * long * t1 + nx * ondule * t1, y1 = by + dy * long * t1 + ny * ondule * t1;
      ctx.fillStyle = k % 2 ? 'rgba(253,252,255,0.95)' : 'rgba(212,149,106,0.9)';
      ctx.beginPath(); ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.lineTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.lineTo(x0 - nx * w0, y0 - ny * w0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(122,106,154,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    texteEcran('Vent ' + qualiteVent(v.force), cx, cy + r + 14, '#fff');
  }

  function texteEcran(t, x, y, couleur) {
    ctx.font = '700 13px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(30,58,58,0.7)'; ctx.strokeText(t, x, y);
    ctx.fillStyle = couleur || '#fff'; ctx.fillText(t, x, y);
  }

  function dessinerJauge() {
    // En portrait, la jauge commence sous la loupe et sa légende.
    var z = zone, x = z.x + 18, bas = z.y + z.h * 0.85, w = 14;
    var haut = vue.paysage ? z.y + z.h * 0.25 : Math.min(bas - 120, Math.max(z.y + z.h * 0.25, z.y + 2 * rayonLoupe() + 64)), hJ = bas - haut;
    ctx.fillStyle = 'rgba(253,252,255,0.85)';
    arrondi(x - w / 2 - 4, haut - 4, w + 8, hJ + 8, 11); ctx.fill();
    var nLecture = MP.niveauAm(d(), 'lecturePuissance');
    if (nLecture && visee.genre === 'glisse') {
      var ideal = puissanceIdeale(nLecture);
      ctx.fillStyle = 'rgba(122,170,106,0.75)';
      var y1 = bas - (ideal.centre + ideal.largeur / 2) * hJ, y2 = bas - (ideal.centre - ideal.largeur / 2) * hJ;
      ctx.fillRect(x - w / 2, Math.max(haut, y1), w, Math.max(0, Math.min(bas, y2) - Math.max(haut, y1)));
    }
    // En l'air aussi, la force compte : celle qu'il faut pour que la boule tombe à la croix, par
    // rapport à ta force la plus grande (chute au bout de ta portée).
    var p = visee.genre === 'glisse' ? visee.puissance : forceEnLAir();
    var g = ctx.createLinearGradient(0, bas, 0, haut);
    g.addColorStop(0, '#8fbcbe'); g.addColorStop(0.6, '#b8a8d0'); g.addColorStop(1, '#d4956a');
    ctx.fillStyle = g;
    arrondi(x - w / 2 + 2, bas - p * hJ, w - 4, p * hJ, 5); ctx.fill();
    // Dernière force : un petit trait là où la jauge s'est arrêtée au lancer d'avant (même technique).
    var avant = dernieresForces[jeuMode() + '/' + visee.choix.technique];
    if (avant != null && MP.niveauAm(d(), 'derniereForce')) {
      var ya = bas - avant * hJ;
      ctx.strokeStyle = 'rgba(253,252,255,0.95)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - w / 2 - 5, ya); ctx.lineTo(x + w / 2 + 5, ya); ctx.stroke();
      ctx.strokeStyle = '#1e3a3a'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x - w / 2 - 5, ya); ctx.lineTo(x + w / 2 + 5, ya); ctx.stroke();
      ctx.lineCap = 'butt';
    }
    texteEcran(Math.round(p * 100) + ' %', x + 8, haut - 12);
  }
  // La force de chaque lancer, par discipline et technique (pour la Dernière force).
  var dernieresForces = {};

  function forceEnLAir() {
    var t = visee.choix.technique, max = MP.vitessePourChute(t, MP.porteeMax(d(), boule(), t), partie.taille);
    return Math.max(0, Math.min(1, MP.vitessePourChute(t, Math.hypot(visee.point.x, visee.point.z - 0.3), partie.taille) / max));
  }

  // Force qui amène la boule au bon endroit (Repère de force), comme sur un terrain plat. La bande
  // est large au début (un tiers de la jauge) et un peu décalée ; elle se resserre à chaque niveau
  // jusqu'à 6 % au niveau 20. Avec la Lecture du sol, elle tient compte du relief (entièrement au
  // niveau 10) : pentes, boue et cuvettes.
  MP.largeurLecturePuissance = function (n) { return 0.34 * Math.pow(0.06 / 0.34, (Math.max(1, n) - 1) / 19); };
  var idealCache = {};
  function puissanceIdeale(nLecture) {
    var nSol = MP.niveau(d(), 'lectureSol');
    var cle = partie.graine + '/' + visee.choix.technique + '/' + visee.choix.effet + '/' + nLecture + '/' + nSol;
    if (idealCache[cle]) return idealCache[cle];
    var but = partie.cible || partie.cochonnet, vise = jeuMode() === 'tir' ? but.z + 1.2 : but.z;
    var dir = Math.atan2(but.x, but.z - 0.3);
    function chercher(relief) {
      var bas = 0, haut = 1;
      for (var k = 0; k < 20; k++) {
        var q = (bas + haut) / 2;
        var r = MP.simulerSeul(partie.terrain, MP.lancerAuGlisse(d(), boule(), visee.choix, dir, q, but.z, null), false, relief, partie.taille);
        if (r.arret.z > vise) haut = q; else bas = q;
      }
      return (bas + haut) / 2;
    }
    var plat = chercher(null), lu = Math.min(1, nSol / 10), ideal = plat;
    if (partie.relief && lu > 0) ideal = plat + (chercher(partie.relief) - plat) * lu;
    var largeur = MP.largeurLecturePuissance(nLecture), a = new MP.Aleatoire(partie.graine + nLecture);
    idealCache[cle] = { centre: Math.min(1, Math.max(0, ideal + a.gauss() * largeur * 0.25)), largeur: largeur };
    return idealCache[cle];
  }

  function arrondi(x, y, w, hh, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, Math.max(0, hh), Math.min(r, Math.max(0, hh) / 2));
    else ctx.rect(x, y, w, Math.max(0, hh));
  }

  // Écarts mesurés au cochonnet, écrits sur le terrain.
  function dessinerMesures() {
    var c = partie.cochonnet;
    if (!partie.joueur || partie.joueur.mort || c.mort) return;
    var jour = function (o) { return Math.max(0, Math.hypot(o.x - c.x, o.z - c.z) - o.r - c.r); };
    var liste = [{ o: partie.joueur, couleur: jeuMode() === 'pointage' ? '#2f6e70' : '#6e5d93' }];
    if (jeuMode() === 'pointage') {
      var meilleur = null;
      partie.monde.corps.forEach(function (o) {
        if (o.type === 'boule' && o !== partie.joueur && !o.mort && (!meilleur || jour(o) < jour(meilleur))) meilleur = o;
      });
      if (meilleur) liste.push({ o: meilleur, couleur: '#33363d' });
    }
    var pc = point(c);
    // Les étiquettes se posent à côté des boules, de part et d'autre, pour ne jamais les cacher.
    var cotes = liste.length > 1 && point(liste[1].o).x > point(liste[0].o).x ? [-1, 1] : [1, -1];
    liste.forEach(function (m, i) {
      var po = point(m.o);
      if (Math.hypot(po.x - pc.x, po.y - pc.y) > Math.max(window.innerWidth, window.innerHeight)) return;
      ctx.strokeStyle = 'rgba(30,58,58,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pc.x, pc.y); ctx.lineTo(po.x, po.y); ctx.stroke(); ctx.setLineDash([]);
      var t = MP.formatEcart(jour(m.o));
      ctx.font = '700 13px Nunito, system-ui, sans-serif';
      var w = ctx.measureText(t).width + 12, rb = Math.max(4, m.o.r * vue.s * 1.45);
      var mx = po.x + cotes[i] * (rb + 6 + w / 2), my = po.y;
      ctx.fillStyle = m.couleur; arrondi(mx - w / 2, my - 10, w, 20, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, mx, my);
      ctx.textBaseline = 'alphabetic';
    });
  }

  function rayonLoupe() { return Math.max(52, Math.min(110, Math.min(window.innerWidth, window.innerHeight) * 0.15)); }

  function dessinerLoupe() {
    var r = rayonLoupe();
    var c = partie.cochonnet, cote = c.x > 0.2 ? -1 : 1;
    var pc = vue.ecran(c.x, c.z);
    var cx, cy;
    if (vue.paysage) { cx = Math.min(zone.x + zone.l - r - 6, pc.x + r * 0.2); cy = cote > 0 ? zone.y + zone.h - r - 6 : zone.y + r + 6; }
    else { cx = cote > 0 ? zone.x + zone.l - r - 6 : zone.x + r + 6; cy = zone.y + r + 6; }
    // Quand le doigt vise, la loupe prend une place libre : ni sous le doigt, ni sur le but.
    if (doigt && doigt.x != null) {
      var haut = zone.y + r + 6, bas = zone.y + zone.h - r - 6, gauche = zone.x + r + 6, droite = zone.x + zone.l - r - 6;
      var but = vue.ecran((partie.cible || c).x, (partie.cible || c).z);
      var places = vue.paysage
        ? [[cx, cy], [cx, cy === bas ? haut : bas], [Math.max(gauche, pc.x - 2.8 * r), cy], [Math.max(gauche, pc.x - 2.8 * r), cy === bas ? haut : bas]]
        : [[cx, cy], [cx === droite ? gauche : droite, cy], [cx, Math.min(bas, pc.y + 2.8 * r)]];
      var libre = places.filter(function (q) {
        return Math.hypot(doigt.x - q[0], doigt.y - q[1]) > r + 70 && Math.hypot(but.x - q[0], but.y - q[1]) > r + 24;
      })[0];
      if (!libre) return;   // pas de place : on s'en passe pendant la visée
      cx = libre[0]; cy = libre[1];
    }
    // La loupe s'élargit pour montrer la boule à battre (ou la cible), et sa légende dit ce qu'il faut battre.
    var meilleur = null, loin = 0;
    partie.monde.corps.forEach(function (o) {
      if (o.type !== 'boule' || o.camp === 'joueur' || o.mort) return;
      var centre = Math.hypot(o.x - c.x, o.z - c.z);
      if (meilleur === null || centre - o.r - c.r < meilleur) { meilleur = Math.max(0, centre - o.r - c.r); loin = centre + o.r; }
      if (o.camp === 'cible') loin = Math.max(loin, centre + o.r);
    });
    var rayonMonde = Math.min(1.5, Math.max(0.4, loin * 1.15 + 0.03));
    MP.dessinerLoupe(ctx, partie, cx, cy, r, rayonMonde, null);
    // Le rond de visée (lancer en l'air) se voit aussi dans la loupe, par rapport au but.
    if (visee && visee.genre === 'vol') {
      var ech = r / rayonMonde, vx = cx + (visee.point.x - c.x) * ech, vy = cy - (visee.point.z - c.z) * ech;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, 7); ctx.clip();
      ctx.strokeStyle = technique().mode === 'pointage' ? 'rgba(47,110,112,0.95)' : 'rgba(110,93,147,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(vx, vy, 8, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(vx - 14, vy); ctx.lineTo(vx - 4, vy); ctx.moveTo(vx + 4, vy); ctx.lineTo(vx + 14, vy);
      ctx.moveTo(vx, vy - 14); ctx.lineTo(vx, vy - 4); ctx.moveTo(vx, vy + 4); ctx.lineTo(vx, vy + 14); ctx.stroke();
      ctx.restore();
    }
    var texte = jeuMode() === 'tir' ? 'Cible' : (meilleur === null ? 'Loupe' : 'À battre : ' + MP.formatEcart(meilleur));
    ctx.font = '700 13px Nunito, system-ui, sans-serif';
    // Légende posée sur le bord de la loupe (en bas, ou en haut si la loupe est en bas), pour ne rien cacher.
    var w = ctx.measureText(texte).width + 18, y = cy > zone.y + zone.h / 2 ? cy - r - 12 : cy + r - 12;
    ctx.fillStyle = 'rgba(253,252,255,0.94)'; arrondi(cx - w / 2, y, w, 24, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(122,106,154,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#366f71'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texte, cx, y + 12); ctx.textBaseline = 'alphabetic';
  }

  // ---------- Toucher ----------

  function brancher() {
    toile = document.getElementById('toile');
    jeu = document.getElementById('jeu');
    toile.addEventListener('pointerdown', function (e) {
      if (phase === 'lancer') { finirTout(); terminer(); return; }
      if (phase === 'resultat') {
        if (performance.now() - debutResultat > 350) nouveauNiveau(false);
        return;
      }
      if (phase !== 'visee') return;
      if (feuilleOuverte) { ouvrirFeuille(null); return; }   // un appui sur le terrain referme la liste
      // On vise : les annonces (succès, palier, points) s'effacent.
      MP.Ecrans.effacerAnnonces(); flottants = [];
      toile.setPointerCapture(e.pointerId);
      doigt = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, geste: null,
        traces: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
      // Technique en l'air : la croix apparaît tout de suite près du doigt, pas de risque de lancer roulé.
      if (technique().famille === 'vol') { doigt.geste = 'maintien'; MP.Son.toucher(); majVisee(); }
    });
    toile.addEventListener('pointermove', function (e) {
      if (!doigt || e.pointerId !== doigt.id) return;
      doigt.x = e.clientX; doigt.y = e.clientY;
      doigt.traces.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (doigt.traces.length > 40) doigt.traces.shift();
      if (!doigt.geste && Math.hypot(doigt.x - doigt.x0, doigt.y - doigt.y0) > 10) doigt.geste = 'glisse';
      majVisee();
    });
    function lacher(e) {
      if (!doigt || e.pointerId !== doigt.id) return;
      if (doigt.geste === 'maintien') {
        // En levant le doigt, il glisse souvent un peu : on garde la position d'un instant avant.
        var limite = performance.now() - STABLE, garde = doigt.traces[0];
        doigt.traces.forEach(function (q) { if (q.t <= limite) garde = q; });
        doigt.x = garde.x; doigt.y = garde.y;
      } else {
        doigt.x = e.clientX; doigt.y = e.clientY;
      }
      majVisee();
      var annule = doigt.annule;
      doigt = null;
      if (annule) MP.Ecrans.toast('Lancer annulé');
      else if (visee) lancer();
      visee = null;
    }
    toile.addEventListener('pointerup', lacher);
    toile.addEventListener('pointercancel', function () { doigt = null; visee = null; });
    document.getElementById('quitter').addEventListener('click', quitter);
    document.getElementById('resultat').addEventListener('click', function () {
      if (phase === 'resultat' && performance.now() - debutResultat > 350) nouveauNiveau(false);
    });
    var attente = null;
    window.addEventListener('resize', function () {
      clearTimeout(attente);
      attente = setTimeout(function () { redimensionner(true); }, 120);
    });
  }

  return {
    brancher: brancher, commencer: commencer, quitter: quitter, majPoints: function () { if (partie) majPoints(); },
    enCours: function () { return !!partie; },
    // Pour les tests automatiques.
    _test: function () {
      return {
        partie: partie, phase: phase, vue: vue, zone: zone,
        glisser: function (direction, puissance) {
          doigt = { geste: 'glisse' };
          var ch = { technique: technique().id, effet: d().effet, terrain: partie.terrain.id };
          var l = MP.lancerAuGlisse(d(), boule(), ch, direction, puissance, butZ(), null);
          visee = { genre: 'glisse', choix: ch, direction: direction, puissance: puissance, lancer: l, apercu: MP.simulerSeul(partie.terrain, l, true, partie.relief, partie.taille) };
          aidesVisee(visee);
        },
        maintenir: function (x, z) {
          var e = vue.ecran(x, z), dc = decalageCroix();
          doigt = { geste: 'maintien', x0: e.x - dc.x, y0: e.y - dc.y, x: e.x - dc.x, y: e.y - dc.y, sorti: true, traces: [] };
          var ch = { technique: technique().id, effet: d().effet, terrain: partie.terrain.id };
          var l = MP.lancerEnLAir(d(), boule(), ch, x, z, null, partie.taille);
          visee = { genre: 'vol', choix: ch, point: l.vise, lancer: l, apercu: MP.simulerSeul(partie.terrain, l, true, partie.relief, partie.taille) };
          aidesVisee(visee);
        },
        lancer: function () { doigt = null; lancer(); },
        finir: function () { finirTout(); terminer(); },
        suivant: function () { nouveauNiveau(false); }
      };
    }
  };
})();
