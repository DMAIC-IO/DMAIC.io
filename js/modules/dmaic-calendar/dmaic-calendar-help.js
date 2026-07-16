/**
 * D.Mike — DMAIC Calendar Module Handbook (dmaic-calendar-help.js)
 * Bilingual help content (DE/EN) for the DMAIC calendar module.
 */

export default {
  moduleId: 'dmaic-calendar',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der {{term:dmaic|DMAIC}}-Kalender ist ein Projektkalender mit eingebauter Phasen-Logik. Jeder Termin lässt sich einer DMAIC-Phase (Define, Measure, Analyze, Improve, Control) zuordnen und wird in der jeweiligen Phasenfarbe dargestellt — so sieht man auf einen Blick, in welcher Projektphase der meiste Aufwand liegt.',
          },
          {
            type: 'definition',
            term: 'Monatsansicht',
            content: 'Zeigt einen vollständigen Kalendermonat als Raster. Pro Tag werden bis zu mehrere Termine gestapelt, sortiert nach Startzeit. Ideal für die langfristige Projektplanung und Tollgate-Termine.',
          },
          {
            type: 'definition',
            term: 'Wochenansicht',
            content: 'Zeigt eine Woche mit einer vertikalen Zeitachse. Termine werden als farbige Blöcke an ihrer realen Uhrzeit gezeichnet. Ideal für die Detailplanung von Workshops, Reviews und operativen Aktivitäten.',
          },
          {
            type: 'definition',
            term: 'Phasen-Filter',
            content: 'Über die Phasen-Buttons lässt sich der Kalender auf eine einzelne DMAIC-Phase einschränken — z. B. nur Define-Termine anzeigen, um den Define-Aufwand auf einen Blick zu sehen.',
          },
          {
            type: 'definition',
            term: 'Konfigurierbare Zeitachse',
            content: 'Anzeigebereich der Wochenansicht (Stunden und Wochentage) lässt sich anpassen. So blendet man z. B. Wochenenden oder Nachtstunden aus und gewinnt Platz für die relevanten Arbeitszeiten.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The DMAIC calendar is a project calendar with built-in phase logic. Every event can be tagged with a DMAIC phase (Define, Measure, Analyze, Improve, Control) and is rendered in the corresponding phase color — at a glance you can see which project phase carries most of the workload.',
          },
          {
            type: 'definition',
            term: 'Month view',
            content: 'Shows a full calendar month as a grid. Events stack per day, sorted by start time. Ideal for long-term project planning and tollgate scheduling.',
          },
          {
            type: 'definition',
            term: 'Week view',
            content: 'Shows one week with a vertical time axis. Events are drawn as colored blocks at their real start and end times. Ideal for detailed planning of workshops, reviews, and operational activities.',
          },
          {
            type: 'definition',
            term: 'Phase filter',
            content: 'Phase buttons restrict the calendar to a single DMAIC phase — e.g. show only Define events to see the Define workload at a glance.',
          },
          {
            type: 'definition',
            term: 'Configurable time axis',
            content: 'The visible range of the week view (hours and weekdays) can be adjusted. Hide weekends or night hours to gain space for the relevant working hours.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Bedienung',
        blocks: [
          {
            type: 'heading',
            content: 'Termine anlegen und ändern',
          },
          {
            type: 'list',
            items: [
              'In der Wochenansicht: in eine freie Stelle klicken und ziehen → neuer Termin.',
              'In der Monatsansicht: auf einen Tag klicken → Termin-Dialog öffnet sich.',
              'Termine per Drag & Drop verschieben — die DMAIC-Phase bleibt erhalten.',
              'Untere Kante eines Termins ziehen, um die Dauer anzupassen.',
              'Klick auf einen Termin → Dialog zum Bearbeiten von Titel, Zeit, Phase und Notizen.',
            ],
          },
          {
            type: 'heading',
            content: 'Navigation',
          },
          {
            type: 'list',
            items: [
              'Pfeil-Buttons im Header → vorheriger / nächster Monat oder Woche.',
              '„Heute"-Button springt zur aktuellen Woche / zum aktuellen Monat zurück.',
              'Umschalten zwischen Monats- und Wochenansicht über die Ansicht-Buttons.',
            ],
          },
          {
            type: 'heading',
            content: 'Phasenzuordnung',
          },
          {
            type: 'list',
            items: [
              'Beim Anlegen eines Termins eine der fünf DMAIC-Phasen wählen — die Farbe folgt automatisch.',
              'Phase nachträglich über den Bearbeiten-Dialog ändern.',
              'Phasen-Filter über die Buttons oberhalb des Kalenders ein- und ausschalten.',
            ],
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'heading',
            content: 'Creating and editing events',
          },
          {
            type: 'list',
            items: [
              'Week view: click and drag on a free area → new event.',
              'Month view: click a day → event dialog opens.',
              'Move events with drag & drop — the DMAIC phase is preserved.',
              'Drag the bottom edge of an event to adjust its duration.',
              'Click an event → dialog to edit title, time, phase, and notes.',
            ],
          },
          {
            type: 'heading',
            content: 'Navigation',
          },
          {
            type: 'list',
            items: [
              'Arrow buttons in the header → previous / next month or week.',
              '"Today" button jumps back to the current week / month.',
              'Switch between month and week view via the view buttons.',
            ],
          },
          {
            type: 'heading',
            content: 'Phase assignment',
          },
          {
            type: 'list',
            items: [
              'When creating an event, pick one of the five DMAIC phases — the color follows automatically.',
              'Change the phase later through the edit dialog.',
              'Toggle the phase filter via the buttons above the calendar.',
            ],
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          {
            type: 'definition',
            term: 'Termine ohne Phase',
            content: 'Termine ohne Phasen-Tag werden zwar angezeigt, lassen sich aber nicht filtern und tragen nicht zur Phasenstatistik bei. Bei jedem neuen Termin bewusst eine Phase wählen.',
          },
          {
            type: 'definition',
            term: 'Zu enge Zeitachse',
            content: 'Wird der Anzeigebereich auf z. B. 9–17 Uhr beschränkt, sind frühere oder spätere Termine unsichtbar. Nach Anpassung der Zeitachse stichprobenartig prüfen, dass keine Termine versteckt liegen.',
          },
          {
            type: 'definition',
            term: 'Überlappende Termine',
            content: 'Mehrere Termine zur selben Zeit werden in der Wochenansicht nebeneinander schmaler dargestellt. Bei vielen Überschneidungen wird es schnell unübersichtlich — ggf. in mehrere Sub-Termine aufteilen oder konsolidieren.',
          },
          {
            type: 'definition',
            term: 'Drag verschiebt versehentlich Termine',
            content: 'Drag & Drop ist sensibel — schon ein kleiner Versatz beim Klicken kann einen Termin verschieben. Wenn Termine „wandern": Drag rückgängig (Strg+Z) und Klick statt Drag verwenden.',
          },
          {
            type: 'definition',
            term: 'Kalender ist kein Aufgabenmanager',
            content: 'Der Kalender plant Termine — er ersetzt keine Aufgabenliste mit Prioritäten, Verantwortlichen und Status. Für Aufgaben das Modul „Lessons Learned" oder externe Tools nutzen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Events without a phase',
            content: 'Events without a phase tag are displayed but cannot be filtered and do not contribute to phase statistics. Choose a phase deliberately for every new event.',
          },
          {
            type: 'definition',
            term: 'Time axis too narrow',
            content: 'If the visible range is restricted to e.g. 9 a.m.–5 p.m., earlier or later events become invisible. After adjusting the time axis, spot-check that no events are hidden.',
          },
          {
            type: 'definition',
            term: 'Overlapping events',
            content: 'Multiple events at the same time are drawn side by side and become narrower in the week view. With many overlaps it gets confusing quickly — split into sub-events or consolidate.',
          },
          {
            type: 'definition',
            term: 'Drag accidentally moves events',
            content: 'Drag & drop is sensitive — even a small offset when clicking can move an event. If events appear to "wander": undo with Ctrl+Z and use click instead of drag.',
          },
          {
            type: 'definition',
            term: 'The calendar is not a task manager',
            content: 'The calendar schedules events — it does not replace a task list with priorities, owners, and status. Use the Lessons Learned module or external tools for tasks.',
          },
        ],
      },
    },
  },
};
