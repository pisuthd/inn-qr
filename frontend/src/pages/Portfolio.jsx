import { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { RESTClient, bcs } from "@initia/initia.js";
import { RefreshCw, ChevronRight, User } from 'lucide-react';
import {
    CHAIN_ID,
    MODULE_ADDRESS,
    REST_URL,
    TOKENS,
} from "../config.js";
import Withdraw from "./Withdraw.jsx"; 
import Repay from "./Repay.jsx";

const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });
const MARKET_IDS = [1, 2, 3, 4];

async function fetchMarketData(marketId) {
    try {
        const res = await rest.move.viewFunction(
            MODULE_ADDRESS, "market_v1", "get_market", [],
            [bcs.u64().serialize(marketId).toBase64()]
        );
        const [loanToken, collateralToken, , , , lltv] = res;
        return { marketId, loanToken, collateralToken, lltv: Number(lltv || 0) };
    } catch (err) {
        return null;
    }
}

async function fetchPosition(address, marketId) {
    try {
        const res = await rest.move.viewFunction(
            MODULE_ADDRESS, "market_v1", "get_position", [],
            [bcs.address().serialize(address).toBase64(), bcs.u64().serialize(marketId).toBase64()]
        );
        const [supplied, borrowed, collateral] = res;
        return { supplied: Number(supplied || 0), borrowed: Number(borrowed || 0), collateral: Number(collateral || 0) };
    } catch (err) {
        return { supplied: 0, borrowed: 0, collateral: 0 };
    }
}

