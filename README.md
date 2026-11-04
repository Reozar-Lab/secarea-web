
```markdown
# 匿境 · Secarea (CEC Archive)

本项目为《匿境》IP 官方网站及核心档案系统。项目采用全栈 Serverless 架构，包含主站社交系统（发现流、用户体系、管理中枢）以及通过跨域嵌入的 Quartz Wiki 百科系统。

## 1. 技术栈与架构

项目主要由以下三部分组成：
*   **主站前端**：原生 HTML + Tailwind CSS (CDN) + 原生 JavaScript。
*   **主站后端**：Cloudflare Workers（作为 API 网关与业务逻辑层）。
*   **主站数据库**：Cloudflare D1 (Serverless SQLite)。
*   **静态托管**：Cloudflare Workers Assets 或 Pages。
*   **Wiki 子系统**：基于 Quartz v5，独立部署于 `wiki.secarea.de5.net`，通过 iframe 与主站进行跨域通信。
*   **外部编辑器代理**：独立部署的 Worker (`secarea-wiki-edit`)，用于通过 Git 协议代理外部编辑器（如 Spck）对 Wiki 仓库的读写操作。

## 2. 目录结构

```text
secarea-web/
├── worker.js              # 后端入口：解析 URL、分发请求、路径重写
├── wrangler.toml          # 部署与环境变量配置
├── src/                   # 后端核心业务逻辑
│   ├── utils.js           # 工具与统一鉴权拦截器 (verifyAuth)
│   ├── auth.js            # 认证、账号安全、管理员权限
│   ├── forum.js           # 发现流、帖子、评论、公共统计
│   └── wiki.js            # 对接 GitHub 读写、分类操作
└── public/                # 前端静态资源
    ├── assets/            # 静态文件 (图标、字体)
    ├── css/               # 样式拆分 (theme, components, layout, pages)
    ├── js/                # 脚本拆分 (ui, api, layout)
    └── index/             # 所有 HTML 页面 (login, forum, wiki 等)
```

3. 环境变量配置

在 Cloudflare Workers 设置中配置：

· 普通变量 (Vars)：BASE_URL, BETTER_AUTH_SECRET, GITHUB_REPO
· 敏感密钥 (Secrets)：GITHUB_TOKEN, PAGES_DEPLOY_HOOK, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY

4. 数据库初始化 (D1)

请在 D1 控制台依次建表：users, sessions, otp_codes, posts, comments, likes, favorites, follows, reports, comment_reports, settings, wiki_files, wiki_history, external_tokens。

注意：wiki_history 的 created_at 字段类型必须为 INTEGER，用于存储毫秒时间戳。

5. 核心开发与修改规范

5.1 后端路由扩展

1. 确定接口归属：认证模块放 src/auth.js，帖子模块放 src/forum.js，Wiki 模块放 src/wiki.js。
2. 在对应的 handleXxx 函数中编写路由判断，并统一使用 jsonResp 返回数据。

5.2 接口鉴权与权限拦截

在 src/utils.js 中已封装统一鉴权函数 verifyAuth。任何需要保护的后端接口，请在函数首行调用：

```javascript
import { verifyAuth, jsonResp } from './utils.js';

// 示例：拦截被封禁用户，并校验角色权限
if (url.pathname === '/api/forum/create-post' && method === 'POST') {
    const auth = await verifyAuth(request, env, ['editor', 'admin', 'root']);
    if (auth.error) return jsonResp({ error: auth.error }, auth.status);
    
    const currentUser = auth.user; 
    // 继续业务逻辑
}
```

被封禁用户仅可浏览只读内容，所有写操作均会被 verifyAuth 拦截。

5.3 前端网络请求与提示

所有网络请求统一收拢在 public/js/api.js 中。禁止在 HTML 文件内直接编写原生 fetch。
全局提示统一使用 public/js/ui.js 提供的 showToast('提示内容', 'success')。

5.4 样式与暗黑模式维护

项目针对 Tailwind 的暗黑模式采用了特定的全局覆盖策略：

· 严禁删除 pages.css 中的覆盖规则（如 html.dark .bg-white），这是保证全站暗黑模式正常生效的基础。
· 新增页面时，常规元素直接使用 bg-white、text-black 等 Tailwind 原生类名，pages.css 会自动完成映射。

5.5 页面路由访问

所有 HTML 页面必须放置在 public/index/ 目录及其子目录下。worker.js 中已配置路径重写规则，访问 /about/ 时系统会自动映射至 /index/about/ 下的文件。

6. 核心文件与方法说明

后端入口

worker.js

· export default { async fetch(request, env, ctx) }：后端入口函数。负责解析请求，将 API 请求分发给对应的 src/ 模块，并对静态资源路径进行重写。

后端核心模块 (src/)

src/utils.js

· getCurrentUser(request, env)：通过 Cookie 查询数据库，返回当前登录用户的信息。
· jsonResp(obj, status)：快捷封装 JSON 格式的 HTTP 响应。
· verifyAuth(request, env, allowedRoles)：统一鉴权拦截器。校验登录状态、封禁状态及角色权限。

src/auth.js

· handleAuth(request, env, url)：处理认证、账号安全及 /api/admin/* 路由。

src/forum.js

· handleForum(request, env, url)：处理发现流、用户主页路由及 /api/stats 统计数据接口。

src/wiki.js

· handleWiki(request, env, url, ctx)：处理 Wiki 路由，包含调用 GitHub API 拉取/保存词条、获取分类列表、新建分类。保存词条时同步写入 D1 历史记录与文件索引。

前端全局脚本 (public/js/)

public/js/ui.js

· showToast(message, type)：全局轻量级弹窗提示组件。

public/js/api.js

· API.*：封装全部前后端交互请求。

public/js/layout.js

· initLayout()：页面初始化核心函数。负责注入全局顶栏、侧边栏、加载动画。
· updateThemeIcons()：根据当前主题切换明暗模式的图标。
· 处理与 Wiki iframe 之间的跨域 postMessage 同步（主题、滚动、路径）。

7. 外部编辑器代理说明 (已知痛点)

为支持手机端专业 Markdown 编辑器（如 Spck）进行长文本创作，项目独立部署了 secarea-wiki-edit Worker 作为 Git 协议代理。

现状与妥协说明：

1. 全量拉取：由于 Git 协议的限制，Spck 克隆时默认拉取仓库全量文件（包含 Quartz 源码）。
2. 统计未闭环：代理端虽然能通过 D1 验证 Token，但由于 Git Push 采用二进制压缩包传输，Worker 端无法精确解析出具体修改了哪些文件。因此，通过 Spck 的外部编辑操作，目前不会自动写入个人贡献统计。
3. 安全建议：请勿将站外编辑 Token 分发给未经授权的人员。目前的外部编辑通道属于半成品状态，仅建议项目核心维护者自用。

8. 部署与开发

1. 安装 Wrangler: npm i -g wrangler
2. 登录 Cloudflare: npx wrangler login
3. 配置 wrangler.toml 和所有 Secrets 密钥。
4. 推送到 GitHub 绑定 Pages 自动构建，或使用 npx wrangler deploy 直接发布 Worker。

9. 版权声明

© 2026 Reozar Lab. CC-BY-SA 4.0

```
```