/**
 * Renderer - 负责云浏览器画面的渲染和交互
 */
import EventEmitter from 'eventemitter3';
import type { RendererOptions, RendererEvents, KeyModifiers } from './types';

export class Renderer extends EventEmitter<RendererEvents> {
  private options: Required<RendererOptions>;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  // 实际渲染的图片尺寸
  private imageWidth: number = 1280;
  private imageHeight: number = 720;
  // IME 输入框（隐藏）
  private imeInput: HTMLInputElement;
  // 待发送的 keydown 事件队列（用于处理 IME 首字符问题）
  private pendingKeyDowns: Map<string, { key: string; code: string; modifiers: KeyModifiers }> = new Map();

  constructor(options: RendererOptions) {
    super();
    this.options = {
      width: 1280,
      height: 720,
      ...options,
    } as Required<RendererOptions>;

    // 创建 canvas 元素用于渲染截图
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.objectFit = 'contain';
    this.canvas.style.backgroundColor = '#000';
    this.canvas.style.cursor = 'pointer';

    this.ctx = this.canvas.getContext('2d')!;

    // 创建隐藏的 IME 输入框
    this.imeInput = this.createImeInput();

    // 绑定事件
    this.bindEvents();

    // 添加到容器
    this.options.container.appendChild(this.canvas);
    this.options.container.appendChild(this.imeInput);
  }

