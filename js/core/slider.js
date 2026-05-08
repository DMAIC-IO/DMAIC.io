/**
 * slider.js — Global range slider component for D.Mike.
 *
 * Provides a single, themed slider element used everywhere:
 * settings panel, chart editors, color picker, module forms.
 *
 * All sliders share the CSS class `.dmike-slider` for track & thumb
 * styling defined in css/components.css.
 *
 * @module slider
 */

/**
 * Create a standalone `<input type="range">` with the shared `.dmike-slider` class.
 * Use this when you only need the raw input (e.g. color picker, inline forms).
 *
 * @param {Object} opts
 * @param {number}  opts.value          - Initial value
 * @param {number}  [opts.min=0]        - Minimum
 * @param {number}  [opts.max=100]      - Maximum
 * @param {number}  [opts.step=1]       - Step size
 * @param {string}  [opts.className]    - Extra CSS class(es) appended after `.dmike-slider`
 * @param {function} [opts.onInput]     - Called with numeric value on each input event
 * @returns {HTMLInputElement}
 */
export function createSliderInput(opts) {
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'dmike-slider' + (opts.className ? ' ' + opts.className : '');
  slider.min = opts.min ?? 0;
  slider.max = opts.max ?? 100;
  slider.step = opts.step ?? 1;
  slider.value = opts.value ?? opts.min ?? 0;
  if (opts.onInput) {
    slider.addEventListener('input', () => opts.onInput(+slider.value));
  }
  return slider;
}

/**
 * Create a complete slider row: label + slider + numeric value display.
 * Returns the row element and refs for programmatic updates.
 *
 * @param {Object} opts
 * @param {string}  opts.label          - Label text
 * @param {number}  opts.value          - Initial value
 * @param {number}  [opts.min=0]
 * @param {number}  [opts.max=100]
 * @param {number}  [opts.step=1]
 * @param {string}  [opts.className]    - Extra class for the <input>
 * @param {function} opts.onChange       - Called with numeric value
 * @returns {{ el: HTMLElement, slider: HTMLInputElement, valueEl: HTMLSpanElement }}
 */
export function createSliderRow(opts) {
  const row = document.createElement('div');
  row.className = 'dmike-slider-row';

  const lbl = document.createElement('label');
  lbl.className = 'dmike-slider-row__label';
  lbl.textContent = opts.label;

  const slider = createSliderInput({
    value: opts.value,
    min: opts.min,
    max: opts.max,
    step: opts.step,
    className: opts.className,
  });

  const val = document.createElement('span');
  val.className = 'dmike-slider-row__value';
  val.textContent = opts.value;

  slider.addEventListener('input', () => {
    val.textContent = slider.value;
    if (opts.onChange) opts.onChange(+slider.value);
  });

  row.appendChild(lbl);
  row.appendChild(slider);
  row.appendChild(val);

  return { el: row, slider, valueEl: val };
}
