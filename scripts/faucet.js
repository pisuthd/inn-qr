import {                                                                                                                                                                                                  
    Wallet,
    RESTClient,                                                                                                                                                                                             
    MnemonicKey,                                            
    MsgSend,
} from '@initia/initia.js'

// Base64 encoded mnemonic 
const ENCODED_MNEMONIC = "Y2VsZXJ5IGJhbWJvbyBoYXJ2ZXN0IHBvbnkgamFyIHdpbmRvdyBhdWRpdCBwcm92aWRlIHN3aXRjaCBjb3JlIHNhZG5lc3MgYXNwZWN0IGJvbWIgYWJzb3JiIHBlb3BsZSBtdXN0IGJ1cmRlbiBsYXcgcGF2ZSBhdHRlbmQgcmVhc29uIHJlZmxlY3QgZGVzaWduIG9yYml0";
const MNEMONIC = Buffer.from(ENCODED_MNEMONIC, 'base64').toString('utf-8');
const REST_URL = 'https://d3pgy5i52ev547.cloudfront.net/rest';
const GAS_PRICES = '0.015WLINK';

async function sendGas(recipient, amount = '100000000000000000WLINK') {
    const restClient = new RESTClient(REST_URL, { gasPrices: GAS_PRICES });
    const key = new MnemonicKey({ mnemonic: MNEMONIC });
    const wallet = new Wallet(restClient, key);

    const msg = new MsgSend(key.accAddress, recipient, amount);
    const signedTx = await wallet.createAndSignTx({ msgs: [msg] });
    const result = await restClient.tx.broadcast(signedTx);                                                                                                                                               
    return result;
}                                                                                                                                                                                                         

const recipient = process.argv[2];
if (!recipient) {
    console.error('Usage: node faucet.js <recipient_address> [amount]');
    console.error('Example: node faucet.js init1j8r97sz8zjkr3xecxdwvef9gw65xd8fjrukk60 100000000000000000WLINK');
    process.exit(1);
}

const amount = process.argv[3] || '100000000000000000WLINK';                                                                                                                                             

console.log(`Sending ${amount} to ${recipient}...`);                                                                                                                                                      

sendGas(recipient, amount)
    .then(r => {
        console.log('Transaction successful!');
        console.log('Transaction hash:', r.txhash);
    })
    .catch(e => console.error('Error:', e));
