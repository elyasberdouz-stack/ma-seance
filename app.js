// Ma Séance : la séance du jour, le poids de chaque série, des boutons + / − pour les changer.
// Tout reste sur le téléphone (localStorage) : pas de compte, pas de serveur.
// Pages (dans l'adresse après #) : accueil, /go (ouvre direct la séance du jour : c'est la page de démarrage),
// /seance/<id>, /seance/<id>/modifier, /historique (calendrier du mois + séances), /nutrition, /reglages.
// Seule exception au « pas de serveur » : la nutrition envoie la photo du plat à l'IA d'Anthropic (Claude),
// avec la clé que l'utilisateur colle dans Réglages (gardée sur le téléphone, jamais dans le code en ligne).

const CLE = 'ma-seance-v1';
const CLE_IA = 'ma-seance-cle-ia'; // à part de l'état : n'apparaît pas dans les sauvegardes exportées
const MODELE_IA = 'claude-opus-5-5';
const SDK_IA = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm'; // chargé seulement quand on analyse une photo
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
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  couverts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17.5 21V3c-2.2 1.6-3.5 4.3-3.5 7.5V14h3.5"/></svg>',
};

const app = document.getElementById('app');
let etat = charger();
let courante = null;      // séance affichée (pages séance et modifier)
let inviteInstall = null; // Android : proposition d'installation gardée pour le bouton
let moisCal = null;       // calendrier : mois affiché « 2026-11 » (null = mois en cours)
let jourChoisi = null;    // calendrier : jour touché, détaillé sous la grille
let jourNutrition = null; // nutrition : jour affiché (null = aujourd'hui)
let analyse = null;       // nutrition : photo en cours { jour, etape, image, mini, precision, resultat, erreur }

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

// ---------- Calendrier : bleu = j'y suis allé, rouge = séance prévue mais pas allé, gris = repos ----------

const LIBELLES_JOUR = {
  present: 'séance faite', absent: 'pas allé', repos: 'repos', futur: 'à venir',
  avant: "avant le début du suivi", prevu: 'séance prévue aujourd\'hui',
};

// Premier jour suivi : avant, on ne sait pas, donc on ne met pas de rouge.
function debutSuivi() {
  return [etat.debut, etat.historique[0]?.date, ...etat.presences].filter(Boolean).sort()[0] || aujourdhui();
}

const seancesDu = cle => etat.historique.filter(h => h.date === cle);
const prevueLe = cle => seance(etat.planning[versDate(cle).getDay()]);

function statutJour(cle) {
  if (seancesDu(cle).length || etat.presences.includes(cle)) return 'present';
  const auj = aujourdhui();
  if (cle > auj) return 'futur';
  const prevue = prevueLe(cle);
  if (cle === auj) return prevue ? 'prevu' : 'repos';
  if (cle < debutSuivi()) return 'avant';
  return prevue ? 'absent' : 'repos';
}

