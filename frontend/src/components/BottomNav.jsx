import { Home, Package, Users, User, Wallet } from 'lucide-react';

function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home', label: 'HOME', Icon: Home },
    { id: 'wallet', label: 'WALLET', Icon: Wallet },
    { id: 'inventory', label: 'PAY', Icon: Package },
    // { id: 'leaderboard', label: 'PARTNERS', Icon: Users },
    { id: 'portfolio', label: 'PORTFOLIO', Icon: User },
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-content grid grid-cols-4">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`bottom-nav-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => onTabChange(id)}
          >
            <Icon size={22} strokeWidth={activeTab === id ? 2.5 : 2} />
            <span className="bottom-nav-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default BottomNav;