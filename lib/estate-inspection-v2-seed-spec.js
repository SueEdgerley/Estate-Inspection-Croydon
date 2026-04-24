/**
 * Canonical **Estate Inspection v2** structure for creating a **new** Airtable template.
 * Does not modify the legacy Estate Inspection template — run the companion script to insert new rows.
 *
 * Field names on each question match what `lib/airtable-client.js` reads when building nested templates
 * (`Question Text`, `Question Type`, `Question Order`, `Section` link, optional triggers / photo / comment when).
 */

export const ESTATE_INSPECTION_V2_TEMPLATE = {
  /** Primary field on Templates table */
  Name: 'Estate Inspection v2',
  /** Machine key — must match `isEstateInspectionFormV2Template` in `lib/standard-inspection-form.js` */
  'Template Key': 'estate_inspection_v2',
  'Template Type': 'standard',
}

/**
 * @typedef {object} EstateInspectionV2QuestionSpec
 * @property {string} questionText — maps to `Question Text`
 * @property {string} questionType — maps to `Question Type` (graded | yes_no | text | single select)
 * @property {number} questionOrder — maps to `Question Order`
 * @property {Record<string, unknown>} [extra] — additional Airtable column names → values
 */

/** @type {{ sectionTitle: string, sectionOrder: number, questions: EstateInspectionV2QuestionSpec[] }[]} */
export const ESTATE_INSPECTION_V2_SECTIONS = [
  {
    sectionTitle: 'Internal Cleaning',
    sectionOrder: 1,
    questions: [
      {
        questionText: 'Overall standard of internal communal cleaning',
        questionType: 'graded',
        questionOrder: 1,
        extra: { 'Photo Required When': 'on_no', 'Comment Required When': 'on_no' },
      },
      {
        questionText: 'Are bins / chute areas clean and clear?',
        questionType: 'yes_no',
        questionOrder: 2,
        extra: {
          'Create Action On No': true,
          'Triggers Issue Answer': 'No',
          'Comment Required When': 'on_no',
        },
      },
      {
        questionText: 'How often should this block be cleaned to standard?',
        questionType: 'single select',
        questionOrder: 3,
        extra: { Options: 'Daily\nWeekly\nFortnightly\nMonthly' },
      },
    ],
  },
  {
    sectionTitle: 'Lifts',
    sectionOrder: 2,
    questions: [
      {
        questionText: 'Lift car and landing cleanliness',
        questionType: 'graded',
        questionOrder: 1,
        extra: { 'Photo Required When': 'on_no' },
      },
      {
        questionText: 'Are lift defects or out-of-service notices reported and visible?',
        questionType: 'yes_no',
        questionOrder: 2,
        extra: { 'Create Action On No': true, 'Triggers Issue Answer': 'No' },
      },
    ],
  },
  {
    sectionTitle: 'Car Parks',
    sectionOrder: 3,
    questions: [
      {
        questionText: 'Surface condition and line marking (where applicable)',
        questionType: 'graded',
        questionOrder: 1,
      },
      {
        questionText: 'Any obstruction or safety hazard in the car park?',
        questionType: 'yes_no',
        questionOrder: 2,
        extra: { 'Create Action On No': true, 'Triggers Issue Answer': 'Yes' },
      },
    ],
  },
  {
    sectionTitle: 'Abandoned Vehicles',
    sectionOrder: 4,
    questions: [
      {
        questionText: 'Are there abandoned vehicles causing obstruction or safety issues?',
        questionType: 'yes_no',
        questionOrder: 1,
        extra: {
          'Create Action On No': true,
          'Triggers Issue Answer': 'Yes',
          'Comment Required When': 'on_yes',
          'Photo Required When': 'on_yes',
        },
      },
      {
        questionText: 'Cost code (if applicable)',
        questionType: 'text',
        questionOrder: 2,
      },
    ],
  },
  {
    sectionTitle: 'Garages',
    sectionOrder: 5,
    questions: [
      {
        questionText: 'Garage block condition and security',
        questionType: 'graded',
        questionOrder: 1,
      },
    ],
  },
  {
    sectionTitle: 'Paths and Hardstandings',
    sectionOrder: 6,
    questions: [
      {
        questionText: 'Trip hazards or failed surfacing',
        questionType: 'graded',
        questionOrder: 1,
      },
    ],
  },
  {
    sectionTitle: 'Play Areas',
    sectionOrder: 7,
    questions: [
      {
        questionText: 'Equipment and surfacing safe for use',
        questionType: 'graded',
        questionOrder: 1,
      },
    ],
  },
  {
    sectionTitle: 'External Cleaning',
    sectionOrder: 8,
    questions: [
      {
        questionText: 'External communal areas cleaning standard',
        questionType: 'graded',
        questionOrder: 1,
      },
    ],
  },
  {
    sectionTitle: 'Waste Management',
    sectionOrder: 9,
    questions: [
      {
        questionText: 'Bulk waste / fly-tipping present?',
        questionType: 'yes_no',
        questionOrder: 1,
        extra: { 'Create Action On No': true, 'Triggers Issue Answer': 'Yes' },
      },
    ],
  },
  {
    sectionTitle: 'Health and Safety',
    sectionOrder: 10,
    questions: [
      {
        questionText: 'Immediate health and safety risks observed',
        questionType: 'yes_no',
        questionOrder: 1,
        extra: {
          'Create Action On No': true,
          'Triggers Issue Answer': 'Yes',
          'Photo Required When': 'on_yes',
        },
      },
    ],
  },
  {
    sectionTitle: 'Signage and Notice Boards',
    sectionOrder: 11,
    questions: [
      {
        questionText: 'Notices legible and appropriate',
        questionType: 'graded',
        questionOrder: 1,
      },
    ],
  },
  {
    sectionTitle: 'Fire Safety',
    sectionOrder: 12,
    questions: [
      {
        questionText: 'Are communal fire doors held open or damaged?',
        questionType: 'yes_no',
        questionOrder: 1,
        extra: { 'Create Action On No': true, 'Triggers Issue Answer': 'Yes' },
      },
    ],
  },
  {
    sectionTitle: 'Grounds Maintenance',
    sectionOrder: 13,
    questions: [
      {
        questionText: 'Grass, hedges, and planted areas maintained',
        questionType: 'graded',
        questionOrder: 1,
      },
    ],
  },
  {
    sectionTitle: 'Sign Off',
    sectionOrder: 14,
    questions: [
      {
        questionText: 'Inspector name (confirm)',
        questionType: 'text',
        questionOrder: 1,
      },
      {
        questionText: 'Inspection complete — submit',
        questionType: 'text',
        questionOrder: 2,
        extra: { 'Is Required': true },
      },
    ],
  },
]
