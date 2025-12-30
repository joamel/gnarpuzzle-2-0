import React from 'react';
import MockGameBoard from '../components/MockGameBoard';

const GameTestPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 py-6">
      <div className="page-header text-center mb-8 px-4">
        <h1 className="text-3xl font-bold text-white mb-2">🎮 Game Board Test</h1>
        <p className="text-slate-300 text-lg mb-6">Testning av grundläggande spelmekanik</p>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-lg max-w-md mx-auto">
          <p className="font-semibold text-gray-800 mb-3">Testmål:</p>
          <ul className="text-left space-y-1 text-gray-700">
            <li>✅ Letter selection UI</li>
            <li>✅ Grid cell interaction</li>
            <li>✅ Basic letter placement</li>
            <li>✅ Visual feedback</li>
            <li>✅ Touch-friendly design</li>
          </ul>
        </div>
      </div>

      <MockGameBoard gridSize={4} />
    </div>
  );
};

export default GameTestPage;