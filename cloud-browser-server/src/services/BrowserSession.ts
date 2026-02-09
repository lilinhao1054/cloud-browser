import CDP from 'chrome-remote-interface';
import type { KeyModifiers, PageInfo } from '../types';
import { type BaseClient, ClientType } from './clients';
import { END_POINT_HOST, END_POINT_PORT, SCREENCAST_CONFIG, DEFAULT_VIEWPORT } from '../config';
import { logger } from '../utils';

/**
 * 浏览器会话管理类
 * 负责管理与远程浏览器的 CDP 连接和交互
 */
export class BrowserSession {
  private client: CDP.Client | null = null;
  private browserClient: CDP.Client | null = null;
  private targetId: string | null = null;
  private currentUrl: string = '';
  private token: string = '';

  // 客户端管理
  private viewerClients: Set<BaseClient> = new Set();
  private apiClients: Set<BaseClient> = new Set();
  private screencastStarted: boolean = false;

  constructor() {}

  /**
   * 添加客户端到会话
   */
  addClient(client: BaseClient): void {
    if (client.type === ClientType.VIEWER) {
      this.viewerClients.add(client);
      logger.debug(`Viewer client ${client.getSocketId()} added, total viewers: ${this.viewerClients.size}`);
      // 有 viewer 时启动 screencast
      this.tryStartScreencast();
    } else {
      this.apiClients.add(client);
      logger.debug(`API client ${client.getSocketId()} added, total api clients: ${this.apiClients.size}`);
    }
  }

  /**
   * 从会话移除客户端
   * @returns 是否还有其他连接
   */
  removeClient(client: BaseClient): boolean {
    if (client.type === ClientType.VIEWER) {
      this.viewerClients.delete(client);
      logger.debug(`Viewer client ${client.getSocketId()} removed, total viewers: ${this.viewerClients.size}`);
      // 无 viewer 时停止 screencast
      if (this.viewerClients.size === 0) {
        this.tryStopScreencast();
      }
    } else {
      this.apiClients.delete(client);
      logger.debug(`API client ${client.getSocketId()} removed, total api clients: ${this.apiClients.size}`);
    }
    return this.getClientCount() > 0;
  }

  /**
   * 获取客户端总数
   */
  getClientCount(): number {
    return this.viewerClients.size + this.apiClients.size;
  }

  /**
   * 获取 viewer 客户端数量
   */
  getViewerCount(): number {
    return this.viewerClients.size;
  }

  /**
   * 获取 token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * 广播消息到所有 viewer 客户端
   */
  private emitToViewers(event: string, data?: unknown): void {
    for (const client of this.viewerClients) {
      this.emitToClient(client, event, data);
    }
  }

  /**
   * 发送消息到指定客户端
   */
  private emitToClient(client: BaseClient, event: string, data?: unknown): void {
    switch (event) {
      case 'browser:frame':
        client.onFrame(data as string);
        break;
      case 'browser:urlChanged':
        client.onUrlChanged(data as string);
        break;
      case 'browser:connected':
        client.onConnected(data as { url: string; targetId: string | null });
        break;
      case 'browser:pageCreated':
        client.onPageCreated(data as { targetId: string; url: string; title: string });
        break;
      case 'browser:pageDestroyed':
        client.onPageDestroyed(data as { targetId: string });
        break;
      case 'browser:pageInfoChanged':
        client.onPageInfoChanged(data as { targetId: string; url: string; title: string });
        break;
      case 'browser:pageSwitched':
        client.onPageSwitched(data as { targetId: string; url: string });
        break;
      case 'browser:pageList':
        client.onPageList(data as { pages: unknown[]; activeTargetId: string | null });
        break;
      case 'browser:error':
        client.onError(data as string);
        break;
    }
  }

