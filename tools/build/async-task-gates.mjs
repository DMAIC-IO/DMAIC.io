/**
 * D.Mike — Gates der asynchronen Abläufe (async-task-gates.mjs)
 *
 * Statisch, ohne das Viewmodel zu laden: welche Tasks `createModule({
 * asyncTasks })` deklariert (`readViewmodelAsyncTasks`), ob die Vorlagen sie
 * richtig binden (`checkAsyncTaskRefs`: Kind ohne Behälter, falsches Element,
 * unbekannter Task, `data-arg-*` ohne Parameter, Start an einem `auto`-Task),
 * ob eine Deklaration `auto: true` mit `params` oder `blocked` mischt
 * (`checkAsyncTaskDecls`) und welche Hilfeschlüssel sie brauchen
 * (`asyncTaskHelpKeys`). Befunde `<gate>: <pfad im Modul>: <Text>`; leer = grün.
 */
import ts from 'typescript';
import { TAG, camel, keyOf, parseJs, bodyEnd } from './template-scan.mjs';

const CONTAINER = /(?:^|\s)x-async-task="\s*([^"]*?)\s*"/;
const CHILD = /(?:^|\s)x-async-task-(start|cancel|progress|error)(?=[\s=/]|$)/g;
const DATA_ARG = /(?:^|\s):?data-arg-([\w-]+)=/g;
/** Element, auf das ein Kind gehört (`error` darf überall stehen). */
const CHILD_TAG = { start: 'button', cancel: 'button', progress: 'progress' };

const propOf = (obj, name) => obj.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p)) && keyOf(p) === name);
const isAsyncTaskCall = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'asyncTask';

/**
 * Behälter und Kinder einer Vorlage; jedes Kind gehört zum innersten
 * Behälter, der es umschließt (`box` = Index in `boxes`, `-1` = keiner).
 * @param {string} html
 */
function scan(html) {
  const boxes = [];
  const children = [];
  for (const m of html.matchAll(TAG)) {
    const [whole, tag, attrs] = m;
    const name = attrs.match(CONTAINER)?.[1];
    const start = m.index + whole.length;
    if (name !== undefined) boxes.push({ name, at: m.index, start, end: bodyEnd(html, start, tag) });
    for (const c of attrs.matchAll(CHILD)) {
      children.push({ kind: c[1], tag: tag.toLowerCase(), at: m.index, args: [...attrs.matchAll(DATA_ARG)].map((a) => a[1]) });
    }
  }
  for (const c of children) {
    let best = -1;
    boxes.forEach((b, i) => { if (b.start <= c.at && c.at < b.end && (best < 0 || b.start > boxes[best].start)) best = i; });
    c.box = best;
  }
  return { boxes, children };
}

/**
 * Tasks aus `asyncTasks: { name: asyncTask({ … }) }` in viewmodel/viewmodel.js.
 * Was kein erkennbares Literal ist, bleibt außen vor.
 * @param {string} text Inhalt von viewmodel/viewmodel.js
 * @returns {Record<string, { params: Record<string, true>, auto: boolean }>}
 */
