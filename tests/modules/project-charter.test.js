import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/project-charter/project-charter-model.js';
import { prepareFragment, renderDashboardTile } from '../../js/modules/project-charter/project-charter.js';

suite('Project Charter Model — defaults', () => {
  test('constructor sets empty defaults', () => {
    const s = new State();
    assertEqual(s.problemStatement, '');
    assertEqual(s.goals.length, 0);
    assertEqual(s.orgNodes.length, 0);
    assertEqual(s.orgStyle.nodeBorderStyle, 'solid');
    assertEqual(s.orgStyle.nodeBorderWidth, 1);
    assertEqual(s.orgStyle.lineStyle, 'solid');
    assertEqual(s.orgStyle.lineWidth, 2);
    assertEqual(s.orgStyle.nodeBg, '');
    assertEqual(s.orgStyle.lineColor, '');
  });
});

suite('Project Charter Model — toJSON', () => {
  test('toJSON returns problemStatement, goals, orgChart, orgStyle', () => {
    const s = new State();
    s.problemStatement = '<b>Hi</b>';
    s.goals = [{ id: 'g1', description: 'D', targetDate: '2026-01-01', metric: 'M', targetValue: 'T', achievementLevel: 50 }];
    const j = s.toJSON();
    assertEqual(j.problemStatement, '<b>Hi</b>');
    assertEqual(j.goals.length, 1);
    assertEqual(j.goals[0].id, 'g1');
    assertEqual(Array.isArray(j.orgChart), true);
    assertEqual(typeof j.orgStyle, 'object');
  });

  test('toJSON org node drops empty optional fields (legacy parity)', () => {
    const s = new State();
    s.orgNodes = [
      { id: 'n1', title: 'Root', desc: 'D', pid: null, bg: '', borderColor: '', borderStyle: 'solid', borderWidth: 1, _col: false, _h: false, _x: 5, _y: 6 },
    ];
    const o = s.toJSON().orgChart[0];
    assertEqual(o.id, 'n1');
    assertEqual(o.title, 'Root');
    assertEqual(o.desc, 'D');
    assertEqual(o.pid, null);
    // empty/default optional fields must be absent
    assertEqual('bg' in o, false);
    assertEqual('borderColor' in o, false);
    assertEqual('borderStyle' in o, false);
    assertEqual('borderWidth' in o, false);
    // transient layout fields never serialized
    assertEqual('_x' in o, false);
    assertEqual('_col' in o, false);
  });

  test('toJSON org node keeps non-default optional style fields', () => {
    const s = new State();
    s.orgNodes = [
      { id: 'n2', title: 'T', desc: '', pid: null, bg: '#fff', borderColor: '#000', borderStyle: 'dashed', borderWidth: 3, _col: false, _h: false, _x: 0, _y: 0 },
    ];
    const o = s.toJSON().orgChart[0];
    assertEqual(o.bg, '#fff');
    assertEqual(o.borderColor, '#000');
    assertEqual(o.borderStyle, 'dashed');
    assertEqual(o.borderWidth, 3);
  });
});

suite('Project Charter Model — fromJSON', () => {
  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.problemStatement, '');
    assertEqual(s.goals.length, 0);
    assertEqual(s.orgNodes.length, 0);
    assertEqual(s.orgStyle.nodeBorderStyle, 'solid');
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.problemStatement, '');
    assertEqual(s.goals.length, 0);
  });

  test('fromJSON({}) returns valid default', () => {
    const s = State.fromJSON({});
    assertEqual(s.problemStatement, '');
    assertEqual(s.goals.length, 0);
    assertEqual(s.orgNodes.length, 0);
  });

  test('fromJSON restores problemStatement and goals', () => {
    const s = State.fromJSON({
      problemStatement: 'Problem',
      goals: [{ id: 'g1', description: 'D', targetDate: '2026-05-05', metric: 'm', targetValue: 'v', achievementLevel: 30 }],
    });
    assertEqual(s.problemStatement, 'Problem');
    assertEqual(s.goals.length, 1);
    assertEqual(s.goals[0].achievementLevel, 30);
  });

  test('fromJSON imports flat org chart format', () => {
    const s = State.fromJSON({
      orgChart: [
        { id: 'a', title: 'A', desc: 'da', pid: null },
        { id: 'b', title: 'B', desc: 'db', pid: 'a' },
      ],
    });
    assertEqual(s.orgNodes.length, 2);
    assertEqual(s.orgNodes[0].id, 'a');
    assertEqual(s.orgNodes[1].pid, 'a');
    // internal layout fields initialized
    assertEqual(s.orgNodes[0]._col, false);
    assertEqual(s.orgNodes[0]._x, 0);
  });

  test('fromJSON imports recursive (children) org chart format', () => {
    const s = State.fromJSON({
      orgChart: [
        { id: 'root', title: 'Root', description: 'r', children: [
          { id: 'c1', title: 'Child', description: 'c', children: [] },
        ] },
      ],
    });
    assertEqual(s.orgNodes.length, 2);
    const root = s.orgNodes.find(n => n.id === 'root');
    const child = s.orgNodes.find(n => n.id === 'c1');
    assertEqual(root.pid, null);
    assertEqual(child.pid, 'root');
    assertEqual(child.desc, 'c');
  });

  test('fromJSON restores orgStyle merged over defaults', () => {
    const s = State.fromJSON({ orgStyle: { lineWidth: 5, nodeBg: '#abc' } });
    assertEqual(s.orgStyle.lineWidth, 5);
    assertEqual(s.orgStyle.nodeBg, '#abc');
    // unspecified keep defaults
    assertEqual(s.orgStyle.nodeBorderStyle, 'solid');
    assertEqual(s.orgStyle.nodeBorderWidth, 1);
  });

  test('fromJSON handles malformed goals/orgChart gracefully', () => {
    const s = State.fromJSON({ goals: 'nope', orgChart: 42, orgStyle: 'bad' });
    assertEqual(s.goals.length, 0);
    assertEqual(s.orgNodes.length, 0);
    assertEqual(s.orgStyle.nodeBorderStyle, 'solid');
  });
});