function Portfolio() {
    const { initiaAddress } = useInterwovenKit();
    const [markets, setMarkets] = useState([]);
    const [positions, setPositions] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeModal, setActiveModal] = useState(null);
    const [selectedMarketId, setSelectedMarketId] = useState(null);

    const loadData = useCallback(async () => {
        if (!initiaAddress) return;
        setLoading(true);
        
        const marketData = await Promise.all(MARKET_IDS.map(fetchMarketData));
        const validMarkets = marketData.filter(Boolean);
        setMarkets(validMarkets);
        
        const pos = {};
        await Promise.all(validMarkets.map(async (m) => {
            pos[m.marketId] = await fetchPosition(initiaAddress, m.marketId);
        }));
        setPositions(pos);
        setLoading(false);
    }, [initiaAddress]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const formatNumber = (num) => {
        const value = num / 1_000_000;
        if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
        return value.toFixed(2);
    };

    const handleWithdrawCollateral = (marketId) => {
        setSelectedMarketId(marketId);
        setActiveModal('withdraw');
    };

    const handleWithdrawSupply = (marketId) => {
        setSelectedMarketId(marketId);
        setActiveModal('withdraw-supply');
    };

    const handleRepay = (marketId) => {
        setSelectedMarketId(marketId);
        setActiveModal('repay');
    };

    const depositedPositions = markets.filter(m => positions[m.marketId]?.collateral > 0);
    const suppliedPositions = markets.filter(m => positions[m.marketId]?.supplied > 0);
    const borrowPositions = markets.filter(m => positions[m.marketId]?.borrowed > 0);

    if (!initiaAddress) {
        return (
            <div className="fade-in">
                <div className="card" style={{ textAlign: 'center' }}>
                    <User size={48} style={{ color: '#7dd3c2', marginBottom: '1rem' }} />
                    <h2 className="card-title">Portfolio</h2>
                    <p style={{ color: '#b8f5e3' }}>Connect wallet to view positions</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="card" style={{ marginBottom: '1rem' }}>
                <h2 style={{ 
                    fontSize: "1.25rem", 
                    fontWeight: 700, 
                    marginBottom: "0.25rem",
                    fontFamily: "var(--font-orbitron)",
                    color: "#ffffff"
                }}>
                    <User size={20} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
                    Your Portfolio
                </h2>
                {/* <span style={{ color: '#7dd3c2', fontSize: '0.7rem' }}>{`${initiaAddress?.slice(0, 8)}...${initiaAddress?.slice(-4)}`}</span> */}
                <p style={{ color: '#7dd3c2', fontSize: '0.75rem', margin: '0.5rem 0 0 0' }}>Manage your deposits, supplies, and borrows</p>
            </div>
            
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <RefreshCw size={24} style={{ color: '#00e5c4', animation: 'spin 1s linear infinite' }} />
                </div>
            ) : (
                <>
                    {/* Deposited Positions */}
                    <div className="card" style={{ marginBottom: '1rem' }}>
                        <h3 className="card-title" style={{ fontSize: '1rem' }}>Deposited Positions</h3>
                        {depositedPositions.length === 0 ? (
                            <p style={{ color: '#7dd3c2', fontSize: '0.875rem' }}>No deposited positions</p>
                        ) : (
                            depositedPositions.map(m => {
                                const token = TOKENS.find(t => t.id === Number(m.collateralToken)) || TOKENS[0];
                                const pos = positions[m.marketId];
                                return (
                                    <div key={m.marketId} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <img src={token.icon} alt={token.name} style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '0.75rem' }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#ffffff', fontWeight: '600' }}>{token.name}</div>
                                            <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Market {m.marketId} • LTV {m.lltv}%</div>
                                        </div>
                                        <div style={{ textAlign: 'right', marginRight: '0.75rem' }}>
                                            <div style={{ color: '#ffffff', fontWeight: '600' }}>{formatNumber(pos.collateral)}</div>
                                            <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Deposited</div>
                                        </div>
                                        <button onClick={() => handleWithdrawCollateral(m.marketId)} style={{ background: 'rgba(0,229,196,0.15)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ color: '#00e5c4', fontSize: '0.75rem' }}>Withdraw</span>
                                            <ChevronRight size={14} style={{ color: '#00e5c4' }} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Supplied Positions */}
                    <div className="card" style={{ marginBottom: '1rem' }}>
                        <h3 className="card-title" style={{ fontSize: '1rem' }}>Supplied Positions</h3>
                        {suppliedPositions.length === 0 ? (
                            <p style={{ color: '#7dd3c2', fontSize: '0.875rem' }}>No supplied positions</p>
                        ) : (
                            suppliedPositions.map(m => {
                                const usdcToken = TOKENS.find(t => t.id === 0);
                                const pos = positions[m.marketId];
                                return (
                                    <div key={m.marketId} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <img src={usdcToken.icon} alt="USDC" style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '0.75rem' }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#ffffff', fontWeight: '600' }}>USDC</div>
                                            <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Market {m.marketId}</div>
                                        </div>
                                        <div style={{ textAlign: 'right', marginRight: '0.75rem' }}>
                                            <div style={{ color: '#ffffff', fontWeight: '600' }}>{formatNumber(pos.supplied)}</div>
                                            <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Supplied</div>
                                        </div>
                                        <button onClick={() => handleWithdrawSupply(m.marketId)} style={{ background: 'rgba(0,229,196,0.15)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ color: '#00e5c4', fontSize: '0.75rem' }}>Withdraw</span>
                                            <ChevronRight size={14} style={{ color: '#00e5c4' }} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Borrow Positions */}
                    <div className="card" style={{ marginBottom: '1rem' }}>
                        <h3 className="card-title" style={{ fontSize: '1rem' }}>Borrow Positions</h3>
                        {borrowPositions.length === 0 ? (
                            <p style={{ color: '#7dd3c2', fontSize: '0.875rem' }}>No borrow positions</p>
                        ) : (
                            borrowPositions.map(m => {
                                const usdcToken = TOKENS.find(t => t.id === 0);
                                const pos = positions[m.marketId];
                                return (
                                    <div key={m.marketId} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <img src={usdcToken.icon} alt="USDC" style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '0.75rem' }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#ffffff', fontWeight: '600' }}>USDC</div>
                                            <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Market {m.marketId}</div>
                                        </div>
                                        <div style={{ textAlign: 'right', marginRight: '0.75rem' }}>
                                            <div style={{ color: '#f97316', fontWeight: '600' }}>{formatNumber(pos.borrowed)}</div>
                                            <div style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>Borrowed</div>
                                        </div>
                                        <button onClick={() => handleRepay(m.marketId)} style={{ background: 'rgba(249,115,22,0.15)', border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ color: '#f97316', fontSize: '0.75rem' }}>Repay</span>
                                            <ChevronRight size={14} style={{ color: '#f97316' }} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </>
            )}

            {/* Modals */}
            {activeModal === 'withdraw' && (
                <Withdraw isOpen={true} initialMarketId={selectedMarketId} onClose={() => setActiveModal(null)} onSuccess={loadData} />
            )}
            {activeModal === 'withdraw-supply' && (
                <Withdraw isOpen={true} initialMarketId={selectedMarketId} isSupply onClose={() => setActiveModal(null)} onSuccess={loadData} />
            )}
            {activeModal === 'repay' && (
                <Repay isOpen={true} initialMarketId={selectedMarketId} onClose={() => setActiveModal(null)} onSuccess={loadData} />
            )}
        </div>
    );
}

export default Portfolio;
