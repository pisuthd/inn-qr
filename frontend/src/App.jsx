import React, { useState } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import Header from "./components/Header.jsx";
import BottomNav from "./components/BottomNav.jsx";
import Home from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { Wallet, Users, Globe, Trophy } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const { initiaAddress, openConnect, openWallet } = useInterwovenKit();

  const handleNavigate = (tab) => {
    setActiveTab(tab);
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'inventory':
        return <Dashboard />;
      case 'leaderboard':
        return (
          <div className="fade-in">
            <div className="card" style={{ textAlign: 'center' }}>
              <h2 className="card-title">
                <Trophy size={20} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
                Top Spenders
              </h2>
              <p style={{ color: '#b8f5e3' }}>
                Coming soon! Top yield spenders will be displayed here.
              </p>
            </div>
          </div>
        );
      case 'profile':
        return (
          <div className="fade-in">
            <div className="card" style={{ textAlign: 'center' }}>
              <h2 className="card-title">
                <Users size={20} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
                Profile
              </h2>
              {initiaAddress ? (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '0.5rem',
                    color: '#7dd3c2',
                    fontFamily: 'var(--font-space)',
                    marginBottom: '1rem'
                  }}>
                    <Globe size={14} />
                    {initiaAddress}
                  </div>
                  <button className="btn btn-secondary" onClick={openWallet}>
                    <Wallet size={16} />
                    Manage Wallet
                  </button>
                </div>
              ) : (
                <button className="connect-wallet-btn" onClick={openConnect}>
                  <Wallet size={18} />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        );
      case 'home':
      default:
        return <Home onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {renderContent()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      <footer className="footer" style={{ color: '#7dd3c2' }}>
        POWERED BY INITIA • INTERWOVEN
      </footer>
    </div>
  );
}

export default App;