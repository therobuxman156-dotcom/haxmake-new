// ── Haxmake – Firebase config (À REMPLIR) ──
// 1. Va sur https://console.firebase.google.com/
// 2. Crée un projet
// 3. Ajoute une Web App, copie la config ci-dessous
// 4. Active Auth > Google Sign-in
// 5. Crée une Firestore Database (mode test pour commencer)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCLWPtjCq8aVPCAXBHWBcCMc6jWubG4lws",
  authDomain: "haxmake.firebaseapp.com",
  projectId: "haxmake",
  storageBucket: "haxmake.firebasestorage.app",
  messagingSenderId: "590360371220",
  appId: "1:590360371220:web:e3346a6f3534bbcc728701"
};

const Auth = (() => {
  let app = null, auth = null, db = null;
  let currentUser = null;
  let profile = null; // { mmr, wins, losses }
  let onProfileChange = null;

  function ready() {
    return FIREBASE_CONFIG.apiKey !== "TA_API_KEY";
  }

  function init() {
    if (!ready()) return false;
    try {
      app = firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.onAuthStateChanged(async (user) => {
        currentUser = user;
        if (user) await loadProfile();
        if (onProfileChange) onProfileChange();
      });
      return true;
    } catch (e) {
      console.log('[Firebase] init failed', e);
      return false;
    }
  }

  async function signIn() {
    if (!ready()) { alert("Firebase non configuré. Remplis js/firebase-config.js"); return; }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (e) { console.log('[Firebase] sign in failed', e); }
  }

  function signOut() { if (ready()) auth.signOut(); }

  async function loadProfile() {
    if (!currentUser || !db) return;
    const ref = db.collection('players').doc(currentUser.uid);
    const doc = await ref.get();
    if (doc.exists) {
      profile = doc.data();
    } else {
      profile = { mmr: 0, wins: 0, losses: 0, displayName: currentUser.displayName, country: localStorage.getItem('haxmake_country') || 'FR' };
      await ref.set(profile);
    }
    if (profile.mmr === undefined) profile.mmr = 0;
    if (profile.wins === undefined) profile.wins = 0;
    if (profile.losses === undefined) profile.losses = 0;
  }

  async function applyResult(win, isRanked) {
    if (!currentUser || !db || !profile) return;
    if (isRanked) {
      if (win) { profile.mmr += CFG.MMR_WIN; profile.wins++; }
      else { profile.mmr = Math.max(0, profile.mmr - CFG.MMR_LOSS); profile.losses++; }
      if (profile.mmr > 1000) profile.mmr = 1000;
    } else {
      // Casual: track W/L but no MMR change
      if (win) profile.wins++; else profile.losses++;
    }
    await db.collection('players').doc(currentUser.uid).set(profile);
    if (onProfileChange) onProfileChange();
  }

  async function setCountry(code) {
    localStorage.setItem('haxmake_country', code);
    if (currentUser && db && profile) { profile.country = code; await db.collection('players').doc(currentUser.uid).set(profile); }
    if (onProfileChange) onProfileChange();
  }

  function getCountry() {
    return (profile && profile.country) || localStorage.getItem('haxmake_country') || 'FR';
  }

  function getName() {
    if (!currentUser) return null;
    return profile?.displayName || currentUser.displayName || 'Joueur';
  }

  return {
    init, signIn, signOut, applyResult, loadProfile, setCountry,
    get isReady() { return ready(); },
    get isLoggedIn() { return !!currentUser; },
    get mmr() { return profile?.mmr ?? 0; },
    get wins() { return profile?.wins ?? 0; },
    get losses() { return profile?.losses ?? 0; },
    get name() { return getName(); },
    get country() { return getCountry(); },
    set onProfileChange(v) { onProfileChange = v; },
  };
})();
