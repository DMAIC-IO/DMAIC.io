/**
 * Der Videoabschnitt einer Handbuchseite.
 *
 * Abgespielt wird mit dem **nativen `<video>`-Element** gegen die eigene
 * Auslieferung — kein YouTube-Embed: das setzt Cookies, braucht eine
 * Einwilligung und bricht bei jeder Folgeversion, weil eine neue Fassung dort
 * eine neue ID bekommt.
 *
 * Unter dem Player steht nur die eingeklappte Kapitelliste, in einem nativen
 * `<details>`: ausgeklappt ist sie eine vollständige Sprungliste, eingeklappt
 * kostet sie eine Zeile. Keine Laufzeit — die zeigt die Steuerleiste des
 * Players bereits an — und kein Modul-Link, den die Seite schon prominenter
 * führt. Ohne JavaScript bleibt sie brauchbar —
 * jeder Eintrag ist ein Anker auf den Player, und `<details>` klappt von
 * selbst auf. Liegt `assets/video-chapters.js` vor, setzt es zusätzlich
 * `currentTime` und spart das Suchen.
 *
 * Datenquelle ist `videos/index.json`, die erzeugte Videodatendatei.
 */
import { escapeAttr, escapeHtml, pick } from './escape.mjs';

/**
 * `m:ss`, beginnend bei `0:00`.
 *
 * Bewusste Doppelung: derselbe Zeitstempel steht auch in den Beschreibungen,
 * die zu einem Video mitgeliefert werden, und der Generator dafür teilt
 * keinen Code mit dieser Datei. Der Test daneben schreibt die Beispielwerte
 * fest, damit eine Abweichung auffällt.
 *
 * @param {number} sec @returns {string}
 */
export function formatTimestamp(sec) {
  const whole = Math.floor(sec);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** @param {{entries?: object[]}|undefined} videos @returns {object[]} */
function entriesOf(videos) {
  return Array.isArray(videos?.entries) ? videos.entries : [];
}

/**
 * Videos mit dem Modul in `modules` — plus die, deren **Kapitel** das Modul
 * nennen. Ein Video über ein anderes Modul, in dem eine Phase dieses Moduls
 * vorkommt, gehört auf dessen Seite.
 * @param {{entries?: object[]}} videos @param {string} moduleId @returns {object[]}
 */
export function videosForModule(videos, moduleId) {
  return entriesOf(videos).filter((v) =>
    v.modules?.includes(moduleId)
    || v.chapters?.some((c) => c.modules?.includes(moduleId)));
}

/** @param {{entries?: object[]}} videos @param {string} termId @returns {object[]} */
export function videosForTerm(videos, termId) {
  return entriesOf(videos).filter((v) => v.glossary?.includes(termId));
}

/** @param {{entries?: object[]}} videos @param {string} exampleId @returns {object[]} */
export function videosForExample(videos, exampleId) {
  return entriesOf(videos).filter((v) => v.examples?.includes(exampleId));
}

/**
 * @param {object} video ein Eintrag des Spiegels
 * @param {'de'|'en'} lang
 * @param {object} strings `getStrings(lang)`
 * @returns {string}
 */
function renderOne(video, lang, strings) {
  const s = strings.videos;
  const playerId = `player-${video.id}`;
  const title = pick(video.title, lang) || video.id;

  const chapters = (video.chapters ?? [])
    .filter((c) => c.sec?.[lang] !== undefined)
    .map((c) => {
      const sec = c.sec[lang];
      return `<li><a href="#${escapeAttr(playerId)}" data-video-player="${escapeAttr(playerId)}"`
        + ` data-video-sec="${escapeAttr(String(sec))}">`
        + `<span class="handbook-video__time">${escapeHtml(formatTimestamp(sec))}</span> `
        + `${escapeHtml(pick(c.title, lang) || c.id)}</a></li>`;
    }).join('');

  const titleId = `video-title-${escapeAttr(video.id)}`;
  return `<div class="handbook-video" id="video-${escapeAttr(video.id)}">
  <h3 class="handbook-video__title" id="${titleId}">${escapeHtml(title)}</h3>
  <video class="handbook-video__player" id="${escapeAttr(playerId)}" controls preload="metadata" playsinline aria-labelledby="${titleId}">
    <source src="${escapeAttr(video.video[lang])}" type="video/mp4">
    <track kind="captions" src="${escapeAttr(video.captions[lang])}" srclang="${escapeAttr(lang)}" label="${escapeAttr(s.captionsLabel)}" default>
    ${escapeHtml(s.noPlayer)}
  </video>
  ${chapters ? `<details class="handbook-video__chapters-toggle"><summary>${escapeHtml(s.chaptersHeading)}</summary><ol class="handbook-video__chapters">${chapters}</ol></details>` : ''}
</div>`;
}

/**
 * @param {{ videos: object[], lang: 'de'|'en', strings: object }} args
 * @returns {string} leerer String, wenn es in dieser Sprache nichts zu zeigen gibt
 */
export function renderVideoSection({ videos, lang, strings }) {
  // Ein Video, das in dieser Sprache nie gerendert wurde, hat keine Datei, auf
  // die ein Player zeigen könnte — es wird übersprungen, nicht in der anderen
  // Sprache eingeblendet.
  const usable = (videos ?? []).filter((v) => v.video?.[lang] && v.captions?.[lang] && v.sec?.[lang] !== undefined);
  if (usable.length === 0) return '';

  const s = strings.videos;
  return `<section class="handbook-section" id="videos"><h2>${escapeHtml(s.heading)}</h2>`
    + `<p>${escapeHtml(s.intro)}</p>`
    + usable.map((v) => renderOne(v, lang, strings)).join('\n')
    + '</section>';
}
