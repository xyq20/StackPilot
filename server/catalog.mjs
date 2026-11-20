import { randomUUID } from 'node:crypto'

export function installCatalog(db) {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(apps)')
      .all()
      .map((column) => column.name),
  )
  if (!columns.has('lifecycle')) {
    db.exec(
      "ALTER TABLE apps ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','archived'))",
    )
  }
  if (!columns.has('usage'))
    db.exec("ALTER TABLE apps ADD COLUMN usage TEXT NOT NULL DEFAULT ''")
  if (!columns.has('mode')) {
    db.exec(
      "ALTER TABLE apps ADD COLUMN mode TEXT NOT NULL DEFAULT 'desktop' CHECK (mode IN ('desktop','web','scheduled'))",
    )
    db.exec("UPDATE apps SET mode='scheduled' WHERE kind='commerce'")
  }
  db.exec(`CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY, appId TEXT NOT NULL REFERENCES apps(id), version TEXT NOT NULL,
    notes TEXT NOT NULL, url TEXT NOT NULL, time INTEGER NOT NULL, UNIQUE(appId,version)
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, appId TEXT NOT NULL REFERENCES apps(id), version TEXT NOT NULL,
    title TEXT NOT NULL, detail TEXT NOT NULL, reporter TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('open','ack','resolved')), time INTEGER NOT NULL
  );`)
}

const examples = [
  [
    'ORDER-SYNC',
    'scheduled',
    '按店铺定时拉取新增订单。在程序工作台设置店铺和同步间隔，失败后查看对应批次的运行记录。',
    '2.3.1',
    '修复跨日拉取订单时的重复入库问题。',
    11,
  ],
  [
    'STOCK-WATCH',
    'scheduled',
    '选择仓库和店铺，定时生成库存差异清单，仓储同事可按商品编码核对。',
    '1.5.0',
    '新增按仓库筛选差异明细，可单独导出异常商品。',
    7,
  ],
  [
    'PRODUCT-FETCH',
    'scheduled',
    '将商品链接加入采集队列，任务结束后复核标题、属性和价格。',
    '1.4.2',
    '记录请求超时的商品链接，方便重试。',
    10,
  ],
  [
    'REPORT-KIT',
    'web',
    '选定店铺与统计日期后生成运营日报，可按渠道查看订单数和销售额。',
    '2.1.0',
    '日报新增渠道拆分和退款汇总。',
    5,
  ],
  [
    'IMAGE-PIPE',
    'desktop',
    '拖入商品图片，选择导出尺寸及压缩质量，处理完成后检查输出目录。',
    '1.8.2',
    '保留透明背景，补充导出失败文件清单。',
    3,
  ],
  [
    'AFTERSALE-SYNC',
    'scheduled',
    '同步售后工单到客服工作台，按店铺和处理期限检查待跟进申请。',
    '1.2.0',
    '在任务记录中显示本批售后单数量。',
    9,
  ],
  [
    'TRACK-FLOW',
    'scheduled',
    '导入运单号，定时查询物流节点，在工作台查看长时间无更新的包裹。',
    '1.3.1',
    '修复部分运单签收状态延迟更新。',
    8,
  ],
  [
    'SHEET-CLEAN',
    'web',
    '从表格复制数据并粘贴到工具中，清理首尾空格、重复行和空行，再将结果复制回表格。',
    '1.2.0',
    '增加重复行统计与清洗结果的 TSV 下载。',
    1,
  ],
  [
    'PRICE-GUARD',
    'scheduled',
    '录入活动价目标与商品清单，在促销期间定时核对实际售价。',
    '1.1.0',
    '支持按店铺归集价格偏差。',
    12,
  ],
  [
    'ASSET-SORT',
    'desktop',
    '选择素材目录与命名模板，核对分组预览后导出整理结果。',
    '1.0.2',
    '修正同名图片覆盖旧文件的问题。',
    6,
  ],
  [
    'BILL-CHECK',
    'scheduled',
    '选择店铺账单和回款明细，按交易单号核对后导出未匹配项。',
    '1.4.0',
    '增加部分退款场景的账单核对。',
    4,
  ],
  [
    'DOC-CONVERT',
    'desktop',
    '选择文档和目标格式，批量转换后核对输出文件数。',
    '1.0.1',
    '转换失败时保留原文件名，便于定位。',
    13,
  ],
]

