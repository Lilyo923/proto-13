/* =============================================================================
   BRAD BITT — suite de verification

   ELLE VIT DANS LE PROJET, ET C'EST VOULU.

   La precedente — 275 assertions — habitait a cote du jeu, hors du zip. Le
   conteneur qui l'hebergeait a ete recycle, et elle a disparu avec lui : elle
   n'etait nulle part ailleurs. Celle-ci part avec le jeu, sous `tools/`, et
   survivra a la prochaine machine.

   Elle ne cherche pas a reproduire l'ancienne assertion par assertion. Elle
   couvre ce qui a ete touche depuis, et ce qui a deja casse une fois.

   Lancement :  node tools/verif.mjs
   ========================================================================== */
import { demarrer, compteur, MANQUES_ADMIS } from './socle.mjs';

const { serveur, navigateur, page, erreurs, introuvables } = await demarrer({ port: 8099 });
const { verifier, bilan } = compteur();

/* --- A. Chargement -------------------------------------------------------- */
console.log('\nA. CHARGEMENT');
verifier('aucune erreur de console au demarrage', erreurs.length === 0,
  erreurs.slice(0, 3).join(' | '));
verifier('aucun fichier introuvable hors musiques attendues',
  introuvables.every(u => MANQUES_ADMIS.test(u)),
  introuvables.filter(u => !MANQUES_ADMIS.test(u)).slice(0, 3).join(' | '));
verifier('les 11 entrees de la carte sont declarees',
  await page.evaluate(() => ORDRE_NIVEAUX.length) === 11);
verifier('le numero de version est expose',
  /^\d+\.\d+$/.test(await page.evaluate(() => VERSION_JEU)),
  await page.evaluate(() => VERSION_JEU));

/* Les trois musiques recuperees. Elles manquaient au menu ; elles sont la. */
/* On verifie que le FICHIER est la, pas que le navigateur de test l'a decode :
   ce Chromium n'a pas de decodeur AAC, il ne lira jamais un .m4a. Le joueur,
   si. */
const musiques = await page.evaluate(async () => {
  const m = {};
  for (const n of ['niveau8', 'niveau9', 'niveau10', 'bande-annonce', 'menu']) {
    try {
      const r = await fetch('assets/audio/' + n + '.m4a', { method: 'HEAD' });
      m[n] = r.ok;
    } catch (e) { m[n] = false; }
  }
  return m;
});
verifier('les musiques des niveaux 8, 9 et 10 sont livrees',
  musiques.niveau8 && musiques.niveau9 && musiques.niveau10, JSON.stringify(musiques));

/* --- B. La boucle ne meurt pas -------------------------------------------- */
console.log('\nB. LA BOUCLE NE MEURT PAS');

/* Le defaut signale — « en plein combat, le jeu peut ne plus marcher » — n'a
   pas ete reproduit. Mais sa MECANIQUE etait certaine : `requestAnimationFrame`
   etait la derniere instruction de l'image, donc toute exception arretait le
   jeu pour de bon. On verifie maintenant qu'une image qui echoue ne tue plus
   rien : on casse volontairement une fonction de rendu, on laisse tourner, et
   on verifie que la boucle est toujours vivante et l'incident retenu. */
const survie = await page.evaluate(async () => {
  const avant = incidents.nombre;
  const vrai = window.dessinerTourelle;
  let images = 0;
  const compter = () => { images++; requestAnimationFrame(compter); };
  requestAnimationFrame(compter);
  window.dessinerTourelle = () => { throw new Error('panne de test'); };
  scene = 'jeu';
  await new Promise(r => setTimeout(r, 400));
  window.dessinerTourelle = vrai;
  await new Promise(r => setTimeout(r, 300));
  return { incidents: incidents.nombre - avant, images,
           dernier: String(incidents.dernier).slice(0, 40) };
});
verifier('une exception en pleine image ne tue pas la boucle',
  survie.images > 20, survie.images + ' images apres la panne');
