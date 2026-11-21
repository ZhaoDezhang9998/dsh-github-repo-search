# dsh-github-repo-search

[![Open Plugin Market](https://img.shields.io/endpoint?url=https%3A%2F%2Fdshopen.org%2Fbadge%2Fdsh-github-repo-search.json%3Flang%3Den)](https://dshopen.org/plugins/dsh-github-repo-search/)

让智能体直接检索 GitHub，而不是凭记忆编。你说「搜一下漫剧相关的开源项目」，它真的去查，带星标、语言、许可证、最近推送和链接回来；结果还会落到右侧栏面板，可以回看、收藏、并排对比。

## 为什么装这个

模型不知道 GitHub 上**现在**有什么。它不知道某个项目存不存在、还在不在维护、有没有人提过同样的需求。以下是它答不上来、但这个插件能查的：

| 你的问题 | 走哪个工具 |
| --- | --- |
| 有没有现成的漫剧创作 skill？ | `github_search_repos` |
| 这个方向最近在火什么？ | `github_trending` |
| 这个库还能用吗、多久没更新了？ | `github_repo` |
| 这个功能有人实现过吗？ | `github_search_code` |
| 这个 bug 是不是已知的？ | `github_search_issues` |

搜索结果按关键词分组进面板，**翻页**能看到第 1000 条以内的全部结果。

## 六个工具

| 工具 | 作用 |
| --- | --- |
| `github_search_repos` | 检索仓库。支持 `language:` `stars:>500` `topic:llm` `pushed:>2026-01-01` 等全部 GitHub 限定词，可排序、可翻页 |
| `github_trending` | 近期活跃的热门仓库。GitHub 无公开 trending API，用「最近推送 + 星标」推导，输出里会注明 |
| `github_search_code` | 搜代码内容。找某个 API 的真实用法、某个函数有没有实现。需登录 |
| `github_search_issues` | 搜 issue 与 PR。判断需求是否已有人提、bug 是否已知、项目多活跃 |
| `github_repo` | 读单个仓库：元信息、语言构成、最新 Release、README。接受 `owner/name`、URL、`…/tree/main` |
| `github_rate` | 查配额，模型据此决定省不省着用 |

## 侧边栏面板

会话头部右上角的放大镜（左侧栏底部也有入口）打开右侧栏面板：

- **仓库** — 本次会话搜过的仓库，按关键词分组；点卡片展开语言构成、Release、README
- **代码** — 命中的文件路径，点击直达 GitHub
- **议题** — issue/PR 列表，带 open/closed 与评论数
- **收藏** — 星标标记的仓库，跨会话保留
- **对比** — 挑 2–3 个候选并排比星标、语言、许可证、最近推送、Fork、归档状态

支持按星标／最近／名称重排，列表里可一键复制仓库名或 `git clone` 命令。

面板是**只读回看**，不发起搜索——检索由对话驱动，面板负责让你翻查刚才搜到了什么。

## 安装

```bash
dsh plugin --profile <你的 profile> add dsh-github-repo-search
```

也可以在 DSH 里 **Plugins → 添加插件** 选本目录。装完重启，在新会话里直接说人话即可。

## 配额

| 接口 | 匿名 | 带 token |
| --- | --- | --- |
| core（`github_repo` / `github_rate`） | 60 次/小时 | 5000 次/小时 |
| search（仓库 / 议题） | 10 次/小时 | 30 次/分钟 |
| code search | **必须登录** | 10 次/分钟 |

**强烈建议配 token**：匿名状态下搜索只有 10 次/小时，且代码搜索完全不可用。

token 从 **DSH 密钥库**读取，优先级 `GITHUB_TOKEN` → `GH_TOKEN` → `DSH_GITHUB_TOKEN`；密钥库没有时回落到进程环境变量。每次请求重新解析，存完立即生效、无需重启。

存法一：DSH 设置页 → 模型/凭据，添加名为 `GITHUB_TOKEN` 的密钥。

存法二：写 `~/.dsh/.credentials.yaml` 的 `refs`：

```yaml
version: 1
refs:
  GITHUB_TOKEN: ghp_xxx
```

## 配置

`cordis.patch.yml`：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `apiBase` | `https://api.github.com` | GitHub Enterprise 换自己的地址 |
| `maxResults` | `30` | 单次返回条数（1–100） |
| `maxReadmeChars` | `8000` | README 截断字符数 |
| `timeoutMs` | `20000` | 单次请求超时 |
| `trustedHosts` | `[]` | 除 github.com / api.github.com 外，额外允许接收 token 的主机 |

## 设计取舍

- **只读**：不写 GitHub、不登录、不调用 `gh`、不注册任何 `webServer` 路由。
- **凭据范围受控**：因为 `apiBase` 可配置，token 只发往 `github.com`、`api.github.com` 与你显式列入 `trustedHosts` 的主机，其余一律按匿名请求。
- **检索由对话驱动**：面板不内置搜索框。Web 端调用宿主能力需要 Typert 生成的 Remote 命名空间，第三方插件无法接入；对话检索更贴合实际用法。
- **短期缓存**：相同请求 60 秒内复用结果，并合并并发重复请求，避免模型重复调用撞配额。只缓存成功结果。

## 许可

MIT
