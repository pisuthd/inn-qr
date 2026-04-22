import React from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import Game from "./Game.jsx";

function App() {
  const { initiaAddress, openConnect, openWallet } = useInterwovenKit();

  const shortenAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <header
        style={{
          width: "100%",
          maxWidth: "1200px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>BlockForge</h1>

        {!initiaAddress ? (
          <button onClick={openConnect} className="btn btn-primary">
            Connect Wallet
          </button>
        ) : (
          <button onClick={openWallet} className="btn btn-secondary">
            {shortenAddress(initiaAddress)}
          </button>
        )}
      </header>

      <main style={{ flex: 1, width: "100%", maxWidth: "640px", padding: "2rem" }}>
        <Game />
      </main>

      <footer
        style={{
          padding: "4rem 2rem",
          color: "rgba(255,255,255,0.2)",
          fontSize: "0.75rem",
          fontWeight: 700,
        }}
      >
        POWERED BY INITIA
      </footer>
    </div>
  );
}

export default App;