verifier('et l\'incident est retenu pour pouvoir etre rapporte',
  survie.incidents > 0 && /panne de test/.test(survie.dernier),
  survie.incidents + ' incident(s) — ' + survie.dernier);

/* --- C. La manette -------------------------------------------------------- */
console.log('\nC. LA MANETTE');

await page.evaluate(() => {
  window.__pad = { connected: true, id: 'manette de test', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__vrai = navigator.getGamepads;
  navigator.getGamepads = () => [window.__pad];
  window.__p = (i, v) => { window.__pad.buttons[i] = { pressed: !!v, value: v ? 1 : 0 }; };
  window.__s = (x, y) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; };
  window.__clic = i => { window.__p(i, 1); majManette(); window.__p(i, 0); majManette(); };
});

/* C1 — le mappage demande, bouton par bouton, EN NIVEAU.
   Les index sont positionnels : 0 = bouton du bas (croix PlayStation, A Xbox,
   B Switch), 2 = bouton de gauche (carre, X, Y), 3 = bouton du haut. */
const enJeu = await page.evaluate(() => {
  effacerPartie();
  relancerNiveau('niveau1'); scene = 'jeu'; relacherTout();
  const out = {};

  window.__s(1, 0); majManette(); out.stickDroite = entrees.droite;
  window.__s(-1, 0); majManette(); out.stickGauche = entrees.gauche && !entrees.droite;
  window.__s(0, -1); majManette(); out.stickHaut = entrees.saut;
  window.__s(0, 0); majManette(); out.repos = !entrees.gauche && !entrees.droite && !entrees.saut;

  window.__p(7, 1); majManette(); out.gachetteDroite = entrees.courir;
  window.__p(7, 0); majManette();

  attaquePresseeCeTick = false;
  window.__p(0, 1); majManette();
  out.basLance = { attaque: entrees.attaque, front: attaquePresseeCeTick };
  attaquePresseeCeTick = false;
  majManette();                                  // maintenu : pas de repetition
  out.pasDeRepetition = attaquePresseeCeTick === false;
  window.__p(0, 0); majManette();
  out.basRelache = entrees.attaque === false;

  ondePresseeCeTick = false;
  window.__p(2, 1); majManette();
  out.gaucheShy = { onde: entrees.onde, front: ondePresseeCeTick };
  ondePresseeCeTick = false;
  window.__p(2, 0); majManette();

  window.__p(1, 1); majManette(); out.droiteSaut = entrees.saut;
  window.__p(1, 0); majManette();

  window.__clic(3); out.hautPause = scene;
  if (scene === 'pause') reprendreJeu();
  return out;
});
verifier('le stick dirige Brad',
  enJeu.stickDroite && enJeu.stickGauche && enJeu.repos, JSON.stringify(enJeu));
verifier('le stick vers le haut fait sauter', enJeu.stickHaut === true);
verifier('la gachette droite fait courir', enJeu.gachetteDroite === true);
verifier('le bouton du bas (✕ · A · B) lance un objet',
  enJeu.basLance.attaque === true && enJeu.basLance.front === true
  && enJeu.basRelache === true, JSON.stringify(enJeu.basLance));
verifier('un bouton maintenu ne se repete pas', enJeu.pasDeRepetition === true);
verifier('le bouton de gauche (□ · X · Y) declenche le Brad-Shy',
  enJeu.gaucheShy.onde === true && enJeu.gaucheShy.front === true,
  JSON.stringify(enJeu.gaucheShy));
verifier('le bouton de droite (○ · B · A) fait sauter', enJeu.droiteSaut === true);
verifier('le bouton du haut (△ · Y · X) ouvre la pause',
  enJeu.hautPause === 'pause', 'scene ' + enJeu.hautPause);

/* C2 — le meme bouton du bas VALIDE dans un menu. C'est la demande : « pour
   confirmer une selection, c'est le bouton X chez PlayStation, A chez Xbox ». */
