import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddyCoach.css';

export default function CoreBuddyCoach() {
  const navigate = useNavigate();
  const { clientData } = useAuth();

  // Guard — if buddy not enabled, bounce back
  if (!clientData?.buddyEnabled) {
    return (
      <div className="buddy-page">
        <div className="buddy-container">
          <p>Buddy is not enabled on your account.</p>
          <button onClick={() => navigate('/client/core-buddy')}>Back to Dashboard</button>
        </div>
        <CoreBuddyNav active="home" />
      </div>
    );
  }

  return (
    <div className="buddy-page">
      <div className="buddy-container">
        <button className="buddy-back" onClick={() => navigate('/client/core-buddy')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div className="buddy-header">
          <div className="buddy-avatar">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
              <path d="M18 14c2 1 3 3 3 5v2H3v-2c0-2 1-4 3-5"/>
              <circle cx="9" cy="7" r="0.5" fill="currentColor"/>
              <circle cx="15" cy="7" r="0.5" fill="currentColor"/>
              <path d="M9.5 10a2.5 2.5 0 0 0 5 0"/>
              <path d="M7 13c1.5 1 3.5 1.5 5 1.5s3.5-.5 5-1.5"/>
            </svg>
          </div>
          <h1>Buddy</h1>
          <span className="buddy-subtitle">Your AI Training Partner</span>
        </div>

        <div className="buddy-placeholder">
          <p>Buddy is getting ready...</p>
          <span>This is where your AI coach will live. Check-ins, programmes, and chat — all coming soon.</span>
        </div>
      </div>
      <CoreBuddyNav active="home" />
    </div>
  );
}
