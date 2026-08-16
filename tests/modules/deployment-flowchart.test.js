import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { DeploymentModel } from '../../js/modules/deployment-flowchart/deployment-flowchart-model.js';
import { __resetRegistryForTests, appendFromInstance }
  from '../../js/core/flowchart/flowchart-import.js';

// Re-import the model to trigger the mapper registration side-effect.
// (dynamic import ensures the registry is populated after the reset.)
async function loadModelWithMappers() {
  __resetRegistryForTests();
  const url = '../../js/modules/deployment-flowchart/deployment-flowchart-model.js?bust=' + Math.random();
  return import(url);
}

suite('DeploymentModel — construction', () => {
  test('constructs with empty steps and empty lanes', () => {
    const m = new DeploymentModel();
    assertEqual(m.steps.length, 0);
    assertEqual(Array.isArray(m.lanes), true);
    assertEqual(m.lanes.length, 0);
  });

  test('fromJSON preserves both steps and lanes', () => {
    const m = DeploymentModel.fromJSON({
      steps: [{ title: 'A', laneId: 'sales' }],
      lanes: [{ id: 'sales', name: 'Sales', order: 0 }],
    });
    assertEqual(m.steps[0].laneId, 'sales');
    assertEqual(m.lanes[0].name, 'Sales');
  });

  test('fromJSON lazy-creates the Unassigned lane when a step references it', () => {
    const m = DeploymentModel.fromJSON({
      steps: [{ title: 'A' }],   // laneId defaults to 'unassigned'
      lanes: [],
    });
    assertEqual(m.steps[0].laneId, 'unassigned');
    const un = m.lanes.find((l) => l.id === 'unassigned');
    assertTrue(un !== undefined);
  });

  test('fromJSON does not create the Unassigned lane when no step needs it', () => {
    const m = DeploymentModel.fromJSON({
      steps: [{ title: 'A', laneId: 'sales' }],
      lanes: [{ id: 'sales', name: 'Sales', order: 0 }],
    });
    assertEqual(m.lanes.some((l) => l.id === 'unassigned'), false);
  });

  test('toJSON returns { steps, lanes }', () => {
    const m = new DeploymentModel();
    m.addLane('Sales');
    m.addStep(0, { title: 'A' });
    const json = m.toJSON();
    assertEqual(Array.isArray(json.steps), true);
    assertEqual(Array.isArray(json.lanes), true);
    assertEqual(json.lanes.some((l) => l.name === 'Sales'), true);
  });

  test('toJSON/fromJSON roundtrip keeps lane assignments', () => {
    const m = new DeploymentModel();
    const l = m.addLane('Fertigung');
    m.addStep(0, { title: 'A', laneId: l.id });
    const back = DeploymentModel.fromJSON(m.toJSON());
    assertEqual(back.steps[0].laneId, l.id);
    assertEqual(back.lanes.find((x) => x.id === l.id).name, 'Fertigung');
  });

  test('hasContent() is inherited from the chain core', () => {
    const m = new DeploymentModel();
    assertEqual(m.hasContent(), false);
    m.addStep(0, { title: 'A' });
    assertEqual(m.hasContent(), true);
  });
});

