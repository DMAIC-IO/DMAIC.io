/**
 * D.Mike — createStartup (create-startup.js)
 * One-shot boot side effect factory. 4th sibling of
 * createModule / createPage / createDialog, but fire-once: no Model/persist,
 * no overlay, no template. Splits guard (shouldRun) from effect (run) so each
 * concern is unit-testable through a mock ctx.
 *
 * @param {object} config
 * @param {string} config.id kebab-case identifier
 * @param {(ctx:object)=>boolean|Promise<boolean>} [config.shouldRun] guard; omitted ⇒ always run
 * @param {(ctx:object)=>void|Promise<void>} config.run effect
 * @returns {{ id:string, shouldRun?:Function, run:Function, init:(ctx:object)=>Promise<any> }}
 */
export function createStartup(config) {
  const { id, shouldRun, run } = config;
  return {
    id,
    shouldRun,
    run,
    async init(ctx) {
      if (shouldRun && !(await shouldRun(ctx))) return false;
      return run(ctx);
    },
  };
}
