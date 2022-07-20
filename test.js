const tape = require('tape')
const Broker = require('./')

if (!process.env.EMAIL || !process.env.PASSWORD || !process.env.SSID) {
  console.error('You have to pass all the ENV variables like this:')
  console.error('EMAIL="ie@gmail.com" PASSWORD="1234" SSID="abcd1234b4c0d1dc9d60e824b3cb71c0" npm run test')
  process.exit(1)
}

// + should find an active id that is always ticking, including weekends, etc?

tape('login', async function (t) {
  const broker = new Broker({
    email: process.env.EMAIL,
    password: process.env.PASSWORD
  })

  t.is(broker.ssid, null)

  const ssid = await broker.login()

  t.is(typeof ssid, 'string')
  t.ok(ssid.length === 32)
  t.is(broker.ssid, ssid)
})

tape('connect with email and password', async function (t) {
  const broker = new Broker({
    email: process.env.EMAIL,
    password: process.env.PASSWORD
  })

  await broker.login()
  await broker.connect()
  await waitForEvent('timeSync', broker)
  await waitForEvent('heartbeat', broker)
  await broker.disconnect()
})

tape('connect with ssid', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()
  await waitForEvent('timeSync', broker)
  await waitForEvent('heartbeat', broker)
  await broker.disconnect()
})

tape('subscribe', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()
  await broker.subscribe({ activeId: 76 })

  const tick = await waitForEvent('candle-generated', broker)
  t.is(typeof tick.active_id, 'number')
  t.is(typeof tick.size, 'number')
  t.is(typeof tick.at, 'number')
  t.is(typeof tick.from, 'number')
  t.is(typeof tick.to, 'number')
  t.is(typeof tick.id, 'number')
  t.is(typeof tick.open, 'number')
  t.is(typeof tick.close, 'number')
  t.is(typeof tick.min, 'number')
  t.is(typeof tick.max, 'number')
  t.is(typeof tick.ask, 'number')
  t.is(typeof tick.bid, 'number')
  t.is(typeof tick.volume, 'number')
  t.is(typeof tick.phase, 'string')

  await broker.disconnect()
})

tape('unsubscribe and resubscribe', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()

  let count = 0
  broker.on('candle-generated', function () {
    count++
  })

  await broker.subscribe({ activeId: 76 })

  const tick1 = await waitForEvent('candle-generated', broker)
  t.is(typeof tick1, 'object')

  await broker.unsubscribe({ activeId: 76 })
  await sleep(2000)
  // 2s is overkill on purpose to ensure ws message was sent and received
  // waiting won't be needed at all when request_id tracking is implemented
  // practically you don't need to wait

  // at this point it's probably unsubscribed and we're not receiving updates
  count = 0
  await sleep(3000)
  t.is(count, 0)

  // resuscribe
  await broker.subscribe({ activeId: 76 })

  const tick2 = await waitForEvent('candle-generated', broker)
  t.is(typeof tick2, 'object')

  await broker.disconnect()
})

function waitForEvent (eventName, emitter) {
  return new Promise(resolve => emitter.once(eventName, resolve))
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
