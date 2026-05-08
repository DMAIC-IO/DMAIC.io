/**
 * D.Mike — Unit Converter Module Handbook (unit-converter-help.js)
 * Bilingual help content (DE/EN) for the unit converter module.
 */

export default {
  moduleId: 'unit-converter',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der Einheitenrechner wandelt Zahlenwerte zwischen physikalischen Einheiten um — Länge, Masse, Volumen, Temperatur, Druck, Zeit und mehr. Er ist als kleiner Helfer gedacht, um Messwerte vor einer Analyse auf eine einheitliche Größe zu bringen.',
          },
          {
            type: 'definition',
            term: 'Quell- und Zieleinheit',
            content: 'Der eingegebene Wert in der Quelleinheit wird in den entsprechenden Wert in der Zieleinheit umgerechnet. Die Konvertierung erfolgt sofort, ohne Bestätigung.',
          },
          {
            type: 'definition',
            term: 'Kategorien',
            content: 'Einheiten sind nach physikalischer Größe (Länge, Druck, Temperatur, …) gruppiert. Innerhalb einer Kategorie sind alle Umrechnungen exakt definiert; Umrechnungen zwischen Kategorien sind nicht möglich.',
          },
          {
            type: 'paragraph',
            content: 'Für die regelmäßige Konvertierung ganzer Worksheet-Spalten empfiehlt sich stattdessen eine Formelspalte direkt im Arbeitsblatt — der Einheitenrechner ist auf Einzelumrechnungen ausgelegt.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The unit converter transforms numeric values between physical units — length, mass, volume, temperature, pressure, time, and more. It is meant as a small helper to bring measurements to a common unit before analysis.',
          },
          {
            type: 'definition',
            term: 'Source and target unit',
            content: 'The value entered in the source unit is converted to the equivalent value in the target unit. Conversion is instant, with no confirmation step.',
          },
          {
            type: 'definition',
            term: 'Categories',
            content: 'Units are grouped by physical quantity (length, pressure, temperature, …). All conversions within a category are exact; conversions between categories are not possible.',
          },
          {
            type: 'paragraph',
            content: 'For regular conversion of entire worksheet columns, a formula column directly in the worksheet is the better choice — the unit converter is designed for individual conversions.',
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
            term: 'Temperatur ist nicht proportional',
            content: 'Celsius, Fahrenheit und Kelvin haben unterschiedliche Nullpunkte. Eine Differenz von 10 °C ist nicht gleich 10 °F. Bei Temperaturdifferenzen die jeweilige Differenz-Einheit beachten.',
          },
          {
            type: 'definition',
            term: 'Überdruck vs. Absolutdruck',
            content: 'Druckangaben können absolut oder relativ zum Atmosphärendruck (Überdruck) gemeint sein. Vor der Umrechnung klären, welche Konvention die Datenquelle nutzt — ein Versatz von 1 bar ist sonst leicht möglich.',
          },
          {
            type: 'definition',
            term: 'US- und britische Einheiten unterscheiden sich',
            content: 'Eine US-Gallone ist nicht gleich einer britischen Gallone (ca. 3,79 l vs. 4,55 l). Auch fluid ounce, ton (short/long) und ähnliche Einheiten existieren in mehreren Varianten.',
          },
          {
            type: 'definition',
            term: 'Stille Rundungsfehler',
            content: 'Bei sehr kleinen oder sehr großen Werten können Anzeigerundungen Genauigkeit verbergen. Für hochpräzise Berechnungen lieber Roh-Faktoren verwenden oder die volle Stellenzahl prüfen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Temperature is not proportional',
            content: 'Celsius, Fahrenheit, and Kelvin have different zero points. A difference of 10 °C is not equal to 10 °F. For temperature differences, use the appropriate difference unit.',
          },
          {
            type: 'definition',
            term: 'Gauge vs. absolute pressure',
            content: 'Pressure values can be absolute or relative to atmospheric pressure (gauge). Clarify which convention the data source uses before converting — otherwise a 1 bar offset is easy to introduce.',
          },
          {
            type: 'definition',
            term: 'US and Imperial units differ',
            content: 'A US gallon is not equal to an Imperial gallon (≈ 3.79 l vs. 4.55 l). Fluid ounce, ton (short/long), and similar units also exist in several variants.',
          },
          {
            type: 'definition',
            term: 'Silent rounding errors',
            content: 'For very small or very large values, display rounding can hide precision. For high-precision calculations, use raw factors or check the full digit count.',
          },
        ],
      },
    },
  },
};
