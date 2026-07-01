# ⚽ Haxmake

Remake simpliste de Haxball jouable **en ligne entre amis sans aucun serveur à héberger**.

## 🚀 Installation

### 1. Installer les dépendances & lancer le jeu
```bash
npm install
npm start
```
Ouvre [http://localhost:8080](http://localhost:8080) dans ton navigateur.

### 2. Configurer Firebase (optionnel, pour le compte & le MMR)

Le jeu fonctionne **sans Firebase** (mode hors-ligne). Pour activer la connexion Google,
le MMR et le classement :

1. Va sur [console.firebase.google.com](https://console.firebase.google.com/)
2. Crée un projet, ajoute une **Web App**
3. Active **Authentication → Google Sign-in**
4. Crée une **Firestore Database** (mode test)
5. Copie `js/firebase-config.example.js` → `js/firebase-config.js`
6. Remplace les valeurs par celles de ton projet

> ⚠️ **Ne publie jamais ton `js/firebase-config.js`** — il contient tes clés.
> Le fichier est ignoré par git (voir `.gitignore`).

## 🎮 Comment jouer

### Créer une partie (Host)
1. Entre ton pseudo
2. Choisis le mode (🎮 Occasionnel / 🏆 Classé)
3. Clique **Créer une partie**
4. Partage le **code à 4 lettres** (ou le lien) à tes amis

### Rejoindre une partie
- Via le **code** : onglet Rejoindre
- Via la **liste des serveurs** : parties publiques détectées automatiquement
- Via un **lien** partagé (`?room=XXXX`)

### Contrôles
| Action | Touches |
|--------|---------|
| Déplacement | `↑ ↓ ← →` ou `Z Q S D` / `W A S D` |
| Tirer | `X` ou `Espace` |
| Passer le replay | `Espace` ou `X` |

## ✨ Fonctionnalités

- 🌐 **Multiplayer P2P** via WebRTC (aucun serveur de jeu)
- ⚽ **Physique** fluide (canvas 2D)
- 🏆 **Modes** : Occasionnel (sans MMR) / Classé (avec MMR)
- 🔐 **Connexion Google** (Firebase Auth)
- 📊 **Système de rang** (Bronze → Champion) basé sur le MMR
- 🎬 **Replays** synchronisés entre les joueurs après chaque but
- 🏳️ **Drapeaux de pays** affichés à côté des pseudos
- ⚡ **Détection de performance** (avertissement si accélération matérielle absente)
- 🤖 **Entraînement solo** contre un bot

## 🧩 Comment ça marche (réseau)

Le jeu utilise **WebRTC pair-à-pair** via [PeerJS](https://peerjs.com/) :
- Le serveur PeerJS public sert **uniquement** à la signalisation
- Tout le trafic de jeu passe **directement** entre les joueurs (P2P)
- L'hôte est **autoritaire** sur la physique et diffuse l'état du jeu
- **Aucun serveur de jeu à louer** — quand l'hôte quitte, la partie s'arrête

Jusqu'à **6 joueurs** (1v1, 2v2, 3v3). Premier à **5 buts** gagne.

## 🛠️ Stack technique

- **Frontend** : HTML5 Canvas, JavaScript vanilla (aucun framework)
- **Réseau** : [PeerJS](https://peerjs.com/) (WebRTC)
- **Backend** : [Firebase](https://firebase.google.com/) (Auth + Firestore) — optionnel
- **Serveur local** : Node.js (fichiers statiques)

## 📁 Structure du projet

```
haxmake/
├── index.html              # Structure HTML (menus, écrans)
├── server.js               # Serveur Node local (fichiers statiques)
├── package.json
├── css/
│   └── style.css           # Styles globaux
└── js/
    ├── config.js           # Configuration (physique, rangs, pays, etc.)
    ├── firebase-config.js  # 🔑 TES CLÉS (ignoré par git)
    ├── firebase-config.example.js  # Template à copier
    ├── physics.js          # Moteur physique
    ├── input.js            # Gestion clavier
    ├── game.js             # Moteur de jeu (sim + rendu)
    ├── net.js              # Couche réseau P2P
    └── main.js             # Logique principale (menus, loop)
```

## 📝 Note

Le serveur de signalisation PeerJS est gratuit mais peut parfois être lent.
Si la connexion échoue, recrée simplement une nouvelle partie.
