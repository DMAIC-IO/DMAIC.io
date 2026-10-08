/**
 * Kapitel-Sprungmarken im statischen Handbuch.
 *
 * Jeder Kapitel-Link ist ein Anker auf den Player und funktioniert ohne dieses
 * Skript — es spart nur das Suchen. Deshalb wird nichts verhindert, was ohne
 * JavaScript funktioniert: der Anker springt weiterhin, zusätzlich setzt das
 * Skript `currentTime`.
 */
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-video-sec][data-video-player]');
  if (!link) return;
  const player = document.getElementById(link.dataset.videoPlayer);
  if (!player) return;
  const sec = Number(link.dataset.videoSec);
  if (!Number.isFinite(sec)) return;
  // `preload="metadata"` heißt: die Dauer ist da, die Daten der Zielstelle
  // nicht. `currentTime` löst dann selbst ein Range-Request aus — es braucht
  // kein Warten auf `loadedmetadata`, solange die Metadaten schon geladen
  // sind. Sind sie es nicht, ist der Satz still wirkungslos, und der Anker
  // hat den Nutzer trotzdem zum Player gebracht.
  player.currentTime = sec;
  player.play?.().catch(() => { /* Autoplay darf blockiert sein — der Nutzer drückt dann selbst */ });
});
