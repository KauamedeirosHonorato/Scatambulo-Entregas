import React from 'react';

export default function Header({ onLogout }) {
  return (
    <header className="p-4 bg-gray-800 flex justify-between items-center">
      <h1 className="text-xl font-bold">Delivery Dashboard</h1>
      <button onClick={onLogout} className="px-4 py-2 bg-red-600 rounded hover:bg-red-700">
        Logout
      </button>
    </header>
  );
}
