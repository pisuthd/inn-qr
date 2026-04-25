import { useState } from "react";
import Modal from "../components/Modal.jsx";
import { ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: "What is WeaveLink?",
    a: "WeaveLink lets you spend your crypto yield via QR at real merchants — without selling your assets. Deposit collateral, earn yield, and pay in local currency anywhere."
  },
  {
    q: "How does QR payment work?",
    a: "Scan any merchant QR code → WeaveLink matches you with an operator → the operator settles the payment locally in your currency (e.g. THB via PromptPay). You confirm with a memo and it's done in seconds."
  },
  {
    q: "What payment methods are supported?",
    a: "PromptPay (THB), VietQR (VND), DuitNow (MYR), QRIS (IDR), and PayNow (SGD). More rails coming soon."
  },
  {
    q: "What is Auto-Sign?",
    a: "Auto-Sign enables seamless one-click payments. Instead of approving every transaction with a wallet popup, Auto-Sign lets the app sign transactions automatically — making payments feel instant."
  },
  {
    q: "What happens when I authorize an operator?",
    a: "The first time you match with an operator, you authorize them to borrow USDC from your lending position on your behalf. The borrowed USDC goes into an HTLC escrow lock — the operator does NOT receive it directly. They only get the USDC after cryptographically proving they settled the off-chain payment."
  },
  {
    q: "Is my crypto safe?",
    a: "Yes. Your collateral stays in your lending position. When you pay, USDC is locked in an HTLC escrow with a timeout. If the operator fails to prove settlement before timeout, you automatically get a full refund."
  },
  {
    q: "What's the fee?",
    a: "A flat 0.5% FX spread on all payments. No hidden fees, no subscription."
  },
  {
    q: "How do I get started?",
    a: "1) Get test tokens from the faucet. 2) Deposit collateral (sINIT, LP tokens) to earn yield. 3) Scan any merchant QR to pay. That's it!"
  },
  {
    q: "How do I repay my borrow?",
    a: "You can repay USDC from your earned yield or deposit more collateral anytime. Visit the Repay section from the home screen."
  },
  {
    q: "Which chains are supported?",
    a: "WeaveLink is built on Initia as an Interwoven Rollup (miniMove), secured by the Move virtual machine. Cross-chain support coming in future versions."
  },
];

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          color: '#ffffff',
          fontSize: '0.875rem',
          fontWeight: 500,
          paddingRight: '0.5rem',
        }}>
          {item.q}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: '#00e5c4',
            flexShrink: 0,
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      <div style={{
        maxHeight: isOpen ? '200px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.25s ease, opacity 0.25s ease',
        opacity: isOpen ? 1 : 0,
      }}>
        <p style={{
          color: '#b8f5e3',
          fontSize: '0.8rem',
          lineHeight: 1.6,
          margin: 0,
          paddingBottom: '0.85rem',
        }}>
          {item.a}
        </p>
      </div>
    </div>
  );
}

function Faq({ isOpen, onClose }) {
  const [openIndex, setOpenIndex] = useState(null);

  const handleToggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="FAQ" subtitle="Frequently asked questions">
      <div>
        {FAQ_ITEMS.map((item, i) => (
          <FaqItem
            key={i}
            item={item}
            isOpen={openIndex === i}
            onToggle={() => handleToggle(i)}
          />
        ))}
      </div>
    </Modal>
  );
}

export default Faq;