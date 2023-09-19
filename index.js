const Koa = require("koa");
const Router = require("koa-router");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const fs = require("fs");
const path = require("path");
const { init: initDB, Counter } = require("./db");

const router = new Router();

const homePage = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");

let transWorker = new TransWorker()
//APPID，APISecret，APIKey在https://console.xfyun.cn/services/cbm这里获取
const APPID = '6015d7f0'
const API_SECRET = 'ZWQ3ZTVmZGFmZmE4ZTIzZGJjNzJlN2Q3'
const API_KEY = '45ec366167ba190909c776cc42a13484'


var total_res = "";

function getWebsocketUrl() {
  return new Promise((resolve, reject) => {
    var apiKey = API_KEY
    var apiSecret = API_SECRET
    var url = 'ws://spark-api.xf-yun.com/v2.1/chat'
    var host = location.host
    var date = new Date().toGMTString()
    var algorithm = 'hmac-sha256'
    var headers = 'host date request-line'
    var signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v1.1/chat HTTP/1.1`
    var signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret)
    var signature = CryptoJS.enc.Base64.stringify(signatureSha)
    var authorizationOrigin = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`
    var authorization = btoa(authorizationOrigin)
    url = `${url}?authorization=${authorization}&date=${date}&host=${host}`
    resolve(url)
  })
}

class TTSRecorder {
  constructor({
                appId = APPID
              } = {}) {
    this.appId = appId
    this.status = 'init'
    this.Content = ''; // 初始化为空字符串
  }

  // 修改状态
  setStatus(status) {
    this.onWillStatusChange && this.onWillStatusChange(this.status, status)
    this.status = status
  }

  // 连接websocket
  connectWebSocket() {
    this.setStatus('ttsing')
    return getWebsocketUrl().then(url => {
      let ttsWS
      if ('WebSocket' in window) {
        ttsWS = new WebSocket(url)
      } else if ('MozWebSocket' in window) {
        ttsWS = new MozWebSocket(url)
      } else {
        alert('浏览器不支持WebSocket')
        return
      }
      this.ttsWS = ttsWS
      ttsWS.onopen = e => {
        this.webSocketSend()
      }
      ttsWS.onmessage = e => {
        this.result(e.data)
      }
      ttsWS.onerror = e => {
        clearTimeout(this.playTimeout)
        this.setStatus('error')
        alert('WebSocket报错，请f12查看详情')
        console.error(`详情查看：${encodeURI(url.replace('wss:', 'https:'))}`)
      }
      ttsWS.onclose = e => {
        console.log(e)
      }
    })
  }


  // websocket发送数据
  webSocketSend() {
    var params = {
      "header": {
        "app_id": this.appId,
        "uid": "fd3f47e4-d"
      },
      "parameter": {
        "chat": {
          "domain": "generalv2",
          "temperature": 0.5,
          "max_tokens": 1024
        }
      },
      "payload": {
        "message": {
          "text": [
            {
              "role": "user",
              "content": "中国第一个皇帝是谁？"
            },
            {
              "role": "assistant",
              "content": "秦始皇"
            },
            {
              "role": "user",
              "content": "秦始皇修的长城吗"
            },
            {
              "role": "assistant",
              "content": "是的"
            },
            {
              "role": "user",
              "content": $('#input_text').text()
            }
          ]
        }
      }
    }
    console.log(JSON.stringify(params))
    this.ttsWS.send(JSON.stringify(params))
  }

  start() {
    total_res = ""; // 请空回答历史
    this.connectWebSocket()
  }

  // websocket接收数据的处理
  result(resultData) {
    let jsonData = JSON.parse(resultData)
    total_res = total_res + resultData
    this.Content = total_res; // 更新Content属性
    $('#output_text').val(this.Content);
    // console.log(resultData)
    // 提问失败
    if (jsonData.header.code !== 0) {
      alert(`提问失败: ${jsonData.header.code}:${jsonData.header.message}`)
      console.error(`${jsonData.header.code}:${jsonData.header.message}`)
      return
    }
    if (jsonData.header.code === 0 && jsonData.header.status === 2) {
      this.ttsWS.close()
      bigModel.setStatus("init")
    }
  }
}

// ======================开始调用=============================
var vConsole = new VConsole()
let bigModel = new TTSRecorder()
bigModel.onWillStatusChange = function (oldStatus, status) {
  // 可以在这里进行页面中一些交互逻辑处理：按钮交互等
  // 按钮中的文字
  let btnState = {
    init: '立即提问',
    ttsing: '回答中...'
  }
  $('.audio-ctrl-btn')
      .removeClass(oldStatus)
      .addClass(status)
      .text(btnState[status])
}

$('.audio-ctrl-btn').click(function () {
  if (['init', 'endPlay', 'errorTTS'].indexOf(bigModel.status) > -1) {
    bigModel.start()
  }
})

$("#input_text").on('input propertychange', function () {
  $('#input_text').text(this.value)
  // console.log($("#input_text").text())
});




// 首页
router.get("/", async (ctx) => {
  ctx.body = homePage;
});

// 一个用户发什么消息，就反弹什么消息的消息回复功能
router.post('/message/post', async ctx => {
  const { ToUserName, FromUserName, Content, CreateTime } = ctx.request.body;
  bigModel.start()

  ctx.body = {
    ToUserName: FromUserName,
    FromUserName: ToUserName,
    CreateTime: +new Date(),
    MsgType: 'text',
    // Content: `东旭AI管家：${Content}`,
    Content: `东旭AI管家：${bigModel.Content}`,
  };
});


// 更新计数
router.post("/api/count", async (ctx) => {
  const { request } = ctx;
  const { action } = request.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }

  ctx.body = {
    code: 0,
    data: await Counter.count(),
  };
});

// 获取计数
router.get("/api/count", async (ctx) => {
  const result = await Counter.count();

  ctx.body = {
    code: 0,
    data: result,
  };
});

// 小程序调用，获取微信 Open ID
router.get("/api/wx_openid", async (ctx) => {
  if (ctx.request.headers["x-wx-source"]) {
    ctx.body = ctx.request.headers["x-wx-openid"];
  }
});

const app = new Koa();
app
  .use(logger())
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

const port = process.env.PORT || 80;
async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}
bootstrap();

