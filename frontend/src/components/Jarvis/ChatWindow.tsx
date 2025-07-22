// components/Jarvis/ChatWindow.tsx
import React, { RefObject } from 'react';

interface ChatWindowProps {
  responseLog: string[];
  loading: boolean;
  endRef: RefObject<HTMLDivElement>;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ responseLog, loading, endRef }) => (
  <div className="flex-1 overflow-y-auto bg-base-100 rounded p-4 space-y-4">
    {responseLog.map((msg, i) => {
      const isJarvis = msg.startsWith('JARVIS');
      const content = msg.replace(/^JARVIS:\s?|^USER:\s?/, '');
      const variant = isJarvis ? 'primary' : 'secondary';

      return (
        <div key={i} className={`chat ${isJarvis ? 'chat-end' : 'chat-start'}`}>
          <div className={`chat-bubble chat-bubble-${variant}`}>{content}</div>
        </div>
      );
    })}

    {loading && (
      <div className="chat chat-end">
        <div className="chat-bubble chat-bubble-primary flex gap-1">
          <span className="w-2 h-2 bg-white rounded-full animate-ping" />
          <span className="w-2 h-2 bg-white rounded-full animate-ping delay-150" />
          <span className="w-2 h-2 bg-white rounded-full animate-ping delay-300" />
        </div>
      </div>
    )}

    <div ref={endRef} />
  </div>
);

export default ChatWindow;
