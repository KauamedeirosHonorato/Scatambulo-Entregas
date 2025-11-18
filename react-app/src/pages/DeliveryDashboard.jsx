import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDelivery } from '../contexts/DeliveryContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { useFirebaseOrders } from '../hooks/useFirebaseOrders';

import OrderList from '../components/ui/OrderList';
import DynamicIsland from '../components/ui/DynamicIsland';
import ConfirmModal from '../components/ui/ConfirmModal';
import MapModal from '../components/ui/MapModal'; // Import the new modal

export default function DeliveryDashboard() {
  const { user } = useAuth();
  useGeolocation();
  useFirebaseOrders();
  const { activeDelivery, readyOrders } = useDelivery();

  useEffect(() => {
    if (!user) {
      console.log("User is not logged in. Redirecting...");
      // In a real app, you'd use a router here
    }
  }, [user]);

  if (!user) {
    return <div className="bg-gray-900 h-screen flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="h-screen w-screen bg-pearl text-gray-800 p-4 md:p-8">
      {/* The main content is now the list or the delivery island */}
      <div className="w-full h-full">
        {activeDelivery 
          ? <div className="pt-24"><DynamicIsland /></div> 
          : <OrderList orders={readyOrders} />
        }
      </div>

      {/* The map is now in a fixed modal */}
      <MapModal />

      {/* The confirmation modal is controlled by context state */}
      <ConfirmModal />
    </div>
  );
}