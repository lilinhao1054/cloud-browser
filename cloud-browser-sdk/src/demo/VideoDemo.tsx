import React from 'react'

const VideoDemo: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Cloud Browser 演示视频</h1>
      <div className="w-full max-w-4xl rounded-lg overflow-hidden shadow-2xl">
        <video
          className="w-full"
          controls
          autoPlay
          playsInline
        >
          <source src="/CloudBrowser.mp4" type="video/mp4" />
          您的浏览器不支持视频播放
        </video>
      </div>
      <a
        href="/"
        className="mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        返回 Demo
      </a>
    </div>
  )
}

export default VideoDemo
