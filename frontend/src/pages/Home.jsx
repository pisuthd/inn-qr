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
  Undo2,
  Droplets,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  CHAIN_ID,
  MODULE_ADDRESS,
  REST_URL,
  API_URL,
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

  // Faucet state
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetResult, setFaucetResult] = useState(null); // { type: 'success' | 'error', message: string, txHash?: string }

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

  const handleFaucet = async () => {
    if (!initiaAddress || faucetLoading) return;
    setFaucetLoading(true);
    setFaucetResult(null);
    try {
      const res = await fetch(`${API_URL}/api/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: initiaAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFaucetResult({ type: 'error', message: data.error || 'Faucet request failed' });
      } else {
        setFaucetResult({ type: 'success', message: data.message, txHash: data.txHash });
      }
    } catch (err) {
      setFaucetResult({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setFaucetLoading(false);
    }
  };

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


      {/* Faucet */}
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Droplets size={20} style={{ color: '#00e5c4' }} />
          <h3 className="card-title" style={{ marginBottom: 0 }}>Get Testnet Gas</h3>
        </div>
        <p style={{ color: '#b8f5e3', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
          Receive <strong style={{ color: '#00e5c4' }}>0.1 WLINK</strong> to pay for transactions on WeaveLink testnet.
        </p>

        {!initiaAddress ? (
          <button onClick={openConnect} className="btn btn-primary" style={{ width: '100%' }}>
            Connect Wallet to Get Gas
          </button>
        ) : (
          <>
            <button
              onClick={handleFaucet}
              disabled={faucetLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                opacity: faucetLoading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {faucetLoading ? (
                <>
                  <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Sending...
                </>
              ) : (
                <>
                  <Droplets size={16} />
                  Get 0.1 WLINK
                </>
              )}
            </button>
            <p style={{ color: '#7dd3c2', fontSize: '0.7rem', marginTop: '0.5rem', marginBottom: 0 }}>
              to {shortenAddress(initiaAddress)}
            </p>
          </>
        )}

        {faucetResult && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            borderRadius: '8px',
            background: faucetResult.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${faucetResult.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: faucetResult.txHash ? '0.5rem' : 0 }}>
              {faucetResult.type === 'success' ? (
                <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
              ) : (
                <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
              )}
              <span style={{
                color: faucetResult.type === 'success' ? '#22c55e' : '#ef4444',
                fontSize: '0.8rem',
              }}>
                {faucetResult.type === 'success' ? 'Transaction sent!' : faucetResult.message}
              </span>
            </div>
            {faucetResult.txHash && (
              <a
                href={`${REST_URL.replace('/rest', '')}/explorer/tx/${faucetResult.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#00e5c4', fontSize: '0.7rem', textDecoration: 'underline', wordBreak: 'break-all' }}
              >
                View tx: {faucetResult.txHash.slice(0, 20)}...
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
