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
  access_token
} = require('./wechat.dev.config');

app.use(express.static(__dirname + '/static'))

// 当接收到xml消息后，用xml2js解析xml,根据Event和MsgType做事件类型的判断，并做相应的处理，最后，res.send(xml)发送数据的时候也是要一个xml格式的数据
const parser = new xml2js.Parser({ trim: true, explicitArray: false, explicitRoot: false });
const builder = new xml2js.Builder({ headless: true, cdata: true, explicitRoot: false, rootName: 'xml' });

// 请求获取 access_token 接口: GET https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET

const createMenu = () => {
  rp({
    method: 'POST',
    uri: `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${access_token}`,
    body: {
      "button":[
        {	
          "type":"click",
          "name":"今日歌曲1",
          "key":"V1001_TODAY_MUSIC"
        },
        {
          "name":"菜单1",
          "sub_button":[
            {	
              "type":"view",
              "name":"搜索",
              "url":"http://www.soso.com/"
            },
            {
              "type":"click",
              "name":"赞一下我们",
              "key":"V1001_GOOD"
            }
          ]
        }
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

app.listen(80, function () {
  console.log(`app listening on port 80!`);
})
