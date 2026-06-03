-- W16 Task 6 — 租户角色(role_id=2)去掉平台管理页权限点
-- Chase 决策(2026-06-03): plugin:list 不给租户;一并去掉 用户/平台/角色/菜单/日志 管理页。
-- 保留: 业务页(会话/线索/工单/分析/聚合) + dashboard + 业务配置(settings/意图规则/价格/LLM)。
-- 可回滚: 见全量备份 chatsift_before_w16_migration_*.sql.gz
-- 注: admin(超管)入口隐藏业务页不靠此 SQL(超管 menu.tree 返回全部菜单),靠前端按域名过滤。

DELETE rp FROM role_has_permissions rp
  JOIN menus m ON m.id = rp.menu_id
 WHERE rp.role_id = 2
   AND m.permission_code IN (
     'user:list','user:create','user:update','user:delete',
     'platform:list',
     'role:list','role:create','role:update','role:delete',
     'menu:list','menu:create','menu:update','menu:delete',
     'log:list',
     'plugin:list'
   );
