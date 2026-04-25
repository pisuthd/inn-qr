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


async function checkBalance() {
    const restClient = new RESTClient(REST_URL);
    const key = new MnemonicKey({ mnemonic: MNEMONIC });
    const wallet = new Wallet(restClient, key);

    const adminAddress = wallet.accAddress

    console.log("admin address : ", adminAddress)
    let allCoins = []
    let nextKey = null

    do {
        const [coins, pagination] = await restClient.bank.balance(adminAddress, {
            'pagination.key': nextKey || undefined,
        })
        allCoins = [...allCoins, ...coins]
        nextKey = pagination.next_key || null
    } while (nextKey)

    console.log(`${adminAddress} has:`)
    allCoins.forEach(coin => {
        console.log(`- ${coin.amount.toString()} ${coin.denom}`)
    })
}                                                                                                                                                                                                         

 
checkBalance().catch(e => console.error('Error:', e))