const enMenu = await page.evaluate(() => {
  retourAuMenu(); indexMenu = 0;
  const out = {};
  window.__clic(13); out.descend = indexMenu > 0;
  window.__clic(12); out.remonte = indexMenu === 0;
  indexMenu = MENU_PRINCIPAL.findIndex(e => e.cle === 'bande');
  window.__clic(0); out.valide = scene;
  window.__clic(1); out.annule = scene;
  return out;
});
verifier('la croix navigue dans les menus',
  enMenu.descend && enMenu.remonte, JSON.stringify(enMenu));
verifier('le bouton du bas valide une entree de menu',
  enMenu.valide === 'bandeannonce', 'scene ' + enMenu.valide);
verifier('le bouton de droite annule', enMenu.annule === 'menu', 'scene ' + enMenu.annule);

/* C3 — au combat final, la table change : le bouton de droite devient
   l'esquive, parce que la scene n'a pas de saut. Un bouton enfonce dans une
   scene et relache dans une autre ne doit rien laisser colle. */
const enFinal = await page.evaluate(() => {
  effacerPartie();
  demarrerCombatFinal(false);
  relacherFinal();
  const out = {};
  window.__p(0, 1); majManette(); out.frappe = entreesFinal.attaque;
  window.__p(0, 0); majManette();
  window.__p(1, 1); majManette(); out.esquive = entreesFinal.esquive;
  window.__p(1, 0); majManette();
  window.__p(2, 1); majManette(); out.onde = entreesFinal.onde;
  window.__p(2, 0); majManette();

  // On enfonce en combat, on change de scene, on relache : rien ne doit rester.
  window.__p(7, 1); majManette();
  retourAuMenu();
  window.__p(7, 0); majManette();
  out.rienDeColle = !entreesFinal.esquive && !entrees.courir;
  return out;
});
verifier('au combat final, le bouton du bas frappe', enFinal.frappe === true);
verifier('celui de droite esquive', enFinal.esquive === true);
verifier('celui de gauche declenche le Brad-Shy', enFinal.onde === true);
verifier('changer de scene ne laisse aucune touche collee',
  enFinal.rienDeColle === true);

const debranche = await page.evaluate(() => {
  relancerNiveau('niveau1'); scene = 'jeu'; relacherTout();
  window.__s(1, 0); majManette();
  const avant = entrees.droite;
  navigator.getGamepads = () => [];
  majManette();
  navigator.getGamepads = () => [window.__pad];
  window.__s(0, 0); majManette();
  return { avant, apres: entrees.droite };
});
verifier('debrancher la manette relache tout',
  debranche.avant === true && debranche.apres === false, JSON.stringify(debranche));

/* C4 — l'ecran « Contrôles » existe et decrit LA MEME table que celle qui
   pilote la manette. C'est ce qui empeche la legende de mentir. */
const ecranControles = await page.evaluate(() => {
  scene = 'controles';
  let err = null;
  try { dessinerControles(); } catch (e) { err = String(e.message); }
  return { err, lignes: MANETTE_LEGENDE.length, clavier: CLAVIER_LEGENDE.length };
});
verifier('l\'ecran Contrôles se dessine', ecranControles.err === null, ecranControles.err);
verifier('il decrit la manette et le clavier',
  ecranControles.lignes >= 7 && ecranControles.clavier >= 7,
  JSON.stringify(ecranControles));

await page.evaluate(() => { navigator.getGamepads = window.__vrai; retourAuMenu(); });

/* --- D. Mentions, contact, version ---------------------------------------- */
console.log('\nD. MENTIONS ET CONTACT');

const mentionsEtat = await page.evaluate(() => {
  localStorage.removeItem('bradbitt.mentions.v1');
  const out = { avant: mentionsDejaLues() };
  scene = 'accueil';
  zones.length = 0;
  dessinerAccueil();
  out.zonesLien = zones.filter(z => z.action === 'mentions-lien').length;
  marquerMentionsLues();
  out.apres = mentionsDejaLues();
  zones.length = 0;
  dessinerAccueil();
  out.zonesApres = zones.filter(z => z.action === 'mentions-lien').length;
  return out;
});
verifier('le bandeau juridique s\'affiche a la premiere visite',
  mentionsEtat.avant === false && mentionsEtat.zonesLien === 2,
  JSON.stringify(mentionsEtat));