suite('DeploymentModel — lane CRUD', () => {
  test('addLane appends with generated id and increasing order', () => {
    const m = new DeploymentModel();
    const a = m.addLane('Sales');
    const b = m.addLane('Fertigung');
    assertEqual(m.lanes.length, 2);
    assertEqual(a.order, 0);
    assertEqual(b.order, 1);
    assertEqual(a.id !== b.id, true);
  });

  test('renameLane updates the name', () => {
    const m = new DeploymentModel();
    const a = m.addLane('Sales');
    assertEqual(m.renameLane(a.id, 'Vertrieb'), true);
    assertEqual(m.lanes[0].name, 'Vertrieb');
  });

  test('removeLane migrates its steps to Unassigned instead of deleting them', () => {
    const m = new DeploymentModel();
    const l = m.addLane('Sales');
    m.addStep(0, { title: 'A', laneId: l.id });
    assertEqual(m.removeLane(l.id), true);
    assertEqual(m.steps.length, 1);           // step preserved
    assertEqual(m.steps[0].laneId, 'unassigned');
    assertEqual(m.lanes.some((x) => x.id === 'unassigned'), true);
  });

  test('Unassigned cannot be removed', () => {
    const m = new DeploymentModel();
    m.addStep(0);   // triggers unassigned creation
    assertEqual(m.removeLane('unassigned'), false);
    assertEqual(m.lanes.some((x) => x.id === 'unassigned'), true);
  });

  test('Unassigned cannot be renamed — its label comes from i18n, not state', () => {
    const m = new DeploymentModel();
    m.addStep(0);
    assertEqual(m.renameLane('unassigned', 'Foo'), false);
    assertEqual(m.lanes.find((l) => l.id === 'unassigned').name, '');
  });

  test('moveLane reorders with the same semantics as moveStep', () => {
    const m = new DeploymentModel();
    const a = m.addLane('A');
    m.addLane('B');
    const c = m.addLane('C');
    assertEqual(m.moveLane(a.id, c.id), true);
    assertEqual(m.lanes.map((l) => l.name).join(','), 'B,C,A');
    assertEqual(m.lanes.map((l) => l.order).join(','), '0,1,2');
  });

  test('moveLane rejects moves involving unassigned', () => {
    const m = new DeploymentModel();
    m.addStep(0);
    const a = m.addLane('Sales');
    assertEqual(m.moveLane(a.id, 'unassigned'), false);
    assertEqual(m.moveLane('unassigned', a.id), false);
  });

  test('moveLane rejects unknown ids and self-moves', () => {
    const m = new DeploymentModel();
    const a = m.addLane('Sales');
    assertEqual(m.moveLane(a.id, a.id), false);
    assertEqual(m.moveLane(a.id, 'nope'), false);
  });

  test('setLaneForStep updates the assignment', () => {
    const m = new DeploymentModel();
    const l = m.addLane('Sales');
    const s = m.addStep(0, { title: 'A' });
    assertEqual(s.laneId, 'unassigned');
    assertEqual(m.setLaneForStep(s.id, l.id), true);
    assertEqual(m.steps[0].laneId, l.id);
  });

  test('setLaneForStep with an unknown step returns false', () => {
    const m = new DeploymentModel();
    const l = m.addLane('Sales');
    assertEqual(m.setLaneForStep('nope', l.id), false);
  });

  test('addStep into a lane keeps the chain order across lanes', () => {
    const m = new DeploymentModel();
    const sales = m.addLane('Sales');
    const prod = m.addLane('Fertigung');
    m.addStep(0, { title: 'A', laneId: sales.id });
    m.addStep(1, { title: 'B', laneId: prod.id });
    m.addStep(2, { title: 'C', laneId: sales.id });
    assertEqual(m.steps.map((s) => s.title).join(','), 'A,B,C');
    assertEqual(m.steps.filter((s) => s.laneId === sales.id).map((s) => s.title).join(','), 'A,C');
  });
});

suite('DeploymentModel — import mappers', () => {
  test('PM → Deployment: all steps land in the Unassigned lane', async () => {
    const { DeploymentModel } = await loadModelWithMappers();
    const target = new DeploymentModel();
    const sm = {
      listInstances: (id) => id === 'process-map' ? [{ instanceId: 'i', title: 'PM' }] : [],
      getModuleState: () => ({ steps: [
        { id: 's1', title: 'A', valueType: 'va' },
        { id: 's2', title: 'B', description: 'zweiter Schritt' },
      ] }),
    };
    const appended = appendFromInstance({
      targetModuleId: 'deployment-flowchart', sourceModuleId: 'process-map',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(appended.length, 2);
    assertEqual(target.steps.every((s) => s.laneId === 'unassigned'), true);
    assertEqual(target.lanes.some((l) => l.id === 'unassigned'), true);
    assertEqual(target.steps[1].description, 'zweiter Schritt');
    // PM-only fields must NOT survive into Deployment (mapper strips them).
    assertEqual(target.steps[0].valueType, undefined);
  });

  test('SIPOC → Deployment: process names land in the Unassigned lane', async () => {
    const { DeploymentModel } = await loadModelWithMappers();
    const target = new DeploymentModel();
    const sm = {
      listInstances: (id) => id === 'sipoc' ? [{ instanceId: 'i', title: 'S' }] : [],
      getModuleState: () => ({ columns: { process: ['P1', 'P2'] } }),
    };
    appendFromInstance({
      targetModuleId: 'deployment-flowchart', sourceModuleId: 'sipoc',
      instanceId: 'i', stateManager: sm, targetState: target,
    });
    assertEqual(target.steps.map((s) => s.title).join(','), 'P1,P2');
    assertEqual(target.steps.every((s) => s.laneId === 'unassigned'), true);
  });
});
