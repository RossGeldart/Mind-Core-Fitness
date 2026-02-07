import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './ClientTools.css';

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

export default function DailyMotivation() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [dailyQuote, setDailyQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteAnimating, setQuoteAnimating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

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

  const generateDailyQuote = async () => {
    if (dailyQuote) return;

    setQuoteAnimating(true);
    const today = new Date().toISOString().split('T')[0];

    // Load used indices from Firestore to avoid repeats
    let usedIndices = [];
    try {
      const clientDoc = await getDoc(doc(db, 'clients', clientData.id));
      if (clientDoc.exists()) {
        usedIndices = clientDoc.data().quoteUsedIndices || [];
      }
    } catch (error) {
      // Continue with empty array if fetch fails
    }

    // If all quotes have been shown, reset the cycle
    if (usedIndices.length >= MOTIVATION_QUOTES.length) {
      usedIndices = [];
    }

    // Pick a random index from the remaining unused ones
    const availableIndices = MOTIVATION_QUOTES
      .map((_, i) => i)
      .filter(i => !usedIndices.includes(i));
    const randomPick = Math.floor(Math.random() * availableIndices.length);
    const selectedIndex = availableIndices[randomPick];
    const selectedQuote = MOTIVATION_QUOTES[selectedIndex];

    const quoteData = {
      text: selectedQuote.text,
      author: selectedQuote.author,
      date: today
    };

    try {
      await setDoc(doc(db, 'clients', clientData.id), {
        dailyQuote: quoteData,
        quoteUsedIndices: [...usedIndices, selectedIndex]
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
            <h3>Daily Motivation</h3>
            <p>Get your daily dose of inspiration to keep you on track.</p>
          </div>

          <div className="quote-generator">
            {quoteLoading ? (
              <div className="quote-skeleton">
                <div className="skeleton-icon"></div>
                <div className="skeleton-line long"></div>
                <div className="skeleton-line medium"></div>
                <div className="skeleton-line short"></div>
              </div>
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
                <div className="quote-empty-graphic">
                  <svg viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="36" stroke="var(--border-color)" strokeWidth="2" strokeDasharray="4 4"/>
                    <path d="M28 48h8l4-8V28H24v12h8zm16 0h8l4-8V28H40v12h8z" fill="var(--color-primary)" opacity="0.2"/>
                    <path d="M28 48h8l4-8V28H24v12h8zm16 0h8l4-8V28H40v12h8z" stroke="var(--color-primary)" strokeWidth="1.5"/>
                  </svg>
                </div>
                <h4 className="quote-empty-title">Your Daily Inspiration</h4>
                <p>Tap below to reveal today's motivational quote — a new one every day to keep you going.</p>
              </div>
            )}

            {!dailyQuote && !quoteLoading && (
              <button className="quote-generate-btn" onClick={generateDailyQuote} disabled={quoteAnimating}>
                {quoteAnimating ? 'Finding your quote...' : 'Get Inspired'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