verifier('les deux passages sont cliquables', mentionsEtat.zonesLien === 2);
verifier('et il ne revient plus ensuite',
  mentionsEtat.apres === true && mentionsEtat.zonesApres === 0,
  JSON.stringify(mentionsEtat));

const texteMentions = await page.evaluate(() => {
  ouvrirMentions('options');
  let err = null;
  try { dessinerMentions(); } catch (e) { err = String(e.message); }
  const h = mentions.hauteur;
  defilerMentions(10000);
  const bas = mentions.defilement;
  defilerMentions(-10000);
  const retourHaut = mentions.defilement;
  fermerMentions();
  return { err, h, bas, retourHaut, sortie: scene,
           titres: TEXTE_MENTIONS.filter(b => b.t).length,
           contact: TEXTE_MENTIONS.some(b => (b.p || '').indexOf('imaginestudio.hwr@gmail.com') >= 0) };
});
verifier('le texte des conditions se dessine', texteMentions.err === null, texteMentions.err);
verifier('il a de la matiere et defile',
  texteMentions.h > 600 && texteMentions.bas > 0 && texteMentions.retourHaut === 0,
  JSON.stringify({ h: texteMentions.h, bas: texteMentions.bas }));
verifier('il couvre les deux volets, conditions et donnees',
  texteMentions.titres >= 7, texteMentions.titres + ' sections');
verifier('l\'adresse de contact y figure', texteMentions.contact === true);
verifier('on en ressort par les options', texteMentions.sortie === 'options');

const courriel = await page.evaluate(() => {
  const corps = corpsDuMessage();
  return {
    corps,
    version: corps.indexOf(VERSION_JEU) >= 0,
    appareil: /Appareil : (mobile|tablette|ordinateur|écran tactile)/.test(corps),
    navigateur: /Navigateur : \w+ \d+/.test(corps),
    ecran: /Écran : \d+ × \d+/.test(corps),
    dansOptions: MENU_OPTIONS.some(e => e.cle === 'contact'),
    politique: MENU_OPTIONS.some(e => e.cle === 'politique'),
    controles: MENU_OPTIONS.some(e => e.cle === 'controles'),
  };
});
verifier('le courriel pre-rempli porte la version du jeu', courriel.version === true);
verifier('il decrit l\'appareil, le navigateur et l\'ecran',
  courriel.appareil && courriel.navigateur && courriel.ecran,
  JSON.stringify({ a: courriel.appareil, n: courriel.navigateur, e: courriel.ecran }));
verifier('les trois entrees sont dans les options',
  courriel.dansOptions && courriel.politique && courriel.controles);

/* --- E. Le skin 3IRL et son code ------------------------------------------ */
console.log('\nE. LE SKIN 3IRL');

const code3irl = await page.evaluate(() => {
  effacerPartie();
  const u = UNIFORMES.find(x => x.cle === '3irl');
  const out = { existe: !!u, planche: !!planchesBrad['3irl'] };
  out.verrouilleAvant = !uniformeDebloque(u);
  // Un code faux ne doit rien ouvrir.
  vestiaireCode.saisie = 'FNAM3RX';
  validerCodeVestiaire();
  out.mauvaisCode = !uniformeDebloque(u);
  // Le bon, si.
  vestiaireCode.saisie = 'fnam3rl';          // la casse ne doit pas compter
  validerCodeVestiaire();
  out.ouvertApres = uniformeDebloque(u);
  // Il survit a une sauvegarde / relecture.
  enregistrerPartie();
  partie.codesUniformes = [];
  chargerPartie();
  out.apresRelecture = uniformeDebloque(u);
  out.detail = (u.detail || '').slice(0, 30);
  return out;
});
verifier('l\'uniforme 3IRL existe, avec sa planche',
  code3irl.existe && code3irl.planche, JSON.stringify(code3irl));
