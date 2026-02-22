// ==== Spotify PKCE OAuth ====
const clientId = '6d0c030b54b54b84aaaed5fab18013e7';
const redirectUri = 'https://blerschka.github.io/hitster-pwa/';
let accessToken = null;
let player = null;
let currentTrackUri = null;
let qr = null;
let isPlaying = false;

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
  try {
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
  } catch (err) {
    showError("Fehler beim Starten des Logins: " + err.message);
    console.error("Login-Fehler:", err);
  }
};

// Access Token holen (nach Redirect)
async function getAccessTokenPKCE() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  codeVerifier = localStorage.getItem('code_verifier');

  document.getElementById('login-section').style.display = 'none';
  document.getElementById('loading-info').style.display = 'block';
  document.getElementById('loading-text').innerText = "Player wird initialisiert...";

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier
  });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body
    });

    if (!response.ok) {
      const errorText = await response.text();
      showError("Token konnte nicht geholt werden: " + errorText);
      throw new Error("Token-Request fehlgeschlagen: " + errorText);
    }

    const data = await response.json();
    accessToken = data.access_token;

    if (!accessToken) {
      showError("Kein Access Token erhalten!");
      throw new Error("Kein Access Token erhalten!");
    }

    await loadSpotifyPlayer();

    document.getElementById('loading-info').style.display = 'none';
    document.getElementById('player-section').style.display = 'block';

    // Buttons nach Login anzeigen
    document.getElementById('play-btn').style.display = 'inline-block';
    document.getElementById('pause-btn').style.display = 'inline-block';
    document.getElementById('new-song-btn').style.display = 'inline-block';

    showQRScanner();
  } catch (err) {
    showError("Fehler beim Token holen: " + err.message);
    console.error("Token-Fehler:", err);
  }
}

// ==== Spotify Web Playback SDK laden ====
function loadSpotifyPlayer() {
  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      player = new Spotify.Player({
        name: 'Hitster Geschenk Player',
        getOAuthToken: cb => { cb(accessToken); }
      });

      player.addListener('ready', ({ device_id }) => {
        window.spotifyDeviceId = device_id;
        resolve();
      });

      player.addListener('not_ready', ({ device_id }) => {
        showError('Spotify-Player nicht bereit: ' + device_id);
        console.error('Gerät nicht bereit', device_id);
      });

      player.addListener('initialization_error', ({ message }) => {
        showError('Player-Initialisierungsfehler: ' + message);
        console.error('Player-Initialisierungsfehler:', message);
        reject(new Error(message));
      });

      player.addListener('authentication_error', ({ message }) => {
        showError('Player-Authentifizierungsfehler: ' + message);
        console.error('Player-Authentifizierungsfehler:', message);
        reject(new Error(message));
      });

      player.addListener('account_error', ({ message }) => {
        showError('Player-Accountfehler: ' + message);
        console.error('Player-Accountfehler:', message);
        reject(new Error(message));
      });

      player.addListener('playback_error', ({ message }) => {
        showError('Player-Playbackfehler: ' + message);
        console.error('Player-Playbackfehler:', message);
      });

      player.connect().catch(err => {
        showError('Fehler beim Verbinden des Players: ' + err.message);
        console.error('Player-Connect-Fehler:', err);
        reject(err);
      });
    };

    if (!document.getElementById('spotify-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onerror = () => {
        showError('Spotify SDK konnte nicht geladen werden!');
        reject(new Error('Spotify SDK konnte nicht geladen werden!'));
      };
      document.body.appendChild(script);
    }
  });
}

