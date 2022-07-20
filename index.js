const fetch = require('isomorphic-fetch')
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
    this.authenticate = null
    this.timestamp = Date.now() - randomNumber(4000, 6000)
    this.requestId = 0
    this.authenticated = new Promise((resolve, reject) => {
      this._authenticatedResolve = resolve
      this._authenticatedReject = reject
    })

    this.trading = {
      expire: null
    }
  }

  static assets (query) {
    // assets.json is outdated but still useful
    if (!query) return assets
    return assets.find(a => a.active_id === query)
  }

  localTime () {
    return Math.floor((Date.now() - this.timestamp) / 1000)
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

  async connect () {
    // reset variables related to websocket to allow reconnect
    // + reuse code
    this.authenticate = null
    this.timestamp = Date.now() - randomNumber(4000, 6000)
    this.requestId = 0
    this.authenticated = new Promise((resolve, reject) => {
      this._authenticatedResolve = resolve
      this._authenticatedReject = reject
    })

    this.ws = new WebSocket('wss://ws.iqoption.com/echo/websocket', {
      origin: 'https://iqoption.com',
      headers: {
        'User-Agent': this.userAgent
      }
    })

    this.ws.json = data => this.ws.send(JSON.stringify(data))

    this.ws.on('open', this._onopen.bind(this))
    this.ws.on('message', this._onmessage.bind(this))
    this.ws.on('close', this._onclose.bind(this))

    const secondsNow = Math.floor(Date.now() / 1000)
    const randId = Math.random().toString().slice(2, 11)

    this.authenticate = {
      name: 'authenticate',
      request_id: secondsNow + '_' + randId,
      local_time: this.localTime(),
      msg: {
        ssid: this.ssid,
        protocol: 3,
        session_id: '',
        client_session_id: ''
      }
    }

    await this.authenticated
  }

  async disconnect () {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.close()
    }
  }

  _onopen () {
    this.ws.json(this.authenticate)
  }

  _onmessage (msg) {
    const data = JSON.parse(msg)
    this.emit('message', data)

    // + should add timeout for this message
    if (data.name === 'authenticated' && data.request_id === this.authenticate.request_id) {
      if (!data.msg) {
        // + this code block is not tested
        this._authenticatedReject()
        throw new Error('Wrong auth')
      }
      this._authenticatedResolve()
      return
    }

    if (data.name === 'front') {
      // data => { name: 'front', msg: 'ws20a.ws.prod.wz-ams.quadcode.cloud', session_id: '14110986837246788262' }
      return
    }

    if (data.name === 'timeSync') {
      const date = new Date(data.msg)
      // const time = Math.round(date.getTime() / 1000)

      // useful for sending trading operations
      let expired = new Date(date.getTime())
      expired.setMinutes(date.getMinutes() + 1)
      expired.setSeconds(0, 0, 0)
      if (date.getSeconds() > 30) {
        expired.setMinutes(date.getMinutes() + 2)
      }
      expired = Math.round(expired.getTime() / 1000)
      this.trading.expired = expired

      this.emit('timeSync')
      return
    }

    if (data.name === 'heartbeat') {
      this.ws.json({
        name: 'heartbeat',
        local_time: this.localTime(),
        msg: {
          userTime: new Date().getTime().toString(),
          heartbeatTime: data.msg.toString()
        }
      })

      this.emit('heartbeat') // + pass time diff?
      return
    }

    if (data.name === 'candle-generated' && data.microserviceName === 'quotes') {
      // + should use an iterator so it's easier to use
      this.emit('candle-generated', data.msg)
      return
    }

    // console.log(data)
    return null // to avoid "no-useless-return" above
  }

  _onclose () {
  }

  // + this subscribe/unsubscribe could be highly improved, also should support for more operations
  async subscribe (opts = {}) {
    const activeId = opts.activeId || 76
    const size = opts.size || 1

    this.ws.json({
      name: 'subscribeMessage',
      // request_id: 's_' + this.requestId++,
      local_time: this.localTime(),
      msg: {
        name: 'candle-generated',
        params: {
          routingFilters: {
            active_id: activeId,
            size
          }
        }
      }
    })

    // + track request_id and wait for the result
  }

  async unsubscribe (opts = {}) {
    const activeId = opts.activeId || 76
    const size = opts.size || 1

    this.ws.json({
      name: 'unsubscribeMessage',
      // request_id: 's_206',
      local_time: this.localTime(),
      msg: {
        name: 'candle-generated',
        params: {
          routingFilters: {
            active_id: activeId,
            size
          }
        }
      }
    })

    // + track request_id and wait for the result
  }
}

function randomNumber (min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min) + min)
}
