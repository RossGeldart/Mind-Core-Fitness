import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import './CoreBuddyNav.css';

export default function CoreBuddyNav({ active }) {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { isPremium } = useTier();

  const isBlockWithCBAccess = clientData?.clientType === 'block' && clientData?.coreBuddyAccess;

  return (
    <nav className="block-bottom-nav">
      <button className={`block-nav-tab${active === 'home' ? ' active' : ''}`} onClick={() => navigate('/client/core-buddy')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Profile</span>
      </button>
      <button className={`block-nav-tab${active === 'workouts' ? ' active' : ''}`} onClick={() => navigate('/client/core-buddy/workouts')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M1 9h2v6H1V9zm3-2h2v10H4V7zm3 4h10v2H7v-2zm10-4h2v10h-2V7zm3 2h2v6h-2V9z"/></svg>
        <span>Workouts</span>
      </button>
      <button className={`block-nav-tab${active === 'nutrition' ? ' active' : ''}`} onClick={() => navigate(isPremium ? '/client/core-buddy/nutrition' : '/upgrade')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
        <span>Nutrition</span>
      </button>
      <button className={`block-nav-tab${active === 'buddies' ? ' active' : ''}`} onClick={() => navigate(isPremium ? '/client/core-buddy/buddies' : '/upgrade')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Buddies</span>
      </button>
      {isBlockWithCBAccess && (
        <button className="block-nav-tab" onClick={() => navigate('/client')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>Block</span>
        </button>
      )}
    </nav>
  );
}
