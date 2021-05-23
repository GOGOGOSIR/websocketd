interface SocketOptionsInterface {
  onopenCallback?: ((ev: Event) => void) | null
  oncloseCallback?: ((ev: CloseEvent) => void) | null
  onmessageCallback?: ((ev: MessageEvent) => void) | null
  onerrorCallback?: ((ev: Event) => void) | null
  heartbeatMsg?: string
  heartbeatDelay?: number
  closeReconnection?: boolean
  maxReconnectCount?: number
}

interface SocketInterface {
  isMaxReconnectCount: boolean
  sendMessage: (msg: any) => void
  closeSocket: () => void
}

const defaultSocketOptions = {
  heartbeatMsg: 'ping',
  heartbeatDelay: 15000,
  closeReconnection: true,
  maxReconnectCount: 10
}

export default class Socket implements SocketInterface {
  private ws: WebSocket | null = null
  private socketUrl = ''
  private options: SocketOptionsInterface = defaultSocketOptions
  private heartbeatTimer: number | null = null
  private msgQueueTimer: number | null = null
  private closeReconnection = defaultSocketOptions.closeReconnection
  private maxReconnectCount = defaultSocketOptions.maxReconnectCount
  private reconnectCount = 0
  public isMaxReconnectCount = false

  constructor(socketUrl: string, options?: SocketOptionsInterface) {
    this.socketUrl = socketUrl
    this.options = options ? {
      ...defaultSocketOptions,
      ...options
    } : defaultSocketOptions
    if (typeof this.options.closeReconnection !== 'undefined') {
      this.closeReconnection = this.options.closeReconnection
    }
    if (typeof this.options.maxReconnectCount !== 'undefined') {
      this.maxReconnectCount = this.options.maxReconnectCount
    }
    this.createSocket(socketUrl, this.options)
  }

  // 创建socket
  private createSocket(socketUrl: string, options: SocketOptionsInterface) {
    if (!socketUrl) {
      throw new Error("请传入socket url")
    }
    try {
      if (this.ws) {
        console.log('已存在了一个socket实例，请不要重复创建')
        return
      }
      if (this.reconnectCount >= this.maxReconnectCount) {
        console.log('你达到重连的上限次数，服务将自动关闭')
        return
      }
      const ws = new WebSocket(socketUrl)
      ws.onopen = (ev: Event) => {
        this.handleSocketOpen(ev, options)
      }
      ws.onclose = (ev: CloseEvent) => {
        this.handleSocketClose(ev, options)
      }
      ws.onmessage = (ev: MessageEvent) => {
        this.handleSocketMessage(ev, options)
      }
      ws.onerror = (ev: Event) => {
        this.handleSocketError(ev, options)
      }
      this.ws = ws
    } catch (e) {
      console.log('初始化socket失败', e)
    }
  }

  // socket连接成功时的处理函数
  private handleSocketOpen(ev: Event, options: SocketOptionsInterface) {
    console.log('socket 连接成功')
    const { onopenCallback } = options
    const heartbeatMsg = options.heartbeatMsg || 'ping'
    const heartbeatDelay = options.heartbeatDelay || 15000
    onopenCallback && onopenCallback(ev)
    this.heartbeatStart(heartbeatMsg, heartbeatDelay)
  }

  // 连接关闭后的回调函数
  private handleSocketClose(ev: CloseEvent, options: SocketOptionsInterface) {
    console.log('socket 已被关闭')
    const { oncloseCallback } = options
    oncloseCallback && oncloseCallback(ev)
    // 保持服务长连接
    if (this.closeReconnection) {
      if (this.reconnectCount < this.maxReconnectCount) {
        this.isMaxReconnectCount = false
        this.reconnectionSocket()
      } else {
        console.log('close:已超过最大重连次数')
        this.isMaxReconnectCount = true
      }
    }
  }

  // 收到服务器数据后的回调函数
  private handleSocketMessage(ev: MessageEvent, options: SocketOptionsInterface) {
    const { onmessageCallback } = options
    onmessageCallback && onmessageCallback(ev)
    console.log('服务端响应的数据：', ev.data)
  }

  // 报错时的回调函数
  private handleSocketError(ev: Event, options: SocketOptionsInterface) {
    const { onerrorCallback } = options
    onerrorCallback && onerrorCallback(ev)
    console.log('socket错误：', ev)
    if (this.reconnectCount < this.maxReconnectCount) {
      // 重连
      this.isMaxReconnectCount = false
      this.reconnectionSocket()
    } else {
      console.log('error:已超过最大重连次数')
      this.isMaxReconnectCount = true
    }
  }

  // 心跳
  private heartbeatStart(msg: string, delay: number) {
    this.clearHeartBeat()
    this.sendMessage(msg)
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage(msg)
    }, delay)
  }

  // 清除心跳
  private clearHeartBeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // 清除消息队列定时器
  private clearMsgQueue() {
    if (this.msgQueueTimer) {
      clearTimeout(this.msgQueueTimer)
      this.msgQueueTimer = null
    }
  }

  // 清除定时器
  private clearTimer() {
    this.clearHeartBeat()
    this.clearMsgQueue()
  }

  // 重置socket服务
  private resetSocketServer() {
    if (!this.ws) {
      this.clearTimer()
      return
    }
    const readyState = this.ws.readyState
    if (readyState !== WebSocket.CLOSED) {
      this.ws.close()
    }
    this.clearTimer()
    this.ws = null
  }

  // socket重连
  private reconnectionSocket() {
    console.log('socket服务正在重连...')
    // 先重置上一个服务
    this.reconnectCount++
    this.resetSocketServer()
    this.createSocket(this.socketUrl, this.options)
  }

  // 如果在调用 sendMessage (通过socket实例直接访问) 时，如果socket还在连接中，则将这条消息推入队列中稍后发送
  private handleMsgQueue(msg: string) {
    this.clearMsgQueue()
    this.msgQueueTimer = setTimeout(() => {
      if (!this.ws) {
        return
      }
      const readyState = this.ws.readyState
      if (readyState === WebSocket.CONNECTING) {
        this.handleMsgQueue(msg)
      } else if (readyState === WebSocket.OPEN) {
        this.ws.send(msg)
      }
    }, 1000)
  }

  // 给服务端发送数据
  public sendMessage(msg: any): void {
    if (!this.ws) {
      return
    }
    const readyState = this.ws.readyState
    if (typeof msg === 'object') {
      msg = JSON.stringify(msg)
    } else {
      msg = msg.toString()
    }
    if (readyState === WebSocket.CONNECTING) {
      this.handleMsgQueue(msg)
    } else if ((readyState === WebSocket.OPEN)) {
      this.ws.send(msg)
    } else {
      console.log('服务已关闭，请稍后发送数据...')
    }
  }

  // 提供实例手动调用关闭
  public closeSocket(): void {
    this.resetSocketServer()
  }
}
