import { createModule } from '../../core/template-module.js';
import { State, Item, STATUSES } from './todo-model.js';
import { resolveDateOffset } from '../../core/date-offset.js';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default createModule({
  config: {
    id: 'todo',
    engine: 'alpine',
    phase: 'define',
    icon: 'check-square',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'plus', title: 'addTodo', variant: 'primary', onClick: (d) => d.addTodo() },
    ],
  },
  Model: State,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.items)) {
      result.items = result.items.map(item => ({ ...item, due: resolveDateOffset(item.due) }));
    }
    return result;
  },

  data(module, _t) {
    return {
      statuses: STATUSES,

      statusName: (s) => _t(`status_${  s}`),

      todayISO: () => todayISO(),

      hasCalendar: false,

      owners() {
        const set = new Set();
        this.model.items.forEach(i => {
          if (i.owner?.trim()) set.add(i.owner.trim());
        });
        return [...set].sort();
      },

      filteredItems() {
        const q = this.model.search.toLowerCase();
        return this.sortedItems(this.model.items.filter(i => {
          if (this.model.filterStatus !== 'all' && i.status !== this.model.filterStatus) return false;
          if (this.model.filterOwner !== 'all' && (i.owner || '').trim() !== this.model.filterOwner) return false;
          if (q && !i.text.toLowerCase().includes(q) && !(i.owner || '').toLowerCase().includes(q)) return false;
          return true;
        }));
      },

      sortedItems(list) {
        const dir = this.model.sortAsc ? 1 : -1;
        return [...list].sort((a, b) => {
          let va, vb;
          switch (this.model.sortCol) {
            case 'text':   va = a.text.toLowerCase(); vb = b.text.toLowerCase(); break;
            case 'owner':  va = (a.owner || '').toLowerCase(); vb = (b.owner || '').toLowerCase(); break;
            case 'due':    va = a.due || '9999'; vb = b.due || '9999'; break;
            case 'status': va = STATUSES.indexOf(a.status); vb = STATUSES.indexOf(b.status); break;
            default:       return 0;
          }
          if (va < vb) return -dir;
          if (va > vb) return dir;
          return 0;
        });
      },

      filteredCount() {
        return this.filteredItems().length;
      },

      rowClass(item) {
        const isDone = item.status === 'done';
        const isOverdue = !isDone && item.due && item.due < todayISO();
        return {
          'todo__row--done': isDone,
          'todo__row--overdue': isOverdue,
        };
      },

      sortArrow(col) {
        if (this.model.sortCol !== col) return '\u2195';
        return this.model.sortAsc ? '\u25b2' : '\u25bc';
      },

      sortArrowClass(col) {
        if (this.model.sortCol !== col) return '';
        return 'todo__sort-arrow--active';
      },

      addTodo() {
        this.model.items.push(new Item());
        this.$nextTick(() => {
          const inputs = document.querySelectorAll('.todo__inline-input[data-field="text"]');
          inputs[inputs.length - 1]?.focus();
        });
      },

      sortBy(col) {
        if (this.model.sortCol === col) {
          this.model.sortAsc = !this.model.sortAsc;
        } else {
          this.model.sortCol = col;
          this.model.sortAsc = true;
        }
      },

      toggleDone(item) {
        item.status = item.status === 'done' ? 'open' : 'done';
      },

      toggleCal(item) {
        item.cal = !item.cal;
      },

      deleteTodo(item) {
        this.model.items = this.model.items.filter(i => i.id !== item.id);
      },

      syncCalendar() {
        if (!this.hasCalendar) return;
        const items = this.model.items
          .filter(i => i.cal && i.text && i.due)
          .map(i => ({ id: i.id, title: i.text, date: i.due, status: i.status }));
        module._context.eventBus.emit('todo:calendar-sync', items);
      },

      checkCalendar() {
        const phases = module._context.stateManager.get('phases') || {};
        this.hasCalendar = Object.values(phases).flat().some(m => m.moduleId === 'dmaic-calendar');
      },

      init() {
        this.checkCalendar();

        this.$watch(
          () => this.model.toJSON(),
          () => {
            this.syncCalendar();
          }
        );

        module._context.eventBus.on('module:added', () => this.checkCalendar());
        module._context.eventBus.on('module:removed', () => this.checkCalendar());
      },
    };
  },
});
