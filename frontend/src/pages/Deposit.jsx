import { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { RESTClient, bcs } from "@initia/initia.js";
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx";
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from "../components/Modal.jsx";
import {
    CHAIN_ID,
    MODULE_ADDRESS,
    REST_URL,
    FEE_DENOM,
    TOKENS,
} from "../config.js";

const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });

// Market IDs to display
const MARKET_IDS = [1, 2, 3, 4];

const USDC_TOKEN = TOKENS.find(t => t.id === 0);

async function fetchMarketData(marketId) {
    try {
        const res = await rest.move.viewFunction(
            MODULE_ADDRESS,
            "market_v1",
            "get_market",
            [],
            [bcs.u64().serialize(marketId).toBase64()]
        );
        const [loanToken, collateralToken, , , , lltv] = res;
        return {
            marketId,
            loanToken,
            collateralToken,
            lltv: Number(lltv || 0),
        };
    } catch (err) {
        console.error(`Failed to fetch market ${marketId}:`, err);
        return null;
    }
}

async function fetchPosition(address, marketId) {
    try {
        const res = await rest.move.viewFunction(
            MODULE_ADDRESS,
            "market_v1",
            "get_position",
            [],
            [
                bcs.address().serialize(address).toBase64(),
                bcs.u64().serialize(marketId).toBase64(),
            ]
        );
        const [supplied, borrowed, collateral] = res;
        return {
            supplied: Number(supplied || 0),
            borrowed: Number(borrowed || 0),
            collateral: Number(collateral || 0),
        };
    } catch (err) {
        return { supplied: 0, borrowed: 0, collateral: 0 };
    }
}

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

