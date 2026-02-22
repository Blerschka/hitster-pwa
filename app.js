// ==== Spotify PKCE OAuth ====
const clientId = '6d0c030b54b54b84aaaed5fab18013e7';
const redirectUri = 'https://blerschka.github.io/hitster-pwa/';
let accessToken = null;
let player = null;
let currentTrackUri = null;

// PKCE Hilfsfunktionen
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
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

// Spotify Login mit PKCE
let codeVerifier = generateRandomString(128);

document.getElementById('login-btn').onclick = async () => {
  const codeChallenge = base64urlencode(await sha256(codeVerifier));
  const state = generateRandomString(16);
  const scope = 'streaming user-read-email user-read-private';

  localStorage.setItem('code_verifier', codeVerifier);

  const args = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scope,
    redirect_uri: redirectUri,
    state: state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge
  });

  window.location = `https://accounts.spotify.com/authorize?${args.toString()}`;
};

// Access Token holen (nach Redirect)
async function getAccessTokenPKCE() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  codeVerifier = localStorage.getItem('code_verifier');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body
  });

  const data = await response.json();
  accessToken = data.access_token;

  // Jetzt kannst du den Spotify Player initialisieren und QR-Code-Scanner starten!
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('player-section').style.display = 'block';
  await loadSpotifyPlayer();
  startQRScanner();
}

// Nach erfolgreichem Login
window.onload = async () => {
  await getAccessTokenPKCE();
  if (accessToken) {
    await loadSpotifyPlayer(); // Player sofort initialisieren!
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('player-section').style.display = 'block';
    startQRScanner();
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }
};

// ==== Spotify Web Playback SDK laden ====
function loadSpotifyPlayer() {
  return new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      player = new Spotify.Player({
        name: 'Hitster Geschenk Player',
        getOAuthToken: cb => { cb(accessToken); }
      });

      // Player Events
      player.addListener('ready', ({ device_id }) => {
        window.spotifyDeviceId = device_id;
        resolve();
      });

      player.addListener('not_ready', ({ device_id }) => {
        console.log('Gerät nicht bereit', device_id);
      });

      player.connect();
    };

    // SDK laden
    if (!document.getElementById('spotify-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(script);
    }
  });
}

// ==== QR-Code Scanner ====
function startQRScanner() {
  const qr = new Html5Qrcode("qr-reader");
  qr.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    (decodedText, decodedResult) => {
      // QR-Code erkannt
      if (decodedText.startsWith("https://open.spotify.com/track/")) {
        const trackId = decodedText.split("/track/")[1].split("?")[0];
        currentTrackUri = `spotify:track:${trackId}`;
        document.getElementById('track-info').innerText = "Track erkannt: " + trackId;
        playTrack(currentTrackUri);
      } else {
        document.getElementById('track-info').innerText = "Kein gültiger Spotify-Link!";
      }
    }
  );
}

// ==== Spotify Track abspielen ====
function playTrack(uri) {
  fetch(`https://api.spotify.com/v1/me/player/play?device_id=${window.spotifyDeviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  });
}

// ==== Play/Pause Buttons ====
document.getElementById('play-btn').onclick = () => {
  if (player) player.resume();
};
document.getElementById('pause-btn').onclick = () => {
  if (player) player.pause();
};