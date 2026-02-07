import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ClientTools.css';

const PROTEIN_SNACKS = [
  // No-prep (grab & go)
  { name: 'Greek Yoghurt & Honey', protein: 20, prep: 0, category: 'no-prep',
    instructions: 'Grab a pot of Greek yoghurt, drizzle with honey. Done. Go for full-fat or 0% depending on your macros.' },
  { name: 'Protein Bar', protein: 20, prep: 0, category: 'no-prep',
    instructions: 'Unwrap and eat. Keep one in your bag for emergencies. Look for bars with 20g+ protein and under 5g sugar.' },
  { name: 'Beef Jerky', protein: 15, prep: 0, category: 'no-prep',
    instructions: 'Open the pack and snack. Great for on the go. Check the label — some brands are loaded with sugar.' },
  { name: 'Handful of Almonds', protein: 7, prep: 0, category: 'no-prep',
    instructions: 'Grab about 30g (roughly 23 almonds). Good fats and protein. Keep a bag at your desk or in your car.' },
  { name: 'Boiled Eggs (x2)', protein: 12, prep: 0, category: 'no-prep',
    instructions: 'Batch boil at the start of the week — 10 mins in boiling water, cool in ice water, peel and store in the fridge. Grab 2 when you need them.' },
  { name: 'String Cheese (x2)', protein: 14, prep: 0, category: 'no-prep',
    instructions: 'Peel and eat. Keep a few in the fridge for quick grabs. Pair with some fruit if you want extra carbs.' },
  { name: 'Cottage Cheese Pot', protein: 14, prep: 0, category: 'no-prep',
    instructions: 'Eat straight from the pot. Add a pinch of salt and pepper, or keep it sweet with a drizzle of honey.' },
  { name: 'Edamame Beans', protein: 11, prep: 0, category: 'no-prep',
    instructions: 'Buy pre-cooked and shelled from the supermarket. Sprinkle with sea salt or chilli flakes. Eat cold or warm in the microwave for 1 min.' },
  { name: 'Turkey Slices (50g)', protein: 12, prep: 0, category: 'no-prep',
    instructions: 'Straight from the pack. Roll up a few slices on their own or wrap around some cheese for extra protein.' },
  { name: 'Roasted Chickpeas', protein: 10, prep: 0, category: 'no-prep',
    instructions: 'Buy a bag of roasted chickpeas or make a batch: drain tinned chickpeas, toss in oil and spices, roast at 200°C for 25 mins. Store in a jar.' },
  // Quick prep (1-2 min)
  { name: 'Protein Shake & Banana', protein: 30, prep: 1, category: 'quick',
    instructions: 'Add one scoop of protein powder to 300ml water or milk in a shaker. Shake for 10 seconds. Eat a banana on the side.' },
  { name: 'Peanut Butter on Rice Cakes', protein: 14, prep: 1, category: 'quick',
    instructions: 'Spread 1-2 tablespoons of peanut butter across 2 rice cakes. Top with sliced banana or a drizzle of honey if you want.' },
  { name: 'Greek Yoghurt & Granola', protein: 22, prep: 1, category: 'quick',
    instructions: 'Scoop Greek yoghurt into a bowl. Top with a handful of granola and some berries. Use high-protein granola if you can find it.' },
  { name: 'Turkey & Cream Cheese Roll-Ups', protein: 18, prep: 2, category: 'quick',
    instructions: 'Lay out 3-4 turkey slices. Spread a thin layer of cream cheese on each. Roll them up. Add cucumber or spinach inside for crunch.' },
  { name: 'Cottage Cheese & Pineapple', protein: 15, prep: 1, category: 'quick',
    instructions: 'Scoop cottage cheese into a bowl, top with tinned or fresh pineapple chunks. The sweet and savoury combo works surprisingly well.' },
  { name: 'Ham & Cheese Wrap', protein: 22, prep: 2, category: 'quick',
    instructions: 'Lay a tortilla flat. Add 2-3 ham slices and a slice of cheese. Add lettuce or spinach if you have it. Roll up tight and eat.' },
  { name: 'Tuna & Crackers', protein: 20, prep: 2, category: 'quick',
    instructions: 'Drain a small tin of tuna, mix with a squeeze of lemon and black pepper. Spoon onto 4-5 crackers. Add hot sauce if you like it.' },
  { name: 'Protein Yoghurt Bowl', protein: 25, prep: 1, category: 'quick',
    instructions: 'Mix a scoop of protein powder into Greek yoghurt until smooth. Top with berries, nuts, or a drizzle of honey.' },
  { name: 'Hummus & Veggie Sticks', protein: 8, prep: 1, category: 'quick',
    instructions: 'Grab a pot of hummus and chop up carrots, cucumber, and peppers into sticks. Dip and eat. Simple.' },
  { name: 'Chocolate Milk (500ml)', protein: 17, prep: 1, category: 'quick',
    instructions: 'Pour 500ml milk, stir in 2 tablespoons of chocolate protein powder or cocoa. Great post-workout — the carbs help recovery.' },
  { name: 'Peanut Butter & Apple Slices', protein: 10, prep: 1, category: 'quick',
    instructions: 'Slice an apple into wedges. Dip into 1-2 tablespoons of peanut butter. Sweet, crunchy, and filling.' },
  { name: 'Overnight Oats (pre-made)', protein: 18, prep: 1, category: 'quick',
    instructions: 'Prep the night before: mix 50g oats, 1 scoop protein powder, 150ml milk, and a handful of berries in a jar. Refrigerate overnight. Grab and eat cold.' },
  { name: 'Smoked Salmon on Crackers', protein: 16, prep: 2, category: 'quick',
    instructions: 'Lay out 4-5 crackers. Top each with a slice of smoked salmon and a small squeeze of lemon. Add cream cheese if you want extra.' },
  { name: 'Protein Smoothie Bowl', protein: 28, prep: 2, category: 'quick',
    instructions: 'Blend 1 scoop protein powder, 1 frozen banana, and a splash of milk until thick. Pour into a bowl. Top with granola, berries, and seeds.' },
  { name: 'Almond Butter & Banana Toast', protein: 12, prep: 2, category: 'quick',
    instructions: 'Toast a slice of wholemeal bread. Spread with almond butter. Slice half a banana on top. Sprinkle with cinnamon.' },
  // Light cook (3-5 min)
  { name: 'Scrambled Eggs on Toast', protein: 22, prep: 4, category: 'cook',
    instructions: 'Crack 3 eggs into a pan on medium-low heat. Stir continuously with a spatula until just set — keep them soft. Season with salt and pepper, serve on wholemeal toast.' },
  { name: 'Protein Pancake Mug Cake', protein: 25, prep: 3, category: 'cook',
    instructions: 'Mix 1 scoop protein powder, 1 egg, and 2 tablespoons of oats in a mug. Microwave for 90 seconds. Top with peanut butter or berries.' },
  { name: 'Tuna Mayo on Toast', protein: 24, prep: 3, category: 'cook',
    instructions: 'Drain a tin of tuna, mix with 1 tablespoon of light mayo, salt, pepper, and a squeeze of lemon. Toast 2 slices of bread. Pile the tuna on top.' },
  { name: 'Egg & Cheese Muffin', protein: 18, prep: 4, category: 'cook',
    instructions: 'Fry or microwave an egg. Toast an English muffin. Layer the egg with a slice of cheese and optionally a slice of ham. Press together.' },
  { name: 'Chicken Quesadilla', protein: 26, prep: 5, category: 'cook',
    instructions: 'Use leftover chicken or pre-cooked slices. Lay a tortilla in a dry pan on medium heat. Add chicken and grated cheese on one half. Fold over, cook 2 mins each side until golden and melted.' },
  { name: 'Beans on Toast', protein: 16, prep: 3, category: 'cook',
    instructions: 'Heat a tin of baked beans in the microwave for 2 mins, stirring halfway. Toast 2 slices of wholemeal bread. Pour beans on top. Add grated cheese for extra protein.' },
  { name: 'Omelette (2 eggs)', protein: 14, prep: 4, category: 'cook',
    instructions: 'Beat 2 eggs with salt and pepper. Pour into a hot, lightly oiled pan. Swirl to cover the base. Add fillings (cheese, ham, peppers) when the edges set. Fold in half and serve.' },
  { name: 'Protein Porridge', protein: 28, prep: 4, category: 'cook',
    instructions: 'Cook 50g oats with 250ml milk in a pan or microwave (3 mins). Stir in 1 scoop of protein powder once it cools slightly. Top with banana and a drizzle of honey.' },
  { name: 'Cheese Toastie', protein: 16, prep: 3, category: 'cook',
    instructions: 'Butter the outside of 2 slices of bread. Place cheese (and ham if you have it) between the unbuttered sides. Cook in a dry pan on medium heat, 2 mins each side until golden.' },
  { name: 'Egg Fried Rice (leftover rice)', protein: 16, prep: 5, category: 'cook',
    instructions: 'Heat a splash of oil in a pan on high heat. Add leftover cold rice and stir-fry for 2 mins. Push to one side, crack in 2 eggs and scramble. Mix together, add soy sauce to taste.' },
];

export default function ProteinSnacks() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [currentSnack, setCurrentSnack] = useState(null);
  const [snackFilter, setSnackFilter] = useState('all');
  const [snackAnimating, setSnackAnimating] = useState(false);
  const remainingSnacks = useRef([]);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  const shuffleArray = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const generateRandomSnack = () => {
    const filtered = snackFilter === 'all'
      ? PROTEIN_SNACKS
      : PROTEIN_SNACKS.filter(s => s.category === snackFilter);

    // If deck is empty or filter changed, reshuffle
    if (remainingSnacks.current.length === 0) {
      remainingSnacks.current = shuffleArray(filtered);
    }

    setSnackAnimating(true);
    setTimeout(() => {
      const nextSnack = remainingSnacks.current.pop();
      setCurrentSnack(nextSnack);
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
                  onClick={() => { setSnackFilter(filter.value); setCurrentSnack(null); remainingSnacks.current = []; }}
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
                <div className="snack-instructions">
                  <div className="snack-instructions-label">How to make it</div>
                  <p>{currentSnack.instructions}</p>
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
