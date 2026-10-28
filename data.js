// Programme par défaut : chargé au premier lancement, ensuite tout vit sur le téléphone.
// Recopié de ses notes iPhone (captures du 28/10/2026).
// planning : numéro du jour (0 = dimanche, 1 = lundi … 6 = samedi) → id de la séance.
// poids : un poids par série, en kg (0 = poids du corps). reps est du texte libre (« 10 », « échec », « max ») ou vide.
// ou : true = au choix avec l'exercice juste au-dessus.

const ex = (id, nom, poids, autres = {}) => ({ id, nom, poids, reps: '', pas: null, note: '', ou: false, ...autres });

const PROGRAMME_DEFAUT = {
  version: 2,
  planning: { 1: 'pecs', 2: 'dos', 3: 'bras', 5: 'pecs', 6: 'bras', 0: 'dos' },
  seances: [
    {
      id: 'pecs',
      nom: 'Pecs',
      exercices: [
        ex('developpe-couche', 'Développé couché', [12, 12, 12, 14], { note: 'Haltères ou barre' }),
        ex('dips', 'Dips', [34, 34, 34], { reps: 'échec' }),
        ex('chest-press', 'Chest press', [18, 23, 32, 36]),
        ex('machine-un-bras', "Machine un bras vers l'avant", [8, 8, 8, 8], { note: "Comme une élévation latérale, mais vers l'avant" }),
        ex('pec-fly', 'Pec fly', [27, 32, 36, 41], { ou: true }),
      ],
    },
    {
      id: 'dos',
      nom: 'Dos',
      exercices: [
        ex('exo-photo-1', 'Exercice photo 1', [14, 14, 14, 16], { note: 'Voir la photo dans ta note' }),
        ex('exo-video-1', 'Exercice vidéo 1', [4, 4, 4, 6], { note: 'Voir la vidéo dans ta note' }),
        ex('tirage-vertical', 'Tirage vertical (machine)', [29, 29, 36, 36]),
        ex('tirage-horizontal', 'Tirage horizontal', [29, 29, 36, 36]),
        ex('tractions', 'Tractions', [0, 0, 0], { reps: 'max' }),
      ],
    },
    {
      id: 'bras',
      nom: 'Biceps et triceps',
      exercices: [
        ex('machine-biceps', 'Machine biceps', [18, 18, 18, 23]),
        ex('curl-poulie', 'Curl à la poulie', [9, 11, 13, 15]),
        ex('curl-marteau', 'Curl marteau', [12, 12, 12, 12]),
        ex('machine-triceps', 'Machine triceps (extension)', [27, 27, 32, 36]),
        ex('extension-poulie', 'Extension poulie', [13.6, 13.6, 15.9, 18], { pas: 2.3 }),
        ex('extension-tete', 'Extension au-dessus de la tête', [11, 11, 13.6, 13.6]),
      ],
    },
  ],
  historique: [],
  enCours: null,
  reglages: { pas: 2.5, bandeauMasque: false },
};
