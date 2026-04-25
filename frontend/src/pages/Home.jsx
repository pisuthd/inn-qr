import { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { RESTClient, bcs } from "@initia/initia.js";
import { 
  ArrowDownToLine,
  QrCode,
  HelpCircle,
  Headphones,
  ChevronRight,
  FileText, 
  RefreshCw,
  PiggyBank,
  NotebookPen,
  Undo2
} from 'lucide-react';
import {
  CHAIN_ID,
  MODULE_ADDRESS,
  REST_URL,
  TOKENS,
} from "../config.js";

const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });

// Hardcoded USD prices (1 = $1)
const PRICES = {
  0: 1.00,   // USDC
  1: 0.09,   // sINIT
  2: 0.10,   // LP USDC-INIT
  3: 0.10,   // Cabal iUSD
  4: 0.10,   // Delta Neutral INIT
};

async function fetchBalance(address, tokenId) {
  try {
    const res = await rest.move.viewFunction(
      MODULE_ADDRESS,
      "mock_tokens",
      "balance_of",
      [],
      [
        bcs.address().serialize(address).toBase64(),
        bcs.u8().serialize(tokenId).toBase64(),
      ]
    );
    return res || 0;
  } catch (err) {
    return 0;
  }
}

function Home({ onNavigate, onOpenModal }) {
  const { initiaAddress, openConnect, openWallet, autoSign } = useInterwovenKit();
  const { selectedCountry } = useSettings();
  const [totalYield, setTotalYield] = useState(0);
  const [weightedApy, setWeightedApy] = useState(0);
  const [loading, setLoading] = useState(false);

  const isAutoSignEnabled = !!autoSign?.isEnabledByChain?.[CHAIN_ID];

  const toggleAutoSign = async () => {
    if (!autoSign) return;
    try {
      if (isAutoSignEnabled) {
        await autoSign.disable(CHAIN_ID);
      } else {
        await autoSign.enable(CHAIN_ID, {
          permissions: ["/initia.move.v1.MsgExecute"],
        });
      }
    } catch (err) {
      console.error("Auto-sign toggle failed:", err);
    }
  };

  const shortenAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  const loadPortfolio = useCallback(async () => {
    if (!initiaAddress) return;
    setLoading(true);

    let totalValue = 0;
    let totalYieldValue = 0;
    let weightedApySum = 0;

    await Promise.all(
      TOKENS.map(async (token) => {
        const balance = await fetchBalance(initiaAddress, token.id);
        const balanceValue = Number(balance || 0) / 1_000_000; // 6 decimals
        const price = PRICES[token.id] || 0.01;
        const usdValue = balanceValue * price;

        totalValue += usdValue;

        // Use APR from config, default to 0 if null
        const apr = token.apr ? parseFloat(token.apr) / 100 : 0;
        const yieldValue = usdValue * apr;
        totalYieldValue += yieldValue;
        weightedApySum += yieldValue;
      })
    );

    setTotalYield(totalYieldValue);
    setWeightedApy(totalValue > 0 ? (weightedApySum / totalValue) * 100 : 0);
    setLoading(false);
  }, [initiaAddress]);

  useEffect(() => {
    if (initiaAddress) {
      loadPortfolio();
    }
  }, [initiaAddress, loadPortfolio]);

  const handleMenuClick = (id) => {
    if (id === 'scan') {
      onOpenModal('pay');
    } else if (id === 'earn') {
      onOpenModal('earn');
    } else if (id === 'deposit') {
      onOpenModal('deposit');
    } else if (id === 'borrow') {
      onOpenModal('borrow');
    } else if (id === 'repay') {
      onOpenModal('repay');
    } else if (id === 'receipts') {
      onOpenModal('receipts');
    } else if (id === 'faq') {
      onOpenModal('faq');
    } else {
      onNavigate(id);
    }
  };

  const menuItems = [
    { id: 'scan', label: 'Scan', Icon: QrCode, gradient: 'gradient-swap' },
    { id: 'receipts', label: 'Receipts', Icon: FileText, gradient: 'gradient-supply' },
    { id: 'deposit', label: 'Deposit', Icon: ArrowDownToLine, gradient: 'gradient-inventory' },
    { id: 'repay', label: 'Repay', Icon: Undo2, gradient: 'gradient-leaderboard' },
    { id: 'borrow', label: 'Borrow', Icon: NotebookPen, gradient: 'gradient-agents' },
    { id: 'earn', label: 'Stake', Icon: PiggyBank, gradient: 'gradient-borrow' }, 
    { id: 'faq', label: 'FAQ', Icon: HelpCircle, gradient: 'gradient-settings' },
    { id: 'support', label: 'Support', Icon: Headphones, gradient: 'gradient-send' },
  ];

  return (
    <div className="fade-in">
      {/* Hero Card */}
      <div className="hero-card">
        <div className="hero-image">
          <div className="hero-glow" />
          <div className="hero-text" style={{ maxWidth: "400px" }}>
            <h2 style={{ color: '#ffffff' }}>Earn on Initia, spend anywhere with {selectedCountry.currency}</h2>
            <p style={{ color: '#b8f5e3' }}>Your staked assets earn yield. Spend it anywhere via QR in local currency. Settles in seconds.</p>
          </div>
        </div>
        <div className="hero-content">
          <div className="hero-balance">
            <span className="hero-balance-label" style={{ color: '#7dd3c2' }}>Your Total Yields</span>
            <span className="hero-balance-value">
              ${totalYield.toFixed(2)}
              {loading && <RefreshCw size={14} style={{ marginLeft: '0.5rem', animation: 'spin 1s linear infinite' }} />}
            </span>
            <span className="hero-balance-change">
              <span className="hero-change-indicator" />
              <span style={{ color: '#22c55e' }}>{weightedApy.toFixed(2)}% APY</span>
            </span>
          </div>
          <div>
            {!initiaAddress ? (
              <button onClick={openConnect} className="btn btn-primary">
                Connect Wallet
              </button>
            ) : (
              <button onClick={openWallet} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {shortenAddress(initiaAddress)}
                <ChevronRight size={16} />
              </button>
            )}
            
          </div>

        </div>
      </div> 

    
      {/* Menu Grid */}
      <div className="menu-grid">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className="menu-item"
            onClick={() => handleMenuClick(item.id)}
          >
            <div className={`menu-icon ${item.gradient}`}>
              {item.Icon ? (
                <item.Icon size={24} color="white" />
              ) : null}
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
        <h3 className="card-title">Why WeaveLink?</h3>
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

        {/* Auto-Sign Toggle */}
      {initiaAddress && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: '0.25rem' }}>Auto-Sign</h3>
            <p style={{ color: '#7dd3c2', fontSize: '0.75rem', margin: 0 }}>
              {isAutoSignEnabled ? 'Approve transactions without wallet popup' : 'Enable seamless one-click payments'}
            </p>
          </div>
          <button
            onClick={toggleAutoSign}
            style={{
              width: '48px',
              height: '28px',
              borderRadius: '14px',
              border: 'none',
              background: isAutoSignEnabled ? '#00e5c4' : 'rgba(255,255,255,0.15)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#ffffff',
              position: 'absolute',
              top: '3px',
              left: isAutoSignEnabled ? '23px' : '3px',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      )}


      {/* CTA */}
      <div className="card" style={{ textAlign: 'center' }}>
        <h3 className="card-title">Ready to begin?</h3>
        <p style={{ color: '#b8f5e3', marginBottom: '0.75rem' }}>
          Get your gas to get started on WeaveLink. Clone the repo and run:
        </p>
        <div style={{ 
          background: '#0d0d0d', 
          border: '1px solid rgba(0, 229, 196, 0.2)', 
          borderRadius: '8px', 
          padding: '1rem', 
          textAlign: 'left',
          marginBottom: '0.5rem',
          fontFamily: 'monospace',
          fontSize: '0.8rem'
        }}>
          <div style={{ color: '#7dd3c2' }}>$ git clone https://github.com/pisuthd/weavelink</div>
          <div style={{ color: '#7dd3c2' }}>$ cd scripts</div>
          <div style={{ color: '#7dd3c2' }}>$ npm install</div>
          <div style={{ color: '#f97316' }}>$ node faucet.js YOUR_ADDRESS</div>
        </div>
        <a 
          href="https://github.com/pisuthd/weavelink" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#00e5c4', fontSize: '0.75rem', textDecoration: 'underline' }}
        >
          View on GitHub →
        </a>
      </div>
    </div>
  );
}

export default Home;
