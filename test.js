/* eslint-disable camelcase */

require('dotenv').config()

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
  // console.log('ssid', ssid)

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

  // 'all' receives all the raw data from the WebSocket
  // broker.on('all', console.log)
  await waitForEvent('all', broker)

  // check basic events
  await waitForEvent('timeSync', broker)
  await waitForEvent('heartbeat', broker)

  // there are all sorts of raw events like:
  // broker.on('option', console.log)
  // broker.on('sold-options', console.log)
  // broker.on('position-changed', console.log)
  // broker.on('subscription', console.log)
  // broker.on('positions-state', console.log)
  // broker.on('orders', console.log)
  // broker.on('positions', console.log)
  // broker.on('candle-generated', console.log)

  // for any other event that are not the previous ones:
  // broker.on('message', console.log)

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

tape('basic info', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()

  // profile
  t.is(typeof broker.profile.user_id, 'number')
  t.is(typeof broker.profile.balance_id, 'number')
  t.is(typeof broker.profile.address, 'string')
  t.is(typeof broker.profile.city, 'string')
  t.is(Array.isArray(broker.profile.confirmed_phones), true)
  t.is(typeof broker.profile.email, 'string')
  t.is(typeof broker.profile.phone, 'string')
  t.is(typeof broker.profile.first_name, 'string')
  t.is(typeof broker.profile.last_name, 'string')
  t.is(typeof broker.profile.nationality, 'string')
  t.is(typeof broker.profile.birthdate, 'number')
  // etc

  // client
  t.is(typeof broker.client.user_id, 'number')
  t.is(typeof broker.client.flag, 'string')
  t.is(typeof broker.client.img_url, 'string')
  t.is(typeof broker.client.is_vip, 'boolean')
  t.is(typeof broker.client.registration_time, 'number')
  // etc

  // balances
  t.ok(broker.balances.length > 0)
  t.is(typeof broker.balances[0].id, 'number')
  t.is(typeof broker.balances[0].user_id, 'number')
  t.is(typeof broker.balances[0].type, 'number')
  t.is(typeof broker.balances[0].amount, 'number')
  t.is(typeof broker.balances[0].enrolled_amount, 'number')
  t.is(typeof broker.balances[0].currency, 'string')
  t.is(typeof broker.balances[0].is_fiat, 'boolean')
  t.is(typeof broker.balances[0].is_marginal, 'boolean')
  // etc

  await broker.disconnect()
})

tape('send messages to get data', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()

  // get balances (note: broker.balances already have those values and they're updated in real time)
  const balances = await broker.send('get-balances', { returnMessage: true })
  t.ok(balances.length > 0) // normally there is at least two balances (real and practice)
  t.is(typeof balances[0].id, 'number')
  t.is(typeof balances[0].user_id, 'number')
  t.is(typeof balances[0].type, 'number')
  t.is(typeof balances[0].amount, 'number')
  t.is(typeof balances[0].enrolled_amount, 'number')
  t.is(typeof balances[0].currency, 'string')
  t.is(typeof balances[0].is_fiat, 'boolean')
  t.is(typeof balances[0].is_marginal, 'boolean')

  // get commissions (note: broker.trading.profits already have those values and they're updated in real time)
  const commissions = await broker.send('get-commissions', { instrument_type: 'turbo-option', asset_id: 1, returnMessage: true })
  t.is(commissions.instrument_type, 'turbo-option')
  t.is(typeof commissions.user_group_id, 'number')
  t.is(Array.isArray(commissions.items), true)

  const commissions2 = await broker.send('get-commissions', { instrument_type: 'binary-option', asset_id: 1, returnMessage: true })
  t.is(commissions2.instrument_type, 'binary-option')
  t.is(typeof commissions2.user_group_id, 'number')
  t.is(Array.isArray(commissions2.items), true)

  // get traders mood
  const mood = await broker.send('get-traders-mood', { instrument: 'turbo-option', asset_id: 1, returnMessage: true })
  t.is(mood.instrument, 'turbo-option')
  t.is(mood.asset_id, 1)
  t.is(typeof mood.value, 'number') // ie. 0.3098421048120437

  const mood2 = await broker.send('get-traders-mood', { instrument: 'binary-option', asset_id: 1, returnMessage: true })
  t.is(mood2.instrument, 'binary-option')
  t.is(mood2.asset_id, 1)
  t.is(typeof mood2.value, 'number') // ie. 0.3098421048120437

  // get orders
  const orders = await broker.send('portfolio.get-orders', { user_balance_id: broker.balances[1].id, returnMessage: true })
  t.ok(Array.isArray(orders.items))

  // get positions
  const positions = await broker.send('portfolio.get-positions', { offset: 0, limit: 30, user_balance_id: broker.balances[1].id, instrument_types: ['turbo-option', 'binary-option'], returnMessage: true })
  t.ok(Array.isArray(positions.positions))
  t.is(typeof positions.total, 'number')
  t.is(typeof positions.limit, 'number')

  await broker.disconnect()
})

