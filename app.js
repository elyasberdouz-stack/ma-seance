// Ma Séance : la séance du jour, le poids de chaque série, des boutons + / − pour les changer.
// Tout reste sur le téléphone (localStorage) : pas de compte, pas de serveur.
// Pages (dans l'adresse après #) : accueil, /go (ouvre direct la séance du jour : c'est la page de démarrage),
// /seance/<id>, /seance/<id>/modifier, /historique, /reglages.

const CLE = 'ma-seance-v1';
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ORDRE_SEMAINE = [1, 2, 3, 4, 5, 6, 0];

const ICONES = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  moins: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  retour: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  haut: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  bas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
};

const app = document.getElementById('app');
let etat = charger();
let courante = null;      // séance affichée (pages séance et modifier)
let inviteInstall = null; // Android : proposition d'installation gardée pour le bouton

// ---------- Données ----------

function charger() {
  const defaut = structuredClone(PROGRAMME_DEFAUT);
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const stocke = JSON.parse(brut);
      return { ...defaut, ...stocke, reglages: { ...defaut.reglages, ...stocke.reglages } };
    }
  } catch (e) { /* stockage illisible : on repart du programme par défaut */ }
  return defaut;
}

function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(etat)); }
  catch (e) { toast("Impossible d'enregistrer sur ce téléphone"); }
}

const seance = id => etat.seances.find(s => s.id === id);
const seanceDuJour = () => seance(etat.planning[new Date().getDay()]);
const pasDe = exo => exo.pas || etat.reglages.pas;
const arrondi = n => Math.round(n * 100) / 100;
const lourde = poids => Math.max(0, ...poids);
const faiteAujourdhui = id => etat.historique.some(h => h.seanceId === id && h.date === aujourdhui());

// Dernière séance enregistrée avant aujourd'hui : c'est la référence « la dernière fois ».
function derniereFois(seanceId) {
  return etat.historique.filter(h => h.seanceId === seanceId && h.date !== aujourdhui()).at(-1);
}

function poidsReference(seanceId, exoId) {
  return derniereFois(seanceId)?.exercices.find(e => e.id === exoId)?.poids ?? null;
}

function joursDe(seanceId) {
  return ORDRE_SEMAINE.filter(j => etat.planning[j] === seanceId).map(j => JOURS_COURTS[j]).join(' ');
}

function prochaineSeance() {
  const j = new Date().getDay();
  for (let i = 1; i <= 7; i++) {
    const jour = (j + i) % 7;
    const s = seance(etat.planning[jour]);
    if (s) return { jour, s };
  }
  return null;
}

function demarrer(seanceId) {
  if (!etat.enCours || etat.enCours.seanceId !== seanceId || etat.enCours.jour !== aujourdhui()) {
    etat.enCours = { seanceId, jour: aujourdhui(), faits: {} };
  }
}

// Enregistre la séance dans l'historique (une seule entrée par séance et par jour).
function enregistrer(seanceId, jour) {
  const s = seance(seanceId);
  if (!s) return;
  const faits = etat.enCours?.seanceId === seanceId ? etat.enCours.faits : {};
  const entree = {
    date: jour,
    seanceId,
    nom: s.nom,
    exercices: s.exercices.map(e => ({ id: e.id, nom: e.nom, poids: [...e.poids], reps: e.reps, faites: faits[e.id] || 0 })),
  };
  const i = etat.historique.findIndex(h => h.seanceId === seanceId && h.date === jour);
  if (i >= 0) etat.historique[i] = entree; else etat.historique.push(entree);
  etat.historique.sort((a, b) => a.date.localeCompare(b.date));
  if (etat.enCours?.seanceId === seanceId) etat.enCours = null;
  sauver();
}

// Séance commencée un autre jour sans appuyer sur « Terminer » : on l'enregistre à sa date.
function rangerSeanceOubliee() {
  if (etat.enCours && etat.enCours.jour !== aujourdhui()) enregistrer(etat.enCours.seanceId, etat.enCours.jour);
}

