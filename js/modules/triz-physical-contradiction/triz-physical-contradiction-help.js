/**
 * D.Mike — TRIZ Physical Contradiction Module Handbook
 * Bilingual help content (DE/EN) for the Physical Contradiction worksheet.
 */

export default {
  moduleId: 'triz-physical-contradiction',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein **physikalischer Widerspruch** liegt vor, wenn ein und derselbe Parameter eines Systems gleichzeitig zwei entgegengesetzte Werte annehmen muss. Anders als der technische Widerspruch der Altschuller-Matrix („Parameter A verbessert ↑, Parameter B verschlechtert ↓") ist der physikalische Widerspruch enger — und genau deshalb mächtiger: Er zwingt zur klaren Aussage „X muss A sein UND nicht-A sein".',
          },
          {
            type: 'definition',
            term: 'Physikalischer Widerspruch',
            content: 'Ein Parameter X muss zwei sich ausschließende Werte gleichzeitig annehmen. Formal: X soll A sein, damit Wirkung 1 eintritt. X soll ¬A sein, damit Wirkung 2 eintritt.',
          },
          {
            type: 'paragraph',
            content: 'Klassische Beispiele:',
          },
          {
            type: 'list',
            items: [
              'Eine Tragfläche soll **lang** sein (für Auftrieb beim Start) und **kurz** sein (für niedrigen Luftwiderstand im Reiseflug).',
              'Eine Kaffeetasse soll **heiß** sein (damit der Kaffee warm bleibt) und **kalt** sein (damit die Lippe nicht verbrennt).',
              'Eine Schweißelektrode soll **dick** sein (für Stromtragfähigkeit) und **dünn** sein (um in die Fuge zu kommen).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die Lösung führt nicht über eine Matrix, sondern über die **vier Separationsprinzipien**: Zeit, Raum, Bedingung und Systemebene. Eines dieser vier Prinzipien löst praktisch jeden physikalischen Widerspruch auf — die Frage ist nur, welches.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'A **physical contradiction** exists when one and the same parameter of a system must take two opposite values at the same time. Unlike the technical contradiction of Altshuller\'s matrix ("if I improve A, B gets worse"), the physical contradiction is sharper — and that is its power: it forces the explicit statement "X must be A AND not-A".',
          },
          {
            type: 'definition',
            term: 'Physical contradiction',
            content: 'A parameter X must take two mutually exclusive values at the same time. Formally: X should be A for effect 1 to occur. X should be ¬A for effect 2 to occur.',
          },
          {
            type: 'paragraph',
            content: 'Classical examples:',
          },
          {
            type: 'list',
            items: [
              'An aircraft wing must be **long** (for lift at take-off) and **short** (for low drag at cruise).',
              'A coffee cup must be **hot** (to keep the drink warm) and **cold** (so the lip doesn\'t burn).',
              'A welding electrode must be **thick** (for current capacity) and **thin** (to reach the joint).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Resolution is not via a matrix but via the **four separation principles**: time, space, condition, system level. One of these four principles resolves almost every physical contradiction — the question is just which one.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen',
        blocks: [
          {
            type: 'list',
            items: [
              'Den Parameter klar benennen — *ein* messbares Attribut des Systems, nicht das System selbst (also „Tragflügellänge", nicht „Tragflügel").',
              'Die zwei entgegengesetzten Anforderungen formulieren („soll A sein, damit …" / „soll ¬A sein, damit …"). Wichtig: das *damit* — die jeweilige Funktion oder Wirkung mitschreiben.',
              'Plausibilitätscheck: handelt es sich wirklich um einen *physikalischen* Widerspruch (gleicher Parameter zwei Werte) und nicht um einen *technischen* (zwei Parameter)? Im Zweifel zurück in die Widerspruchsmatrix.',
              'Die vier Separationsprinzipien der Reihe nach durchgehen. Für jedes prüfen, ob es im konkreten Fall anwendbar ist, und die Idee dazu festhalten.',
              'Das passende Prinzip auswählen und die konkrete Lösungsidee im Lösungs-Feld konkretisieren — was wird wann / wo / unter welcher Bedingung / auf welcher Ebene anders?',
            ],
          },
          {
            type: 'paragraph',
            content: 'Wenn mehrere Prinzipien passen, dürfen Sie sie auch kombinieren — das ist häufig die ergiebigste Lösung. In dem Fall wählen Sie das *dominante* Prinzip und beschreiben die Kombination im Lösungs-Feld.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Name the parameter clearly — *one* measurable attribute of the system, not the system itself ("wing length", not "wing").',
              'Phrase the two opposite requirements ("should be A, in order to …" / "should be ¬A, in order to …"). Crucially, capture the *in order to* — the function or effect each value serves.',
              'Sanity check: is this really a *physical* contradiction (one parameter, two values) and not a *technical* one (two parameters)? When in doubt, fall back to the contradiction matrix.',
              'Walk through the four separation principles one by one. For each, ask whether it applies to your case and write down the candidate idea.',
              'Pick the principle that fits and elaborate the concrete solution in the solution field — what changes when / where / under which condition / at which level?',
            ],
          },
          {
            type: 'paragraph',
            content: 'If several principles apply, you may combine them — that is often the most productive solution. In that case pick the *dominant* principle and describe the combination in the solution field.',
          },
        ],
      },
    },

    principles: {
      de: {
        title: 'Die vier Separationsprinzipien',
        blocks: [
          {
            type: 'definition',
            term: '1. Trennung in der Zeit',
            content: 'Der Parameter ist A zum Zeitpunkt t₁ und ¬A zum Zeitpunkt t₂. Beispiel: Klapptragwerk — der Flügel ist im Reiseflug kurz, beim Start lang. Auch: Fahrwerk ein-/ausfahrbar, Airbag entfaltet sich nur im Crash, Sägeblatt entfernt Material beim Schnitt, nicht beim Rückhub.',
          },
          {
            type: 'definition',
            term: '2. Trennung im Raum',
            content: 'Der Parameter ist A in Region X und ¬A in Region Y des Systems. Beispiel: Schraubenkopf hart (für den Schraubendreher), Schaft elastisch (gegen Bruch). Auch: Bohrer scharf an der Spitze, stumpf am Schaft; Brille mit unterschiedlichen Bereichen (Gleitsicht).',
          },
          {
            type: 'definition',
            term: '3. Trennung nach Bedingung',
            content: 'Der Parameter ist A unter Bedingung C₁ und ¬A unter Bedingung C₂. Bedingung kann Last, Temperatur, Nutzergruppe, Geschwindigkeit, … sein. Beispiel: Nicht-Newton\'sche Flüssigkeit — bei niedriger Last flüssig, bei Schlag fest. Auch: photochrome Brillengläser, Memory-Schaum, ABS-Bremsdruck nach Schlupf.',
          },
          {
            type: 'definition',
            term: '4. Trennung in der Systemebene',
            content: 'Der Widerspruch löst sich auf, wenn man die Hierarchieebene wechselt: Was auf der Systemebene widersprüchlich ist, kann durch Teilung in Subsysteme (jedes Subsystem nur einen Wert) oder durch Eingliederung in ein Supersystem aufgelöst werden. Beispiel: Fahrradkette — als Ganzes flexibel, einzelne Glieder starr. Auch: Litze (jeder Draht dünn, der Strang dick), Sandwich-Bauteile.',
          },
        ],
      },
      en: {
        title: 'The four separation principles',
        blocks: [
          {
            type: 'definition',
            term: '1. Separation in time',
            content: 'The parameter is A at moment t₁ and ¬A at moment t₂. Example: a folding wing — short at cruise, long at take-off. Also: retractable landing gear, airbags that deploy only on impact, saw teeth that remove material on the cutting stroke and not on the return.',
          },
          {
            type: 'definition',
            term: '2. Separation in space',
            content: 'The parameter is A in region X and ¬A in region Y of the system. Example: a screw with a hard head (for the screwdriver) and an elastic shaft (against breakage). Also: a drill bit sharp at the tip and blunt at the shank; progressive eyeglass lenses.',
          },
          {
            type: 'definition',
            term: '3. Separation on condition',
            content: 'The parameter is A under condition C₁ and ¬A under condition C₂. Condition may be load, temperature, user, speed, … Example: a non-Newtonian fluid — liquid under low load, solid under impact. Also: photochromic eyeglasses, memory foam, ABS brake pressure responding to wheel slip.',
          },
          {
            type: 'definition',
            term: '4. Separation between system levels',
            content: 'The contradiction dissolves when you change hierarchy level: what is contradictory at the system level may resolve by splitting into subsystems (each subsystem taking just one of the values) or by embedding into a supersystem. Example: a bicycle chain — flexible as a whole, rigid in each link. Also: stranded wire (each thread thin, the strand thick), sandwich composites.',
          },
        ],
      },
    },

    crossLinks: {
      de: {
        title: 'Bezug zu anderen TRIZ-Werkzeugen',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der physikalische Widerspruch sitzt zwischen der **Widerspruchsmatrix** (technischer Widerspruch) und der **Substanz-Feld-Analyse** (Lösungs-Standards):',
          },
          {
            type: 'list',
            items: [
              'Wenn die Widerspruchsmatrix für eine Parameter-Kombination *mehrere widersprüchliche* Prinzipien empfiehlt oder *gar keinen* Eintrag liefert, ist das ein Hinweis: der Kern des Problems ist wahrscheinlich ein physikalischer Widerspruch — wechseln Sie hierhin.',
              'Das **9-Fenster-Werkzeug** ist vorgeschaltet: es weitet den Systemblick. Innerhalb einer der neun Zellen taucht dann oft ein konkreter Widerspruch auf, den dieses Modul löst.',
              'Die Separationsebene „System" ist direkt verwandt mit der Hierarchieachse des 9-Fenster-Werkzeugs — sub/system/super sind dieselben Ebenen.',
            ],
          },
        ],
      },
      en: {
        title: 'Relation to other TRIZ tools',
        blocks: [
          {
            type: 'paragraph',
            content: 'The physical contradiction sits between the **contradiction matrix** (technical contradiction) and **Substance-Field analysis** (76 standard solutions):',
          },
          {
            type: 'list',
            items: [
              'When the contradiction matrix returns *several conflicting* principles for a parameter pair or *no entry at all*, that is a hint: the core problem is probably a physical contradiction — switch here.',
              'The **9-Windows tool** sits upstream: it broadens the system view. Within one of the nine cells a concrete contradiction often emerges that this module resolves.',
              'The "system level" separation principle is directly related to the 9-Windows hierarchy axis — sub / system / super are the same levels.',
            ],
          },
        ],
      },
    },

    references: {
      de: {
        title: 'Quellen & Weiterlesen',
        blocks: [
          {
            type: 'list',
            items: [
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984).',
              'D. Mann: „Hands-On Systematic Innovation" — Kapitel zu physikalischen Widersprüchen und Separationsprinzipien.',
              'V. Souchkov: „TRIZ Body of Knowledge" — Kurzdefinitionen Separation Principles.',
              'oxfordcreativity.co.uk — frei verfügbare Beispiele zu jedem Separationsprinzip.',
            ],
          },
        ],
      },
      en: {
        title: 'References & further reading',
        blocks: [
          {
            type: 'list',
            items: [
              'G. S. Altshuller: "Creativity as an Exact Science" (1984).',
              'D. Mann: "Hands-On Systematic Innovation" — chapter on physical contradictions and separation principles.',
              'V. Souchkov: "TRIZ Body of Knowledge" — short definitions of the separation principles.',
              'oxfordcreativity.co.uk — open examples for each separation principle.',
            ],
          },
        ],
      },
    },
  },
};