-- W13:新增「消息聚合」只读三栏页,挂客服管理组首位(幂等)
SET NAMES utf8mb4;
SET @kefu := (SELECT id FROM menus WHERE permission_code='kefu:group' LIMIT 1);
INSERT IGNORE INTO menus (parent_id, name, icon, route, component, type, permission_code, sort_order, status)
  VALUES (@kefu, '消息聚合', 'Files', '/aggregate', 'Aggregate', 'menu', 'aggregate:view', 0, 1);
SET @agg := (SELECT id FROM menus WHERE permission_code='aggregate:view' LIMIT 1);
INSERT IGNORE INTO role_has_permissions (role_id, menu_id) VALUES (1,@agg),(2,@agg);