function identifiant(nom) {
  const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exo';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- Mise en forme ----------

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombre = n => arrondi(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const kg = n => (n === 0 ? 'poids du corps' : `${nombre(n)} kg`);
const cleJour = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aujourdhui = () => cleJour(new Date());
const versDate = cle => { const [a, m, j] = cle.split('-').map(Number); return new Date(a, m - 1, j); };
const dateLongue = d => `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
const dateCourte = cle => { const d = versDate(cle); return `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`; };

// « 4 × 12 kg » si toutes les séries ont le même poids, sinon « 18 · 23 · 32 · 36 kg ».
function listeKg(poids) {
  if (poids.every(p => p === 0)) return 'poids du corps';
  if (poids.every(p => p === poids[0])) return `${poids.length} × ${nombre(poids[0])} kg`;
  return `${poids.map(nombre).join(' · ')} kg`;
}

function volume(e) {
  const n = e.poids.length;
  const reps = !e.reps ? '' : /^\d+(-\d+)?$/.test(e.reps) ? ` · ${e.reps} reps` : ` · ${esc(e.reps)}`;
  return `${n} série${n > 1 ? 's' : ''}${reps}`;
}

function depuis(cle) {
  const jours = Math.round((versDate(aujourdhui()) - versDate(cle)) / 864e5);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

function delta(n) {
  if (!n) return '';
  return `<span class="delta ${n > 0 ? 'hausse' : 'baisse'}">${n > 0 ? '+' : '−'}${nombre(Math.abs(n))}</span>`;
}

// ---------- Pages ----------

function pageAccueil() {
  const s = seanceDuJour();
  const enCours = etat.enCours && seance(etat.enCours.seanceId);
  let html = `<header class="entete"><p class="surtitre">${dateLongue(new Date())}</p><h1>Aujourd'hui</h1></header>`;

  html += bandeauInstallation();

  if (enCours && enCours.id !== s?.id) {
    html += `<a class="carte-reprendre" href="#/seance/${enCours.id}"><span>Séance en cours<strong>${esc(enCours.nom)}</strong></span><span class="lien">Reprendre ${ICONES.chevron}</span></a>`;
  }

  if (s) {
    const faite = faiteAujourdhui(s.id);
    const derniere = derniereFois(s.id);
    const action = faite ? 'Revoir la séance' : etat.enCours?.seanceId === s.id ? 'Reprendre la séance' : 'Commencer';
    html += `<section class="carte-jour${faite ? ' faite' : ''}">
      <p class="etiquette">${faite ? 'Séance faite ✓' : 'Séance du jour'}</p>
      <h2>${esc(s.nom)}</h2>
      <p class="meta">${s.exercices.length} exercices · ${faite ? "faite aujourd'hui" : derniere ? `dernière fois ${depuis(derniere.date)}` : 'pas encore faite'}</p>
      <a class="bouton-principal" href="#/seance/${s.id}">${action}</a>
    </section>`;
  } else {
    const p = prochaineSeance();
    html += `<section class="carte-jour repos">
      <p class="etiquette">Jour de repos</p>
      <h2>Récupère bien</h2>
      <p class="meta">${p ? `Prochaine séance : ${JOURS[p.jour].toLowerCase()}, ${esc(p.s.nom)}` : 'Aucune séance prévue dans la semaine.'}</p>
    </section>`;
  }

  html += `<h3 class="titre-section">Mes séances</h3>
    <ul class="liste-seances">${etat.seances.map(x => `
      <li><a href="#/seance/${x.id}">
        <span class="nom">${esc(x.nom)}<small>${x.exercices.length} exercices</small></span>
        <span class="jours">${joursDe(x.id) || '—'}</span>${ICONES.chevron}
      </a></li>`).join('')}
    </ul>
    <button class="bouton-secondaire" data-action="ajouter-seance">+ Nouvelle séance</button>`;
  return html;
}

function bandeauInstallation() {
  const installee = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (installee || etat.reglages.bandeauMasque) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!ios && !inviteInstall) return '';
  const texte = ios
    ? 'Mets-la sur ton écran d\'accueil : bouton <strong>Partager</strong> de Safari, puis <strong>Sur l\'écran d\'accueil</strong>.'
    : 'Installe-la sur ton téléphone pour l\'ouvrir comme une vraie appli.';
  return `<div class="bandeau">
    <p>${texte}</p>
    <div class="bandeau-actions">
      ${ios ? '' : '<button class="bouton-mini accent" data-action="installer">Installer</button>'}
      <button class="bouton-mini" data-action="masquer-bandeau">Plus tard</button>
    </div>
  </div>`;
}

