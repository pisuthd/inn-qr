{/* Receipts Modal — Lists all user's escrow receipts from on-chain data */}
import { useState, useEffect, useMemo } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import {
  FileText, RefreshCw, CheckCircle, Clock, AlertTriangle, ExternalLink
} from 'lucide-react';
import Modal from "../components/Modal.jsx";
import { API_URL } from "../config.js";

const STATUS_CONFIG = {
  locked:  { color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.25)',  label: 'Pending',  icon: Clock },
  claimed: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)',   label: 'Settled',  icon: CheckCircle },
  refunded:{ color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   label: 'Refunded', icon: AlertTriangle },
};

const TABS = [
  { key: 'locked',   label: 'Pending',  icon: Clock,       color: '#eab308' },
  { key: 'claimed',  label: 'Settled',  icon: CheckCircle,  color: '#22c55e' },
  { key: 'refunded', label: 'Refunded', icon: AlertTriangle, color: '#ef4444' },
];

function Receipts({ isOpen, onClose }) {
  const { initiaAddress, openConnect } = useInterwovenKit();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approveResult, setApproveResult] = useState(null);
  const [activeTab, setActiveTab] = useState('locked');

  const loadReceipts = async () => {
    if (!initiaAddress) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/receipts/${initiaAddress}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to fetch receipts');
      } else {
        setReceipts(data.receipts || []);
      }
    } catch (err) {
      setError('Network error — is the backend API running?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && initiaAddress) {
      loadReceipts();
    }
  }, [isOpen, initiaAddress]);

  // Filter receipts by active tab
  const filteredReceipts = useMemo(() => {
    if (activeTab === 'all') return receipts;
    return receipts.filter(r => r.status === activeTab);
  }, [receipts, activeTab]);

  // Count by status
  const counts = useMemo(() => {
    const c = { all: receipts.length, locked: 0, claimed: 0, refunded: 0 };
    receipts.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
    return c;
  }, [receipts]);

  const handleApprove = async (requestId) => {
    setApproving(requestId);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, marketId: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Approve failed');
      } else {
        setApproveResult({ requestId, txHash: data.txHash });
        setReceipts(prev =>
          prev.map(r =>
            r.requestId === requestId
              ? { ...r, status: 'claimed', statusCode: 1 }
              : r
          )
        );
      }
    } catch (err) {
      setError('Network error during approve');
    } finally {
      setApproving(null);
    }
  };

  const renderEmpty = (tabLabel) => (
    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
      <div style={{
        width: 48, height: 48, margin: '0 auto 0.75rem',
        borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileText size={20} style={{ color: '#7dd3c2' }} />
      </div>
      <p style={{ color: '#7dd3c2', fontSize: '0.8rem' }}>
        {tabLabel === 'All' ? 'No receipts yet' : `No ${tabLabel.toLowerCase()} receipts`}
      </p>
    </div>
  );

  const renderReceipt = (receipt) => {
    const cfg = STATUS_CONFIG[receipt.status] || STATUS_CONFIG.locked;
    const StatusIcon = cfg.icon;
    const isLocked = receipt.status === 'locked';

    return (
      <div key={receipt.requestId} style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(0,229,196,0.1)',
        borderRadius: '10px',
        padding: '0.7rem 0.75rem',
        marginBottom: '0.5rem',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600 }}>
              #{receipt.requestId}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: '6px', padding: '0.1rem 0.4rem',
              fontSize: '0.6rem', color: cfg.color, fontWeight: 500,
            }}>
              <StatusIcon size={9} />
              {cfg.label}
            </span>
          </div>
          <span style={{ color: '#ffffff', fontSize: '0.9rem', fontWeight: 700 }}>
            {receipt.amountHuman} USDC
          </span>
        </div>

        {/* Actions row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
          <a
            href={receipt.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#00e5c4', fontSize: '0.65rem', textDecoration: 'underline',
              display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
            }}
          >
            Slip <ExternalLink size={9} />
          </a>

          {isLocked && (
            <button
              onClick={() => handleApprove(receipt.requestId)}
              disabled={approving === receipt.requestId}
              style={{
                background: approving === receipt.requestId ? 'rgba(0,229,196,0.2)' : '#00e5c4',
                color: approving === receipt.requestId ? '#7dd3c2' : '#1a1a2e',
                border: 'none', borderRadius: '6px',
                padding: '0.25rem 0.6rem', fontSize: '0.65rem', fontWeight: 600,
                cursor: approving === receipt.requestId ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem',
              }}
            >
              {approving === receipt.requestId ? (
                <><RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /></>
              ) : (
                <>Approve</>
              )}
            </button>
          )}

          {approveResult?.requestId === receipt.requestId && receipt.status === 'claimed' && (
            <span style={{ color: '#22c55e', fontSize: '0.6rem' }}>✅ Done</span>
          )}
        </div>
      </div>
    );
  };

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label || 'All';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Receipts"
      subtitle="Your payment history & escrow status"
    >
      {!initiaAddress ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: '#7dd3c2', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Connect your wallet to view receipts
          </p>
          <button onClick={openConnect} className="btn btn-primary">
            Connect Wallet
          </button>
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <RefreshCw size={28} style={{ color: '#00e5c4', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#7dd3c2', fontSize: '0.85rem', marginTop: '1rem' }}>
            Loading receipts...
          </p>
        </div>
      ) : error ? (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '10px', padding: '0.75rem', color: '#ef4444', fontSize: '0.8rem',
          marginBottom: '0.75rem',
        }}>
          {error}
        </div>
      ) : (
        <div>
          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: '0.35rem',
            marginBottom: '0.75rem',
            overflowX: 'auto',
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              const count = counts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    background: isActive ? 'rgba(0,229,196,0.15)' : 'rgba(255,255,255,0.04)',
                    border: isActive ? '1px solid rgba(0,229,196,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.7rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#00e5c4' : '#7dd3c2',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.icon && <tab.icon size={10} style={{ color: isActive ? '#00e5c4' : (tab.color || '#7dd3c2') }} />}
                  {tab.label}
                  {count > 0 && (
                    <span style={{
                      background: isActive ? 'rgba(0,229,196,0.25)' : 'rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      padding: '0 0.3rem',
                      fontSize: '0.6rem',
                      minWidth: '1rem',
                      textAlign: 'center',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Refresh button on the right */}
            <button
              onClick={loadReceipts}
              style={{
                background: 'none', border: 'none', color: '#00e5c4',
                fontSize: '0.65rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.2rem',
                marginLeft: 'auto',
              }}
            >
              <RefreshCw size={11} />
            </button>
          </div>

          {/* Receipt list */}
          {filteredReceipts.length === 0
            ? renderEmpty(activeTabLabel)
            : filteredReceipts.map(renderReceipt)
          }
        </div>
      )}
    </Modal>
  );
}

export default Receipts;