  /**
   * 创建隐藏的 IME 输入框
   */
  private createImeInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.style.width = '1px';
    input.style.height = '1px';
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    return input;
  }

  /**
   * 绑定鼠标事件
   */
  private bindEvents(): void {
    // 让 canvas 可以获取焦点
    this.canvas.tabIndex = 0;

    // 点击事件
    this.canvas.addEventListener('click', (e) => {
      const coords = this.getScaledCoordinates(e);
      if (coords) {
        this.emit('click', coords.x, coords.y);
      }
    });

    // 鼠标移动事件（节流）
    let lastMoveTime = 0;
    this.canvas.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMoveTime < 50) return; // 50ms 节流
      lastMoveTime = now;

      const coords = this.getScaledCoordinates(e);
      if (coords) {
        this.emit('mouseMove', coords.x, coords.y);
      }
    });

    // 滚动事件
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault(); // 阻止默认滚动行为
      
      const coords = this.getScaledCoordinates(e);
      if (coords) {
        this.emit('scroll', coords.x, coords.y, e.deltaX, e.deltaY);
      }
    }, { passive: false });

    // 键盘按下事件
    this.canvas.addEventListener('keydown', (e) => {
      e.preventDefault(); // 阻止默认行为
      
      const modifiers = this.getKeyModifiers(e);
      this.emit('keyDown', e.key, e.code, modifiers);
    });

    // 键盘释放事件
    this.canvas.addEventListener('keyup', (e) => {
      e.preventDefault();
      
      const modifiers = this.getKeyModifiers(e);
      this.emit('keyUp', e.key, e.code, modifiers);
    });

    // 点击 canvas 时聚焦到 IME 输入框
    this.canvas.addEventListener('mousedown', () => {
      this.imeInput.focus();
    });

    // IME 事件绑定
    this.bindImeEvents();
  }

  /**
   * 绑定 IME 事件
   */
  private bindImeEvents(): void {
    // IME 组合开始 - 清除所有待发送的 keydown（因为最后一个按键触发了 IME）
    this.imeInput.addEventListener('compositionstart', () => {
      this.pendingKeyDowns.clear(); // 全部丢弃
      this.emit('imeCompositionStart');
    });

    // IME 组合更新（输入拼音时触发）
    this.imeInput.addEventListener('compositionupdate', (e) => {
      const text = e.data || '';
      this.emit('imeCompositionUpdate', text, 0, text.length);
    });

    // IME 组合结束（选中候选词后触发）
    this.imeInput.addEventListener('compositionend', (e) => {
      const text = e.data || '';
      this.emit('imeCompositionEnd', text);
      // 清空输入框
      this.imeInput.value = '';
    });

    // keydown: 对于可能触发 IME 的按键，先暂存不发送
    this.imeInput.addEventListener('keydown', (e) => {
      // 已经在 IME 组合中，直接忽略
      if (e.isComposing) return;
      
      const key = e.key;
      const code = e.code;
      const modifiers = this.getKeyModifiers(e);
      
      // 判断是否可能触发 IME（单字符且无修饰键）
      const mayTriggerIME = key.length === 1 && 
                           !modifiers.ctrl && 
                           !modifiers.alt && 
                           !modifiers.meta;
      
      if (mayTriggerIME) {
        // 用 code 作为 key，暂存到队列中
        this.pendingKeyDowns.set(code, { key, code, modifiers });
      } else {
        // 功能键、快捷键等直接发送
        e.preventDefault();
        this.emit('keyDown', key, code, modifiers);
      }
    });

    // keyup: 检查 isComposing，决定是否发送暂存的 keydown
    this.imeInput.addEventListener('keyup', (e) => {
      const key = e.key;
      const code = e.code;
      const modifiers = this.getKeyModifiers(e);
      
      // 如果 keyup 时 isComposing 为 true，说明进入了 IME 组合
      // 删除对应的 pending keydown，不发送
      if (e.isComposing) {
        this.pendingKeyDowns.delete(code);
        return;
      }
      
      // isComposing 为 false，说明是普通输入
      // 发送对应的 keydown（如果存在）和当前的 keyup
      const pendingKeyDown = this.pendingKeyDowns.get(code);
      if (pendingKeyDown) {
        this.emit('keyDown', pendingKeyDown.key, pendingKeyDown.code, pendingKeyDown.modifiers);
        this.pendingKeyDowns.delete(code);
      }
      
      e.preventDefault();
      this.emit('keyUp', key, code, modifiers);
    });

    // 输入框失去焦点时，重新聚焦（保持输入能力）
    this.imeInput.addEventListener('blur', () => {
      // 延迟重新聚焦，避免与其他元素焦点冲突
      setTimeout(() => {
        if (document.activeElement !== this.imeInput && 
            this.options.container.contains(document.activeElement)) {
          this.imeInput.focus();
        }
      }, 100);
    });
  }

  /**
   * 获取键盘修饰键状态
   */
  private getKeyModifiers(e: KeyboardEvent): KeyModifiers {
    return {
      alt: e.altKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      shift: e.shiftKey,
    };
  }

  /**
   * 获取缩放后的坐标（将 canvas 显示坐标转换为实际图片坐标）
   */
  private getScaledCoordinates(e: MouseEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    
    // 鼠标在 canvas 元素上的位置
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // canvas 元素的显示尺寸
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // 计算实际图片在 canvas 中的显示区域（考虑 object-fit: contain）
    const imageAspect = this.imageWidth / this.imageHeight;
    const displayAspect = displayWidth / displayHeight;

    let renderWidth: number, renderHeight: number;
    let offsetX = 0, offsetY = 0;

    if (imageAspect > displayAspect) {
      // 图片更宽，以宽度为准
      renderWidth = displayWidth;
      renderHeight = displayWidth / imageAspect;
      offsetY = (displayHeight - renderHeight) / 2;
    } else {
      // 图片更高，以高度为准
      renderHeight = displayHeight;
      renderWidth = displayHeight * imageAspect;
      offsetX = (displayWidth - renderWidth) / 2;
    }

    // 检查点击是否在图片区域内
    if (canvasX < offsetX || canvasX > offsetX + renderWidth ||
        canvasY < offsetY || canvasY > offsetY + renderHeight) {
      return null;
    }

    // 转换为图片坐标
    const x = Math.round(((canvasX - offsetX) / renderWidth) * this.imageWidth);
    const y = Math.round(((canvasY - offsetY) / renderHeight) * this.imageHeight);

    return { x, y };
  }

  /**
   * 从 Base64 渲染画面
   */
  renderFrame(base64: string): void {
    const img = new Image();
    
    img.onload = () => {
      // 更新图片尺寸
      this.imageWidth = img.width;
      this.imageHeight = img.height;

      // 更新 canvas 尺寸以匹配图片
      if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
      }
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };

    img.src = `data:image/jpeg;base64,${base64}`;
  }

  /**
   * 清空画面
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * 获取 canvas 元素
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 销毁渲染层
   */
  destroy(): void {
    this.removeAllListeners();
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.imeInput.parentNode) {
      this.imeInput.parentNode.removeChild(this.imeInput);
    }
  }
}
