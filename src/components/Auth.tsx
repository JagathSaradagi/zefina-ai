import { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Mail, Lock, Sparkles, Loader2, ShieldAlert } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getFingerprint = () => {
    // Sanitize the string to remove slashes and special characters that break Firebase paths
    const raw = navigator.userAgent + (navigator as any).hardwareConcurrency + screen.width;
    return btoa(raw).replace(/[/+=]/g, "").slice(0, 50); // Base64 encode and clean
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fingerprint = getFingerprint();
    const CREATOR_EMAIL = "jagathsaradagi@gmail.com";

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Registering - Check device locking
        if (email !== CREATOR_EMAIL) {
            const deviceRef = doc(db, "device_locks", fingerprint);
            const deviceSnap = await getDoc(deviceRef);

            if (deviceSnap.exists()) {
                const data = deviceSnap.data();
                if (data.email !== email) {
                    setError(`Device Lock: This device is already linked to another account (${data.email}).`);
                    setLoading(false);
                    return;
                }
            } else {
                await setDoc(deviceRef, { email, timestamp: Date.now() });
            }
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111] border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-blue-500/20">
            <Sparkles className="text-blue-500" size={28} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Zefina AI</h1>
          <p className="text-gray-500 text-sm font-medium">The Recursive Chat Experience</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/5 rounded-xl py-3.5 pl-12 pr-4 text-white text-sm outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3 mt-4 animate-in fade-in slide-in-from-top-2">
              <ShieldAlert size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-400 text-xs font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2 mt-6 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? "Sign In" : "Create Account")}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="text-gray-400 text-xs font-semibold hover:text-white transition-colors"
          >
            {isLogin ? "New to Zefina? Create an account" : "Already have an account? Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}
