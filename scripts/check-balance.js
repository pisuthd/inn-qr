import { RESTClient } from '@initia/initia.js'

const REST_URL = 'https://d3pgy5i52ev547.cloudfront.net/rest'

async function checkBalance(address) {
    const restClient = new RESTClient(REST_URL)
    let allCoins = []
    let nextKey = null

    do {
        const [coins, pagination] = await restClient.bank.balance(address, {
            'pagination.key': nextKey || undefined,
        })
        allCoins = [...allCoins, ...coins]
        nextKey = pagination.next_key || null
    } while (nextKey)

    console.log(`${address} has:`)
    allCoins.forEach(coin => {
        console.log(`- ${coin.amount.toString()} ${coin.denom}`)
    })
}

const address = process.argv[2]
if (!address) {
    console.error('Usage: node balance.js <address>')
    process.exit(1)
}

checkBalance(address).catch(e => console.error('Error:', e))