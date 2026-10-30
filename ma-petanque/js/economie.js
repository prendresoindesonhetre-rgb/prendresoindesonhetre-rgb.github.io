// Ma Pétanque — sauvegarde, prix et gains.
// Chaque prix est calculé par UNE seule fonction, utilisée à la fois pour l'affichage
// et pour le paiement : le prix affiché est toujours le prix payé.
// Le pointage et le tir ont chacun leur progression (« d » ci-dessous) : on ne dépense
// jamais des Points de tir au pointage, ni l'inverse.
'use strict';
var MP = window.MP || (window.MP = {});

MP.CLE_SAUVEGARDE = 'ma-petanque-v1';

MP.disciplineNeuve = function (id) {
  var d = {
    points: 0,
    gagnes: 0,
    competences: {},
    ameliorations: {},
    boules: ['classique'],
    equipee: 'classique',
    reglagesBoules: {},        // réglage de chaque boule : { poids, tendrete, adherence }
    lances: 0,                 // boules lancées
    serie: 0,
    meilleureSerie: 0,
    technique: id === 'pointage' ? 'roulette' : 'tirSimple',   // technique choisie : elle décide du geste
    maitrise: {},              // victoires avec chaque technique (pour ouvrir les épreuves)
    epreuves: {},              // épreuves réussies : pour toujours, même après une nouvelle saison
    effet: 'neutre',
    meilleurNiveau: 0,         // étoiles du niveau le plus dur réussi
    palier: 1,                 // difficulté actuelle : monte avec les victoires
    xp: 0,                     // remplissage de la barre du palier
    defaitesSuite: 0,          // trois défaites de suite : on redescend d'un palier
    palierMaxSaison: 1,
    techniqueAttente: null,    // technique gagnée en épreuve : jouable à la prochaine saison
    gagnesSaison: 0,           // Points gagnés depuis le début de la saison
    saison: 1,
    trophees: 0,               // +10 % de Points chacun, jusqu'à la prochaine ligue
    ligue: 0,                  // 0 Départemental, 1 Régional, 2 National, 3 Mondial…
    victoires: 0,
    defaites: 0,
    biberons: 0,
    carreaux: 0,
    meilleurPoint: null,
    palierRecord: 1,           // meilleur palier jamais atteint
    dores: 0,                  // niveaux dorés gagnés
    defisReussis: 0,
    cinqEtoiles: 0,            // niveaux ★★★★★ gagnés
    fourchettes: 0,
    reprises: 0,
    succes: {},                // succès obtenus : pour toujours
    club: {},                  // coéquipiers recrutés, par rang
    clubGagnes: 0,             // Points gagnés par le club, en tout
    elan: 0,                   // jusqu'à quand (ms) le club produit double après une victoire
    piste: null,               // terrain en cours : 10 niveaux, de plus en plus usé (voir relief.js)
    // Parcours de lancers imposés (pointage) : numéro, lancer en cours (0 à 4), essais sur ce lancer,
    // graine du parcours (0 : à tirer), technique imposée retenue, parcours terminés.
    parcours: { numero: 1, lancer: 0, essais: 0, graine: 0, technique: '', reussis: 0 },
    // La Montagne : étape en cours (0 à 9), boules déjà lancées à cette étape, plus haute étape
    // atteinte, sommets atteints.
    montagne: { etape: 0, boule: 0, record: 0, sommets: 0 }
  };
  MP.ARBRES[id].forEach(function (c) { d.competences[c.id] = 0; });
  MP.AMELIORATIONS[id].forEach(function (a) { d.ameliorations[a.id] = 0; });
  MP.TECHNIQUES.forEach(function (t) { if (t.mode === id) d.maitrise[t.id] = 0; });
  MP.EPREUVES.forEach(function (e) { if (e.mode === id) d.epreuves[e.id] = false; });
  MP.succesDe(id).forEach(function (x) { d.succes[x.id] = false; });
  MP.CLUB.forEach(function (r) { d.club[r.id] = 0; });
  return d;
};

MP.etatNeuf = function () {
  return {
    version: 1,
    boulesTechniques: true,    // sauvegarde faite depuis que les techniques demandent la bonne boule
    amelioRevues: true,        // … et depuis le nettoyage des compétences et améliorations
    aidesRevues: true,         // … et depuis les aides propres au pointage et au tir
    aidesTirRevues: true,      // … et depuis le retrait de la Ligne de mire et du Point d'impact
    metreRetire: true,         // … et depuis le Mètre du pointeur remplacé par la Dernière force
    vue: 'pointage',
    couleurs: { possedees: ['boule'], choisie: 'boule' },   // couleurs de boule (MP.COULEURS)
    stries: { possedees: ['boule'], choisie: 'boule' },     // stries de boule (MP.STRIES)
    gravure: { possedees: ['classique'], choisie: 'classique' },   // couleur de la gravure (MP.GRAVURES)
    police: { possedees: ['ronde'], choisie: 'ronde' },              // police de la gravure (MP.POLICES)
    pointage: MP.disciplineNeuve('pointage'),
    tir: MP.disciplineNeuve('tir'),
    // lot : 1, 10 ou 0 (Max) ; decalage (60 à 260 px) et angle (−80° à gauche … 0 au-dessus … 80° à
    // droite) : où se place la croix des lancers en l'air par rapport au doigt.
    reglages: { son: true, vibrations: true, lot: 1, decalage: 150, angle: 0 },
    initiales: '',             // gravées sur tes boules (3 lettres au plus)
    graveDemandee: false,      // la fenêtre « Grave ta boule » du début a été vue
    derniereVisite: 0          // pour les gains du club hors ligne
  };
};

