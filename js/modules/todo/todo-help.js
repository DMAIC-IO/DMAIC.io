/**
 * D.Mike — Todo Module Help (todo-help.js)
 */
export default {
  moduleId: 'todo',
  sections: {
    methodology: {
      de: {
        title: 'Methodik',
        blocks: [
          { type: 'paragraph', content: 'Das Todo-Modul ist eine einfache Aufgabenliste für das DMAIC-Projekt. Jede Aufgabe hat einen Text, ein Zieldatum, einen Verantwortlichen (Owner) und einen Status.' },
          { type: 'definition', term: 'Status', content: 'Offen, In Bearbeitung, Erledigt oder Blockiert. Status wird direkt in der Tabelle geändert.' },
          { type: 'definition', term: 'Zieldatum', content: 'Überfällige Aufgaben werden automatisch rot markiert.' },
          { type: 'definition', term: 'Kalender', content: 'Über das Kalender-Symbol kann eine Aufgabe im Projektkalender angezeigt werden. Voraussetzung: Text und Zieldatum sind ausgefüllt.' },
          { type: 'definition', term: 'Filter', content: 'Die Tabelle kann nach Status, Owner und Freitext gefiltert werden. Spaltenköpfe sind sortierbar.' },
        ]
      },
      en: {
        title: 'Methodology',
        blocks: [
          { type: 'paragraph', content: 'The Todo module is a simple task list for the DMAIC project. Each task has a description, a due date, an owner, and a status.' },
          { type: 'definition', term: 'Status', content: 'Open, In Progress, Done, or Blocked. Status is changed directly in the table.' },
          { type: 'definition', term: 'Due Date', content: 'Overdue tasks are automatically highlighted in red.' },
          { type: 'definition', term: 'Calendar', content: 'Use the calendar icon to show a task in the project calendar. Requires both text and due date to be filled in.' },
          { type: 'definition', term: 'Filter', content: 'The table can be filtered by status, owner, and free text. Column headers are sortable.' },
        ]
      }
    },
    example: {
      de: {
        title: 'Beispiel',
        blocks: [
          { type: 'steps', items: [
            'Klicken Sie auf „+ Aufgabe hinzufügen", um eine neue Aufgabe zu erstellen.',
            'Füllen Sie Text, Zieldatum und Owner direkt in der Tabelle aus.',
            'Ändern Sie den Status über das Dropdown in der Status-Spalte.',
            'Nutzen Sie die Filter oben, um nach Status, Owner oder Stichwort zu filtern.',
            'Klicken Sie auf einen Spaltenkopf, um die Liste zu sortieren.',
          ] },
        ]
      },
      en: {
        title: 'Example',
        blocks: [
          { type: 'steps', items: [
            'Click "+ Add Task" to create a new task.',
            'Fill in text, due date, and owner directly in the table.',
            'Change status via the dropdown in the status column.',
            'Use the filters above to filter by status, owner, or keyword.',
            'Click a column header to sort the list.',
          ] },
        ]
      }
    },
  },
};
