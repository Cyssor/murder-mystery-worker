# 剧本杀自动房间 - Cloudflare Pages 版

这个目录是备用部署方案：前端走 Cloudflare Pages 静态托管，房间数据走 Pages Functions + D1。

## Cloudflare Pages 设置

在 Cloudflare Pages 里连接 GitHub 仓库时这样填：

- Root directory: `pages-version`
- Build command: `npm run build`
- Build output directory: `public`
- Functions directory: `functions`
- Node version: 默认即可

## D1 绑定

先创建一个 D1 数据库，例如 `murder_mystery_room_db`。

然后进入 Pages 项目：

1. Settings
2. Functions
3. D1 database bindings
4. Add binding
5. Variable name 填：`DB`
6. D1 database 选择你刚创建的数据库

绑定名称必须是 `DB`，代码里就是按这个名字读取房间数据的。

## D1 建表

创建 D1 数据库后，在 Cloudflare 控制台的 D1 控制台执行 `schema.sql`。

也可以用 Wrangler：

```powershell
npx wrangler d1 execute 你的数据库名 --file=./schema.sql
```

## 本地开发

`wrangler.local.toml` 只是本地测试用的配置。正式 Pages 部署不要手动上传这个文件，也不用在 Cloudflare 里填写它。