function calendrier() {
  const auj = aujourdhui();
  const mois = moisCal || auj.slice(0, 7);
  const [a, m] = mois.split('-').map(Number);
  const decalage = (new Date(a, m - 1, 1).getDay() + 6) % 7; // semaine qui commence le lundi
  const nbJours = new Date(a, m, 0).getDate();
  let present = 0;
  let absent = 0;
  let cases = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(n => `<span class="cal-nom" aria-hidden="true">${n}</span>`).join('');
  cases += '<span aria-hidden="true"></span>'.repeat(decalage);
  for (let j = 1; j <= nbJours; j++) {
    const d = new Date(a, m - 1, j);
    const cle = cleJour(d);
    const st = statutJour(cle);
    if (st === 'present') present++;
    if (st === 'absent') absent++;
    const classes = `cal-jour ${st}${cle === auj ? ' auj' : ''}${cle === jourChoisi ? ' choisi' : ''}`;
    cases += `<button class="${classes}" data-action="choisir-jour" data-jour="${cle}" aria-pressed="${cle === jourChoisi}" aria-label="${dateLongue(d)} : ${LIBELLES_JOUR[st]}">${j}</button>`;
  }
  const taux = present + absent ? `${Math.round((100 * present) / (present + absent))} %` : '—';
  const detail = jourChoisi?.startsWith(mois) ? detailJour(jourChoisi) : '<p class="aide">Touche un jour pour voir ce que tu as fait.</p>';

  return `<section class="calendrier" aria-label="Calendrier de ${MOIS[m - 1]} ${a}">
      <div class="cal-tete">
        <button class="btn-rond petit" data-action="mois-precedent" aria-label="Mois précédent">${ICONES.retour}</button>
        <h2>${MOIS[m - 1]} ${a}</h2>
        <button class="btn-rond petit" data-action="mois-suivant" aria-label="Mois suivant"${mois >= auj.slice(0, 7) ? ' disabled' : ''}>${ICONES.chevron}</button>
      </div>
      <div class="cal-grille">${cases}</div>
      <div class="cal-legende" aria-hidden="true">
        <span><i class="pastille present"></i>J'y suis allé</span>
        <span><i class="pastille absent"></i>Pas allé</span>
        <span><i class="pastille repos"></i>Repos</span>
      </div>
      <div class="cal-bilan">
        <div class="present"><strong>${present}</strong><span>séance${present > 1 ? 's' : ''}</span></div>
        <div class="absent"><strong>${absent}</strong><span>ratée${absent > 1 ? 's' : ''}</span></div>
        <div><strong>${taux}</strong><span>de présence</span></div>
      </div>
      <div class="cal-detail">${detail}</div>
    </section>`;
}

function detailJour(cle) {
  const titre = `<p class="cal-date">${dateLongue(versDate(cle))}</p>`;
  const faites = seancesDu(cle);
  if (faites.length) {
    return titre + faites.map(h => `<p class="cal-seance">${esc(h.nom)}</p>
      <ul class="cal-exos">${h.exercices.map(x => `<li><span class="nom-exo">${esc(x.nom)}</span><span class="valeurs">${listeKg(x.poids)}</span></li>`).join('')}</ul>`).join('');
  }
  if (etat.presences.includes(cle)) {
    return `${titre}<p>Marqué à la main : tu y es allé.</p><button class="bouton-mini" data-action="retirer-presence">Retirer</button>`;
  }
  const prevue = prevueLe(cle);
  if (cle > aujourdhui()) return `${titre}<p>${prevue ? `Prévu : ${esc(prevue.nom)}` : 'Repos prévu'}</p>`;
  return `${titre}<p>${prevue ? `Prévu : ${esc(prevue.nom)}. ` : ''}Aucune séance enregistrée.</p>
    <button class="bouton-mini accent" data-action="ajouter-presence">J'y suis allé ce jour-là</button>`;
}

