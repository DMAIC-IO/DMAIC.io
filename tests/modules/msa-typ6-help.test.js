/**
 * D.Mike — MSA Type 6 help content vs. the control-chart engine.
 *
 * The help's Nelson-rules definition paraphrases the run rules and carries a
 * citation that the static handbook links to the references list. The
 * paraphrase must state the run length the engine actually checks
 * (NELSON_RULES rule 2), and the citation must name the source that uses that
 * same length (Nelson 1984: nine points on one side of the centerline).
 */
import { suite, test, assertTrue } from '../test-utils.js';
import HELP from '../../js/modules/msa-typ6/msa-typ6-help.js';
import { NELSON_RULES } from '../../js/engines/control-chart-engine.js';

const NUMBER_WORDS = {
  de: { 7: 'sieben', 8: 'acht', 9: 'neun' },
  en: { 7: 'seven', 8: 'eight', 9: 'nine' },
};

/** The parameters-section definition block for the Nelson rules. */
function nelsonDefinition(lang) {
  const blocks = HELP.sections.parameters[lang].blocks;
  return blocks.find(b => b.type === 'definition' && /nelson-regeln/.test(b.term));
}

suite('MSA Typ 6: Nelson rule text matches the engine', () => {
  const sameSide = NELSON_RULES.find(r => r.id === 2);
  const runLength = Number.parseInt(sameSide.short.en, 10);

  for (const lang of ['de', 'en']) {
    test(`${lang}: same-side run length equals engine rule 2 (${runLength})`, () => {
      const block = nelsonDefinition(lang);
      assertTrue(!!block, 'Nelson-rules definition missing');
      const word = NUMBER_WORDS[lang][runLength];
      assertTrue(block.content.includes(`${word} `), `expected "${word}" in: ${block.content}`);
      for (const [n, other] of Object.entries(NUMBER_WORDS[lang])) {
        if (Number(n) !== runLength) {
          assertTrue(!block.content.includes(`${other} Punkte`) && !block.content.includes(`${other} points`),
            `stale run length "${other}" in: ${block.content}`);
        }
      }
    });

    test(`${lang}: the run rules cite Nelson 1984`, () => {
      assertTrue(nelsonDefinition(lang).content.includes('{{ref:nelson-1984}}'));
    });
  }
});
