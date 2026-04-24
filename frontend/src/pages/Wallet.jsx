import { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { RESTClient, AccAddress, bcs } from "@initia/initia.js";
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx"; 
import { RefreshCw, Plus, Wallet as WalletIcon } from 'lucide-react';
import {
    CHAIN_ID,
    MODULE_ADDRESS, 
    REST_URL,
    FEE_DENOM,
    DECIMALS,
    TOKENS,
} from "../config.js";

const MODULE_NAME = "mock_tokens"

const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });

// Fetch balance for a specific token
async function fetchBalance(address, tokenId) {
    try {
        const res = await rest.move.viewFunction(
            MODULE_ADDRESS,
            MODULE_NAME,
            "balance_of",
            [],
            [
                bcs.address().serialize(address).toBase64(),
                bcs.u8().serialize(tokenId).toBase64(),
            ]
        );
        return res;
    } catch (err) {
        console.error(`Failed to fetch balance for token ${tokenId}:`, err);
        return 0;
    }
}

// Fetch all balances
async function fetchAllBalances(address) {
    const balances = {};
    await Promise.all(
        TOKENS.map(async (token) => {
            balances[token.id] = await fetchBalance(address, token.id);
        })
    );
    return balances;
}

function Wallet() {

    const { initiaAddress, requestTxSync } = useInterwovenKit();
    const [balances, setBalances] = useState({});
    const [loading, setLoading] = useState(false);
    const [minting, setMinting] = useState(null);
    const [filter, setFilter] = useState("all");

    const shortenAddress = (addr) => {
        if (!addr) return "";
        return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
    };

    const refresh = useCallback(async () => {
        if (!initiaAddress) return;
        setLoading(true);
        try {
            const bals = await fetchAllBalances(initiaAddress);
            setBalances(bals);
        } finally {
            setLoading(false);
        }
    }, [initiaAddress]);

    useEffect(() => {
        refresh();
    }, []);

    const sendMintTx = async (tokenId) => {
        if (!initiaAddress) return;
        const token = TOKENS.find(t => t.id === tokenId);
        if (!token) return;
        const rawAmount = BigInt(token.mintAmount) * BigInt(10 ** token.decimals);
        setMinting(tokenId);
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
                            moduleName: MODULE_NAME,
                            functionName: "mint",
                            typeArgs: [],
                            args: [
                                bcs.address().serialize(initiaAddress).toBytes(),
                                bcs.u8().serialize(tokenId).toBytes(),
                                bcs.u64().serialize(rawAmount).toBytes(),
                            ]
                        }),
                    },
                ],
            });
            setTimeout(refresh, 2000);
        } catch (err) {
            console.error("Mint failed:", err);
        } finally {
            setMinting(null);
        }
    };

    const formatBalance = (balance, decimals = DECIMALS) => {
        if (!balance || balance === 0) return "0." + "0".repeat(decimals);
        const str = BigInt(balance).toString().padStart(decimals + 1, "0");
        const intPart = str.slice(0, str.length - decimals) || "0";
        const decPart = str.slice(str.length - decimals);
        return `${intPart}.${decPart}`;
    };

    if (!initiaAddress) {
        return (
            <div className="fade-in">
                <div className="card" style={{ textAlign: 'center' }}>
                    <WalletIcon size={48} style={{ color: '#7dd3c2', marginBottom: '1rem' }} />
                    <h2 className="card-title">Wallet</h2>
                    <p style={{ color: '#b8f5e3', marginBottom: '1rem' }}>
                        Connect your wallet to view token balances
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            {/* Combined Wallet Card */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h2 style={{ 
                        fontSize: "1.25rem", 
                        fontWeight: 700, 
                        marginBottom: "0.25rem",
                        fontFamily: "var(--font-orbitron)",
                        color: "#ffffff"
                    }}>
                        <WalletIcon size={20} style={{ display: 'inline', marginRight: '8px', color: '#00e5c4' }} />
                        Your Wallet
                    </h2>
                    {/* <span style={{ color: '#7dd3c2', fontSize: '0.7rem' }}>{shortenAddress(initiaAddress)}</span> */}
                    <button
                        onClick={refresh}
                        className="btn btn-secondary"
                        disabled={loading}
                        style={{ padding: '0.4rem' }}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {["all", "earn"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            style={{
                                padding: '0.3rem 0.75rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                border: 'none',
                                cursor: 'pointer',
                                background: filter === tab ? 'rgba(0, 229, 196, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                color: filter === tab ? '#00e5c4' : '#7dd3c2',
                                transition: 'all 0.2s',
                            }}
                        >
                            {tab === "all" ? "All" : "Earn"}
                        </button>
                    ))}
                </div>

                {/* Token list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {TOKENS
                        .filter((token) => filter === "all" || token.apr !== null)
                        .map((token) => (
                        <div
                            key={token.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '8px',
                                border: '1px solid rgba(0, 229, 196, 0.1)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ position: 'relative', width: token.isLp ? '40px' : '32px', height: '32px', flexShrink: 0 }}>
                                    {token.isLp ? (
                                        <>
                                            <img
                                                src={token.lpIcons[0]}
                                                alt="Token A"
                                                style={{ width: '24px', height: '24px', borderRadius: '50%', position: 'absolute', top: 0, left: 0, zIndex: 2, border: '2px solid #1a1a2e' }}
                                            />
                                            <img
                                                src={token.lpIcons[1]}
                                                alt="Token B"
                                                style={{ width: '24px', height: '24px', borderRadius: '50%', position: 'absolute', bottom: 0, right: 0, zIndex: 1, border: '2px solid #1a1a2e' }}
                                            />
                                        </>
                                    ) : (
                                        <img
                                            src={token.icon}
                                            alt={token.symbol}
                                            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                                        />
                                    )}
                                </div>
                                <div>
                                    <div style={{ color: '#ffffff', fontWeight: '600' }}>{token.name}</div>
                                    <div style={{ color: '#7dd3c2', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        {token.protocol}
                                        {token.apr && (
                                            <span style={{
                                                background: 'rgba(0, 229, 196, 0.15)',
                                                color: '#00e5c4',
                                                padding: '0.1rem 0.35rem',
                                                borderRadius: '4px',
                                                fontSize: '0.65rem',
                                                fontWeight: '600',
                                            }}>
                                                {token.apr}% APR
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#b8f5e3', fontSize: '1rem', fontWeight: '600' }}>
                                    {formatBalance(balances[token.id] || 0)}
                                </span>
                                <button
                                    onClick={() => sendMintTx(token.id)}
                                    disabled={minting === token.id}
                                    className="btn btn-primary"
                                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}
                                >
                                    {minting === token.id ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <Plus size={14} />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Info Card */}
            <div className="card" style={{ background: 'rgba(0, 229, 196, 0.1)' }}>
                <p style={{ color: '#b8f5e3', fontSize: '0.875rem', textAlign: 'center', margin: 0 }}>
                    Click the + button to mint test tokens. These are mock tokens for testing purposes only.
                </p>
            </div>
        </div>
    );
}

export default Wallet;