# 微信公众号开发

## 1. 使用

根目录新建 wechat.dev.config.js, 填入微信公众号的以下信息:

```js
module.exports = {
  appID: '',
  appsecret: '',
  token: '',
  access_token: '',
  // 配置 js-sdk
  ticket: '',  // jsapi_ticket
  nonceStr: '', // 必填，生成签名的随机串
}
```