import React, { useState } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { SettingsProvider } from "./contexts/SettingsContext.jsx";
import Header from "./components/Header.jsx";
import BottomNav from "./components/BottomNav.jsx";
import Home from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Wallet from "./pages/Wallet.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Earn from "./pages/Earn.jsx";
import Deposit from "./pages/Deposit.jsx";
import Borrow from "./pages/Borrow.jsx";
import Repay from "./pages/Repay.jsx";
import { Wallet as WalletIcon, Users, Globe, Trophy, ChevronRight } from 'lucide-react';


function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [activeModal, setActiveModal] = useState(null);
  const { initiaAddress, openConnect, openWallet } = useInterwovenKit();

  const shortenAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  const handleNavigate = (tab) => {
    setActiveTab(tab);
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'wallet':
        return <Wallet />;
      case 'inventory':
        return <Dashboard />;
      case 'leaderboard':
        return (
          <div className="fade-in">
            <div className="card" style={{ textAlign: 'center' }}>
              <h2 className="card-title">
                <Users size={20} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
                Partner List
              </h2>
              <p style={{ color: '#b8f5e3' }}>
                Coming soon! Partner list will be displayed here.
              </p>
            </div>
          </div>
        );
      case 'portfolio':
        return <Portfolio />;
      case 'home':
      default:
        return <Home onNavigate={handleNavigate} onOpenModal={setActiveModal} />;
    }
  };

  return (
    <SettingsProvider>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {renderContent()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      <footer className="footer" style={{ color: '#7dd3c2' }}>
        POWERED BY INITIA • INTERWOVEN
      </footer>

      {/* Modals */}
      {activeModal === 'earn' && <Earn isOpen={true} onClose={() => setActiveModal(null)} />}
      {activeModal === 'deposit' && <Deposit isOpen={true} onClose={() => setActiveModal(null)} />}
      {activeModal === 'borrow' && <Borrow isOpen={true} onClose={() => setActiveModal(null)} />}
      {activeModal === 'repay' && <Repay isOpen={true} onClose={() => setActiveModal(null)} />}
    </SettingsProvider>
  );
}

export default App;