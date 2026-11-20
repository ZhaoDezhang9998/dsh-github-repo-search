# dsh-github-repo-search

给 DeepSeek Harness 加一组 GitHub 仓库检索工具。你说「去 GitHub 上搜一下 SVG 编辑器，按 star 排序」，模型直接调工具拿结果，不用你手动开浏览器。

## 工具

| 工具 | 作用 |
| --- | --- |
| `github_search_repos` | 按关键词检索仓库，支持 GitHub 原生限定词（`language:python`、`stars:>500`、`topic:llm` 等），可选按 stars / forks / 最近更新排序 |
| `github_repo` | 读单个仓库：元信息、语言构成、最新 Release、README（默认读，按字符上限截断） |
| `github_rate` | 查当前配额，判断还能不能继续搜 |

返回内容都带仓库链接，结果按「外部数据」标注，不作为指令执行。

## 安装

安装：在 DSH 里 **Plugins → 添加插件** 选择本目录，或 `dsh plugin --profile <name> add dsh-github-repo-search`。装完在新会话里试：

> 去 GitHub 上搜一下 SVG 编辑器，按 star 排序

提示：`/search` 只索引仓库名、描述和 topics，中文关键词命中率低，用英文或项目原名更容易搜到（例如 `manju`、`short drama`）。

## 配额

- 匿名：60 次/小时/IP，其中 `/search` 只有 10 次/小时
- 带 token：5000 次/小时（`/search` 30 次/分钟）

`github_repo` 一次调用最多花 4 个请求（元信息 + 语言 + release + README），`readme: false` 可省一个。配额紧张时先用 `github_rate` 看剩多少。

token 从 **DSH 密钥库**读取，优先级 `GITHUB_TOKEN` → `GH_TOKEN` → `DSH_GITHUB_TOKEN`；密钥库里没有时才回落到进程环境变量。每次请求都重新解析，所以存完立刻生效、不用重启。不写进配置文件，避免明文进 patch。

存法一：DSH 设置页 → 模型/凭据，添加名为 `GITHUB_TOKEN` 的密钥。

存法二：直接写 `~/.dsh/.credentials.yaml` 的 `refs`：

```yaml
version: 1
refs:
  GITHUB_TOKEN: ghp_xxx      # 存完下一步请求就生效
```

## 配置

`cordis.patch.yml` 里可调：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `apiBase` | `https://api.github.com` | GitHub Enterprise 换成自己的地址 |
| `trustedHosts` | `[]` | 除 github.com / api.github.com 外，额外允许接收 token 的主机 |
| `maxResults` | `10` | 单次返回仓库数上限（1–100） |
| `maxReadmeChars` | `8000` | README 截断字符数 |
| `timeoutMs` | `20000` | 单次请求超时 |

## 说明

- 只做只读检索，不写 GitHub、不登录、不调用 `gh` 命令；只在设置了环境变量时把它作为 token 读走。
- 插件没有自己的界面，能力体现在工具列表和模型回答里。
- 卸载/停用插件包，三个工具立即消失。
