# W7 验收报告

## 变更范围

- 新增 `server/src/v1/business-rules.js`,集中配置租车字段和 lead 评分权重。
- completeness 改为租车 6 字段:姓名/城市/时间/联系方式/上车位置/车型,评分改为已填字段数占比。
- `leads` 增加 `customer_name`,本地库已执行增量 ALTER。
- 新增 lead engine,接入 analyzer pipeline 末尾,自动生成/更新线索并关联工单。
- 实现 `/api/v1/leads` 列表/详情/更新/成交接口。
- 新增 admin 线索中心列表页和详情页,挂载 `/leads`、`/leads/:id`。

## 规则验证

### customer_name schema

```sql
SHOW COLUMNS FROM leads LIKE 'customer_name';
```

结果:

```text
customer_name varchar(64) YES NULL
```

### completeness 租车字段

通过 `/api/v1/events/batch` 写入 W7 验收消息后,analyzer 自动消费:

```text
w7_full    appointment done       completeness=100 customer_name=刘思奇 phone=13913972023 city=上海 lead_score=100 lead_level=high
w7_partial appointment completing completeness=67  customer_name=王小明 phone=13800138000 city=上海 lead_score=95  lead_level=high
```

`w7_full` 消息内容包含 6 字段:

```text
姓名:刘思奇
城市:上海
时间:明天上午10点
联系方式:13913972023
上车位置:普陀区
车型:轿车
```

### status 不回退

1. `w7_full` 首次分析生成 high lead,status=`new`。
2. 调用 `PATCH /api/v1/leads/1` 改为 `following`。
3. 同一会话再追加一条 inbound 消息触发 analyzer。
4. 再查 lead:

```json
{
  "id": 1,
  "status": "following",
  "customer_name": "刘思奇",
  "phone": "13913972023",
  "score": 100,
  "level": "high",
  "intent": "appointment"
}
```

结论:人工状态未被分析回退。

### `/api/v1/leads` 200

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "customer_nickname": "chase",
        "customer_name": "刘思奇",
        "customer_phone": "13913972023",
        "city": "上海",
        "intent_label": "appointment",
        "lead_score": 100,
        "lead_level": "high",
        "status": "following"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 5
  }
}
```

## W3 四类工单回归

```text
w7_simple    simple_inquiry new  completeness=0   workorder=inquiry
w7_full      appointment    done completeness=100 workorder=appointment
w7_complaint complaint      done completeness=0   workorder=complaint
w7_price     price_inquiry  done completeness=100 workorder=pricing
```

工单均已生成,且 `workorders.lead_id` 已回填:

```text
w7_complaint complaint   lead_id=4 pending
w7_full      appointment lead_id=1 pending
w7_price     pricing     lead_id=5 pending
w7_simple    inquiry     lead_id=3 pending
```

## Admin 验证

- `npm run build` 通过。
- `http://127.0.0.1:5173/leads` 返回 200。
- 当前 3100 后端和 5173 admin dev server 均在监听。

构建中仍有 Vite/Rolldown 第三方依赖 pure annotation 和大 chunk 警告,不影响本次页面编译。

## Git

```text
HEAD feat(W7): lead engine + lead center + 租车字段校准
b6c7f27 docs(W7): lead engine design + tasks
1e71ec9 fix(W6.5): conversation merge + completeness accumulation
407c0ea feat(W6): admin conversation center + workorder center
ed9bfd2 docs(W5): finalize acceptance git log
```