export function seedCatalog(db) {
  const seeded = db
    .prepare("SELECT 1 FROM meta WHERE key='catalog-examples-1'")
    .get()
  const demoIds = new Set(
    db
      .prepare('SELECT id FROM apps WHERE demo=1')
      .all()
      .map((app) => app.id),
  )
  if (seeded || demoIds.size === 0) return
  const now = Date.now()
  const day = 86400000
  const writeCatalog = db.prepare(
    'UPDATE apps SET usage=?,mode=? WHERE id=? AND demo=1',
  )
  const release = db.prepare(
    'INSERT INTO releases(id,appId,version,notes,url,time) VALUES(?,?,?,?,?,?)',
  )
  for (const [id, mode, usage, version, notes, age] of examples) {
    if (!demoIds.has(id)) continue
    writeCatalog.run(usage, mode, id)
    release.run(
      randomUUID(),
      id,
      version,
      notes,
      id === 'SHEET-CLEAN' ? '/demo/sheet-clean.html' : '',
      now - age * day,
    )
  }
  if (demoIds.has('SHEET-CLEAN')) {
    release.run(
      randomUUID(),
      'SHEET-CLEAN',
      '1.1.0',
      '支持从 Excel 粘贴多列数据并保留制表符。',
      '',
      now - 9 * day,
    )
  }
  if (demoIds.has('IMAGE-PIPE')) {
    release.run(
      randomUUID(),
      'IMAGE-PIPE',
      '1.8.1',
      '新增商品主图 800 像素导出预设。',
      '',
      now - 12 * day,
    )
  }
  const add = db.prepare(
    'INSERT INTO feedback(id,appId,version,title,detail,reporter,state,time) VALUES(?,?,?,?,?,?,?,?)',
  )
  const notes = [
    [
      'SHEET-CLEAN',
      '1.2.0',
      '希望按指定列去重',
      '供应商报价表的备注列经常变化，希望可以只按商品编码判断重复。',
      '采购组 · 小顾',
      'open',
      3,
    ],
    [
      'IMAGE-PIPE',
      '1.8.2',
      '长图导出时希望保留原始比例',
      '使用方图预设时，详情页长图会被裁切，希望能单独选择等比例缩放。',
      '设计组 · 阿乔',
      'ack',
      9,
    ],
    [
      'REPORT-KIT',
      '2.1.0',
      '日报里想增加退款率',
      '每次周会都要手算，建议在退款汇总旁直接显示占比。',
      '运营组 · 小林',
      'open',
      28,
    ],
    [
      'SHEET-CLEAN',
      '1.1.0',
      '导出时需要保留多列',
      '店铺商品清单粘贴回表格后挤在同一列。新版导出 TSV 后已复核正常。',
      '运营组 · 小林',
      'resolved',
      45,
    ],
    [
      'STOCK-WATCH',
      '1.5.0',
      '差异清单里需要仓库筛选',
      '仓储值班时只需要看当班仓库，已在 1.5.0 版本验证。',
      '仓储组 · 阿明',
      'resolved',
      72,
    ],
  ]
  for (const [appId, version, title, detail, reporter, state, hours] of notes) {
    if (demoIds.has(appId))
      add.run(
        randomUUID(),
        appId,
        version,
        title,
        detail,
        reporter,
        state,
        now - hours * 3600000,
      )
  }
  db.prepare("INSERT INTO meta(key,value) VALUES('catalog-examples-1',?)").run(
    String(now),
  )
}
