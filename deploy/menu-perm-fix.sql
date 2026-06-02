-- 菜单权限修复(2026-06-02):分组改由服务端 menu.tree 自动补全祖先
-- 1) 移除非超管角色的分组授权(否则 el-tree 勾选父组会自动勾上全部子项,造成"已配置"假象)
DELETE rp FROM role_has_permissions rp
  JOIN menus m ON m.id = rp.menu_id
  JOIN roles r ON r.id = rp.role_id
 WHERE r.is_super = 0 AND m.permission_code IN ('kefu:group','system:group');

-- 2) 角色2(普通用户)授予「客服管理」全部叶子菜单 + 按钮(按验收截图意图:含 AI设置/插件授权)
INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
SELECT 2, m.id FROM menus m
 WHERE m.status = 1 AND m.permission_code IN (
   'aggregate:view','conversation:list','lead:manage','workorder:handle','workorder:assign',
   'analytics:view','plugin:list','settings','intent-rule:config','price:manage','llm:config'
 );