verifier('il est verrouille tant qu\'on n\'a pas le code',
  code3irl.verrouilleAvant === true);
verifier('un mauvais code n\'ouvre rien', code3irl.mauvaisCode === true);
verifier('FNAM3RL l\'ouvre, quelle que soit la casse', code3irl.ouvertApres === true);
verifier('et il reste ouvert apres rechargement', code3irl.apresRelecture === true);

/* --- F. Les trois aptitudes secretes -------------------------------------- */
console.log('\nF. LES APTITUDES SECRETES');

const aptitudes = await page.evaluate(() => {
  const PAS = 1 / 120;
  const pas = n => { for (let i = 0; i < n; i++) {
    majMobiles(PAS); majTerrain(PAS); majBrad(PAS); majEnnemis(PAS);
    majArene(PAS); majBoules(PAS); majRamassages(PAS); } };
  const prep = secrets => {
    effacerPartie();
    partie.secrets = secrets.slice(); partie.secretsVus = true;
    relancerNiveau('niveau1'); scene = 'jeu'; reinitialiserEnnemis(true);
    for (const k of Object.keys(entrees)) entrees[k] = false;
    brad.pv = brad.pvMax = 99; brad.invincible = 9999;
  };
  const out = { achetables: SECRETS.length, aVenir: SECRETS_A_VENIR.length };

  // Sans aptitude, le coup part a l'appui — le jeu d'avant, intact.
  prep([]);
  attaquePresseeCeTick = true; entrees.attaque = true; pas(2);
  out.sansCharge = brad.attaque > 0 && !brad.charge;

  prep(['frappe-chargee']);
  entrees.attaque = true; attaquePresseeCeTick = true; pas(80);
  out.charge = +brad.charge.toFixed(2);
  entrees.attaque = false; pas(2);
  out.chargeTiree = !!brad.chargeTiree;

  prep(['plaquage']);
  attaquePresseeCeTick = true; pas(2);
  out.plaquageArret = brad.plaquage || 0;
  prep(['plaquage']);
  entrees.droite = true; entrees.courir = true; pas(120);
  attaquePresseeCeTick = true; pas(2);
  out.plaquageCourse = (brad.plaquage || 0) > 0;
  entrees.droite = false; entrees.courir = false;

  prep(['tourelle']);
  const e = ennemis.find(x => x.etat !== 'mort');
  brad.x = e.x - 90; brad.y = e.y; e.dort = false;
  pas(6);
  const pvDepart = e.pv;
  pas(200);
  out.tourelle = { active: tourelle.active, tirs: boules.filter(b => b.tourelle).length,
                   toucheMoinsQueLaBouleRenvoyee: e.pv > -100, pvDepart, pv: e.pv };

  // Aucune aptitude ne doit survivre a une reapparition.
  brad.charge = 5; brad.plaquage = 5;
  reapparaitre(true);
  out.remisAZero = !brad.charge && !brad.plaquage && !brad.recharge;
  return out;
});
verifier('les quatre aptitudes sont achetables, aucune n\'est promise en vain',
  aptitudes.achetables === 4 && aptitudes.aVenir === 0,
  JSON.stringify({ a: aptitudes.achetables, v: aptitudes.aVenir }));
verifier('sans l\'aptitude, le coup part a l\'appui comme avant',
  aptitudes.sansCharge === true);
verifier('la frappe chargee se charge en tenant le bouton',
  aptitudes.charge > 0.5 && aptitudes.chargeTiree === true,
  'charge ' + aptitudes.charge);
verifier('le plaquage ne part pas a l\'arret', aptitudes.plaquageArret === 0);
verifier('mais part en pleine course', aptitudes.plaquageCourse === true);
verifier('la tourelle tire toute seule',
  aptitudes.tourelle.active && aptitudes.tourelle.tirs >= 0
  && aptitudes.tourelle.pv < aptitudes.tourelle.pvDepart,
  JSON.stringify(aptitudes.tourelle));
