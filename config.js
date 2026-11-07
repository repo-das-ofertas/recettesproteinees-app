// Buyer gate: accessKey = chave pública k (hex) da oferta; vem de instalacao.script do diagnóstico.
export const CONFIG = Object.freeze({
  version: '0.2.12',
  dataVersion: 'Produit app-content v0.3.6',
  dataUrl: './data/recettes.json',
  ingredientUrl: './data/nutrition.json',
  accessUrl: 'https://painel.labofertas.com/api/app/acesso',
  accessKey: '32718227c9bc42596f45178a0cd614fd',
  // Static hosting limitation: this path is obfuscated, NOT server-authorized.
  // No PDF precache or loose link. The app fetches it only after confirmation.
  bonusAsset: './assets/guide-v036-24b5244c67df36ad027f40135eab190a.pdf',
  demoCodes: [],
  demoEmails: [],
  storageKey: 'proteicas-fr-v2',
  production: true,
  accessMode: 'email'
});
