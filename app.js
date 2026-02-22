// ==== Spotify OAuth ====
const clientId = '6d0c030b54b54b84aaaed5fab18013e7'; // <-- Hier deine Spotify Client ID eintragen!
const redirectUri = 'https://DEIN-USERNAME.github.io/DEIN-REPO/'; // <-- Deine GitHub Pages URL!
let accessToken = null;
let player = null;
let currentTrackUri = null;

// Spotify Login
document.getElementById('login-btn').onclick = () => {
  const scopes = 'streaming user-read-email user-read-private';
  window.location = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
};

// Token aus URL holen
function getTokenFromUrl() {
  const hash = window.location.hash;
  if (hash) {
    const params = new URLSearchParams(hash.substring(1));
    return params.get('access_token');
  }
  return null;
}

// Nach Login
window.onload = async () => {
  accessToken = getTokenFromUrl();
  if (accessToken) {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('player-section').style.display = 'block';
    await loadSpotifyPlayer();
    startQRScanner();
  }
  // Service Worker registrieren
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