const separateurOu = e => (e.ou ? '<li class="ou" aria-hidden="true">ou</li>' : '');

function pageSeance(s) {
  const ref = derniereFois(s.id);
  return `<header class="entete-seance">
      <a class="btn-rond" href="#/" aria-label="Retour à l'accueil">${ICONES.retour}</a>
      <div class="titres"><p class="surtitre">${joursDe(s.id) || 'Séance'}</p><h1>${esc(s.nom)}</h1></div>
      <a class="btn-texte" href="#/seance/${s.id}/modifier">Modifier</a>
    </header>
    <p class="info-ref">${ref ? `Comparé à ta séance du ${dateCourte(ref.date)}` : 'Touche un numéro quand la série est faite, un poids pour le taper.'}</p>
    <ol class="exercices">${s.exercices.map(e => separateurOu(e) + carteExo(s, e)).join('')}</ol>
    ${s.exercices.length ? '' : `<p class="vide">Aucun exercice. <a href="#/seance/${s.id}/modifier">Ajoute-en un</a>.</p>`}
    <button class="bouton-principal fin" data-action="terminer">${faiteAujourdhui(s.id) ? 'Mettre à jour la séance' : 'Terminer la séance'}</button>`;
}

function carteExo(s, e) {
  const ref = poidsReference(s.id, e.id);
  const faits = etat.enCours?.seanceId === s.id ? etat.enCours.faits[e.id] || 0 : 0;
  const pas = nombre(pasDe(e));
  const lignes = e.poids.map((p, i) => {
    const ecart = ref && ref[i] !== undefined ? arrondi(p - ref[i]) : 0;
    return `<li class="ligne-serie${i < faits ? ' faite' : ''}" data-i="${i}">
      <button class="serie" data-action="serie" data-n="${i + 1}" aria-pressed="${i < faits}" aria-label="Série ${i + 1} faite">${i + 1}</button>
      <button class="pas" data-action="moins" aria-label="Série ${i + 1} : baisser de ${pas} kg"${p <= 0 ? ' disabled' : ''}>${ICONES.moins}</button>
      <button class="poids" data-action="saisir" aria-label="Série ${i + 1} : ${kg(p)}. Toucher pour taper le poids">
        <span class="chiffre">${p === 0 ? '<span class="valeur pdc">Poids du corps</span>' : `<span class="valeur">${nombre(p)}</span><span class="unite">kg</span>`}</span>
        ${delta(ecart)}
      </button>
      <button class="pas" data-action="plus" aria-label="Série ${i + 1} : monter de ${pas} kg">${ICONES.plus}</button>
    </li>`;
  }).join('');
  return `<li class="exo${faits >= e.poids.length ? ' fini' : ''}" data-exo="${e.id}">
    <div class="exo-tete"><h2>${esc(e.nom)}</h2><span class="volume">${volume(e)}</span></div>
    <ol class="lignes">${lignes}</ol>
    <p class="ref">${ref ? `La dernière fois : ${listeKg(ref)}` : `± ${pas} kg par appui`}</p>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
  </li>`;
}

const casesPoids = e => e.poids.map((p, i) =>
  `<input type="text" inputmode="decimal" data-champ="poids-serie" data-i="${i}" value="${nombre(p)}" aria-label="Poids série ${i + 1}">`).join('');