// Complète une sauvegarde ancienne ou abîmée avec les valeurs par défaut.
MP.reparerEtat = function (brut) {
  var ancienne = !brut || brut.boulesTechniques !== true;
  var avantRevue = !!brut && brut.amelioRevues !== true;
  var avantAides = !!brut && brut.aidesRevues !== true;
  var avantAidesTir = !!brut && brut.aidesTirRevues !== true;
  var avantMetre = !!brut && brut.metreRetire !== true;
  var neuf = MP.etatNeuf();
  if (!brut || typeof brut !== 'object') return neuf;
  function fusion(cible, source) {
    Object.keys(cible).forEach(function (k) {
      if (!(k in source)) return;
      var v = source[k];
      if (cible[k] !== null && typeof cible[k] === 'object' && !Array.isArray(cible[k])) {
        if (v && typeof v === 'object') fusion(cible[k], v);
      } else if (Array.isArray(cible[k])) {
        if (Array.isArray(v)) cible[k] = v.slice();
      } else if (typeof v === typeof cible[k] || (cible[k] === null && (v === null || typeof v === 'number'))) {
        cible[k] = v;
      }
    });
  }
  fusion(neuf, brut);
  // La compétence « Zone de chute » n'existe plus (la zone est toujours affichée) : on la rembourse.
  MP.DISCIPLINES.forEach(function (D) {
    var ancien = brut[D.id];
    if (ancien && ancien.competences && ancien.competences.zoneChute >= 1) neuf[D.id].points += 30;
  });
  // Compétences et améliorations retirées : tous les niveaux achetés sont remboursés, une fois.
  if (avantRevue) MP.DISCIPLINES.forEach(function (D, iD) {
    var ancien = brut[D.id] || {}, rendu = 0;
    ['competences', 'ameliorations'].forEach(function (genre) {
      var achats = ancien[genre] || {};
      Object.keys(MP.RETIREES[genre]).forEach(function (id) {
        var n = Math.max(0, Math.min(200, Math.floor(Number(achats[id]) || 0))), prix = MP.RETIREES[genre][id][iD];
        for (var k = 0; k < n; k++) rendu += Math.ceil(prix * Math.pow(MP.HAUSSE, k));
      });
    });
    if (rendu > 0) { neuf[D.id].points += rendu; neuf.rembourse = (neuf.rembourse || 0) + rendu; }
  });
  // Aides retirées d'une seule discipline : remboursées une fois (elles n'y existent plus).
  [[avantAides, MP.AIDES_RETIREES], [avantAidesTir, MP.AIDES_RETIREES_2], [avantMetre, MP.AIDES_RETIREES_3]].forEach(function (lot) {
    if (lot[0]) MP.DISCIPLINES.forEach(function (D) {
      var achats = (brut[D.id] || {}).ameliorations || {}, rendu = 0;
      Object.keys(lot[1][D.id]).forEach(function (id) {
        var n = Math.max(0, Math.min(200, Math.floor(Number(achats[id]) || 0)));
        for (var k = 0; k < n; k++) rendu += Math.ceil(lot[1][D.id][id] * Math.pow(MP.HAUSSE, k));
      });
      if (rendu > 0) { neuf[D.id].points += rendu; neuf.rembourse = (neuf.rembourse || 0) + rendu; }
    });
  });
  if (neuf.vue !== 'pointage' && neuf.vue !== 'tir') neuf.vue = 'pointage';
  var co = neuf.couleurs;
  // Les couleurs Lavande (violette) et Ciel (bleu pastel) n'existent plus : réservées aux boules
  // adverses. Remboursées.
  ['lavande', 'bleuPastel'].forEach(function (id) {
    if (co.possedees.indexOf(id) >= 0) { neuf[neuf.vue === 'tir' ? 'tir' : 'pointage'].points += 400; neuf.rembourse = (neuf.rembourse || 0) + 400; }
  });
  co.possedees = co.possedees.filter(function (id, i, t) { return MP.trouver(MP.COULEURS, id) && t.indexOf(id) === i; });
  if (co.possedees.indexOf('boule') < 0) co.possedees.unshift('boule');
  if (co.possedees.indexOf(co.choisie) < 0) co.choisie = 'boule';
  var po = neuf.police;
  po.possedees = po.possedees.filter(function (id, i, t) { return MP.trouver(MP.POLICES, id) && t.indexOf(id) === i; });
  if (po.possedees.indexOf('ronde') < 0) po.possedees.unshift('ronde');
  if (po.possedees.indexOf(po.choisie) < 0) po.choisie = 'ronde';
  var gr = neuf.gravure;
  gr.possedees = gr.possedees.filter(function (id, i, t) { return MP.trouver(MP.GRAVURES, id) && t.indexOf(id) === i; });
  if (gr.possedees.indexOf('classique') < 0) gr.possedees.unshift('classique');
  if (gr.possedees.indexOf(gr.choisie) < 0) gr.choisie = 'classique';
  var st = neuf.stries;
  st.possedees = st.possedees.filter(function (id, i, t) { return MP.trouver(MP.STRIES, id) && t.indexOf(id) === i; });
  if (st.possedees.indexOf('boule') < 0) st.possedees.unshift('boule');
  if (st.possedees.indexOf(st.choisie) < 0) st.choisie = 'boule';
  if ([1, 10, 0].indexOf(neuf.reglages.lot) < 0) neuf.reglages.lot = 1;
  var rg = neuf.reglages, rgBrut = brut.reglages || {};
  rg.decalage = Math.max(60, Math.min(260, Math.round(Number(rg.decalage) || 150)));
  // Ancien réglage en trois positions : « en haut à gauche / à droite » devient un angle doux.
  if (rgBrut.angle == null && (rgBrut.cote === 'gauche' || rgBrut.cote === 'droite')) rg.angle = rgBrut.cote === 'gauche' ? -20 : 20;
  rg.angle = Math.max(-80, Math.min(80, Math.round(Number(rg.angle) || 0)));
  neuf.initiales = MP.initialesPropres(neuf.initiales);
  MP.DISCIPLINES.forEach(function (D) {
    var d = neuf[D.id];
    d.points = Math.max(0, Math.floor(Number(d.points) || 0));
    MP.ARBRES[D.id].forEach(function (c) {
      d.competences[c.id] = Math.min(c.max, Math.max(0, Math.floor(d.competences[c.id] || 0)));
    });
    MP.AMELIORATIONS[D.id].forEach(function (a) {
      d.ameliorations[a.id] = Math.min(a.max, Math.max(0, Math.floor(d.ameliorations[a.id] || 0)));
    });
    d.boules = d.boules.filter(function (id, i, t) {
      var b = MP.trouver(MP.BOULES, id);
      return b && b.pour.indexOf(D.id) >= 0 && t.indexOf(id) === i;
    });
    if (d.boules.indexOf('classique') < 0) d.boules.unshift('classique');
    if (d.boules.indexOf(d.equipee) < 0) d.equipee = 'classique';
    d.serie = Math.max(0, Math.floor(d.serie || 0));
    d.lances = Math.max(0, Math.floor(d.lances || 0));
    d.palier = Math.max(1, Math.floor(d.palier || 1));
    d.xp = Math.max(0, Math.min(MP.xpPourPalier(d.palier) - 1, Math.floor(d.xp || 0)));
    d.palierMaxSaison = Math.max(d.palier, Math.floor(d.palierMaxSaison || 1));
    d.palierRecord = Math.max(d.palierMaxSaison, Math.floor(d.palierRecord || 1));
    d.saison = Math.max(1, Math.floor(d.saison || 1));
    d.trophees = Math.max(0, Math.floor(d.trophees || 0));
    d.ligue = Math.max(0, Math.floor(d.ligue || 0));
    var ta = MP.trouver(MP.TECHNIQUES, d.techniqueAttente);
    d.techniqueAttente = ta && ta.mode === D.id && d.epreuves[ta.id] ? ta.id : null;
    Object.keys(d.maitrise).forEach(function (k) { d.maitrise[k] = Math.max(0, Math.floor(d.maitrise[k] || 0)); });
    Object.keys(d.club).forEach(function (k) { d.club[k] = Math.max(0, Math.floor(d.club[k] || 0)); });
    d.clubGagnes = Math.max(0, Number(d.clubGagnes) || 0);
    var pc = d.parcours;
    pc.numero = Math.max(1, Math.floor(Number(pc.numero) || 1));
    pc.lancer = Math.max(0, Math.min(MP.PARCOURS_LANCERS - 1, Math.floor(Number(pc.lancer) || 0)));
    pc.essais = Math.max(0, Math.floor(Number(pc.essais) || 0));
    pc.graine = Math.max(0, Math.floor(Number(pc.graine) || 0)) >>> 0;
    pc.reussis = Math.max(0, Math.floor(Number(pc.reussis) || 0));
    if (MP.TECHNIQUES_PARCOURS.indexOf(pc.technique) < 0) pc.technique = '';
    var mo = d.montagne, nE = MP.MONTAGNES[D.id].length;
    mo.etape = Math.max(0, Math.min(nE - 1, Math.floor(Number(mo.etape) || 0)));
    mo.boule = Math.max(0, Math.min(MP.MONTAGNE_BOULES - 1, Math.floor(Number(mo.boule) || 0)));
    mo.record = Math.max(mo.etape, Math.min(nE, Math.floor(Number(mo.record) || 0)));
    mo.sommets = Math.max(0, Math.floor(Number(mo.sommets) || 0));
    // Le tir simple en l'air est arrivé avant le tir devant : qui avait déjà le tir devant l'a aussi.
    if (D.id === 'tir' && (MP.niveau(d, 'tirDevant') >= 1 || d.epreuves.tirDevant)) d.competences.tirLeve = Math.max(1, d.competences.tirLeve || 0);
    // Anciennes sauvegardes : une technique déjà apprise compte comme une épreuve réussie.
    MP.EPREUVES.forEach(function (e) {
      if (e.mode === D.id && MP.niveau(d, e.id) >= 1) d.epreuves[e.id] = true;
      if (e.mode === D.id && d.epreuves[e.id] && MP.niveau(d, e.id) < 1) d.competences[e.id] = 1;
    });
    var ancien = brut[D.id] || {};
    d.piste = MP.reparerPiste(ancien.piste);
    if (!('technique' in ancien) && typeof ancien.techRoule === 'string') d.technique = ancien.techRoule;
    // Les techniques demandent maintenant une boule qui les permet : une ancienne sauvegarde reçoit,
    // pour chaque technique déjà apprise, la moins chère des boules qui la permettent (une seule fois).
    if (ancienne) MP.TECHNIQUES.forEach(function (tq) {
      if (tq.mode !== D.id || !MP.techniqueDisponible(d, tq.id) || MP.bouleCompatible(d, tq.id)) return;
      var offerte = MP.boulesPourTechnique(D.id, tq.id).filter(function (b) { return !b.ligue || b.ligue <= d.ligue; })[0];
      if (!offerte) return;
      d.boules.push(offerte.id);
      if (d.technique === tq.id) d.equipee = offerte.id;
    });
    var t = MP.trouver(MP.TECHNIQUES, d.technique);
    if (!t || t.mode !== D.id || !MP.techniqueJouable(d, d.technique)) d.technique = D.id === 'pointage' ? 'roulette' : 'tirSimple';
    // Réglages : seulement pour les boules possédées, dans la limite de leurs points.
    var reglages = {}, sauves = (ancien.reglagesBoules && typeof ancien.reglagesBoules === 'object') ? ancien.reglagesBoules : {};
    Object.keys(sauves).forEach(function (id) {
      var b = MP.trouver(MP.BOULES, id), r = sauves[id];
      if (!b || d.boules.indexOf(id) < 0 || !r || typeof r !== 'object') return;
      var propre = {}, reste = MP.pointsReglage(b);
      // L'ancienne « dureté » devient la tendreté (mêmes points).
      MP.REGLAGES.forEach(function (x) {
        var brutV = x.id === 'tendrete' && r.tendrete == null ? r.durete : r[x.id];
        var v = Math.max(0, Math.min(reste, Math.floor(Number(brutV) || 0))); propre[x.id] = v; reste -= v;
      });
      reglages[id] = propre;
    });
    d.reglagesBoules = reglages;
    if (!MP.effetDisponible(d, d.effet)) d.effet = 'neutre';
  });
  return neuf;
};

// Piste sauvegardée : gardée si elle est bien formée, sinon une neuve sera faite au prochain niveau.
MP.reparerPiste = function (p) {
  function nombre(v) { return typeof v === 'number' && isFinite(v); }
  if (!p || typeof p !== 'object' || !nombre(p.graine) || !nombre(p.terrain) || !MP.TERRAINS[p.terrain] || !Array.isArray(p.usure)) return null;
  return {
    graine: p.graine >>> 0, terrain: p.terrain | 0, palier: Math.max(1, nombre(p.palier) ? Math.floor(p.palier) : 1),
    ligue: Math.max(0, nombre(p.ligue) ? Math.floor(p.ligue) : 0), niveaux: Math.max(0, nombre(p.niveaux) ? Math.floor(p.niveaux) : 0),
    usure: p.usure.filter(function (u) { return u && nombre(u.x) && nombre(u.z) && nombre(u.r) && nombre(u.profondeur); }).slice(0, 40)
      .map(function (u) { return { x: u.x, z: u.z, r: Math.min(0.12, Math.max(0.02, u.r)), profondeur: Math.min(1, Math.max(0, u.profondeur)) }; }),
    portee: nombre(p.portee) ? Math.max(0, Math.min(20, p.portee)) : 0
  };
};

MP.charger = function () {
  try {
    var texte = window.localStorage.getItem(MP.CLE_SAUVEGARDE);
    if (texte) return MP.reparerEtat(JSON.parse(texte));
  } catch (e) { /* stockage indisponible : partie neuve */ }
  return MP.etatNeuf();
};

MP.sauver = function (etat) {
  try { window.localStorage.setItem(MP.CLE_SAUVEGARDE, JSON.stringify(etat)); return true; } catch (e) { return false; }
};

// ---------- Niveaux (d = progression d'une discipline) ----------