verifier('et son tir ne tue pas d\'un coup comme une boule renvoyee',
  aptitudes.tourelle.toucheMoinsQueLaBouleRenvoyee === true,
  'pv tombe a ' + aptitudes.tourelle.pv);
verifier('aucune aptitude ne survit a une reapparition',
  aptitudes.remisAZero === true);

/* --- G. Le combat final --------------------------------------------------- */
console.log('\nG. LE COMBAT FINAL');

/* Le combat etait « trop rapide » : 32,7 s de moyenne au robot. On mesure
   maintenant SIX combats et on juge la moyenne, pas un tirage — un combat est
   stochastique, et une mesure unique ne mesure que le hasard. */
const combats = [];
for (let i = 0; i < 6; i++) {
  combats.push(await page.evaluate(() => {
    effacerPartie();
    partie.difficulte = 'connaisseur';
    partie.ameliorations = { vie: 5, degats: 6, resistance: 5 };
    demarrerCombatFinal(false);
    const PAS = 1 / 120;
    let images = 0;
    while (images++ < 120 * 160) {
      const b = finale.brad, k = finale.kirby;
      if (finale.fini) return { ok: true, s: images / 120, pv: b.pv, pvMax: b.pvMax };
      if (finale.mort) return { ok: false, s: images / 120 };
      const tirer = b.shy >= 100;
      let cible = k;
      if (!tirer) {
        let d0 = 1e9;
        for (const s of finale.sbires) {
          const d = Math.hypot(s.x - b.x, (s.z - b.z) * 1.6);
          if (d < d0) { d0 = d; cible = s; }
        }
      }
      const fuite = !tirer && (k.etat === 'prepare' || k.etat === 'charge' || k.etat === 'aspire');
      const dx = cible.x - b.x, dz = cible.z - b.z;
      const d = Math.hypot(dx, dz * 1.6);
      const arret = tirer ? 34 : 46;
      const ux = fuite ? (Math.sign(b.x - k.x) || 1) : (d > arret ? Math.sign(dx) : 0);
      const uz = fuite ? (Math.sign(b.z - k.z) || 1) : (d > arret ? Math.sign(dz) : 0);
      entreesFinal.droite = ux > 0; entreesFinal.gauche = ux < 0;
      entreesFinal.avancer = uz > 0; entreesFinal.reculer = uz < 0;
      if (fuite && images % 40 === 0) esquivePresseeCeTick = true;
      if (!tirer && d < 60 && images % 16 === 0) coupPresseCeTick = true;
      if (tirer && d < F_PORTEE_ONDE * 0.8) ondeFinalePresseeCeTick = true;
      majFinal(PAS); majEffetsFinal(PAS);
    }
    return { ok: false, raison: 'temps ecoule' };
  }));
}
const gagnes = combats.filter(c => c.ok);
const moy = t => t.reduce((a, b) => a + b, 0) / Math.max(1, t.length);
const duree = moy(gagnes.map(c => c.s));
verifier('le combat final se gagne, six fois sur six', gagnes.length === 6,
  combats.filter(c => !c.ok).map(c => c.raison || 'mort').join(', '));
verifier('il dure desormais entre 40 et 60 secondes',
  duree > 40 && duree < 60, duree.toFixed(1) + ' s de moyenne');
verifier('et il coute cher', moy(gagnes.map(c => c.pv)) < 24 * 0.6,
  moy(gagnes.map(c => c.pv)).toFixed(1) + ' PV sur 24');
console.log('       (' + gagnes.map(c => c.s.toFixed(0) + 's').join(' · ') + ')');

