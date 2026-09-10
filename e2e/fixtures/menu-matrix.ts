/**
 * L1 菜单可见性矩阵骨架（P1 才填）
 * 对齐 DefaultLayout.vue menuItems × 4 角色
 */

export type MenuMatrixItem = {
  path: string;
  label: string;
  admin: boolean;
  hr: boolean;
  hiring_manager: boolean;
  interviewer: boolean;
};

/** 完整菜单矩阵（P1 填充） */
export const MENU_MATRIX: MenuMatrixItem[] = [];

/** 期望可见项扁平列表（P1 填充） */
export const EXPECTED_VISIBLE: Array<{ role: string; path: string; label: string }> = [];

/** 期望隐藏项扁平列表（P1 填充） */
export const EXPECTED_HIDDEN: Array<{ role: string; path: string; label: string }> = [];
