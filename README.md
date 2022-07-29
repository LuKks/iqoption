# iqoption

Real-time forex data from IQ Option using WebSocket.

![](https://img.shields.io/npm/v/iqoption.svg) ![](https://img.shields.io/npm/dt/iqoption.svg) ![](https://img.shields.io/badge/tested_with-tape-e683ff.svg) ![](https://img.shields.io/github/license/LuKks/iqoption.svg)

```
npm i iqoption
```

Disclaimer: do not use real money with this library.

https://iqoption.com/en/register

## Usage
```javascript
const Broker = require('iqoption')

const broker = new Broker({
  email: 'example@gmail.com',
  password: 'secret123'
})

await broker.login()
console.log('ssid', broker.ssid)

await broker.connect()
console.log('user_id', broker.profile.user_id)
console.log('balance_id', broker.profile.balance_id)
// console.log('client', broker.client)
console.log('balances', broker.balances)
console.log('balance IDs', broker.balances.map(b => b.id))

await broker.subscribe('candle-generated', { active_id: 76, size: 1 })
// Other sizes are 5, 10, 15, 30, etc

broker.on('candle-generated', function (tick) {
  console.log(tick) /* => {
    active_id: 76,
    size: 1,
    at: 1658359430627113700, // timestamp in attoseconds
    from: 1658359430,
    to: 1658359431,
    id: 147437049,
    open: 0.882379,
    close: 0.882379,
    min: 0.882379,
    max: 0.882379,
    ask: 0.88238,
    bid: 0.882378,
    volume: 0,
    phase: 'T'
  } */
})

// await broker.unsubscribe('candle-generated', { active_id: 76, size: 1 })
// await broker.disconnect()
```

Note: All the names, returned values, etc are originally from the WebSocket.

`broker.balances` is automatically updated on background.\
`broker.trading.profits` is also updated on background and used internally.

## SSID
Connect without login.

```javascript
const broker = new Broker({
  ssid: 'abcd1234b4c0d1dc9d60e824b3cb71c0'
})

await broker.connect()

// ...
```

## Open trades
I recommend reading `test.js` where there is multiple examples.

```javascript
// AFAIK: type 4 is practice balance (demo)
const practiceBalance = broker.balances.find(b => b.type === 4)

const option = await broker.send('binary-options.open-option', {
  user_balance_id: practiceBalance.id, // practice balance
  active_id: 76, // is EUR/USD OTC, 816 Bitcoin, etc
  option_type_id: 3, // is turbo-option, means expiration is less than five mins
  direction: 'call', // or 'put'
  expired: 1, // range 1-5 if it's turbo-option
  price: 5, // amount to invest
  // profit_percent: 85, // this value is calculated internally using broker.trading.profits
  returnMessage: true
})

if (option.message) {
  throw new Error(option.message)
}

console.log(option)
```

Note: `broker.trading.expiration` is used to calculate `expired` for `turbo-options` so you only set a range of 1-5.

Sell the option:
```javascript
const sold = await broker.send('sell-options', { options_ids: [option.id], returnMessage: true })

if (sold.error) {
  throw new Error(sold.error)
}

console.log(sold)
```

You can also let it close by itself.

## Get traders mood
```javascript
const mood = await broker.send('get-traders-mood', { instrument: 'turbo-option', asset_id: 1, returnMessage: true })
// mood => { instrument: 'turbo-option', asset_id: 1, value: 0.3098421048120437 }
```

## send()
Every time you send a message, there is normally two responses back:
1. A success confirmation
2. The actual data response

Let's say you found a command but not need to wait for the response:
`returnResult` in `true` will track and wait for the confirmation based on the automatic `request_id`.\

`returnMessage` in `true` will track and wait for a response based on the automatic `request_id`.\
Otherwise you would have to track all the messages from the WebSocket, etc.

The default is both in `false`.

```javascript
const result = await broker.send('my-magic-command', { returnResult: true })
// result => { success: true }
```

I think there is no subscription that have a message response.\
So don't use `returnMessage` in true with subscriptions.

## Assets
At the moment assets are fetch from an outdated file.

```javascript
const Broker = require('iqoption')

// Get all assets
const assets = Broker.assets()
console.log(assets[1].name) // => 'EUR/GBP'

// Find by name
const asset1 = Broker.assets('EUR/USD (OTC)')
console.log(asset1.active_id) // => 76

// Find by id
const asset2 = Broker.assets(76)
console.log(asset2.name) // => 'EUR/USD (OTC)'
```

## Handle semi-raw messages or subscriptions
You can inspect with the WebSocket from the traderoom of IQ Option.\
Maybe you're interested in sending a message not supported by the library.

Normally when sending a message, the data looks like this:
```javascript
{
  name: 'sendMessage',
  request_id: '15',
  local_time: 123,
  msg: {
    ...
  }
}
```

The library tries to automatically handle common operations like this:
```javascript
await broker.send('sell-options', { options_ids: [option.id] })
```

The "raw" equivalent would be:

```javascript
const option = await broker.send({
  name: 'sell-options',
  version: '3.0',
  body: {
    options_ids: [option.id]
  }
})
```

The `sell-options` message might not be that complicated.\
But the library still autocompleting the `request_id`, `local_time`, etc.\
There is too many commands, three different versions, too many data structures, etc.\
Be aware that the IQ Option WebSocket is not documented and doesn't have guarantees.

The same applies for `subscribe()` and `unsubscribe()`.

Also, if you want to listen to all the messages from the WebSocket:

```javascript
broker.on('all', function (data) {
  console.log(data)
})
```

I recommend reading the first tests of `test.js` for more events.

## Send raw messages or subscriptions
```js
broker.ws.json({
  name: 'the-command-name',
  request_id: broker.newRequestId(false), // false for messages and true for subscriptions
  local_time: broker.localTime(),
  msg: { ... }
})
```

## License
MIT
