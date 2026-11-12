/**
 * D.Mike — Ishikawa: view-Teil Problem.
 *
 * Reiterwahl aus der Route, die zwei Bildgalerien (Hinzufügen über
 * `x-file-drop`, Größe je Bild) und die Lightbox über den Dialogdienst.
 * Problemtext, Bildunterschrift und Löschen laufen im Template über
 * `x-field` und `x-command`.
 */
import { compressImageToBudget } from '../../../core/image-upload.js';

/** Reiter des Moduls in Reihenfolge der Reiterleiste. */
const TABS = Object.freeze(['problem', 'facts', 'hypotheses', 'experiments']);
/** Die zwei Bildgalerien. */
const SCOPES = Object.freeze(['inScope', 'outScope']);
/** Budget je hochgeladenem Bild (Bytes). */
const IMAGE_BUDGET = 100 * 1024;

/**
 * Bytes, die eine base64-Daten-URL trägt; der Kopf bis zum Komma zählt nicht.
 * @param {string} dataUrl @returns {number}
 */
function decodedBytes(dataUrl) {
  const head = dataUrl.indexOf(',') + 1;
  return Math.ceil((dataUrl.length - head) * 3 / 4);
}

/** @type {import('./state.types.js').IshikawaViewFn} */
export const problemView = (ctx) => ({
  init() {
    // Der Reiterwechsel steht in der Adresse, wie der Reiter aus der Route kommt.
    // Nur die angezeigte Instanz schreibt die Adresse.
    this.$watch(() => this.state.tab, (tab) => {
      const route = this.$store.route;
      if (!route || route.instanceId !== ctx.instanceId) return;
      if (!Array.isArray(route.sub) || route.sub[0] !== tab) this.changeRoute(tab);
    });
  },

  /** Die zwei Bildgalerien. */
  get scopes() { return SCOPES; },

  /**
   * Route unterhalb des Moduls: der erste Abschnitt wählt den Reiter, ein
   * unbekannter Name ändert nichts.
   * @param {string[]} sub
   */
  onRouteChanged(sub) {
    const tab = Array.isArray(sub) ? sub[0] : undefined;
    if (TABS.includes(tab) && tab !== this.state.tab) this.state.tab = /** @type {'problem'|'facts'|'hypotheses'|'experiments'} */ (tab);
  },

  /** Klasse des aktiven Reiters. @param {string} tab @returns {string} */
  tabClass(tab) { return this.state.tab === tab ? 'dmike-tab--active' : ''; },

  /** BEM-Modifikator einer Galerie. @param {string} scope @returns {string} */
  galleryModifier(scope) { return scope === 'inScope' ? 'in' : 'out'; },
  /** Überschrift einer Galerie. @param {string} scope @returns {string} */
  galleryLabel(scope) { return this.t(scope === 'inScope' ? 'problemScopeInLabel' : 'problemScopeOutLabel'); },
  /** Hinweis unter der Überschrift. @param {string} scope @returns {string} */
  galleryHint(scope) { return this.t(scope === 'inScope' ? 'problemScopeInHint' : 'problemScopeOutHint'); },
  /** Keine Bilder in der Galerie? @param {string} scope @returns {boolean} */
  galleryEmpty(scope) { return this.model.images[scope].length === 0; },

  /**
   * Größe eines Bilds in der Sprache der App: unter 1 KB in Bytes, sonst in KB.
   * @param {{ dataUrl: string }} img @returns {string}
   */
  imageSize(img) {
    const bytes = decodedBytes(img.dataUrl);
    return bytes < 1024
      ? this.t('imageSizeBytes', { size: this.num(bytes, 0) })
      : this.t('imageSizeKb', { size: this.num(bytes / 1024, 0) });
  },

  /**
   * Bilder einer Galerie hinzufügen (Auswahl oder Ablegen). Jedes wird auf
   * das Budget verkleinert; was kein Bild ist, fällt weg.
   * @param {File[]} files @param {{ scope?: string }} args `data-arg-scope` der Galerie
   * @returns {Promise<void>}
   */
  async addImages(files, { scope } = {}) {
    if (!SCOPES.includes(scope)) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { dataUrl, bytes } = await compressImageToBudget(file, { maxBytes: IMAGE_BUDGET });
        this.model.addImage({ scope: /** @type {'inScope'|'outScope'} */ (scope), dataUrl, caption: '' });
        if (bytes > IMAGE_BUDGET) ctx.notify(this.t('imageTooLarge', { name: file.name }));
      } catch (err) {
        console.error('Image compression failed', err);
        ctx.notify(this.t('imageLoadFailed', { name: file.name }));
      }
    }
  },

  /** Das Bild der Lightbox; ohne Lightbox leer. @returns {{ dataUrl: string, caption: string }} */
  get lightboxImage() {
    const lb = this.state.lightbox;
    const img = lb && SCOPES.includes(lb.scope) ? this.model.images[lb.scope].find((i) => i.id === lb.id) : null;
    return img ?? { dataUrl: '', caption: '' };
  },

  /**
   * Ein Bild groß zeigen: die Vorlage der Lightbox geht als Inhalt an den
   * Dialogdienst und kommt beim Schließen zurück.
   * @param {string} scope @param {number} id
   */
  openLightbox(scope, id) {
    this.state.lightbox = { scope, id };
    const content = this.$refs.lightbox;
    if (!content) return;
    ctx.dialog.show({
      title: this.t('openImage'),
      content,
      size: 'wide',
      onClose: () => { this.state.lightbox = null; },
    });
  },
});
