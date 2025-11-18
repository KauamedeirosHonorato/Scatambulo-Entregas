import { useState } from 'react';

// Placeholder for authentication logic
export const useAuth = () => {
  // In a real app, you'd check for a token in localStorage, a cookie, or from a context
  const [user, setUser] = useState({ name: 'Entregador' }); // Assume user is logged in for now

  const logout = () => {
    setUser(null);
    // In a real app, you'd clear the token/session
    console.log('User logged out');
  };

  return { user, logout };
};
