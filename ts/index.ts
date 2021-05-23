import Socket from './socket';

const ws = new Socket('ws://localhost:9547/', { closeReconnection: true });
console.log('>>>>>>>')
let i = 1
let t: number | null = null
t = setInterval(() => {
  // if (i % 5 === 0) {
  //   console.log('客户端手动关闭socket')
  //   ws.closeSocket()
  // }
  if (ws.isMaxReconnectCount) {
    t && clearInterval(t)
    t = null
    console.log('客户端停止向服务端发送消息')
    return
  }
  ws.sendMessage(`客户端发送的消息${i}`)
  i++
  console.log('send mock data')
}, 1000)



