import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function ProteinSnacks() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [currentSnack, setCurrentSnack] = useState(null);
  const [snackFilter, setSnackFilter] = useState('all');
  const [snackAnimating, setSnackAnimating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

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
      </main>
    </div>
  );
}