MP.niveau = function (d, idCompetence) { return d.competences[idCompetence] || 0; };
MP.niveauAm = function (d, idAmelioration) { return d.ameliorations[idAmelioration] || 0; };

MP.totalNiveaux = function (d) {
  var t = 0;
  Object.keys(d.competences).forEach(function (k) { t += d.competences[k]; });
  return t;
};

MP.niveauJoueur = function (d) {
  var t = MP.totalNiveaux(d);
  Object.keys(d.ameliorations).forEach(function (k) { t += d.ameliorations[k]; });
  return 1 + Math.floor(t / 5);
};

// Le lancer en l'air (doigt maintenu) est ouvert par la première technique en vol.
MP.volDebloque = function (d, mode) {
  return MP.TECHNIQUES.some(function (t) { return t.mode === mode && t.famille === 'vol' && MP.techniqueDisponible(d, t.id); });
};

// Une technique gagnée en épreuve ne se joue qu'à partir de la saison suivante (MP.validerEpreuve).
MP.techniqueDisponible = function (d, idTechnique) {
  var t = MP.trouver(MP.TECHNIQUES, idTechnique);
  return !!t && (!t.competence || MP.niveau(d, t.competence) >= 1) && d.techniqueAttente !== idTechnique;
};

MP.effetDisponible = function (d, idEffet) {
  var e = MP.trouver(MP.EFFETS, idEffet);
  return !!e && (!e.competence || MP.niveau(d, e.competence) >= 1);
};

// ---------- Prix ----------

// Chaque niveau coûte 15 % de plus que le précédent.
MP.HAUSSE = 1.15;

MP.prixCompetence = function (discipline, idCompetence, niveauActuel) {
  var c = MP.trouver(MP.ARBRES[discipline], idCompetence);
  return Math.ceil(c.prix * Math.pow(MP.HAUSSE, niveauActuel));
};

MP.prixAmelioration = function (discipline, idAmelioration, niveauActuel) {
  var a = MP.trouver(MP.AMELIORATIONS[discipline], idAmelioration);
  return Math.ceil(a.prix * Math.pow(MP.HAUSSE, niveauActuel));
};

MP.remiseAtelier = function (d) { return Math.min(20, MP.niveau(d, 'atelier')); };

MP.prixBoule = function (d, idBoule) {
  var b = MP.trouver(MP.BOULES, idBoule);
  return Math.round(b.prix * (100 - MP.remiseAtelier(d)) / 100);
};

// ---------- Achats ----------
// Chaque fonction « etat… » dit si l'achat est possible et pourquoi ; « acheter… » paie
// exactement le prix donné par la fonction de prix ci-dessus.

MP.etatCompetence = function (etat, discipline, idCompetence) {
  var d = etat[discipline];
  var c = MP.trouver(MP.ARBRES[discipline], idCompetence);
  var n = MP.niveau(d, idCompetence);
  if (n >= c.max) return { possible: false, raison: 'max', prix: null };
  var prix = MP.prixCompetence(discipline, idCompetence, n);
  var ep = MP.trouver(MP.EPREUVES, idCompetence);
  if (ep && ep.mode === discipline && !d.epreuves[ep.id]) {
    return { possible: false, raison: 'epreuve', prix: prix, texte: 'l’épreuve' };
  }
  if (c.requis && MP.niveau(d, c.requis[0]) < c.requis[1]) {
    var r = MP.trouver(MP.ARBRES[discipline], c.requis[0]);
    return { possible: false, raison: 'requis', prix: prix, texte: r.nom + ' N' + c.requis[1] };
  }
  if (d.points < prix) return { possible: false, raison: 'points', prix: prix };
  return { possible: true, prix: prix };
};

MP.acheterCompetence = function (etat, discipline, idCompetence) {
  var s = MP.etatCompetence(etat, discipline, idCompetence);
  if (!s.possible) return false;
  etat[discipline].points -= s.prix;
  etat[discipline].competences[idCompetence] += 1;
  return true;
};

MP.etatAmelioration = function (etat, discipline, idAmelioration) {
  var d = etat[discipline];
  var a = MP.trouver(MP.AMELIORATIONS[discipline], idAmelioration);
  var n = MP.niveauAm(d, idAmelioration);
  if (n >= a.max) return { possible: false, raison: 'max', prix: null };
  var prix = MP.prixAmelioration(discipline, idAmelioration, n);
  if (a.vol && !MP.volDebloque(d, discipline)) return { possible: false, raison: 'vol', prix: prix };
  if (d.points < prix) return { possible: false, raison: 'points', prix: prix };
  return { possible: true, prix: prix };
};

MP.acheterAmelioration = function (etat, discipline, idAmelioration) {
  var s = MP.etatAmelioration(etat, discipline, idAmelioration);
  if (!s.possible) return false;
  etat[discipline].points -= s.prix;
  etat[discipline].ameliorations[idAmelioration] += 1;
  return true;
};

MP.boulesDe = function (discipline) {
  return MP.BOULES.filter(function (b) { return b.pour.indexOf(discipline) >= 0; });
};

MP.etatBoule = function (etat, discipline, idBoule) {
  var d = etat[discipline];
  var b = MP.trouver(MP.BOULES, idBoule);
  if (!b || b.pour.indexOf(discipline) < 0) return { possible: false, raison: 'absente', prix: null };
  if (b.ligue && d.ligue < b.ligue && d.boules.indexOf(idBoule) < 0) return { possible: false, raison: 'ligue', prix: MP.prixBoule(d, idBoule), texte: MP.nomLigue(b.ligue) };
  if (b.sommet && d.boules.indexOf(idBoule) < 0) return { possible: false, raison: 'sommet', prix: null };
  if (d.equipee === idBoule) return { possible: false, raison: 'equipee', prix: null };
  if (d.boules.indexOf(idBoule) >= 0) return { possible: true, raison: 'equiper', prix: null };
  var prix = MP.prixBoule(d, idBoule);
  if (d.points < prix) return { possible: false, raison: 'points', prix: prix };
  return { possible: true, raison: 'acheter', prix: prix };
};

// Achète la boule si besoin, puis l'équipe.
MP.acheterOuEquiperBoule = function (etat, discipline, idBoule) {
  var s = MP.etatBoule(etat, discipline, idBoule);
  if (!s.possible) return false;
  var d = etat[discipline];
  if (s.raison === 'acheter') {
    d.points -= s.prix;
    d.boules.push(idBoule);
  }
  d.equipee = idBoule;
  // La nouvelle boule ne permet peut-être pas la technique choisie : on revient à celle de base.
  if (!MP.techniqueJouable(d, d.technique)) d.technique = discipline === 'pointage' ? 'roulette' : 'tirSimple';
  return true;
};

// ---------- Boules : techniques, terrains, réglage ----------

// La roulette et le tir roulé se jouent avec toutes les boules ; les autres techniques demandent
// une boule qui les permet.
MP.boulePermet = function (boule, idTechnique) {
  var t = MP.trouver(MP.TECHNIQUES, idTechnique);
  if (!t || !boule) return false;
  if (!t.competence || boule.techniques === '*') return true;
  return (boule.techniques || []).indexOf(idTechnique) >= 0;
};
MP.bouleEquipee = function (d) { return MP.trouver(MP.BOULES, d.equipee) || MP.BOULES[0]; };
// Technique jouable : apprise (épreuve réussie) et permise par la boule.
MP.techniqueJouable = function (d, idTechnique, boule) {
  return MP.techniqueDisponible(d, idTechnique) && MP.boulePermet(boule || MP.bouleEquipee(d), idTechnique);
};
// Une de tes boules qui permet la technique (l'équipée d'abord), ou null.
MP.bouleCompatible = function (d, idTechnique) {
  if (MP.boulePermet(MP.bouleEquipee(d), idTechnique)) return MP.bouleEquipee(d);
  for (var i = 0; i < d.boules.length; i++) {
    var b = MP.trouver(MP.BOULES, d.boules[i]);
    if (MP.boulePermet(b, idTechnique)) return b;
  }
  return null;
};
// Boules en vente (dans cette discipline) qui permettent la technique, de la moins chère à la plus chère.
// Boules à acheter qui permettent une technique (les boules d'élite ne se vendent pas).
MP.boulesPourTechnique = function (discipline, idTechnique) {
  return MP.boulesDe(discipline).filter(function (b) { return !b.sommet && MP.boulePermet(b, idTechnique); })
    .sort(function (a, b) { return a.prix - b.prix; });
};
// Difficulté d'une technique sur un terrain, avec ce que la boule en retire (MP.DIFFICULTE_TERRAIN).
MP.difficulteAvecBoule = function (idTerrain, idTechnique, boule) {
  var t = boule && boule.terrains, reste = t ? (t[idTerrain] != null ? t[idTerrain] : (t['*'] != null ? t['*'] : 1)) : 1;
  return 1 + (MP.difficulteTerrain(idTerrain, idTechnique) - 1) * reste;
};

