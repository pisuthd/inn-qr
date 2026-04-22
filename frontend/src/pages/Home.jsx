import { useInterwovenKit } from "@initia/interwovenkit-react";
import { 
  Coins, 
  ArrowDownToLine, 
  Send, 
  Sparkles, 
  Wallet,
  QrCode,
  HelpCircle,
  CircleHelp,
  FileText,
  Headphones
} from 'lucide-react';

function Home({ onNavigate }) {
  const { initiaAddress, openConnect } = useInterwovenKit();

  const menuItems = [
    { id: 'scan', label: 'Scan', Icon: QrCode, gradient: 'gradient-swap' },
    { id: 'receipts', label: 'Receipts', Icon: FileText, gradient: 'gradient-supply' },
    { id: 'deposit', label: 'Deposit', Icon: ArrowDownToLine, gradient: 'gradient-inventory' },
    { id: 'repay', label: 'Repay', Icon: Send, gradient: 'gradient-leaderboard' },
    { id: 'earn', label: 'Earn', Icon: Sparkles, gradient: 'gradient-borrow' },
    { id: 'borrow', label: 'Borrow', Icon: Coins, gradient: 'gradient-agents' },
    { id: 'faq', label: 'FAQ', Icon: HelpCircle, gradient: 'gradient-settings' },
    { id: 'support', label: 'Support', Icon: Headphones, gradient: 'gradient-send' },
  ];

  return (
    <div className="fade-in">
      {/* Hero Card */}
      <div className="hero-card">
        <div className="hero-image">
          <div className="hero-glow" />
          <div className="hero-text" style={{maxWidth: "400px"}}>
            <h2 style={{ color: '#ffffff' }}>Spend your yield with THB</h2>
            <p style={{ color: '#b8f5e3' }}>Use any Interwoven staked asset on Initia. Pay anywhere via QR payment.</p>
          </div>
        </div>
        <div className="hero-content">
          <div className="hero-balance">
            <span className="hero-balance-label" style={{ color: '#7dd3c2' }}>Your Total Yields</span>
            <span className="hero-balance-value">$0.00</span>
            <span className="hero-balance-change">
              <span className="hero-change-indicator" />
              <span style={{ color: '#22c55e' }}>0% APY</span>
            </span>
          </div>
          {!initiaAddress ? (
            <button className="connect-wallet-btn" onClick={openConnect}>
              <Wallet size={18} />
              Connect
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onNavigate('inventory')}>
              Get Started
            </button>
          )}
        </div>
      </div>

      {/* Menu Grid */}
      <div className="menu-grid">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className="menu-item"
            onClick={() => onNavigate(item.id)}
          >
            <div className={`menu-icon ${item.gradient}`}>
              <item.Icon size={24} color="white" />
            </div>
            <span className="menu-label" style={{ color: '#7dd3c2' }}>{item.label}</span>
            {item.subtitle && (
              <span className="menu-subtitle" style={{ color: '#7dd3c2', fontSize: '0.6rem' }}>{item.subtitle}</span>
            )}
          </button>
        ))}
      </div>

      {/* Feature Highlights */}
      <div className="card">
        <h3 className="card-title">Why InnuQR?</h3>
        <ul style={{ 
          listStyle: 'none', 
          padding: 0, 
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <li style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#00e5c4' }}>⚡</span>
            <span>Never sell your crypto - spend only the yield it generates</span>
          </li>
          <li style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#a855f7' }}>📱</span>
            <span>Scan any QR code and pay in local currency worldwide</span>
          </li>
          <li style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#22c55e' }}>🛡️</span>
            <span>Powered by Interwoven and secured by Move</span>
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div className="card" style={{ textAlign: 'center' }}>
        <h3 className="card-title">Ready to begin?</h3>
        <p style={{ color: '#b8f5e3', marginBottom: '1rem' }}>
          Connect your wallet to start earning yield and spending via QR.
        </p>
        {!initiaAddress ? (
          <button className="connect-wallet-btn" onClick={openConnect}>
            <Wallet size={18} />
            Connect Wallet
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => onNavigate('inventory')}>
            Get Started
          </button>
        )}
      </div>
    </div>
  );
}

export default Home;