export function readViewmodelAsyncTasks(text) {
  const out = {};
  const visit = (n) => {
    const block = ts.isPropertyAssignment(n) && keyOf(n) === 'asyncTasks' && ts.isObjectLiteralExpression(n.initializer) ? n.initializer : null;
    if (block) {
      for (const p of block.properties) {
        const name = ts.isPropertyAssignment(p) ? keyOf(p) : null;
        if (!name || !isAsyncTaskCall(p.initializer)) continue;
        const arg = p.initializer.arguments[0];
        const def = arg && ts.isObjectLiteralExpression(arg) ? arg : null;
        const params = def ? propOf(def, 'params') : null;
        const auto = def ? propOf(def, 'auto') : null;
        out[name] = { params: {}, auto: Boolean(auto && ts.isPropertyAssignment(auto) && auto.initializer.kind === ts.SyntaxKind.TrueKeyword) };
        if (params && ts.isPropertyAssignment(params) && ts.isObjectLiteralExpression(params.initializer)) {
          for (const q of params.initializer.properties) { const k = ts.isPropertyAssignment(q) || ts.isShorthandPropertyAssignment(q) ? keyOf(q) : null; if (k) out[name].params[k] = true; }
        }
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(parseJs('viewmodel.js', text));
  return out;
}

/**
 * Gate Deklaration: ein `asyncTask({ auto: true, … })` nimmt weder `params`
 * (außer `{}`) noch `blocked` — wie `asyncTask()` zur Laufzeit, nur früher.
 * @param {{ path: string, text: string }[]} files Skripte des Moduls
 * @returns {string[]}
 */
export function checkAsyncTaskDecls(files) {
  const out = [];
  for (const { path, text } of files) {
    if (!text.includes('asyncTask(')) continue;
    const visit = (n) => {
      if (isAsyncTaskCall(n) && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
        const def = n.arguments[0];
        const auto = propOf(def, 'auto');
        if (auto && ts.isPropertyAssignment(auto) && auto.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          const owner = ts.isPropertyAssignment(n.parent) || ts.isVariableDeclaration(n.parent) ? keyOf(n.parent) : null;
          const params = propOf(def, 'params');
          const emptyParams = params && ts.isPropertyAssignment(params) && ts.isObjectLiteralExpression(params.initializer) && params.initializer.properties.length === 0;
          const blocked = propOf(def, 'blocked');
          const nullish = blocked && ts.isPropertyAssignment(blocked) && (blocked.initializer.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(blocked.initializer) && blocked.initializer.text === 'undefined'));
          const P = `asyncTask: ${path}: ${owner ?? 'asyncTask()'}:`;
          if (params && !emptyParams) out.push(`${P} invalid params with auto: true; allowed: params and blocked only without auto`);
          if (blocked && !nullish) out.push(`${P} invalid blocked with auto: true; allowed: params and blocked only without auto`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(parseJs(path, text));
  }
  return out;
}

/**
 * Gate Vorlagen: Behälter `x-async-task="<name>"` und ihre Kinder.
 * Reihenfolge: erst Kinder ohne Behälter, dann je Behälter (Dokumentreihenfolge)
 * der unbekannte Task, dann seine Kinder.
 * @param {{ path: string, text: string }[]} templates
 * @param {Record<string, { params: Record<string, true>, auto: boolean }>} tasks aus readViewmodelAsyncTasks
 * @returns {string[]}
 */
export function checkAsyncTaskRefs(templates, tasks) {
  const out = [];
  for (const { path, text } of templates) {
    const P = `template: ${path}:`;
    const { boxes, children } = scan(text);
    for (const c of children) if (c.box < 0) out.push(`${P} x-async-task-${c.kind}: ohne umgebendes x-async-task`);
    boxes.forEach((b, i) => {
      const task = Object.hasOwn(tasks, b.name) ? tasks[b.name] : null;
      if (!task) out.push(`${P} x-async-task="${b.name}": kein Task aus asyncTasks`);
      for (const c of children.filter((x) => x.box === i)) {
        const want = CHILD_TAG[c.kind];
        if (want && c.tag !== want) out.push(`${P} x-async-task-${c.kind}: gehört auf <${want}>, steht auf <${c.tag}>`);
        if (!task || c.kind !== 'start') continue;
        for (const a of c.args) if (!Object.hasOwn(task.params, camel(a))) out.push(`${P} data-arg-${a}: kein Parameter von ${b.name}`);
        if (task.auto) out.push(`${P} x-async-task-start: ${b.name} ist ein auto-Task`);
      }
    });
  }
  return out;
}

/**
 * Behälter `x-async-task="<n>"` einer Vorlage mit Textposition des Start-Tags.
 * @param {string} html
 * @returns {{ name: string, at: number }[]}
 */
export function asyncTaskContainers(html) {
  return scan(html).boxes.map((b) => ({ name: b.name, at: b.at }));
}

/**
 * Behälter einer Vorlage mit der Angabe, ob ein Start- bzw. Abbrechen-Knopf
 * darin steht (dort hängen die Direktiven Hilfeanker an).
 * @param {string} html
 * @returns {{ name: string, start: boolean, cancel: boolean }[]}
 */
export function asyncTaskAnchors(html) {
  const { boxes, children } = scan(html);
  return boxes.map((b, i) => {
    const own = children.filter((c) => c.box === i);
    return { name: b.name, start: own.some((c) => c.kind === 'start'), cancel: own.some((c) => c.kind === 'cancel') };
  });
}

/**
 * Kontexthilfe-Schlüssel der Tasks (ohne Präfix `modules.<id>`): je Task
 * `asyncTasks.<n>.help`, je Parameter `asyncTasks.<n>.params.<p>`, je
 * manuellem Task `asyncTasks.<n>.cancel.help`.
 * @param {Record<string, { params: Record<string, true>, auto: boolean }>} tasks
 * @returns {string[]}
 */
export function asyncTaskHelpKeys(tasks) {
  return Object.entries(tasks).flatMap(([n, t]) => [
    `asyncTasks.${n}.help`,
    ...Object.keys(t.params).map((p) => `asyncTasks.${n}.params.${p}`),
    ...(t.auto ? [] : [`asyncTasks.${n}.cancel.help`]),
  ]);
}
