import React, { useState, useEffect, useCallback } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { RESTClient, AccAddress } from "@initia/initia.js";
import { MsgExecute } from "@initia/initia.proto/initia/move/v1/tx";
import { Buffer } from "buffer";

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

export default function Game() {
  const { initiaAddress, requestTxSync, autoSign } = useInterwovenKit();
  const [inventory, setInventory] = useState({ shards: 0, relics: 0 });
  const [loading, setLoading] = useState(false);

  const isAutoSignEnabled = !!autoSign?.isEnabledByChain?.[CHAIN_ID];

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

  const sendTx = async (functionName) => {
    if (!initiaAddress) return;
    setLoading(true);
    try {
      await requestTxSync({
        chainId: CHAIN_ID,
        autoSign: isAutoSignEnabled,
        feeDenom: "INN",
        messages: [
          {
            typeUrl: "/initia.move.v1.MsgExecute",
            value: MsgExecute.fromPartial({
              sender: initiaAddress,
              moduleAddress: MODULE_ADDRESS,
              moduleName: MODULE_NAME,
              functionName,
              typeArgs: [],
              args: [],
            }),
          },
        ],
      });
      setTimeout(refresh, 2000);
    } catch (err) {
      console.error(`${functionName} failed:`, err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ textAlign: "center" }}>
      <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Inventory</h2>
      <p style={{ color: "var(--fg-muted)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
        {initiaAddress
          ? `Connected: ${initiaAddress.slice(0, 8)}...${initiaAddress.slice(-4)}`
          : "Connect your wallet to play"}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "2rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div style={{ fontSize: "2rem", fontWeight: 800 }}>{inventory.shards}</div>
          <div style={{ color: "var(--fg-muted)", fontSize: "0.75rem", fontWeight: 600 }}>
            SHARDS
          </div>
        </div>
        <div>
          <div style={{ fontSize: "2rem", fontWeight: 800 }}>{inventory.relics}</div>
          <div style={{ color: "var(--fg-muted)", fontSize: "0.75rem", fontWeight: 600 }}>
            RELICS
          </div>
        </div>
      </div>

      {initiaAddress && (
        <button
          className="btn btn-secondary"
          onClick={toggleAutoSign}
          style={{
            marginBottom: "1rem",
            fontSize: "0.75rem",
            gap: "0.5rem",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: isAutoSignEnabled ? "#10b981" : "#6b7280",
            }}
          />
          {isAutoSignEnabled ? "AUTO-SIGN ON" : "AUTO-SIGN OFF"}
        </button>
      )}

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
        <button
          className="btn btn-primary"
          disabled={!initiaAddress || loading}
          onClick={() => sendTx("mint_shard")}
        >
          Mint Shard
        </button>
        <button
          className="btn btn-craft"
          disabled={!initiaAddress || loading || inventory.shards < 2}
          onClick={() => sendTx("craft_relic")}
        >
          Craft Relic
        </button>
      </div>
      {inventory.shards < 2 && initiaAddress && (
        <p style={{ color: "var(--fg-muted)", fontSize: "0.75rem", marginTop: "0.75rem" }}>
          Need at least 2 shards to craft a relic
        </p>
      )}
    </div>
  );
}
