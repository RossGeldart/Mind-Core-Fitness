import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './ClientTools.css';

const PROTEIN_SNACKS = [
  // No-prep (grab & go)
  { name: 'Greek Yoghurt & Honey', protein: 20, prep: 0, category: 'no-prep' },
  { name: 'Protein Bar', protein: 20, prep: 0, category: 'no-prep' },
  { name: 'Beef Jerky', protein: 15, prep: 0, category: 'no-prep' },
  { name: 'Handful of Almonds', protein: 7, prep: 0, category: 'no-prep' },
  { name: 'Boiled Eggs (x2)', protein: 12, prep: 0, category: 'no-prep' },
  { name: 'String Cheese (x2)', protein: 14, prep: 0, category: 'no-prep' },
  { name: 'Cottage Cheese Pot', protein: 14, prep: 0, category: 'no-prep' },
  { name: 'Edamame Beans', protein: 11, prep: 0, category: 'no-prep' },
  { name: 'Turkey Slices (50g)', protein: 12, prep: 0, category: 'no-prep' },
  { name: 'Roasted Chickpeas', protein: 10, prep: 0, category: 'no-prep' },
  // Quick prep (1-2 min)
  { name: 'Protein Shake & Banana', protein: 30, prep: 1, category: 'quick' },
  { name: 'Peanut Butter on Rice Cakes', protein: 14, prep: 1, category: 'quick' },
  { name: 'Greek Yoghurt & Granola', protein: 22, prep: 1, category: 'quick' },
  { name: 'Turkey & Cream Cheese Roll-Ups', protein: 18, prep: 2, category: 'quick' },
  { name: 'Cottage Cheese & Pineapple', protein: 15, prep: 1, category: 'quick' },
  { name: 'Ham & Cheese Wrap', protein: 22, prep: 2, category: 'quick' },
  { name: 'Tuna & Crackers', protein: 20, prep: 2, category: 'quick' },
  { name: 'Protein Yoghurt Bowl', protein: 25, prep: 1, category: 'quick' },
  { name: 'Hummus & Veggie Sticks', protein: 8, prep: 1, category: 'quick' },
  { name: 'Chocolate Milk (500ml)', protein: 17, prep: 1, category: 'quick' },
  { name: 'Peanut Butter & Apple Slices', protein: 10, prep: 1, category: 'quick' },
  { name: 'Overnight Oats (pre-made)', protein: 18, prep: 1, category: 'quick' },
  { name: 'Smoked Salmon on Crackers', protein: 16, prep: 2, category: 'quick' },
  { name: 'Protein Smoothie Bowl', protein: 28, prep: 2, category: 'quick' },
  { name: 'Almond Butter & Banana Toast', protein: 12, prep: 2, category: 'quick' },
  // Light cook (3-5 min)
  { name: 'Scrambled Eggs on Toast', protein: 22, prep: 4, category: 'cook' },
  { name: 'Protein Pancake Mug Cake', protein: 25, prep: 3, category: 'cook' },
  { name: 'Tuna Mayo on Toast', protein: 24, prep: 3, category: 'cook' },
  { name: 'Egg & Cheese Muffin', protein: 18, prep: 4, category: 'cook' },
  { name: 'Chicken Quesadilla', protein: 26, prep: 5, category: 'cook' },
  { name: 'Beans on Toast', protein: 16, prep: 3, category: 'cook' },
  { name: 'Omelette (2 eggs)', protein: 14, prep: 4, category: 'cook' },
  { name: 'Protein Porridge', protein: 28, prep: 4, category: 'cook' },
  { name: 'Cheese Toastie', protein: 16, prep: 3, category: 'cook' },
  { name: 'Egg Fried Rice (leftover rice)', protein: 16, prep: 5, category: 'cook' },
];

