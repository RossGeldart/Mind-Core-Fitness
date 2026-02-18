import { describe, it, expect } from 'vitest';
import { calculateMacros } from './macroCalculations';

const BASE_MALE = {
  gender: 'male',
  age: '30',
  weight: '80',
  weightUnit: 'kg',
  height: '180',
  heightUnit: 'cm',
  dailyActivity: 'sedentary',
  trainingFrequency: 'moderate',
  goal: 'maintain',
  deficitLevel: 'moderate',
};

const BASE_FEMALE = {
  ...BASE_MALE,
  gender: 'female',
};

describe('calculateMacros — BMR', () => {
  it('calculates male BMR using Mifflin-St Jeor', () => {
    // BMR = (10 * 80) + (6.25 * 180) - (5 * 30) + 5 = 800 + 1125 - 150 + 5 = 1780
    const result = calculateMacros(BASE_MALE);
    expect(result.bmr).toBe(1780);
  });

  it('calculates female BMR using Mifflin-St Jeor', () => {
    // BMR = (10 * 80) + (6.25 * 180) - (5 * 30) - 161 = 1780 - 166 = 1614
    const result = calculateMacros(BASE_FEMALE);
    expect(result.bmr).toBe(1614);
  });
});

describe('calculateMacros — TDEE', () => {
  it('applies sedentary NEAT multiplier (1.2) + moderate exercise add-on (200)', () => {
    const result = calculateMacros(BASE_MALE);
    // NEAT = 1780 * 1.2 = 2136; TDEE = 2136 + 200 = 2336
    expect(result.neat).toBe(2136);
    expect(result.tdee).toBe(2336);
    expect(result.exerciseAdd).toBe(200);
  });

  it('applies active NEAT multiplier (1.5) + high exercise add-on (300)', () => {
    const result = calculateMacros({ ...BASE_MALE, dailyActivity: 'active', trainingFrequency: 'high' });
    // NEAT = 1780 * 1.5 = 2670; TDEE = 2670 + 300 = 2970
    expect(result.neat).toBe(2670);
    expect(result.tdee).toBe(2970);
  });
});

describe('calculateMacros — weight loss goal', () => {
  it('applies a 20% moderate deficit', () => {
    const result = calculateMacros({ ...BASE_MALE, goal: 'lose', deficitLevel: 'moderate' });
    const expected = Math.round(2336 * 0.80);
    expect(result.targetCalories).toBe(expected);
  });

  it('applies a 15% light deficit', () => {
    const result = calculateMacros({ ...BASE_MALE, goal: 'lose', deficitLevel: 'light' });
    const expected = Math.round(2336 * 0.85);
    expect(result.targetCalories).toBe(expected);
  });

  it('applies a 25% harsh deficit', () => {
    const result = calculateMacros({ ...BASE_MALE, goal: 'lose', deficitLevel: 'harsh' });
    const expected = Math.round(2336 * 0.75);
    expect(result.targetCalories).toBe(expected);
  });

  it('enforces minimum 1400 kcal for males', () => {
    // Very small person — should hit the floor
    const result = calculateMacros({ ...BASE_MALE, weight: '40', height: '140', age: '70', goal: 'lose', deficitLevel: 'harsh' });
    expect(result.targetCalories).toBeGreaterThanOrEqual(1400);
  });

  it('enforces minimum 1100 kcal for females', () => {
    const result = calculateMacros({ ...BASE_FEMALE, weight: '40', height: '140', age: '70', goal: 'lose', deficitLevel: 'harsh' });
    expect(result.targetCalories).toBeGreaterThanOrEqual(1100);
  });
});

describe('calculateMacros — muscle building goal', () => {
  it('applies a 10% calorie surplus', () => {
    const result = calculateMacros({ ...BASE_MALE, goal: 'build' });
    expect(result.targetCalories).toBe(Math.round(2336 * 1.10));
  });
});

describe('calculateMacros — unit conversions', () => {
  it('converts lbs to kg correctly', () => {
    const inKg = calculateMacros(BASE_MALE);
    const inLbs = calculateMacros({ ...BASE_MALE, weight: String(80 / 0.453592), weightUnit: 'lbs' });
    expect(inLbs.bmr).toBe(inKg.bmr);
  });

  it('converts feet/inches to cm correctly', () => {
    const inCm = calculateMacros(BASE_MALE);
    // 180cm ≈ 5ft 10.866in — use exact feet/inches that equal 180cm
    // 5ft = 152.4cm, 11.023in = 27.598cm => ~180cm
    const inFt = calculateMacros({
      ...BASE_MALE,
      heightUnit: 'ft',
      heightFeet: '5',
      heightInches: String((180 - 5 * 30.48) / 2.54),
      height: '',
    });
    expect(inFt.bmr).toBe(inCm.bmr);
  });
});

describe('calculateMacros — macro split', () => {
  it('protein calories + carb calories + fat calories roughly equal targetCalories', () => {
    const result = calculateMacros(BASE_MALE);
    const total = result.proteinCalories + result.carbCalories + result.fatCalories;
    // Allow ±5 cal rounding tolerance
    expect(Math.abs(total - result.targetCalories)).toBeLessThanOrEqual(5);
  });

  it('carbs are never negative', () => {
    const result = calculateMacros({ ...BASE_MALE, goal: 'lose', deficitLevel: 'harsh' });
    expect(result.carbs).toBeGreaterThanOrEqual(0);
  });

  it('protein is higher for weight loss (2.2g/kg) than maintenance (1.8g/kg)', () => {
    const lose = calculateMacros({ ...BASE_MALE, goal: 'lose', deficitLevel: 'moderate' });
    const maintain = calculateMacros(BASE_MALE);
    expect(lose.protein).toBeGreaterThan(maintain.protein);
  });
});
