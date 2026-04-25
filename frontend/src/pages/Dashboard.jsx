import React from "react";
import {
  QrCode,
  Info,
  CheckCircle,
  Clock,
  Globe,
} from 'lucide-react';

// Mock FX rates & operator data
const PAYMENT_RAILS = [
  { id: 'promptpay', name: 'PromptPay', country: 'Thailand', flag: '🇹🇭', currency: 'THB', fxRate: 35.00, operatorActive: true, operatorAddr: 'init17apy...3je6', maxUsdc: 500 },
  { id: 'vietqr',    name: 'VietQR',    country: 'Vietnam',  flag: '🇻🇳', currency: 'VND', fxRate: 25000,  operatorActive: false },
  { id: 'duitnow',   name: 'DuitNow',   country: 'Malaysia', flag: '🇲🇾', currency: 'MYR', fxRate: 4.70,   operatorActive: false },
  { id: 'qris',      name: 'QRIS',      country: 'Indonesia',flag: '🇮🇩', currency: 'IDR', fxRate: 15500,  operatorActive: false },
  { id: 'paynow',    name: 'PayNow',    country: 'Singapore',flag: '🇸🇬', currency: 'SGD', fxRate: 1.35,   operatorActive: false },
];

const FX_FEE_RATE = 0.005; // 0.5%

function Dashboard({ onOpenModal }) {
  return (
    <div className="fade-in">

      {/* QR Scanner Card */}
      <div className="card" style={{ textAlign: "center" }}>
        <h2 style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          marginBottom: "0.25rem",
          fontFamily: "var(--font-orbitron)",
          color: "#ffffff"
        }}>
          <QrCode size={20} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
          Scan to Pay
        </h2>
        <p style={{ color: '#7dd3c2', marginBottom: '1rem' }}>
          Scan any QR code to pay using your yield
        </p>

        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={() => onOpenModal?.('pay')}
        >
          <QrCode size={18} />
          Scan QR Code
        </button>
      </div>

      {/* Payment Rails & Operators */}
      <div className="card">
        <h3 className="card-title">
          <Globe size={18} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
          Payment Rails & Operators
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {PAYMENT_RAILS.map(rail => (
            <div key={rail.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.65rem 0.75rem',
              background: 'var(--bg-tertiary)',
              borderRadius: '0.5rem',
              opacity: rail.operatorActive ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{rail.flag}</span>
                <div>
                  <div style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.875rem' }}>
                    {rail.name}
                  </div>
                  <div style={{ color: '#7dd3c2', fontSize: '0.7rem' }}>
                    {rail.country} • {rail.currency}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#ffffff', fontSize: '0.8rem', fontWeight: 500 }}>
                    {rail.currency === 'VND' || rail.currency === 'IDR'
                      ? `${(rail.fxRate / 1000).toFixed(1)}K`
                      : rail.fxRate.toFixed(2)}{" / USDC"}
                  </div>
                </div>

                {rail.operatorActive ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: '6px', padding: '0.2rem 0.5rem',
                    fontSize: '0.6rem', color: '#22c55e', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    <CheckCircle size={9} />
                    1 Operator
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px', padding: '0.2rem 0.5rem',
                    fontSize: '0.6rem', color: '#7dd3c2', fontWeight: 400,
                    whiteSpace: 'nowrap',
                  }}>
                    <Clock size={9} />
                    Soon
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '0.75rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(0,229,196,0.05)',
          borderRadius: '0.375rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#7dd3c2', fontSize: '0.7rem' }}>FX Fee</span>
          <span style={{ color: '#00e5c4', fontSize: '0.75rem', fontWeight: 600 }}>{(FX_FEE_RATE * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Quick Guide */}
      <div className="card">
        <h3 className="card-title">
          <Info size={18} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
          How It Works
        </h3>
        <ol style={{
          paddingLeft: 0,
          margin: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <li style={{ color: '#b8f5e3', fontSize: '0.875rem' }}>
            <span style={{ color: '#00e5c4', fontWeight: 600 }}>1.</span>{' '}
            Deposit collateral (sINIT, LP tokens) — earn yield while locked
          </li>
          <li style={{ color: '#b8f5e3', fontSize: '0.875rem' }}>
            <span style={{ color: '#a855f7', fontWeight: 600 }}>2.</span>{' '}
            Scan any merchant QR (PromptPay, VietQR, DuitNow, QRIS, PayNow)
          </li>
          <li style={{ color: '#b8f5e3', fontSize: '0.875rem' }}>
            <span style={{ color: '#f97316', fontWeight: 600 }}>3.</span>{' '}
            Operator matches your request → confirm amount + FX rate
          </li>
          <li style={{ color: '#b8f5e3', fontSize: '0.875rem' }}>
            <span style={{ color: '#22c55e', fontWeight: 600 }}>4.</span>{' '}
            Enter memo to approve settlement — done in seconds
          </li>
          <li style={{ color: '#b8f5e3', fontSize: '0.875rem' }}>
            <span style={{ color: '#00e5c4', fontWeight: 600 }}>5.</span>{' '}
            Repay debt from yield or deposit more collateral anytime
          </li>
        </ol>
      </div>
    </div>
  );
}

export default Dashboard;