// Réglage : des points à répartir entre poids, tendreté et adhérence (plus pour les meilleures boules).
// Chaque réglage se décrit pour le pointeur (desc) et pour le tireur (descTir), et change aussi les
// statistiques de la boule (stats : par point, pour chaque discipline ; voir MP.statsBoule).
// Comme en vrai : une boule tendre « colle » (reste en place après un choc, mord le sol en tombant),
// une boule dure rebondit et roule plus.
// Chaque point de réglage vaut autant, quel que soit le réglage : +2 sur une statistique (sur 100)
// pour −1 de puissance (la boule porte un peu moins loin). En interne : ×MP.ECHELLE_STATS (1,7).
MP.REGLAGES = [
  { id: 'poids', nom: 'Poids',
    desc: 'Moins déviée par le sol et moins chassée par les autres boules.',
    descTir: 'Moins déviée par le sol, et frappe plus fort.',
    stats: { pointage: { precision: 3.4, puissance: -1.7 }, tir: { precision: 3.4, puissance: -1.7 } } },
  { id: 'tendrete', nom: 'Tendreté',
    desc: 'Roule moins après sa chute et s’arrête net contre une boule.',
    descTir: 'Reste en place après la frappe (carreau) et rebondit moins.',
    stats: { pointage: { pointage: 3.4, puissance: -1.7 }, tir: { tir: 3.4, puissance: -1.7 } } },
  { id: 'adherence', nom: 'Adhérence',
    desc: 'Effets plus forts, et force plus facile à doser.',
    descTir: 'Effets plus forts, et tirs plus sûrs.',
    stats: { pointage: { controle: 3.4, puissance: -1.7 }, tir: { tir: 1.7, precision: 1.7, puissance: -1.7 } } }
];
MP.STATS_BOULE = ['precision', 'puissance', 'pointage', 'tir', 'controle'];
// Les statistiques s'affichent sur 100 : la meilleure boule du jeu (avec son réglage) y touche presque.
MP.ECHELLE_STATS = 1.7;
MP.surCent = function (v) { return Math.max(0, Math.min(100, Math.round(v / MP.ECHELLE_STATS))); };
// Statistiques d'une boule avec ton réglage (pour la discipline mode) : ce sont elles qui comptent en jeu.
MP.statsBoule = function (d, boule, mode) {
  var r = d && boule ? MP.reglageBoule(d, boule.id) : null, st = {};
  MP.STATS_BOULE.forEach(function (k) { st[k] = boule[k]; });
  if (r) MP.REGLAGES.forEach(function (x) {
    var par = x.stats[mode] || {};
    Object.keys(par).forEach(function (k) { st[k] += par[k] * r[x.id]; });
  });
  return st;
};
// Points de réglage selon la gamme de la boule : 2 pour la boule de départ, 3 jusqu'à 150 pts, 4 jusqu'à
// 1 000, 5 jusqu'à 10 000, 6 au-delà, et pour les boules de ligue et d'élite (les meilleures du jeu).
MP.pointsReglage = function (boule) {
  if (boule && (boule.ligue || boule.sommet)) return 6;
  var prix = (boule && boule.prix) || 0;
  return !prix ? 2 : (prix < 150 ? 3 : (prix < 1000 ? 4 : (prix < 10000 ? 5 : 6)));
};
MP.reglageBoule = function (d, idBoule) {
  var r = (d.reglagesBoules || {})[idBoule] || {};
  return { poids: r.poids || 0, tendrete: (r.tendrete != null ? r.tendrete : r.durete) || 0, adherence: r.adherence || 0 };
};
MP.reglerBoule = function (d, idBoule, stat, delta) {
  var b = MP.trouver(MP.BOULES, idBoule);
  if (!b || d.boules.indexOf(idBoule) < 0) return false;
  var r = MP.reglageBoule(d, idBoule);
  if (!(stat in r) || r[stat] + delta < 0) return false;
  if (r.poids + r.tendrete + r.adherence + delta > MP.pointsReglage(b)) return false;
  r[stat] += delta;
  d.reglagesBoules[idBoule] = r;
  return true;
};
// Ce que le réglage change physiquement à un lancer (la portée, elle, passe par la Puissance de
// MP.statsBoule) : poids (moins déviée, plus lourde), tendreté (garde moins de vitesse après un choc,
// mord le sol en tombant, rebondit moins), adhérence (effets plus forts, freine plus).
MP.effetsReglage = function (d, boule) {
  var r = d && boule ? MP.reglageBoule(d, boule.id) : { poids: 0, tendrete: 0, adherence: 0 };
  return { sol: 1 - 0.07 * r.poids, masse: 1 + 0.06 * r.poids,
    garde: 1 - 0.07 * r.tendrete, amorti: 1 - 0.035 * r.tendrete, rebond: 1 - 0.08 * r.tendrete,
    spin: 1 + 0.12 * r.adherence, frein: 1 + 0.04 * r.adherence };
};

// ---------- Gains ----------
// resultat : { mode, gagne, biberon, fourchette, reprise, carreau, libre }

// ---------- Paliers ----------
// Chaque victoire remplit la barre (plus vite sur les niveaux durs) ; barre pleine = palier suivant :
// niveaux un peu plus durs et ×1,15 Points. Trois défaites de suite font redescendre d'un palier.

MP.xpPourPalier = function (palier) { return 4 + 2 * palier; };

MP.multiplicateurSerie = function (serie) {
  if (serie >= 8) return 1.6;
  if (serie >= 5) return 1.3;
  if (serie >= 3) return 1.15;
  return 1;
};

function texteMult(m) { return '×' + String(Math.round(m * 100) / 100).replace('.', ','); }

// Calcule les Points d'une victoire : d'abord l'objectif principal (+1), la difficulté, les bonus
// du coup et le défi ; puis les multiplicateurs (biberon ou carreau ×2, niveau doré ×3, série,
// palier, trophées, Légende).
MP.calculerGain = function (d, resultat, serie) {
  var lignes = [];
  if (!resultat.gagne || resultat.libre) return { total: 0, lignes: lignes };
  function ajouter(libelle, valeur) { if (valeur > 0) lignes.push({ libelle: libelle, valeur: '+' + valeur }); return valeur; }
  var somme = 0;
  var etoiles = resultat.etoiles || 1;
  // L'objectif principal : battre la boule adverse (pointage) ou toucher la cible (tir).
  somme += ajouter(resultat.mode === 'pointage' ? 'Boule battue' : 'Cible touchée', 1);
  somme += ajouter('Niveau ' + '★'.repeat(etoiles), [0, 0, 1, 2, 3, 5][etoiles]);
  if (resultat.mode === 'pointage' && resultat.ecart != null) {
    somme += ajouter('Près du cochonnet', resultat.ecart <= 0.05 ? 3 : (resultat.ecart <= 0.12 ? 2 : (resultat.ecart <= 0.25 ? 1 : 0)));
  }
  if (resultat.mode === 'tir') {
    if (resultat.fourchette) somme += ajouter('Fourchette', 1);
    if (resultat.reprise) somme += ajouter('Je reprends le point', 1);
  }
  if (resultat.defi && resultat.defi.reussi) somme += ajouter('Défi réussi', resultat.defi.gain);
  var nSerie = MP.niveau(d, 'serie');
  if (serie >= 2 && nSerie > 0) somme += ajouter('Bonus de série', 1 + Math.floor(nSerie / 6));
  // Multiplicateurs, appliqués l'un après l'autre.
  var mult = [];
  if (resultat.mode === 'pointage' && resultat.biberon) mult.push(['Biberon', 2]);
  if (resultat.mode === 'tir' && resultat.carreau) mult.push(['Carreau', 2]);
  if (resultat.dore) mult.push(['Niveau doré', 3]);
  var ms = MP.multiplicateurSerie(serie);
  if (ms > 1) mult.push(['Série de ' + serie, ms]);
  MP.multiplicateursDurables(d).forEach(function (m) { mult.push(m); });
  var total = somme;
  mult.forEach(function (m) { total *= m[1]; lignes.push({ libelle: m[0], valeur: texteMult(m[1]), multiplicateur: true }); });
  return { total: Math.max(1, Math.floor(total)), lignes: lignes };
};

// Multiplicateurs qui valent pour tous les gains de la discipline (lancers et club) :
// palier, achats, trophées. Chacun : [libellé, valeur].
MP.multiplicateursDurables = function (d) {
  var m = [];
  if (d.palier > 1) m.push(['Palier ' + d.palier, Math.pow(1.15, d.palier - 1)]);
  var bE = MP.bouleEquipee(d);
  if (bE.bonusPoints) m.push([bE.nom, bE.bonusPoints]);
  var nBonus = MP.niveauAm(d, 'bonusPoints');
  if (nBonus > 0) m.push(['Bonus de points', 1 + 0.08 * nBonus]);
  if (d.trophees > 0) m.push(['Trophées (' + d.trophees + ')', 1 + 0.1 * d.trophees]);
  if (d.ligue > 0) m.push(['Ligue ' + MP.nomLigue(d.ligue), Math.pow(4, d.ligue)]);
  var nSucces = MP.nombreSucces(d);
  if (nSucces > 0) m.push(['Succès (' + nSucces + ')', 1 + MP.BONUS_SUCCES * nSucces]);
  return m;
};

// ---------- Succès ----------

MP.nombreSucces = function (d) {
  return Object.keys(d.succes).filter(function (k) { return d.succes[k]; }).length;
};

// Débloque les succès atteints ; renvoie les nouveaux.
MP.verifierSucces = function (etat, mode) {
  var d = etat[mode], nouveaux = [];
  MP.succesDe(mode).forEach(function (x) {
    if (!d.succes[x.id] && x.mesure(d) >= x.objectif) { d.succes[x.id] = true; nouveaux.push(x); }
  });
  return nouveaux;
};

MP.multiplicateurDurable = function (d) {
  return MP.multiplicateursDurables(d).reduce(function (t, m) { return t * m[1]; }, 1);
};