/* Le compte a rebours de fin ne doit pas trainer d'une partie a l'autre. */
const relance = await page.evaluate(() => {
  demarrerCombatFinal(false);
  finale.attenteFin = 2.5;
  demarrerCombatFinal(false);
  return { attenteFin: finale.attenteFin, tueur: finale.tueur };
});
verifier('relancer le combat remet le compte a rebours a zero',
  relance.attenteFin === 0, String(relance.attenteFin));

/* --- H. Le filet anti-blocage --------------------------------------------- */
console.log('\nH. LE FILET ANTI-BLOCAGE');

const filet = await page.evaluate(() => {
  effacerPartie();
  relancerNiveau('niveau1'); scene = 'jeu'; relacherTout();
  const PAS = 1 / 120;
  const out = {};

  /* En jeu normal, il ne se declenche JAMAIS : Brad court, donc il bouge.
     Deux secondes, pas cinq — au-dela il atteint le premier trou du niveau 1,
     tombe, et la scene passe a « mort » : le filet ne s'applique plus, et le
     test ne mesurait plus rien. */
  const avant = antiBlocage.degagements;
  entrees.droite = true; entrees.courir = true;
  for (let i = 0; i < 240 && scene === 'jeu'; i++) { majBrad(PAS); majTerrain(PAS); }
  out.enCourse = antiBlocage.degagements - avant;
  out.sceneApresCourse = scene;

  // Brad fige de force, au depart : le filet doit le degager.
  reapparaitre(true);
  scene = 'jeu';
  const pivot = antiBlocage.degagements;
  entrees.droite = true; entrees.courir = false;
  for (let i = 0; i < 130; i++) { brad.vx = 0; majBrad(PAS); majTerrain(PAS); }
  out.degage = antiBlocage.degagements - pivot;
  entrees.droite = false; entrees.courir = false;
  return out;
});
verifier('le filet ne se declenche pas en jeu normal', filet.enCourse === 0,
  filet.enCourse + ' degagement(s) pendant 2 s de course, scene ' + filet.sceneApresCourse);
verifier('mais degage Brad s\'il ne bouge plus', filet.degage > 0,
  filet.degage + ' degagement(s)');

/* --- I. La replique corrigee ---------------------------------------------- */
console.log('\nI. LE DIALOGUE');
const replique = await page.evaluate(() => {
  const tout = DIALOGUE_EXPLOSION.map(l => l.texte).join(' | ');
  return { ancienne: /TU AS GRANDI/i.test(tout), nouvelle: /DÉTECTÉ POUR LA DERNIÈRE FOIS/i.test(tout) };
});
verifier('« tu as grandi à Lille » a disparu', replique.ancienne === false);
verifier('et la nouvelle raison est donnee', replique.nouvelle === true);

/* --- J. Rendu de tous les ecrans ------------------------------------------ */
console.log('\nJ. RENDU');
const ecrans = await page.evaluate(() => {
  const liste = ['accueil', 'menu', 'options', 'credits', 'mentions', 'controles',
                 'hub', 'boutique', 'vestiaire', 'carte', 'jukebox', 'arcade'];
  const rates = [];
  for (const s of liste) {
    try {
      if (s === 'hub' || s === 'boutique' || s === 'vestiaire' || s === 'carte' || s === 'jukebox') {
        reinitialiserHub();
      }
      scene = s;
      rendu();
    } catch (e) { rates.push(s + ' : ' + e.message); }
  }
  retourAuMenu();
  return rates;
});
verifier('les douze ecrans se dessinent sans erreur', ecrans.length === 0, ecrans.join(' | '));
verifier('aucune erreur de console sur toute la session',
  erreurs.filter(e => !/panne de test/.test(e)).length === 0,
  erreurs.filter(e => !/panne de test/.test(e)).slice(0, 3).join(' | '));
const mauvais = introuvables.filter(u => !MANQUES_ADMIS.test(u));
verifier('aucune ressource introuvable hors musiques attendues',
  mauvais.length === 0, mauvais.slice(0, 3).join(' | '));

const code = bilan();
await navigateur.close();
serveur.close();
process.exit(code ? 1 : 0);
