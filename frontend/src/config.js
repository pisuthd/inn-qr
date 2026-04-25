// Chain & module constants
export const CHAIN_ID = "weavelink-1";
export const API_URL = "https://weavelink-one.vercel.app";
export const MODULE_ADDRESS = "init14wyc4mrufq05j8ryx0m0249hjesyuzak9rq86s"; 
export const REST_URL = "https://d3pgy5i52ev547.cloudfront.net/rest";
export const FEE_DENOM = "WLINK";

// Token definitions
export const DECIMALS = 6;

export const TOKENS = [
    { id: 0, name: "USDC", symbol: "USDC", protocol: "Coinbase", apr: null, decimals: DECIMALS, mintAmount: 100, icon: "https://app.inrt.fi/_next/static/media/usdc.1c9c40d5.png" },
    { id: 1, name: "Staked INIT", symbol: "sINIT", protocol: "Initia", apr: "2.12", decimals: DECIMALS, mintAmount: 1000, icon: "https://registry.initia.xyz/images/sINIT.png" },
    { id: 2, name: "LP USDC-INIT", symbol: "S_LP", protocol: "Initia DEX", apr: "45.45", decimals: DECIMALS, mintAmount: 1000, isLp: true, lpIcons: ["https://app.inrt.fi/_next/static/media/usdc.1c9c40d5.png", "https://registry.initia.xyz/images/INIT.png"] },
    { id: 3, name: "Cabal iUSD", symbol: "IUSD", protocol: "Cabal", apr: "13.53", decimals: DECIMALS, mintAmount: 1000, icon: "https://app.thecabal.xyz/images/tokens/iusd.svg" },
    { id: 4, name: "Delta Neutral INIT", symbol: "DNIUSD", protocol: "Cabal", apr: "64.80", decimals: DECIMALS, mintAmount: 1000, icon: "https://app.thecabal.xyz/images/tokens/delta-neutral-init.svg" },
];

// InterwovenKit chain config
export const customChain = {
    chain_id: CHAIN_ID,
    chain_name: "weavelink",
    pretty_name: "WeaveLink",
    network_type: "testnet",
    bech32_prefix: "init",
    logo_URIs: {
        png: "https://raw.githubusercontent.com/initia-labs/initia-registry/main/testnets/initia/images/initia.png",
        svg: "https://raw.githubusercontent.com/initia-labs/initia-registry/main/testnets/initia/images/initia.svg",
    },
    apis: {
        rpc: [{ address: "https://d3pgy5i52ev547.cloudfront.net/rpc" }],
        rest: [{ address: "https://d3pgy5i52ev547.cloudfront.net/rest" }],
        indexer: [{ address: "https://d3pgy5i52ev547.cloudfront.net/rest" }],
        "json-rpc": [{ address: "http://localhost:8545" }],
    },
    fees: {
        fee_tokens: [
            {
                denom: FEE_DENOM,
                fixed_min_gas_price: 0,
                low_gas_price: 0,
                average_gas_price: 0,
                high_gas_price: 0,
            },
        ],
    },
    staking: {
        staking_tokens: [{ denom: FEE_DENOM }],
    },
    metadata: {
        is_l1: false,
        minitia: {
            type: "minimove",
        },
    },
    native_assets: [
        {
            denom: FEE_DENOM,
            name: "Weavelink",
            symbol: "WLINK",
            decimals: 18,
        },
    ],
};