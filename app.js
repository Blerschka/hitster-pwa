// ==== Spotify PKCE OAuth ====
const clientId = '6d0c030b54b54b84aaaed5fab18013e7';
const redirectUri = 'https://blerschka.github.io/hitster-pwa/';
let accessToken = null;
let player = null;
let currentTrackUri = null;
let qr = null;
let isPlaying = false;

// ===== PKCE Helper =====
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
function base64urlencode(a) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await window.crypto.subtle.digest('SHA-256', data);
}

// ==== Spotify Login mit PKCE ====
let codeVerifier = generateRandomString(128);

document.getElementById('login-btn').onclick = async () => {
  const codeChallenge = base64urlencode(await sha256(codeVerifier));
  const state = generateRandomString(16);

  // Scopes: für Web Playback + Steuerung
  const scope = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state'
  ].join(' ');

  // PKCE + State persistieren
  localStorage.setItem('code_verifier', codeVerifier);
  localStorage.setItem('pkce_state', state);

  const args = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge
  });

  window.location = `https://accounts.spotify.com/authorize?${args.toString()}`;
};

// ===== Access Token holen (nach Redirect) =====
async function getAccessTokenPKCE() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  const state  = params.get('state');

  // 1) Bereits ein Token vorhanden? (z. B. Reload ohne neuen Code)
  const savedToken = sessionStorage.getItem('spotify_access_token');
  const savedExp   = Number(sessionStorage.getItem('spotify_token_expires') || '0');
  const now = Date.now();
  if (savedToken && savedExp > now && !code) {
    accessToken = savedToken;
    await showPlayerAndScanner();
    return;
  }

  // 2) Kein Code in URL -> nichts zu tun
  if (!code) return;

  // 3) State + Verifier prüfen (sonst abbrechen)
  const expectedState = localStorage.getItem('pkce_state');
  const storedVerifier = localStorage.getItem('code_verifier');
  if (!state || state !== expectedState || !storedVerifier) {
    console.warn('Ungültiger Redirect: State/Verifier fehlt oder passt nicht.');
    cleanupQueryString();
    showLogin();
    return;
  }

  // UI: Loading
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('loading-info').style.display = 'block';
  document.getElementById('loading-text').innerText = "Player wird initialisiert...";

  // 4) Token-Tausch
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: storedVerifier
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error('Token-Tausch fehlgeschlagen:', data);
    // Aufräumen & zurück zum Login
    localStorage.removeItem('code_verifier');
    localStorage.removeItem('pkce_state');
    cleanupQueryString();
    document.getElementById('loading-info').style.display = 'none';
    showLogin("Login abgelaufen. Bitte erneut anmelden.");
    return;
  }

  // 5) Erfolg: Token cachen (Session), Verifier+State löschen, URL bereinigen
  accessToken = data.access_token;
  const expiresInMs = Number(data.expires_in || 3600) * 1000;
  sessionStorage.setItem('spotify_access_token', accessToken);
  sessionStorage.setItem('spotify_token_expires', String(Date.now() + expiresInMs));
  localStorage.removeItem('code_verifier');
  localStorage.removeItem('pkce_state');

  cleanupQueryString(); // ?code=...&state=... entfernen

  await showPlayerAndScanner();
}

function cleanupQueryString() {
  // URL auf Pfad ohne Query/Hash zurücksetzen (vermeidet erneuten Code-Tausch beim Reload)
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

function showLogin(hint) {
  if (hint) document.getElementById('song-status').innerText = hint;
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('player-section').style.display = 'none';
  document.getElementById('loading-info').style.display = 'none';
}

async function showPlayerAndScanner() {
  await loadSpotifyPlayer();
  document.getElementById('loading-info').style.display = 'none';
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('player-section').style.display = 'block';
  showQRScanner();
}

// ==== Spotify Web Playback SDK laden ====
function loadSpotifyPlayer() {
  return new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      player = new Spotify.Player({
        name: 'Hitster Geschenk Player',
        getOAuthToken: cb => cb(accessToken)
      });

      player.addListener('ready', ({ device_id }) => {
        window.spotifyDeviceId = device_id;
        resolve();
      });

      player.addListener('not_ready', ({ device_id }) => {
        console.log('Gerät nicht bereit', device_id);
      });

      player.connect();
    };

    if (!document.getElementById('spotify-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(script);
    }
  });
}

