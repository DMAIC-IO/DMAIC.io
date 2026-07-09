import { suite, test, assertEqual } from '../test-utils.js'
import { Trend, State, TRENDS } from '../../js/modules/triz-evolution-trends/triz-evolution-trends-model.js'

suite('TRIZ Evolution Trends — Trend', () => {
  test('constructor sets id, default stage -1, default notes empty', () => {
    const t = new Trend('aggregation')
    assertEqual(t.id, 'aggregation')
    assertEqual(t.stage, -1)
    assertEqual(t.notes, '')
  })

  test('availableStages returns correct array for 4-stage trend', () => {
    const t = new Trend('scale')
    assertEqual(t.availableStages.length, 4)
    assertEqual(t.availableStages[0], 0)
    assertEqual(t.availableStages[3], 3)
  })

  test('availableStages returns correct array for 5-stage trend', () => {
    const t = new Trend('dynamism')
    assertEqual(t.availableStages.length, 5)
  })

  test('availableStages returns empty array for qualitative trend', () => {
    const t = new Trend('uneven')
    assertEqual(t.availableStages.length, 0)
  })

  test('hasStages true for trends with stages', () => {
    assertEqual(new Trend('aggregation').hasStages, true)
    assertEqual(new Trend('dynamism').hasStages, true)
    assertEqual(new Trend('completeness').hasStages, true)
  })

  test('hasStages false for qualitative trend', () => {
    assertEqual(new Trend('uneven').hasStages, false)
  })

  test('toJSON returns stage and notes', () => {
    const t = new Trend('aggregation')
    t.stage = 2
    t.notes = 'test note'
    const json = t.toJSON()
    assertEqual(json.stage, 2)
    assertEqual(json.notes, 'test note')
  })

  test('fromJSON restores valid data', () => {
    const t = Trend.fromJSON('dynamism', { stage: 3, notes: 'dynamism note' })
    assertEqual(t.id, 'dynamism')
    assertEqual(t.stage, 3)
    assertEqual(t.notes, 'dynamism note')
  })

  test('fromJSON with null returns default trend', () => {
    const t = Trend.fromJSON('scale', null)
    assertEqual(t.stage, -1)
    assertEqual(t.notes, '')
  })

  test('fromJSON sanitises stage to -1 for invalid value', () => {
    const t = Trend.fromJSON('aggregation', { stage: 99 })
    assertEqual(t.stage, -1)
  })

  test('fromJSON sanitises notes to string', () => {
    const t = Trend.fromJSON('aggregation', { notes: 123 })
    assertEqual(t.notes, '')
  })

  test('round-trip toJSON → fromJSON preserves data', () => {
    const orig = new Trend('dynamism')
    orig.stage = 4
    orig.notes = 'stage 4 notes'
    const json = orig.toJSON()
    const restored = Trend.fromJSON('dynamism', json)
    assertEqual(restored.stage, 4)
    assertEqual(restored.notes, 'stage 4 notes')
  })
})

suite('TRIZ Evolution Trends — State', () => {
  test('constructor creates all trends from TRENDS', () => {
    const s = new State()
    assertEqual(Object.keys(s.trends).length, TRENDS.length)
    for (const tc of TRENDS) {
      const t = s.trends[tc.id]
      assertEqual(t instanceof Trend, true)
      assertEqual(t.id, tc.id)
      assertEqual(t.stage, -1)
      assertEqual(t.notes, '')
    }
  })

  test('hasContent returns false for empty state', () => {
    assertEqual(new State().hasContent(), false)
  })

  test('hasContent true when system is set', () => {
    const s = new State()
    s.system = 'test'
    assertEqual(s.hasContent(), true)
  })

  test('hasContent true when stage >= 0', () => {
    const s = new State()
    s.trends['aggregation'].stage = 1
    assertEqual(s.hasContent(), true)
  })

  test('hasContent true when notes entered', () => {
    const s = new State()
    s.trends['uneven'].notes = 'bottleneck'
    assertEqual(s.hasContent(), true)
  })

  test('hasContent false when stage -1 and no notes', () => {
    const s = new State()
    s.trends['dynamism'].stage = -1
    assertEqual(s.hasContent(), false)
  })

  test('toJSON returns system + all trends', () => {
    const s = new State()
    s.system = 'headlight'
    s.trends['aggregation'].stage = 2
    s.trends['aggregation'].notes = 'poly stage'
    const json = s.toJSON()
    assertEqual(json.system, 'headlight')
    assertEqual(json.trends['aggregation'].stage, 2)
    assertEqual(json.trends['aggregation'].notes, 'poly stage')
    assertEqual(json.trends['uneven'].notes, '')
  })

  test('fromJSON restores full state', () => {
    const s = new State()
    s.system = 'brake'
    s.trends['aggregation'].stage = 1
    s.trends['aggregation'].notes = 'bi'
    s.trends['uneven'].notes = 'pads lag'
    const json = s.toJSON()
    const r = State.fromJSON(json)
    assertEqual(r.system, 'brake')
    assertEqual(r.trends['aggregation'].stage, 1)
    assertEqual(r.trends['aggregation'].notes, 'bi')
    assertEqual(r.trends['uneven'].notes, 'pads lag')
  })

  test('fromJSON with null returns default', () => {
    const s = State.fromJSON(null)
    assertEqual(s.system, '')
    assertEqual(s.trends['aggregation'].stage, -1)
  })

  test('round-trip preserves all trends', () => {
    const orig = new State()
    orig.system = 'roundtrip'
    for (const tc of TRENDS) {
      const t = orig.trends[tc.id]
      if (tc.stages > 0) t.stage = Math.min(2, tc.stages - 1)
      t.notes = tc.id + ' note'
    }
    const json = orig.toJSON()
    const restored = State.fromJSON(json)
    assertEqual(restored.system, 'roundtrip')
    for (const tc of TRENDS) {
      const e = restored.trends[tc.id]
      if (tc.stages > 0) assertEqual(e.stage, Math.min(2, tc.stages - 1))
      assertEqual(e.notes, tc.id + ' note')
    }
  })
})
