// Shared types and utilities for SignalLoop

// ============================================================================
// SCALE CONFIGURATIONS
// ============================================================================

export const SCALE_CONFIGS = {
  LIKERT_5: {
    type: 'LIKERT_5',
    min: 1,
    max: 5,
    labels: {
      1: 'Strongly Disagree',
      2: 'Disagree',
      3: 'Neutral',
      4: 'Agree',
      5: 'Strongly Agree'
    }
  },
  LIKERT_7: {
    type: 'LIKERT_7',
    min: 1,
    max: 7,
    labels: {
      1: 'Strongly Disagree',
      2: 'Disagree',
      3: 'Somewhat Disagree',
      4: 'Neutral',
      5: 'Somewhat Agree',
      6: 'Agree',
      7: 'Strongly Agree'
    }
  },
  YES_NO: {
    type: 'YES_NO',
    options: ['Yes', 'No']
  },
  EMOJI_5: {
    type: 'EMOJI_5',
    options: ['😞', '🙁', '😐', '🙂', '😊'],
    labels: {
      0: 'Very Unhappy',
      1: 'Unhappy',
      2: 'Neutral',
      3: 'Happy',
      4: 'Very Happy'
    }
  },
  SCALE_0_10: {
    type: 'SCALE_0_10',
    min: 0,
    max: 10
  }
} as const;

// ============================================================================
// SAMPLE ITEMS
// ============================================================================

export const SAMPLE_ENGAGEMENT_ITEMS = [
  {
    text: 'I would recommend this organization as a great place to work',
    category: 'engagement',
    scaleType: 'LIKERT_5',
    tags: ['eNPS', 'engagement']
  },
  {
    text: 'I have the resources and support I need to do my job well',
    category: 'resources',
    scaleType: 'LIKERT_5',
    tags: ['resources', 'support']
  },
  {
    text: 'I feel valued for my contributions',
    category: 'recognition',
    scaleType: 'LIKERT_5',
    tags: ['recognition', 'engagement']
  },
  {
    text: 'I have opportunities to learn and grow',
    category: 'growth',
    scaleType: 'LIKERT_5',
    tags: ['development', 'growth']
  },
  {
    text: 'My manager supports my professional development',
    category: 'management',
    scaleType: 'LIKERT_5',
    tags: ['management', 'development']
  },
  {
    text: 'I feel connected to my team',
    category: 'connection',
    scaleType: 'LIKERT_5',
    tags: ['team', 'connection']
  },
  {
    text: 'The workload is manageable',
    category: 'wellbeing',
    scaleType: 'LIKERT_5',
    tags: ['workload', 'wellbeing']
  },
  {
    text: 'How are you feeling today?',
    category: 'wellbeing',
    scaleType: 'EMOJI_5',
    tags: ['mood', 'wellbeing']
  }
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate a response value against a scale type
 */
export function validateResponseValue(
  value: any,
  scaleType: string,
  scaleConfig: any
): boolean {
  switch (scaleType) {
    case 'LIKERT_5':
      return typeof value === 'number' && value >= 1 && value <= 5;
    case 'LIKERT_7':
      return typeof value === 'number' && value >= 1 && value <= 7;
    case 'SCALE_0_10':
      return typeof value === 'number' && value >= 0 && value <= 10;
    case 'YES_NO':
      return value === 'Yes' || value === 'No';
    case 'EMOJI_5':
      return typeof value === 'number' && value >= 0 && value <= 4;
    case 'TEXT':
      return typeof value === 'string';
    default:
      return false;
  }
}

/**
 * Format a response value for display
 */
export function formatResponseValue(
  value: any,
  scaleType: string,
  scaleConfig: any
): string {
  switch (scaleType) {
    case 'LIKERT_5':
    case 'LIKERT_7':
      return scaleConfig.labels?.[value] || value.toString();
    case 'EMOJI_5':
      return scaleConfig.options?.[value] || value.toString();
    case 'YES_NO':
      return value;
    case 'SCALE_0_10':
      return value.toString();
    case 'TEXT':
      return value;
    default:
      return value.toString();
  }
}

/**
 * Calculate favorable percentage
 */
export function calculateFavorablePercentage(
  values: number[],
  scaleType: string
): number {
  if (values.length === 0) return 0;

  let favorableCount = 0;

  switch (scaleType) {
    case 'LIKERT_5':
      favorableCount = values.filter(v => v >= 4).length;
      break;
    case 'LIKERT_7':
      favorableCount = values.filter(v => v >= 6).length;
      break;
    case 'SCALE_0_10':
      favorableCount = values.filter(v => v >= 8).length;
      break;
    case 'EMOJI_5':
      favorableCount = values.filter(v => v >= 3).length;
      break;
    default:
      return 0;
  }

  return Math.round((favorableCount / values.length) * 100);
}
