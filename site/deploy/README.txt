changle 部署包

deploy.cmd
  双击就会做两件事：
  1. 把联机服务器和 API 部署到 rooms.changle.ca（Cloudflare Worker + Durable Object）
  2. 把网站更新到 changle.ca（Cloudflare Pages 项目 changle）

set-email-key.cmd
  注册登录要发验证码邮件。在 Resend 拿到 API key 以后，双击它，粘贴 key 按回车。
  key 只保存在 Cloudflare 上，不会出现在这个文件夹里。

文件夹内容
  deploy.cmd          部署脚本
  set-email-key.cmd   保存发邮件的 key
  rooms\              联机服务器（已打包好的代码和配置）
  site\               网站文件