// Enregistre le résultat d'un lancer : série, Points, palier, records.
MP.enregistrerResultat = function (etat, resultat) {
  var d = etat[resultat.mode];
  if (resultat.libre) return { total: 0, lignes: [] };
  d.lances += 1;
  var avant = d.palier;
  if (resultat.gagne) {
    d.elan = (resultat.maintenant || Date.now()) + MP.ELAN * 1000;
    // Maîtrise : chaque victoire avec une technique rapproche de l'épreuve suivante.
    var ouvertes = MP.epreuvesOuvertes(d, resultat.mode).length;
    if (resultat.technique && resultat.technique in d.maitrise) d.maitrise[resultat.technique] += 1;
    d.serie += 1;
    d.defaitesSuite = 0;
    var gain = MP.calculerGain(d, resultat, d.serie);
    d.points += gain.total;
    d.gagnes += gain.total;
    d.gagnesSaison += gain.total;
    d.victoires += 1;
    d.meilleureSerie = Math.max(d.meilleureSerie, d.serie);
    d.meilleurNiveau = Math.max(d.meilleurNiveau, resultat.etoiles || 1);
    if (resultat.biberon) d.biberons += 1;
    if (resultat.carreau) d.carreaux += 1;
    if (resultat.fourchette) d.fourchettes += 1;
    if (resultat.reprise) d.reprises += 1;
    if (resultat.dore) d.dores += 1;
    if (resultat.defi && resultat.defi.reussi) d.defisReussis += 1;
    if ((resultat.etoiles || 1) >= 5) d.cinqEtoiles += 1;
    if (resultat.mode === 'pointage' && resultat.ecart != null) {
      d.meilleurPoint = d.meilleurPoint == null ? resultat.ecart : Math.min(d.meilleurPoint, resultat.ecart);
    }
    d.xp += (resultat.etoiles || 1) + (resultat.dore ? 2 : 0);
    while (d.xp >= MP.xpPourPalier(d.palier)) { d.xp -= MP.xpPourPalier(d.palier); d.palier += 1; }
    d.palierMaxSaison = Math.max(d.palierMaxSaison, d.palier);
    d.palierRecord = Math.max(d.palierRecord, d.palier);
    gain.palier = { avant: avant, apres: d.palier };
    // Une épreuve s'ouvre par la maîtrise ou par le palier 10 de la saison.
    if (MP.epreuvesOuvertes(d, resultat.mode).length > ouvertes) gain.epreuve = MP.epreuvesOuvertes(d, resultat.mode)[0];
    return gain;
  }
  d.serie = 0;
  d.defaites += 1;
  d.defaitesSuite += 1;
  d.xp = Math.max(0, d.xp - 1);
  if (d.defaitesSuite >= 3) {
    d.defaitesSuite = 0;
    if (d.palier > 1) { d.palier -= 1; d.xp = 0; }
  }
  return { total: 0, lignes: [], palier: { avant: avant, apres: d.palier } };
};

// Prochain achat le plus proche (compétence ou amélioration) : un objectif toujours en vue.
MP.prochainAchat = function (etat, discipline) {
  var d = etat[discipline], meilleur = null;
  MP.ARBRES[discipline].forEach(function (c) {
    var s = MP.etatCompetence(etat, discipline, c.id);
    if (s.prix != null && s.raison !== 'requis' && s.raison !== 'epreuve' && (!meilleur || s.prix < meilleur.prix)) {
      meilleur = { nom: c.nom + ' N' + (MP.niveau(d, c.id) + 1), prix: s.prix };
    }
  });
  MP.AMELIORATIONS[discipline].forEach(function (a) {
    var s = MP.etatAmelioration(etat, discipline, a.id);
    if (s.prix != null && s.raison !== 'vol' && (!meilleur || s.prix < meilleur.prix)) meilleur = { nom: a.nom + ' N' + (MP.niveauAm(d, a.id) + 1), prix: s.prix };
  });
  if (meilleur) meilleur.manque = Math.max(0, Math.ceil(meilleur.prix - d.points));
  return meilleur;
};

// ---------- Maîtrise et épreuves ----------

// Où en est la maîtrise qui ouvre une épreuve : victoires avec la technique d'avant.
MP.maitriseEpreuve = function (d, ep) {
  return { n: Math.min(ep.victoires, d.maitrise[ep.apres] || 0), besoin: ep.victoires,
    technique: MP.trouver(MP.TECHNIQUES, ep.apres) };
};

// Compétences encore à apprendre pour ouvrir une épreuve (ep.requis), en objets de l'arbre.
MP.requisEpreuve = function (d, ep) {
  return (ep.requis || []).filter(function (id) { return MP.niveau(d, id) < 1; }).map(function (id) { return MP.trouver(MP.ARBRES[ep.mode], id); });
};
// Épreuves qu'on peut tenter : maîtrise atteinte, compétences demandées apprises, pas encore réussie ;
// pour une technique, il faut aussi le palier 10 dans la saison en cours, et aucune technique en attente
// de la saison suivante.
MP.palierEpreuve = function (d, ep) { return !MP.trouver(MP.TECHNIQUES, ep.id) || d.palierMaxSaison >= MP.PALIER_SAISON; };
MP.epreuvesOuvertes = function (d, mode) {
  return MP.EPREUVES.filter(function (e) {
    return e.mode === mode && !d.epreuves[e.id] && MP.techniqueDisponible(d, e.apres) && (d.maitrise[e.apres] || 0) >= e.victoires && MP.requisEpreuve(d, e).length === 0
      && MP.palierEpreuve(d, e) && !(d.techniqueAttente && MP.trouver(MP.TECHNIQUES, e.id));
  });
};

// Épreuve réussie : la compétence passe au niveau 1. Une nouvelle technique attend la prochaine saison
// (palier 1, compétences et améliorations à zéro) pour se jouer ; on la choisit alors soi-même.
MP.validerEpreuve = function (etat, mode, id) {
  var d = etat[mode], ep = MP.trouver(MP.EPREUVES, id);
  if (!ep || ep.mode !== mode) return false;
  d.epreuves[id] = true;
  d.competences[id] = Math.max(1, d.competences[id] || 0);
  if (MP.trouver(MP.TECHNIQUES, id)) d.techniqueAttente = id;
  return true;
};

// ---------- Club ----------
// Les coéquipiers jouent tout seuls ; après chacune de tes victoires, l'élan double leur
// production pendant 30 s. Appli fermée, ils continuent à mi-régime, jusqu'à 8 h.

MP.ELAN = 30;
MP.HORS_LIGNE = { max: 8 * 3600, part: 0.5 };

MP.nomRecrue = function (r, discipline) { return r.noms[discipline]; };

MP.prixRecrue = function (idRecrue, deja) {
  return Math.ceil(MP.trouver(MP.CLUB, idRecrue).prix * Math.pow(MP.HAUSSE, deja));
};

MP.etatRecrue = function (etat, discipline, idRecrue) {
  var d = etat[discipline], r = MP.trouver(MP.CLUB, idRecrue), i = MP.CLUB.indexOf(r);
  var prix = MP.prixRecrue(idRecrue, d.club[idRecrue] || 0);
  if (i > 0 && !d.club[MP.CLUB[i - 1].id]) {
    return { possible: false, raison: 'requis', prix: prix, texte: MP.nomRecrue(MP.CLUB[i - 1], discipline) };
  }
  if (d.points < prix) return { possible: false, raison: 'points', prix: prix };
  return { possible: true, prix: prix };
};

MP.acheterRecrue = function (etat, discipline, idRecrue) {
  var s = MP.etatRecrue(etat, discipline, idRecrue);
  if (!s.possible) return false;
  etat[discipline].points -= s.prix;
  etat[discipline].club[idRecrue] += 1;
  return true;
};

// Doublements atteints par un rang (10, 25, 50… recrues).
MP.doublementsRecrue = function (n) { return MP.PALIERS_CLUB.filter(function (p) { return n >= p; }).length; };

// Force d'un rang, et du club entier.
MP.forceRecrue = function (d, idRecrue) {
  var r = MP.trouver(MP.CLUB, idRecrue), n = d.club[idRecrue] || 0;
  return n * r.force * Math.pow(2, MP.doublementsRecrue(n));
};
MP.forceClub = function (d) {
  return MP.CLUB.reduce(function (t, r) { return t + MP.forceRecrue(d, r.id); }, 0);
};

// Parties gagnées par minute : de plus en plus près du maximum, sans jamais le dépasser.
MP.partiesClub = function (d) {
  var f = MP.forceClub(d);
  return MP.CLUB_MAX * f / (f + MP.CLUB_DEMI);
};

// Points par seconde du club (élan compris si « maintenant » est dans l'élan).
MP.productionClub = function (d, maintenant, horsLigne) {
  var v = MP.partiesClub(d);
  if (!v) return 0;
  v = v / 60 * MP.VALEUR_CLUB * MP.multiplicateurDurable(d);
  if (horsLigne) v *= MP.HORS_LIGNE.part;
  else if (maintenant < d.elan) v *= 2;
  return v;
};

// Fait jouer le club « secondes » secondes ; renvoie les Points gagnés par discipline.
MP.produireClub = function (etat, secondes, maintenant, horsLigne) {
  var gains = {};
  MP.DISCIPLINES.forEach(function (D) {
    var d = etat[D.id], g = MP.productionClub(d, maintenant, horsLigne) * secondes;
    if (g > 0) { d.points += g; d.gagnes += g; d.gagnesSaison += g; d.clubGagnes += g; }
    gains[D.id] = g;
  });
  return gains;
};

// Gains de l'absence : à mi-régime, 8 h au plus. Renvoie { secondes, pointage, tir }.
MP.gainsAbsence = function (etat, maintenant) {
  var depuis = etat.derniereVisite ? (maintenant - etat.derniereVisite) / 1000 : 0;
  etat.derniereVisite = maintenant;
  if (depuis < 60) return null;
  var secondes = Math.min(MP.HORS_LIGNE.max, depuis);
  var g = MP.produireClub(etat, secondes, maintenant, true);
  return { secondes: secondes, pointage: g.pointage, tir: g.tir };
};

// ---------- Mode libre ----------
// Niveau mixte gagné : chaque discipline reçoit la moitié de ce qu'elle aurait gagné, sans palier ni série.
MP.enregistrerMixte = function (etat, res) {
  var parts = {}, total = 0;
  MP.DISCIPLINES.forEach(function (D) {
    var d = etat[D.id];
    var g = res.gagne ? Math.max(1, Math.floor(MP.calculerGain(d, res, 0).total / 2)) : 0;
    d.points += g; d.gagnes += g; d.gagnesSaison = (d.gagnesSaison || 0) + g;
    parts[D.id] = g; total += g;
  });
  return { total: total, parts: parts };
};

