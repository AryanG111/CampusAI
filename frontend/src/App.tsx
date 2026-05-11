import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, User, Upload, Folder, GraduationCap, Library, LogOut, Users, Trash2, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Types ---
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Student {
  id: number;
  username: string;
  email: string;
  role: string;
}

// --- Helpers ---
const parseJwt = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
};

// --- API ---
const API_URL = 'http://localhost:8000'; // Ensure using the correct port 

// ==========================================
// LOGIN COMPONENT
// ==========================================
const Login = ({ onLogin }: { onLogin: (t: string) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!res.ok) throw new Error('Invalid credentials');
      
      const data = await res.json();
      onLogin(data.access_token);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: 400, background: 'white', padding: 40, borderRadius: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap style={{ color: 'white', width: 24, height: 24 }} />
          </div>
        </div>
        <h2 style={{ textAlign: 'center', fontSize: 24, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Welcome back</h2>
        <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 14, marginBottom: 32 }}>Please sign in to your CampusAI account</p>
        
        {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px', borderRadius: 8, fontSize: 14, marginBottom: 20 }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Username</label>
            <input 
              type="text" value={username} onChange={e => setUsername(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} 
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Password</label>
            <input 
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} 
            />
          </div>
          <button 
            type="submit" disabled={isLoading}
            style={{ width: '100%', padding: '12px', background: '#111827', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer', marginTop: 8 }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// STUDENT DASHBOARD (CHAT UI)
// ==========================================
const StudentDashboard = ({ token, user, onLogout }: { token: string, user: any, onLogout: () => void }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRagMode, setIsRagMode] = useState(false);
  const [documents, setDocuments] = useState<{doc_id: string, doc_name: string}[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('all');
  const [sessions, setSessions] = useState<{id: string, title: string}[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) { onLogout(); return; }
      if (res.ok) setSessions(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `New Chat ${sessions.length + 1}` })
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([]);
      }
    } catch (e) { console.error(e); }
  };

  const loadSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) { onLogout(); return; }
      if (res.ok) setMessages(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchSessions();
  }, [token]);

  useEffect(() => {
    fetch(`${API_URL}/documents`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) { onLogout(); throw new Error('Unauthorized'); }
        return res.json();
      })
      .then(data => setDocuments(data || []))
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (isRagMode) {
      const wsUrl = API_URL.replace(/^http/, 'ws') + `/ask?token=${token}`;
      const ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        if (event.data === "[DONE]") {
          setIsTyping(false);
          return;
        }
        setMessages(prev => {
          const newMsg = [...prev];
          const last = newMsg[newMsg.length - 1];
          if (last && last.role === 'assistant') {
            newMsg[newMsg.length - 1] = { ...last, content: last.content + event.data };
          }
          return newMsg;
        });
      };
      ws.onerror = (e) => {
        console.error("WebSocket error", e);
        setMessages(prev => [...prev, { role: 'assistant', content: 'WebSocket Error. Please try again or disable RAG mode.' }]);
        setIsTyping(false);
      };
      wsRef.current = ws;
      return () => ws.close();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  }, [isRagMode, token]);
  
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = { role: 'user', content: input } as const;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    if (isRagMode && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      wsRef.current.send(JSON.stringify({ question: input, doc_id: selectedDocId, session_id: activeSessionId }));
    } else {
      try {
        const response = await fetch(`${API_URL}/chat/stream`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ message: input, session_id: activeSessionId })
        });
        if (response.status === 401) { onLogout(); return; }
        if (!response.ok) {
           setMessages(prev => [...prev, { role: 'assistant', content: 'Connection failed. Please ensure the backend and Ollama are running.' }]);
           setIsTyping(false);
           return;
        }
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages(prev => {
            const newMsg = [...prev];
            const last = newMsg[newMsg.length - 1];
            if (last) {
              newMsg[newMsg.length - 1] = { ...last, content: last.content + chunk };
            }
            return newMsg;
          });
        }
      } catch (error) {
        console.error('Error:', error);
        setMessages(prev => [...prev, { role: 'assistant', content: 'Connection failed. Please ensure Ollama is running and try again.' }]);
      } finally {
        setIsTyping(false);
      }
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ width: 280, background: '#FFFFFF', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GraduationCap style={{ color: 'white', width: 18, height: 18 }} /></div>
          <span style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>CampusAI</span>
        </div>
        
        <div style={{ padding: '0 16px', marginBottom: 28 }}>
          <button 
            onClick={handleCreateSession}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#111827', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={16} /> New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, paddingLeft: 12 }}>Recent Chats</div>
          {sessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => loadSession(s.id)}
              style={{ 
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: activeSessionId === s.id ? '#F3F4F6' : 'transparent',
                color: activeSessionId === s.id ? '#111827' : '#6B7280',
                fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                transition: 'all 0.2s'
              }}
            >
               <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                 <Library size={16} style={{ flexShrink: 0 }} /> {s.title}
               </div>
               <Trash2 size={14} color="#EF4444" style={{ cursor: 'pointer', opacity: 0.7, flexShrink: 0 }} onClick={(e) => handleDeleteSession(s.id, e)} />
            </div>
          ))}
        </div>
        
        <div style={{ padding: 16, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={16} /></div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{user.sub}</span>
          </div>
          <LogOut size={16} style={{ cursor: 'pointer', color: '#6B7280' }} onClick={onLogout} />
        </div>
      </aside>

      {/* Main Chat */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F9FAFB' }}>
        <header style={{ height: 64, borderBottom: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Student Dashboard</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isRagMode && (
              <select 
                value={selectedDocId} 
                onChange={e => setSelectedDocId(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              >
                <option value="all">All Documents</option>
                {documents.map(d => <option key={d.doc_id} value={d.doc_id}>{d.doc_name}</option>)}
              </select>
            )}
            <span style={{ fontSize: 14, fontWeight: 500, color: isRagMode ? '#111827' : '#6B7280' }}>RAG Mode</span>
            <button 
              onClick={() => setIsRagMode(!isRagMode)}
              style={{ 
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: isRagMode ? '#111827' : '#E5E7EB',
                position: 'relative', transition: 'background 0.2s'
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: 'white',
                position: 'absolute', top: 3, left: isRagMode ? 23 : 3,
                transition: 'left 0.2s'
              }} />
            </button>
          </div>
        </header>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {messages.length === 0 ? (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                <Library size={48} color="#9CA3AF" style={{ marginBottom: 16 }} />
                <h2 style={{ fontSize: 24, fontWeight: 600, color: '#111827' }}>Ask me anything!</h2>
                <p style={{ color: '#6B7280' }}>Powered by your course materials.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                    <div style={{ 
                      padding: '12px 20px', 
                      borderRadius: 16, 
                      maxWidth: '80%', 
                      background: msg.role === 'assistant' ? 'white' : '#111827', 
                      color: msg.role === 'assistant' ? '#111827' : 'white', 
                      border: msg.role === 'assistant' ? '1px solid #E5E7EB' : 'none',
                      lineHeight: 1.6
                    }}>
                      {msg.role === 'assistant' ? (
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ padding: '12px 20px', borderRadius: 16, background: 'white', border: '1px solid #E5E7EB', display: 'flex', gap: 4 }}>
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} style={{ width: 6, height: 6, borderRadius: 3, background: '#111827' }} />
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} style={{ width: 6, height: 6, borderRadius: 3, background: '#111827' }} />
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} style={{ width: 6, height: 6, borderRadius: 3, background: '#111827' }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: 4 }}>
            <input 
              value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question..." style={{ flex: 1, border: 'none', padding: '12px 16px', outline: 'none', fontSize: 15 }} 
            />
            <button onClick={handleSend} style={{ width: 40, height: 40, background: '#111827', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

// ==========================================
// TEACHER DASHBOARD
// ==========================================
const TeacherDashboard = ({ token, user, onLogout }: { token: string, user: any, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState<'students'|'notes'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [documents, setDocuments] = useState<{doc_id: string, doc_name: string}[]>([]);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student|null>(null);
  const [form, setForm] = useState({ username: '', email: '', password: '' });

  useEffect(() => {
    fetchStudents();
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_URL}/documents`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) { onLogout(); return; }
      if (res.ok) setDocuments(await res.json());
    } catch (e) { console.error(e); }
  };
  
  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Delete document?')) return;
    try {
      await fetch(`${API_URL}/documents/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchDocuments();
    } catch (e) { console.error(e); }
  };

  const handleRenameDocument = async (id: string, currentName: string) => {
    const newName = prompt('Enter new document name:', currentName);
    if (!newName || newName === currentName) return;
    try {
      const res = await fetch(`${API_URL}/documents/${id}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ doc_name: newName })
      });
      if (res.ok) fetchDocuments();
      else alert('Failed to rename document');
    } catch (e) { console.error(e); }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_URL}/students`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) { onLogout(); return; }
      if (res.ok) setStudents(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!editingStudent;
    const url = isEdit ? `${API_URL}/students/${editingStudent.id}` : `${API_URL}/students`;
    const method = isEdit ? 'PUT' : 'POST';
    
    // If edit and password empty, remove it from payload
    const payload: any = { username: form.username, email: form.email };
    if (form.password) payload.password = form.password;
    if (!isEdit) payload.password = form.password; // required for new

    try {
      const res = await fetch(url, {
        method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowModal(false);
        fetchStudents();
      } else {
         const data = await res.json();
         alert(data.detail || 'Error saving');
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete student?')) return;
    try {
      await fetch(`${API_URL}/students/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      fetchStudents();
    } catch (e) { console.error(e); }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true); setUploadProgress(0);
    const formData = new FormData(); formData.append('file', file);
    try {
      const response = await fetch(`${API_URL}/add_pdf`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
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
            if (data.error) {
               alert(`Error: ${data.error}`);
               setIsUploading(false);
               return; 
            }
            setUploadProgress(data.percent);
          } catch (e) {}
        }
      }
      setTimeout(() => { setIsUploading(false); setUploadProgress(0); fetchDocuments(); alert(`Indexed: ${file.name}`); }, 500);
    } catch (error) { console.error(error); setIsUploading(false); }
  };

  return (
      <div style={{ display: 'flex', height: '100vh', width: '100%', fontFamily: "'Inter', sans-serif" }}>
         {/* SIDEBAR */}
         <aside style={{ width: 280, background: '#FFFFFF', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GraduationCap style={{ color: 'white', width: 18, height: 18 }} /></div>
              <span style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>Campus AI</span>
            </div>
            
            <div style={{ flex: 1, padding: '0 16px' }}>
              <div onClick={() => setActiveTab('students')} style={{ padding: '10px 12px', background: activeTab === 'students' ? '#F3F4F6' : 'transparent', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, color: '#111827' }}>
                 <Users size={18} /> Manage Students
              </div>
              <div onClick={() => setActiveTab('notes')} style={{ padding: '10px 12px', background: activeTab === 'notes' ? '#F3F4F6' : 'transparent', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, color: '#111827', marginTop: 4 }}>
                 <Folder size={18} /> Upload Notes
              </div>
            </div>
            
            <div style={{ padding: 16, borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={16} /></div>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{user.sub} (Teacher)</span>
              </div>
              <LogOut size={16} style={{ cursor: 'pointer', color: '#6B7280' }} onClick={onLogout} />
            </div>
         </aside>

         {/* MAIN CONTENT */}
         <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F9FAFB', overflowY: 'auto' }}>
            <header style={{ height: 64, borderBottom: '1px solid #E5E7EB', background: '#FFFFFF', display: 'flex', alignItems: 'center', padding: '0 32px' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Teacher Dashboard</div>
            </header>

            <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
              {activeTab === 'students' ? (
                <div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                     <h2 style={{ fontSize: 24, fontWeight: 600 }}>Students</h2>
                     <button onClick={() => { setEditingStudent(null); setForm({username:'', email:'', password:''}); setShowModal(true); }} style={{ padding: '10px 16px', background: '#111827', color: 'white', borderRadius: 8, border: 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                       <Plus size={16} /> Add Student
                     </button>
                   </div>
                   
                   <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                     <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                       <thead>
                         <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                           <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Username</th>
                           <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Email</th>
                           <th style={{ padding: '12px 24px', fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                         </tr>
                       </thead>
                       <tbody>
                         {students.map(s => (
                           <tr key={s.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                             <td style={{ padding: '16px 24px', fontSize: 14, color: '#111827', fontWeight: 500 }}>{s.username}</td>
                             <td style={{ padding: '16px 24px', fontSize: 14, color: '#6B7280' }}>{s.email}</td>
                             <td style={{ padding: '16px 24px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                               <button onClick={() => { setEditingStudent(s); setForm({username: s.username, email: s.email, password: ''}); setShowModal(true); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280' }}><Edit2 size={16} /></button>
                               <button onClick={() => handleDelete(s.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={16} /></button>
                             </td>
                           </tr>
                         ))}
                         {students.length === 0 && (
                           <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>No students found. Add one to get started.</td></tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                </div>
              ) : (
                <div>
                   <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Upload Course Notes</h2>
                   <div style={{ background: 'white', padding: 32, borderRadius: 12, border: '1px dashed #D1D5DB', textAlign: 'center' }}>
                     <div style={{ width: 48, height: 48, borderRadius: 24, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Upload size={24} color="#6B7280" /></div>
                     <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Select a PDF file to upload</h3>
                     <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 24 }}>This content will instantly be available for Student queries.</p>
                     
                     <label style={{ display: 'inline-block', padding: '10px 20px', background: '#111827', color: 'white', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
                        Browse Files
                        <input type="file" style={{ display: 'none' }} accept=".pdf" onChange={handleFileUpload} />
                     </label>

                     {isUploading && (
                       <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 400, margin: '24px auto 0' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                           <span>Indexing relative context...</span>
                           <span>{uploadProgress}%</span>
                         </div>
                         <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                           <motion.div initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} style={{ height: '100%', background: '#111827' }} />
                         </div>
                       </div>
                     )}
                   </div>

                   {documents.length > 0 && (
                     <div style={{ marginTop: 32, textAlign: 'left' }}>
                       <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Uploaded Documents</h3>
                       <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                         {documents.map(d => (
                            <div key={d.doc_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Folder size={18} color="#6B7280" />
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{d.doc_name}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 12 }}>
                                <button onClick={() => handleRenameDocument(d.doc_id, d.doc_name)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280' }}><Edit2 size={18} /></button>
                                <button onClick={() => handleDeleteDocument(d.doc_id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={18} /></button>
                              </div>
                            </div>
                         ))}
                       </div>
                     </div>
                   )}
                </div>
              )}
            </div>
         </main>

         {/* MODAL */}
         <AnimatePresence>
         {showModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
              <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ background: 'white', borderRadius: 16, width: 400, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                 <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <h3 style={{ fontSize: 18, fontWeight: 600 }}>{editingStudent ? 'Edit Student' : 'Add New Student'}</h3>
                   <X size={20} color="#6B7280" style={{ cursor: 'pointer' }} onClick={() => setShowModal(false)} />
                 </div>
                 <form onSubmit={handleSaveStudent} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Username</label>
                      <input type="text" required value={form.username} onChange={e => setForm({...form, username: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Email</label>
                      <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Password {editingStudent && <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(leave blank to keep)</span>}</label>
                      <input type="password" required={!editingStudent} value={form.password} onChange={e => setForm({...form, password: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                      <button type="submit" style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#111827', color: 'white', cursor: 'pointer', fontWeight: 500 }}>{editingStudent ? 'Update' : 'Create'}</button>
                    </div>
                 </form>
              </motion.div>
            </div>
         )}
         </AnimatePresence>
      </div>
  );
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState<{sub: string, role: string} | null>(token ? parseJwt(token) : null);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(parseJwt(newToken));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
  };

  useEffect(() => {
    if (token) {
      const decoded = parseJwt(token);
      if (!decoded) {
        handleLogout();
      }
    }
  }, [token]);

  if (!token || !user) {
    return <Login onLogin={handleLogin} />;
  }

  if (user.role === 'TEACHER') {
    return <TeacherDashboard token={token} user={user} onLogout={handleLogout} />;
  }

  return <StudentDashboard token={token} user={user} onLogout={handleLogout} />;
}