  /**
   * 通过检查 document.visibilityState 找到当前活跃的页面
   */
  private async findActiveTarget(): Promise<string | null> {
    if (!this.browserClient) return null;

    const targets = await this.browserClient.Target.getTargets();
    const pages = targets.targetInfos.filter(
      (t: { type: string; url: string }) => t.type === 'page' && t.url !== 'about:blank'
    );

    for (const page of pages) {
      try {
        const tempClient = await CDP({
          local: true,
          target: `ws://${END_POINT_HOST}:${END_POINT_PORT}/page/${page.targetId}?token=${this.token}`
        });

        await tempClient.Runtime.enable();

        const result = await tempClient.Runtime.evaluate({
          expression: 'document.visibilityState',
          returnByValue: true,
        });

        await tempClient.close();

        if (result.result.value === 'visible') {
          logger.debug(`Found active page by visibilityState: ${page.targetId} ${page.url}`);
          return page.targetId;
        }
      } catch (e) {
        logger.warn(`Failed to check visibility for: ${page.targetId}`, e);
      }
    }

    if (pages.length > 0) {
      logger.debug(`No visible page found, fallback to first page: ${pages[0].targetId}`);
      return pages[0].targetId;
    }

    const allPages = targets.targetInfos.filter((t: { type: string }) => t.type === 'page');
    return allPages.length > 0 ? allPages[0].targetId : null;
  }

  /**
   * 连接到指定页面并初始化
   */
  private async connectToPage(targetId: string): Promise<void> {
    this.client = await CDP({
      local: true,
      target: `ws://${END_POINT_HOST}:${END_POINT_PORT}/page/${targetId}?token=${this.token}`
    });
    this.targetId = targetId;

    const { Page, Runtime } = this.client;

    await Page.enable();
    await Runtime.enable();

    Page.frameNavigated((params) => {
      if (params.frame.parentId === undefined) {
        this.currentUrl = params.frame.url;
        this.emitToViewers('browser:urlChanged', this.currentUrl);
      }
    });

    const { frameTree } = await Page.getFrameTree();
    this.currentUrl = frameTree.frame.url;

    await this.client.Emulation.setDeviceMetricsOverride(DEFAULT_VIEWPORT);

    // 只在有 viewer 时启动 screencast
    if (this.viewerClients.size > 0) {
      await this.startScreencast();
    }

    logger.debug(`Connected to page: ${targetId} ${this.currentUrl}`);
  }

  /**
   * 连接到浏览器
   */
  async connectToBrowser(token: string): Promise<void> {
    try {
      this.token = token;
      logger.info(`Connecting to remote browser with token: ${token}`);

      this.browserClient = await CDP({
        local: true,
        target: `ws://${END_POINT_HOST}:${END_POINT_PORT}/browser?token=${this.token}`
      });

      await this.browserClient.Target.setDiscoverTargets({ discover: true });

      // 监听新页面创建
      this.browserClient.Target.targetCreated(async (params) => {
        if (params.targetInfo.type === 'page') {
          logger.debug(`New page created: ${params.targetInfo.targetId} ${params.targetInfo.url}`);
          if (this.browserClient) {
            await this.switchToPage(params.targetInfo.targetId);
          }
          this.emitToViewers('browser:pageCreated', {
            targetId: params.targetInfo.targetId,
            url: params.targetInfo.url,
            title: params.targetInfo.title,
          });
          this.emitPageList();
        }
      });

      // 监听页面销毁
      this.browserClient.Target.targetDestroyed(async (params) => {
        logger.debug(`Page destroyed: ${params.targetId}`);
        this.emitToViewers('browser:pageDestroyed', { targetId: params.targetId });
        if (!this.browserClient) return;

        if (this.targetId === params.targetId) {
          const targets = await this.browserClient.Target.getTargets();
          const remainingPage = targets.targetInfos.find((t: { type: string }) => t.type === 'page');

          if (remainingPage) {
            await this.switchToPage(remainingPage.targetId);
          } else {
            await this.createNewPage();
          }
        }
        this.emitPageList();
      });

      // 监听页面信息变化
      this.browserClient.Target.targetInfoChanged((params) => {
        if (params.targetInfo.type === 'page') {
          logger.debug(`Page info changed: ${params.targetInfo.targetId} ${params.targetInfo.url}`);
          this.emitToViewers('browser:pageInfoChanged', {
            targetId: params.targetInfo.targetId,
            url: params.targetInfo.url,
            title: params.targetInfo.title,
          });
          this.emitPageList();
        }
      });

      const activeTargetId = await this.findActiveTarget();

      if (activeTargetId) {
        await this.connectToPage(activeTargetId);
        logger.debug('Connected to active page');
      } else {
        const { targetId } = await this.browserClient.Target.createTarget({
          url: 'about:blank',
        });
        await this.connectToPage(targetId);
        logger.debug(`Created new page, target: ${targetId}`);
      }

      this.emitToViewers('browser:connected', {
        url: this.currentUrl,
        targetId: this.targetId,
      });
      logger.info(`Browser session started, current URL: ${this.currentUrl}`);

      await this.emitPageList();
    } catch (error) {
      logger.error('Failed to start browser session:', error);
      this.emitToViewers('browser:error', (error as Error).message);
    }
  }