// ---------- Parcours ----------
// Un lancer imposé : réussi, il rapporte à peu près autant qu'un niveau gagné (un peu plus du premier
// coup, un bonus en fin de parcours) et on passe au suivant ; raté, on le rejoue. Ni palier ni série :
// le parcours avance à part.
MP.enregistrerParcours = function (etat, res) {
  var d = etat.pointage, P = d.parcours, lignes = [], somme = 0;
  d.lances += 1;
  if (!res.parcours || !res.parcours.reussi) { P.essais += 1; return { total: 0, lignes: lignes, reussi: false }; }
  function ajouter(libelle, valeur) { if (valeur > 0) { lignes.push({ libelle: libelle, valeur: '+' + valeur }); somme += valeur; } }
  var fini = P.lancer + 1 >= MP.PARCOURS_LANCERS;
  ajouter('Lancer ' + (P.lancer + 1) + '/' + MP.PARCOURS_LANCERS, 1);
  if (P.essais === 0) ajouter('Du premier coup', 1);
  if (res.ecart != null) ajouter('Près du cochonnet', res.ecart <= 0.05 ? 3 : (res.ecart <= 0.12 ? 2 : (res.ecart <= 0.25 ? 1 : 0)));
  if (fini) ajouter('Parcours terminé', 3 + Math.floor(P.numero / 2));
  var mult = res.biberon ? [['Biberon', 2]] : [];
  MP.multiplicateursDurables(d).forEach(function (m) { mult.push(m); });
  var total = somme;
  mult.forEach(function (m) { total *= m[1]; lignes.push({ libelle: m[0], valeur: texteMult(m[1]), multiplicateur: true }); });
  total = Math.max(1, Math.floor(total));
  d.points += total; d.gagnes += total; d.gagnesSaison += total;
  if (res.biberon) d.biberons += 1;
  if (res.ecart != null) d.meilleurPoint = d.meilleurPoint == null ? res.ecart : Math.min(d.meilleurPoint, res.ecart);
  var g = { total: total, lignes: lignes, reussi: true, fini: fini, numero: P.numero, essais: P.essais + 1 };
  if (fini) { P.numero += 1; P.lancer = 0; P.reussis += 1; P.graine = 0; } else P.lancer += 1;
  P.essais = 0; P.technique = '';
  return g;
};

// ---------- Montagne ----------
// Ouverte quand toutes les épreuves de la discipline sont réussies et qu'on a, pour chaque technique,
// une boule qui la permet.
MP.montagneOuverte = function (d, mode) {
  // Toutes les épreuves de la discipline réussies (qui avait déjà commencé à grimper avant une
  // nouvelle épreuve garde sa Montagne).
  var deja = d.montagne && (d.montagne.record > 0 || d.montagne.sommets > 0);
  return (deja || MP.EPREUVES.every(function (e) { return e.mode !== mode || d.epreuves[e.id]; })) &&
    MP.MONTAGNES[mode].every(function (et) { return !!MP.bouleMontagne(d, et.technique, et.terrain); });
};
// La boule jouée à une étape : parmi tes boules qui permettent la technique imposée, la plus précise
// sur le terrain de l'étape (MP.precision, à 7 m) ; à égalité, l'équipée.
MP.bouleMontagne = function (d, idTechnique, idTerrain) {
  var mode = MP.trouver(MP.TECHNIQUES, idTechnique).mode, equipee = MP.bouleEquipee(d), meilleure = null, note = -Infinity;
  function valeur(b) { var p = MP.precision(d, b, idTechnique, mode, 7, idTerrain); return -(p.direction / 0.032 + p.force / 0.038); }
  if (MP.boulePermet(equipee, idTechnique)) { meilleure = equipee; note = valeur(equipee); }
  d.boules.forEach(function (id) {
    var b = MP.trouver(MP.BOULES, id);
    if (b && MP.boulePermet(b, idTechnique) && valeur(b) > note + 1e-9) { meilleure = b; note = valeur(b); }
  });
  return meilleure;
};
// Une boule lancée à une étape : dans la zone (ou sur la cible), on monte ; les 3 ratées, on redescend
// tout en bas. Chaque étape réussie rapporte comme un niveau gagné ; le sommet donne la boule d'élite
// (la première fois) et une couleur ; l'étape 6 atteinte, une couleur aussi.
MP.enregistrerMontagne = function (etat, mode, res) {
  var d = etat[mode], M = d.montagne, k = M.etape, nE = MP.MONTAGNES[mode].length, lignes = [], somme = 0;
  var g = { reussi: false, chute: false, sommet: false, total: 0, lignes: lignes, etape: k, cadeaux: [] };
  d.lances += 1;
  if (!res.montagne || !res.montagne.reussi) {
    M.boule += 1;
    g.boulesRestantes = MP.MONTAGNE_BOULES - M.boule;
    if (M.boule >= MP.MONTAGNE_BOULES) { g.chute = true; M.etape = 0; M.boule = 0; }
    return g;
  }
  function ajouter(libelle, valeur) { lignes.push({ libelle: libelle, valeur: '+' + valeur }); somme += valeur; }
  ajouter('Étape ' + (k + 1) + '/' + nE, 1 + Math.floor(k / 2));
  if (M.boule === 0) ajouter('Première boule', 1);
  if (k === nE - 1) ajouter('Sommet', 10);
  var mult = res.biberon ? [['Biberon', 2]] : (res.carreau ? [['Carreau', 2]] : []);
  MP.multiplicateursDurables(d).forEach(function (m) { mult.push(m); });
  var total = somme;
  mult.forEach(function (m) { total *= m[1]; lignes.push({ libelle: m[0], valeur: texteMult(m[1]), multiplicateur: true }); });
  g.total = Math.max(1, Math.floor(total));
  d.points += g.total; d.gagnes += g.total; d.gagnesSaison += g.total;
  if (res.biberon) d.biberons += 1;
  if (res.carreau) d.carreaux += 1;
  g.reussi = true;
  g.boule = M.boule + 1;
  M.etape += 1; M.boule = 0; M.record = Math.max(M.record, M.etape);
  function offrirCouleur(id) {
    if (etat.couleurs.possedees.indexOf(id) < 0) { etat.couleurs.possedees.push(id); g.cadeaux.push({ couleur: id }); }
  }
  if (M.etape >= 6) offrirCouleur('nacre');
  if (M.etape >= nE) {
    g.sommet = true; M.sommets += 1; M.etape = 0;
    var elite = MP.BOULES.filter(function (b) { return b.sommet === mode; })[0];
    if (d.boules.indexOf(elite.id) < 0) { d.boules.push(elite.id); g.cadeaux.push({ boule: elite.id }); }
    offrirCouleur(mode === 'pointage' ? 'edelweiss' : 'glacier');
  }
  return g;
};

// ---------- Conseil après plusieurs échecs ----------
// Ce qui fait rater (diagnostic des derniers lancers) → les achats qui aident le plus, dans l'ordre.
// Chaque piste : [genre, id] ; « tech » : la compétence de la technique jouée (Demi-portée…).
MP.CONSEILS = {
  force: { texte: 'tes boules finissent trop longues ou trop courtes',
    pointage: [['competence', 'dosage'], ['amelioration', 'derniereForce'], ['amelioration', 'lecturePuissance'], ['competence', 'tech'], ['amelioration', 'donnee']],
    tir: [['competence', 'oeil'], ['competence', 'dosage'], ['competence', 'tech'], ['amelioration', 'lecturePuissance']] },
  direction: { texte: 'tes boules partent trop à gauche ou à droite',
    pointage: [['competence', 'stabilite'], ['amelioration', 'guide'], ['competence', 'tech'], ['amelioration', 'arcVol']],
    tir: [['competence', 'stabilite'], ['competence', 'tech'], ['amelioration', 'guide']] },
  portee: { texte: 'le but est au bout de ta portée',
    pointage: [['competence', 'puissance']], tir: [['competence', 'puissance']] },
  relief: { texte: 'le relief dévie tes boules',
    pointage: [['competence', 'lectureSol'], ['amelioration', 'donnee'], ['competence', 'stabilite']],
    tir: [['competence', 'lectureSol'], ['competence', 'stabilite']] },
  vent: { texte: 'le vent dévie tes boules en l’air', astuce: 'Vise à côté, du côté d’où vient le vent (regarde la manche à air), ou lance plus bas.',
    pointage: [['amelioration', 'arcVol'], ['competence', 'stabilite']], tir: [['amelioration', 'arcVol'], ['competence', 'stabilite']] },
  terrain: { texte: 'cette technique est très imprécise sur ce terrain', astuce: 'Change de technique, ou prends une boule faite pour ce terrain (onglet Boules).',
    pointage: [], tir: [] },
  frappe: { texte: 'tu touches la cible, mais elle bouge à peine',
    pointage: [], tir: [['competence', 'frappe'], ['competence', 'tech']] },
  devant: { texte: 'tu touches une autre boule avant la cible', astuce: 'Un tir en l’air (tir devant, tir au fer) passe par-dessus les boules devant.',
    pointage: [], tir: [['amelioration', 'passage'], ['competence', 'oeil'], ['competence', 'tech']] },
  carreau: { texte: 'tu touches, mais ta boule ne reste pas en place',
    pointage: [], tir: [['competence', 'carreau'], ['competence', 'frappe']] }
};
// Le conseil : { texte, ecran, bouton } — l'achat le plus utile pas encore au maximum, avec son prix.
MP.conseilAmelioration = function (etat, mode, genre, idTechnique) {
  var C = MP.CONSEILS[genre];
  if (!C) return null;
  var d = etat[mode], T = idTechnique && MP.trouver(MP.TECHNIQUES, idTechnique);
  var pistes = C[mode] || [];
  for (var i = 0; i < pistes.length; i++) {
    var genreAchat = pistes[i][0], id = pistes[i][1] === 'tech' ? (T && T.competence) : pistes[i][1];
    if (!id) continue;
    var liste = genreAchat === 'competence' ? MP.ARBRES[mode] : MP.AMELIORATIONS[mode], x = MP.trouver(liste, id);
    if (!x) continue;
    var s = genreAchat === 'competence' ? MP.etatCompetence(etat, mode, id) : MP.etatAmelioration(etat, mode, id);
    if (s.prix == null || s.raison === 'requis' || s.raison === 'epreuve' || s.raison === 'vol') continue;
    if (x.vol && T && T.famille !== 'vol') continue;   // aide des lancers en l'air : inutile ici
    var n = genreAchat === 'competence' ? MP.niveau(d, id) : MP.niveauAm(d, id);
    var manque = Math.max(0, s.prix - d.points);
    return {
      texte: 'Conseil : ' + C.texte + '. « ' + x.nom + ' » (niveau ' + (n + 1) + ', ' + MP.formatPoints(s.prix) + ' pts) t’aiderait' +
        (manque ? ' : encore ' + MP.formatPoints(manque) + ' pts.' : ' : tu peux l’acheter maintenant.') + (C.astuce ? ' ' + C.astuce : ''),
      ecran: genreAchat === 'competence' ? 'competences' : 'boutique',
      bouton: genreAchat === 'competence' ? 'Voir les compétences' : 'Voir les améliorations',
      achat: { genre: genreAchat, id: id }
    };
  }
  return { texte: 'Conseil : ' + C.texte + '.' + (C.astuce ? ' ' + C.astuce : ''), ecran: genre === 'terrain' ? 'boules' : null, bouton: genre === 'terrain' ? 'Voir les boules' : null };
};

