-- 菜单重构:首页 + 客服管理组 + 系统设置组(幂等,可重复执行)
SET NAMES utf8mb4;

INSERT IGNORE INTO menus (name, icon, route, component, type, permission_code, sort_order, status) VALUES
  ('客服管理','ChatDotRound',NULL,NULL,'menu','kefu:group',2,1),
  ('系统设置','Setting',NULL,NULL,'menu','system:group',3,1);

SET @kefu := (SELECT id FROM menus WHERE permission_code='kefu:group' LIMIT 1);
SET @sys  := (SELECT id FROM menus WHERE permission_code='system:group' LIMIT 1);

UPDATE menus SET name='首页', parent_id=NULL, sort_order=1 WHERE permission_code='dashboard';
UPDATE menus SET name='AI设置', icon='Reading', parent_id=@kefu, sort_order=6 WHERE permission_code='settings';

UPDATE menus SET parent_id=@kefu, sort_order=1 WHERE permission_code='conversation:list';
UPDATE menus SET parent_id=@kefu, sort_order=2 WHERE permission_code='lead:manage';
UPDATE menus SET parent_id=@kefu, sort_order=3 WHERE permission_code='workorder:handle';
UPDATE menus SET parent_id=@kefu, sort_order=4 WHERE permission_code='analytics:view';
UPDATE menus SET parent_id=@kefu, sort_order=5, status=0 WHERE permission_code='log:list';  -- 日志中心暂不披露

UPDATE menus SET parent_id=@sys, sort_order=1 WHERE permission_code='user:list';
UPDATE menus SET parent_id=@sys, sort_order=2 WHERE permission_code='role:list';
UPDATE menus SET parent_id=@sys, sort_order=3 WHERE permission_code='menu:list';
UPDATE menus SET parent_id=@sys, sort_order=4 WHERE permission_code='platform:list';
UPDATE menus SET parent_id=@sys, sort_order=5 WHERE permission_code='plugin:list';

INSERT IGNORE INTO role_has_permissions (role_id, menu_id) VALUES (1,@kefu),(1,@sys),(2,@kefu);
