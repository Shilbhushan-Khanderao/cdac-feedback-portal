// Chart colours. No blue. Categorical order validated for colour-blind safety
// (adjacent CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, contrast ≥ 3:1 on white) with the dataviz validator.
// Use in this order and never cycle: a 6th series is folded into "Other".
export const CATEGORICAL = ['#1b8a4f', '#d9577f', '#a67c00', '#8e3b8a', '#e86a1c'] as const;

// Rating words, best to worst: one fixed colour per word everywhere (pie, dashboard).
export const RATING_ORDER = ['Excellent', 'Very Good', 'Good', 'Average', 'Poor'] as const;
export const RATING_COLORS: Record<(typeof RATING_ORDER)[number], string> = {
  Excellent: '#1b7a4a',
  'Very Good': '#86bf8f',
  Good: '#e3c35b',
  Average: '#e8864a',
  Poor: '#b83b2e',
};
// Mean score of a rating word, 5 = Excellent … 1 = Poor.
export const RATING_SCORE: Record<string, number> = { Excellent: 5, 'Very Good': 4, Good: 3, Average: 2, Poor: 1 };

export const INK = { primary: '#1c1917', secondary: '#57534e', muted: '#78716c', grid: '#e7e5e4' } as const;
