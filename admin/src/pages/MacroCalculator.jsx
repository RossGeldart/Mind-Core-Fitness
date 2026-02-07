import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ClientTools.css';

export default function MacroCalculator() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    gender: 'male',
    age: '',
    weight: '',
    weightUnit: 'kg',
    height: '',
    heightUnit: 'cm',
    heightFeet: '',
    heightInches: '',
    activityLevel: 'moderate',
    goal: 'maintain',
    deficitLevel: 'moderate'
  });

  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setShowResults(false);
  };

  const calculateMacros = () => {
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

    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };

    const tdee = bmr * activityMultipliers[formData.activityLevel];

    let targetCalories = tdee;
    let proteinPerKg;

    switch (formData.goal) {
      case 'lose':
        const deficits = { light: 250, moderate: 500, harsh: 750 };
        targetCalories = tdee - deficits[formData.deficitLevel];
        proteinPerKg = 2.0;
        break;
      case 'build':
        targetCalories = tdee + 300;
        proteinPerKg = 2.0;
        break;
      case 'maintain':
      default:
        proteinPerKg = 1.8;
        break;
    }

    const minCalories = formData.gender === 'male' ? 1500 : 1200;
    targetCalories = Math.max(targetCalories, minCalories);

    const proteinGrams = Math.round(weightKg * proteinPerKg);
    const proteinCalories = proteinGrams * 4;
    const fatCalories = targetCalories * 0.25;
    const fatGrams = Math.round(fatCalories / 9);
    const carbCalories = targetCalories - proteinCalories - fatCalories;
    const carbGrams = Math.round(carbCalories / 4);

    setResults({
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(targetCalories),
      protein: proteinGrams,
      carbs: carbGrams,
      fats: fatGrams,
      proteinCalories: Math.round(proteinCalories),
      carbCalories: Math.round(carbCalories),
      fatCalories: Math.round(fatCalories)
    });
    setShowResults(true);
  };

  const isFormValid = () => {
    const hasWeight = formData.weight && parseFloat(formData.weight) > 0;
    const hasAge = formData.age && parseInt(formData.age) > 0;
    let hasHeight;
    if (formData.heightUnit === 'cm') {
      hasHeight = formData.height && parseFloat(formData.height) > 0;
    } else {
      hasHeight = (formData.heightFeet && parseFloat(formData.heightFeet) > 0) ||
                  (formData.heightInches && parseFloat(formData.heightInches) > 0);
    }
    return hasWeight && hasAge && hasHeight;
  };

  const getGoalLabel = () => {
    switch (formData.goal) {
      case 'lose': return 'Weight Loss';
      case 'build': return 'Muscle Building';
      default: return 'Maintenance';
    }
  };

  if (authLoading) {
    return <div className="client-loading">Loading...</div>;
  }

  if (!currentUser || !isClient || !clientData) {
    return null;
  }

  return (
    <div className="client-tools-page">
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
        </div>
      </header>

      <main className="tools-main page-transition-enter">
        <button className="back-btn" onClick={() => navigate('/client/tools')}>&larr; Back to Tools</button>

        <div className="tool-card">
          <div className="tool-header">
            <h3>Macro Calculator</h3>
            <p>Calculate your daily calorie and macro targets based on your goals.</p>
          </div>

          <div className="calculator-form">
            <div className="form-row">
              <div className="form-group">
                <label>Gender</label>
                <div className="toggle-group">
                  <button type="button" className={formData.gender === 'male' ? 'active' : ''} onClick={() => { setFormData(prev => ({ ...prev, gender: 'male' })); setShowResults(false); }}>Male</button>
                  <button type="button" className={formData.gender === 'female' ? 'active' : ''} onClick={() => { setFormData(prev => ({ ...prev, gender: 'female' })); setShowResults(false); }}>Female</button>
                </div>
              </div>
              <div className="form-group">
                <label>Age</label>
                <input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="Years" min="15" max="100" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Weight</label>
                <div className="input-with-unit">
                  <input type="number" name="weight" value={formData.weight} onChange={handleChange} placeholder={formData.weightUnit === 'kg' ? 'kg' : 'lbs'} min="30" max="300" />
                  <div className="unit-toggle">
                    <button type="button" className={formData.weightUnit === 'kg' ? 'active' : ''} onClick={() => { setFormData(prev => ({ ...prev, weightUnit: 'kg' })); setShowResults(false); }}>kg</button>
                    <button type="button" className={formData.weightUnit === 'lbs' ? 'active' : ''} onClick={() => { setFormData(prev => ({ ...prev, weightUnit: 'lbs' })); setShowResults(false); }}>lbs</button>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>Height</label>
                <div className="input-with-unit">
                  {formData.heightUnit === 'cm' ? (
                    <input type="number" name="height" value={formData.height} onChange={handleChange} placeholder="cm" min="100" max="250" />
                  ) : (
                    <div className="height-imperial">
                      <input type="number" name="heightFeet" value={formData.heightFeet} onChange={handleChange} placeholder="ft" min="4" max="7" />
                      <input type="number" name="heightInches" value={formData.heightInches} onChange={handleChange} placeholder="in" min="0" max="11" />
                    </div>
                  )}
                  <div className="unit-toggle">
                    <button type="button" className={formData.heightUnit === 'cm' ? 'active' : ''} onClick={() => { setFormData(prev => ({ ...prev, heightUnit: 'cm' })); setShowResults(false); }}>cm</button>
                    <button type="button" className={formData.heightUnit === 'ft' ? 'active' : ''} onClick={() => { setFormData(prev => ({ ...prev, heightUnit: 'ft' })); setShowResults(false); }}>ft/in</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group full-width">
              <label>Activity Level</label>
              <select name="activityLevel" value={formData.activityLevel} onChange={handleChange}>
                <option value="sedentary">Sedentary (little to no exercise)</option>
                <option value="light">Lightly Active (1-3 days/week)</option>
                <option value="moderate">Moderately Active (3-5 days/week)</option>
                <option value="active">Very Active (6-7 days/week)</option>
                <option value="veryActive">Extra Active (athlete/physical job)</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Fitness Goal</label>
              <div className="goal-options">
                <button type="button" className={`goal-btn ${formData.goal === 'lose' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, goal: 'lose' })); setShowResults(false); }}>
                  <span className="goal-icon">-</span>
                  <span>Lose Weight</span>
                </button>
                <button type="button" className={`goal-btn ${formData.goal === 'maintain' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, goal: 'maintain' })); setShowResults(false); }}>
                  <span className="goal-icon">=</span>
                  <span>Maintain</span>
                </button>
                <button type="button" className={`goal-btn ${formData.goal === 'build' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, goal: 'build' })); setShowResults(false); }}>
                  <span className="goal-icon">+</span>
                  <span>Build Muscle</span>
                </button>
              </div>
            </div>

            {formData.goal === 'lose' && (
              <div className="form-group full-width deficit-section">
                <label>Calorie Deficit Level</label>
                <div className="deficit-options">
                  <button type="button" className={`deficit-btn ${formData.deficitLevel === 'light' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'light' })); setShowResults(false); }}>
                    <span className="deficit-name">Light</span>
                    <span className="deficit-desc">-250 cal/day</span>
                    <span className="deficit-rate">~0.5 lb/week</span>
                  </button>
                  <button type="button" className={`deficit-btn ${formData.deficitLevel === 'moderate' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'moderate' })); setShowResults(false); }}>
                    <span className="deficit-name">Moderate</span>
                    <span className="deficit-desc">-500 cal/day</span>
                    <span className="deficit-rate">~1 lb/week</span>
                  </button>
                  <button type="button" className={`deficit-btn ${formData.deficitLevel === 'harsh' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'harsh' })); setShowResults(false); }}>
                    <span className="deficit-name">Aggressive</span>
                    <span className="deficit-desc">-750 cal/day</span>
                    <span className="deficit-rate">~1.5 lb/week</span>
                  </button>
                </div>
              </div>
            )}

            <button className="calculate-btn" onClick={calculateMacros} disabled={!isFormValid()}>
              Calculate Macros
            </button>
          </div>

          {showResults && results && (
            <div className="results-section">
              <div className="results-header">
                <h4>Your Daily Targets</h4>
                <span className="goal-badge">{getGoalLabel()}</span>
              </div>
              <div className="calories-display">
                <span className="calories-value">{results.targetCalories}</span>
                <span className="calories-label">calories/day</span>
              </div>
              <div className="macros-grid">
                <div className="macro-card protein">
                  <div className="macro-value">{results.protein}g</div>
                  <div className="macro-label">Protein</div>
                  <div className="macro-calories">{results.proteinCalories} cal</div>
                </div>
                <div className="macro-card carbs">
                  <div className="macro-value">{results.carbs}g</div>
                  <div className="macro-label">Carbs</div>
                  <div className="macro-calories">{results.carbCalories} cal</div>
                </div>
                <div className="macro-card fats">
                  <div className="macro-value">{results.fats}g</div>
                  <div className="macro-label">Fats</div>
                  <div className="macro-calories">{results.fatCalories} cal</div>
                </div>
              </div>
              <div className="results-info">
                <div className="info-row">
                  <span>Basal Metabolic Rate (BMR)</span>
                  <span>{results.bmr} cal</span>
                </div>
                <div className="info-row">
                  <span>Total Daily Energy Expenditure (TDEE)</span>
                  <span>{results.tdee} cal</span>
                </div>
              </div>
              <div className="results-note">
                <p>These are estimated values. Individual results may vary based on metabolism, body composition, and other factors. Consult with your trainer for personalized guidance.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