function pageHistorique() {
  const entete = `<header class="entete"><p class="surtitre">Ce que tu as fait</p><h1>Historique</h1></header>${calendrier()}`;
  if (!etat.historique.length) {
    return `${entete}<p class="vide espace">Pas encore de séance enregistrée. À la fin de ta séance, appuie sur <strong>Terminer la séance</strong> : le jour passera en bleu.</p>`;
  }

  const mois = aujourdhui().slice(0, 7);
  const ceMois = new Set([...etat.historique.map(h => h.date), ...etat.presences].filter(d => d.startsWith(mois))).size; // comme le calendrier

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

// ---------- Nutrition : photo du plat → l'IA estime calories et macros ----------

const lireCleIA = () => { try { return localStorage.getItem(CLE_IA) || ''; } catch (e) { return ''; } };
const kcal = n => Math.round(n).toLocaleString('fr-FR');
const grammes = n => `${Math.round(n)} g`;

function somme(liste) {
  return liste.reduce((t, r) => ({
    kcal: t.kcal + (r.kcal || 0), proteines: t.proteines + (r.proteines || 0),
    glucides: t.glucides + (r.glucides || 0), lipides: t.lipides + (r.lipides || 0),
  }), { kcal: 0, proteines: 0, glucides: 0, lipides: 0 });
}

const barre = (valeur, objectif) => (objectif
  ? `<div class="barre${valeur > objectif ? ' depasse' : ''}"><span style="width:${Math.min(100, (100 * valeur) / objectif)}%"></span></div>`
  : '');

function pageNutrition() {
  const auj = aujourdhui();
  const jour = jourNutrition || auj;
  const repas = etat.repas.filter(r => r.date === jour);
  const t = somme(repas);
  const { objectifKcal: objK, objectifProteines: objP } = etat.reglages;
  const veille = cleJour(new Date(versDate(jour).getTime() - 864e5));

  let html = `<header class="entete"><p class="surtitre">Ce que tu manges</p><h1>Nutrition</h1></header>
    <div class="choix-jour">
      <button class="btn-rond petit" data-action="jour-nutri" data-jour="${veille}" aria-label="Jour précédent">${ICONES.retour}</button>
      <p>${jour === auj ? "Aujourd'hui" : dateLongue(versDate(jour))}</p>
      <button class="btn-rond petit" data-action="jour-nutri" data-jour="${cleJour(new Date(versDate(jour).getTime() + 864e5))}" aria-label="Jour suivant"${jour >= auj ? ' disabled' : ''}>${ICONES.chevron}</button>
    </div>
    <section class="carte-nutri">
      <p class="etiquette">Calories</p>
      <p class="gros"><strong>${kcal(t.kcal)}</strong><span>${objK ? `/ ${kcal(objK)} kcal` : 'kcal'}</span></p>
      ${barre(t.kcal, objK)}
      <div class="macros">
        <div><strong>${objP ? `${Math.round(t.proteines)}<small> / ${objP} g</small>` : grammes(t.proteines)}</strong><span>Protéines</span>${barre(t.proteines, objP)}</div>
        <div><strong>${grammes(t.glucides)}</strong><span>Glucides</span></div>
        <div><strong>${grammes(t.lipides)}</strong><span>Lipides</span></div>
      </div>
      ${objK ? '' : '<p class="aide">Fixe tes objectifs dans <a href="#/reglages">Réglages</a>.</p>'}
    </section>`;

  html += analyse?.jour === jour ? carteAnalyse() : boutonsAjout();

  html += `<h3 class="titre-section">Repas${repas.length ? ` · ${repas.length}` : ''}</h3>`;
  html += repas.length
    ? `<div class="journal">${repas.map(carteRepas).join('')}</div>`
    : '<p class="vide">Rien de noté ce jour-là.</p>';

  // Les 7 jours avant celui affiché, pour voir la tendance.
  const jours = Array.from({ length: 7 }, (_, i) => cleJour(new Date(versDate(auj).getTime() - i * 864e5)));
  html += `<h3 class="titre-section">7 derniers jours</h3>
    <ul class="semaine-nutri">${jours.map(j => {
      const s = somme(etat.repas.filter(r => r.date === j));
      return `<li><button data-action="jour-nutri" data-jour="${j}"${j === jour ? ' aria-current="true"' : ''}>
        <span class="nom-exo">${j === auj ? "Aujourd'hui" : dateCourte(j)}</span>
        <span class="valeurs">${s.kcal ? `${kcal(s.kcal)} kcal · ${grammes(s.proteines)} prot.` : '—'}</span></button></li>`;
    }).join('')}</ul>`;
  return html;
}

function boutonsAjout() {
  const photo = lireCleIA()
    ? `<label class="bouton-principal photo" for="photo-plat">${ICONES.photo}<span>Prendre mon plat en photo</span></label>`
    : `<div class="bandeau"><p>Pour estimer tes plats en photo, l'appli a besoin d'une <strong>clé IA</strong>. Ça se règle une seule fois.</p>
        <div class="bandeau-actions"><a class="bouton-mini accent" href="#/reglages/cle-ia">Brancher l'IA</a></div></div>`;
  return `<div class="ajout">${photo}<button class="bouton-secondaire" data-action="repas-manuel">+ Ajouter à la main</button></div>`;
}

function carteAnalyse() {
  const a = analyse;
  const img = `<img class="photo-plat" src="${a.image}" alt="Ton plat">`;
  if (a.etape === 'apercu') {
    return `<section class="analyse">${img}
      <label class="champ"><span>Précision (facultatif)</span>
        <input data-champ="precision" value="${esc(a.precision)}" placeholder="ex. cuit à l'huile, j'en ai mangé la moitié" enterkeyhint="go"></label>
      <button class="bouton-principal" data-action="analyser">Estimer les calories</button>
      <button class="lien-danger centre" data-action="annuler-analyse">Annuler</button>
    </section>`;
  }
  if (a.etape === 'calcul') {
    return `<section class="analyse">${img}<p class="attente" role="status"><span class="rond-attente" aria-hidden="true"></span>L'IA regarde ton plat… (10 à 20 s)</p></section>`;
  }
  if (a.etape === 'erreur') {
    return `<section class="analyse">${img}<p class="erreur" role="alert">${esc(a.erreur)}</p>
      <div class="rangee"><button class="bouton-mini accent" data-action="analyser">Réessayer</button><button class="bouton-mini" data-action="annuler-analyse">Annuler</button></div>
    </section>`;
  }
  const r = a.resultat;
  if (!r.est_un_plat || !r.aliments.length) {
    return `<section class="analyse">${img}<p class="erreur" role="alert">Je ne vois pas de nourriture sur cette photo.</p>
      <div class="rangee"><button class="bouton-mini" data-action="annuler-analyse">Reprendre une photo</button></div></section>`;
  }
  const t = somme(r.aliments);
  return `<section class="analyse">${img}
    <h2>${esc(r.plat)}</h2>
    <p class="kcal-resultat"><strong>≈ ${kcal(t.kcal)} kcal</strong><span>entre ${kcal(r.kcal_min)} et ${kcal(r.kcal_max)}</span></p>
    <p class="macros-ligne">Protéines ${grammes(t.proteines)} · Glucides ${grammes(t.glucides)} · Lipides ${grammes(t.lipides)}</p>
    <ul class="aliments">${r.aliments.map(x => `<li><span class="nom-exo">${esc(x.nom)}<small>${esc(x.quantite)}</small></span><span class="valeurs">${kcal(x.kcal)} kcal</span></li>`).join('')}</ul>
    ${r.remarque ? `<p class="note">${esc(r.remarque)}</p>` : ''}
    <button class="bouton-principal" data-action="valider-repas">Ajouter à ma journée</button>
    <div class="rangee centre"><button class="bouton-mini" data-action="corriger-analyse">Corriger</button><button class="bouton-mini" data-action="annuler-analyse">Annuler</button></div>
  </section>`;
}

function carteRepas(r) {
  const visuel = r.mini ? `<img class="mini" src="${r.mini}" alt="">` : `<span class="mini vide-mini">${ICONES.couverts}</span>`;
  const details = r.aliments?.length
    ? `<ul>${r.aliments.map(x => `<li><span class="nom-exo">${esc(x.nom)}<small>${esc(x.quantite)}</small></span><span class="valeurs">${kcal(x.kcal)} kcal</span></li>`).join('')}</ul>`
    : '';
  return `<details class="entree repas"><summary>${visuel}
      <span class="nom">${esc(r.plat)}<small>${r.heure ? `${r.heure} · ` : ''}P ${grammes(r.proteines)}${r.aliments?.length ? ` · G ${grammes(r.glucides)} · L ${grammes(r.lipides)}` : ''}</small></span>
      <span class="kcal-repas">${kcal(r.kcal)}<small>kcal</small></span></summary>
    ${details}
    <button class="lien-danger" data-action="supprimer-repas" data-id="${r.id}">Supprimer ce repas</button>
  </details>`;
}

// Photo du téléphone → une image de 1024 px max pour l'IA, et une vignette de 120 px pour la liste.
async function chargerPhoto(fichier) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); // decode() peut rester bloqué
    const reduire = (max, qualite) => {
      const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * r);
      c.height = Math.round(img.naturalHeight * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', qualite);
    };
    return { image: reduire(1024, 0.82), mini: reduire(120, 0.6) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ALIMENT = {
  type: 'object',
  properties: {
    nom: { type: 'string' },
    quantite: { type: 'string' },
    kcal: { type: 'number' },
    proteines: { type: 'number' },
    glucides: { type: 'number' },
    lipides: { type: 'number' },
  },
  required: ['nom', 'quantite', 'kcal', 'proteines', 'glucides', 'lipides'],
  additionalProperties: false,
};

const SCHEMA_REPAS = {
  type: 'object',
  properties: {
    est_un_plat: { type: 'boolean' },
    plat: { type: 'string' },
    aliments: { type: 'array', items: ALIMENT },
    kcal_min: { type: 'number' },
    kcal_max: { type: 'number' },
    remarque: { type: 'string' },
  },
  required: ['est_un_plat', 'plat', 'aliments', 'kcal_min', 'kcal_max', 'remarque'],
  additionalProperties: false,
};

const CONSIGNE_IA = `Tu estimes les calories et les macronutriments d'un repas à partir d'une photo, pour une appli de suivi personnelle.

Repère chaque aliment visible et estime sa quantité à partir de la taille de l'assiette, des couverts ou de l'emballage. Pour chacun, donne les kcal, protéines, glucides et lipides en grammes. Compte l'huile de cuisson, le beurre et les sauces probables même s'ils ne se voient pas, parce que c'est là que les estimations se trompent le plus. Si l'utilisateur ajoute une précision, elle passe avant ce que tu vois sur la photo.

Tout est en français. « plat » : un nom court du repas (« Poulet, riz et haricots »). « quantite » : la quantité estimée (« 200 g », « 1 cuillère à soupe »). kcal_min et kcal_max : la fourchette réaliste du repas entier. « remarque » : une phrase courte qui tutoie et dit ce qui rend l'estimation incertaine, ou une chaîne vide.

Si la photo ne montre pas de nourriture, mets est_un_plat à false, aliments vide et des zéros.`;

class ErreurIA extends Error {}

async function estimerRepas(image, precision) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import(SDK_IA));
  } catch (e) {
    throw new ErreurIA("Pas de réseau : l'analyse a besoin d'internet.");
  }
  const client = new Anthropic({ apiKey: lireCleIA(), dangerouslyAllowBrowser: true, maxRetries: 1 });
  let reponse;
  try {
    reponse = await client.beta.messages.create({
      model: MODELE_IA,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // si le modèle refuse, Anthropic relance la demande sur un autre modèle
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_REPAS } },
      system: CONSIGNE_IA,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.split(',')[1] } },
          { type: 'text', text: precision ? `Précision de l'utilisateur : ${precision}` : 'Estime ce repas.' },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErreurIA('Clé IA refusée : vérifie-la dans Réglages.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new ErreurIA("Cette clé n'a pas le droit d'utiliser l'IA : vérifie ton compte Anthropic.");
    if (e instanceof Anthropic.RateLimitError) throw new ErreurIA('Trop de demandes d\'un coup : attends une minute et réessaie.');
    if (e instanceof Anthropic.BadRequestError) throw new ErreurIA("Demande refusée par l'IA. Si ça continue, regarde s'il te reste du crédit sur console.anthropic.com.");
    if (e instanceof Anthropic.APIConnectionError) throw new ErreurIA("Pas de réseau : l'analyse a besoin d'internet.");
    if (e instanceof Anthropic.APIError) throw new ErreurIA("Le service IA ne répond pas bien en ce moment : réessaie dans un instant.");
    throw e;
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurIA("L'IA n'a pas voulu analyser cette photo.");
  if (reponse.stop_reason === 'max_tokens') throw new ErreurIA('Réponse coupée : réessaie.');
  const texte = reponse.content.find(b => b.type === 'text')?.text;
  try { return JSON.parse(texte); } catch (e) { throw new ErreurIA('Réponse illisible : réessaie.'); }
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

    <h3 class="titre-section">Nutrition : tes objectifs par jour</h3>
    <div class="bloc">
      <label class="ligne-jour"><span>Calories (kcal)</span><input type="text" inputmode="numeric" data-champ="objectif-kcal" value="${etat.reglages.objectifKcal ?? ''}" placeholder="ex. 2600"></label>
      <label class="ligne-jour"><span>Protéines (g)</span><input type="text" inputmode="numeric" data-champ="objectif-proteines" value="${etat.reglages.objectifProteines ?? ''}" placeholder="ex. 150"></label>
    </div>

    <h3 class="titre-section" id="cle-ia">Clé IA pour les photos de plats</h3>
    <div class="bloc texte">
      <p>L'estimation des calories passe par l'IA d'Anthropic (Claude). À faire une seule fois :</p>
      <ol class="etapes">
        <li>Va sur <strong>console.anthropic.com</strong> et crée un compte.</li>
        <li><strong>Billing</strong> : ajoute du crédit. Compte environ 2 centimes par photo : 5 $ font à peu près 250 photos.</li>
        <li><strong>API Keys</strong> → <strong>Create Key</strong>, puis copie la clé.</li>
        <li>Colle-la ici :</li>
      </ol>
      <input type="password" data-champ="cle-ia" value="${esc(lireCleIA())}" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Clé IA">
      <p class="aide"><strong data-etat-cle>${lireCleIA() ? 'Clé enregistrée ✓' : 'Pas encore de clé.'}</strong> Elle reste sur ce téléphone : elle n'est ni dans le code en ligne ni dans tes sauvegardes.</p>
    </div>

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
  else if (page === 'nutrition') app.innerHTML = pageNutrition();
  else if (page === 'reglages') app.innerHTML = pageReglages();
  else app.innerHTML = pageAccueil();

  const onglet = ['historique', 'nutrition', 'reglages'].includes(page) ? page : 'accueil';
  document.querySelectorAll('.nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.page === onglet));
  const cible = page === 'reglages' && id && document.getElementById(id); // #/reglages/cle-ia
  if (cible) cible.scrollIntoView(); else window.scrollTo(0, 0);
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

  // --- Calendrier ---
  'mois-precedent': () => changerMois(-1),
  'mois-suivant': () => changerMois(1),

  'choisir-jour'(b) {
    jourChoisi = jourChoisi === b.dataset.jour ? null : b.dataset.jour;
    rafraichir();
  },

  'ajouter-presence'() {
    if (!etat.presences.includes(jourChoisi)) etat.presences.push(jourChoisi);
    sauver();
    rafraichir();
    toast('Jour marqué en bleu');
  },

  'retirer-presence'() {
    etat.presences = etat.presences.filter(j => j !== jourChoisi);
    sauver();
    rafraichir();
  },

  // --- Nutrition ---
  'jour-nutri'(b) {
    jourNutrition = b.dataset.jour === aujourdhui() ? null : b.dataset.jour;
    rafraichir();
  },

  async analyser() {
    const a = analyse;
    a.etape = 'calcul';
    rafraichir();
    try {
      a.resultat = await estimerRepas(a.image, a.precision.trim());
      a.etape = 'resultat';
    } catch (e) {
      a.etape = 'erreur';
      a.erreur = e instanceof ErreurIA ? e.message : "Quelque chose n'a pas marché : réessaie.";
    }
    if (analyse === a && location.hash.startsWith('#/nutrition')) rafraichir();
  },

  'corriger-analyse'() {
    analyse.etape = 'apercu';
    rafraichir();
    app.querySelector('[data-champ="precision"]')?.focus();
  },

  'annuler-analyse'() {
    analyse = null;
    rafraichir();
  },

  'valider-repas'() {
    const { resultat: r, mini, jour } = analyse;
    const t = somme(r.aliments);
    ajouterRepas(jour, { plat: r.plat, aliments: r.aliments, ...t, kcalMin: r.kcal_min, kcalMax: r.kcal_max, mini });
    analyse = null;
    rafraichir();
    toast(`${kcal(t.kcal)} kcal ajoutées`);
  },

  'repas-manuel'() {
    const plat = prompt("Qu'as-tu mangé ?");
    if (!plat?.trim()) return;
    const k = lirePoids(prompt('Combien de calories (kcal) ?') ?? '');
    if (k === null) { toast('Calories non comprises'); return; }
    const p = lirePoids(prompt('Et de protéines (g) ? Laisse vide si tu ne sais pas.') ?? '') ?? 0;
    ajouterRepas(jourNutrition || aujourdhui(), { plat: plat.trim(), aliments: [], kcal: k, proteines: p, glucides: 0, lipides: 0 });
    rafraichir();
  },

  'supprimer-repas'(b) {
    const r = etat.repas.find(x => x.id === b.dataset.id);
    if (!r || !confirm(`Supprimer « ${r.plat} » ?`)) return;
    etat.repas = etat.repas.filter(x => x !== r);
    sauver();
    rafraichir();
  },

  reinitialiser() {
    if (!confirm('Tout effacer ? Tes séances, tes poids et ton historique seront perdus.')) return;
    etat = structuredClone(PROGRAMME_DEFAUT);
    etat.debut = aujourdhui();
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

function changerMois(sens) {
  const [a, m] = (moisCal || aujourdhui().slice(0, 7)).split('-').map(Number);
  const cle = cleJour(new Date(a, m - 1 + sens, 1)).slice(0, 7);
  moisCal = cle === aujourdhui().slice(0, 7) ? null : cle;
  jourChoisi = null;
  rafraichir();
}

// Les vignettes de plus de 7 jours sont retirées : le téléphone ne garde que quelques Mo pour l'appli.
function ajouterRepas(jour, repas) {
  const maintenant = new Date();
  const heure = jour === aujourdhui() ? `${maintenant.getHours()}h${String(maintenant.getMinutes()).padStart(2, '0')}` : '';
  const arrondis = { kcal: Math.round(repas.kcal), proteines: Math.round(repas.proteines), glucides: Math.round(repas.glucides), lipides: Math.round(repas.lipides) };
  etat.repas.push({ id: identifiant('repas'), date: jour, heure, ...repas, ...arrondis });
  etat.repas.sort((a, b) => a.date.localeCompare(b.date));
  const limite = cleJour(new Date(maintenant.getTime() - 7 * 864e5));
  etat.repas.forEach(r => { if (r.mini && r.date < limite) delete r.mini; });
  sauver();
}

app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-action]');
  if (b && !b.disabled) ACTIONS[b.dataset.action]?.(b);
});

