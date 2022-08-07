/* eslint-disable camelcase */

const fetch = require('like-fetch')
const setCookie = require('set-cookie-parser')
const WebSocket = require('ws')
const { EventEmitter } = require('events')
const assets = require('./assets.json')

module.exports = class Broker extends EventEmitter {
  constructor (opts = {}) {
    super()

    this.email = opts.email
    this.password = opts.password
    this.ssid = opts.ssid || null

    this.userAgent = opts.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'

    this.ws = null
    this.timestamp = 0
    this.requestId = 0

    this.trading = {
      expiration: null,
      profits: {
        'turbo-option': {},
        'binary-option': {}
      }
    }

    this._onopen = this._onopen.bind(this)
    this._onmessage = this._onmessage.bind(this)
    this._onclose = this._onclose.bind(this)
    this._onerror = this._onerror.bind(this)
  }

  static assets (query) {
    // assets.json is outdated but still useful
    if (!query) return assets
    if (typeof query === 'number') {
      return assets.find(a => a.active_id === query)
    }
    return assets.find(a => a.name === query)
  }

  localTime () {
    return Math.floor((Date.now() - this.timestamp) / 1000)
  }

  randomRequestId () {
    const secondsNow = Math.floor(Date.now() / 1000)
    const randId = Math.random().toString().slice(2, 11)
    return secondsNow + '_' + randId
  }

  async login () {
    if (!this.email || !this.password) {
      throw new Error('Can not login without email and password')
    }

    const res = await fetch('https://auth.iqoption.com/api/v2/login', {
      method: 'POST',
      headers: {
        Origin: 'https://login.iqoption.com',
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifier: this.email,
        password: this.password
      })
    })

    const headerSetCookie = res.headers.get('set-cookie')
    const splitCookieHeaders = setCookie.splitCookiesString(headerSetCookie)
    const cookies = setCookie.parse(splitCookieHeaders)

    const cookie = cookies.find(c => c.name === 'ssid')
    this.ssid = cookie.value

    return this.ssid
  }

  async connect (opts = {}) {
    await this.disconnect()

    this.timestamp = Date.now() - randomNumber(4000, 6000)
    this.requestId = 0
    this.profile = null
    this.client = null
    this.balances = null

    this.ws = new WebSocket('wss://ws.iqoption.com/echo/websocket', {
      origin: 'https://iqoption.com',
      headers: {
        'User-Agent': this.userAgent
      }
    })

    this.ws.json = data => this.ws.send(JSON.stringify(data))

    this.ws.on('open', this._onopen)
    this.ws.on('message', this._onmessage)
    this.ws.on('close', this._onclose)
    this.ws.on('error', this._onerror)

    await waitForWebSocket(this.ws)

    await this.send('authenticate', { ssid: this.ssid, returnMessage: true })
    await this.send('setOptions', { returnResult: false })

    if (opts.minimal) return

    // get profile and user data
    await this.subscribe('profile-changed', { returnResult: false })
    this.profile = (await this.send('core.get-profile', { returnMessage: true })).result
    this.client = await this.send('get-user-profile-client', { returnMessage: true })

    // watch and get balances
    for (const name of ['internal-billing.auth-balance-changed', 'internal-billing.balance-changed']) {
      await this.subscribe(name, { returnResult: false })
    }
    await this.send('get-balances', { returnMessage: true })

    // watch orders changes
    for (const instrument_type of [/* 'forex', 'cfd', 'crypto', 'digital-option', */'turbo', 'binary']) {
      await this.subscribe('portfolio.order-changed', { instrument_type, returnResult: true })
    }

    // watch positions changes
    for (const instrument_type of [/* 'forex', 'cfd', 'crypto', 'digital-option', */'turbo-option', 'binary-option']) {
      for (const balance of this.balances) {
        await this.subscribe('portfolio.position-changed', { instrument_type, user_balance_id: balance.id, returnResult: true })
      }
    }

    // watch and get commissions
    for (const instrument_type of [/* 'forex', 'cfd', 'crypto', 'digital-option', */'turbo-option', 'binary-option']) {
      await this.subscribe('commission-changed', { instrument_type, returnResult: false })
      await this.send('get-commissions', { instrument_type, returnMessage: true })
    }

    await this.subscribe('positions-state', { returnResult: true })
  }

  async disconnect () {
    // readyState:
    // 0 CONNECTING  Socket has been created. The connection is not yet open.
    // 1 OPEN  The connection is open and ready to communicate.
    // 2 CLOSING The connection is in the process of closing.
    // 3 CLOSED  The connection is closed or couldn't be opened.

    if (this.ws) {
      // + if state is zero I should wait to close it

      this.ws.removeListener('open', this._onopen)
      this.ws.removeListener('message', this._onmessage)
      this.ws.removeListener('close', this._onclose)
      this.ws.removeListener('error', this._onerror)

      if (this.ws.readyState === 1) {
        this.ws.close()
        // + await for close event?
      }
    }
  }

  _onopen () {
  }

  _onmessage (msg) {
    const data = JSON.parse(msg)
    this.emit('all', data)

    if (data.name === 'authenticated') {
      // this.emit('authenticated', data)
      return
    }

    if (data.name === 'front') {
      // data => { name: 'front', msg: 'ws20a.ws.prod.wz-ams.quadcode.cloud', session_id: '14110986837246788262' }
      // this.emit('front', data)
      return
    }

    if (data.name === 'additional-blocks') {
      return
    }

    if (data.name === 'profile') {
      return
    }

    if (data.name === 'user-profile-client') {
      return
    }

    if (data.name === 'traders-mood') {
      return
    }

    if (data.name === 'timeSync') {
      const date = new Date(data.msg)
      // const time = Math.round(date.getTime() / 1000)

      // useful for sending trading operations
      let expiration = new Date(date.getTime())
      expiration.setMinutes(date.getMinutes() + 1)
      expiration.setSeconds(0, 0, 0)
      if (date.getSeconds() > 30) {
        expiration.setMinutes(date.getMinutes() + 2)
      }
      expiration = Math.round(expiration.getTime() / 1000)
      this.trading.expiration = expiration

      this.emit('timeSync', data)
      return
    }

    if (data.name === 'heartbeat') {
      this.send('heartbeat', {
        userTime: new Date().getTime().toString(),
        heartbeatTime: data.msg.toString()
      })

      this.emit('heartbeat', data)
      return
    }

    if (data.name === 'commissions') {
      const instrument_type = data.msg.instrument_type

      if (instrument_type === 'turbo-option' || instrument_type === 'binary-option') {
        for (const item of data.msg.items) {
          this.trading.profits[instrument_type][item.active_id] = 100 - item.value
          this.emit('commissions', { instrument_type, active_id: item.active_id, value: item.value })
        }
      }

      return
    }

    if (data.name === 'commission-changed') {
      const instrument_type = data.msg.instrument_type

      if (instrument_type === 'turbo-option' || instrument_type === 'binary-option') {
        this.trading.profits[instrument_type][data.msg.active_id] = 100 - data.msg.commission.value
        this.emit('commission-changed', { instrument_type, active_id: data.msg.active_id, value: data.msg.commission.value })
      }

      return
    }

    if (data.name === 'balances') {
      this.balances = data.msg
      this.emit('balances', data.msg)
      return
    }

    if (data.name === 'balance-changed') {
      if (!this.balances) this.balances = []

      const newBalance = data.msg.current_balance
      const myBalance = this.balances.find(balance => balance.id === newBalance.id)
      if (!myBalance) {
        this.balances.push(newBalance)
      } else {
        myBalance.amount = newBalance.new_amount // newBalance.amount
        myBalance.enrolled_amount = newBalance.enrolled_amount
        // myBalance.is_marginal = newBalance.is_marginal
      }

      this.emit('balance-changed', data.msg)
      return
    }

    if (data.name === 'option') {
      this.emit('option', data.msg)
      // return
    }

    if (data.name === 'sold-options') {
      this.emit('sold-options', data.msg)
      // return
    }

    if (data.name === 'position-changed') {
      // automatic subscribe to positions for 60s
      /* if (data.msg.status === 'open') {
        this.send('subscribe-positions', { id: data.msg.id })
      } */

      // + should fetch positions
      this.emit('position-changed', data.msg)
      // return
    }

    if (data.name === 'subscription') {
      // data.msg => { subscription_id: 7667553768430597000, expires_at: 1659062692, expires_in: 60 }
      this.emit('subscription', data.msg)
      // return
    }

    if (data.name === 'positions-state') {
      this.emit('positions-state', data.msg)
      // return
    }

    if (data.name === 'orders') {
      // this.emit('orders', data.msg)
      return
    }

    if (data.name === 'positions') {
      // this.emit('positions', data.msg)
      return
    }

    if (data.name === 'candle-generated') {
      // + should use an iterator so it's easier to use
      this.emit('candle-generated', data.msg)
      return
    }

    if (data.name !== 'result') {
      this.emit('message', data)
    }
  }

  _onclose () {
    // console.log('close')
    this.emit('close')
  }

  _onerror (error) {
    this.emit('error', error)
  }

  send (name, opts = {}) {
    const data = {
      name: 'sendMessage',
      request_id: null,
      local_time: this.localTime(),
      msg: {}
    }

    this._handleCreateMessage(name, data, opts)

    data.request_id = this.newRequestId(false, data.request_id)

    // console.log('send()', data)
    this.ws.json(data)

    return this.waitForRequestId(data.request_id, {
      returnResult: opts.returnResult,
      returnMessage: opts.returnMessage
    })
  }

  _handleCreateMessage (name, data, opts) {
    const { msg } = data

    if (typeof name === 'object') {
      data.msg = name
      return
    }

    if (name === 'authenticate') {
      data.name = name
      data.request_id = opts.requestId || this.randomRequestId()
      msg.ssid = opts.ssid
      msg.protocol = 3
      msg.session_id = ''
      msg.client_session_id = ''
      return
    }

    if (name === 'get-additional-blocks') {
      msg.name = name
      msg.version = '1.0'
      return
    }

    if (name === 'setOptions') {
      data.name = name
      data.request_id = opts.requestId || this.randomRequestId()
      msg.sendResults = true
      return
    }

    if (name === 'heartbeat') {
      data.name = name
      msg.userTime = opts.userTime
      msg.heartbeatTime = opts.heartbeatTime
      return
    }

    if (name === 'core.get-profile') {
      msg.name = name
      msg.version = '1.0'
      msg.body = {}
      return
    }

    if (name === 'get-balances') {
      msg.name = name
      msg.version = '1.0'
      msg.body = {
        types_ids: [1, 4, 2],
        tournaments_statuses_ids: [3, 2]
      }
      return
    }

    if (name === 'get-user-profile-client') {
      msg.name = name
      msg.version = '1.0'
      msg.body = {
        user_id: this.profile.user_id
      }
      return
    }

    if (name === 'get-commissions') {
      msg.name = name
      msg.version = '1.0'
      msg.body = {
        instrument_type: opts.instrument_type, // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo-option' or 'binary-option' (?)
        user_group_id: this.profile.group_id
      }
      return
    }

    if (name === 'get-traders-mood') {
      msg.name = name
      msg.version = '1.0'
      msg.body = {
        instrument: opts.instrument, // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo-option' or 'binary-option'
        asset_id: opts.asset_id
      }
      return
    }

    if (name === 'get-verification-init-data') {
      msg.name = name
      msg.version = '2.0'
      return
    }

    if (name === 'tech-instruments.get-standard-library') {
      msg.name = name
      msg.version = '3.0'
      msg.body = {
        version: 4657112160311,
        runtime_version: 109
      }
      return
    }

    if (name === 'get-initialization-data') {
      msg.name = name
      msg.version = '3.0'
      msg.body = {}
      return
    }

    if (name === 'update-user-availability') {
      msg.name = name
      msg.version = '1.1'
      msg.body = {
        platform_id: opts.platform_id || '9',
        idle_duration: opts.idle_duration || 0, // 0, 5, 25, etc
        selected_asset_id: opts.selected_asset_id || 816,
        selected_asset_type: opts.selected_asset_type || 3
      }
      return
    }

    if (name === 'portfolio.get-orders') {
      msg.name = name
      msg.version = '2.0'
      msg.body = {
        user_balance_id: opts.user_balance_id,
        kind: 'deferred'
      }
      return
    }

    if (name === 'binary-options.open-option') {
      const expired = opts.expired < 1000000000 ? this.trading.expiration + ((opts.expired - 1) * 60) : opts.expired
      const value = parseInt((opts.value || 0).toString().replace('.', ''), 10)

      let instrument_type
      if (opts.option_type_id === 1) {
        instrument_type = 'binary-option'
      } else if (opts.option_type_id === 3) {
        instrument_type = 'turbo-option'
      } else {
        throw new Error('Invalid option_type_id (binary-option is 1 and turbo-option is 3)')
      }

      msg.name = name
      msg.version = '1.0'
      msg.body = {
        user_balance_id: opts.user_balance_id,
        active_id: opts.active_id,
        option_type_id: opts.option_type_id, // 'binary-option' is 1, and 'turbo-option' is 3
        direction: opts.direction, // 'call' or 'put'
        expired,
        refund_value: 0,
        price: opts.price, // amount to invest
        value, // asset price without decimal point, ie. bitcoin 23844132000
        profit_percent: opts.profit_percent || this.trading.profits[instrument_type][opts.active_id] // ie. 85
      }
      return
    }

    if (name === 'sell-options') {
      msg.name = name
      msg.version = '3.0'
      msg.body = {
        options_ids: opts.options_ids || [opts.id]
      }
      return
    }

    if (name === 'subscribe-positions') {
      msg.name = name
      msg.version = '1.0'
      msg.body = {
        frequency: 'frequent',
        ids: opts.ids || [opts.id]
      }
      return
    }

    if (name === 'portfolio.get-positions') {
      msg.name = name
      msg.version = '4.0'
      msg.body = {
        offset: opts.offset === undefined ? 0 : opts.offset,
        limit: opts.limit === undefined ? 30 : opts.limit,
        user_balance_id: opts.user_balance_id,
        instrument_types: opts.instrument_types || [opts.instrument_type] // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo-option' or 'binary-option'
      }
      return
    }

    throw new Error('Message name invalid (' + name + ')')
  }

  subscribe (name, opts = {}) {
    const data = {
      name: 'subscribeMessage',
      request_id: null,
      local_time: this.localTime(),
      msg: {}
    }

    this._handleCreateSubscription(name, data, opts)

    data.request_id = this.newRequestId(true, data.request_id)

    // console.log('subscribe()', data)
    this.ws.json(data)

    return this.waitForRequestId(data.request_id, {
      returnResult: opts.returnResult === undefined ? true : opts.returnResult
    })
  }

  unsubscribe (name, opts = {}) {
    const data = {
      name: 'unsubscribeMessage',
      request_id: null,
      local_time: this.localTime(),
      msg: {}
    }

    this._handleCreateSubscription(name, data, opts)

    data.request_id = this.newRequestId(true, data.request_id)

    // console.log('unsubscribe()', data)
    this.ws.json(data)

    return this.waitForRequestId(data.request_id, {
      returnResult: opts.returnResult === undefined ? true : opts.returnResult
    })
  }

  _handleCreateSubscription (name, data, opts) {
    const { msg } = data

    if (typeof name === 'object') {
      data.msg = name
      return
    }

    if (name === 'profile-changed') {
      msg.name = name
      msg.version = '1.0'
      return
    }

    if (name === 'candle-generated') {
      msg.name = name
      msg.params = {
        routingFilters: {
          active_id: opts.active_id,
          size: opts.size
        }
      }
      return
    }

    if (name === 'internal-billing.balance-created' || name === 'internal-billing.auth-balance-changed' || name === 'internal-billing.balance-changed' || name === 'internal-billing.marginal-changed') {
      msg.name = name
      msg.version = '1.0'
      msg.params = {
        routingFilters: {}
      }
      return
    }

    if (name === 'commission-changed') {
      msg.name = name
      msg.version = '1.0'
      msg.params = {
        routingFilters: {
          instrument_type: opts.instrument_type, // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo-option' or 'binary-option'
          user_group_id: this.profile.group_id
        }
      }
      return
    }

    if (name === 'portfolio.order-changed') {
      msg.name = name
      msg.version = '2.0'
      msg.params = {
        routingFilters: {
          user_id: this.profile.user_id,
          instrument_type: opts.instrument_type // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo' or 'binary'
        }
      }
      return
    }

    if (name === 'portfolio.position-changed') {
      msg.name = name
      msg.version = '3.0'
      msg.params = {
        routingFilters: {
          user_id: this.profile.user_id,
          user_balance_id: opts.user_balance_id,
          instrument_type: opts.instrument_type // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo-option' or 'binary-option'
        }
      }
      return
    }

    if (name === 'positions-state') {
      msg.name = name
      return
    }

    if (name === 'price-splitter.client-buyback-generated') {
      msg.name = name
      msg.version = '1.0'
      msg.params = {
        routingFilters: {
          asset_id: opts.asset_id,
          instrument_type: opts.instrument_type,
          user_group_id: this.profile.group_id
        }
      }
      return
    }

    if (name === 'traders-mood-changed') {
      msg.name = name
      msg.params = {
        routingFilters: {
          instrument: opts.instrument, // 'forex', 'cfd', 'crypto', 'digital-option', 'turbo-option' or 'binary-option'
          asset_id: opts.asset_id
        }
      }
      return
    }

    throw new Error('Subscription name invalid (' + name + ')')
  }

  newRequestId (isSubscription, customRequestId) {
    if (!customRequestId) {
      customRequestId = (isSubscription ? 's_' : '') + this.requestId++
    }
    return customRequestId.toString()
  }

  // waitForRequestId(id) // by default it will do nothing to avoid leaks on messages that doesn't have an output
  // waitForRequestId(id, { returnResult: true }) // will only wait and return the "result" (success bool)
  // waitForRequestId(id, { returnMessage: true }) // will only wait and return the "message" (output asked by the send())
  // waitForRequestId(id, { returnResult: true, returnMessage: true }) // will wait and return both datas (also the requestId)
  waitForRequestId (id, opts = {}) {
    return new Promise((resolve, reject) => {
      const returnResult = opts.returnResult === undefined ? false : opts.returnResult
      const returnMessage = opts.returnMessage === undefined ? false : opts.returnMessage
      const output = { requestId: id, result: null, message: null }

      if (!returnResult && !returnMessage) {
        resolve()
        return
      }

      const onMessage = (data) => {
        if (id !== data.request_id) return

        if (data.name === 'result') {
          output.result = data.msg

          if (returnResult && !returnMessage) {
            this.removeListener('all', onMessage)
            resolve(output.result)
          }

          return
        }

        output.message = data.msg

        if (returnMessage) {
          this.removeListener('all', onMessage)
          resolve(output.message)
        } else if (output.result && output.message) {
          this.removeListener('all', onMessage)
          resolve(output)
        }
      }

      this.on('all', onMessage)
    })
  }
}

function waitForWebSocket (ws) {
  return new Promise(function (resolve, reject) {
    ws.on('open', onopen)
    ws.on('error', done)

    function onopen () {
      done(null)
    }

    function done (err) {
      ws.removeListener('open', onopen)
      ws.removeListener('error', done)

      if (err) reject(err)
      else resolve()
    }
  })
}

function randomNumber (min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min)
}
