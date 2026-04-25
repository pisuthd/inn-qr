import React, { useState } from "react"; 
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
import ScanPay from "./pages/ScanPay.jsx"; 
import Receipts from "./pages/Receipts.jsx";
import Faq from "./pages/Faq.jsx";

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [activeModal, setActiveModal] = useState(null); 

  const handleNavigate = (tab) => {
    setActiveTab(tab);
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'wallet':
        return <Wallet />;
      case 'inventory':
        return <Dashboard onOpenModal={setActiveModal} />;
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
      {activeModal === 'pay' && <ScanPay isOpen={true} onClose={() => setActiveModal(null)} />}
      {activeModal === 'receipts' && <Receipts isOpen={true} onClose={() => setActiveModal(null)} />}
      {activeModal === 'faq' && <Faq isOpen={true} onClose={() => setActiveModal(null)} />}
    </SettingsProvider>
  );
}

export default App;