// ==== QR-Code Scanner ====
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
    (decodedText, decodedResult) => {
      try {
        if (decodedText.startsWith("https://open.spotify.com/track/")) {
          const trackId = decodedText.split("/track/")[1].split("?")[0];
          currentTrackUri = `spotify:track:${trackId}`;
          document.getElementById('track-info').innerText = "Track erkannt: " + trackId;
          qr.stop();
          document.getElementById('qr-reader').style.display = 'none';
          // Buttons nach QR-Scan anzeigen
          document.getElementById('play-btn').style.display = 'inline-block';
          document.getElementById('pause-btn').style.display = 'inline-block';
          document.getElementById('new-song-btn').style.display = 'inline-block';
          updateSongStatus("Song bereit. Drücke Play!");
          isPlaying = false;
          updatePlayPauseButtons();
        } else {
          document.getElementById('track-info').innerText = "Kein gültiger Spotify-Link!";
        }
      } catch (err) {
        showError("Fehler beim QR-Scan: " + err.message);
        console.error("QR-Scan-Fehler:", err);
      }
    },
    (errorMessage) => {
      showError("QR-Scanner Fehler: " + errorMessage);
      console.error("QR-Scanner Fehler:", errorMessage);
    }
  ).catch(err => {
    showError("QR-Scanner konnte nicht gestartet werden: " + err.message);
    console.error("QR-Scanner Start-Fehler:", err);
  });
}

// ==== Spotify Track abspielen ====
function playTrack(uri) {
  updateSongStatus("Lade Song...");
  fetch(`https://api.spotify.com/v1/me/player/play?device_id=${window.spotifyDeviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  }).then(response => {
    if (!response.ok) {
      response.text().then(text => {
        showError("Song konnte nicht abgespielt werden: " + text);
        console.error("Song-Playback-Fehler:", text);
      });
      updateSongStatus("Fehler beim Abspielen!");
      isPlaying = false;
      updatePlayPauseButtons();
      return;
    }
    updateSongStatus("Wird abgespielt...");
    isPlaying = true;
    updatePlayPauseButtons();
  }).catch(err => {
    showError("Fehler beim Song-Playback: " + err.message);
    console.error("Song-Playback-Fehler:", err);
    updateSongStatus("Fehler beim Abspielen!");
    isPlaying = false;
    updatePlayPauseButtons();
  });
}

// ==== Play/Pause Buttons ====
function updatePlayPauseButtons() {
  document.getElementById('play-btn').style.display = isPlaying ? 'none' : 'inline-block';
  document.getElementById('pause-btn').style.display = isPlaying ? 'inline-block' : 'none';
}

document.getElementById('play-btn').onclick = () => {
  if (!currentTrackUri) {
    showError("Kein Song geladen!");
    return;
  }
  playTrack(currentTrackUri); // Jetzt erst Song an Spotify schicken
};

document.getElementById('pause-btn').onclick = () => {
  if (player) {
    player.pause().catch(err => {
      showError("Fehler beim Pausieren: " + err.message);
      console.error("Pause-Fehler:", err);
    });
    isPlaying = false;
    updateSongStatus("Pausiert");
    updatePlayPauseButtons();
  } else {
    showError("Player nicht initialisiert!");
  }
};

// ==== Neues Lied Button ====
document.getElementById('new-song-btn').onclick = () => {
  showQRScanner();
};

// ==== Song Status anzeigen ====
function updateSongStatus(text) {
  document.getElementById('song-status').innerText = text;
}

// ==== Fehler anzeigen ====
function showError(msg) {
  let errorDiv = document.getElementById('error-message');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'error-message';
    errorDiv.style.color = 'red';
    errorDiv.style.margin = '10px';
    document.body.insertBefore(errorDiv, document.body.firstChild);
  }
  errorDiv.innerText = msg;
  setTimeout(() => { errorDiv.innerText = ''; }, 8000); // Fehler nach 8s ausblenden
}

// ==== Nach erfolgreichem Login ====
window.onload = async () => {
  try {
    await getAccessTokenPKCE();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(err => {
        showError("Service Worker konnte nicht registriert werden: " + err.message);
        console.error("Service Worker Fehler:", err);
      });
    }
  } catch (err) {
    showError("Fehler beim Initialisieren: " + err.message);
    console.error("Initialisierungsfehler:", err);
  }
};