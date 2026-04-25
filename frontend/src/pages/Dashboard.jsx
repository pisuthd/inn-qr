import React, { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { RESTClient, AccAddress } from "@initia/initia.js";
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx";
import { Buffer } from "buffer";
import { 
  Sparkles, 
  Hexagon, 
  QrCode, 
  Wallet,
  Info,
  ExternalLink,
  ArrowDownToLine,
  ArrowUpFromLine
} from 'lucide-react';

const CHAIN_ID = "innermost-1";
const MODULE_ADDRESS = "init19kh7utclf3ltwlnsewuz2qe5h7shvf60kx069p";
const MODULE_NAME = "items";
const REST_URL = "http://localhost:1317";

const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });

async function fetchInventory(address) {
  try {
    const hexAddr = AccAddress.toHex(address)
      .replace("0x", "")
      .padStart(64, "0");
    const b64Addr = Buffer.from(hexAddr, "hex").toString("base64");
    const res = await rest.move.view(
      MODULE_ADDRESS,
      MODULE_NAME,
      "get_inventory",
      [],
      [b64Addr]
    );
    const [shards, relics] = JSON.parse(res.data);
    return { shards: Number(shards), relics: Number(relics) };
  } catch {
    return { shards: 0, relics: 0 };
  }
}

function Dashboard({ onOpenModal }) {
  const { initiaAddress, requestTxSync } = useInterwovenKit();
  const [inventory, setInventory] = useState({ shards: 0, relics: 0 });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!initiaAddress) return;
    const inv = await fetchInventory(initiaAddress);
    setInventory(inv);
  }, [initiaAddress]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const shortenAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  return (
    <div className="fade-in">
      {/* Connection Status */}
      <div className="card" style={{ textAlign: "center" }}>
        <div className="status-indicator" style={{ margin: '0 auto 1rem' }}>
          <span className="status-dot" />
          <span style={{ color: '#ffffff' }}>
            {initiaAddress ? "Connected to InnuQR" : "Not Connected"}
          </span>
        </div>
        
        {initiaAddress && (
          <p style={{ 
            color: "#7dd3c2", 
            fontSize: "0.875rem",
            fontFamily: "var(--font-space)"
          }}>
            <ExternalLink size={14} style={{ display: 'inline', marginRight: '4px' }} />
            {shortenAddress(initiaAddress)}
          </p>
        )}
      </div>

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

      {/* Collateral Card */}
      <div className="card">
        <h3 className="card-title">
          <Wallet size={18} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
          Your Collateral
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '0.5rem'
          }}>
            <div>
              <div style={{ color: '#ffffff', fontWeight: 600 }}>Total Deposited</div>
              <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>0 USDC equivalent</div>
            </div>
            <div style={{ color: '#22c55e', fontSize: '0.875rem' }}>0% APY</div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '0.5rem'
          }}>
            <div>
              <div style={{ color: '#ffffff', fontWeight: 600 }}>Borrow Limit</div>
              <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Available to borrow</div>
            </div>
            <div style={{ color: '#00e5c4', fontSize: '0.875rem' }}>0 USDC</div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '0.5rem'
          }}>
            <div>
              <div style={{ color: '#ffffff', fontWeight: 600 }}>Current Debt</div>
              <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Outstanding borrowed</div>
            </div>
            <div style={{ color: '#a855f7', fontSize: '0.875rem' }}>0 USDC</div>
          </div>
        </div>
        
        <div className="buttons-row" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" style={{ flex: 1 }}>
            <ArrowDownToLine size={18} />
            Deposit
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }}>
            <ArrowUpFromLine size={18} />
            Withdraw
          </button>
        </div>
      </div>

      {/* Quick Guide */}
      <div className="card">
        <h3 className="card-title">
          <Info size={18} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
          How It Works
        </h3>
        <ol style={{ 
          paddingLeft: '1.25rem', 
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <li style={{ 
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#00e5c4' }}>1.</span> Deposit your Interwoven staked assets as collateral
          </li>
          <li style={{ 
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#a855f7' }}>2.</span> Your assets earn yield while deposited
          </li>
          <li style={{ 
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#22c55e' }}>3.</span> Scan any QR code to pay using borrowed USDC
          </li>
          <li style={{ 
            color: '#b8f5e3',
            fontSize: '0.875rem'
          }}>
            <span style={{ color: '#00e5c4' }}>4.</span> Repay debt using your accumulated yield
          </li>
        </ol>
      </div>
    </div>
  );
}

export default Dashboard;