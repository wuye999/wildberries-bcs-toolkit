# Wildberries BCS Toolkit

面向 Wildberries 卖家的两款 Tampermonkey 脚本。**批量急速上架**用于整理商品、设置店铺价格倍数，并通过 BCS 提交上架。**跨店同步**用于比对店铺商品，按选择同步商品内容和图片，或向目标店铺补上架。

## 构建与测试

在仓库根目录运行，已用 Node.js 24 验证。

```powershell
node build.js
node --test tests/shelve.test.js
```

| 源码 | 构建产物 | 单独构建 |
| --- | --- | --- |
| `src/` 批量上架和共用模块 | `dist/bcs_batch_shelve.user.js` | `node build.js shelve` |
| `src-sync/` 跨店同步 | `dist/bcs_cross_sync.user.js` | `node build.js sync` |

测试使用模拟请求和虚构商品价格。官方扩展对照用例读取项目根目录中的本地 1.5.4、1.5.8 扩展副本，缺少副本时跳过相应对照。

## 本地使用

批量上架需要自己的商品价格表。安装 Python 的 `openpyxl` 后，指定表格并重新构建上架脚本。

```powershell
python tools/gen-boss-defaults.py --boss "C:/path/to/商品价格表.xlsx"
node build.js shelve
```

生成器读取 `Sheet1` 的 B、C、E、F、G 列，依次为 SKU、中文名、包装尺寸和重量、最低售价、四位商品前缀码。第一行是表头，尺寸列示例为 `22*13*5/0.25`（厘米和千克）。默认表格路径为仓库同级的 `wb/data/商品价格表.xlsx`。生成的数据写入 `.local/data/boss-defaults.js`，构建时优先加载。新检出的仓库使用空价格模板，批量上架会阻止提交缺少价格条目的商品。

将生成的 `.user.js` 安装到 Tampermonkey。实际操作使用自己的 BCS 登录和有权限的 Wildberries 店铺。现有工作目录的详细维护说明在 `.local/docs/油猴脚本使用文档.md`。

## 目录

| 路径 | 用途 |
| --- | --- |
| `tools/` | 价格表生成和扩展适配工具 |
| `tests/` | 离线回归测试 |
| `dist/` | 本地构建产物，可能嵌入商品价格数据 |
| `.local/` | 本地价格数据、开发文档、网页样本、扩展安装包、签名私钥和历史脚本 |
| `TEMP/` | 历史备份和调试资料 |

Git 跟踪脚本源码、构建和测试工具。构建产物与本地工作资料由 `.gitignore` 排除。