// Où se place la croix des lancers en l'air par rapport au doigt (en pixels d'écran).
MP.decalageCroix = function (reglages) {
  var l = reglages.decalage || 150, a = (reglages.angle || 0) * Math.PI / 180;
  return { x: Math.sin(a) * l, y: -Math.cos(a) * l };
};

// ---------- Couleurs et initiales des boules ----------
// Initiales gravées : 3 lettres ou chiffres au plus, en majuscules.
MP.initialesPropres = function (t) {
  return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 3);
};
MP.etatCouleur = function (etat, mode, id) {
  var c = MP.trouver(MP.COULEURS, id), co = etat.couleurs;
  if (!c) return { possible: false, raison: 'absente' };
  if (co.choisie === id) return { possible: false, raison: 'choisie' };
  if (co.possedees.indexOf(id) >= 0) return { possible: true, raison: 'choisir' };
  if (c.gagnee) return { possible: false, raison: 'gagnee', texte: c.gagnee };
  if (etat[mode].points < c.prix) return { possible: false, raison: 'points', prix: c.prix };
  return { possible: true, raison: 'acheter', prix: c.prix };
};
MP.acheterOuChoisirCouleur = function (etat, mode, id) {
  var s = MP.etatCouleur(etat, mode, id);
  if (!s.possible) return false;
  if (s.raison === 'acheter') { etat[mode].points -= s.prix; etat.couleurs.possedees.push(id); }
  etat.couleurs.choisie = id;
  return true;
};
// Stries : à acheter (avec les Points de la discipline affichée) ou à choisir, comme les couleurs.
MP.etatStrie = function (etat, mode, id) {
  var c = MP.trouver(MP.STRIES, id), st = etat.stries;
  if (!c) return { possible: false, raison: 'absente' };
  if (st.choisie === id) return { possible: false, raison: 'choisie' };
  if (st.possedees.indexOf(id) >= 0) return { possible: true, raison: 'choisir' };
  if (etat[mode].points < c.prix) return { possible: false, raison: 'points', prix: c.prix };
  return { possible: true, raison: 'acheter', prix: c.prix };
};
MP.acheterOuChoisirStrie = function (etat, mode, id) {
  var s = MP.etatStrie(etat, mode, id);
  if (!s.possible) return false;
  if (s.raison === 'acheter') { etat[mode].points -= s.prix; etat.stries.possedees.push(id); }
  etat.stries.choisie = id;
  return true;
};
// Couleur de la gravure : à acheter ou à choisir, comme les stries.
MP.etatGravure = function (etat, mode, id) {
  var c = MP.trouver(MP.GRAVURES, id), g = etat.gravure;
  if (!c) return { possible: false, raison: 'absente' };
  if (g.choisie === id) return { possible: false, raison: 'choisie' };
  if (g.possedees.indexOf(id) >= 0) return { possible: true, raison: 'choisir' };
  if (etat[mode].points < c.prix) return { possible: false, raison: 'points', prix: c.prix };
  return { possible: true, raison: 'acheter', prix: c.prix };
};
MP.acheterOuChoisirGravure = function (etat, mode, id) {
  var s = MP.etatGravure(etat, mode, id);
  if (!s.possible) return false;
  if (s.raison === 'acheter') { etat[mode].points -= s.prix; etat.gravure.possedees.push(id); }
  etat.gravure.choisie = id;
  return true;
};
// Police de la gravure : à acheter ou à choisir.
MP.etatPolice = function (etat, mode, id) {
  var c = MP.trouver(MP.POLICES, id), g = etat.police;
  if (!c) return { possible: false, raison: 'absente' };
  if (g.choisie === id) return { possible: false, raison: 'choisie' };
  if (g.possedees.indexOf(id) >= 0) return { possible: true, raison: 'choisir' };
  if (etat[mode].points < c.prix) return { possible: false, raison: 'points', prix: c.prix };
  return { possible: true, raison: 'acheter', prix: c.prix };
};
MP.acheterOuChoisirPolice = function (etat, mode, id) {
  var s = MP.etatPolice(etat, mode, id);
  if (!s.possible) return false;
  if (s.raison === 'acheter') { etat[mode].points -= s.prix; etat.police.possedees.push(id); }
  etat.police.choisie = id;
  return true;
};
MP.policeGravure = function () {
  var g = MP.etat && MP.etat.police;
  return MP.trouver(MP.POLICES, g ? g.choisie : 'ronde') || MP.POLICES[0];
};
// Encre de la gravure choisie (null : la gravure d'origine).
MP.encreGravure = function () {
  var g = MP.etat && MP.etat.gravure, c = g ? MP.trouver(MP.GRAVURES, g.choisie) : null;
  return c ? c.encre : null;
};
// Stries de dessin de ta boule : celles choisies, sinon celles du modèle de boule (un nombre).
MP.striesJoueur = function (boule) {
  var st = MP.etat && MP.etat.stries, c = st && st.choisie !== 'boule' ? MP.trouver(MP.STRIES, st.choisie) : null;
  return c || (boule ? boule.stries : 2);
};
// Teinte de dessin de ta boule : la couleur choisie, sinon celle de la boule.
MP.teinteJoueur = function (boule) {
  var co = MP.etat && MP.etat.couleurs;
  return co && co.choisie && co.choisie !== 'boule' ? co.choisie : (boule ? boule.teinte : 'acier');
};

// Après 10 essais ratés sur le même lancer, on peut en tirer un autre (même place dans le parcours).
MP.ESSAIS_CHANGER_LANCER = 10;
MP.changerLancerParcours = function (etat) {
  var P = etat.pointage.parcours;
  if (P.essais < MP.ESSAIS_CHANGER_LANCER) return false;
  P.graine = (Math.imul(P.graine || 1, 1664525) + 1013904223) >>> 0 || 1;
  P.technique = ''; P.essais = 0;
  return true;
};

// ---------- Prochaine étape ----------
// Ce que le joueur a de mieux à faire maintenant, en une phrase (écran Jouer et après chaque lancer).
// ecran : l'onglet où cela se passe, s'il y en a un.