const MOTIVATION_QUOTES = [
  { text: "The only bad workout is the one that didn't happen.", author: "Unknown" },
  { text: "Your body can stand almost anything. It's your mind that you have to convince.", author: "Unknown" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Unknown" },
  { text: "Don't wish for it. Work for it.", author: "Unknown" },
  { text: "Success isn't always about greatness. It's about consistency.", author: "Dwayne Johnson" },
  { text: "The harder you work, the luckier you get.", author: "Gary Player" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "What seems impossible today will one day become your warm-up.", author: "Unknown" },
  { text: "You don't have to be extreme, just consistent.", author: "Unknown" },
  { text: "Strength does not come from the body. It comes from the will.", author: "Unknown" },
  { text: "The only way to define your limits is by going beyond them.", author: "Arthur C. Clarke" },
  { text: "Motivation gets you started. Habit keeps you going.", author: "Jim Ryun" },
  { text: "If it doesn't challenge you, it doesn't change you.", author: "Fred DeVito" },
  { text: "Progress, not perfection.", author: "Unknown" },
  { text: "The best project you'll ever work on is you.", author: "Unknown" },
  { text: "A year from now you'll wish you had started today.", author: "Karen Lamb" },
  { text: "You are one workout away from a good mood.", author: "Unknown" },
  { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { text: "The body achieves what the mind believes.", author: "Unknown" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Unknown" },
  { text: "It's not about having time. It's about making time.", author: "Unknown" },
  { text: "Sore today, strong tomorrow.", author: "Unknown" },
  { text: "Champions keep playing until they get it right.", author: "Billie Jean King" },
  { text: "Be stronger than your excuses.", author: "Unknown" },
  { text: "When you feel like quitting, think about why you started.", author: "Unknown" },
  { text: "The difference between try and triumph is a little umph.", author: "Marvin Phillips" },
  { text: "Your only limit is you.", author: "Unknown" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Making excuses burns zero calories per hour.", author: "Unknown" },
  { text: "Results happen over time, not overnight. Work hard, stay consistent, and be patient.", author: "Unknown" },
  { text: "You don't find willpower, you create it.", author: "Unknown" },
  { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
  { text: "Sweat is just fat crying.", author: "Unknown" },
  { text: "Today I will do what others won't, so tomorrow I can do what others can't.", author: "Jerry Rice" },
  { text: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "It never gets easier, you just get stronger.", author: "Unknown" },
  { text: "Suffer the pain of discipline or suffer the pain of regret.", author: "Jim Rohn" },
  { text: "Strive for progress, not perfection.", author: "Unknown" },
  { text: "Your health is an investment, not an expense.", author: "Unknown" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Good things come to those who sweat.", author: "Unknown" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "No matter how slow you go, you're still lapping everyone on the couch.", author: "Unknown" },
  { text: "Train insane or remain the same.", author: "Unknown" },
  { text: "The hardest step is the first one out the door.", author: "Unknown" },
  { text: "Work hard in silence, let your results be the noise.", author: "Frank Ocean" },
  { text: "Every champion was once a contender who refused to give up.", author: "Rocky Balboa" },
  { text: "Take care of your body. It's the only place you have to live.", author: "Jim Rohn" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "The mind is the most important muscle.", author: "Unknown" },
  { text: "You are stronger than you think.", author: "Unknown" },
  { text: "Obsessed is a word the lazy use to describe the dedicated.", author: "Unknown" },
  { text: "The only weight you need to lose is the weight of your doubts.", author: "Unknown" },
];

export default function ClientTools() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Calculator state
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

  // Snack generator state
  const [currentSnack, setCurrentSnack] = useState(null);
  const [snackFilter, setSnackFilter] = useState('all');
  const [snackAnimating, setSnackAnimating] = useState(false);

  // Quote generator state
  const [dailyQuote, setDailyQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteAnimating, setQuoteAnimating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  // Load daily quote from Firestore on mount
  useEffect(() => {
    if (clientData) {
      loadDailyQuote();
    }
  }, [clientData]);

  const loadDailyQuote = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const quoteRef = doc(db, 'clients', clientData.id);
      const clientDoc = await getDoc(quoteRef);
      if (clientDoc.exists()) {
        const data = clientDoc.data();
        if (data.dailyQuote && data.dailyQuote.date === today) {
          setDailyQuote(data.dailyQuote);
        }
      }
    } catch (error) {
      console.error('Error loading daily quote:', error);
    }
    setQuoteLoading(false);
  };

  const generateRandomSnack = () => {
    const filtered = snackFilter === 'all'
      ? PROTEIN_SNACKS
      : PROTEIN_SNACKS.filter(s => s.category === snackFilter);

    setSnackAnimating(true);
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * filtered.length);
      setCurrentSnack(filtered[randomIndex]);
      setSnackAnimating(false);
    }, 300);
  };

  const generateDailyQuote = async () => {
    if (dailyQuote) return; // Already picked today

    setQuoteAnimating(true);
    const randomIndex = Math.floor(Math.random() * MOTIVATION_QUOTES.length);
    const selectedQuote = MOTIVATION_QUOTES[randomIndex];
    const today = new Date().toISOString().split('T')[0];

    const quoteData = {
      text: selectedQuote.text,
      author: selectedQuote.author,
      date: today
    };

    try {
      await setDoc(doc(db, 'clients', clientData.id), {
        dailyQuote: quoteData
      }, { merge: true });

      setTimeout(() => {
        setDailyQuote(quoteData);
        setQuoteAnimating(false);
      }, 300);
    } catch (error) {
      console.error('Error saving daily quote:', error);
      setQuoteAnimating(false);
    }
  };

  const getSnackPrepLabel = (prep) => {
    if (prep === 0) return 'No prep';
    return `${prep} min`;
  };

  const getSnackCategoryLabel = (category) => {
    switch (category) {
      case 'no-prep': return 'Grab & Go';
      case 'quick': return 'Quick Prep';
      case 'cook': return 'Light Cook';
      default: return category;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setShowResults(false);
  };

  const calculateMacros = () => {
    // Convert weight to kg
    let weightKg = parseFloat(formData.weight);
    if (formData.weightUnit === 'lbs') {
      weightKg = weightKg * 0.453592;
    }

    // Convert height to cm
    let heightCm;
    if (formData.heightUnit === 'cm') {
      heightCm = parseFloat(formData.height);
    } else {
      const feet = parseFloat(formData.heightFeet) || 0;
      const inches = parseFloat(formData.heightInches) || 0;
      heightCm = (feet * 30.48) + (inches * 2.54);
    }

    const age = parseInt(formData.age);

    // Mifflin-St Jeor Equation for BMR
    let bmr;
    if (formData.gender === 'male') {
      bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
    } else {
      bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
    }

    // Activity multipliers
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      veryActive: 1.9
    };

    const tdee = bmr * activityMultipliers[formData.activityLevel];

    // Adjust calories based on goal
    let targetCalories = tdee;
    let proteinPerKg;

    switch (formData.goal) {
      case 'lose':
        // Deficit levels
        const deficits = {
          light: 250,
          moderate: 500,
          harsh: 750
        };
        targetCalories = tdee - deficits[formData.deficitLevel];
        proteinPerKg = 2.0; // Higher protein to preserve muscle during deficit
        break;
      case 'build':
        targetCalories = tdee + 300; // Moderate surplus
        proteinPerKg = 2.0;
        break;
      case 'maintain':
      default:
        proteinPerKg = 1.8;
        break;
    }

    // Ensure minimum calories
    const minCalories = formData.gender === 'male' ? 1500 : 1200;
    targetCalories = Math.max(targetCalories, minCalories);

    // Calculate macros
    const proteinGrams = Math.round(weightKg * proteinPerKg);
    const proteinCalories = proteinGrams * 4;

    // Fats: 25% of calories
    const fatCalories = targetCalories * 0.25;
    const fatGrams = Math.round(fatCalories / 9);

    // Carbs: remaining calories
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
        <button className="back-btn" onClick={() => navigate('/client')}>&larr; Back</button>

        <div className="tools-intro">
          <h2>Tools</h2>
          <p>Use these tools to help plan your nutrition and track your progress.</p>
        </div>

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
                  <button
                    type="button"
                    className={formData.gender === 'male' ? 'active' : ''}
                    onClick={() => { setFormData(prev => ({ ...prev, gender: 'male' })); setShowResults(false); }}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    className={formData.gender === 'female' ? 'active' : ''}
                    onClick={() => { setFormData(prev => ({ ...prev, gender: 'female' })); setShowResults(false); }}
                  >
                    Female
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Age</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  placeholder="Years"
                  min="15"
                  max="100"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Weight</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    name="weight"
                    value={formData.weight}
                    onChange={handleChange}
                    placeholder={formData.weightUnit === 'kg' ? 'kg' : 'lbs'}
                    min="30"
                    max="300"
                  />
                  <div className="unit-toggle">
                    <button
                      type="button"
                      className={formData.weightUnit === 'kg' ? 'active' : ''}
                      onClick={() => { setFormData(prev => ({ ...prev, weightUnit: 'kg' })); setShowResults(false); }}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      className={formData.weightUnit === 'lbs' ? 'active' : ''}
                      onClick={() => { setFormData(prev => ({ ...prev, weightUnit: 'lbs' })); setShowResults(false); }}
                    >
                      lbs
                    </button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Height</label>
                <div className="input-with-unit">
                  {formData.heightUnit === 'cm' ? (
                    <input
                      type="number"
                      name="height"
                      value={formData.height}
                      onChange={handleChange}
                      placeholder="cm"
                      min="100"
                      max="250"
                    />
                  ) : (
                    <div className="height-imperial">
                      <input
                        type="number"
                        name="heightFeet"
                        value={formData.heightFeet}
                        onChange={handleChange}
                        placeholder="ft"
                        min="4"
                        max="7"
                      />
                      <input
                        type="number"
                        name="heightInches"
                        value={formData.heightInches}
                        onChange={handleChange}
                        placeholder="in"
                        min="0"
                        max="11"
                      />
                    </div>
                  )}
                  <div className="unit-toggle">
                    <button
                      type="button"
                      className={formData.heightUnit === 'cm' ? 'active' : ''}
                      onClick={() => { setFormData(prev => ({ ...prev, heightUnit: 'cm' })); setShowResults(false); }}
                    >
                      cm
                    </button>
                    <button
                      type="button"
                      className={formData.heightUnit === 'ft' ? 'active' : ''}
                      onClick={() => { setFormData(prev => ({ ...prev, heightUnit: 'ft' })); setShowResults(false); }}
                    >
                      ft/in
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group full-width">
              <label>Activity Level</label>
              <select
                name="activityLevel"
                value={formData.activityLevel}
                onChange={handleChange}
              >
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
                <button
                  type="button"
                  className={`goal-btn ${formData.goal === 'lose' ? 'active' : ''}`}
                  onClick={() => { setFormData(prev => ({ ...prev, goal: 'lose' })); setShowResults(false); }}
                >
                  <span className="goal-icon">-</span>
                  <span>Lose Weight</span>
                </button>
                <button
                  type="button"
                  className={`goal-btn ${formData.goal === 'maintain' ? 'active' : ''}`}
                  onClick={() => { setFormData(prev => ({ ...prev, goal: 'maintain' })); setShowResults(false); }}
                >
                  <span className="goal-icon">=</span>
                  <span>Maintain</span>
                </button>
                <button
                  type="button"
                  className={`goal-btn ${formData.goal === 'build' ? 'active' : ''}`}
                  onClick={() => { setFormData(prev => ({ ...prev, goal: 'build' })); setShowResults(false); }}
                >
                  <span className="goal-icon">+</span>
                  <span>Build Muscle</span>
                </button>
              </div>
            </div>

            {formData.goal === 'lose' && (
              <div className="form-group full-width deficit-section">
                <label>Calorie Deficit Level</label>
                <div className="deficit-options">
                  <button
                    type="button"
                    className={`deficit-btn ${formData.deficitLevel === 'light' ? 'active' : ''}`}
                    onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'light' })); setShowResults(false); }}
                  >
                    <span className="deficit-name">Light</span>
                    <span className="deficit-desc">-250 cal/day</span>
                    <span className="deficit-rate">~0.5 lb/week</span>
                  </button>
                  <button
                    type="button"
                    className={`deficit-btn ${formData.deficitLevel === 'moderate' ? 'active' : ''}`}
                    onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'moderate' })); setShowResults(false); }}
                  >
                    <span className="deficit-name">Moderate</span>
                    <span className="deficit-desc">-500 cal/day</span>
                    <span className="deficit-rate">~1 lb/week</span>
                  </button>
                  <button
                    type="button"
                    className={`deficit-btn ${formData.deficitLevel === 'harsh' ? 'active' : ''}`}
                    onClick={() => { setFormData(prev => ({ ...prev, deficitLevel: 'harsh' })); setShowResults(false); }}
                  >
                    <span className="deficit-name">Aggressive</span>
                    <span className="deficit-desc">-750 cal/day</span>
                    <span className="deficit-rate">~1.5 lb/week</span>
                  </button>
                </div>
              </div>
            )}

            <button
              className="calculate-btn"
              onClick={calculateMacros}
              disabled={!isFormValid()}
            >
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

        {/* Protein Snack Generator */}
        <div className="tool-card" style={{ marginTop: '20px' }}>
          <div className="tool-header">
            <h3>Protein Snack Generator</h3>
            <p>Quick, easy high-protein snack ideas to fuel your training.</p>
          </div>

          <div className="snack-generator">
            <div className="snack-filters">
              {[
                { value: 'all', label: 'All' },
                { value: 'no-prep', label: 'Grab & Go' },
                { value: 'quick', label: 'Quick Prep' },
                { value: 'cook', label: 'Light Cook' }
              ].map(filter => (
                <button
                  key={filter.value}
                  className={`snack-filter-btn ${snackFilter === filter.value ? 'active' : ''}`}
                  onClick={() => { setSnackFilter(filter.value); setCurrentSnack(null); }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {currentSnack && !snackAnimating && (
              <div className="snack-result">
                <div className="snack-name">{currentSnack.name}</div>
                <div className="snack-details">
                  <div className="snack-detail">
                    <span className="snack-detail-value">{currentSnack.protein}g</span>
                    <span className="snack-detail-label">Protein</span>
                  </div>
                  <div className="snack-detail">
                    <span className="snack-detail-value">{getSnackPrepLabel(currentSnack.prep)}</span>
                    <span className="snack-detail-label">Prep Time</span>
                  </div>
                  <div className="snack-detail">
                    <span className="snack-detail-value">{getSnackCategoryLabel(currentSnack.category)}</span>
                    <span className="snack-detail-label">Type</span>
                  </div>
                </div>
              </div>
            )}

            {snackAnimating && (
              <div className="snack-result shuffling">
                <div className="snack-shuffle-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
                  </svg>
                </div>
              </div>
            )}

            <button className="snack-generate-btn" onClick={generateRandomSnack}>
              {currentSnack ? 'Give Me Another' : 'Give Me a Snack'}
            </button>
          </div>
        </div>

        {/* Daily Motivation Quote Generator */}
        <div className="tool-card" style={{ marginTop: '20px' }}>
          <div className="tool-header">
            <h3>Daily Motivation</h3>
            <p>Get your daily dose of inspiration to keep you on track.</p>
          </div>

          <div className="quote-generator">
            {quoteLoading ? (
              <div className="quote-loading">Loading...</div>
            ) : dailyQuote ? (
              <div className="quote-result">
                <div className="quote-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
                  </svg>
                </div>
                <div className="quote-text">{dailyQuote.text}</div>
                <div className="quote-author">— {dailyQuote.author}</div>
                <div className="quote-date-note">Your inspiration for today</div>
              </div>
            ) : quoteAnimating ? (
              <div className="quote-result shuffling">
                <div className="quote-shuffle-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
              </div>
            ) : (
              <div className="quote-empty">
                <div className="quote-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  </svg>
                </div>
                <p>Ready for today's inspiration?</p>
              </div>
            )}

            {!dailyQuote && !quoteLoading && (
              <button className="quote-generate-btn" onClick={generateDailyQuote} disabled={quoteAnimating}>
                Get Inspired
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
