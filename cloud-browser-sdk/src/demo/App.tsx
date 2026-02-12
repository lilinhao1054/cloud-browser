import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CloudBrowserSDK, PageInfo } from '../lib';

// 从环境变量读取配置
const SDK_SERVER_URL = import.meta.env.VITE_SDK_SERVER_URL;
const API_BASE = import.meta.env.VITE_API_BASE_URL;

// 最小宽度限制
const MIN_LEFT_WIDTH = 600;
const MIN_RIGHT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 320;

interface BrowserInstance {
  token: string;
  connected: boolean;
}

function App() {
  // SDK 状态
  const [connected, setConnected] = useState(false);
  const [browserConnected, setBrowserConnected] = useState(false);
  const [currentToken, setCurrentToken] = useState<string>('');
  const [inputUrl, setInputUrl] = useState('');
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string>('');
  const [textToInsert, setTextToInsert] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const normalContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<CloudBrowserSDK | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 浏览器管理状态
  const [browsers, setBrowsers] = useState<BrowserInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectingUuid, setConnectingUuid] = useState<string>(''); // 正在连接的浏览器

  // 拖拽调整宽度状态
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // 全屏模式状态
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 文件上传状态
  const [fileUploading, setFileUploading] = useState(false);

  // 拖拽处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = rightPanelWidth;
  }, [rightPanelWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const delta = dragStartX.current - e.clientX;
    const newWidth = dragStartWidth.current + delta;
    const maxWidth = window.innerWidth - MIN_LEFT_WIDTH;
    
    setRightPanelWidth(Math.max(MIN_RIGHT_WIDTH, Math.min(maxWidth, newWidth)));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 监听鼠标事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 初始化 SDK
  useEffect(() => {
    if (!containerRef.current) return;

    const sdk = new CloudBrowserSDK({
      serverUrl: SDK_SERVER_URL,
      container: containerRef.current,
      width: 1280,
      height: 720,
    });

    sdkRef.current = sdk;

    sdk.on('connected', () => setConnected(true));
    sdk.on('disconnected', () => {
      setConnected(false);
      setBrowserConnected(false);
      setCurrentToken('');
    });

    sdk.on('browser:connected', (data) => {
      setBrowserConnected(true);
      if (data?.url) setInputUrl(data.url);
      if (data?.targetId) setActiveTargetId(data.targetId);
    });

    sdk.on('browser:error', (error) => console.error('Browser error:', error));
    sdk.on('url:changed', (url) => setInputUrl(url));

    sdk.on('page:list', (data) => {
      setPages(data.pages);
      setActiveTargetId(data.activeTargetId);
    });

    sdk.on('page:switched', (data) => {
      setActiveTargetId(data.targetId);
      setInputUrl(data.url);
    });

    // 文件上传事件 - 点击 file input 时触发
    sdk.on('fileInput:detected', () => {
      // 触发隐藏的 file input
      fileInputRef.current?.click();
    });

    sdk.connect();

    return () => {
      sdk.destroy();
      sdkRef.current = null;
    };
  }, []);

  // 加载浏览器列表
  useEffect(() => {
    fetchBrowserList();
  }, []);

  const fetchBrowserList = async () => {
    try {
      const res = await fetch(`${API_BASE}/list`);
      const data = await res.json();
      if (data.success && data.data?.browsers) {
        setBrowsers(data.data.browsers.map((token: string) => ({
          token,
          connected: token === currentToken,
        })));
      } else if (data.message) {
        window.alert(data.message);
      }
    } catch (e) {
      console.error('Failed to fetch browser list:', e);
      window.alert('获取浏览器列表失败');
    }
  };

  // 启动新浏览器
  const startNewBrowser = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data?.token) {
        await fetchBrowserList();
      } else if (data.message) {
        window.alert(data.message);
      }
    } catch (e) {
      console.error('Failed to start browser:', e);
      window.alert('启动浏览器失败');
    } finally {
      setLoading(false);
    }
  };

  // 关闭浏览器
  const stopBrowserInstance = async (token: string) => {
    if (!window.confirm(`确定要关闭浏览器 ${token.substring(0, 8)}... 吗？`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchBrowserList();
      } else if (data.message) {
        window.alert(data.message);
      }
    } catch (e) {
      console.error('Failed to stop browser:', e);
      window.alert('关闭浏览器失败');
    } finally {
      setLoading(false);
    }
  };

  // 连接到浏览器
  const connectToBrowser = async (token: string) => {
    if (browserConnected && currentToken === token) return;
    
    // 先断开当前连接
    if (browserConnected) {
      sdkRef.current?.disconnectBrowser();
    }
    
    setConnectingUuid(token);
    try {
      await sdkRef.current?.connectBrowser(token);
      setCurrentToken(token);
      setBrowsers(prev => prev.map(b => ({ ...b, connected: b.token === token })));
    } catch (error) {
      console.error('Failed to connect browser:', error);
      window.alert(`连接浏览器失败: ${(error as Error).message}`);
      setCurrentToken('');
    } finally {
      setConnectingUuid('');
    }
  };

  // 断开当前连接
  const disconnectCurrentBrowser = () => {
    sdkRef.current?.disconnectBrowser();
    setBrowserConnected(false);
    setCurrentToken('');
    setInputUrl('');
    setPages([]);
    setBrowsers(prev => prev.map(b => ({ ...b, connected: false })));
  };

  // 导航操作
  const navigate = async () => {
    if (!inputUrl.trim()) return;
    try {
      await sdkRef.current?.navigate(inputUrl);
    } catch (error) {
      window.alert(`导航失败: ${(error as Error).message}`);
    }
  };
  
  const goBack = async () => {
    try {
      await sdkRef.current?.goBack();
    } catch (error) {
      console.error('Go back failed:', error);
    }
  };
  
  const goForward = async () => {
    try {
      await sdkRef.current?.goForward();
    } catch (error) {
      console.error('Go forward failed:', error);
    }
  };
  
  const reload = async () => {
    try {
      await sdkRef.current?.reload();
    } catch (error) {
      console.error('Reload failed:', error);
    }
  };
  
  const switchToPage = async (targetId: string) => {
    try {
      await sdkRef.current?.switchPage(targetId);
    } catch (error) {
      window.alert(`切换页面失败: ${(error as Error).message}`);
    }
  };
  
  const createNewPage = async () => {
    try {
      await sdkRef.current?.createNewPage();
    } catch (error) {
      window.alert(`创建页面失败: ${(error as Error).message}`);
    }
  };
  
  const closePage = async (targetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await sdkRef.current?.closePage(targetId);
    } catch (error) {
      window.alert(`关闭页面失败: ${(error as Error).message}`);
    }
  };

  const truncateText = (text: string, maxLen = 20) => 
    text.length <= maxLen ? text : text.substring(0, maxLen) + '...';

  // 发送文本到云浏览器
  const sendTextToInsert = () => {
    const text = textToInsert.trim();
    if (text && browserConnected) {
      sdkRef.current?.insertText(text);
      setTextToInsert('');
    }
  };

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sdkRef.current) return;

    setFileUploading(true);
    try {
      const result = await sdkRef.current.uploadFile(file);
      if (!result.success) {
        window.alert(`文件上传失败: ${result.message}`);
      }
    } catch (error) {
      window.alert(`文件上传失败: ${(error as Error).message}`);
    } finally {
      setFileUploading(false);
      // 清空 input 以便再次选择同一文件
      e.target.value = '';
    }
  };

  // 切换全屏模式
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // ESC 退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // 全屏切换时移动 canvas 元素
  useEffect(() => {
    if (!containerRef.current) return;
    
    const targetContainer = isFullscreen ? fullscreenContainerRef.current : normalContainerRef.current;
    if (targetContainer && containerRef.current.parentElement !== targetContainer) {
      targetContainer.appendChild(containerRef.current);
    }
  }, [isFullscreen]);

  return (
    <>
      {/* 隐藏的文件选择 input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 文件上传中遮罩 */}
      {fileUploading && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
          <div className="bg-gray-800 px-6 py-4 rounded-lg flex items-center gap-3">
            <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-white">文件上传中...</span>
          </div>
        </div>
      )}

      {/* 全屏模式 */}
      {isFullscreen && browserConnected && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
          {/* 全屏顶部栏 */}
          <div className="flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-700">
            <button onClick={goBack} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={goForward} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button onClick={reload} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div className="flex-1 flex">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigate()}
                placeholder="输入网址..."
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-l-lg border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={navigate}
                className="px-4 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600"
              >
                前往
              </button>
            </div>
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              title="退出全屏 (ESC)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </button>
          </div>
          {/* 全屏标签栏 */}
          {pages.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 border-b border-gray-700 overflow-x-auto">
              {pages.map((page) => (
                <div
                  key={page.targetId}
                  onClick={() => switchToPage(page.targetId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer min-w-0 max-w-48 ${
                    page.targetId === activeTargetId
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span className="truncate text-sm" title={page.title || page.url}>
                    {truncateText(page.title || page.url || '新标签页')}
                  </span>
                  <button
                    onClick={(e) => closePage(page.targetId, e)}
                    className="flex-shrink-0 p-0.5 hover:bg-gray-500 rounded"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={createNewPage}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}
          {/* 全屏浏览器画面容器 */}
          <div 
            ref={fullscreenContainerRef}
            className="flex-1 bg-black flex items-center justify-center overflow-auto"
          />
          {/* 全屏模式文本输入区域 */}
          <div className="flex items-center gap-2 p-2 bg-gray-800 border-t border-gray-700">
            <input
              type="text"
              value={textToInsert}
              onChange={(e) => setTextToInsert(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendTextToInsert();
                }
              }}
              placeholder="输入文本，按 Enter 发送到云浏览器输入框..."
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendTextToInsert}
              disabled={!textToInsert.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* 正常模式 */}
      <div className={`h-screen bg-gray-900 flex ${isFullscreen ? 'invisible' : ''}`}>
      {/* 左侧：浏览器画面和操作 */}
      <div className="flex-1 p-4 flex flex-col relative" style={{ minWidth: MIN_LEFT_WIDTH }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">Cloud Browser</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/video"
              className="px-3 py-1 rounded text-xs bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              演示视频
            </Link>
            <span className={`px-2 py-1 rounded text-xs ${
              connected ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {connected ? '已连接服务器' : '未连接'}
            </span>
            {browserConnected && (
              <span className="px-2 py-1 rounded text-xs bg-blue-600 text-white">
                浏览器已连接
              </span>
            )}
            {browserConnected && (
              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                title="全屏模式"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 标签栏 */}
        {browserConnected && pages.length > 0 && (
          <div className="flex items-center gap-1 mb-2 bg-gray-800 p-1 rounded-lg overflow-x-auto">
            {pages.map((page) => (
              <div
                key={page.targetId}
                onClick={() => switchToPage(page.targetId)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer min-w-0 max-w-48 ${
                  page.targetId === activeTargetId
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <span className="truncate text-sm" title={page.title || page.url}>
                  {truncateText(page.title || page.url || '新标签页')}
                </span>
                <button
                  onClick={(e) => closePage(page.targetId, e)}
                  className="flex-shrink-0 p-0.5 hover:bg-gray-500 rounded"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={createNewPage}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        )}

        {/* 导航栏 */}
        {browserConnected && (
          <div className="flex items-center gap-2 mb-4 bg-gray-800 p-2 rounded-lg">
            <button onClick={goBack} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={goForward} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button onClick={reload} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div className="flex-1 flex">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && navigate()}
                placeholder="输入网址..."
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-l-lg border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={navigate}
                className="px-4 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600"
              >
                前往
              </button>
            </div>
          </div>
        )}

        {/* 浏览器画面容器 */}
        <div 
          ref={normalContainerRef}
          className="flex-1 bg-black rounded-lg overflow-hidden border border-gray-700 min-h-[400px] flex items-center justify-center"
        >
          {/* SDK canvas 容器 */}
          <div ref={containerRef} className='w-full h-full' />
        </div>

        {/* 文本输入区域 */}
        {browserConnected && (
          <div className="mt-2 flex items-center gap-2 bg-gray-800 p-2 rounded-lg">
            <input
              type="text"
              value={textToInsert}
              onChange={(e) => setTextToInsert(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendTextToInsert();
                }
              }}
              placeholder="输入文本，按 Enter 发送到云浏览器输入框..."
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendTextToInsert}
              disabled={!textToInsert.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
        )}

        {/* 未连接浏览器时的提示 */}
        {!browserConnected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-gray-500 text-center">
              <p className="text-lg">请在右侧选择或启动一个浏览器</p>
            </div>
          </div>
        )}
      </div>

      {/* 拖拽分隔条 */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors flex-shrink-0 ${
          isDragging ? 'bg-blue-500' : ''
        }`}
      />

      {/* 右侧：浏览器管理面板 */}
      <div 
        className="bg-gray-800 p-4 border-l border-gray-700 flex flex-col flex-shrink-0"
        style={{ width: rightPanelWidth, minWidth: MIN_RIGHT_WIDTH }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">浏览器管理</h2>
          <button
            onClick={fetchBrowserList}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            title="刷新列表"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* 启动新浏览器按钮 */}
        <button
          onClick={startNewBrowser}
          disabled={loading || !connected}
          className="w-full mb-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          启动新浏览器
        </button>

        {/* 当前连接状态 */}
        {browserConnected && currentToken && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">当前连接</p>
                <p className="text-sm text-white font-mono truncate" title={currentToken}>
                  {truncateText(currentToken, 16)}
                </p>
              </div>
              <button
                onClick={disconnectCurrentBrowser}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                断开
              </button>
            </div>
          </div>
        )}

        {/* 浏览器实例列表 */}
        <div className="flex-1 overflow-y-auto">
          <p className="text-sm text-gray-400 mb-2">可用浏览器 ({browsers.length})</p>
          
          {browsers.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>暂无运行中的浏览器</p>
              <p className="text-sm mt-1">点击上方按钮启动一个</p>
            </div>
          ) : (
            <div className="space-y-2">
              {browsers.map((browser) => (
                <div
                  key={browser.token}
                  className={`p-3 rounded-lg border ${
                    browser.token === currentToken
                      ? 'bg-blue-900/20 border-blue-600'
                      : 'bg-gray-700 border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-gray-300 truncate flex-1" title={browser.token}>
                      {truncateText(browser.token, 20)}
                    </span>
                    {browser.token === currentToken && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">
                        当前
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {browser.token !== currentToken ? (
                      <button
                        onClick={() => connectToBrowser(browser.token)}
                        disabled={!connected || connectingUuid === browser.token}
                        className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        {connectingUuid === browser.token ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            连接中
                          </>
                        ) : '连接'}
                      </button>
                    ) : (
                      <button
                        onClick={disconnectCurrentBrowser}
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-500"
                      >
                        断开
                      </button>
                    )}
                    <button
                      onClick={() => stopBrowserInstance(browser.token)}
                      disabled={loading}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-600"
                      title="关闭浏览器"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

export default App;
