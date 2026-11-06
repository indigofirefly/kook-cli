# kook-cli

一个 Vue CLI 风格的脚手架：交互式选择模板仓库，实时下载进度，自动初始化项目。

## 安装

```bash
# 全局安装（推荐）
pnpm install -g kook-cli
# 或
npm install -g kook-cli
```

安装后可用 `kook-cli` 或简写 `kook`。

## 命令

```bash
kook-cli -V                            # 查看版本
kook-cli -h                            # 查看命令帮助
kook-cli create my-app                 # 交互式选择模板创建项目
kook-cli create my-app -t vue3H5       # 直接指定模板
kook-cli create my-app -f              # 覆盖已存在的非空目录
kook-cli create -t vue3admin     # 不写项目名，自动使用 kook-vue3admin
kook-cli list                          # 查看可用模板
kook-cli update                        # 升级脚手架自身
```

`create` 可用参数：

| 参数 | 说明 |
| --- | --- |
| `-t, --template <key>` | 直接指定模板，跳过交互选择 |
| `-f, --force` | 目标目录非空时直接覆盖，不再二次确认 |
| `--no-check` | 跳过版本更新检查 |

## 内置模板

| key | 说明 | 仓库 |
| --- | --- | --- |
| `vue3admin` | Vue3 + Element Plus 后台管理模板 | https://gitee.com/yinghuopocket/yyadmin.git |
| `vue3H5` | uni-app Vue3 H5 移动端模板 | https://gitee.com/yinghuopocket/uni-vue3.git |
| `uni-mini-program` | uni-app 小程序模板 | https://gitee.com/yinghuopocket/uni-app.git |

创建成功后按提示执行：

```bash
cd my-app
npm install
npm run dev
```

## 配置

内置配置位于 `src/config.json`，用户级配置位于 `~/.kook-cli/config.json`，两者按 key 深度合并：同名模板以用户配置为准，新模板自动追加。（***可按此说明追加自己项目的git地址***）

```json
{
  "registry": "https://registry.npmmirror.com",
  "checkUpdate": true,
  "templates": {
    "my-template": {
      "description": "我的业务模板",
      "url": "https://gitee.com/your-name/your-template.git",
      "branch": "main"
    }
  }
}
```

字段说明：

- `registry`：`kook-cli update` 查询版本时使用的 npm registry，默认 npmmirror，失败自动回退 npmjs（`create` 的更新提醒固定查询 npm 官方源）
- `checkUpdate`：是否在 `create` 时检查新版本，默认 `true`
- `templates[key].description`：交互列表中的描述
- `templates[key].url`：git 仓库地址（支持 https / ssh / 本地路径）
- `templates[key].branch`：分支名，留空则自动探测 `master` / `main`

也可以用环境变量临时指定配置文件：`KOOK_CLI_CONFIG=/path/to/config.json`。

## 行为说明

- **项目名为空**：自动使用 `kook-${模板名}` 并给出提示
- **目录已存在且非空**：默认二次确认，`-f` 直接覆盖；只清空内容，保留目录本身
- **下载方式**：`git clone --depth=1`，进度条百分比来自 git 的 `Receiving objects` 输出
- **下载完成后**：删除模板的 `.git` 目录，并把 `package.json` 的 `name` 改为新项目名
- **私有仓库**：交互终端下会弹出 Gitee 账号密码输入，请先确保本地 `git clone` 可正常拉取
- **版本提醒**：每次 `create` 实时查询 npm 官方源的最新版本（不落盘缓存），与本地全局安装的版本比较；未全局安装时回退到当前运行版本。断网不影响创建

## 开发

```bash
git clone <本仓库>
cd kook-cli
npm install
npm test          # 运行单元测试
npm link          # 本地挂载命令调试
```

目录结构：

```
bin/kook.js            命令入口
src/index.js           commander 装配
src/commands/          create / list / update
src/core/              config / download / target / version
src/utils/             日志、文件、文本宽度
src/config.json        内置模板配置
```

## License

MIT
