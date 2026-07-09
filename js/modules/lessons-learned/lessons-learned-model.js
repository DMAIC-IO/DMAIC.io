export const CATEGORIES = ['success', 'problem', 'improve'];
export const IMPACTS = ['high', 'medium', 'low'];

export class Action {
  text = ''
  done = false

  toJSON() {
    return { text: this.text, done: this.done };
  }

  static fromJSON(d) {
    const a = new Action();
    if (d) {
      a.text = typeof d.text === 'string' ? d.text : '';
      a.done = typeof d.done === 'boolean' ? d.done : false;
    }
    return a;
  }
}

export class Lesson {
  id = ''
  title = ''
  category = 'success'
  phase = 'control'
  impact = 'medium'
  owner = ''
  description = ''
  rootCause = ''
  recommendation = ''
  actions = []
  createdAt = 0
  updatedAt = 0

  static uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      category: this.category,
      phase: this.phase,
      impact: this.impact,
      owner: this.owner,
      description: this.description,
      rootCause: this.rootCause,
      recommendation: this.recommendation,
      actions: this.actions.map(a => a.toJSON()),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(d) {
    const l = new Lesson();
    if (!d) return l;
    l.id = typeof d.id === 'string' ? d.id : Lesson.uid();
    l.title = typeof d.title === 'string' ? d.title : '';
    l.category = CATEGORIES.includes(d.category) ? d.category : 'success';
    l.phase = typeof d.phase === 'string' ? d.phase : 'control';
    l.impact = IMPACTS.includes(d.impact) ? d.impact : 'medium';
    l.owner = typeof d.owner === 'string' ? d.owner : '';
    l.description = typeof d.description === 'string' ? d.description : '';
    l.rootCause = typeof d.rootCause === 'string' ? d.rootCause : '';
    l.recommendation = typeof d.recommendation === 'string' ? d.recommendation : '';
    l.actions = Array.isArray(d.actions) ? d.actions.map(a => Action.fromJSON(a)) : [];
    l.createdAt = typeof d.createdAt === 'number' ? d.createdAt : 0;
    l.updatedAt = typeof d.updatedAt === 'number' ? d.updatedAt : 0;
    return l;
  }
}

export class State {
  lessons = []

  computeStats() {
    let total = 0, success = 0, problem = 0, improve = 0, openActions = 0;
    for (const l of this.lessons) {
      total++;
      if (l.category === 'success') success++;
      else if (l.category === 'problem') problem++;
      else if (l.category === 'improve') improve++;
      openActions += l.actions.filter(a => !a.done).length;
    }
    return { total, success, problem, improve, openActions };
  }

  hasContent() {
    return this.lessons.length > 0;
  }

  toJSON() {
    return { lessons: this.lessons.map(l => l.toJSON()) };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    s.lessons = Array.isArray(d.lessons) ? d.lessons.map(l => Lesson.fromJSON(l)) : [];
    return s;
  }
}
