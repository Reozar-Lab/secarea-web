```markdown
# 匿境 · Secarea (CEC Archive)

本项目为《匿境》IP 官方网站及核心档案系统。项目采用全栈 Serverless 架构，包含主站社交系统（发现流、用户体系、管理中枢）以及通过跨域嵌入的 Quartz Wiki 百科系统。

## 1. 技术栈与架构

- 前端：原生 HTML + Tailwind CSS (CDN) + 原生 JavaScript。
- 后端：Cloudflare Workers（入口文件分发，`src/` 目录分模块处理）。
- 数据库：Cloudflare D1 (Serverless SQLite)。
- 静态托管：Cloudflare Workers Assets 或 Pages。
- Wiki 子系统：Quartz v5，独立部署于子域名，通过 iframe 与 postMessage 与主站进行跨域联动。

## 2. 目录结构

```text
secarea-web/
├── worker.js              # 后端入口：负责解析 URL、分发请求、路径重写
├── wrangler.toml          # 部署与环境变量配置
├── src/                   # 后端核心业务逻辑
│   ├── utils.js           # 工具与统一鉴权拦截器
│   ├── auth.js            # 认证、账号安全、管理员权限
│   ├── forum.js           # 发现流、帖子、评论、公共统计
│   └── wiki.js            # 对接 GitHub 读写、分类、历史记录
└── public/                # 前端静态资源
    ├── assets/            # 静态文件 (图标、字体)
    ├── css/               # 样式拆分 (theme, components, layout, pages)
    ├── js/                # 脚本拆分 (ui, api, layout)
    └── index/             # 所有 HTML 页面 (login, forum, wiki 等)
```

3. 环境变量配置

在 Cloudflare Workers 设置中配置以下变量：

· 普通变量 (Vars): BASE_URL, BETTER_AUTH_SECRET, GITHUB_REPO
· 敏感密钥 (Secrets): GITHUB_TOKEN, PAGES_DEPLOY_HOOK, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY

4. 数据库初始化 (D1)

请在 D1 控制台依次建表：users, sessions, otp_codes, posts, comments, likes, favorites, follows, reports, comment_reports, settings, wiki_files, wiki_history。

注意：wiki_history 的 created_at 字段类型必须为 INTEGER，用于存储毫秒时间戳。

5. 核心开发与修改规范

为了保持代码结构的清晰，后续开发请严格遵循以下规范：

5.1 后端路由扩展

1. 确定接口归属：认证模块放 src/auth.js，帖子模块放 src/forum.js，Wiki 模块放 src/wiki.js。
2. 在对应的 handleXxx 函数中编写路由判断：if (url.pathname === '/api/xxx' && method === 'POST')。
3. 统一使用 jsonResp 返回数据。
4. 若需新增独立模块（如私信），请新建 src/message.js，编写 handleMessage 函数，并在 worker.js 中引入并分配路由。

5.2 接口鉴权与权限拦截

在 src/utils.js 中已封装统一鉴权函数 verifyAuth。任何需要保护的后端接口，请在函数首行调用：

```javascript
import { verifyAuth, jsonResp } from './utils.js';

// 示例：仅允许编辑、管理员和超级管理员访问，且自动拦截被封禁用户
if (url.pathname === '/api/forum/create-post' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const currentUser = auth.user; 
    // 继续业务逻辑
}
```

5.3 前端网络请求

所有网络请求统一收拢在 public/js/api.js 中。禁止在 HTML 文件内直接编写原生 fetch，请将请求方法封装至 api.js 后再调用。

5.4 前端全局提示

统一使用 public/js/ui.js 提供的提示组件，调用方式为：showToast('提示内容', 'success')。参数可选 success、error、info。

5.5 样式与暗黑模式维护

项目针对 Tailwind 的暗黑模式采用了特定的覆盖策略：

· 严禁删除 pages.css 中的覆盖规则（如 html.dark .bg-white），这是保证全站暗黑模式正常生效的基础。
· 新增页面时，常规元素直接使用 bg-white、text-black 等 Tailwind 原生类名即可，pages.css 会自动完成暗黑模式的映射。

5.6 页面路由访问

所有 HTML 页面必须放置在 public/index/ 目录及其子目录下。worker.js 中已配置路径重写规则，访问 /about/ 时系统会自动映射至 /index/about/ 下的文件。若新增顶级路由，请同步更新 worker.js 中的路径重写逻辑。

6. 核心文件与方法说明

以下为项目核心自定义文件的功能及方法说明：

后端入口

worker.js

· export default { async fetch(request, env, ctx) }：后端入口函数。负责解析请求，将 API 请求分发给对应的 src/ 模块，并对静态资源路径进行重写。

后端核心模块 (src/)

src/utils.js

· getCurrentUser(request, env)：通过 Cookie 查询数据库，返回当前登录用户的信息。
· jsonResp(obj, status)：快捷封装 JSON 格式的 HTTP 响应。
· verifyAuth(request, env, allowedRoles)：统一鉴权拦截器。校验登录状态、封禁状态及角色权限。

src/auth.js

· handleAuth(request, env, url)：处理认证与账号安全路由（发送验证码、注册、登录、重置密码、登出、修改密码、更改邮箱、注销账号）。
· 同时负责 /api/admin/* 路由（查用户、改用户状态、查举报、删帖、改阈值）。

src/forum.js

· handleForum(request, env, url)：处理发现流与用户主页路由（用户公开信息、关注、贡献列表、发帖、点赞、收藏、评论、举报）。
· 包含 /api/stats 接口，查询 D1 返回全站动态统计数据。

src/wiki.js

· handleWiki(request, env, url, ctx)：处理 Wiki 路由。包含调用 GitHub API 拉取/保存词条（同步写入 D1 历史记录与文件索引）、获取分类列表、新建分类。

前端全局脚本 (public/js/)

public/js/ui.js

· showToast(message, type)：全局轻量级弹窗提示组件。

public/js/api.js

· API.*：封装了全部前后端交互请求，按模块划分为认证、管理员、用户、帖子及统计数据获取。

public/js/layout.js

· initLayout()：页面初始化核心函数。负责注入全局顶栏、侧边栏、加载动画。
· updateThemeIcons()：根据当前主题切换明暗模式的图标。
· 包含滚动事件监听，以及处理与 Wiki iframe 之间的跨域 postMessage 同步（主题、滚动、路径）。

7. 本地开发与部署

1. 安装 Wrangler: npm i -g wrangler
2. 登录 Cloudflare: npx wrangler login
3. 配置 wrangler.toml 和所有 Secrets 密钥。
4. 推送到 GitHub 绑定 Pages 自动构建，或使用 npx wrangler deploy 直接发布 Worker。

8. 已知痛点与排错指南

· 中文乱码：前端与后端交互涉及中文路径时，需严格使用 encodeURIComponent() 和 decodeURIComponent() 进行处理。
· GitHub API 频控：拉取失败可能是 Token 过期或触发限流，请检查 Token 状态或考虑引入缓存机制。
· 移动端键盘遮挡：编辑器已使用 100dvh 和 safe-area-inset-bottom 适配，若出现异常，请检查 CSS 高度设置。

9. 版权声明

© 2026 Reozar Lab. CC-BY-SA 4.0

```
```