// Champs des pages « Modifier » et « Réglages » : enregistrés à chaque frappe, sans redessiner la page.
app.addEventListener('input', ev => {
  const champ = ev.target.dataset.champ;
  const v = ev.target.value;
  if (champ === 'precision') {
    analyse.precision = v;
    return;
  }
  if (champ === 'cle-ia') {
    try {
      if (v.trim()) localStorage.setItem(CLE_IA, v.trim()); else localStorage.removeItem(CLE_IA);
      app.querySelector('[data-etat-cle]').textContent = v.trim() ? 'Clé enregistrée ✓' : 'Pas encore de clé.';
    } catch (e) { toast("Impossible d'enregistrer la clé sur ce téléphone"); }
    return;
  }
  if (champ === 'objectif-kcal' || champ === 'objectif-proteines') {
    const n = lirePoids(v);
    etat.reglages[champ === 'objectif-kcal' ? 'objectifKcal' : 'objectifProteines'] = n > 0 ? Math.round(n) : null;
  } else if (champ === 'seance-nom') {
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

// Le champ photo est hors de la page (dans index.html) : au retour de l'appareil photo, l'iPhone
// redessine la page (visibilitychange) et un champ recréé entre-temps perdrait la photo choisie.
document.getElementById('photo-plat').addEventListener('change', async ev => {
  const fichier = ev.target.files[0];
  ev.target.value = ''; // pour pouvoir reprendre la même photo
  if (!fichier) return;
  try {
    const { image, mini } = await chargerPhoto(fichier);
    analyse = { jour: jourNutrition || aujourdhui(), etape: 'apercu', image, mini, precision: '' };
    rafraichir();
  } catch (e) {
    toast("Cette photo n'a pas pu être lue");
  }
});

// Touche « Entrée » dans la précision : lance l'analyse.
app.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.dataset.champ === 'precision') ACTIONS.analyser();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Premier jour suivi par le calendrier (avant : pas de rouge).
if (!etat.debut) {
  etat.debut = etat.historique[0]?.date || aujourdhui();
  sauver();
}

route();
