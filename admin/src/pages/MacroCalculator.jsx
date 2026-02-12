import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ClientTools.css';
import './ClientDashboard.css';

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
    dailyActivity: 'sedentary',
    trainingFrequency: 'moderate',
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

    // Step 1: NEAT — daily lifestyle activity (outside of training)
    const neatMultipliers = {
      sedentary: 1.2,    // desk job, drive to work, <5k steps
      light: 1.3,        // office job + some walking, 5-8k steps
      moderate: 1.4,     // on feet often, retail/teaching, 8-12k steps
      active: 1.5        // physical job, 12k+ steps
    };

    const neat = bmr * neatMultipliers[formData.dailyActivity];

    // Step 2: Exercise add-on — average daily calories from training sessions
    const exerciseAddOns = {
      low: 100,           // 1-2 sessions/week
      moderate: 200,      // 3-4 sessions/week
      high: 300,          // 5-6 sessions/week
      daily: 400          // 7+ sessions/week
    };

    const tdee = Math.round(neat + exerciseAddOns[formData.trainingFrequency]);

    let targetCalories = tdee;
    let proteinPerKg;
    let fatPct;

    switch (formData.goal) {
      case 'lose':
        // Percentage-based deficits scale with body size
        const deficitPcts = { light: 0.15, moderate: 0.20, harsh: 0.25 };
        targetCalories = tdee * (1 - deficitPcts[formData.deficitLevel]);
        proteinPerKg = 2.2;
        fatPct = 0.30;
        break;
      case 'build':
        targetCalories = tdee * 1.10; // 10% surplus
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

    setResults({
      bmr: Math.round(bmr),
      neat: Math.round(neat),
      exerciseAdd: exerciseAddOns[formData.trainingFrequency],
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
          <button className="header-back-btn" onClick={() => navigate('/client/tools')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
        </div>
      </header>

      <main className="tools-main page-transition-enter">
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
              <label>Daily Activity (outside of training)</label>
              <select name="dailyActivity" value={formData.dailyActivity} onChange={handleChange}>
                <option value="sedentary">Sedentary — desk job, drive to work, under 5k steps</option>
                <option value="light">Lightly Active — office + some walking, 5-8k steps</option>
                <option value="moderate">Moderately Active — on feet often, 8-12k steps</option>
                <option value="active">Very Active — physical job, 12k+ steps</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Training Sessions per Week</label>
              <select name="trainingFrequency" value={formData.trainingFrequency} onChange={handleChange}>
                <option value="low">1-2 sessions</option>
                <option value="moderate">3-4 sessions</option>
                <option value="high">5-6 sessions</option>
                <option value="daily">7+ sessions</option>
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
                    <span className="deficit-name">Mild</span>
                    <span className="deficit-desc">15% below TDEE</span>
                    <span className="deficit-rate">Steady, sustainable</span>
                  </button>
                  <button type="button" className={`deficit-btn ${formData.deficitLevel === 'moderate' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'moderate' })); setShowResults(false); }}>
                    <span className="deficit-name">Moderate</span>
                    <span className="deficit-desc">20% below TDEE</span>
                    <span className="deficit-rate">Recommended</span>
                  </button>
                  <button type="button" className={`deficit-btn ${formData.deficitLevel === 'harsh' ? 'active' : ''}`} onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'harsh' })); setShowResults(false); }}>
                    <span className="deficit-name">Aggressive</span>
                    <span className="deficit-desc">25% below TDEE</span>
                    <span className="deficit-rate">Fast but tough</span>
                  </button>
                </div>
              </div>
            )}

            <button className="calculate-btn" onClick={calculateMacros} disabled={!isFormValid()}>
              Calculate Macros
            </button>
          </div>

          {showResults && results && (() => {
            const totalCal = results.proteinCalories + results.carbCalories + results.fatCalories;
            const proteinPct = Math.round((results.proteinCalories / totalCal) * 100);
            const carbsPct = Math.round((results.carbCalories / totalCal) * 100);
            const fatsPct = 100 - proteinPct - carbsPct;
            return (
            <div className="results-section">
              <div className="results-header">
                <h4>Your Daily Targets</h4>
                <span className="goal-badge">{getGoalLabel()}</span>
              </div>
              <div className="calories-display">
                <span className="calories-value">{results.targetCalories}</span>
                <span className="calories-label">calories/day</span>
              </div>

              <div className="macro-percentage-bar">
                <div className="macro-bar-track">
                  <div className="macro-bar-segment protein" style={{ width: `${proteinPct}%` }}>
                    {proteinPct >= 12 && <span>{proteinPct}%</span>}
                  </div>
                  <div className="macro-bar-segment carbs" style={{ width: `${carbsPct}%` }}>
                    {carbsPct >= 12 && <span>{carbsPct}%</span>}
                  </div>
                  <div className="macro-bar-segment fats" style={{ width: `${fatsPct}%` }}>
                    {fatsPct >= 12 && <span>{fatsPct}%</span>}
                  </div>
                </div>
                <div className="macro-bar-legend">
                  <div className="legend-item"><span className="legend-dot protein"></span>Protein {proteinPct}%</div>
                  <div className="legend-item"><span className="legend-dot carbs"></span>Carbs {carbsPct}%</div>
                  <div className="legend-item"><span className="legend-dot fats"></span>Fats {fatsPct}%</div>
                </div>
              </div>

              <div className="macros-grid">
                <div className="macro-card protein" style={{ animationDelay: '0.1s' }}>
                  <div className="macro-value">{results.protein}g</div>
                  <div className="macro-label">Protein</div>
                  <div className="macro-calories">{results.proteinCalories} cal</div>
                </div>
                <div className="macro-card carbs" style={{ animationDelay: '0.2s' }}>
                  <div className="macro-value">{results.carbs}g</div>
                  <div className="macro-label">Carbs</div>
                  <div className="macro-calories">{results.carbCalories} cal</div>
                </div>
                <div className="macro-card fats" style={{ animationDelay: '0.3s' }}>
                  <div className="macro-value">{results.fats}g</div>
                  <div className="macro-label">Fats</div>
                  <div className="macro-calories">{results.fatCalories} cal</div>
                </div>
              </div>
              <div className="results-info">
                <div className="info-row">
                  <span>BMR (your body at rest)</span>
                  <span className="info-value">{results.bmr} cal</span>
                </div>
                <div className="info-row">
                  <span>+ Daily activity (NEAT)</span>
                  <span className="info-value">{results.neat} cal</span>
                </div>
                <div className="info-row">
                  <span>+ Training sessions</span>
                  <span className="info-value">+{results.exerciseAdd} cal</span>
                </div>
                <div className="info-row" style={{ fontWeight: 600 }}>
                  <span>TDEE (total burn)</span>
                  <span className="info-value">{results.tdee} cal</span>
                </div>
              </div>
              <div className="results-note">
                <p>These are estimated values. Individual results may vary based on metabolism, body composition, and other factors. Consult with your trainer for personalized guidance.</p>
              </div>
            </div>
            );
          })()}
        </div>
      </main>

      {/* Bottom Tab Nav */}
      <nav className="block-bottom-nav">
        <button className="block-nav-tab" onClick={() => navigate('/client')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/forms')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Forms</span>
        </button>
        <button className="block-nav-tab active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span>Tools</span>
        </button>
        <button className="block-nav-tab" onClick={() => navigate('/client/personal-bests')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
          <span>PBs</span>
        </button>
        {clientData?.circuitAccess && (
          <button className="block-nav-tab" onClick={() => navigate('/client/circuit')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Circuit</span>
          </button>
        )}
      </nav>
    </div>
  );
}
