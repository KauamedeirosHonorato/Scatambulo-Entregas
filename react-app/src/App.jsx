import React from 'react';
import { DeliveryProvider } from './contexts/DeliveryContext';
import DeliveryDashboard from './pages/DeliveryDashboard';

function App() {
  return (
    <DeliveryProvider>
      <DeliveryDashboard />
    </DeliveryProvider>
  );
}

export default App;