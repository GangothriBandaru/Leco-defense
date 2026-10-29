import { createContext, useContext, useState, ReactNode } from "react";

// Single, case-level note. Stage + context are captured automatically.
export interface Note {
  id: string;
  caseName: string;
  stage: string;            // Collection | Analysis | Valuation | Case Ready
  contextType?: string;     // e.g. "Liability Signal", "Injury Signal", "Document"
  reference?: string;       // e.g. "Red-Light Intersection Encroachment" or a file name
  category: string;
  priority: string;
  content: string;
  author: string;
  timestamp: string;   // original creation time (preserved on edit)
  editedAt?: string;   // set when the note is modified
}

// Ambient document/evidence context, set by evidence workspaces while open.
export interface DocContext {
  contextType: string;
  reference: string;
}

interface NotesContextValue {
  notes: Note[];
  caseName: string;
  stage: string;
  docContext: DocContext | null;
  setDocContext: (c: DocContext | null) => void;
  addNote: (input: { content: string; category: string; priority: string }) => void;
  updateNote: (id: string, input: { content: string; category: string; priority: string }) => void;
  deleteNote: (id: string) => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

const STAGES = ["Collection", "Conflict Check", "Analysis", "Valuation", "Case Ready"] as const;

// A couple of seed notes for the demo case so counts/badge are populated.
const SEED_NOTES: Note[] = [
  {
    id: "seed-1",
    caseName: "Estate of Miller vs Logistics Co.",
    stage: "Collection",
    category: "Strategy",
    priority: "Medium",
    content: "Confirm the signed retainer scope covers the wrongful-death claim before proceeding.",
    author: "You",
    timestamp: "Jun 22, 2026 · 9:14 AM",
  },
  {
    id: "seed-2",
    caseName: "Estate of Miller vs Logistics Co.",
    stage: "Analysis",
    contextType: "Liability Signal",
    reference: "Red-Light Intersection Encroachment",
    category: "Liability",
    priority: "High",
    content: "Strong liability signal — flag the officer's narrative as the lead exhibit for the demand.",
    author: "You",
    timestamp: "Jun 23, 2026 · 2:40 PM",
  },
];

function formatTimestamp(d: Date) {
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function NotesProvider({
  caseName,
  stage,
  author = "You",
  children,
}: {
  caseName: string;
  stage: string;
  author?: string;
  children: ReactNode;
}) {
  const [notes, setNotes] = useState<Note[]>(SEED_NOTES);
  const [docContext, setDocContext] = useState<DocContext | null>(null);

  const addNote: NotesContextValue["addNote"] = ({ content, category, priority }) => {
    if (!content.trim()) return;
    const note: Note = {
      id: `note-${notes.length + 1}-${content.length}`,
      caseName,
      stage,
      contextType: docContext?.contextType,
      reference: docContext?.reference,
      category,
      priority,
      content: content.trim(),
      author,
      timestamp: formatTimestamp(new Date()),
    };
    setNotes((prev) => [note, ...prev]);
  };

  const updateNote: NotesContextValue["updateNote"] = (id, { content, category, priority }) => {
    if (!content.trim()) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, content: content.trim(), category, priority, editedAt: formatTimestamp(new Date()) }
          : n,
      ),
    );
  };

  const deleteNote: NotesContextValue["deleteNote"] = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotesContext.Provider value={{ notes, caseName, stage, docContext, setDocContext, addNote, updateNote, deleteNote }}>
      {children}
    </NotesContext.Provider>
  );
}

// Safe no-op fallback if used outside a provider (keeps shared components robust).
const NOOP: NotesContextValue = {
  notes: [],
  caseName: "",
  stage: "",
  docContext: null,
  setDocContext: () => {},
  addNote: () => {},
  updateNote: () => {},
  deleteNote: () => {},
};

export function useNotes() {
  return useContext(NotesContext) ?? NOOP;
}

export { STAGES };
