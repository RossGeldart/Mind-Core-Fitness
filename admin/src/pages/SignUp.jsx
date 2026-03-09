import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Signup is now handled inline on the unified login page.
// This component redirects any old /signup links to the login page in signup mode.
export default function SignUp() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/login?type=core_buddy&mode=signup', { replace: true });
  }, [navigate]);

  return null;
}