suite('Project Charter Model — roundtrip', () => {
  test('toJSON -> fromJSON preserves data', () => {
    const s = new State();
    s.problemStatement = 'P';
    s.goals = [{ id: 'g1', description: 'D', targetDate: '2026-01-01', metric: 'M', targetValue: 'T', achievementLevel: 75 }];
    s.orgNodes = [
      { id: 'n1', title: 'Root', desc: '', pid: null, bg: '#fff', borderColor: '', borderStyle: 'solid', borderWidth: 1, _col: false, _h: false, _x: 0, _y: 0 },
    ];
    s.orgStyle.lineWidth = 3;
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(back.problemStatement, 'P');
    assertEqual(back.goals[0].achievementLevel, 75);
    assertEqual(back.orgNodes[0].title, 'Root');
    assertEqual(back.orgNodes[0].bg, '#fff');
    assertEqual(back.orgStyle.lineWidth, 3);
  });
});

suite('Project Charter Model — business logic', () => {
  test('addGoal pushes a goal with defaults and unique id', () => {
    const s = new State();
    const g = s.addGoal();
    assertEqual(s.goals.length, 1);
    assertEqual(g.description, '');
    assertEqual(g.achievementLevel, 0);
    assertEqual(typeof g.id, 'string');
  });

  test('deleteGoal removes by id', () => {
    const s = new State();
    const g = s.addGoal();
    s.addGoal();
    s.deleteGoal(g.id);
    assertEqual(s.goals.length, 1);
    assertEqual(s.goals.find(x => x.id === g.id), undefined);
  });

  test('reorderGoal moves before target', () => {
    const s = new State();
    s.goals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    s.reorderGoal('c', 'a', false); // move c before a
    assertEqual(s.goals.map(g => g.id).join(''), 'cab');
  });

  test('reorderGoal moves after target', () => {
    const s = new State();
    s.goals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    s.reorderGoal('a', 'b', true); // move a after b
    assertEqual(s.goals.map(g => g.id).join(''), 'bac');
  });

  test('setGoalField clamps achievementLevel 0..100', () => {
    const s = new State();
    const g = s.addGoal();
    s.setGoalField(g.id, 'achievementLevel', '150');
    assertEqual(g.achievementLevel, 100);
    s.setGoalField(g.id, 'achievementLevel', '-10');
    assertEqual(g.achievementLevel, 0);
    s.setGoalField(g.id, 'achievementLevel', '42');
    assertEqual(g.achievementLevel, 42);
  });

  test('setGoalField stores text fields verbatim', () => {
    const s = new State();
    const g = s.addGoal();
    s.setGoalField(g.id, 'description', 'Hello');
    assertEqual(g.description, 'Hello');
  });

  test('hasContent false on empty, true with any content', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.problemStatement = 'x';
    assertEqual(s.hasContent(), true);
    const s2 = new State();
    s2.addGoal();
    assertEqual(s2.hasContent(), true);
    const s3 = new State();
    s3.orgNodes = [{ id: 'n', title: 'T', desc: '', pid: null }];
    assertEqual(s3.hasContent(), true);
  });
});

suite('project-charter: prepareFragment', () => {
  test('renders Markdown marks to <strong>/<em> (no HTML string sink)', () => {
    const frag = prepareFragment('**hi** *ok*');
    const host = document.createElement('div');
    host.appendChild(frag);
    assertEqual(host.querySelector('strong').textContent, 'hi');
    assertEqual(host.querySelector('em').textContent, 'ok');
  });
  test('treats raw HTML as literal text — never parses tags', () => {
    const frag = prepareFragment('<b onclick="x()">hi</b><script>bad()</script>');
    const host = document.createElement('div');
    host.appendChild(frag);
    // No element is created — the input is plain Markdown text.
    assertEqual(host.querySelector('script'), null);
    assertEqual(host.querySelector('b'), null);
    assertEqual(host.textContent, '<b onclick="x()">hi</b><script>bad()</script>');
  });
  test('newlines become <br> nodes', () => {
    const host = document.createElement('div');
    host.appendChild(prepareFragment('line1\nline2'));
    assertEqual(host.querySelectorAll('br').length, 1);
    assertEqual(host.textContent, 'line1line2');
  });
});

suite('project-charter: dashboard tile render', () => {
  const i18n = { t: (k) => k };

  test('renders problem statement Markdown as <strong>, not raw **', () => {
    const host = document.createElement('div');
    renderDashboardTile(host, { state: { problemStatement: '**bold** text' }, i18n });
    const problem = host.querySelector('.dashboard-charter__problem');
    assertEqual(problem.querySelector('strong').textContent, 'bold');
    assertEqual(problem.textContent, 'bold text');
    assertEqual(problem.textContent.includes('**'), false);
  });

  test('no instance → charterEmpty placeholder', () => {
    const host = document.createElement('div');
    renderDashboardTile(host, { state: null, i18n });
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.charterEmpty');
  });

  test('instance without problem statement → charterNoProblem placeholder', () => {
    const host = document.createElement('div');
    renderDashboardTile(host, { state: { problemStatement: '' }, i18n });
    assertEqual(host.querySelector('.dashboard-area__empty').textContent, 'dashboard.charterNoProblem');
  });
});
