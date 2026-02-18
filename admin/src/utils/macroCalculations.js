const NEAT_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.3,
  moderate: 1.4,
  active: 1.5,
};

const EXERCISE_ADD_ONS = {
  low: 100,
  moderate: 200,
  high: 300,
  daily: 400,
};

const DEFICIT_PCTS = {
  light: 0.15,
  moderate: 0.20,
  harsh: 0.25,
};

/**
 * Calculate macro targets from user inputs.
 * @param {Object} formData
 * @param {string} formData.gender         'male' | 'female'
 * @param {number|string} formData.age
 * @param {number|string} formData.weight
 * @param {string} formData.weightUnit     'kg' | 'lbs'
 * @param {string} formData.heightUnit     'cm' | 'ft'
 * @param {number|string} [formData.height]       cm value (when heightUnit === 'cm')
 * @param {number|string} [formData.heightFeet]   feet (when heightUnit === 'ft')
 * @param {number|string} [formData.heightInches] inches (when heightUnit === 'ft')
 * @param {string} formData.dailyActivity  'sedentary'|'light'|'moderate'|'active'
 * @param {string} formData.trainingFrequency 'low'|'moderate'|'high'|'daily'
 * @param {string} formData.goal           'lose'|'maintain'|'build'
 * @param {string} [formData.deficitLevel] 'light'|'moderate'|'harsh' (only for 'lose')
 * @returns {Object} macro results
 */
export function calculateMacros(formData) {
  let weightKg = parseFloat(formData.weight);
  if (formData.weightUnit === 'lbs') {
    weightKg = weightKg * 0.453592;
  }

  let heightCm;
  if (formData.heightUnit === 'cm') {
    heightCm = parseFloat(formData.height);
  } else {
    const feet = parseFloat(formData.heightFeet) || 0;
    const inches = parseFloat(formData.heightInches) || 0;
    heightCm = (feet * 30.48) + (inches * 2.54);
  }

  const age = parseInt(formData.age);

  let bmr;
  if (formData.gender === 'male') {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  } else {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  }

  const neat = bmr * NEAT_MULTIPLIERS[formData.dailyActivity];
  const tdee = Math.round(neat + EXERCISE_ADD_ONS[formData.trainingFrequency]);

  let targetCalories = tdee;
  let proteinPerKg;
  let fatPct;

  switch (formData.goal) {
    case 'lose':
      targetCalories = tdee * (1 - DEFICIT_PCTS[formData.deficitLevel]);
      proteinPerKg = 2.2;
      fatPct = 0.30;
      break;
    case 'build':
      targetCalories = tdee * 1.10;
      proteinPerKg = 2.0;
      fatPct = 0.22;
      break;
    case 'maintain':
    default:
      proteinPerKg = 1.8;
      fatPct = 0.25;
      break;
  }

  const minCalories = formData.gender === 'male' ? 1400 : 1100;
  targetCalories = Math.max(targetCalories, minCalories);

  const proteinGrams = Math.round(weightKg * proteinPerKg);
  const proteinCalories = proteinGrams * 4;
  const fatCalories = targetCalories * fatPct;
  const fatGrams = Math.round(fatCalories / 9);
  const carbCalories = targetCalories - proteinCalories - fatCalories;
  const carbGrams = Math.max(0, Math.round(carbCalories / 4));

  return {
    bmr: Math.round(bmr),
    neat: Math.round(neat),
    exerciseAdd: EXERCISE_ADD_ONS[formData.trainingFrequency],
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    protein: proteinGrams,
    carbs: carbGrams,
    fats: fatGrams,
    proteinCalories: Math.round(proteinCalories),
    carbCalories: Math.round(carbCalories),
    fatCalories: Math.round(fatCalories),
  };
}
