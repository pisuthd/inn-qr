import { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { RESTClient, AccAddress, bcs } from "@initia/initia.js";
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx";
import { Buffer } from "buffer";
import { RefreshCw, Plus, Wallet as WalletIcon, ChevronRight } from 'lucide-react';

const CHAIN_ID = "weavelink-1";
const MODULE_ADDRESS = "init17apyevc9ma8722k0kcxhrd7r6qu08yww703je6";
const MODULE_NAME = "mock_tokens";
const REST_URL = "http://localhost:1317";

const rest = new RESTClient(REST_URL, { chainId: CHAIN_ID });

const TOKENS = [
    { id: 0, name: "USDC", symbol: "USDC", color: "#2775CA" },
    { id: 1, name: "S_INIT", symbol: "S_INIT", color: "#00E5C4" },
    { id: 2, name: "S_LP", symbol: "S_LP", color: "#A855F7" },
    { id: 3, name: "CABAL_IUSD", symbol: "IUSD", color: "#F59E0B" },
    { id: 4, name: "CABAL_DNIUSD", symbol: "DNIUSD", color: "#EC4899" },
];

// Helper to encode address for Move view function
function encodeAddress(address) {
    const hexAddr = AccAddress.toHex(address)
        .replace("0x", "")
        .padStart(64, "0");
    return Buffer.from(hexAddr, "hex").toString("base64");
}

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
 
        return res
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


    const sendMintTx = async (tokenId, amount = 1000) => {
        if (!initiaAddress) return;
        setMinting(tokenId);
        try {
            const b64Recipient = encodeAddress(initiaAddress);
            await requestTxSync({
                chainId: CHAIN_ID,
                feeDenom: "WLINK",
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
                                bcs.u64().serialize(amount).toBytes(),
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

    const formatBalance = (balance) => { 
        return balance.toString();
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
            {/* Wallet Header */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <WalletIcon size={24} style={{ color: '#00e5c4' }} />
                        <div>
                            <h2 className="card-title" style={{ margin: 0, fontSize: '1.25rem' }}>Wallet</h2>
                            <span style={{ color: '#7dd3c2', fontSize: '0.75rem' }}>{shortenAddress(initiaAddress)}</span>
                        </div>
                    </div>
                    <button
                        onClick={refresh}
                        className="btn btn-secondary"
                        disabled={loading}
                        style={{ padding: '0.5rem' }}
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Token Balances */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                    Token Balances
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {TOKENS.map((token) => (
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
                                <div
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: token.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        color: 'white',
                                    }}
                                >
                                    {token.symbol.charAt(0)}
                                </div>
                                <div>
                                    <div style={{ color: '#ffffff', fontWeight: '600' }}>{token.name}</div>
                                    <div style={{ color: '#7dd3c2', fontSize: '0.7rem' }}>{token.symbol}</div>
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