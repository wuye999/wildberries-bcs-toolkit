#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成工具：《商品价格表.xlsx》 → .local/data/boss-defaults.js
用法:
  python tools/gen-boss-defaults.py                   # 默认读 ../wb/data/商品价格表.xlsx
  python tools/gen-boss-defaults.py --boss 路径.xlsx   # 指定价格表

说明:
  - 从 src/25-boss-defaults-data.js 模板读取结构，将填充后的数据块写入本地忽略目录。
  - 价格表 8 列: 产品图片 / 卖家SKU / 产品中文名 / 实际售价 / 尺寸 / 最低售价 / vendorCode前缀码 / 库存SKU
    · ★ v1.9.0 取价改为 **最低售价(F列)** → 输出 minPrice：上架价 = minPrice × 店铺倍数（1/2/5/10）
    · 实际售价(D列) 多为公式 =F{行}*2 或 ==F{行}*2，仅做「漂移体检」（D≠F×2 时打印提示），不再作为价格来源
    · 尺寸(E列) 格式 长*宽*高/重量（*、/ 混用且可含空格），拆 4 段 → length/width/height(单位 cm) + weight(单位 kg)
  - 数据源更新后重跑本脚本 + node build.js 即生效。
  - v1.5.2 起为唯一数据生成入口（旧 gen-prefix-codes.js / 前缀码对照表.csv 链路已删除）。