  /**
   * 发送页面列表到所有 viewer 客户端
   */
  private async emitPageList(): Promise<void> {
    if (!this.browserClient) return;
    try {
      const targets = await this.browserClient.Target.getTargets();
      const pages: PageInfo[] = targets
        .targetInfos
        .filter((t: { type: string }) => t.type === 'page');

      this.emitToViewers('browser:pageList', {
        pages,
        activeTargetId: this.targetId,
      });
    } catch (error) {
      logger.error('Failed to get page list:', error);
    }
  }

  /**
   * 切换到指定页面
   */
  async switchToPage(targetId: string): Promise<void> {
    if (targetId === this.targetId) return;

    try {
      logger.debug(`Switching to page: ${targetId}`);

      if (this.client) {
        try {
          await this.client.Page.stopScreencast();
        } catch (e) {
          // 忽略停止错误
        }
        try {
          await this.client.close();
        } catch (e) {
          // 忽略关闭错误
        }
        this.client = null;
        this.screencastStarted = false;
      }

      if (this.browserClient) {
        try {
          await this.browserClient.Target.activateTarget({ targetId });
        } catch (e) {
          logger.warn('Failed to activate target:', e);
        }
      }

      await this.connectToPage(targetId);

      this.emitToViewers('browser:pageSwitched', {
        targetId,
        url: this.currentUrl,
      });

      await this.emitPageList();

      logger.debug(`Switched to page: ${targetId} ${this.currentUrl}`);
    } catch (error) {
      logger.error('Failed to switch page:', error);
      this.emitToViewers('browser:error', (error as Error).message);
    }
  }

  /**
   * 创建新页面
   */
  async createNewPage(url: string = 'about:blank'): Promise<void> {
    if (!this.browserClient) return;

    try {
      logger.debug(`Creating new page: ${url}`);
      await this.browserClient.Target.createTarget({ url });
    } catch (error) {
      logger.error('Failed to create new page:', error);
      this.emitToViewers('browser:error', (error as Error).message);
    }
  }

  /**
   * 关闭指定页面
   */
  async closePage(targetId: string): Promise<void> {
    if (!this.browserClient) return;

    try {
      logger.debug(`Closing page: ${targetId}`);
      await this.browserClient.Target.closeTarget({ targetId });
    } catch (error) {
      logger.error('Failed to close page:', error);
      this.emitToViewers('browser:error', (error as Error).message);
    }
  }

  /**
   * 导航到指定 URL
   */
  async navigate(url: string): Promise<void> {
    if (!this.client) {
      this.emitToViewers('browser:error', 'Browser not connected');
      return;
    }

    try {
      logger.debug(`Navigating to ${url}...`);
      await this.client.Page.navigate({ url });
    } catch (error) {
      logger.error('Navigation error:', error);
      this.emitToViewers('browser:error', (error as Error).message);
    }
  }

  /**
   * 后退
   */
  async goBack(): Promise<void> {
    if (!this.client) return;
    try {
      const { currentIndex, entries } = await this.client.Page.getNavigationHistory();
      if (currentIndex > 0) {
        await this.client.Page.navigateToHistoryEntry({ entryId: entries[currentIndex - 1].id });
      }
    } catch (error) {
      logger.error('Go back error:', error);
    }
  }