function pageModifier(s) {
  const champsExo = (e, i) => `
    <li class="exo-edit" data-exo="${e.id}">
      <div class="ligne-nom">
        <input class="nom" data-champ="nom" value="${esc(e.nom)}" aria-label="Nom de l'exercice">
        <div class="ordre">
          <button class="btn-rond petit" data-action="monter" aria-label="Monter"${i === 0 ? ' disabled' : ''}>${ICONES.haut}</button>
          <button class="btn-rond petit" data-action="descendre" aria-label="Descendre"${i === s.exercices.length - 1 ? ' disabled' : ''}>${ICONES.bas}</button>
        </div>
      </div>
      <div class="grille">
        <label><span>Séries</span><input type="number" inputmode="numeric" min="1" max="12" data-champ="series" value="${e.poids.length}"></label>
        <label><span>Reps</span><input data-champ="reps" value="${esc(e.reps)}" placeholder="—"></label>
        <label><span>Pas kg</span><input type="text" inputmode="decimal" data-champ="pas" value="${e.pas ? nombre(e.pas) : ''}" placeholder="${nombre(etat.reglages.pas)}"></label>
      </div>
      <div class="poids-series"><span>Poids par série (kg)</span><div class="cases">${casesPoids(e)}</div></div>
      <input class="note" data-champ="note" value="${esc(e.note || '')}" placeholder="Note : réglage machine, prise…">
      ${i > 0 ? `<label class="case-ou"><input type="checkbox" data-champ="ou"${e.ou ? ' checked' : ''}> Au choix avec l'exercice du dessus</label>` : ''}
      <button class="lien-danger" data-action="supprimer-exo">Supprimer l'exercice</button>
    </li>`;
  return `<header class="entete-seance">
      <a class="btn-rond" href="#/seance/${s.id}" aria-label="Retour à la séance">${ICONES.retour}</a>
      <div class="titres"><p class="surtitre">Modifier</p><h1 data-titre>${esc(s.nom)}</h1></div>
      <a class="btn-texte accent" href="#/seance/${s.id}">OK</a>
    </header>
    <label class="champ"><span>Nom de la séance</span><input data-champ="seance-nom" value="${esc(s.nom)}"></label>
    <ol class="edition">${s.exercices.map(champsExo).join('')}</ol>
    <button class="bouton-secondaire" data-action="ajouter-exo">+ Ajouter un exercice</button>
    <button class="lien-danger centre" data-action="supprimer-seance">Supprimer cette séance</button>`;
}

function pageHistorique() {
  const entete = '<header class="entete"><p class="surtitre">Ce que tu as fait</p><h1>Historique</h1></header>';
  if (!etat.historique.length) {
    return `${entete}<p class="vide">Rien pour l'instant. À la fin de ta séance, appuie sur <strong>Terminer la séance</strong> : elle s'affichera ici.</p>`;
  }

  const mois = aujourdhui().slice(0, 7);
  const ceMois = etat.historique.filter(h => h.date.startsWith(mois)).length;

  // Progression : série la plus lourde au premier enregistrement → aujourd'hui, pour chaque exercice qui a bougé.
  const progres = etat.seances.flatMap(s => s.exercices.map(e => {
    const premiere = etat.historique.find(h => h.exercices.some(x => x.id === e.id));
    if (!premiere) return null;
    const depart = lourde(premiere.exercices.find(x => x.id === e.id).poids);
    const actuel = lourde(e.poids);
    return depart === actuel ? null : { nom: e.nom, depart, actuel };
  })).filter(Boolean);

  const precedent = {};
  const lignes = etat.historique.map(h => {
    const avant = precedent[h.seanceId];
    precedent[h.seanceId] = h;
    const exos = h.exercices.map(x => {
      const p = avant?.exercices.find(y => y.id === x.id);
      return `<li><span class="nom-exo">${esc(x.nom)}</span><span class="valeurs">${listeKg(x.poids)}${p ? delta(arrondi(lourde(x.poids) - lourde(p.poids))) : ''}</span></li>`;
    }).join('');
    return `<details class="entree"><summary><span class="date">${dateCourte(h.date)}</span><span class="nom">${esc(h.nom)}</span>${ICONES.chevron}</summary><ul>${exos}</ul></details>`;
  }).reverse().join('');

  return `${entete}
    <div class="stats">
      <div><strong>${etat.historique.length}</strong><span>séance${etat.historique.length > 1 ? 's' : ''} en tout</span></div>
      <div><strong>${ceMois}</strong><span>ce mois-ci</span></div>
    </div>
    ${progres.length ? `<h3 class="titre-section">Depuis le début</h3>
      <p class="aide haut">Ta série la plus lourde, la première fois et maintenant.</p>
      <ul class="progres">${progres.map(p =>
      `<li><span class="nom-exo">${esc(p.nom)}</span><span class="valeurs">${nombre(p.depart)} → ${kg(p.actuel)}${delta(arrondi(p.actuel - p.depart))}</span></li>`).join('')}</ul>` : ''}
    <h3 class="titre-section">Séances</h3>
    <div class="journal">${lignes}</div>`;
}

function pageReglages() {
  const lienAuto = `webapp://${location.host}${location.pathname}#/go`;
  const jours = ORDRE_SEMAINE.map(j => `
    <label class="ligne-jour"><span>${JOURS[j]}</span>
      <select data-champ="planning" data-jour="${j}">
        <option value="">Repos</option>
        ${etat.seances.map(s => `<option value="${s.id}"${etat.planning[j] === s.id ? ' selected' : ''}>${esc(s.nom)}</option>`).join('')}
      </select>
    </label>`).join('');
  const pas = [1, 1.25, 2, 2.5, 5].map(p => `<option value="${p}"${etat.reglages.pas === p ? ' selected' : ''}>${nombre(p)} kg</option>`).join('');

  return `<header class="entete"><p class="surtitre">Ta semaine, tes réglages</p><h1>Réglages</h1></header>
    <h3 class="titre-section">Quelle séance quel jour</h3>
    <div class="bloc">${jours}</div>

    <h3 class="titre-section">Boutons + / −</h3>
    <div class="bloc"><label class="ligne-jour"><span>Un appui change de</span><select data-champ="pas-defaut">${pas}</select></label></div>
    <p class="aide">Chaque exercice peut avoir son propre pas (dans « Modifier »). Pour un poids précis, touche le chiffre et tape-le.</p>

    <h3 class="titre-section">Ouverture automatique à la salle</h3>
    <div class="bloc texte">
      <p>L'appli s'ouvre déjà sur la séance du jour. Pour qu'elle s'ouvre toute seule en arrivant chez Neoness, sur iPhone :</p>
      <ol class="etapes">
        <li>Appli <strong>Raccourcis</strong> → <strong>Automatisation</strong> → <strong>+</strong></li>
        <li><strong>Arrivée</strong> : choisis l'adresse de ta Neoness. Ou <strong>App</strong> : quand l'appli Neoness s'ouvre.</li>
        <li>Coche <strong>Exécuter immédiatement</strong>.</li>
        <li>Action <strong>Ouvrir les URL</strong> avec cette adresse :</li>
      </ol>
      <code class="lien-auto">${esc(lienAuto)}</code>
      <button class="bouton-mini accent" data-action="copier-lien">Copier l'adresse</button>
    </div>

    <h3 class="titre-section">Sauvegarde</h3>
    <div class="bloc texte">
      <p>Tes séances restent sur ce téléphone. Fais une copie de temps en temps, ou avant de changer de téléphone.</p>
      <div class="rangee">
        <button class="bouton-mini" data-action="exporter">Exporter</button>
        <label class="bouton-mini">Importer<input type="file" accept="application/json,.json" data-champ="importer" hidden></label>
      </div>
    </div>
    <button class="lien-danger centre" data-action="reinitialiser">Tout effacer et repartir de zéro</button>`;
}

