import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, Bot, User, Upload, Settings, Hash, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [indexedFiles, setIndexedFiles] = useState<string[]>(['Calculus III', 'Machine Learning 101']); // Mock data + dynamic
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (useWebSocket && !wsRef.current) {
      const ws = new WebSocket('ws://localhost:8000/ask');
      ws.onmessage = (event) => {
        setMessages(prev => [...prev, { role: 'assistant', content: event.data }]);
        setIsTyping(false);
      };
      ws.onerror = () => setIsTyping(false);
      ws.onclose = () => {
        wsRef.current = null;
      };
      wsRef.current = ws;
    } else if (!useWebSocket && wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
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
    <div className="flex h-screen w-full bg-[#050505] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 glass border-r border-white/5 flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center glow-blue">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">StudyGPT</h1>
        </div>

        <div className="flex-1 px-3 overflow-y-auto space-y-2 mt-4">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 transition-all text-white font-semibold shadow-lg shadow-blue-900/30 mb-8 border border-blue-400/20 active:scale-95">
            <Plus size={18} />
            <span>New Chat</span>
          </button>

          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-4 mb-4">Recent Notes</div>
          {indexedFiles.map((item, idx) => (
            <motion.div
              key={`${item}-${idx}`}
              whileHover={{ x: 4 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.03] transition-colors cursor-pointer text-slate-400 hover:text-white group border border-transparent hover:border-white/5"
            >
              <Hash size={16} className="text-slate-600 group-hover:text-blue-500 transition-colors" />
              <span className="text-sm truncate font-medium">{item}</span>
            </motion.div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="space-y-3">
            <label className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white ${isUploading ? 'opacity-50 pointer-events-none' : 'hover:bg-white/5'}`}>
              <Upload size={18} />
              <span className="text-sm">Upload PDF</span>
              <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
            </label>

            {isUploading && (
              <div className="px-4 space-y-2">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>Indexing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-slate-400 hover:text-white">
            <Settings size={18} />
            <span className="text-sm">Settings</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 glass sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Deepseek-R1</span>
              <span className="text-[10px] text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Online
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer group">
              <span className={`text-xs transition-colors ${useWebSocket ? 'text-blue-500 font-bold' : 'text-slate-500'}`}>RAG Mode</span>
              <div
                className={`w-10 h-5 rounded-full p-1 transition-colors ${useWebSocket ? 'bg-blue-600' : 'bg-slate-800'}`}
                onClick={() => setUseWebSocket(!useWebSocket)}
              >
                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${useWebSocket ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </label>
          </div>
        </header>

        {/* Chat Feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto w-full scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40">
              <Sparkles size={64} className="mb-6 text-slate-700 floating" />
              <p className="text-xl font-medium tracking-tight">How can I help you study today?</p>
              <p className="text-sm mt-2">Ask a general question or enable RAG mode to query your notes.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`flex w-full gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'assistant'
                      ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                    }`}>
                    {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                  </div>

                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
                    <div className={`px-5 py-3 rounded-2xl shadow-sm leading-relaxed text-[15px] ${msg.role === 'assistant'
                        ? 'bg-white/5 border border-white/10 text-slate-200'
                        : 'bg-blue-600 text-white shadow-blue-900/20'
                      }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <span className="text-[10px] mt-1.5 text-slate-600 font-bold uppercase tracking-wider">
                      {msg.role === 'assistant' ? 'Study Assistant' : 'You'}
                    </span>
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-5"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-600">
                    <Bot size={22} className="text-white" />
                  </div>
                  <div className="bg-white/5 border border-white/5 px-5 py-3 rounded-2xl flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Input Area */}
        <div className="p-8 pt-0 max-w-4xl mx-auto w-full bg-gradient-to-t from-[#050505] via-[#050505] to-transparent">
          <div className="relative glass rounded-2xl p-2 group focus-within:ring-2 ring-blue-500/50 transition-all">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={useWebSocket ? "Ask about your notes..." : "Enter your prompt here..."}
              className="w-full bg-transparent border-none outline-none py-4 px-6 text-sm placeholder:text-slate-600"
            />
            <button
              onClick={handleSend}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Send size={18} className="text-white" />
            </button>
          </div>
          <p className="text-[10px] text-center mt-4 text-slate-600 uppercase tracking-widest font-bold">
            Built for Students • Deepseek-R1 Powered
          </p>
        </div>
      </main>
    </div>
  );
};

export default App;
