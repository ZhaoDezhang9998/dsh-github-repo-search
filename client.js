/**
 * GitHub 搜索结果面板（右侧栏）。
 *
 * 数据来源是 Host 侧的会话投影 `githubSearch`：`github_search_repos` /
 * `github_repo` / `github_rate` 每次调用都会往 `tool/result` 的 meta 里带一份
 * 结构化结果，Host 的投影单元把它折叠成 `{ queries, details, rate }`。
 *
 * 为什么在右侧栏：`sidebar.right.pane.tab` 是 session 作用域，标准 props 里带
 * `useProjection`；而 root 作用域的 `main` 面板拿不到会话投影。
 *
 * 面板只读：不发起搜索（Web 端调用 Host 需要 Typert 生成的 Remote 命名空间，
 * 第三方插件无法接入），也不写任何状态。搜索由对话驱动。
 *
 * 样式只用宿主真实存在的 `--dsw-alias-*` / `--dsw-radius-*` token，
 * 因此明暗主题自动跟随；不要写死颜色。
 */
window.__ModuleLoader__.load({
  id: 'dsh-github-repo-search',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useCallback, useMemo } = React

    const TAB_KIND = 'githubSearchPanel'
    const TAB_ID = 'dsh-github-repo-search/panel'

    /** 收藏与面板偏好存在浏览器本地：它们属于「我的使用习惯」，不进会话日志。 */
    const STORE_KEY = 'dsh-github-repo-search.v1'

    /** 读取本地偏好；storage 不可用或数据损坏时回落到默认值。 */
    function readStore() {
      const empty = { starred: [], tab: 'repos', sort: 'default', compare: [] }
      if (typeof localStorage === 'undefined') return empty
      try {
        const raw = localStorage.getItem(STORE_KEY)
        if (raw === null) return empty
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return empty
        return {
          starred: Array.isArray(parsed.starred) ? parsed.starred.filter(x => x && typeof x.fullName === 'string') : [],
          tab: typeof parsed.tab === 'string' ? parsed.tab : 'repos',
          sort: typeof parsed.sort === 'string' ? parsed.sort : 'default',
          compare: Array.isArray(parsed.compare) ? parsed.compare.filter(x => typeof x === 'string') : [],
        }
      } catch {
        return empty
      }
    }

    /** 写回本地偏好；失败不抛错（隐私模式等场景下静默降级为不持久化）。 */
    function writeStore(next) {
      if (typeof localStorage === 'undefined') return
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next))
      } catch {
        // 存不进就算了，面板功能不受影响。
      }
    }

    /** 空状态里给的示例，覆盖三类检索，让人一眼知道能问什么。 */
    const EXAMPLES = [
      '搜一下 SVG 编辑器，按 star 排序',
      '这个领域最近有什么活跃的项目',
      '这个库里 useProjection 是怎么实现的',
      '这个项目还有哪些没关的 bug',
    ]

    /** 排序键：默认保持 GitHub 返回顺序。 */
    const SORTS = [
      { id: 'default', label: '默认' },
      { id: 'stars', label: '星标' },
      { id: 'recent', label: '最近' },
      { id: 'name', label: '名称' },
    ]

    /** 按当前排序返回新数组，不改动原数组。 */
    function sortRepos(repos, sort) {
      const copy = repos.slice()
      if (sort === 'stars') copy.sort((a, b) => (b.stars || 0) - (a.stars || 0))
      else if (sort === 'recent') copy.sort((a, b) => String(b.pushedAt ?? '').localeCompare(String(a.pushedAt ?? '')))
      else if (sort === 'name') copy.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
      return copy
    }

    const css = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        font: 'inherit',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-base)',
      },
      // ── 顶部工具条：配额与条目数 ──
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 14px 8px',
        flex: 'none',
      },
      toolbarLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
      },
      count: {
        fontSize: 12,
        color: 'var(--dsw-alias-label-tertiary)',
        whiteSpace: 'nowrap',
      },
      tabs: {
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 12px 8px',
        flex: 'none',
      },
      body: {
        overflow: 'auto',
        flex: 1,
        minHeight: 0,
        padding: '0 10px 20px',
      },
      sortRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 12px 8px',
        flex: 'none',
      },
      sortLabel: {
        fontSize: 11,
        color: 'var(--dsw-alias-label-tertiary)',
        marginRight: 4,
      },
      row: {
        display: 'block',
        boxSizing: 'border-box',
        width: '100%',
        padding: '8px 10px',
        marginBottom: 6,
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'inherit',
        cursor: 'pointer',
        transition: 'background-color .12s ease',
      },

      // ── 空状态 ──
      empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '48px 20px',
        textAlign: 'center',
      },
      emptyIcon: { color: 'var(--dsw-alias-label-tertiary)', opacity: 0.55 },
      emptyTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
      },
      examples: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginTop: 6,
        width: '100%',
        maxWidth: 280,
      },
      example: {
        padding: '6px 10px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        fontSize: 11.5,
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-secondary)',
        textAlign: 'left',
      },
      emptyHint: {
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--dsw-alias-label-tertiary)',
        maxWidth: 260,
      },

      // ── 查询分组 ──
      group: { marginBottom: 18 },
      groupHead: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        padding: '0 4px',
        marginBottom: 8,
      },
      query: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      groupMeta: {
        flex: 'none',
        fontSize: 11,
        color: 'var(--dsw-alias-label-tertiary)',
        whiteSpace: 'nowrap',
      },

      // ── 仓库卡片 ──
      card: {
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        padding: '10px 12px',
        marginBottom: 8,
        borderRadius: 'var(--dsw-radius-lg)',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        transition: 'background-color .12s ease, border-color .12s ease',
      },
      cardOpen: {
        borderColor: 'var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      cardHead: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
      },
      cardName: {
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.45,
        wordBreak: 'break-word',
        color: 'var(--dsw-alias-label-primary)',
      },
      star: {
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--dsw-alias-state-warn-primary)',
        whiteSpace: 'nowrap',
      },
      chips: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 7,
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 11,
        lineHeight: 1.5,
        padding: '1px 7px',
        borderRadius: 'var(--dsw-radius-xs)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
      chipDim: {
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 11,
        lineHeight: 1.5,
        padding: '1px 7px',
        borderRadius: 'var(--dsw-radius-xs)',
        color: 'var(--dsw-alias-label-tertiary)',
        whiteSpace: 'nowrap',
      },
      desc: {
        marginTop: 8,
        fontSize: 12,
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },

      // ── 展开详情 ──
      detailBox: {
        margin: '0 0 8px',
        padding: '9px 12px 11px',
        borderRadius: '0 0 var(--dsw-radius-lg) var(--dsw-radius-lg)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderTop: 'none',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      detailWrap: {
        marginTop: 9,
        paddingTop: 9,
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      detailRow: {
        display: 'flex',
        gap: 8,
        fontSize: 12,
        lineHeight: 1.6,
        marginBottom: 3,
      },
      detailLabel: {
        flex: 'none',
        color: 'var(--dsw-alias-label-tertiary)',
        minWidth: 54,
      },
      detailValue: {
        color: 'var(--dsw-alias-label-secondary)',
        wordBreak: 'break-word',
        minWidth: 0,
      },
      link: {
        color: 'var(--dsw-alias-brand-primary)',
        textDecoration: 'none',
        wordBreak: 'break-all',
      },
      readmeBox: {
        marginTop: 8,
        padding: '9px 10px',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l1)',
        maxHeight: 240,
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--dsw-alias-label-secondary)',
      },
      pendingHint: {
        marginTop: 6,
        fontSize: 11.5,
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-tertiary)',
      },
    }

    /** 星标紧凑表示：1234 → 1.2k。 */
    function compact(n) {
      const value = Number(n) || 0
      if (value < 1000) return String(value)
      if (value < 10000) return `${(value / 1000).toFixed(1)}k`
      return `${Math.round(value / 10000) * 10}k`
    }

    /** 星形图标。 */
    function StarGlyph({ size }) {
      const s = size ?? 11
      return h('svg', {
        width: s, height: s, viewBox: '0 0 16 16',
        fill: 'currentColor', 'aria-hidden': true, style: { flex: 'none' },
      }, h('path', { d: 'M8 1.2l2.06 4.18 4.61.67-3.34 3.25.79 4.6L8 11.73l-4.12 2.17.79-4.6L1.33 6.05l4.61-.67z' }))
    }

    /**
     * 复制按钮：点一下写入剪贴板并短暂显示「已复制」。
     * 剪贴板不可用（非安全上下文等）时静默失败，不打断浏览。
     */
    function CopyButton({ text, label }) {
      const [done, setDone] = useState(false)
      const onClick = useCallback((event) => {
        event.stopPropagation()
        const mark = () => {
          setDone(true)
          setTimeout(() => { setDone(false) }, 1200)
        }
        try {
          if (navigator?.clipboard?.writeText !== undefined) {
            navigator.clipboard.writeText(text).then(mark, () => {})
          }
        } catch {
          // 剪贴板不可用时不提示，避免噪音。
        }
      }, [text])
      return h('button', {
        type: 'button',
        onClick,
        style: {
          padding: '1px 7px', border: '1px solid var(--dsw-alias-border-l1)',
          borderRadius: 'var(--dsw-radius-xs)', background: 'transparent',
          color: done ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-tertiary)',
          font: 'inherit', fontSize: 10.5, cursor: 'pointer',
        },
      }, done ? '已复制' : label)
    }

    /** 一条仓库卡片：标题行带收藏与加入对比。 */
    function RepoCard({ repo, detail, expanded, onToggle, starred, inCompare, onStar, onCompare }) {
      const chips = []
      if (repo.language !== null && repo.language !== undefined) chips.push({ text: repo.language, dim: false })
      if (repo.license !== null && repo.license !== undefined) chips.push({ text: repo.license, dim: false })
      if (repo.archived === true) chips.push({ text: '已归档', dim: true })
      if (repo.pushedAt !== null && repo.pushedAt !== undefined) {
        chips.push({ text: String(repo.pushedAt).slice(0, 10), dim: true })
      }

      const actionStyle = (active) => ({
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, padding: 0, flex: 'none',
        border: 'none', borderRadius: 'var(--dsw-radius-xs)',
        background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
        color: active ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-label-tertiary)',
        cursor: 'pointer', opacity: active ? 1 : 0.5,
      })

      return h('div', null,
        h('div', {
          style: expanded === true ? { ...css.card, ...css.cardOpen } : css.card,
          role: 'button',
          tabIndex: 0,
          'aria-expanded': expanded === true,
          onClick: () => { onToggle() },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle()
            }
          },
          onMouseEnter: (event) => {
            event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
          },
          onMouseLeave: (event) => {
            event.currentTarget.style.background = expanded === true
              ? 'var(--dsw-alias-bg-layer-2)'
              : 'var(--dsw-alias-bg-layer-1)'
          },
        },
        h('div', { style: css.cardHead },
          h('div', { style: css.cardName }, repo.fullName),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flex: 'none' } },
            h('span', { style: css.star }, h(StarGlyph, { size: 10 }), compact(repo.stars)),
            h('button', {
              type: 'button',
              title: starred ? '取消收藏' : '收藏',
              'aria-label': starred ? '取消收藏' : '收藏',
              'aria-pressed': starred,
              onClick: (event) => { event.stopPropagation(); onStar() },
              style: actionStyle(starred),
            }, h(StarGlyph, { size: 11 })),
            h('button', {
              type: 'button',
              title: inCompare ? '移出对比' : '加入对比',
              'aria-label': inCompare ? '移出对比' : '加入对比',
              'aria-pressed': inCompare,
              onClick: (event) => { event.stopPropagation(); onCompare() },
              style: {
                ...actionStyle(inCompare),
                color: inCompare ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-tertiary)',
                fontSize: 13, fontWeight: 700, lineHeight: 1,
              },
            }, inCompare ? '−' : '+'),
          ),
        ),
        chips.length === 0
          ? null
          : h('div', { style: css.chips }, ...chips.map((chip, index) =>
              h('span', { key: index, style: chip.dim ? css.chipDim : css.chip }, chip.text))),
        repo.description === null || repo.description === undefined
          ? null
          : h('div', { style: css.desc }, repo.description),
        ),

        expanded !== true
          ? null
          : h('div', { style: css.detailBox },
              h('div', { style: css.detailRow },
                h('div', { style: css.detailLabel }, '仓库'),
                h('div', { style: { ...css.detailValue, display: 'flex', flexDirection: 'column', gap: 4 } },
                  h('a', {
                    href: repo.url,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                    style: css.link,
                    onClick: event => event.stopPropagation(),
                  }, repo.url),
                  h('div', { style: { display: 'flex', gap: 6 } },
                    h(CopyButton, { text: repo.fullName, label: '复制名称' }),
                    h(CopyButton, { text: `git clone ${repo.url}.git`, label: '复制 clone' })))),
              detail === null || detail === undefined
                ? h('div', { style: css.pendingHint },
                    '还没有详情。让模型读一下这个仓库，这里会显示语言构成、最新 Release 和 README。')
                : h('div', null,
                    detail.languages === null || detail.languages === undefined
                      ? null
                      : h('div', { style: css.detailRow },
                          h('div', { style: css.detailLabel }, '语言'),
                          h('div', { style: css.detailValue }, detail.languages)),
                    detail.release === null || detail.release === undefined
                      ? null
                      : h('div', { style: css.detailRow },
                          h('div', { style: css.detailLabel }, 'Release'),
                          h('div', { style: css.detailValue }, detail.release)),
                    detail.readme === null || detail.readme === undefined
                      ? null
                      : h('div', { style: css.readmeBox }, detail.readme),
                  ),
            ),
      )
    }

    /** 对比视图：把 2–3 个候选仓库并排比较，用来做选型决定。 */
    function CompareView({ repos, onRemove, onClear }) {
      if (repos.length === 0) {
        return h('div', { style: css.empty },
          h('div', { style: css.emptyTitle }, '对比区是空的'),
          h('div', { style: css.emptyHint },
            '在仓库卡片上点「+」，把 2–3 个候选放进来，这里会并排列出星标、语言、许可证、最近推送和简介。'),
        )
      }
      const rows = [
        { label: '星标', value: r => compact(r.stars) },
        { label: '语言', value: r => r.language ?? '—' },
        { label: '许可证', value: r => r.license ?? '—' },
        { label: '最近推送', value: r => (r.pushedAt === null || r.pushedAt === undefined ? '—' : String(r.pushedAt).slice(0, 10)) },
        { label: 'Fork', value: r => compact(r.forks) },
        { label: '状态', value: r => (r.archived === true ? '已归档' : '活跃') },
      ]
      return h('div', null,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', marginBottom: 8 } },
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, `${repos.length} 个候选并排比较`),
          h('button', {
            type: 'button',
            onClick: onClear,
            style: {
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--dsw-alias-label-tertiary)', font: 'inherit', fontSize: 12,
              textDecoration: 'underline', padding: 0,
            },
          }, '清空'),
        ),
        h('div', { style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 } },
          ...repos.map(repo => h('div', {
            key: repo.fullName,
            style: {
              flex: '1 0 160px', minWidth: 160, boxSizing: 'border-box',
              padding: '9px 10px', borderRadius: 'var(--dsw-radius-md)',
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)',
            },
          },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 } },
            h('div', { style: { fontSize: 12, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.4 } }, repo.fullName),
            h('button', {
              type: 'button', title: '移出对比',
              onClick: () => { onRemove(repo.fullName) },
              style: {
                flex: 'none', width: 18, height: 18, padding: 0, border: 'none',
                borderRadius: 'var(--dsw-radius-xs)', background: 'transparent',
                color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer', fontSize: 13,
              },
            }, '×'),
          ),
          ...rows.map(row => h('div', { key: row.label, style: { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, marginTop: 5 } },
            h('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, row.label),
            h('span', { style: { color: 'var(--dsw-alias-label-secondary)', textAlign: 'right', wordBreak: 'break-word' } }, row.value(repo)),
          )),
          )),
        ),
      )
    }

    /** 分组标题行。 */
    function GroupHead({ query, meta }) {
      return h('div', { style: css.groupHead },
        h('div', { style: css.query, title: query }, query),
        h('div', { style: css.groupMeta }, meta),
      )
    }

    /** 标签按钮。 */
    function TabButton({ active, label, count, onClick }) {
      return h('button', {
        type: 'button',
        onClick,
        style: {
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', border: 'none',
          borderRadius: 'var(--dsw-radius-sm)',
          background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
          color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
          font: 'inherit', fontSize: 12,
          fontWeight: active ? 600 : 400,
          cursor: 'pointer',
        },
      },
      h('span', null, label),
      count > 0 ? h('span', { style: { fontSize: 10, opacity: 0.7 } }, count) : null,
      )
    }

    /** 代码命中项：文件名 + 目录 + 仓库名。 */
    function CodeRow({ hit }) {
      const parts = String(hit.path ?? '').split('/')
      const fileName = parts.length > 0 ? parts[parts.length - 1] : hit.path
      const dir = parts.slice(0, -1).join('/')
      return h('a', {
        href: hit.url,
        target: '_blank',
        rel: 'noreferrer noopener',
        style: { ...css.row, textDecoration: 'none' },
        onMouseEnter: e => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' },
        onMouseLeave: e => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)' },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 } },
          h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap' } }, fileName || hit.path),
          dir.length === 0 ? null : h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, dir),
        ),
        h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, hit.repo),
      )
    }

    /** 议题 / PR 行。 */
    function IssueRow({ issue }) {
      const kind = issue.isPullRequest ? 'PR' : 'Issue'
      const stateColor = issue.state === 'open'
        ? 'var(--dsw-alias-state-success-primary)'
        : 'var(--dsw-alias-label-tertiary)'
      return h('a', {
        href: issue.url,
        target: '_blank',
        rel: 'noreferrer noopener',
        style: { ...css.row, textDecoration: 'none' },
        onMouseEnter: e => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)' },
        onMouseLeave: e => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)' },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
          h('span', {
            style: {
              flex: 'none', fontSize: 10, lineHeight: 1.6, padding: '0 5px',
              borderRadius: 'var(--dsw-radius-xs)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-secondary)',
            },
          }, `${kind} #${issue.number}`),
          h('span', { style: { flex: 'none', fontSize: 10, color: stateColor } }, issue.state),
        ),
        h('div', { style: { fontSize: 12, lineHeight: 1.5, marginTop: 3, color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-word' } }, issue.title),
        h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
          `${issue.repo}${issue.comments > 0 ? ` · ${issue.comments} 评论` : ''}`),
      )
    }

    /**
     * 错误边界：面板组件一旦抛错，宿主只会留下一片空白，用户会以为插件没装上。
     * 这里把异常兜住并显示成可读的提示，同时把原始错误打到控制台备查。
     */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('[github-repo-search] panel crashed:', error)
      }

      render() {
        if (this.state.error !== null) {
          return h('div', { style: css.root },
            h('div', { style: css.body },
              h('div', { style: css.empty },
                h('div', { style: css.emptyTitle }, '面板渲染出错'),
                h('div', { style: css.emptyHint },
                  String(this.state.error?.message ?? this.state.error)),
                h('div', { style: css.emptyHint },
                  '数据可能还在：可先用 github_panel_status 工具确认，或强刷一次（Cmd+Shift+R）。'),
              ),
            ),
          )
        }
        return this.props.children
      }
    }

    /** 面板主体。 */
    function GitHubPanel(props) {
      const state = props.useProjection('githubSearch')
      const [openKey, setOpenKey] = useState(null)
      const initial = useMemo(readStore, [])
      const [starred, setStarred] = useState(initial.starred)
      const [compare, setCompare] = useState(initial.compare)
      const [tab, setTab] = useState(initial.tab)
      const [sort, setSort] = useState(initial.sort)

      // 任何偏好变化都写回本地，下次打开面板保持原样。
      const persist = useCallback((patch) => {
        writeStore({ ...readStore(), tab, sort, starred, compare, ...patch })
      }, [tab, sort, starred, compare])

      const selectTab = (next) => { setTab(next); persist({ tab: next }) }
      const selectSort = (next) => { setSort(next); persist({ sort: next }) }

      const queries = state !== null && state !== undefined && Array.isArray(state.queries) ? state.queries : []
      const codeSearches = state !== null && state !== undefined && Array.isArray(state.codeSearches) ? state.codeSearches : []
      const issueSearches = state !== null && state !== undefined && Array.isArray(state.issueSearches) ? state.issueSearches : []
      const rate = state !== null && state !== undefined ? state.rate ?? null : null

      const details = useMemo(() => {
        const map = new Map()
        const list = state !== null && state !== undefined && Array.isArray(state.details) ? state.details : []
        for (const entry of list) map.set(entry.fullName, entry)
        return map
      }, [state])

      // 收藏查找表，供卡片显示状态。
      const starredSet = useMemo(() => new Set(starred.map(item => item.fullName)), [starred])
      const compareSet = useMemo(() => new Set(compare), [compare])

      const toggleStar = useCallback((repo) => {
        setStarred((current) => {
          const exists = current.some(item => item.fullName === repo.fullName)
          const next = exists
            ? current.filter(item => item.fullName !== repo.fullName)
            : [{ ...repo, starredAt: Date.now() }, ...current].slice(0, 50)
          persist({ starred: next })
          return next
        })
      }, [persist])

      const toggleCompare = useCallback((fullName) => {
        setCompare((current) => {
          if (current.includes(fullName)) {
            const next = current.filter(name => name !== fullName)
            persist({ compare: next })
            return next
          }
          // 对比最多三个：再多就失去「并排看」的意义。
          const next = [...current, fullName].slice(-3)
          persist({ compare: next })
          return next
        })
      }, [persist])

      const allRepos = useMemo(() => {
        const map = new Map()
        for (const group of queries) {
          for (const repo of Array.isArray(group.repos) ? group.repos : []) {
            if (!map.has(repo.fullName)) map.set(repo.fullName, repo)
          }
        }
        for (const repo of starred) if (!map.has(repo.fullName)) map.set(repo.fullName, repo)
        return map
      }, [queries, starred])

      const compareRepos = useMemo(
        () => compare.map(name => allRepos.get(name)).filter(Boolean),
        [compare, allRepos],
      )

      const repoCount = queries.reduce((n, g) => n + (Array.isArray(g.repos) ? g.repos.length : 0), 0)
      const codeCount = codeSearches.reduce((n, g) => n + (Array.isArray(g.hits) ? g.hits.length : 0), 0)
      const issueCount = issueSearches.reduce((n, g) => n + (Array.isArray(g.issues) ? g.issues.length : 0), 0)
      const nothing = repoCount + codeCount + issueCount === 0 && starred.length === 0

      const tabEmpty = (title, hint) => h('div', { style: css.empty },
        h('div', { style: css.emptyTitle }, title),
        h('div', { style: css.emptyHint }, hint),
      )

      /** 渲染一组仓库卡片。 */
      const renderRepoGroup = (group, gi, keyPrefix) => {
        const rows = sortRepos(Array.isArray(group.repos) ? group.repos : [], sort)
        return h('div', { key: `${keyPrefix}:${group.query}:${gi}`, style: css.group },
          h(GroupHead, {
            query: group.query,
            meta: `${group.total} 个${group.page > 1 ? ` · 第 ${group.page} 页` : ''} · 显示 ${rows.length}`,
          }),
          rows.map((repo, ri) => {
            const key = `${keyPrefix}:${gi}:${repo.fullName}:${ri}`
            return h(RepoCard, {
              key, repo,
              detail: details.get(repo.fullName) ?? null,
              expanded: openKey === key,
              onToggle: () => { setOpenKey(current => (current === key ? null : key)) },
              starred: starredSet.has(repo.fullName),
              inCompare: compareSet.has(repo.fullName),
              onStar: () => { toggleStar(repo) },
              onCompare: () => { toggleCompare(repo.fullName) },
            })
          }),
        )
      }

      let content
      if (tab === 'starred') {
        content = starred.length === 0
          ? tabEmpty('收藏：还没有内容', '在仓库卡片上点星形按钮收藏，收藏会跨会话保留。')
          : h('div', { style: css.group },
              h(GroupHead, { query: '我的收藏', meta: `${starred.length} 个` }),
              sortRepos(starred, sort).map((repo, ri) => {
                const key = `starred:${repo.fullName}:${ri}`
                return h(RepoCard, {
                  key, repo,
                  detail: details.get(repo.fullName) ?? null,
                  expanded: openKey === key,
                  onToggle: () => { setOpenKey(current => (current === key ? null : key)) },
                  starred: true,
                  inCompare: compareSet.has(repo.fullName),
                  onStar: () => { toggleStar(repo) },
                  onCompare: () => { toggleCompare(repo.fullName) },
                })
              }),
            )
      } else if (tab === 'compare') {
        content = h(CompareView, {
          repos: compareRepos,
          onRemove: (name) => { toggleCompare(name) },
          onClear: () => { setCompare([]); persist({ compare: [] }) },
        })
      } else if (nothing) {
        content = h('div', { style: css.empty },
          h('svg', {
            width: 36, height: 36, viewBox: '0 0 36 36', fill: 'none',
            stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
            'aria-hidden': true, style: css.emptyIcon,
          },
          h('circle', { cx: 15.2, cy: 15.2, r: 8.2 }),
          h('path', { d: 'M21.4 21.4 28 28' }),
          h('path', { d: 'M11.4 12.6h7.6M11.4 15.8h7.6M11.4 19h4.8' })),
          h('div', { style: css.emptyTitle }, '插件已就绪，本会话还没有检索过'),
          h('div', { style: css.emptyHint }, '这不是安装失败。在左边对话框里说一句下面的话，结果就会出现在这里：'),
          h('div', { style: css.examples },
            ...EXAMPLES.map(example => h('div', { key: example, style: css.example }, example)),
          ),
          h('div', { style: { ...css.emptyHint, marginTop: 10, opacity: 0.8 } },
            '收藏与对比会跨会话保留；仓库／代码／议题三个标签各自记录不同类型的检索。'),
        )
      } else if (tab === 'repos') {
        content = queries.length === 0
          ? tabEmpty('仓库：还没有结果', '在对话框里说「搜一下 xx 相关的仓库」，结果会按关键词分组出现在这里。')
          : queries.map((group, gi) => renderRepoGroup(group, gi, 'repo'))
      } else if (tab === 'code') {
        content = codeSearches.length === 0
          ? tabEmpty('代码：还没有结果', '代码搜索要更窄的条件，例如「在某个仓库里搜 useProjection」。')
          : codeSearches.map((group, gi) => {
              const rows = Array.isArray(group.hits) ? group.hits : []
              return h('div', { key: `${group.query}:${gi}`, style: css.group },
                h(GroupHead, {
                  query: group.query,
                  meta: `${group.total} 个${group.page > 1 ? ` · 第 ${group.page} 页` : ''} · 显示 ${rows.length}`,
                }),
                rows.map((hit, ri) => h(CodeRow, { key: `${gi}:${hit.url}:${ri}`, hit })),
              )
            })
      } else {
        content = issueSearches.length === 0
          ? tabEmpty('议题：还没有结果', '可以问「这个项目有哪些未关闭的 bug」。')
          : issueSearches.map((group, gi) => {
              const rows = Array.isArray(group.issues) ? group.issues : []
              return h('div', { key: `${group.query}:${gi}`, style: css.group },
                h(GroupHead, {
                  query: group.query,
                  meta: `${group.total} 个${group.page > 1 ? ` · 第 ${group.page} 页` : ''} · 显示 ${rows.length}`,
                }),
                rows.map((issue, ri) => h(IssueRow, { key: `${gi}:${issue.url}:${ri}`, issue })),
              )
            })
      }

      const showSort = tab === 'repos' || tab === 'starred'

      return h('div', { style: css.root },
        h('div', { style: css.toolbar },
          h('div', { style: css.toolbarLeft },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, 'GitHub'),
          ),
          rate === null || rate === undefined
            ? null
            : h('div', {
                style: css.count,
                title: `search ${rate.searchRemaining}/${rate.searchLimit} · core ${rate.coreRemaining}/${rate.coreLimit}`,
              }, `配额 ${rate.searchRemaining}/${rate.searchLimit}`),
        ),
        h('div', { style: css.tabs },
          h(TabButton, { active: tab === 'repos', label: '仓库', count: repoCount, onClick: () => { selectTab('repos') } }),
          h(TabButton, { active: tab === 'code', label: '代码', count: codeCount, onClick: () => { selectTab('code') } }),
          h(TabButton, { active: tab === 'issues', label: '议题', count: issueCount, onClick: () => { selectTab('issues') } }),
          h(TabButton, { active: tab === 'starred', label: '收藏', count: starred.length, onClick: () => { selectTab('starred') } }),
          h(TabButton, { active: tab === 'compare', label: '对比', count: compare.length, onClick: () => { selectTab('compare') } }),
        ),
        showSort
          ? h('div', { style: css.sortRow },
              h('span', { style: css.sortLabel }, '排序'),
              ...SORTS.map(option => h('button', {
                key: option.id,
                type: 'button',
                onClick: () => { selectSort(option.id) },
                style: {
                  padding: '2px 7px', border: 'none',
                  borderRadius: 'var(--dsw-radius-xs)',
                  background: sort === option.id ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                  color: sort === option.id ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
                  font: 'inherit', fontSize: 11, cursor: 'pointer',
                },
              }, option.label)),
            )
          : null,
        h('div', { style: css.body }, content),
      )
    }

    /** 放大镜图标，供两个入口按钮复用。 */
    function SearchGlyph({ size }) {
      const s = typeof size === 'number' ? size : 16
      return h('svg', {
        width: s, height: s, viewBox: '0 0 36 36', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round',
        'aria-hidden': true, style: { flex: 'none', display: 'block' },
      },
      h('circle', { cx: 15.2, cy: 15.2, r: 8.2 }),
      h('path', { d: 'M21.4 21.4 28 28' }),
      h('path', { d: 'M11.4 12.6h7.6M11.4 15.8h7.6M11.4 19h4.8' }))
    }

    /** 会话头部按钮。 */
    function HeaderButton({ openGithubPanel }) {
      return h('button', {
        type: 'button',
        title: 'GitHub 搜索结果',
        'aria-label': 'GitHub 搜索结果',
        onClick: () => { openGithubPanel() },
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, padding: 0,
          border: 'none', borderRadius: 'var(--dsw-radius-sm)',
          background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
          cursor: 'pointer',
        },
        onMouseEnter: (event) => {
          event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
          event.currentTarget.style.color = 'var(--dsw-alias-label-primary)'
        },
        onMouseLeave: (event) => {
          event.currentTarget.style.background = 'transparent'
          event.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'
        },
      }, h(SearchGlyph, { size: 16 }))
    }

    /** 左侧栏底部入口。 */
    function SidebarAction({ openGithubPanel }) {
      return h('button', {
        type: 'button',
        title: 'GitHub 搜索结果',
        'aria-label': 'GitHub 搜索结果',
        onClick: () => { openGithubPanel() },
        style: {
          display: 'flex', alignItems: 'center', gap: 9,
          width: '100%', padding: '6px 8px',
          border: 'none', borderRadius: 'var(--dsw-radius-sm)',
          background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
          cursor: 'pointer', font: 'inherit', fontSize: 13, textAlign: 'left',
        },
        onMouseEnter: (event) => {
          event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
          event.currentTarget.style.color = 'var(--dsw-alias-label-primary)'
        },
        onMouseLeave: (event) => {
          event.currentTarget.style.background = 'transparent'
          event.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'
        },
      },
      h(SearchGlyph, { size: 16 }),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, 'GitHub 搜索结果'),
      )
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        const openPanel = () => {
          try {
            ctx.sidebarRight.openTab(TAB_KIND)
          } catch (error) {
            console.warn('[github-repo-search] openTab failed:', error)
          }
        }

        // 面板类型：右侧栏按 kind 打开。
        ctx.effect(
          () => ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: 'extension',
            title: () => 'GitHub 搜索结果',
          }),
          'github-repo-search: right sidebar tab type',
        )

        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
        }, props => h(PanelBoundary, null, h(GitHubPanel, props))))

        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: TAB_ID,
          order: -4,
          label: () => 'GitHub 搜索结果',
          inject: () => ({ openGithubPanel: openPanel }),
        }, HeaderButton))

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: TAB_ID,
          order: 20,
          label: () => 'GitHub 搜索结果',
          inject: () => ({ openGithubPanel: openPanel }),
        }, SidebarAction))
      },
    }
  },
})