// ---------- Navigation ----------

function route() {
  rangerSeanceOubliee();
  const [, page, id, sous] = location.hash.split('/');
  if (page === 'go') {
    const s = seanceDuJour();
    location.replace(s ? `#/seance/${s.id}` : '#/');
    return;
  }
  courante = page === 'seance' ? seance(id) : null;
  if (page === 'seance' && !courante) { location.replace('#/'); return; }

  if (courante) app.innerHTML = sous === 'modifier' ? pageModifier(courante) : pageSeance(courante);
  else if (page === 'historique') app.innerHTML = pageHistorique();
  else if (page === 'reglages') app.innerHTML = pageReglages();
  else app.innerHTML = pageAccueil();

  const onglet = ['historique', 'reglages'].includes(page) ? page : 'accueil';
  document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.page === onglet));
  window.scrollTo(0, 0);
}

function rafraichir() {
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

// ---------- Actions ----------

const exoDe = el => {
  const li = el.closest('[data-exo]');
  return li && courante?.exercices.find(e => e.id === li.dataset.exo);
};
const serieDe = el => Number(el.closest('[data-i]').dataset.i);

function majCarte(e) {
  const li = app.querySelector(`.exo[data-exo="${e.id}"]`);
  if (li) li.outerHTML = carteExo(courante, e);
}

function vibrer() { navigator.vibrate?.(8); }

function lirePoids(texte) {
  const n = parseFloat(String(texte).replace(',', '.'));
  return n >= 0 ? arrondi(n) : null;
}

const ACTIONS = {
  plus: b => changerPoids(exoDe(b), serieDe(b), 1),
  moins: b => changerPoids(exoDe(b), serieDe(b), -1),

  saisir(b) {
    const e = exoDe(b);
    const i = serieDe(b);
    const saisi = prompt(`${e.nom} · série ${i + 1} (kg)`, nombre(e.poids[i]));
    if (saisi === null) return;
    const n = lirePoids(saisi);
    if (n === null) { toast('Poids non compris'); return; }
    e.poids[i] = n;
    demarrer(courante.id);
    sauver();
    majCarte(e);
  },

  serie(b) {
    const e = exoDe(b);
    demarrer(courante.id);
    const n = Number(b.dataset.n);
    const faits = etat.enCours.faits[e.id] || 0;
    etat.enCours.faits[e.id] = faits >= n ? n - 1 : n;
    sauver();
    majCarte(e);
    vibrer();
  },

  terminer() {
    const hausses = courante.exercices.filter(e => {
      const ref = poidsReference(courante.id, e.id);
      return ref && e.poids.some((p, i) => ref[i] !== undefined && p > ref[i]);
    }).length;
    enregistrer(courante.id, aujourdhui());
    toast(hausses ? `Séance enregistrée · ${hausses} exercice${hausses > 1 ? 's' : ''} en hausse` : 'Séance enregistrée');
    location.hash = '#/';
  },

  'ajouter-seance'() {
    const s = { id: identifiant('seance'), nom: 'Nouvelle séance', exercices: [] };
    etat.seances.push(s);
    sauver();
    location.hash = `#/seance/${s.id}/modifier`;
  },

  'ajouter-exo'() {
    const e = { id: identifiant('exo'), nom: 'Nouvel exercice', poids: [10, 10, 10, 10], reps: '', pas: null, note: '', ou: false };
    courante.exercices.push(e);
    sauver();
    rafraichir();
    const champ = app.querySelector(`[data-exo="${e.id}"] .nom`);
    champ.scrollIntoView({ block: 'center' });
    champ.focus();
    champ.select();
  },

  monter: b => deplacer(exoDe(b), -1),
  descendre: b => deplacer(exoDe(b), 1),

  'supprimer-exo'(b) {
    const e = exoDe(b);
    if (!confirm(`Supprimer « ${e.nom} » ?`)) return;
    courante.exercices = courante.exercices.filter(x => x !== e);
    sauver();
    rafraichir();
  },

  'supprimer-seance'() {
    if (!confirm(`Supprimer la séance « ${courante.nom} » ? L'historique est gardé.`)) return;
    etat.seances = etat.seances.filter(s => s !== courante);
    for (const j in etat.planning) if (etat.planning[j] === courante.id) delete etat.planning[j];
    if (etat.enCours?.seanceId === courante.id) etat.enCours = null;
    sauver();
    location.hash = '#/';
  },

  async installer() {
    if (!inviteInstall) return;
    inviteInstall.prompt();
    await inviteInstall.userChoice;
    inviteInstall = null;
    rafraichir();
  },

  'masquer-bandeau'() {
    etat.reglages.bandeauMasque = true;
    sauver();
    rafraichir();
  },

  async 'copier-lien'() {
    try {
      await navigator.clipboard.writeText(app.querySelector('.lien-auto').textContent);
      toast('Adresse copiée');
    } catch (e) { toast("Copie impossible : appuie longtemps sur l'adresse"); }
  },

  async exporter() {
    const fichier = new File([JSON.stringify(etat, null, 2)], `ma-seance-${aujourdhui()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: 'Sauvegarde Ma Séance' }); } catch (e) { /* partage annulé */ }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(fichier);
    a.download = fichier.name;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  reinitialiser() {
    if (!confirm('Tout effacer ? Tes séances, tes poids et ton historique seront perdus.')) return;
    etat = structuredClone(PROGRAMME_DEFAUT);
    sauver();
    location.hash = '#/';
    toast('Tout est remis à zéro');
  },
};

function changerPoids(e, i, sens) {
  e.poids[i] = Math.max(0, arrondi(e.poids[i] + sens * pasDe(e)));
  demarrer(courante.id);
  sauver();
  majCarte(e);
  vibrer();
}

function deplacer(e, sens) {
  const liste = courante.exercices;
  const i = liste.indexOf(e);
  const j = i + sens;
  if (j < 0 || j >= liste.length) return;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  sauver();
  rafraichir();
}

app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-action]');
  if (b && !b.disabled) ACTIONS[b.dataset.action]?.(b);
});

// Champs des pages « Modifier » et « Réglages » : enregistrés à chaque frappe, sans redessiner la page.
app.addEventListener('input', ev => {
  const champ = ev.target.dataset.champ;
  const v = ev.target.value;
  if (champ === 'seance-nom') {
    courante.nom = v.trim() || 'Séance';
    app.querySelector('[data-titre]').textContent = courante.nom;
  } else if (['nom', 'series', 'reps', 'pas', 'note', 'poids-serie'].includes(champ)) {
    const e = exoDe(ev.target);
    const n = lirePoids(v);
    if (champ === 'nom') e.nom = v.trim() || 'Exercice';
    if (champ === 'reps') e.reps = v.trim();
    if (champ === 'note') e.note = v.trim();
    if (champ === 'pas') e.pas = n > 0 ? n : null;
    if (champ === 'poids-serie' && n !== null) e.poids[Number(ev.target.dataset.i)] = n;
    if (champ === 'series' && n >= 1) {
      const nb = Math.min(12, Math.round(n));
      while (e.poids.length < nb) e.poids.push(e.poids.at(-1) ?? 0);
      e.poids.length = nb;
      ev.target.closest('.exo-edit').querySelector('.cases').innerHTML = casesPoids(e);
    }
  } else {
    return;
  }
  sauver();
});

app.addEventListener('change', async ev => {
  const champ = ev.target.dataset.champ;
  if (champ === 'ou') {
    exoDe(ev.target).ou = ev.target.checked;
    sauver();
  } else if (champ === 'planning') {
    const j = ev.target.dataset.jour;
    if (ev.target.value) etat.planning[j] = ev.target.value; else delete etat.planning[j];
    sauver();
  } else if (champ === 'pas-defaut') {
    etat.reglages.pas = Number(ev.target.value);
    sauver();
  } else if (champ === 'importer') {
    const fichier = ev.target.files[0];
    if (!fichier) return;
    try {
      const donnees = JSON.parse(await fichier.text());
      if (!Array.isArray(donnees.seances)) throw new Error('format');
      if (!confirm('Remplacer tes données actuelles par cette sauvegarde ?')) return;
      etat = { ...structuredClone(PROGRAMME_DEFAUT), ...donnees };
      sauver();
      toast('Sauvegarde importée');
      location.hash = '#/';
    } catch (e) {
      toast("Ce fichier n'est pas une sauvegarde Ma Séance");
    }
  }
});

let minuteurToast;
function toast(texte) {
  const el = document.getElementById('toast');
  el.textContent = texte;
  el.classList.add('visible');
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => el.classList.remove('visible'), 2600);
}

window.addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  inviteInstall = ev;
  if (!location.hash || location.hash === '#/') rafraichir();
});

window.addEventListener('hashchange', route);

// L'appli reste souvent ouverte en arrière-plan : au retour, on remet le bon jour à l'écran.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !app.querySelector('input:focus')) rafraichir();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

route();
