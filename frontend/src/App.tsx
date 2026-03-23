import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Bot, User, Upload, Settings, Sparkles, BookOpen, Folder, GraduationCap, Library } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const suggestions = [
  "Summarize my Calculus notes",
  "Generate exam questions",
  "Explain backpropagation",
  "Compare ML models"
];

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [indexedFiles, setIndexedFiles] = useState<string[]>(['Calculus III', 'Machine Learning 101']);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    let socket: WebSocket | null = null;

    if (useWebSocket) {
      console.log("Attempting to connect to WebSocket...");
      socket = new WebSocket('ws://localhost:8000/ask');

      socket.onopen = () => {
        console.log("WebSocket connected");
        wsRef.current = socket;
      };

      socket.onmessage = (event) => {
        console.log("WebSocket message received:", event.data);
        setMessages(prev => [...prev, { role: 'assistant', content: event.data }]);
        setIsTyping(false);
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsTyping(false);
      };

      socket.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        wsRef.current = null;
      };
    }

    return () => {
      if (socket) {
        console.log("Cleaning up WebSocket connection...");
        socket.close();
        wsRef.current = null;
      }
    };
  }, [useWebSocket]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input } as const;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    if (useWebSocket && wsRef.current) {
      wsRef.current.send(input);
    } else {
      try {
        const response = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input })
        });
        const data = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsTyping(false);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/add_pdf', {
        method: 'POST',
        body: formData
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            setUploadProgress(data.percent);
          } catch (e) {
            console.error('Error parsing progress:', e);
          }
        }
      }

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setIndexedFiles(prev => [...prev, file.name]);
        alert(`Successfully indexed: ${file.name}`);
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      setIsUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', fontFamily: "'Inter', sans-serif", color: '#111827', background: '#F9FAFB' }}>

      {/* ─── SIDEBAR ─── */}
      <aside style={{ width: 280, background: '#FFFFFF', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap style={{ color: 'white', width: 18, height: 18 }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 600, color: '#111827', letterSpacing: '-0.02em' }}>CampusAI</span>
        </div>

        {/* New Chat Button */}
        <div style={{ padding: '0 16px', marginBottom: 28 }}>
          <button
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#111827', color: 'white', fontWeight: 500, fontSize: 14, border: '1px solid #111827', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#111827'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#111827'; e.currentTarget.style.color = 'white'; }}
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Sidebar Content */}
        <div style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>

          {/* Courses Section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', padding: '0 8px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <BookOpen size={14} /> Courses
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {indexedFiles.map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 15, color: '#111827', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes Section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', padding: '0 8px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Folder size={14} /> Notes
            </div>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 15, color: '#111827', transition: 'background 0.15s', opacity: isUploading ? 0.5 : 1 }}
              onMouseEnter={(e) => !isUploading && (e.currentTarget.style.background = '#F3F4F6')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Upload size={16} style={{ color: '#6B7280' }} />
              <span>Upload PDF</span>
              <input type="file" style={{ display: 'none' }} accept=".pdf" onChange={handleFileUpload} />
            </label>

            {isUploading && (
              <div style={{ padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', fontWeight: 500, marginBottom: 8 }}>
                  <span>Indexing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    style={{ height: '100%', background: '#111827' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settings */}
        <div style={{ padding: 16, borderTop: '1px solid #E5E7EB' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 15, color: '#111827', transition: 'background 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Settings size={18} style={{ color: '#6B7280' }} />
            <span>Settings</span>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <header style={{ height: 64, borderBottom: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>CampusAI</div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>AI Study Assistant</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: useWebSocket ? '#111827' : '#9CA3AF', transition: 'color 0.15s' }}>
              Use Notes Context
            </span>
            <div
              onClick={() => setUseWebSocket(!useWebSocket)}
              style={{ width: 44, height: 24, borderRadius: 12, background: useWebSocket ? '#111827' : '#E5E7EB', padding: 2, cursor: 'pointer', transition: 'background 0.2s', position: 'relative' }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 10, background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', transition: 'transform 0.2s', transform: useWebSocket ? 'translateX(20px)' : 'translateX(0)' }} />
            </div>
          </div>
        </header>

        {/* Chat Feed */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#F9FAFB' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '0 16px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                  <Library size={30} strokeWidth={1.5} />
                </div>
                <h2 style={{ fontSize: 32, fontWeight: 600, color: '#111827', marginBottom: 12, textAlign: 'center', letterSpacing: '-0.02em' }}>How can I help you study today?</h2>
                <p style={{ fontSize: 16, color: '#6B7280', marginBottom: 40, textAlign: 'center', maxWidth: 420 }}>
                  Ask questions about your notes, solve complex problems, or get explanations for difficult concepts.
                </p>

                <div style={{ width: '100%', maxWidth: 600 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#6B7280', marginBottom: 16, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Try asking:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    {suggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        onClick={() => setInput(suggestion)}
                        style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#111827'; e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <p style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>{suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      style={{ display: 'flex', gap: 16, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        ...(msg.role === 'assistant'
                          ? { background: 'white', color: '#111827', border: '1px solid #E5E7EB' }
                          : { background: '#111827', color: 'white' })
                      }}>
                        {msg.role === 'assistant' ? <Library size={18} strokeWidth={2} /> : <User size={18} />}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                        <div style={{
                          padding: '12px 20px', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', lineHeight: 1.6, fontSize: 15,
                          ...(msg.role === 'assistant'
                            ? { background: 'white', border: '1px solid #E5E7EB', color: '#111827' }
                            : { background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#111827' })
                        }}>
                          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                        </div>
                        <span style={{ fontSize: 12, marginTop: 8, color: '#6B7280', fontWeight: 500 }}>
                          {msg.role === 'assistant' ? 'Study Assistant' : 'You'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{ display: 'flex', gap: 16 }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#111827', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <Library size={18} strokeWidth={2} />
                      </div>
                      <div style={{ background: 'white', border: '1px solid #E5E7EB', padding: '12px 20px', borderRadius: 16, display: 'flex', gap: 6, alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '-0.3s' }} />
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '-0.15s' }} />
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div style={{ padding: '8px 24px 24px', background: '#F9FAFB', flexShrink: 0 }}>
          <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }}>
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={useWebSocket ? "Ask about your notes..." : "Enter your prompt here..."}
                style={{ flex: 1, border: 'none', outline: 'none', padding: '12px 16px', fontSize: 15, color: '#111827', background: 'transparent', fontFamily: "'Inter', sans-serif" }}
              />
              <button
                onClick={handleSend}
                style={{ width: 36, height: 36, background: '#111827', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', marginRight: 4, flexShrink: 0, transition: 'background 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#374151')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#111827')}
              >
                <Send size={16} style={{ color: 'white' }} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 500, color: '#9CA3AF' }}>
              <span>CampusAI</span>
              <span style={{ width: 4, height: 4, borderRadius: 2, background: '#D1D5DB' }} />
              <span>Version: DeepSeek-R1</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
