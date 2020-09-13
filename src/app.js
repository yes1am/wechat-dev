const express = require('express');
const path = require('path')
const app = express();
const chrrio = require('cheerio');
const rp = require('request-promise');
const fs = require('fs')
const sha1 = require('sha1');
const bodyParser = require('body-parser')
const xml2js = require('xml2js');
const { 
  appID,
  appsecret,
  token,
  access_token,
  ticket,
  nonceStr
} = require('../wechat.dev.config');

app.use(express.static(__dirname + '/static'))

//设置模板文件文件夹
app.set('views', path.resolve(__dirname, './views'))
//设置视图模板后缀名为 .html, 使用 res.render('xx') 来代替 res.render("xx.html")
app.set('view engine', 'html');
//注册 ejs 模板的后缀为 .html
app.engine('.html', require('ejs').__express);

// 当接收到xml消息后，用xml2js解析xml,根据Event和MsgType做事件类型的判断，并做相应的处理，最后，res.send(xml)发送数据的时候也是要一个xml格式的数据
const parser = new xml2js.Parser({ trim: true, explicitArray: false, explicitRoot: false });
const builder = new xml2js.Builder({ headless: true, cdata: true, explicitRoot: false, rootName: 'xml' });

// 接口: GET https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
const getAccessToken = () => {
  rp({
    uri: `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appID}&secret=${appsecret}`,
    json: true
  }).then(res => {
    console.log('返回值', res);
  }).catch(err => {
    console.log('请求 accessToken 失败', err);
  })
}
// 获取 access_token
// getAccessToken()

const createMenu = () => {
  rp({
    method: 'POST',
    uri: `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${access_token}`,
    body: {
      "button":[
        {
          "type":"view",
          "name":"测试环境",
          "url": `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appID}&redirect_uri=http://8e6649f77089.ngrok.io/chat&response_type=code&scope=snsapi_userinfo&state=STATE#wechat_redirect`
        },
        {
          "type":"view",
          "name":"百度",
          "url": "https://www.baidu.com"
        },
      ]
    },
    json: true
  }).then(res => {
    console.log('创建菜单', res)
  })
}
// 创建菜单
// createMenu();

app.use(bodyParser.json())

app.get('/wx', function (req, res) {
  const querys = req.query || {};
  const { signature, timestamp, nonce, echostr } = querys;
  const list = [token, timestamp, nonce];
  const shaResult = sha1(list.sort().join(''));
  
  if (shaResult === signature) {
    res.send(echostr);
  } else {
    res.send('验证失败');
  }
})

const msgHandler = (msgbufer) => {
  return new Promise((resolve, reject) => {
    parser.parseString(msgbufer.toString(), async (err, result) => {
      if (err) {
        reject({
          code: -1,
          msg: 'error',
          data: err,
        });
      }
      const baseData = {
        ToUserName: result.FromUserName,
        FromUserName: result.ToUserName,
        CreateTime: Date.now(),
      }

      console.log('result.MsgType', result)

      switch (result.MsgType) {
        case 'text':
          switch (result.Content.toLowerCase()) {
            case 'help':
              // 返回帮助内容
              const helpTxt = [
                '1. bug bug go away',
              ]
              const data = {
                MsgType: 'text',
                Content: helpTxt.join('\n'),
                ...baseData
              };
              resolve(builder.buildObject(data));
              break;
            default:
              break;
          }
          break;
        case 'event':
          if (result.Event === 'subscribe') {
            // 关注
            const data = Object.assign({
              MsgType: 'news',
              ArticleCount: 1,
              Articles: {
                item: {
                  Title: '关注我',
                  Description: '关注我的描述',
                  PicUrl: '',
                  Url: '点击的链接',
                },
              },
            }, baseData);

            resolve(builder.buildObject(data));
          } else if (result.Event === 'unsubscribe') {
            // 取消关注
            const data = Object.assign({
              MsgType: 'text',
              Content: '再见啦',
            }, baseData);
            resolve(builder.buildObject(data));
          }
          resolve('');
          break;
        default:
          resolve('');
          break;
      }
    });
  });
}

// 处理用户信息
app.post('/wx', function (req, res) {
  var buffer = [];
  req.on('data', function (data) {
    buffer.push(data);
  });
  req.on('end', async function () {
    try {
      const r = await msgHandler(buffer);
      console.log('send Data:', r);
      res.send(r);
    } catch (error) {
      console.log('公众号消息事件Error:', error);
      res.send('error');
    }
  });
})

app.get('/chat', async function (req, res) {
  const { code } = req.query;  // 得到 code 和上面的 state 参数

  // 获取网页授权的 access_token, 不是上面的 access_token
  const accessTokenRes = await rp({
    uri: `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appID}&secret=${appsecret}&code=${code}&grant_type=authorization_code`,
    json: true
  })
  if(!accessTokenRes || !accessTokenRes.access_token) {
    res.send('获取 access token 错误')
  }
  const { access_token: inner_access_token, openid, refresh_token } = accessTokenRes;

  // 获取用户信息
  const userInfoRes = await rp({
    uri: `https://api.weixin.qq.com/sns/userinfo?access_token=${inner_access_token}&openid=${openid}&lang=zh_CN`,
    json: true
  })

  if(!userInfoRes || !userInfoRes.nickname) {
    res.send('获取用户信息错误')
  }
  const { nickname, city, province } = userInfoRes;

  let newTicket = '';
  if(!ticket) {
    const jsApiticketRes = await rp({
      uri: `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${access_token}&type=jsapi`,
      json: true
    })
    newTicket = jsApiticketRes.ticket;
  } else {
    newTicket = ticket;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const url = `http://8e6649f77089.ngrok.io/chat?code=${code}&state=STATE`;
  const signature = sha1(`jsapi_ticket=${newTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`)

  res.render('index', {
    nickname,
    signature,
    nonceStr,
    timestamp,
    appID
  })
})

app.listen(8082, function () {
  console.log(`app listening on port 8082!`);
})