tape('open option', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()

  // I think if your account is not verified or something you don't easily get the "commissions" (broker.trading.profits) values
  // my personal account does receives this values but another new account does not receive them
  // if you are not able to make trades then you can set the "profit_percent" manually to 85 or whatever is the current profit percentage and also open an issue in GitHub

  t.is(typeof broker.trading.profits['turbo-option'], 'object')
  t.ok(Object.values(broker.trading.profits['turbo-option']).length > 0)
  t.is(typeof broker.trading.profits['turbo-option']['1'], 'number')
  // etc

  t.is(typeof broker.trading.profits['binary-option'], 'object')
  t.ok(Object.values(broker.trading.profits['binary-option']).length > 0)
  t.is(typeof broker.trading.profits['binary-option']['1'], 'number')
  // etc

  const option = await broker.send('binary-options.open-option', {
    user_balance_id: broker.balances[1].id, // practice balance
    active_id: 76, // is EUR/USD OTC (or 816 Bitcoin)
    option_type_id: 3, // is turbo-option, means expiration is less than five mins
    direction: 'call', // or 'put'
    expired: 1, // range 1-5
    price: 5, // amount to invest
    // profit_percent: 85, // this value is calculated internally using broker.trading.profits
    returnMessage: true
  })

  // here, the variable "option" rarely could be this:
  // { message: 'Cannot purchase an option (the asset is not available at the moment).' }
  // { message: 'Time for purchasing options is over, please try again later.' }
  // { message: 'Cannot purchase an option (active is suspended)' }
  // { message: 'The option has not been purchased because of the profit rate change.', result: { ... } }

  if (option.message) {
    throw new Error(option.message)
  }

  // example:
  t.is(typeof option.user_id, 'number') // 71834226
  t.is(typeof option.id, 'number') // 7996106109
  t.is(typeof option.refund_value, 'number') // 0
  t.is(typeof option.price, 'number') // 5
  t.is(typeof option.exp, 'number') // 1659065520
  t.is(typeof option.created, 'number') // 1659065461
  t.is(typeof option.created_millisecond, 'number') // 1659065461809
  t.is(typeof option.time_rate, 'number') // 1659065461
  t.is(typeof option.type, 'string') // 'turbo'
  t.is(typeof option.act, 'number') // 1
  t.is(typeof option.direction, 'string') // 'call'
  t.is(typeof option.exp_value, 'number') // 1020075
  t.is(typeof option.value, 'number') // 1.020075
  t.is(typeof option.profit_income, 'number') // 185
  t.is(typeof option.profit_return, 'number') // 0
  // t.is(typeof option.robot_id, ?) // null
  t.is(typeof option.client_platform_id, 'number') // 82

  await broker.disconnect()
})

tape('sell option (also check real time balance updates)', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()

  /* broker.on('sold-options', function (data) {
    console.log('[sold-options]', data)
  }) */

  const initialBalance = broker.balances[1].amount

  const option = await broker.send('binary-options.open-option', {
    user_balance_id: broker.balances[1].id,
    active_id: 76,
    option_type_id: 3,
    direction: 'call',
    expired: 1,
    price: 5,
    returnMessage: true
  })

  if (option.message) {
    throw new Error(option.message)
  }

  t.is(typeof option.id, 'number')

  // selling too soon will result in "canceled" buyback_state
  await sleep(3000)

  // balance variable changed (normally it's updated in a very few ms after opening the option)
  t.ok(initialBalance !== broker.balances[1].amount)

  const sold = await broker.send('sell-options', { options_ids: [option.id], returnMessage: true })

  // here, the variable "sold" could also be this:
  // { error: 'Unable to sell options' } // when you try to sold an option that was already finished

  t.is(typeof sold, 'object')
  t.is(typeof sold[option.id], 'object')
  t.is(typeof sold[option.id].id, 'number') // 7368967329
  t.is(typeof sold[option.id].option_id, 'number') // 7368967329
  t.is(typeof sold[option.id].amount, 'number') // 5000000
  t.is(typeof sold[option.id].refund, 'number') // 0
  t.is(typeof sold[option.id].currency, 'string') // 'USD'
  t.is(typeof sold[option.id].currency_char, 'string') // $
  t.is(typeof sold[option.id].active_id, 'number') // 1
  t.is(typeof sold[option.id].active, 'string') // 'EURUSD'
  t.is(typeof sold[option.id].value, 'number') // 1.020895
  t.is(typeof sold[option.id].exp_value, 'number') // 1020905
  t.is(typeof sold[option.id].dir, 'string') // 'call'
  t.is(typeof sold[option.id].created, 'number') // 1659117984
  t.is(typeof sold[option.id].expired, 'number') // 1659118020
  t.is(typeof sold[option.id].type_name, 'string') // 'turbo'
  t.is(typeof sold[option.id].type, 'string') // 'front.TU'
  t.is(typeof sold[option.id].profit, 'number') // 0
  t.is(typeof sold[option.id].profit_amount, 'number') // 2.52
  t.is(typeof sold[option.id].win_amount, 'number') // 2.52
  t.is(typeof sold[option.id].loose_amount, 'number') // 0
  t.is(typeof sold[option.id].sum, 'number') // 5
  t.is(typeof sold[option.id].win, 'string') // 'win', 'loose' or 'equal'
  t.is(typeof sold[option.id].now, 'number') // 1659117989
  t.is(typeof sold[option.id].user_id, 'number') // 71834226
  t.is(typeof sold[option.id].game_state, 'number') // 1
  t.is(typeof sold[option.id].profit_income, 'number') // 187
  t.is(typeof sold[option.id].profit_return, 'number') // 0
  t.is(typeof sold[option.id].option_type_id, 'number') // 3
  t.is(typeof sold[option.id].site_id, 'number') // 1
  t.is(typeof sold[option.id].is_demo, 'boolean') // true
  t.is(typeof sold[option.id].user_balance_id, 'number') // 42836753
  t.is(typeof sold[option.id].client_platform_id, 'number') // 82
  // t.is(typeof sold[option.id].re_track, ?) // null
  t.is(typeof sold[option.id].buyback_state, 'string') // 'sold' or 'canceled'
  t.is(typeof sold[option.id].buyback_time, 'number') // 1659117989

  await broker.disconnect()
})

