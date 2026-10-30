// Ma Pétanque — démarrage : chargement de la sauvegarde, menus, bouton retour d'Android.
'use strict';
var MP = window.MP || (window.MP = {});

(function () {
  MP.etat = MP.charger();
  MP.Son.regler(MP.etat.reglages.son, MP.etat.reglages.vibrations);

  document.querySelectorAll('.bascule button').forEach(function (b) {
    b.addEventListener('click', function () {
      MP.etat.vue = b.getAttribute('data-d');
      MP.sauver(MP.etat);
      MP.Ecrans.afficher();
    });
  });
  document.querySelectorAll('.onglets button').forEach(function (b) {
    b.addEventListener('click', function () { MP.Ecrans.afficher(b.getAttribute('data-onglet')); });
  });
  document.getElementById('bouton-reglages').addEventListener('click', MP.Ecrans.reglages);
  MP.Partie.brancher();
  // Ce que le club a gagné pendant l'absence (à mi-régime, 8 h au plus).
  var absence = MP.gainsAbsence(MP.etat, Date.now());
  // Ce qui a été retiré (compétences, aides, couleur Lavande) : les Points sont rendus (une fois).
  var rendu = MP.etat.rembourse;
  delete MP.etat.rembourse;
  MP.sauver(MP.etat);
  MP.Ecrans.afficher('jouer');
  if (absence && (absence.pointage >= 1 || absence.tir >= 1)) MP.Ecrans.absence(absence);
  if (rendu) MP.Ecrans.toast(MP.formatPoints(rendu) + ' points rendus pour ce qui a été retiré ou a changé.');
  // Le début de l'aventure : graver ses initiales sur sa boule (une fois, ou après une remise à zéro).
  if (!MP.etat.initiales && !MP.etat.graveDemandee) MP.Ecrans.graverAuDebut();

  // Le club joue chaque seconde ; sauvegarde toutes les 10 s.
  var dernier = Date.now(), compte = 0;
  setInterval(function () {
    var maintenant = Date.now(), dt = Math.min(5, (maintenant - dernier) / 1000);
    dernier = maintenant;
    MP.produireClub(MP.etat, dt, maintenant, false);
    MP.etat.derniereVisite = maintenant;
    if (MP.Partie.enCours()) MP.Partie.majPoints(); else MP.Ecrans.tic();
    if (++compte % 10 === 0) {
      MP.DISCIPLINES.forEach(function (D) { MP.Ecrans.annoncerSucces(MP.verifierSucces(MP.etat, D.id)); });
      MP.sauver(MP.etat);
    }
  }, 1000);
  // Réglage de la force des techniques (un instant de calcul), après le premier affichage.
  setTimeout(function () { if (!MP.vitessesMax.roulette) MP.reglerVitesses(); }, 50);

  // Bouton « retour » : ferme ce qui est ouvert. Renvoie false s'il n'y a plus rien à fermer
  // (l'appli Android se met alors en arrière-plan).
  MP.retour = function () {
    var voile = document.querySelector('.voile');
    if (voile) { voile.remove(); return true; }
    if (MP.Partie.enCours()) { MP.Partie.quitter(); return true; }
    if (MP.Ecrans.onglet() !== 'jouer') { MP.Ecrans.afficher('jouer'); return true; }
    return false;
  };
  window.retourAndroid = function () { return MP.retour(); };
  window.addEventListener('popstate', function () { if (MP.Partie.enCours()) MP.Partie.quitter(); });

  // Sauvegarde quand l'appli passe en arrière-plan.
  // Au retour (appli remise au premier plan), on compte l'absence comme hors ligne.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { MP.etat.derniereVisite = Date.now(); MP.sauver(MP.etat); return; }
    var g = MP.gainsAbsence(MP.etat, Date.now());
    dernier = Date.now();
    MP.sauver(MP.etat);
    if (g && (g.pointage >= 1 || g.tir >= 1)) MP.Ecrans.absence(g);
  });
})();