"""
import argparse
import os
import re
import sys
import tempfile
from pathlib import Path

# 兼容 Windows 控制台 UTF-8 输出
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    import openpyxl
except ImportError:
    print('[错误] 缺少 openpyxl，请用当前 Python 环境执行 python -m pip install openpyxl')
    sys.exit(1)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = PROJECT_ROOT / 'src' / '25-boss-defaults-data.js'
LOCAL_DATA = PROJECT_ROOT / '.local' / 'data' / 'boss-defaults.js'
DEFAULT_BOSS = PROJECT_ROOT.parent / 'wb' / 'data' / '商品价格表.xlsx'

START = '/* 【数据块开始】 */'
END = '/* 【数据块结束】 */'


def _resolve_dp(formula, ws, row_idx):
    """解析 D 列公式（如 =F2*2）：读目标单元格值 × 系数。失败返回 None（同 检查价格/build_mapping.py::_resolve_dp）
    ★ 兼容双等号 `==F{行}*2` 形态（2026-09 实测全表 D 列均为 `==F{行}*2`，data_type='f'），`=+` 容忍多个前导等号。"""
    m = re.match(r'^=+([A-Z]+)(\d+)\s*\*\s*(\d+(?:\.\d+)?)', str(formula))
    if m:
        col = openpyxl.utils.column_index_from_string(m.group(1))
        target = ws.cell(row=int(m.group(2)), column=col).value
        if isinstance(target, (int, float)):
            return target * float(m.group(3))
    return None


def _parse_size(raw):
    """E 列尺寸 '长*宽*高/重量' → [length, width, height, weight]；解析失败返回 None。
    分隔符兼容 * 与 / 混用及内部空格（如 '22*12*6 /0.3'、'16.7/12.4/3/0.1'）。"""
    if raw is None or str(raw).strip() == '':
        return None
    parts = [p for p in re.split(r'[\s*/]+', str(raw).strip()) if p != '']
    if len(parts) != 4:
        return None
    try:
        return [float(x) for x in parts]
    except ValueError:
        return None


def _js_num(v):
    """JS 数值文本：整数 float 输出为整数（24 而非 24.0），其余保留原值"""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return repr(v)


def main():
    ap = argparse.ArgumentParser(description='商品价格表 → .local/data/boss-defaults.js')
    ap.add_argument('--boss', default=DEFAULT_BOSS, help='价格表 xlsx 路径（默认 ../wb/data/商品价格表.xlsx）')
    args = ap.parse_args()

    if not os.path.exists(args.boss):
        print(f'[错误] 价格表不存在: {args.boss}')
        sys.exit(1)

    wb = openpyxl.load_workbook(args.boss, data_only=False)
    if 'Sheet1' not in wb:
        print('[错误] 价格表缺少 Sheet1 工作表')
        sys.exit(1)
    ws = wb['Sheet1']
    seen = set()
    entries = []
    warns = 0
    for row in ws.iter_rows(min_row=2):
        sku = str(row[1].value).strip() if row[1].value else ''
        name = str(row[2].value).strip() if row[2].value else ''
        if not sku and not name:
            continue  # 空行
        prefix = str(row[6].value).strip().upper() if len(row) > 6 and row[6].value else ''
        if not prefix:
            print(f'[告警] 第 {row[0].row} 行缺少前缀码（SKU={sku}），跳过')
            warns += 1
            continue
        if prefix in seen:
            print(f'[告警] 前缀 {prefix} 重复登记：{entries[list(seen).index(prefix)]["sku"]} 与 {sku}，保留首个')
            warns += 1
            continue
        # ★ v1.9.0 最低售价（F 列）—— 上架价 = minPrice × 店铺倍数
        mp = row[5].value
        if isinstance(mp, str) and mp.strip():
            try:
                mp = float(mp.strip())
            except ValueError:
                mp = None
        if not isinstance(mp, (int, float)) or isinstance(mp, bool) or mp <= 0:
            print(f'[告警] 第 {row[0].row} 行最低售价(F列)无效（SKU={sku}，值={row[5].value!r}），跳过')
            warns += 1
            continue
        # 实际售价（D 列）：仅做漂移体检，不参与取价（D 应为 F×2）
        dp = row[3].value
        if isinstance(dp, str) and dp.startswith('='):
            dp = _resolve_dp(dp, ws, row[0].row)
        if isinstance(dp, (int, float)) and abs(dp - mp * 2) > 0.01:
            print(f'[提示] 第 {row[0].row} 行实际售价(D列={dp}) ≠ 最低售价×2({mp * 2})，请确认价格表口径')
        # 尺寸（E 列）
        size = _parse_size(row[4].value)
        if size is None:
            print(f'[告警] 第 {row[0].row} 行尺寸解析失败（SKU={sku}，值={row[4].value!r}），跳过')
            warns += 1
            continue
        seen.add(prefix)
        entries.append({
            'prefix': prefix, 'sku': sku, 'name': name, 'minPrice': mp,
            'length': size[0], 'width': size[1], 'height': size[2], 'weight': size[3],
        })
    wb.close()

    if not entries:
        print('[错误] 未解析到任何有效条目，不覆盖数据块')
        sys.exit(1)

    # 生成 JS 对象文本（键=前缀码，保留老板表行序；sku/name 用 json.dumps 保证引号/特殊字符安全）
    import json
    lines = []
    for e in entries:
        kv = ', '.join(
            f'{k}: {json.dumps(v)}' if k in ('sku', 'name')
            else f'{k}: {_js_num(v)}'
            for k, v in (('sku', e['sku']), ('name', e['name']), ('minPrice', e['minPrice']),
                         ('length', e['length']), ('width', e['width']),
                         ('height', e['height']), ('weight', e['weight']))
        )
        lines.append(f'  {json.dumps(e["prefix"])}: {{ {kv} }},')
    data = '\n'.join(lines)
    block = f'{START}\n  const BOSS_DEFAULTS = {{\n{data}\n  }};\n  {END}'

    if not TEMPLATE.is_file():
        print(f'[错误] 缺少数据模板 {TEMPLATE}')
        sys.exit(1)
    template = TEMPLATE.read_text(encoding='utf-8')
    s, e = template.find(START), template.find(END)
    if s < 0 or e < s:
        print(f'[错误] {TEMPLATE} 缺少有效的数据块标记')
        sys.exit(1)
    module = template[:s] + block + template[e + len(END):]
    LOCAL_DATA.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', encoding='utf-8', newline='\n', dir=LOCAL_DATA.parent, delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            temp_file.write(module)
        temp_path.replace(LOCAL_DATA)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    print(f'OK: {len(entries)} 条前缀码默认值已写入 {LOCAL_DATA}（{warns} 条告警）')


if __name__ == '__main__':
    main()