function Deposit({ isOpen, onClose }) {
    const { initiaAddress, requestTxSync } = useInterwovenKit();
    const [markets, setMarkets] = useState([]);
    const [positions, setPositions] = useState({});
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [depositAmount, setDepositAmount] = useState("");
    const [depositing, setDepositing] = useState(false);
    const [collateralBalance, setCollateralBalance] = useState(0);

    const loadMarkets = useCallback(async () => {
        setLoading(true);
        const data = await Promise.all(MARKET_IDS.map(fetchMarketData));
        setMarkets(data.filter(Boolean));
        setLoading(false);
    }, []);

    const loadPositions = useCallback(async () => {
        if (!initiaAddress) return;
        const pos = {};
        await Promise.all(
            MARKET_IDS.map(async (marketId) => {
                pos[marketId] = await fetchPosition(initiaAddress, marketId);
            })
        );
        setPositions(pos);
    }, [initiaAddress]);

    const loadCollateralBalance = useCallback(async () => {
        if (!initiaAddress || !markets[currentIndex]) return;
        const tokenId = Number(markets[currentIndex].collateralToken);
        const bal = await fetchBalance(initiaAddress, tokenId);
        setCollateralBalance(bal);
    }, [initiaAddress, markets, currentIndex]);

    useEffect(() => {
        if (isOpen) {
            loadMarkets();
        }
    }, [isOpen, loadMarkets]);

    useEffect(() => {
        if (initiaAddress && markets.length > 0) {
            loadPositions();
        }
    }, [initiaAddress, markets, loadPositions]);

    useEffect(() => {
        if (initiaAddress && markets.length > 0) {
            loadCollateralBalance();
        }
    }, [initiaAddress, markets, currentIndex, loadCollateralBalance]);

    const currentMarket = markets[currentIndex];
    const collateralToken = currentMarket ? TOKENS.find(t => t.id === Number(currentMarket.collateralToken)) || TOKENS[0] : null;
    const currentPosition = currentMarket ? positions[currentMarket.marketId] : null;

    const goNext = () => {
        if (currentIndex < markets.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setDepositAmount("");
        }
    };

    const goPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setDepositAmount("");
        }
    };

    const formatNumber = (num) => {
        const value = num / 1_000_000;
        if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
        return value.toFixed(2);
    };

    const formatBalance = (balance, decimals = 6) => {
        if (!balance || balance === 0) return "0." + "0".repeat(decimals);
        const str = BigInt(balance).toString().padStart(decimals + 1, "0");
        const intPart = str.slice(0, str.length - decimals) || "0";
        const decPart = str.slice(str.length - decimals);
        return `${intPart}.${decPart}`;
    };

    const handleMax = () => {
        setDepositAmount(formatBalance(collateralBalance));
    };

    const handleDeposit = async () => {
        if (!initiaAddress || !depositAmount || parseFloat(depositAmount) <= 0 || !currentMarket) return;
        const rawAmount = BigInt(Math.floor(parseFloat(depositAmount) * 1_000_000));
        if (rawAmount <= 0) return;

        setDepositing(true);
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
                            functionName: "supply_collateral",
                            typeArgs: [],
                            args: [
                                bcs.address().serialize(initiaAddress).toBytes(),
                                bcs.u64().serialize(currentMarket.marketId).toBytes(),
                                bcs.u64().serialize(rawAmount).toBytes(),
                            ]
                        }),
                    },
                ],
            });
            await loadPositions();
            await loadCollateralBalance();
            setDepositAmount("");
        } catch (err) {
            console.error("Deposit failed:", err);
        } finally {
            setDepositing(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Deposit"
            subtitle="Deposit yield-bearing tokens across interwoven rollups and use them to pay for real-world purchases"
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <RefreshCw size={24} style={{ color: '#00e5c4', animation: 'spin 1s linear infinite' }} />
                    <p style={{ color: '#7dd3c2', marginTop: '0.5rem' }}>Loading markets...</p>
                </div>
            ) : markets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <p style={{ color: '#7dd3c2' }}>No markets available.</p>
                </div>
            ) : (
                <div>
                    {/* Carousel controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button onClick={goPrev} disabled={currentIndex === 0} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '8px', padding: '0.5rem', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', opacity: currentIndex === 0 ? 0.3 : 1, display: 'flex' }}>
                            <ChevronLeft size={20} style={{ color: '#00e5c4' }} />
                        </button>
                        <span style={{ color: '#7dd3c2', fontSize: '0.8rem', flex: 1, textAlign: 'center' }}>{currentIndex + 1} / {markets.length}</span>
                        <button onClick={goNext} disabled={currentIndex === markets.length - 1} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '8px', padding: '0.5rem', cursor: currentIndex === markets.length - 1 ? 'not-allowed' : 'pointer', opacity: currentIndex === markets.length - 1 ? 0.3 : 1, display: 'flex' }}>
                            <ChevronRight size={20} style={{ color: '#00e5c4' }} />
                        </button>
                    </div>

                    {/* Market card */}
                    {currentMarket && collateralToken && (
                        <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(0, 229, 196, 0.15)', borderRadius: '12px', padding: '1.25rem' }}>
                            {/* Token header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                <img src={USDC_TOKEN.icon} alt="USDC" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: '#ffffff', fontWeight: '600', fontSize: '1rem' }}>USDC</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: '#7dd3c2', fontSize: '0.9rem' }}>→</span>
                                    {collateralToken.isLp ? (
                                        <div style={{ position: 'relative', width: '24px', height: '24px' }}>
                                            <img src={collateralToken.lpIcons[0]} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%', position: 'absolute', top: 0, left: 0, zIndex: 2, border: '1px solid #1a1a2e' }} />
                                            <img src={collateralToken.lpIcons[1]} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%', position: 'absolute', bottom: 0, right: 0, zIndex: 1, border: '1px solid #1a1a2e' }} />
                                        </div>
                                    ) : (
                                        <img src={collateralToken.icon} alt={collateralToken.name} style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                    )}
                                    <span style={{ color: '#7dd3c2', fontSize: '0.9rem', fontWeight: '500' }}>{collateralToken.name}</span>
                                </div>
                            </div>

                            {/* Position stats - 2x2 grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div style={{ color: '#7dd3c2', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Your Deposit</div>
                                    <div style={{ color: '#ffffff', fontWeight: '600', fontSize: '1rem' }}>{formatNumber(currentPosition?.collateral || 0)}</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div style={{ color: '#7dd3c2', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Borrowed</div>
                                    <div style={{ color: '#ffffff', fontWeight: '600', fontSize: '1rem' }}>0</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div style={{ color: '#7dd3c2', fontSize: '0.7rem', marginBottom: '0.25rem' }}>LTV</div>
                                    <div style={{ color: '#ffffff', fontWeight: '600', fontSize: '1rem' }}>{currentMarket.lltv}%</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <div style={{ color: '#7dd3c2', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Supply APY</div>
                                    <div style={{ color: '#00e5c4', fontWeight: '600', fontSize: '1rem' }}>0%</div>
                                </div>
                            </div>

                            {/* Deposit form */}
                            <div style={{ marginBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,196,0.2)', borderRadius: '10px', padding: '0.75rem' }}>
                                    <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.0" style={{ flex: 1, background: 'transparent', border: 'none', color: '#ffffff', fontSize: '1rem', outline: 'none' }} />
                                    <span style={{ color: '#7dd3c2', fontSize: '0.85rem' }}>{collateralToken.symbol}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <button onClick={handleMax} style={{ background: 'none', border: 'none', color: '#00e5c4', fontSize: '0.75rem', cursor: 'pointer' }}>Max: {formatBalance(collateralBalance)}</button>
                            </div>
                            <button onClick={handleDeposit} disabled={depositing || !depositAmount || parseFloat(depositAmount) <= 0} style={{ width: '100%', background: '#00e5c4', color: '#1a1a2e', border: 'none', borderRadius: '10px', padding: '0.875rem', fontSize: '1rem', fontWeight: '600', cursor: (depositing || !depositAmount || parseFloat(depositAmount) <= 0) ? 'not-allowed' : 'pointer', opacity: (depositing || !depositAmount || parseFloat(depositAmount) <= 0) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {depositing ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : `Deposit ${collateralToken.symbol}`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

export default Deposit;