  /**
   * 前进
   */
  async goForward(): Promise<void> {
    if (!this.client) return;
    try {
      const { currentIndex, entries } = await this.client.Page.getNavigationHistory();
      if (currentIndex < entries.length - 1) {
        await this.client.Page.navigateToHistoryEntry({ entryId: entries[currentIndex + 1].id });
      }
    } catch (error) {
      logger.error('Go forward error:', error);
    }
  }

  /**
   * 刷新页面
   */
  async reload(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.Page.reload();
    } catch (error) {
      logger.error('Reload error:', error);
    }
  }

  /**
   * 鼠标点击
   */
  async clickAt(x: number, y: number): Promise<void> {
    if (!this.client) return;
    try {
      const { Input } = this.client;
      await Input.dispatchMouseEvent({
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await Input.dispatchMouseEvent({
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    } catch (error) {
      logger.error('Click error:', error);
    }
  }

  /**
   * 鼠标移动
   */
  async mouseMove(x: number, y: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.Input.dispatchMouseEvent({
        type: 'mouseMoved',
        x,
        y,
      });
    } catch (error) {
      logger.error('Mouse move error:', error);
    }
  }

  /**
   * 鼠标滚动
   */
  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.Input.dispatchMouseEvent({
        type: 'mouseWheel',
        x,
        y,
        deltaX,
        deltaY,
      });
    } catch (error) {
      logger.error('Scroll error:', error);
    }
  }

  /**
   * 键盘按下
   */
  async keyDown(key: string, code: string, modifiers: KeyModifiers): Promise<void> {
    if (!this.client) return;
    try {
      const { getModifierFlags, getKeyCode } = await import('../utils');
      const modifierFlags = getModifierFlags(modifiers);
      await this.client.Input.dispatchKeyEvent({
        type: 'keyDown',
        key,
        code,
        modifiers: modifierFlags,
        windowsVirtualKeyCode: getKeyCode(key, code),
        nativeVirtualKeyCode: getKeyCode(key, code),
      });

      if (key.length === 1) {
        await this.client.Input.dispatchKeyEvent({
          type: 'char',
          text: key,
          key,
          code,
          modifiers: modifierFlags,
        });
      }
    } catch (error) {
      logger.error('KeyDown error:', error);
    }
  }

  /**
   * 键盘释放
   */
  async keyUp(key: string, code: string, modifiers: KeyModifiers): Promise<void> {
    if (!this.client) return;
    try {
      const { getModifierFlags, getKeyCode } = await import('../utils');
      const modifierFlags = getModifierFlags(modifiers);
      await this.client.Input.dispatchKeyEvent({
        type: 'keyUp',
        key,
        code,
        modifiers: modifierFlags,
        windowsVirtualKeyCode: getKeyCode(key, code),
        nativeVirtualKeyCode: getKeyCode(key, code),
      });
    } catch (error) {
      logger.error('KeyUp error:', error);
    }
  }

  /**
   * 设置 IME 组合文本
   */
  async imeSetComposition(text: string, selectionStart: number, selectionEnd: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.Input.imeSetComposition({
        text,
        selectionStart,
        selectionEnd,
      });
    } catch (error) {
      logger.error('IME set composition error:', error);
    }
  }

  /**
   * 提交 IME 输入
   */
  async imeCommitComposition(text: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.Input.insertText({ text });
    } catch (error) {
      logger.error('IME commit composition error:', error);
    }
  }

  /**
   * 直接插入文本
   */
  async insertText(text: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.Input.insertText({ text });
    } catch (error) {
      logger.error('Insert text error:', error);
    }
  }

  /**
   * 获取页面快照（Accessibility Tree）
   * @param interestingOnly 是否只返回有意义的节点（默认 true）
   * @param compressed 是否返回压缩的文本格式（默认 true）
   */
  async getSnapshot(interestingOnly: boolean = true, compressed: boolean = true): Promise<{ snapshot: unknown } | null> {
    if (!this.client) return null;
    try {
      await this.client.Accessibility.enable();
      const result = await this.client.Accessibility.getFullAXTree();
      
      let nodes = result.nodes;
      
      if (interestingOnly) {
        // 过滤只保留 interesting 节点
        nodes = this.filterInterestingNodes(result.nodes);
      }
      
      if (compressed) {
        // 返回压缩的文本格式
        const compressedSnapshot = this.compressAXTreeToText(nodes);
        return { snapshot: compressedSnapshot };
      }
      
      return { snapshot: nodes };
    } catch (error) {
      logger.error('Get snapshot error:', error);
      return null;
    }
  }

  /**
   * 将 AXTree 节点数组压缩为文本格式
   * 格式: uid=nodeId role "name" [attributes]
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private compressAXTreeToText(nodes: any[]): string {
    if (!nodes || nodes.length === 0) return '';

    // 构建节点 map 和父子关系
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeMap = new Map<string, any>();
    const childrenMap = new Map<string, string[]>();
    const parentMap = new Map<string, string>();

    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
      if (node.childIds) {
        childrenMap.set(node.nodeId, node.childIds);
        for (const childId of node.childIds) {
          parentMap.set(childId, node.nodeId);
        }
      }
    }

    const lines: string[] = [];
    const rootId = nodes[0]?.nodeId;
    
    if (rootId) {
      this.buildCompressedTree(rootId, 0, nodeMap, childrenMap, lines);
    }

    return lines.join('\n');
  }

  /**
   * 递归构建压缩的树形文本
   */
  private buildCompressedTree(
    nodeId: string,
    depth: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeMap: Map<string, any>,
    childrenMap: Map<string, string[]>,
    lines: string[]
  ): void {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const line = this.formatNodeLine(node, depth);
    if (line) {
      lines.push(line);
    }

    // 递归处理子节点
    const children = childrenMap.get(nodeId) || [];
    for (const childId of children) {
      this.buildCompressedTree(childId, depth + 1, nodeMap, childrenMap, lines);
    }
  }

  /**
   * 格式化单个节点为一行文本
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatNodeLine(node: any, depth: number): string | null {
    const role = node.role?.value || '';
    
    // 跳过 ignored 节点
    if (role === 'Ignored' || node.ignored) {
      return null;
    }

    // 获取节点属性
    const name = this.getNodeProperty(node, 'name');
    const url = this.getNodeProperty(node, 'url');
    const value = this.getNodeProperty(node, 'value');
    const focusable = this.getNodeProperty(node, 'focusable');
    const focused = this.getNodeProperty(node, 'focused');
    const multiline = this.getNodeProperty(node, 'multiline');
    const checked = this.getNodeProperty(node, 'checked');
    const expanded = this.getNodeProperty(node, 'expanded');
    const selected = this.getNodeProperty(node, 'selected');
    const disabled = this.getNodeProperty(node, 'disabled');
    const required = this.getNodeProperty(node, 'required');
    const level = this.getNodeProperty(node, 'level');
    
    // 获取 backendDOMNodeId
    const backendNodeId = node.backendDOMNodeId;

    // 构建缩进
    const indent = '  '.repeat(depth);

    // 构建 uid（使用简化的 id 或 backendDOMNodeId）
    const uid = backendNodeId ? `${depth}_${backendNodeId}` : node.nodeId;

    // 构建属性部分
    const attrs: string[] = [];
    
    if (url) attrs.push(`url="${url}"`);
    if (focusable) attrs.push('focusable');
    if (focused) attrs.push('focused');
    if (multiline) attrs.push('multiline');
    if (checked === 'true' || checked === true) attrs.push('checked');
    if (checked === 'mixed') attrs.push('checked=mixed');
    if (expanded === true) attrs.push('expanded');
    if (expanded === false) attrs.push('collapsed');
    if (selected) attrs.push('selected');
    if (disabled) attrs.push('disabled');
    if (required) attrs.push('required');
    if (level) attrs.push(`level=${level}`);
    if (value !== undefined && value !== name) attrs.push(`value="${value}"`);

    // 构建行
    let line = `${indent}uid=${uid} ${role}`;
    
    // 添加名称（如果有）
    if (name) {
      line += ` "${name}"`;
    }
    
    // 添加属性
    if (attrs.length > 0) {
      line += ' ' + attrs.join(' ');
    }

    return line;
  }

  // ========== Accessibility Tree 过滤相关 ==========

  /**
   * 控件角色列表（用于判断节点是否为控件）
   */
  private static readonly CONTROL_ROLES = new Set([
    'button', 'checkbox', 'combobox', 'listbox', 'menu', 'menubar', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'option', 'progressbar', 'radio',
    'scrollbar', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab',
    'tablist', 'textbox', 'tree', 'treeitem', 'link', 'gridcell',
  ]);

  /**
   * 地标角色列表
   */
  private static readonly LANDMARK_ROLES = new Set([
    'banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation',
    'region', 'search',
  ]);

  /**
   * 叶子节点角色列表（即使有子节点也视为叶子）
   */
  private static readonly LEAF_ROLES = new Set([
    'textbox', 'searchbox', 'image', 'progressbar', 'slider', 'separator',
    'meter', 'scrollbar', 'spinbutton',
  ]);

  /**
   * 过滤 AX Tree 节点，只保留 interesting 节点
   * 参考 Puppeteer 的 interestingOnly 实现
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private filterInterestingNodes(nodes: any[]): any[] {
    // 构建节点 map 和父子关系
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeMap = new Map<string, any>();
    const childrenMap = new Map<string, string[]>();
    
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
      if (node.childIds) {
        childrenMap.set(node.nodeId, node.childIds);
      }
    }

    // 收集 interesting 节点
    const interestingNodeIds = new Set<string>();
    this.collectInterestingNodes(nodes[0]?.nodeId, nodeMap, childrenMap, interestingNodeIds, false);

    // 过滤并重建树
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredNodes: any[] = [];
    for (const node of nodes) {
      if (interestingNodeIds.has(node.nodeId)) {
        // 过滤 childIds，只保留 interesting 的子节点
        const filteredNode = { ...node };
        if (filteredNode.childIds) {
          filteredNode.childIds = filteredNode.childIds.filter((id: string) => interestingNodeIds.has(id));
          if (filteredNode.childIds.length === 0) {
            delete filteredNode.childIds;
          }
        }
        filteredNodes.push(filteredNode);
      }
    }

    return filteredNodes;
  }

  /**
   * 递归收集 interesting 节点
   */
  private collectInterestingNodes(
    nodeId: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeMap: Map<string, any>,
    childrenMap: Map<string, string[]>,
    interestingIds: Set<string>,
    insideControl: boolean
  ): void {
    if (!nodeId) return;
    
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const isInteresting = this.isInterestingNode(node, nodeMap, childrenMap, insideControl);
    
    if (isInteresting) {
      interestingIds.add(nodeId);
      // 如果节点 interesting，其所有祖先也应该 interesting
      this.markAncestorsInteresting(nodeId, (id: string) => {
        // 找父节点（遍历所有节点找到包含此 id 的 childIds）
        for (const [parentId, children] of childrenMap) {
          if (children.includes(id)) {
            return parentId;
          }
        }
        return undefined;
      }, interestingIds);
    }

    // 递归处理子节点
    const children = childrenMap.get(nodeId) || [];
    const isControl = BrowserSession.CONTROL_ROLES.has(node.role?.value || '');
    
    for (const childId of children) {
      this.collectInterestingNodes(childId, nodeMap, childrenMap, interestingIds, insideControl || isControl);
    }
  }

  /**
   * 标记所有祖先节点为 interesting
   */
  private markAncestorsInteresting(
    nodeId: string,
    getParent: (nodeId: string) => string | undefined,
    interestingIds: Set<string>
  ): void {
    let parentId = getParent(nodeId);
    while (parentId) {
      if (interestingIds.has(parentId)) break;
      interestingIds.add(parentId);
      parentId = getParent(parentId);
    }
  }

  /**
   * 判断节点是否 interesting
   * 参考 Puppeteer 的判断逻辑
   */
  private isInterestingNode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeMap: Map<string, any>,
    childrenMap: Map<string, string[]>,
    insideControl: boolean
  ): boolean {
    const role = node.role?.value || '';
    const name = this.getNodeProperty(node, 'name');
    const description = this.getNodeProperty(node, 'description');
    
    // 忽略的角色
    if (role === 'Ignored' || node.ignored) {
      return false;
    }

    // 地标角色
    if (BrowserSession.LANDMARK_ROLES.has(role)) {
      return true;
    }

    // 控件角色
    if (BrowserSession.CONTROL_ROLES.has(role)) {
      return true;
    }

    // 有特定属性的节点
    const focusable = this.getNodeProperty(node, 'focusable');
    const editable = this.getNodeProperty(node, 'editable');
    const modal = this.getNodeProperty(node, 'modal');
    const live = this.getNodeProperty(node, 'live');

    if (focusable || editable || modal || (live && live !== 'off')) {
      return true;
    }

    // heading 有名称
    if (role === 'heading' && name) {
      return true;
    }

    // 在控件内部的非可聚焦节点不 interesting
    if (insideControl && !focusable) {
      return false;
    }

    // 叶子节点且有名称或描述
    const isLeaf = this.isLeafNode(node, nodeMap, childrenMap);
    if (isLeaf && (name || description)) {
      return true;
    }

    // 图片有名称
    if (role === 'image' && name) {
      return true;
    }

    // 静态文本有内容
    if ((role === 'StaticText' || role === 'text') && name) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否为叶子节点
   */
  private isLeafNode(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeMap: Map<string, any>,
    childrenMap: Map<string, string[]>
  ): boolean {
    const role = node.role?.value || '';
    
    // 特定角色视为叶子
    if (BrowserSession.LEAF_ROLES.has(role)) {
      return true;
    }

    // 没有子节点
    const children = childrenMap.get(node.nodeId) || [];
    if (children.length === 0) {
      return true;
    }

    // 所有子节点都是 ignored 或纯文本
    const allChildrenTrivial = children.every(childId => {
      const child = nodeMap.get(childId);
      if (!child) return true;
      const childRole = child.role?.value || '';
      return child.ignored || childRole === 'StaticText' || childRole === 'text' || childRole === 'none';
    });

    return allChildrenTrivial;
  }

  /**
   * 获取节点属性值
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getNodeProperty(node: any, propertyName: string): any {
    // 先检查 properties 数组
    if (node.properties) {
      const prop = node.properties.find((p: { name: string }) => p.name === propertyName);
      if (prop) return prop.value?.value ?? prop.value;
    }
    // 再检查 name/description 等直接属性
    if (node[propertyName]) {
      return node[propertyName].value ?? node[propertyName];
    }
    return undefined;
  }

  /**
   * 通过 backendNodeId 点击元素
   * @param backendNodeId 元素的 backendDOMNodeId，来自 accessibility snapshot
   */
  async click(backendNodeId: number): Promise<void> {
    if (!this.client) return;
    try {
      const { DOM, Input } = this.client;
      
      // 启用 DOM
      await DOM.enable();
      
      // 通过 backendNodeId 获取元素的盒模型
      const boxModel = await DOM.getBoxModel({ backendNodeId });
      
      if (!boxModel || !boxModel.model || !boxModel.model.content) {
        throw new Error(`Element with backendNodeId ${backendNodeId} not found or has no box model`);
      }
      
      // content 是一个数组 [x1, y1, x2, y2, x3, y3, x4, y4]，表示四个角的坐标
      // 计算元素中心点
      const content = boxModel.model.content;
      const centerX = (content[0] + content[2] + content[4] + content[6]) / 4;
      const centerY = (content[1] + content[3] + content[5] + content[7]) / 4;
      
      logger.info(`Click element backendNodeId=${backendNodeId} at (${centerX}, ${centerY})`);
      
      // 执行点击
      await Input.dispatchMouseEvent({
        type: 'mousePressed',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1,
      });
      await Input.dispatchMouseEvent({
        type: 'mouseReleased',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1,
      });
    } catch (error) {
      logger.error('Click by backendNodeId error:', error);
      throw error;
    }
  }

  /**
   * 通过 backendNodeId 填充输入框
   * @param backendNodeId 元素的 backendDOMNodeId，来自 accessibility snapshot
   * @param value 要填充的值
   */
  async fill(backendNodeId: number, value: string): Promise<void> {
    if (!this.client) return;
    try {
      const { DOM, Input } = this.client;
      
      // 启用 DOM
      await DOM.enable();
      
      // focus 到目标元素 (使用 backendNodeId)
      await DOM.focus({ backendNodeId });
      
      // 先清空现有内容（全选后删除）
      await Input.dispatchKeyEvent({
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: 2, // Ctrl/Cmd
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
      });
      await Input.dispatchKeyEvent({
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        modifiers: 2,
        windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65,
      });
      
      // 删除选中内容
      await Input.dispatchKeyEvent({
        type: 'keyDown',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8,
      });
      await Input.dispatchKeyEvent({
        type: 'keyUp',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8,
      });
      
      // 插入新文本
      await Input.insertText({ text: value });
      
      logger.info(`Fill element backendNodeId=${backendNodeId} with value: ${value}`);
    } catch (error) {
      logger.error('Fill by backendNodeId error:', error);
      throw error;
    }
  }

  /**
   * 获取页面截图
   */
  async getScreenshot(options?: {
    format?: 'jpeg' | 'png' | 'webp';
    quality?: number;
    fullPage?: boolean;
  }): Promise<{ data: string; format: string } | null> {
    if (!this.client) return null;
    try {
      const format = options?.format || 'png';
      const quality = options?.quality || 80;

      let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;

      if (options?.fullPage) {
        // 获取完整页面尺寸
        const layoutMetrics = await this.client.Page.getLayoutMetrics();
        clip = {
          x: 0,
          y: 0,
          width: layoutMetrics.contentSize.width,
          height: layoutMetrics.contentSize.height,
          scale: 1,
        };
      }

      const result = await this.client.Page.captureScreenshot({
        format,
        quality: format === 'png' ? undefined : quality,
        clip,
        captureBeyondViewport: options?.fullPage,
      });

      return { data: result.data, format };
    } catch (error) {
      logger.error('Get screenshot error:', error);
      return null;
    }
  }

  /**
   * 尝试启动 screencast（按需）
   */
  private async tryStartScreencast(): Promise<void> {
    if (this.screencastStarted || this.viewerClients.size === 0) return;
    await this.startScreencast();
  }

  /**
   * 尝试停止 screencast（按需）
   */
  private async tryStopScreencast(): Promise<void> {
    if (!this.screencastStarted || this.viewerClients.size > 0) return;
    await this.stopScreencast();
  }

  /**
   * 启动 screencast
   */
  private async startScreencast(): Promise<void> {
    if (!this.client || this.screencastStarted) return;

    try {
      const { Page } = this.client;

      Page.screencastFrame((frame) => {
        this.emitToViewers('browser:frame', frame.data);
        Page.screencastFrameAck({ sessionId: frame.sessionId }).catch(() => {});
      });

      Page.screencastVisibilityChanged((visibility) => {
        logger.debug(`Screencast visibility changed: ${visibility.visible}`);
      });

      await Page.startScreencast(SCREENCAST_CONFIG);
      this.screencastStarted = true;
      logger.debug(`Screencast started for target: ${this.targetId}`);
    } catch (error) {
      logger.error('Failed to start screencast:', error);
      this.emitToViewers('browser:error', `Screencast error: ${(error as Error).message}`);
    }
  }

  /**
   * 停止 screencast
   */
  private async stopScreencast(): Promise<void> {
    if (!this.client || !this.screencastStarted) return;

    try {
      await this.client.Page.stopScreencast();
      this.screencastStarted = false;
      logger.debug(`Screencast stopped for target: ${this.targetId}`);
    } catch (error) {
      logger.error('Failed to stop screencast:', error);
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.Page.stopScreencast();
        await this.client.close();
      } catch (e) {
        logger.error('Error stopping session:', e);
      }
      this.client = null;
    }

    if (this.browserClient) {
      try {
        await this.browserClient.close();
      } catch (e) {
        logger.error('Error closing browser client:', e);
      }
      this.browserClient = null;
    }

    this.targetId = null;
    this.token = '';
    this.screencastStarted = false;
    this.viewerClients.clear();
    this.apiClients.clear();
    logger.info('Browser session disconnected');
  }
}
