import { ROLES, type Role } from './auth';

/**
 * 19 菜单 × 4 角色可见性矩阵（唯一事实源；改动 DefaultLayout.vue 时同步本表）
 * 对齐 DefaultLayout.vue menuItems（member 已归一为 hr）
 */
export const MENU_MATRIX: ReadonlyArray<{
  path: string;
  title: string;
  visibleTo: ReadonlyArray<Role>;
}> = [
  { path: '/dashboard', title: '仪表盘', visibleTo: ['admin', 'hr', 'hiring_manager', 'interviewer'] },
  { path: '/hiring', title: '招聘工作台', visibleTo: ['admin', 'hiring_manager'] },
  { path: '/jobs', title: '职位管理', visibleTo: ['admin', 'hr'] },
  { path: '/settings/agencies', title: '猎头机构', visibleTo: ['admin', 'hr'] },
  { path: '/candidates', title: '候选人管理', visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/interview', title: '面试官工作台', visibleTo: ['admin', 'hiring_manager', 'interviewer'] },
  { path: '/interviews', title: '面试管理', visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/offers', title: 'Offer管理', visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/stats', title: '数据统计', visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/hr-score/my', title: '我的积分', visibleTo: ['admin', 'hr'] },
  { path: '/hr-score/team', title: '团队考核', visibleTo: ['admin'] },
  { path: '/notifications', title: '消息通知', visibleTo: ['admin', 'hr', 'hiring_manager', 'interviewer'] },
  { path: '/hc-requests', title: '编制管理', visibleTo: ['admin', 'hr', 'hiring_manager'] },
  { path: '/users', title: '成员管理', visibleTo: ['admin'] },
  { path: '/settings/dictionary', title: '字典管理', visibleTo: ['admin'] },
  { path: '/settings/tags', title: '标签管理', visibleTo: ['admin'] },
  { path: '/settings/pipeline-templates', title: '流程模板', visibleTo: ['admin'] },
  { path: '/settings/ai', title: 'AI 设置', visibleTo: ['admin'] },
  { path: '/settings/automation-rules', title: '自动化邮件', visibleTo: ['admin'] },
];

/** 按角色展开可见菜单 title（测试用例用） */
export const EXPECTED_VISIBLE: Record<Role, string[]> = (() => {
  const map = { admin: [], hr: [], hiring_manager: [], interviewer: [] } as Record<Role, string[]>;
  for (const item of MENU_MATRIX) {
    for (const role of item.visibleTo) map[role].push(item.title);
  }
  return map;
})();

/** 按角色展开隐藏菜单 title（测试用例用） */
export const EXPECTED_HIDDEN: Record<Role, string[]> = (() => {
  const map = { admin: [], hr: [], hiring_manager: [], interviewer: [] } as Record<Role, string[]>;
  for (const item of MENU_MATRIX) {
    for (const role of ROLES) {
      if (!item.visibleTo.includes(role)) map[role].push(item.title);
    }
  }
  return map;
})();