// « la rafle », « le tir au fer » : les techniques au masculin commencent par « Tir » ou « Carreau ».
MP.articleTechnique = function (nom, de) {
  if (/^Diriger/.test(nom)) return '« ' + nom + ' »';
  var masculin = /^(Tir|Carreau)/.test(nom), n = nom.charAt(0).toLowerCase() + nom.slice(1);
  return de ? (masculin ? 'du ' : 'de la ') + n : (masculin ? 'le ' : 'la ') + n;
};
MP.prochaineEtape = function (etat, mode) {
  var d = etat[mode];
  function nomComp(id) { return MP.trouver(MP.ARBRES[mode], id).nom; }
  function boulePour(idTech) { return MP.boulesPourTechnique(mode, idTech).filter(function (b) { return !b.ligue || b.ligue <= d.ligue; })[0]; }
  // 1. Une épreuve à relever (avec la boule qu'il faut).
  var ouverte = MP.epreuvesOuvertes(d, mode)[0];
  if (ouverte) {
    var nom = nomComp(ouverte.id);
    if (!MP.bouleCompatible(d, ouverte.technique)) {
      var b = boulePour(ouverte.technique);
      return { texte: 'Achète la boule ' + b.nom + ' (' + MP.formatPoints(MP.prixBoule(d, b.id)) + ' pts) : elle permet ' + MP.articleTechnique(MP.trouver(MP.TECHNIQUES, ouverte.technique).nom) + ', il te la faut pour l’épreuve.', ecran: 'boules', bouton: 'Voir les boules' };
    }
    return { texte: 'Relève l’épreuve ' + MP.articleTechnique(nom, true) + ' : réussie, elle te débloque ' + MP.articleTechnique(nom) + ' pour toujours.', ecran: 'jouer' };
  }
  // 2. Une technique gagnée en épreuve attend la nouvelle saison.
  if (d.techniqueAttente) {
    return { texte: MP.trouver(MP.TECHNIQUES, d.techniqueAttente).nom + ' est gagnée : commence une nouvelle saison pour la jouer (palier 1, compétences et améliorations à zéro, trophées en plus).', ecran: 'jouer' };
  }
  // 2 bis. Une technique apprise sans boule pour la jouer.
  var sansBoule = MP.TECHNIQUES.filter(function (t) { return t.mode === mode && MP.techniqueDisponible(d, t.id) && !MP.bouleCompatible(d, t.id); })[0];
  if (sansBoule) {
    var b2 = boulePour(sansBoule.id);
    if (b2) return { texte: 'Tu as appris ' + MP.articleTechnique(sansBoule.nom) + ' : achète une boule qui la permet, par exemple ' + b2.nom + ' (' + MP.formatPoints(MP.prixBoule(d, b2.id)) + ' pts).', ecran: 'boules', bouton: 'Voir les boules' };
  }
  // 3. La prochaine épreuve : gagner des niveaux avec la technique d'avant.
  var suivante = MP.EPREUVES.filter(function (e) { return e.mode === mode && !d.epreuves[e.id] && MP.techniqueDisponible(d, e.apres); })[0];
  function mt0(e) { return (d.maitrise[e.apres] || 0) >= e.victoires && MP.requisEpreuve(d, e).length === 0; }
  if (suivante && MP.requisEpreuve(d, suivante).length && (d.maitrise[suivante.apres] || 0) >= suivante.victoires) {
    return { texte: 'Pour ouvrir l’épreuve ' + MP.articleTechnique(nomComp(suivante.id), true) + ', apprends aussi : ' +
      MP.requisEpreuve(d, suivante).map(function (c) { return c.nom; }).join(', ') + ' (Compétences).', ecran: 'competences', bouton: 'Voir les compétences' };
  }
  if (suivante && mt0(suivante) && !MP.palierEpreuve(d, suivante)) {
    return { texte: 'Atteins le palier ' + MP.PALIER_SAISON + ' dans cette saison pour ouvrir l’épreuve ' + MP.articleTechnique(nomComp(suivante.id), true) + ' (meilleur palier de la saison : ' + d.palierMaxSaison + ').' };
  }
  if (suivante) {
    var mt = MP.maitriseEpreuve(d, suivante), reste = mt.besoin - mt.n;
    var conseil = MP.techniqueJouable(d, suivante.apres) ? '' : ' (équipe une boule qui la permet)';
    return { texte: 'Gagne encore ' + reste + ' niveau' + (reste > 1 ? 'x' : '') + ' en ' + mt.technique.nom.toLowerCase() + conseil + ' pour ouvrir l’épreuve ' + MP.articleTechnique(nomComp(suivante.id), true) + '.' };
  }
  // 4. La Montagne, tant que sa boule d'élite n'est pas gagnée.
  var elite = MP.BOULES.filter(function (b) { return b.sommet === mode; })[0];
  if (elite && d.boules.indexOf(elite.id) < 0 && MP.montagneOuverte(d, mode)) {
    return { texte: 'Grimpe la Montagne du ' + (mode === 'pointage' ? 'pointage' : 'tir') + ' : au sommet, la boule ' + elite.nom + ' (toutes les techniques, Points ×2).', ecran: 'jouer' };
  }
  // 5. Saison, ligue.
  if (MP.liguePossible(d)) return { texte: 'Tu peux monter en ligue ' + MP.nomLigue(d.ligue + 1) + ' : tous tes gains ×4 pour toujours.', ecran: 'jouer' };
  if (MP.saisonPossible(d)) return { texte: 'Tu peux commencer une nouvelle saison et gagner des trophées (+10 % de Points chacun).', ecran: 'jouer' };
  // 6. Un achat utile.
  var achat = MP.prochainAchat(etat, mode);
  if (achat) return { texte: achat.manque ? 'Prochain achat : ' + achat.nom + ', encore ' + MP.formatPoints(achat.manque) + ' pts.' : 'Tu peux acheter ' + achat.nom + '.', achat: true };
  return { texte: 'Monte de palier : niveaux plus durs et +15 % de Points.' };
};

// ---------- Nouvelle saison ----------

MP.PALIER_SAISON = 10;

MP.saisonPossible = function (d) { return d.palierMaxSaison >= MP.PALIER_SAISON; };

// Trophées d'une saison : racine cubique des Points gagnés (les grands nombres restent raisonnables),
// plus un trophée tous les 2 paliers au-delà du 10e : bien jouer compte autant qu'accumuler.
MP.tropheesGagnes = function (d) {
  return Math.max(1, Math.floor(Math.cbrt(d.gagnesSaison / 1000)) + Math.floor(Math.max(0, d.palierMaxSaison - MP.PALIER_SAISON) / 2));
};

// Recommence la discipline : Points, compétences, améliorations et palier à zéro ;
// les boules achetées (et leur réglage), les statistiques et les trophées restent.
MP.nouvelleSaison = function (etat, discipline) {
  var d = etat[discipline];
  if (!MP.saisonPossible(d)) return 0;
  var gagnes = MP.tropheesGagnes(d);
  var neuve = MP.disciplineNeuve(discipline);
  ['boules', 'equipee', 'reglagesBoules', 'gagnes', 'lances', 'victoires', 'defaites', 'biberons', 'carreaux', 'meilleurPoint',
    'meilleureSerie', 'meilleurNiveau', 'effet', 'maitrise', 'epreuves', 'technique', 'palierRecord', 'dores', 'defisReussis',
    'cinqEtoiles', 'fourchettes', 'reprises', 'succes', 'clubGagnes', 'parcours', 'montagne'].forEach(function (k) { neuve[k] = d[k]; });
  // Les techniques gagnées en épreuve restent, au niveau 1.
  MP.EPREUVES.forEach(function (e) { if (e.mode === discipline && neuve.epreuves[e.id]) neuve.competences[e.id] = 1; });
  if (!MP.effetDisponible(neuve, neuve.effet)) neuve.effet = 'neutre';
  // (La technique gagnée en épreuve se joue dès cette saison : on la choisit soi-même.)
  if (!MP.techniqueJouable(neuve, neuve.technique)) neuve.technique = discipline === 'pointage' ? 'roulette' : 'tirSimple';
  neuve.saison = d.saison + 1;
  neuve.trophees = d.trophees + gagnes;
  neuve.ligue = d.ligue;
  etat[discipline] = neuve;
  return gagnes;
};

// ---------- Ligues ----------

MP.liguePossible = function (d) { return d.trophees >= MP.tropheesLigue(d.ligue); };

// Monte d'une ligue : tout repart de zéro, saisons et trophées compris ; restent les boules,
// les succès, les épreuves, la maîtrise et les statistiques. Gains ×4 à chaque ligue.
MP.monterLigue = function (etat, discipline) {
  var d = etat[discipline];
  if (!MP.liguePossible(d)) return false;
  d.palierMaxSaison = Math.max(d.palierMaxSaison, MP.PALIER_SAISON);   // pour réutiliser la remise à zéro de la saison
  MP.nouvelleSaison(etat, discipline);
  var n = etat[discipline];
  n.saison = 1; n.trophees = 0; n.ligue = d.ligue + 1;
  return true;
};

// Grands nombres : 1 234, puis 12,3 k, 1,23 M, 4,5 Md, et ainsi de suite.
MP.UNITES = ['', 'k', 'M', 'Md', 'Bn', 'Bd', 'Tn', 'Td', 'Qn', 'Qd'];
MP.formatPoints = function (n) {
  n = Math.floor(n);
  if (n < 10000) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  var rang = Math.floor(Math.log10(n) / 3);
  if (rang >= MP.UNITES.length) return n.toExponential(2).replace('.', ',').replace('e+', 'e');
  var v = n / Math.pow(1000, rang), pas = v >= 100 ? 1 : (v >= 10 ? 10 : 100);
  return String(Math.floor(v * pas) / pas).replace('.', ',') + ' ' + MP.UNITES[rang];
};

// ---------- Achats par lots : ×1, ×10 ou Max ----------
// Le prix d'un lot est la somme exacte des prix de chaque niveau ; l'achat paie niveau par niveau.

MP.ACHATS = {
  competence: [function (e, D, id) { return MP.etatCompetence(e, D, id); }, function (e, D, id) { return MP.acheterCompetence(e, D, id); }],
  amelioration: [function (e, D, id) { return MP.etatAmelioration(e, D, id); }, function (e, D, id) { return MP.acheterAmelioration(e, D, id); }],
  recrue: [function (e, D, id) { return MP.etatRecrue(e, D, id); }, function (e, D, id) { return MP.acheterRecrue(e, D, id); }]
};

MP.devisLot = function (etat, discipline, genre, id, quantite) {
  var etatDe = MP.ACHATS[genre][0], acheter = MP.ACHATS[genre][1];
  var premier = etatDe(etat, discipline, id);
  if (quantite === 1 || premier.prix == null || (premier.raison && premier.raison !== 'points')) {
    return { nombre: premier.prix != null ? 1 : 0, prix: premier.prix, possible: premier.possible, raison: premier.raison, texte: premier.texte };
  }
  // On simule les achats sur une copie de la discipline, avec des Points sans fin.
  var faux = {};
  faux[discipline] = JSON.parse(JSON.stringify(etat[discipline]));
  faux[discipline].points = Infinity;
  var dispo = etat[discipline].points, limite = quantite === 'max' ? 1000 : quantite, nombre = 0, prix = 0;
  while (nombre < limite) {
    var s = etatDe(faux, discipline, id);
    if (s.prix == null || !s.possible) break;
    if (quantite === 'max' && nombre > 0 && prix + s.prix > dispo) break;
    prix += s.prix; nombre++;
    acheter(faux, discipline, id);
  }
  return { nombre: nombre, prix: prix, possible: nombre > 0 && prix <= dispo, raison: prix > dispo ? 'points' : null };
};

MP.acheterLot = function (etat, discipline, genre, id, quantite) {
  var devis = MP.devisLot(etat, discipline, genre, id, quantite);
  if (!devis.possible) return 0;
  var acheter = MP.ACHATS[genre][1];
  for (var k = 0; k < devis.nombre; k++) if (!acheter(etat, discipline, id)) return k;
  return devis.nombre;
};
