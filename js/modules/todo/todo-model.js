export const STATUSES = ['open', 'in-progress', 'done', 'blocked'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export class Item {
  id = uid()
  text = ''
  owner = ''
  due = ''
  status = 'open'
  cal = false

  toJSON() {
    return {
      id: this.id,
      text: this.text,
      owner: this.owner,
      due: this.due,
      status: this.status,
      cal: this.cal,
    };
  }

  static fromJSON(d) {
    const item = new Item();
    if (d) {
      item.id = typeof d.id === 'string' && d.id ? d.id : uid();
      item.text = typeof d.text === 'string' ? d.text : '';
      item.owner = typeof d.owner === 'string' ? d.owner : '';
      item.due = typeof d.due === 'string' ? d.due : '';
      item.status = STATUSES.includes(d.status) ? d.status : 'open';
      item.cal = d.cal === true;
    }
    return item;
  }
}

export class State {
  static VERSION = '1.0';
  static ID = 'todo';

  _schema = { name: State.ID, version: State.VERSION }
  items = []
  filterStatus = 'all'
  filterOwner = 'all'
  search = ''
  sortCol = 'due'
  sortAsc = true

  hasContent() {
    return this.items.length > 0;
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      items: this.items.map(i => i.toJSON()),
      filterStatus: this.filterStatus,
      filterOwner: this.filterOwner,
      search: this.search,
      sortCol: this.sortCol,
      sortAsc: this.sortAsc,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;

    if (Array.isArray(d.items)) {
      s.items = d.items.map(i => Item.fromJSON(i));
    }
    if (typeof d.filterStatus === 'string' && (d.filterStatus === 'all' || STATUSES.includes(d.filterStatus))) {
      s.filterStatus = d.filterStatus;
    }
    if (typeof d.filterOwner === 'string') {
      s.filterOwner = d.filterOwner;
    }
    if (typeof d.search === 'string') {
      s.search = d.search;
    }
    if (typeof d.sortCol === 'string') {
      s.sortCol = d.sortCol;
    }
    if (typeof d.sortAsc === 'boolean') {
      s.sortAsc = d.sortAsc;
    }
    return s;
  }
}
