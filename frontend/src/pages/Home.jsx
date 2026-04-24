import { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { RESTClient, bcs } from "@initia/initia.js";
import {
  Wallet,
  ArrowDownToLine,
  QrCode,
  HelpCircle,
  Headphones,
  ChevronRight,
  FileText,
  CreditCard,
  RefreshCw
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
  const { initiaAddress, openConnect, openWallet } = useInterwovenKit();
  const { selectedCountry } = useSettings();
  const [totalYield, setTotalYield] = useState(0);
  const [weightedApy, setWeightedApy] = useState(0);
  const [loading, setLoading] = useState(false);

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
    if (id === 'earn') {
      onOpenModal('earn');
    } else if (id === 'deposit') {
      onOpenModal('deposit');
    } else if (id === 'borrow') {
      onOpenModal('borrow');
    } else if (id === 'repay') {
      onOpenModal('repay');
    } else {
      onNavigate(id);
    }
  };

  const menuItems = [
    { id: 'scan', label: 'Scan', Icon: QrCode, gradient: 'gradient-swap' },
    { id: 'receipts', label: 'Receipts', Icon: FileText, gradient: 'gradient-supply' },
    { id: 'deposit', label: 'Deposit', Icon: ArrowDownToLine, gradient: 'gradient-inventory' },
    { id: 'repay', label: 'Repay', Icon: CreditCard, gradient: 'gradient-leaderboard' },
    { id: 'earn', label: 'Earn', Icon: null, gradient: 'gradient-borrow', useImage: true },
    { id: 'borrow', label: 'Borrow', Icon: Wallet, gradient: 'gradient-agents' },
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
            <h2 style={{ color: '#ffffff' }}>Spend yield on Initia with {selectedCountry.currency}</h2>
            <p style={{ color: '#b8f5e3' }}>Use staked assets across interwoven rollups. Scan any QR code and pay in local currency. AI helps match with {selectedCountry.operators} local partners, settles in seconds.</p>
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

      {/* Menu Grid */}
      <div className="menu-grid">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className="menu-item"
            onClick={() => handleMenuClick(item.id)}
          >
            <div className={`menu-icon ${item.gradient}`}>
              {item.useImage ? (
                <img
                  src="https://app.inrt.fi/_next/static/media/usdc.1c9c40d5.png"
                  alt="USDC"
                  style={{ width: '28px', height: '28px', borderRadius: '50%' }}
                />
              ) : item.Icon ? (
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
  );
}

export default Home;
