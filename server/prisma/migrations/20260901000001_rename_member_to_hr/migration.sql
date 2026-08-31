-- 成员角色重命名为 hr
-- 幂等：只更新仍为 member 的行（重复执行安全）

UPDATE "user"
SET role = 'hr'
WHERE role = 'member';
