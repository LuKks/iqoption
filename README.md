# iqoption

Real-time forex data from IQ Option using WebSocket for Node.js

![](https://img.shields.io/npm/v/iqoption.svg) ![](https://img.shields.io/npm/dt/iqoption.svg) ![](https://img.shields.io/badge/tested_with-tape-e683ff.svg) ![](https://img.shields.io/github/license/LuKks/iqoption.svg)

```
npm i iqoption
```

This is just a basic version to try get some data.\
It could be easily improved to get account balance, send real trades, etc.

Every tick has a property `at` which is timestamp in attoseconds.

https://iqoption.com/en/register

## Usage
```javascript
const Broker = require('iqoption')

const broker = new Broker({
  email: 'example@gmail.com',
  password: 'secret123'
})

await broker.login()
console.log(browser.ssid)

await broker.connect()
await broker.subscribe({ activeId: 76 })

broker.on('candle-generated', function (tick) {
  console.log(tick) /* => {
    active_id: 76,
    size: 1,
    at: 1658359430627113700,
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

// await broker.unsubscribe({ activeId: 76 })
// await broker.disconnect()
```

## SSID
Connect without login.

```javascript
const broker = new Broker({
  ssid: 'abcd1234b4c0d1dc9d60e824b3cb71c0'
})

await broker.connect()

// ...
```

## Handle raw messages
It will print `authenticated`, `front`, `timeSync`, `heartbeat` and all the WebSocket internal messages.\
Including responses for your own messages.

```js
broker.on('message', function (data) {
  console.log(data)
})

broker.ws.json({
  name: 'the-command-name',
  // request_id: 's_' + broker.requestId++,
  local_time: broker.localTime(),
  msg: { ... }
})
```

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

## License
MIT
