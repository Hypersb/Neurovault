# Neurovault

Neurovault is an advanced AI-powered knowledge management platform designed for teams and individuals who want to build, organize, and interact with their own knowledge bases. Built with Next.js, Supabase, and Google Gemini, Neurovault combines cognitive architecture, knowledge graphs, and retrieval-augmented AI chat into a seamless, modern workspace.

---

## 🚀 Features

- **Multi-Brain Workspaces:**
  - Create multiple "brains" (knowledge spaces) with unique personality profiles, memory decay, and version control.
- **Knowledge Graph Visualization:**
  - Automatic extraction of concepts and relationships from your documents, visualized as an interactive graph.
- **AI Chat with Memory:**
  - RAG-powered conversations grounded in your trained knowledge, with source citations and context retention.
- **Training Pipeline:**
  - Upload PDFs, DOCX, audio, or text. Files are parsed, chunked, embedded, and have entities extracted automatically.
- **Vector Search:**
  - Fast, semantic search across all your knowledge using pgvector.
- **Secure & Scalable:**
  - Built on Supabase (Postgres, Auth, Storage) with robust access control.

---

## 🧠 Tech Stack

- **Frontend:** Next.js 14, React, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Storage), pgvector
- **AI:** Google Gemini 2.5 (via API)
- **Other:** TypeScript, Vercel (deploy), Shadcn UI

---

## 🏗️ Database Schema Highlights

- **Brains:** Workspaces for knowledge, each with its own profile and versioning
- **Memories:** Knowledge chunks with vector embeddings for semantic search
- **Concepts & Relationships:** Nodes and edges for the knowledge graph
- **Training Jobs:** Track document ingestion and processing
- **Conversations:** Store chat history and context

---

## 📦 Supported File Formats

- PDF, DOCX, TXT, MP3 (audio transcription)

---

## 🛠️ Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Hypersb/Neurovault.git
   cd Neurovault
   ```
2. **Install dependencies:**
   ```bash
   npm install
   # or yarn, pnpm, bun
   ```
3. **Set up environment variables:**
   - Copy `.env.example` to `.env.local` and add your Supabase and Gemini API keys.
   - **Never commit your API keys.**
4. **Run the development server:**
   ```bash
   npm run dev
   ```
5. **Open [http://localhost:3000](http://localhost:3000) in your browser.**

---

## 🧩 Project Structure

- `src/app/` — Next.js app directory (routes, pages, API)
- `src/components/` — UI components and layout
- `src/lib/` — AI logic, hooks, utilities, Supabase client
- `supabase-schema.sql` — Database schema (run in Supabase SQL editor)

---

## 🧑‍💻 Contributing

Contributions are welcome! Please open issues or pull requests for features, bugs, or documentation improvements.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

---

## ⚠️ Security Note

**Never commit your API keys or secrets.** Use environment variables and `.env.local` for sensitive information. The repository is .gitignored for `.env*` files by default.

---

## 🌐 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Gemini](https://ai.google.dev/gemini-api/docs)

---

> Neurovault: Your knowledge, supercharged by AI.
