import { useState, useRef, useEffect } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { useSettings } from "../contexts/SettingsContext.jsx";
import { RESTClient, bcs } from "@initia/initia.js";
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx";
import {
  RefreshCw, CheckCircle, Camera, User, MapPin, Keyboard
} from 'lucide-react';
import Modal from "../components/Modal.jsx";
import { API_URL, CHAIN_ID, MODULE_ADDRESS, REST_URL, FEE_DENOM } from "../config.js";

// const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });

// const PROXY_TYPES = [
//   { value: "phone", label: "Phone Number" },
//   { value: "national_id", label: "National ID" },
//   { value: "business_id", label: "Business ID" },
// ];

function ScanPay({ isOpen, onClose }) {
  const { initiaAddress, openConnect, requestTxSync } = useInterwovenKit();
  const { selectedCountry } = useSettings();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [proxyType, setProxyType] = useState("phone");
  const [proxyValue, setProxyValue] = useState("+66812345678");
  const [amount, setAmount] = useState("100");
  const [memo, setMemo] = useState("memo1234");
  const [marketId] = useState(1);
  const [cameraError, setCameraError] = useState(null);
  const [mode, setMode] = useState("scan"); // "scan" | "manual"

  // Flow states: "form" → "matching" → "quote" → "authorizing" → "confirmed"
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [authTxHash, setAuthTxHash] = useState(null);

  const currency = selectedCountry?.currency || "THB";

  // Camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Camera not available");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen && step === "form" && mode === "scan") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, step, mode]);

  const handleClose = () => {
    stopCamera();
    setStep("form");
    setQuote(null);
    setError(null);
    setAuthTxHash(null);
    onClose();
  };

  // Step 1: Find operator (POST /api/match)
  const handleFindOperator = async () => {
    if (!initiaAddress) { openConnect(); return; }
    if (!proxyValue || !amount || parseFloat(amount) <= 0) return;

    setLoading(true);
    setError(null);
    setStep("matching");

    try {
      const res = await fetch(`${API_URL}/api/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: initiaAddress,
          rail: "promptpay",
          proxyType,
          proxyValue,
          currency,
          amount: parseFloat(amount),
          marketId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to find operator");
        setStep("form");
        return;
      }

      setQuote(data);
      // Stay on "matching" for a moment to show the animation, then go to quote
      setTimeout(() => {
        setStep("quote");
        setLoading(false);
      }, 1500);
    } catch (err) {
      setError("Network error — is the backend API running?");
      setStep("form");
      setLoading(false);
    }
  };

  // Authorize operator on-chain
  const handleAuthorize = async () => {
    if (!quote?.operator?.address || !initiaAddress) return;

    setStep("authorizing");
    setError(null);

    try {
      await requestTxSync({
        chainId: CHAIN_ID,
        feeDenom: FEE_DENOM,
        messages: [
          {
            typeUrl: "/initia.move.v1.MsgExecute",
            value: MsgExecute.fromPartial({
              sender: initiaAddress,
              moduleAddress: MODULE_ADDRESS,
              moduleName: "market_v1",
              functionName: "set_authorization",
              typeArgs: [],
              args: [
                bcs.address().serialize(quote.operator.address).toBytes(),
                bcs.bool().serialize(true).toBytes(),
              ],
            }),
          },
        ],
      });

      setAuthTxHash("success");
      setStep("quote"); // Go back to quote, now authorized
    } catch (err) {
      console.error("Authorization failed:", err);
      setError("Authorization transaction failed: " + (err.message || "User rejected"));
      setStep("quote");
    }
  };

  // Confirm payment
  const handleConfirm = async () => {
    if (!quote) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: initiaAddress,
          requestId: quote.requestId,
          rail: "promptpay",
          proxyType,
          proxyValue,
          currency,
          amount: parseFloat(amount),
          marketId,
          memo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Confirmation failed");
        setLoading(false);
        return;
      }

      setQuote(prev => ({ ...prev, confirmData: data }));
      setStep("confirmed");
    } catch (err) {
      setError("Network error during confirmation");
    } finally {
      setLoading(false);
    }
  };

  const isAuthorized = !quote?.authorization?.needsAuthorization || !!authTxHash;

  const renderTabs = () => (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
      <button
        onClick={() => setMode('scan')}
        style={{
          flex: 1, padding: '0.6rem',
          background: mode === 'scan' ? 'rgba(0, 229, 196, 0.15)' : 'rgba(255,255,255,0.05)',
          border: mode === 'scan' ? '1px solid rgba(0, 229, 196, 0.4)' : '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px',
          color: mode === 'scan' ? '#00e5c4' : '#7dd3c2',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
          fontSize: '0.8rem', fontWeight: 500,
        }}
      >
        <Camera size={16} />
        Scan QR
      </button>
      <button
        onClick={() => setMode('manual')}
        style={{
          flex: 1, padding: '0.6rem',
          background: mode === 'manual' ? 'rgba(0, 229, 196, 0.15)' : 'rgba(255,255,255,0.05)',
          border: mode === 'manual' ? '1px solid rgba(0, 229, 196, 0.4)' : '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px',
          color: mode === 'manual' ? '#00e5c4' : '#7dd3c2',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
          fontSize: '0.8rem', fontWeight: 500,
        }}
      >
        <Keyboard size={16} />
        Manual Entry
      </button>
    </div>
  );

  const renderForm = () => (
    <div>
      {/* Tabs */}
      {renderTabs()}

      {/* Scan mode: camera only */}
      {mode === 'scan' && (
        <div style={{
          position: 'relative',
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#0d0d0d',
          aspectRatio: '16/9',
          marginBottom: '1rem',
        }}>
          <video ref={videoRef} autoPlay playsInline muted style={{
            width: '100%', height: '100%', objectFit: 'cover',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              width: '50%', aspectRatio: '1',
              border: '2px solid rgba(0, 229, 196, 0.5)',
              borderRadius: '12px',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
            }} />
          </div>
          {cameraError && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(234, 179, 8, 0.15)',
              color: '#eab308', fontSize: '0.7rem', textAlign: 'center', padding: '0.4rem',
            }}>
              {cameraError}
            </div>
          )}
        </div>
      )}

      {/* Manual mode: payment details form */}
      {mode === 'manual' && (
        <div style={{ marginBottom: '0.75rem' }}>
          {/* Merchant Details Header */}
          <div style={{ color: '#ffffff', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Merchant Details
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '0.6rem 0.75rem',
            marginBottom: '0.5rem',
            opacity: 0.7,
          }}>
            <span style={{ fontSize: '1.1rem' }}>{selectedCountry?.flag || '🇹🇭'}</span>
            <span style={{ color: '#b8f5e3', fontSize: '0.85rem' }}>{selectedCountry?.system || 'PromptPay'}</span>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem', marginLeft: 'auto' }}>{currency}</span>
          </div>

          <div style={{ color: '#ffffff', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Payment Info
          </div>
          <div style={{
            background: 'rgba(0, 229, 196, 0.06)',
            border: '1px solid rgba(0, 229, 196, 0.15)',
            borderRadius: '12px',
             marginBottom: '0.5rem',
            padding: '0.75rem',
          }}>

            {/* Proxy Value (proxy type hidden, defaults to "phone") */}
            <div style={{ marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={proxyValue}
                onChange={(e) => setProxyValue(e.target.value)}
                style={{
                  width: '100%', padding: '0.5rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(0,229,196,0.15)',
                  borderRadius: '8px', color: '#ffffff',
                  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Amount */}
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(0,229,196,0.15)',
              borderRadius: '8px', padding: '0.5rem',
              marginBottom: '0.5rem',
            }}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  color: '#ffffff', fontSize: '1rem', outline: 'none',
                }}
              />
              <span style={{ color: '#00e5c4', fontSize: '0.8rem', fontWeight: 600 }}>{currency}</span>
            </div>


          </div>

          <div style={{ color: '#ffffff', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Memo (Remember this — needed to use it later)
          </div>

          <div style={{
            background: 'rgba(0, 229, 196, 0.06)',
            border: '1px solid rgba(0, 229, 196, 0.15)',
            borderRadius: '12px',
            padding: '0.75rem',
          }}>
            {/* Memo */}
            <div>
              <input
                type="text"
                value={memo}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                  if (v.length <= 8) setMemo(v)
                }}
                placeholder="memo (4-8 chars)"
                maxLength={8}
                style={{
                  width: '100%', padding: '0.5rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(0,229,196,0.15)',
                  borderRadius: '8px', color: '#ffffff',
                  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <p style={{ color: '#7dd3c2', fontSize: '0.6rem', marginTop: '0.25rem', opacity: 0.7 }}>
                Alphanumeric only (4-8 chars).
              </p>
            </div>
          </div>


        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px', padding: '0.75rem', marginBottom: '0.75rem',
          color: '#ef4444', fontSize: '0.8rem',
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleFindOperator}
        disabled={!proxyValue || !amount || parseFloat(amount) <= 0}
        style={{
          width: '100%', background: '#00e5c4', color: '#1a1a2e',
          border: 'none', borderRadius: '10px', padding: '0.875rem',
          fontSize: '1rem', fontWeight: '600',
          cursor: (!proxyValue || !amount) ? 'not-allowed' : 'pointer',
          opacity: (!proxyValue || !amount) ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        }}
      >
        Next
      </button>
    </div>
  );

  const renderMatching = () => (
    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 1.5rem',
        borderRadius: '50%', background: 'rgba(0, 229, 196, 0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        <RefreshCw size={28} style={{ color: '#00e5c4', animation: 'spin 1.5s linear infinite' }} />
      </div>
      <h3 style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
        Matching Operator...
      </h3>
      <p style={{ color: '#7dd3c2', fontSize: '0.85rem' }}>
        Finding the best operator for your {currency} payment
      </p>
      <div style={{ marginTop: '1rem', color: '#7dd3c2', fontSize: '0.75rem', opacity: 0.6 }}>
        {proxyValue} • {amount} {currency}
      </div>
    </div>
  );

  const renderQuote = () => (
    <div>
      {/* Operator Info */}
      <div style={{
        background: 'rgba(0, 229, 196, 0.08)',
        border: '1px solid rgba(0, 229, 196, 0.2)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '0.75rem',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(0, 229, 196, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={20} style={{ color: '#00e5c4' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#ffffff', fontSize: '0.9rem', fontWeight: 600 }}>
              Operator Matched
            </div>
            <div style={{ color: '#00e5c4', fontSize: '0.7rem', fontFamily: 'monospace' }}>
              {quote?.operator?.address
                ? `${quote.operator.address.slice(0, 12)}...${quote.operator.address.slice(-6)}`
                : 'Operator'}
            </div>
          </div>
          <CheckCircle size={20} style={{ color: '#22c55e' }} />
        </div>

        <div style={{
          display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
        }}>
          {quote?.operator?.country && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '6px', padding: '0.3rem 0.6rem',
              fontSize: '0.7rem', color: '#b8f5e3',
            }}>
              <MapPin size={12} />
              {quote.operator.country}
            </div>
          )}
          {quote?.operator?.area && (
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '6px', padding: '0.3rem 0.6rem',
              fontSize: '0.7rem', color: '#b8f5e3',
            }}>
              {quote.operator.area}
            </div>
          )}
        </div>
      </div>

      {/* Quote Details */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
          <div style={{ color: '#7dd3c2', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Quote from Operator</div>
          <div style={{ color: '#ffffff', fontSize: '1.5rem', fontWeight: 700 }}>
            {amount} {currency}
          </div>
          <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>
            via {selectedCountry?.system || 'PromptPay'}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(0,229,196,0.1)', paddingTop: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>FX Rate</span>
            <span style={{ color: '#ffffff', fontSize: '0.75rem' }}>1 USDC = {quote?.quote?.fxRate || 35} {currency}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>USDC Amount</span>
            <span style={{ color: '#ffffff', fontSize: '0.75rem' }}>{quote?.quote?.usdcAmount || '2.86'} USDC</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Fee ({quote?.quote?.fee?.rate || '0.5%'})</span>
            <span style={{ color: '#ffffff', fontSize: '0.75rem' }}>{quote?.quote?.fee?.usdc || '0.014'} USDC</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            borderTop: '1px solid rgba(0,229,196,0.1)',
            paddingTop: '0.5rem', marginTop: '0.25rem',
          }}>
            <span style={{ color: '#00e5c4', fontSize: '0.85rem', fontWeight: 600 }}>Total USDC</span>
            <span style={{ color: '#00e5c4', fontSize: '0.85rem', fontWeight: 700 }}>
              {quote?.quote?.totalUsdc || '2.87'} USDC
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px', padding: '0.75rem', marginBottom: '0.75rem',
          color: '#ef4444', fontSize: '0.8rem',
        }}>
          {error}
        </div>
      )}

      {/* Authorization */}
      {!isAuthorized && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.08)',
          border: '1px solid rgba(234, 179, 8, 0.25)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>

            <div>
              <div style={{ color: '#eab308', fontSize: '0.85rem', fontWeight: 600 }}>
                Authorize Operator
              </div>
              <div style={{ color: '#b8f5e3', fontSize: '0.7rem' }}>
                This operator needs your on-chain authorization to borrow USDC on your behalf
              </div>
            </div>
          </div>
          <button
            onClick={handleAuthorize}
            disabled={step === "authorizing"}
            style={{
              width: '100%',
              background: step === "authorizing" ? 'rgba(234, 179, 8, 0.3)' : '#eab308',
              color: step === "authorizing" ? '#b8f5e3' : '#1a1a2e',
              border: 'none', borderRadius: '10px', padding: '0.75rem',
              fontSize: '0.9rem', fontWeight: 600,
              cursor: step === "authorizing" ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            {step === "authorizing" ? (
              <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Authorizing...</>
            ) : (
              <>Authorize</>
            )}
          </button>
        </div>
      )}

      {/* Market Info */}
      {/* {quote?.market && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '10px', padding: '0.6rem',
          marginBottom: '0.75rem',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ color: '#7dd3c2', fontSize: '0.65rem' }}>Market Liquidity</div>
            <div style={{ color: '#ffffff', fontSize: '0.75rem' }}>
              {(quote.market.liquidity / 1_000_000).toFixed(2)} USDC
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#7dd3c2', fontSize: '0.65rem' }}>LLTV</div>
            <div style={{ color: '#ffffff', fontSize: '0.75rem' }}>{quote.market.lltv}%</div>
          </div>
        </div>
      )} */}

      {/* Actions */}
      <div style={{ marginBottom: '0.5rem' }}>
        <p style={{ color: '#b8f5e3', fontSize: '0.7rem', textAlign: 'center', marginBottom: '0.5rem', lineHeight: 1.4 }}>
          This will lock <strong style={{ color: '#00e5c4' }}>{quote?.quote?.totalUsdc || '2.87'} USDC</strong> in escrow.
          The operator will send {amount} {currency} to {proxyValue} and claim the USDC after settlement.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => { setStep("form"); setQuote(null); setError(null); setAuthTxHash(null); }}
          style={{
            flex: 1, padding: '0.75rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', color: '#7dd3c2',
            cursor: 'pointer', fontSize: '0.85rem',
          }}
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isAuthorized || loading}
          style={{
            flex: 2, padding: '0.75rem',
            background: !isAuthorized ? 'rgba(255,255,255,0.05)' : '#00e5c4',
            color: !isAuthorized ? '#6b7280' : '#1a1a2e',
            border: 'none', borderRadius: '10px',
            cursor: !isAuthorized ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem', fontWeight: 600,
            opacity: !isAuthorized ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          {loading ? (
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : null}
          Lock & Pay
        </button>
      </div>
    </div>
  );

  const renderConfirmed = () => (
    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 1rem',
        borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircle size={32} style={{ color: '#22c55e' }} />
      </div>
      <h3 style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
        Payment Initiated!
      </h3>
      <p style={{ color: '#7dd3c2', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        {amount} {currency} is being sent to {proxyValue}
      </p>
      <p style={{ color: '#b8f5e3', fontSize: '0.7rem', marginBottom: '1rem', lineHeight: 1.4 }}>
        Review the receipt on the <strong style={{ color: '#00e5c4' }}>Receipts</strong> page to release funds to the operator once settlement is confirmed.
      </p>
 

      {/* Receipt Details */}
      {quote?.confirmData && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px', padding: '1rem',
          marginBottom: '1rem', textAlign: 'left',
        }}> 
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Request ID</span>
            <span style={{ color: '#ffffff', fontSize: '0.75rem', fontFamily: 'monospace' }}>
              #{quote.confirmData.requestId || quote.requestId}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>USDC Locked</span>
            <span style={{ color: '#ffffff', fontSize: '0.75rem' }}>
              {quote?.quote?.totalUsdc || '2.87'} USDC
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Escrow Status</span>
            <span style={{ color: '#eab308', fontSize: '0.75rem' }}>Locked (HTLC)</span>
          </div>
          {quote.confirmData.memoHash && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Memo Hash</span>
              <span style={{ color: '#ffffff', fontSize: '0.65rem', fontFamily: 'monospace', wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>
                {quote.confirmData.memoHash.slice(0, 16)}...
              </span>
            </div>
          )}
          {/* <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Memo</span>
            <span style={{ color: '#ffffff', fontSize: '0.75rem', fontFamily: 'monospace' }}>{memo}</span>
          </div> */}
        </div>
      )}

      <button
        onClick={handleClose}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '0.75rem',
          color: '#7dd3c2', cursor: 'pointer', fontSize: '0.85rem',
        }}
      >
        Done
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === "confirmed" ? "Payment Sent" : step === "matching" ? "Finding Operator" : "Scan to Pay"}
      subtitle="Scan merchant QR to pay by opening debt from your collateral"
    >
      {step === "form" && renderForm()}
      {step === "matching" && renderMatching()}
      {(step === "quote" || step === "authorizing") && renderQuote()}
      {step === "confirmed" && renderConfirmed()}
    </Modal>
  );
}

export default ScanPay;