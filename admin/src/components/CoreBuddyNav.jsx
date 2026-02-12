import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function CoreBuddyNav({ active }) {
  const navigate = useNavigate();
  const { clientData } = useAuth();

  const isBlockWithCBAccess = clientData?.clientType === 'block' && clientData?.coreBuddyAccess;

  return (
    <nav className="block-bottom-nav">
      <button className={`block-nav-tab${active === 'home' ? ' active' : ''}`} onClick={() => navigate('/client/core-buddy')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Home</span>
      </button>
      <button className={`block-nav-tab${active === 'workouts' ? ' active' : ''}`} onClick={() => navigate('/client/core-buddy/workouts')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2.71 7 4.14 8.43 7.71 4.86 16.29 13.43 12.71 17 14.14 18.43 15.57 17 17 18.43 14.14 21.29l1.43 1.43 1.43-1.43 1.43 1.43 2.14-2.14 1.43 1.43L22 20.57z"/></svg>
        <span>Workouts</span>
      </button>
      <button className={`block-nav-tab${active === 'nutrition' ? ' active' : ''}`} onClick={() => navigate('/client/core-buddy/nutrition')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
        <span>Nutrition</span>
      </button>
      <button className={`block-nav-tab${active === 'progress' ? ' active' : ''}`} onClick={() => navigate('/client/personal-bests?mode=corebuddy')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
        <span>Progress</span>
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
