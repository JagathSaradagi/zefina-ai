# Zefina AI: The No-Nav Experience 🌳

**Zefina** is a web-native "Recursive Chat" engine designed to replace the inefficient linear scroll of traditional AI interfaces with a dynamic, branch-driven Knowledge Tree.

## 🚀 The Vision: Why "No-Nav"?
Most conversational AIs today force users into a linear timeline. When you get a doubt mid-paragraph, you're forced to ask at the bottom, creating a navigation loop: scroll down for clarification, scroll back up to continue. 

Zefina eliminates this "Cognitive Tax" by allowing the AI to answer **exactly where your doubt happens.**

## ✨ Key Features
- **Arbitrary Span Selection**: Highlight any string of text within an AI response to trigger an inline branch.
- **Intra-Message Threading**: Dynamically injects recursive sub-threads into the middle of a message using precise character-offset mapping.
- **Context Slicing**: The LLM context is "sliced" at the point of selection, ensuring the AI only sees what you've read so far for hyper-focused clarifications.
- **Top-Locked Navigation**: A deterministic, layout-stable navigation system that pins referenced parent text to the exact top of the viewport with an emerald pulse confirmation.
- **Recursive Depth Management**: Supports multi-level nesting with visual indentation and color-coded borders to maintain logical flow in deep research.

## 🛠️ Tech Stack
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion (Layout-aware transitions)
- **Backend**: Firebase (Firestore & Auth)
- **AI Engine**: Groq API (Llama 3.3 70B Versatile)
- **Markdown**: ReactMarkdown + remark-gfm + rehype-raw

## 🔒 Security & Access Control
- **Dual-Mode Architecture**: Features a "Creator Mode" (Unlimited) and a "User Mode" (Limited) to protect API quotas during public technical previews.
- **Device Locking**: Implements hardware fingerprinting to prevent spam account creation on a single device.
- **Environment Safety**: Secure API key management via VITE environment variables.

---
*Developed by Jagath Saradagi as a study in human-AI interaction architecture.*
