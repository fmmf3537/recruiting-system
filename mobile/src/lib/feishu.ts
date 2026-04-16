/**
 * 飞书环境检测与 JSAPI 封装
 * 说明：由于 @larksuite/jsapi-sdk 在公开 npm 上不可用，
 * 生产环境需在 index.html 中通过 CDN 引入飞书 SDK 脚本。
 * 此处通过 window 全局变量做安全访问。
 */

declare global {
  interface Window {
    h5sdk?: {
      error?: Error;
      ready?: (callback: () => void) => void;
    };
    tt?: {
      requestAuthCode: (options: {
        appId: string;
        success: (res: { code: string }) => void;
        fail: (err: { errMsg: string }) => void;
      }) => void;
      shareAppMessage: (options: {
        title: string;
        desc: string;
        link: string;
        imageUrl?: string;
        success?: () => void;
        fail?: (err: { errMsg: string }) => void;
      }) => void;
      openDocument: (options: {
        url: string;
        fileName?: string;
        fileType?: string;
        success?: () => void;
        fail?: (err: { errMsg: string }) => void;
      }) => void;
      setNavigationBarTitle: (options: {
        title: string;
        success?: () => void;
        fail?: (err: { errMsg: string }) => void;
      }) => void;
    };
  }
}

/**
 * 判断当前是否运行在飞书内置浏览器中
 */
export function isFeishu(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('lark') || ua.includes('feishu');
}

/**
 * 等待飞书 JSAPI 就绪
 */
export function initFeishu(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isFeishu()) {
      reject(new Error('非飞书环境'));
      return;
    }
    if (window.h5sdk?.ready) {
      window.h5sdk.ready(() => {
        resolve();
      });
      return;
    }
    // 若 SDK 未加载，简单轮询等待
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (window.h5sdk?.ready) {
        clearInterval(timer);
        window.h5sdk.ready(() => {
          resolve();
        });
      } else if (count > 20) {
        clearInterval(timer);
        reject(new Error('飞书 SDK 加载超时'));
      }
    }, 300);
  });
}

/**
 * 获取飞书临时授权码（auth_code）
 * 注意：需要先在 index.html 中引入飞书 SDK 并配置正确的 appId
 */
export function getAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.tt?.requestAuthCode) {
      reject(new Error('飞书 JSAPI 未就绪'));
      return;
    }
    // appId 从环境变量读取，若未配置则降级
    const appId = import.meta.env.VITE_FEISHU_APP_ID || '';
    if (!appId) {
      reject(new Error('未配置飞书 AppID'));
      return;
    }
    window.tt.requestAuthCode({
      appId,
      success: (res) => {
        resolve(res.code);
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '获取 authCode 失败'));
      },
    });
  });
}

/**
 * 飞书原生分享
 */
export function shareAppMessage(title: string, desc: string, url: string, imgUrl = ''): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.tt?.shareAppMessage) {
      reject(new Error('飞书 JSAPI 未就绪'));
      return;
    }
    window.tt.shareAppMessage({
      title,
      desc,
      link: url,
      imageUrl: imgUrl,
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || '分享失败')),
    });
  });
}

/**
 * 飞书内打开文档预览
 */
export function openDocument(url: string, fileName?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.tt?.openDocument) {
      reject(new Error('飞书 JSAPI 未就绪'));
      return;
    }
    window.tt.openDocument({
      url,
      fileName,
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || '打开文档失败')),
    });
  });
}

/**
 * 设置飞书导航栏标题
 */
export function setNavigationBarTitle(title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.tt?.setNavigationBarTitle) {
      reject(new Error('飞书 JSAPI 未就绪'));
      return;
    }
    window.tt.setNavigationBarTitle({
      title,
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || '设置标题失败')),
    });
  });
}
