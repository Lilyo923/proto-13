/* =============================================================================
   BRAD BITT — socle de verification

   La suite Playwright d'avant a disparu avec le conteneur ou elle vivait : elle
   n'etait pas dans le zip. Celle-ci l'est — elle part avec le jeu, sous
   `tools/`, pour que ça ne se reproduise pas.

   Ce fichier ne contient que le socle : serveur local, navigateur, compteur.
   Les verifications sont dans verif.mjs, a cote.

   Le jeu est servi en HTTP et non en file:// parce que `getImageData` refuse de
   lire un canvas nourri par une image chargee en file://.
   ========================================================================== */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
export const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
import http from 'http';
import fs from 'fs';
import path from 'path';

/* La racine du jeu. Par defaut le dossier parent de tools/, pour que la suite
   marche depuis n'importe ou le zip a ete deballe ; BRADBITT_RACINE permet de
   la forcer, ce qui sert a verifier une archive fraichement construite. */
export const RACINE = process.env.BRADBITT_RACINE
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
};

/* Deux familles d'absences admises, et elles n'ont rien a voir :

   1. Les trois musiques qui n'ont pas encore ete fournies.
   2. TOUS les `.mp3`. Le jeu n'expedie que des `.m4a` ; `EXT_AUDIO` essaie le
      format que le navigateur declare preferer, puis se rabat sur l'autre. Le
      Chromium de test est compile sans decodeur AAC : il demande donc les
      `.mp3` en premier, ne les trouve pas, et prend les `.m4a`. Ces 404-la
      sont le repli qui fonctionne, pas une panne.

   Toute AUTRE adresse introuvable fait echouer la suite. */
export const MANQUES_ADMIS =
  /\/assets\/audio\/(mini-kirby|mega-kirby|generique)\.m4a$|\/assets\/audio\/[^/]+\.mp3$|favicon/;

export async function demarrer(opts = {}) {
  const port = opts.port || 8099;
  const serveur = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(RACINE, url === '/' ? 'index.html' : url);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); res.end('404'); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => serveur.listen(port, r));

  const navigateur = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 720 } });

  const erreurs = [];
  const introuvables = [];
  page.on('response', r => { if (r.status() === 404) introuvables.push(r.url()); });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;   // juge par `introuvables`
    erreurs.push(m.text());
  });
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));

  await page.goto('http://localhost:' + port + '/index.html');
  /* Les `const` de haut niveau d'un script classique vivent dans la portee
     lexicale globale, PAS sur `window` : on teste donc le nom nu. */
  await page.waitForFunction(
    () => typeof NIVEAUX === 'object' && !!NIVEAUX.niveau5 && typeof sprites === 'object',
    null, { timeout: 20000 });
  // Le jeu ne charge ses planches qu'apres l'ecran d'accueil : c'est ce clic
  // qui autorise l'audio.
  await page.evaluate(() => lancerDemarrage());
  await page.waitForFunction(() => Object.keys(sprites).length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  return { serveur, navigateur, page, erreurs, introuvables };
}

export function compteur() {
  const etat = { reussis: 0, echecs: [] };
  etat.verifier = (nom, condition, detail) => {
    if (condition) { etat.reussis++; console.log('  ok   ' + nom); }
    else {
      etat.echecs.push(nom + (detail ? ' — ' + detail : ''));
      console.log('  ECHEC ' + nom + (detail ? ' — ' + detail : ''));
    }
  };
  etat.bilan = () => {
    console.log('\n================================');
    console.log(etat.reussis + ' verifications reussies, ' + etat.echecs.length + ' echec(s).');
    for (const e of etat.echecs) console.log('  - ' + e);
    return etat.echecs.length;
  };
  return etat;
}