tape('open option but no selling', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()

  // used to track all options and positions using events
  const options = []
  const positions = []

  // first you will receive this event about a new option
  broker.on('option', function (data) {
    // this "data" object it would be the same as the one returned with send('binary-options.open-option', ...)
    // so no real need to track them but it could be useful

    // tracking all 'option'
    const index = options.findIndex(opt => data.id === opt.id)
    if (index === -1) options.push(data)
    else options[index] = data
  })

  // almost instantly you will receive this event with the current positition
  // also, when the option is finished it will emit another event with the final position in his closed state
  broker.on('position-changed', function (data) {
    // you can get this same "data" object while is open using send('portfolio.get-positions', ...)
    // but to get the final closed position you need to track it

    // tracking all 'position-changed'
    const index = positions.findIndex(pos => data.id === pos.id)
    if (index === -1) positions.push(data)
    else positions[index] = data
  })

  const option = await broker.send('binary-options.open-option', {
    user_balance_id: broker.balances[1].id,
    active_id: 76,
    option_type_id: 3,
    direction: 'call',
    expired: 1,
    price: 5,
    returnMessage: true
  })

  if (option.message) {
    throw new Error(option.message)
  }

  t.is(typeof option.id, 'number')
  t.ok(options.findIndex(opt => opt.id === option.id) > -1)

  // you can also get all the current positions and find them using option.id
  const portfolio = await broker.send('portfolio.get-positions', { user_balance_id: broker.balances[1].id, instrument_types: ['turbo-option'], returnMessage: true })
  t.ok(portfolio.positions.find(position => option.id === position.raw_event.binary_options_option_changed1.option_id))

  // also, we can track 'position-changed' as explained above
  while (true) {
    const position = positions.find(pos => option.id === pos.raw_event.binary_options_option_changed1.option_id)
    if (position.status === 'closed') {
      break
    }
    await sleep(1000)
  }

  await broker.disconnect()
})

tape('assets', async function (t) {
  const assets = Broker.assets()
  t.ok(Array.isArray(assets))
  t.is(assets[1].name, 'EUR/GBP')

  const asset1 = Broker.assets('EUR/USD (OTC)')
  t.is(asset1.active_id, 76)

  const asset2 = Broker.assets(76)
  t.is(asset2.name, 'EUR/USD (OTC)')
})

tape('subscribe', async function (t) {
  const broker = new Broker({
    ssid: process.env.SSID
  })

  await broker.connect()
  await broker.subscribe('candle-generated', { active_id: 76, size: 1 })

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

  await broker.subscribe('candle-generated', { active_id: 76, size: 1 })

  const tick1 = await waitForEvent('candle-generated', broker)
  t.is(typeof tick1, 'object')

  await broker.unsubscribe('candle-generated', { active_id: 76, size: 1 })

  // at this point we should not be receiving updates
  count = 0
  await sleep(3000)
  t.is(count, 0)

  // resuscribe
  await broker.subscribe('candle-generated', { active_id: 76, size: 1 })

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