// ==== QR-Code Scanner (robust) ====
function showQRScanner() {
  document.getElementById('qr-reader').style.display = 'block';
  document.getElementById('play-btn').style.display = 'none';
  document.getElementById('pause-btn').style.display = 'none';
  document.getElementById('new-song-btn').style.display = 'none';
  document.getElementById('track-info').innerText = '';
  document.getElementById('song-status').innerText = '';

  if (!qr) qr = new Html5Qrcode("qr-reader");

  qr.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      const id = extractSpotifyTrackId(decodedText);
      if (id) {
        currentTrackUri = `spotify:track:${id}`;
        document.getElementById('track-info').innerText = "Track erkannt: " + id;
        qr.stop();
        document.getElementById('qr-reader').style.display = 'none';
        playTrack(currentTrackUri);
        document.getElementById('play-btn').style.display = 'inline-block';
        document.getElementById('pause-btn').style.display = 'inline-block';
        document.getElementById('new-song-btn').style.display = 'inline-block';
        updateSongStatus("Wird abgespielt...");
        isPlaying = true;
        updatePlayPauseButtons();
      } else {
        document.getElementById('track-info').innerText = "Kein gültiger Spotify-Link!";
      }
    }
  );
}

// Universelle Extraktion der TrackID aus URL oder URI
function extractSpotifyTrackId(text) {
  if (!text) return null;
  const s = text.trim();

  // 1) spotify:track:<ID>
  const uriMatch = s.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  if (uriMatch) return uriMatch[1];

  // 2) https?://open.spotify.com/(optional locale)/track/<ID>(?…)
  const urlMatch = s.match(/^https?:\/\/open\.spotify\.com\/(?:[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[?#].*)?$/i);
  if (urlMatch) return urlMatch[1];

  return null;
}

// ==== Spotify Track abspielen (mit Transfer) ====
async function playTrack(uri) {
  try {
    updateSongStatus("Lade Song...");

    // 1) Playback auf Web-Player übertragen und starten
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ device_ids: [window.spotifyDeviceId], play: true })
    });

    // 2) Jetzt auf diesem Device spielen
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${window.spotifyDeviceId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris: [uri] })
    });

    updateSongStatus("Wird abgespielt...");
    isPlaying = true;
    updatePlayPauseButtons();
  } catch (e) {
    console.error(e);
    updateSongStatus("Konnte Song nicht starten. Bitte erneut versuchen.");
  }
}

// ==== Play/Pause Buttons ====
function updatePlayPauseButtons() {
  document.getElementById('play-btn').style.display = isPlaying ? 'none' : 'inline-block';
  document.getElementById('pause-btn').style.display = isPlaying ? 'inline-block' : 'none';
}
document.getElementById('play-btn').onclick = () => {
  if (player) player.resume();
  isPlaying = true;
  updateSongStatus("Wird abgespielt...");
  updatePlayPauseButtons();
};
document.getElementById('pause-btn').onclick = () => {
  if (player) player.pause();
  isPlaying = false;
  updateSongStatus("Pausiert");
  updatePlayPauseButtons();
};

// ==== Neues Lied Button ====
document.getElementById('new-song-btn').onclick = () => {
  showQRScanner();
};

// ==== Song Status anzeigen ====
function updateSongStatus(text) {
  document.getElementById('song-status').innerText = text;
}

// ==== Nach erfolgreichem Login / Initialisierung ====
window.onload = async () => {
  await getAccessTokenPKCE();

  // Optional: Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }
};
