import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Plus, Menu, X, Sparkles,
  Trash2, Copy, Eye, EyeOff,
  User as UserIcon, ChevronUp, ChevronDown, Loader2, LogOut,
  CheckCircle2
} from 'lucide-react';
import { findAndAddMessage, findMarkdownOffset } from './utils';
import { ChatMessage, ChatSession } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, query, orderBy, onSnapshot, deleteDoc } from 'firebase/firestore';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Auth from './components/Auth';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const MODEL = "llama-3.3-70b-versatile";
const SYSTEM_PROMPT = `You are Zefina AI, a high-intelligence assistant.
Your responses must be highly structured, using:
- Markdown headers (###) for sections.
- Tables for data comparison or structured lists.
- Bold text for emphasis.
- Concise, information-dense language.
Maintain a professional, recursive-thinking persona.`;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [activeInput, setActiveInput] = useState<{ msgId: string, anchorOffset: number, text: string } | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, text: string, msgId: string, anchorOffset: number } | null>(null);
  const [highlightMenu, setHighlightMenu] = useState<{ x: number, y: number, threadId: string } | null>(null);
  const [rootInput, setRootInput] = useState("");
  const [activeReference, setActiveReference] = useState<{ text: string, msgId: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const CREATOR_EMAIL = "jagathsaradagi@gmail.com";
  const isCreator = user?.email === CREATOR_EMAIL;

  const getUsageStats = () => {
    if (isCreator) return { isLimited: false };

    const sessionCount = sessions.length;
    const isSessionLimited = sessionCount >= 2;

    // Count prompts in current messages
    const mainPrompts = messages.filter(m => m.sender === 'user' && !m.referenceMsgId).length;

    return {
      sessionCount,
      mainPrompts,
      isSessionLimited,
      isPromptLimited: mainPrompts >= 2
    };
  };

  const usage = getUsageStats();

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "users", user.uid, "sessions"), orderBy("lastTimestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setSessions(snapshot.docs.map(doc => doc.data() as ChatSession));
    }, (err) => {
      console.error("Firestore Error:", err);
    });
    return unsub;
  }, [user]);

  const scrollToBottom = () => {
    setTimeout(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const loadSession = async (id: string) => {
    setCurrentSessionId(id);
    try {
        const d = await getDoc(doc(db, "users", user.uid, "sessions", id));
        if (d.exists()) {
            const data = d.data();
            if (data.messagesJson) {
                // Security: Safe Parse to prevent data-injection crashes
                const parsed = JSON.parse(data.messagesJson);
                if (Array.isArray(parsed)) {
                    setMessages(parsed);
                    scrollToBottom();
                }
            }
        }
    } catch (e) {
        console.error("Security: Failed to parse history data.");
        setMessages([]);
    }
  };

  const startNewChat = () => { setCurrentSessionId(""); setMessages([]); };

  const findMessageRecursive = (list: ChatMessage[], id: string): ChatMessage | null => {
    for (const m of list) {
      if (m.id === id) return m;
      for (const st of m.subThreads) {
        const found = findMessageRecursive(st.messages, id);
        if (found) return found;
      }
    }
    return null;
  };

  const handleGlobalMouseUp = (e: React.MouseEvent) => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && containerRef.current) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();

        let node: any = range?.endContainer.parentElement;
        let msgId = null;
        while (node && node !== document.body) {
          if (node.hasAttribute('data-msg-id')) { msgId = node.getAttribute('data-msg-id'); break; }
          node = node.parentElement;
        }

        if (rect && msgId) {
          const msg = findMessageRecursive(messages, msgId);
          if (msg) {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
                acceptNode: (n) => {
                  let p: any = n.parentElement;
                  while (p && p !== node) {
                    if (p.getAttribute('data-is-thread') === 'true' || p.tagName === 'INPUT-BLOCK') {
                      return NodeFilter.FILTER_REJECT;
                    }
                    p = p.parentElement;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              });

              let domOffset = 0;
              let currentNode;
              while ((currentNode = walker.nextNode())) {
                if (currentNode === range?.endContainer) {
                  domOffset += range.endOffset;
                  break;
                }
                domOffset += currentNode.textContent?.length || 0;
              }

              const mdOffset = findMarkdownOffset(msg.content, text, domOffset);
              setSelectionMenu({
                x: rect.left - containerRect.left + containerRef.current.scrollLeft + rect.width / 2,
                y: rect.top - containerRect.top + containerRef.current.scrollTop - 40,
                text,
                msgId,
                anchorOffset: mdOffset
              });
              setHighlightMenu(null);
          }
        }
      } else {
        setSelectionMenu(null);
      }
    }, 10);
  };

  const handleSendRoot = async () => {
    if (!rootInput.trim() || !user?.uid) return;

    if (!isCreator && usage.isPromptLimited && !currentSessionId) {
      alert("Creator has limited your access in User Mode: Max 2 prompts per session.");
      return;
    }

    const id = currentSessionId || crypto.randomUUID();
    if (!currentSessionId) {
        if (!isCreator && sessions.length >= 2) {
            alert("User Mode Limit: You can only create 2 chat sessions. Please delete an old chat to start a new one.");
            return;
        }
        setCurrentSessionId(id);
    }

    if (!isCreator && usage.isPromptLimited) {
        alert("User Mode Limit: Max 2 main prompts reached for this chat.");
        return;
    }

    let refId: string | undefined = undefined;
    let nextMsgs = [...messages];

    if (activeReference && selectionMenu) {
        const { list, subThreadId } = findAndAddMessage(
            messages,
            activeReference.msgId,
            selectionMenu.anchorOffset,
            activeReference.text,
            null
        );
        nextMsgs = list;
        refId = subThreadId || undefined;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      content: rootInput,
      timestamp: Date.now(),
      subThreads: [],
      referenceText: activeReference?.text,
      referenceMsgId: activeReference?.msgId,
      referenceId: refId
    };

    nextMsgs = [...nextMsgs, userMsg];
    setMessages(nextMsgs);
    setRootInput("");

    let context: any[] = [];
    if (activeReference) {
        context = buildContextRecursive(nextMsgs, activeReference.msgId, 999999, "");
        context.push({ role: 'user', content: `Contextual Reference: "${activeReference.text}"` });
    } else {
        context = nextMsgs.map(m => ({ role: m.sender, content: m.content }));
    }

    setActiveReference(null);
    scrollToBottom();

    const prompt = userMsg.referenceText
        ? `Regarding "${userMsg.referenceText}": ${rootInput}`
        : rootInput;

    const reply = await fetchAI(prompt, context);
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), sender: 'assistant', content: reply, timestamp: Date.now(), subThreads: [] };
    const final = [...nextMsgs, assistantMsg];
    setMessages(final);
    persistToCloud(id, final);
  };

  const handleSendInline = async (parentMsgId: string, rawAnchorOffset: number, selectedText: string, content: string) => {
    // Check nesting limits for users
    if (!isCreator) {
        const targetMsg = findMessageRecursive(messages, parentMsgId);

        // Count how many user subthreads already exist in this message
        const userSubThreads = targetMsg?.subThreads.filter(st => st.messages.some(m => m.sender === 'user')) || [];

        // 1. Check if user already has a subthread for THIS specific selection
        const existingForSelection = targetMsg?.subThreads.find(st =>
          st.messages.some(m => m.id === parentMsgId) || // Placeholder logic
          (st.highlightedText === selectedText)
        );

        // 2. Check depth: If parent message is already inside a subthread, it's a nested follow-up
        let isParentNested = false;
        const checkIsNested = (list: ChatMessage[]): boolean => {
            for (const m of list) {
                for (const st of m.subThreads) {
                    if (st.messages.some(sm => sm.id === parentMsgId)) {
                        isParentNested = true;
                        return true;
                    }
                    if (checkIsNested(st.messages)) return true;
                }
            }
            return false;
        };
        checkIsNested(messages);

        if (isParentNested) {
            alert("Technical Preview Limitation: Zefina currently allows only one level of recursive follow-up in User Mode. To maintain system stability, further nesting is restricted to the Creator account.");
            return;
        }

        if (userSubThreads.length >= 1 && !existingForSelection) {
            alert("User Mode Limit: You have reached the maximum number of inline doubts allowed per message (1). Please use the root chat bar for further questions.");
            return;
        }
    }

    const doubtMsg: ChatMessage = { id: crypto.randomUUID(), sender: 'user', content, timestamp: Date.now(), subThreads: [] };
    const { list: withDoubt } = findAndAddMessage(messages, parentMsgId, rawAnchorOffset, selectedText, doubtMsg);
    setMessages(withDoubt);
    setActiveInput(null);

    const history = buildContextRecursive(withDoubt, parentMsgId, rawAnchorOffset, content);
    const reply = await fetchAI(`Regarding the text: "${selectedText}"\n\nPlease provide a deep clarification or expansion based on the user's doubt: "${content}"`, history);

    setMessages(prev => {
      const { list: final } = findAndAddMessage(prev, parentMsgId, rawAnchorOffset, selectedText, { id: crypto.randomUUID(), sender: 'assistant', content: reply, timestamp: Date.now(), subThreads: [] });
      persistToCloud(currentSessionId, final);
      return final;
    });
  };

  const buildContextRecursive = (list: ChatMessage[], targetId: string, anchorOffset: number, prompt: string): any[] => {
    const history: any[] = [];
    const traverse = (msgs: ChatMessage[]): boolean => {
      for (const m of msgs) {
        if (m.id === targetId) {
          history.push({ role: m.sender, content: m.content.slice(0, anchorOffset) });
          return true;
        }
        history.push({ role: m.sender, content: m.content });
        for (const st of m.subThreads) { if (traverse(st.messages)) return true; }
      }
      return false;
    };
    traverse(list);
    return history;
  };

  const fetchAI = async (prompt: string, context: any[]) => {
    if (!GROQ_API_KEY) return "Configuration Error.";

    // Security: Basic Client-side Rate Limiting
    const now = Date.now();
    const lastCall = (window as any)._lastZefinaCall || 0;
    if (now - lastCall < 2000 && !isCreator) { // 2 second cooldown for users
        return "Please slow down. System is cooling.";
    }
    (window as any)._lastZefinaCall = now;

    setIsLoading(true);
    try {
      const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
        model: MODEL, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...context, { role: "user", content: prompt }]
      }, { headers: { "Authorization": `Bearer ${GROQ_API_KEY}` } });
      return res.data.choices[0].message.content;
    } catch (err) { return "Brain Link Error."; }
    finally { setIsLoading(false); }
  };

  const persistToCloud = async (id: string, msgs: ChatMessage[]) => {
    if (!user || !id) return;
    const firstMsg = msgs.find(m => m.sender === 'user')?.content || "New Chat";
    await setDoc(doc(db, "users", user.uid, "sessions", id), { id, title: firstMsg.slice(0, 25), lastTimestamp: Date.now(), messagesJson: JSON.stringify(msgs) }, { merge: true });
  };

  const handleScrollToReference = (msgId: string, refText?: string, referenceId?: string) => {
    const path = new Set<string>();

    const findPath = (list: ChatMessage[], targetId: string): boolean => {
      for (const m of list) {
        if (m.id === targetId) return true;
        for (const st of (m.subThreads || [])) {
          if (findPath(st.messages, targetId)) {
            path.add(st.id);
            return true;
          }
        }
      }
      return false;
    };

    if (findPath(messages, msgId)) {
      // 1. Expand all parent threads instantly
      setExpandedThreads(prev => {
        const next = new Set(prev);
        path.forEach(id => next.add(id));
        return next;
      });

      // 2. Wait for animations to settle (400ms)
      setTimeout(() => {
        const messageEl = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (messageEl && containerRef.current) {
          let targetEl = messageEl as HTMLElement;

          // 3. Find the EXACT mark (Emerald highlight)
          if (referenceId || refText) {
            const marks = messageEl.querySelectorAll('mark');
            for (const mark of marks) {
                const isMatch = referenceId
                    ? mark.getAttribute('data-tid') === referenceId
                    : mark.textContent?.trim().includes(refText?.trim() || '');
                if (isMatch) {
                    targetEl = mark as HTMLElement;
                    break;
                }
            }
          }

          // 4. Scroll so the text touches the TOP of the container
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

          // 5. Visual feedback pulse
          targetEl.animate([
            { backgroundColor: 'rgba(16, 185, 129, 0.5)', scale: '1.2' },
            { backgroundColor: 'transparent', scale: '1' }
          ], { duration: 1000 });
        }
      }, 400);
    }
  };

  if (authLoading) return <div className="h-screen bg-[#050505] flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  if (!user) return <Auth />;

  return (
    <div className="flex h-screen bg-[#212121] text-white overflow-hidden font-sans" onMouseUp={handleGlobalMouseUp}>
      <aside className={`bg-[#171717] flex-shrink-0 flex flex-col border-r border-white/5 transition-all duration-300 ${sidebarOpen ? 'w-[260px]' : 'w-0'}`}>
        <div className="p-3">
          <button onClick={startNewChat} className="w-full flex items-center gap-2 px-3 py-3 rounded-lg border border-white/10 hover:bg-[#2D2D2D] text-sm font-medium transition-colors">
            <Plus size={16}/> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
          {sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s.id)} className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${currentSessionId === s.id ? 'bg-[#2D2D2D]' : 'hover:bg-[#2D2D2D]'}`}>
              <span className="truncate flex-1 font-medium text-gray-400 group-hover:text-white">{s.title}</span>
              <Trash2 size={14} className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500" onClick={(e) => {e.stopPropagation(); deleteDoc(doc(db, "users", user.uid, "sessions", s.id))}} />
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-white/5"><button onClick={() => signOut(auth)} className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#2D2D2D] text-sm text-gray-400"><LogOut size={16}/> Log out</button></div>
      </aside>

      <main className="flex-1 flex flex-col relative bg-[#212121] min-w-0">
        {!isCreator && (
            <div className="bg-blue-600/20 border-b border-blue-500/30 px-4 py-2 text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] flex justify-between items-center">
                <span>User Mode Active: 2 Chats | 2 Prompts | 1 Nested Doubt</span>
                <span className="opacity-60">Creator: jagathsaradagi@gmail.com</span>
            </div>
        )}
        <header className="h-14 flex items-center px-4 justify-between bg-[#212121]/80 backdrop-blur-sm sticky top-0 z-20 border-b border-white/5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-[#2D2D2D] rounded-lg text-gray-400"><Menu size={20}/></button>
          <div className="font-bold text-gray-200 uppercase tracking-[0.2em] text-[10px] flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Zefina <span className="text-blue-400 font-black">Core</span>
          </div>
          <div className="w-10 flex justify-center">{isLoading && <Loader2 className="animate-spin text-blue-500" size={18}/>}</div>
        </header>

        <div ref={containerRef} className="flex-1 overflow-y-auto pt-8 pb-32 custom-scrollbar relative">
          <div className="w-full max-w-[1200px] mx-auto px-8 md:px-12 space-y-12">
            {messages.length === 0 && (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center opacity-30">
                 <Sparkles className="text-blue-400 mb-6" size={48} />
                 <h2 className="text-3xl font-black italic tracking-tighter">ZEFINA</h2>
                 <p className="text-xs mt-3 font-bold uppercase tracking-[0.3em]">Recursive Intelligence</p>
              </div>
            )}
            {messages.map(msg => (
              <MessageItem key={msg.id} msg={msg} activeInput={activeInput} onInlineSubmit={handleSendInline} onCloseInput={() => setActiveInput(null)} expandedThreads={expandedThreads} onScrollToReference={handleScrollToReference} onToggleThread={(id: string) => {const n=new Set(expandedThreads); if(n.has(id)) n.delete(id); else n.add(id); setExpandedThreads(n); setHighlightMenu(null);}} onHighlightMenu={(data: any) => {
                if (!data || !containerRef.current) { setHighlightMenu(null); return; }
                const cRect = containerRef.current.getBoundingClientRect();
                setHighlightMenu({
                    x: data.x - cRect.left + containerRef.current.scrollLeft,
                    y: data.y - cRect.top + containerRef.current.scrollTop - 35,
                    threadId: data.threadId
                });
              }} />
            ))}
            <div ref={scrollRef} />
          </div>

          <AnimatePresence>
          {selectionMenu && (
            <motion.div initial={{ opacity:0, scale: 0.9 }} animate={{ opacity:1, scale: 1 }} exit={{ opacity:0 }} style={{ left: selectionMenu.x, top: selectionMenu.y }} className="absolute -translate-x-1/2 -translate-y-full z-50 flex flex-col gap-2 pointer-events-auto">
              <div className="flex bg-[#2f2f2f] border border-blue-500/50 rounded-xl p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <button onClick={() => { setActiveInput({ msgId: selectionMenu.msgId, anchorOffset: selectionMenu.anchorOffset, text: selectionMenu.text }); setSelectionMenu(null); }} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-600 transition-colors text-xs font-bold text-white whitespace-nowrap rounded-lg"><Sparkles size={14}/> Ask Zefina Here</button>
                <div className="w-[1px] bg-white/10 mx-1" />
                <button onClick={() => { setActiveReference({ text: selectionMenu.text, msgId: selectionMenu.msgId }); setSelectionMenu(null); scrollToBottom(); }} className="px-3 py-2 hover:bg-[#3f3f3f] text-xs text-gray-300 font-medium whitespace-nowrap rounded-lg">Ask at Bottom</button>
              </div>
              <div className="flex self-center bg-black/80 rounded-lg p-1 border border-white/5 shadow-xl">
                 <button onClick={() => {navigator.clipboard.writeText(selectionMenu.text); setSelectionMenu(null);}} className="p-2 hover:bg-white/10 rounded text-gray-400 transition-colors"><Copy size={14}/></button>
              </div>
            </motion.div>
          )}
          {highlightMenu && (
            <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} exit={{ opacity: 0 }} style={{ left: highlightMenu.x, top: highlightMenu.y }} className="absolute -translate-x-1/2 -translate-y-full z-50 pointer-events-auto">
               <button onClick={() => {const n=new Set(expandedThreads); if(n.has(highlightMenu.threadId)) n.delete(highlightMenu.threadId); else n.add(highlightMenu.threadId); setExpandedThreads(n); setHighlightMenu(null);}} className="bg-blue-600 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(37,99,235,0.4)] ring-4 ring-blue-600/20 flex items-center gap-2 transition-transform active:scale-95">
                  <Eye size={12} /> {expandedThreads.has(highlightMenu.threadId) ? "Hide Result" : "Show Result"}
               </button>
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#212121] via-[#212121]/90 to-transparent pointer-events-none">
          <div className={`w-full max-w-[900px] mx-auto pointer-events-auto transition-all duration-500 ${activeInput ? 'opacity-20 blur-sm scale-[0.98]' : ''}`}>
             <AnimatePresence>
               {activeReference && (
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mb-2 bg-blue-600/10 border border-blue-500/30 rounded-t-2xl px-4 py-2 flex items-center justify-between backdrop-blur-md">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Sparkles size={12} className="text-blue-400 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest whitespace-nowrap">Referencing:</span>
                      <span className="text-xs text-gray-300 truncate italic">"{activeReference.text}"</span>
                    </div>
                    <button onClick={() => setActiveReference(null)} className="p-1 hover:bg-white/10 rounded-full text-gray-500 transition-colors"><X size={14}/></button>
                 </motion.div>
               )}
             </AnimatePresence>
             <div className={`flex items-end gap-2 bg-[#2f2f2f] border border-white/10 p-2 pr-3 focus-within:border-white/20 shadow-2xl ${activeReference ? 'rounded-b-[26px]' : 'rounded-[26px]'}`}>
                <textarea rows={1} value={rootInput} onChange={(e) => {setRootInput(e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px';}} onKeyDown={(e)=>e.key==='Enter'&&!e.shiftKey&&handleSendRoot()} placeholder="Explore deeper with Zefina..." className="flex-1 bg-transparent px-4 py-3 outline-none text-white resize-none max-h-60 custom-scrollbar select-text text-sm font-medium placeholder:text-gray-500" />
                <button onClick={handleSendRoot} className="bg-white text-black p-2 rounded-xl hover:bg-gray-200 active:scale-95 transition-all shadow-md mb-1"><Send size={20}/></button>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MarkdownRenderer({ content, msg, activeInput, onHighlightMenu, expandedThreads, onInlineSubmit, onCloseInput, onToggleThread, depth, onScrollToReference }: any) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      className="max-w-none prose-sm leading-8"
      components={{
        p: ({ children }) => <p className="mb-4 last:mb-0 inline-block w-full">{children}</p>,
        table: ({ children }) => ( <div className="overflow-x-auto my-6 bg-[#1a1a1a] rounded-xl border border-white/10 p-4 shadow-inner"><table className="min-w-full text-sm text-left border-collapse">{children}</table></div>),
        th: ({ children }) => <th className="border-b border-white/10 p-3 font-black text-blue-400 uppercase text-[10px] tracking-widest">{children}</th>,
        td: ({ children }) => <td className="border-b border-white/5 p-3 text-gray-300 font-medium">{children}</td>,
        code: ({ children }) => <code className="bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[13px]">{children}</code>,
        ul: ({ children }) => <ul className="list-disc list-inside my-4 space-y-2 ml-2 text-gray-300">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside my-4 space-y-2 ml-2 text-gray-300">{children}</ol>,
        li: ({ children }) => <li className="marker:text-blue-500">{children}</li>,
        h3: ({ children }) => <h3 className="text-lg font-bold text-blue-400 mt-6 mb-3 tracking-tight">{children}</h3>,
        strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
        mark: ({ node, ...props }: any) => {
            const tid = props['data-tid'];
            if (tid === 'active') return <span className="bg-blue-600 text-white px-1 rounded font-bold shadow-lg ring-2 ring-blue-600/20 animate-pulse">{props.children}</span>;
            return (
                <span
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onHighlightMenu({ x: rect.left + rect.width / 2, y: rect.top - 8, threadId: tid });
                    }}
                    className="!text-emerald-400 font-black cursor-pointer transition-all hover:bg-emerald-400/20 px-0.5 rounded border-b-2 border-emerald-400/30"
                >
                    {props.children}
                </span>
            );
        },
        'thread-block': ({ node, ...props }: any) => {
            const tid = props['data-tid'];
            const st = msg.subThreads?.find((s: any) => s.id === tid);
            if (!st || !expandedThreads.has(tid)) return null;
            return (
                <motion.div
                    layout
                    data-is-thread="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`block my-8 border-l-[3px] pl-6 relative select-none py-4 rounded-r-xl ${
                        depth % 2 === 0 ? 'border-blue-500/40 bg-blue-500/5' : 'border-purple-500/40 bg-purple-500/5'
                    }`}
                >
                    <div className="flex items-center gap-2 mb-6">
                        <div className={`text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter italic shadow-sm ${
                            depth % 2 === 0 ? 'bg-blue-600' : 'bg-purple-600'
                        }`}>Recursive Branch</div>
                        <button onClick={()=>onToggleThread(tid)} className="flex items-center gap-1.5 px-3 py-1 bg-[#2D2D2D] hover:bg-[#3d3d3d] border border-white/10 rounded-full text-[10px] font-bold text-gray-400 transition-all">
                            <ChevronUp size={12}/> Hide Result
                        </button>
                    </div>
                    {st.messages.map((sm: any) => (
                        <div key={sm.id} className="mb-8 last:mb-0">
                            <MessageItem msg={sm} activeInput={activeInput} onInlineSubmit={onInlineSubmit} onCloseInput={onCloseInput} expandedThreads={expandedThreads} onToggleThread={onToggleThread} onHighlightMenu={onHighlightMenu} onScrollToReference={onScrollToReference} depth={depth+1}/>
                        </div>
                    ))}
                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
                        <button onClick={() => onToggleThread(tid)} className="flex items-center gap-2 text-[10px] text-gray-500 hover:text-white uppercase font-black tracking-widest transition-all"><ChevronUp size={12} /> Collapse Branch</button>
                        <span className="text-[9px] text-gray-600 font-mono">DEPTH_0{depth+1}</span>
                    </div>
                </motion.div>
            );
        },
        'input-block': () => (
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="block my-6 select-none bg-blue-600/5 p-4 rounded-xl border border-blue-600/20 shadow-[0_0_20px_rgba(37,99,235,0.1)]"
            >
                <InlineInput onSubmit={(t:string)=>onInlineSubmit(msg.id, activeInput?.anchorOffset ?? 0, activeInput?.text ?? "", t)} onClose={onCloseInput}/>
            </motion.div>
        )
      }}
    >{content}</ReactMarkdown>
  );
}

function MessageItem({ msg, activeInput, onInlineSubmit, onCloseInput, expandedThreads, onToggleThread, depth = 0, onHighlightMenu, onScrollToReference }: any) {
  const isAI = msg.sender === 'assistant';

  const finalMarkdown = useMemo(() => {
    if (!isAI) return msg.content;
    let content = msg.content;
    const insertions: { pos: number, text: string }[] = [];

    (msg.subThreads || []).forEach(st => {
        if (st.highlightedText) {
            const hStart = st.highlightStart ?? 0;
            const hEnd = hStart + st.highlightedText.length;
            insertions.push({ pos: hStart, text: `<mark data-tid="${st.id}">` });
            insertions.push({ pos: hEnd, text: `</mark>` });
        }
        insertions.push({ pos: st.anchorOffset ?? 0, text: `<thread-block data-tid="${st.id}"></thread-block>` });
    });

    if (activeInput?.msgId === msg.id && activeInput?.text) {
        const hStart = (activeInput.anchorOffset ?? 0) - activeInput.text.length;
        const hEnd = activeInput.anchorOffset ?? 0;
        insertions.push({ pos: hStart, text: `<mark data-tid="active">` });
        insertions.push({ pos: hEnd, text: `</mark><input-block></input-block>` });
    }

    insertions.sort((a, b) => b.pos - a.pos || (a.text.startsWith('</') ? -1 : 1));

    let result = content;
    for (const ins of insertions) {
        if (ins.pos >= 0 && ins.pos <= content.length) {
            result = result.slice(0, ins.pos) + ins.text + result.slice(ins.pos);
        }
    }
    return result;
  }, [msg, isAI, activeInput]);

  return (
    <div className={`flex gap-4 w-full ${isAI ? '' : 'flex-row-reverse animate-in fade-in transition-all duration-500'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border shadow-sm ${isAI ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-white/10 border-white/10 text-white'}`}>
        {isAI ? <Sparkles size={16}/> : <UserIcon size={16}/>}
      </div>
      <div className={`flex-1 min-w-0 ${isAI ? '' : 'text-right'}`}>
        {!isAI && msg.referenceText && (
          <div onClick={() => msg.referenceMsgId && onScrollToReference(msg.referenceMsgId, msg.referenceText, msg.referenceId)} className="inline-flex items-center gap-2 mb-2 bg-blue-600/5 border border-blue-500/20 rounded-xl px-3 py-1.5 cursor-pointer hover:bg-blue-600/10 transition-all group max-w-[80%] overflow-hidden">
            <Sparkles size={10} className="text-blue-400 flex-shrink-0" />
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-tighter">Reference</span>
            <span className="text-xs text-gray-500 truncate group-hover:text-gray-300 italic">"{msg.referenceText}"</span>
          </div>
        )}
        <div className={`inline-block max-w-full text-sm leading-8 select-text ${isAI ? 'text-gray-200' : 'bg-[#2f2f2f] rounded-2xl px-5 py-3 border border-white/5 text-left shadow-sm'}`} data-msg-id={msg.id}>
           <MarkdownRenderer
                content={finalMarkdown}
                msg={msg}
                activeInput={activeInput}
                onHighlightMenu={onHighlightMenu}
                expandedThreads={expandedThreads}
                onInlineSubmit={onInlineSubmit}
                onCloseInput={onCloseInput}
                onToggleThread={onToggleThread}
                onScrollToReference={onScrollToReference}
                depth={depth}
           />
        </div>
      </div>
    </div>
  );
}

function InlineInput({ onSubmit, onClose }: any) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="bg-[#2f2f2f] border border-blue-500/30 rounded-xl p-3 shadow-xl w-full max-w-2xl flex items-end gap-3 ring-4 ring-blue-500/5 animate-pulse-slow relative group">
      <textarea ref={ref} rows={1} value={text} onChange={(e)=>{setText(e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px';}} onKeyDown={(e)=>e.key==='Enter'&&!e.shiftKey&&onSubmit(text)} placeholder="Clarify this selection..." className="flex-1 bg-transparent px-3 py-2 outline-none text-white text-sm resize-none max-h-40 font-medium placeholder:text-gray-600" />
      <div className="flex gap-2">
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-gray-500 transition-colors"><X size={18}/></button>
        <button onClick={()=>onSubmit(text)} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 active:scale-90 transition-all shadow-md"><CheckCircle2 size={18}/></button>
      </div>
    </div>
  );
}
