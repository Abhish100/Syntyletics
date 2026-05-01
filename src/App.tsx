/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  Search, Youtube, MessageSquare, TrendingUp, History, 
  BarChart3, PieChart as PieChartIcon, AlertCircle, 
  CheckCircle2, Loader2, Github, ExternalLink,
  ThumbsUp, User, Calendar, Trash2, Info,
  Sparkles, Lightbulb, Target, ArrowRight, Zap, LogIn, LogOut, Mail, Key, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
// @ts-ignore
import Papa from 'papaparse';
// @ts-ignore
import type { ParseResult } from 'papaparse';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface Comment {
  text: string;
  author: string;
  likes: number;
  publishedAt?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

type Algorithm = 'logistic_regression' | 'naive_bayes' | 'svm';

interface User {
  id: string;
  email: string;
}

interface AnalysisResult {
  id?: string;
  source: 'youtube' | 'dataset';
  target: string;
  algorithm: Algorithm;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
  suggestions?: string;
  created_at: string;
  comments?: Comment[];
}

// --- Constants ---

const ALGORITHM_INFO = {
  logistic_regression: {
    name: "Logistic Regression (ML)",
    icon: Sparkles,
    description: "A fast linear model that estimates sentiment probabilities using weighted text features.",
    howItWorks: "Applies logistic regression to text features so sentiment is predicted with a stable, interpretable model.",
    bestFor: "Reliable sentiment classification without external API dependencies.",
    limitations: "Less nuanced than LLMs but much faster and works entirely locally."
  },
  naive_bayes: {
    name: "Naive Bayes (ML)",
    icon: Zap,
    description: "High-speed probabilistic classifier based on word frequency and statistical patterns.",
    howItWorks: "Calculates the mathematical probability of a sentiment based on the presence of specific words in the text.",
    bestFor: "Processing extremely large datasets (1000+ rows) where speed is the top priority.",
    limitations: "Ignores word order and context; often misses sarcasm or complex double negatives."
  },
  svm: {
    name: "SVM (Linear)",
    icon: Target,
    description: "Robust machine learning model that finds optimal boundaries between sentiment categories.",
    howItWorks: "Maps text features into a high-dimensional space to find the 'hyperplane' that best separates positive from negative.",
    bestFor: "Standard text classification where reliable, consistent performance is needed without API overhead.",
    limitations: "Less nuanced than LLMs and may struggle with highly informal or slang-heavy text."
  }
};

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.95, y: 20 }}
    whileInView={{ opacity: 1, scale: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, ease: "easeOut" }}
    className={cn("magic-card overflow-hidden", className)}
  >
    {children}
  </motion.div>
);

const Badge = ({ sentiment }: { sentiment: string }) => {
  const styles = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    neutral: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    negative: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  }[sentiment] || "bg-slate-500/10 text-slate-400 border-slate-500/20";

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", styles)}>
      {sentiment}
    </span>
  );
};

const SparkleEffect = () => {
  const sparkles = useMemo(() => Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    duration: `${2 + Math.random() * 4}s`,
    delay: `${Math.random() * 5}s`,
    size: `${Math.random() * 3 + 1}px`,
    color: ['#FFD700', '#7B2CBF', '#4361EE', '#FFFFFF'][Math.floor(Math.random() * 4)]
  })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
      {sparkles.map(s => (
        <div 
          key={s.id}
          className="sparkle"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            backgroundColor: s.color,
            boxShadow: `0 0 ${parseInt(s.size) * 2}px ${s.color}`,
            '--duration': s.duration,
            animationDelay: s.delay
          } as any}
        />
      ))}
    </div>
  );
};

const InfoTooltip = ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block" onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
      {children}
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-slate-900 text-white rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="space-y-3">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [source, setSource] = useState<'youtube' | 'dataset'>('youtube');
  const [algorithm, setAlgorithm] = useState<Algorithm>('logistic_regression');
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<Comment[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [isInitialAuthChecked, setIsInitialAuthChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [devOtp, setDevOtp] = useState('');

  useEffect(() => {
    fetchHistory();
    checkDbStatus();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/auth/me`);
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setUser(data.user);
        } catch (e) {
          console.error("Auth check: invalid JSON", text);
        }
      }
    } catch (err) {
      console.error("Auth check failed", err);
    } finally {
      setIsInitialAuthChecked(true);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Attempting to send OTP to:", loginEmail);
    setAuthLoading(true);
    try {
      const apiUrl = `${window.location.origin}/api/auth/send-otp`;
      console.log(`Fetching ${apiUrl}...`);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
      });
      console.log("Response status:", res.status);
      if (res.ok) {
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse success JSON:", text);
          throw new Error("Server returned success status but invalid JSON format");
        }
        
        console.log("OTP sent successfully", data);
        setOtpSent(true);
        if (data.dev) {
          setDevMode(true);
          setDevOtp(data.otp || '');
        } else {
          setDevMode(false);
          setDevOtp('');
        }
      } else {
        const text = await res.text();
        console.error("OTP send failed. Status:", res.status, "Body:", text);
        let errorMessage = "Failed to send OTP";
        try {
          const data = JSON.parse(text);
          errorMessage = data.hint ? `${data.error}: ${data.hint}` : (data.error || errorMessage);
        } catch (e) {
          errorMessage = `Server error (${res.status}). The server returned an unexpected response format.`;
        }
        alert(errorMessage);
      }
    } catch (err: any) {
      console.error("Error in handleSendOtp:", err);
      alert(`Error sending OTP: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const apiUrl = `${window.location.origin}/api/auth/verify-otp`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, otp }),
      });
      const text = await res.text();
      
      if (res.ok) {
        try {
          const data = JSON.parse(text);
          setUser(data.user);
          setOtpSent(false);
          setOtp('');
          setLoginEmail('');
        } catch (e) {
          console.error("Failed to parse verify JSON:", text);
          alert("Server error: Invalid response format");
        }
      } else {
        try {
          const data = JSON.parse(text);
          alert(data.error || "Invalid OTP");
        } catch (e) {
          alert(`Verification failed (${res.status})`);
        }
      }
    } catch (err) {
      alert("Error verifying OTP");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${window.location.origin}/api/auth/logout`, { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const checkDbStatus = async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/db-health`);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        setDbStatus(data.status);
      } catch (e) {
        console.error("DB health: invalid JSON", text);
        setDbStatus('disconnected');
      }
    } catch {
      setDbStatus('disconnected');
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/history`);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          setHistory(data);
        } else {
          console.warn("History data is not an array:", data);
          setHistory([]);
        }
      } catch (e) {
        console.error("History: invalid JSON", text);
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to fetch history", err);
      setHistory([]);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(content);
          const mappedData = data.map((item: any) => ({
            text: item.text || item.body || item.comment || item.content || "",
            author: item.author || item.user || item.username || "Anonymous",
            likes: item.likes || item.ups || item.like_count || 0,
            publishedAt: item.date || item.created_at || item.timestamp || new Date().toISOString()
          }));
          // Limit to 200 rows for performance
          setFileData(mappedData.slice(0, 200));
          setInput(file.name);
        } else if (file.name.endsWith('.csv')) {
          Papa.parse(content, {
            header: false,
            skipEmptyLines: true,
            complete: (results: ParseResult<any>) => {
              const data = results.data.slice(1).map((row: any) => ({
                text: row[0] || "",
                author: row[1] || "Anonymous",
                likes: parseInt(row[2]) || 0,
                publishedAt: new Date().toISOString()
              }));
              // Limit to 200 rows for performance
              setFileData(data.slice(0, 200));
              setInput(file.name);
            }
          });
        } else if (file.name.endsWith('.txt')) {
          const lines = content.split('\n').filter(l => l.trim());
          const data = lines.map(line => ({
            text: line.trim(),
            author: "Anonymous",
            likes: 0,
            publishedAt: new Date().toISOString()
          }));
          // Limit to 200 rows for performance
          setFileData(data.slice(0, 200));
          setInput(file.name);
        }
        setError(null);
      } catch (err) {
        setError("Failed to parse file. Ensure it's a valid CSV, JSON, or TXT file.");
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const analyzeSentiment = async (comments: Comment[]) => {
    const runBatchPrediction = async () => {
      const commentTexts = comments.map(c => c.text);
      const res = await fetch(`${window.location.origin}/api/predict_batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ texts: commentTexts, algorithm })
      });

      if (!res.ok) {
        throw new Error(`Batch prediction failed: ${res.status}`);
      }

      const data = await res.json();
      if (!data.results || !Array.isArray(data.results)) {
        throw new Error("Invalid response format from batch prediction");
      }

      return comments.map((comment, index) => ({
        text: comment.text || '',
        author: comment.author || 'Anonymous',
        likes: comment.likes || 0,
        publishedAt: comment.publishedAt || new Date().toISOString(),
        sentiment: (data.results[index]?.sentiment || "neutral") as any
      }));
    };

    setAnalysisProgress({ current: 0, total: comments.length });

    try {
      const analyzedComments = await runBatchPrediction();
      setAnalysisProgress({ current: comments.length, total: comments.length });
      return analyzedComments;
    } catch (err: any) {
      console.error("Batch ML API error:", err);
      const analyzedComments: Comment[] = [];

      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];

        try {
          const res = await fetch(`${window.location.origin}/api/predict`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ text: comment.text, algorithm })
          });

          const data = await res.json();
          analyzedComments.push({
            text: comment.text || '',
            author: comment.author || 'Anonymous',
            likes: comment.likes || 0,
            publishedAt: comment.publishedAt || new Date().toISOString(),
            sentiment: data.sentiment || "neutral"
          });
        } catch (individualErr) {
          console.error("Individual ML API error:", individualErr);
          analyzedComments.push({
            text: comment.text || '',
            author: comment.author || 'Anonymous',
            likes: comment.likes || 0,
            publishedAt: comment.publishedAt || new Date().toISOString(),
            sentiment: "neutral"
          });
        }

        setAnalysisProgress({
          current: i + 1,
          total: comments.length
        });
      }

      return analyzedComments;
    }
  };

  const handleAnalyze = async () => {
    if (!input && source !== 'dataset') return;
    setIsAnalyzing(true);
    setError(null);
    setCurrentAnalysis(null);

    try {
      let comments: Comment[] = [];
      let target = input;

      if (source === 'dataset' && fileData) {
        comments = fileData;
        target = input || "Uploaded Dataset";
      } else if (source === 'youtube') {
        const videoIdMatch = input.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
        if (!videoIdMatch) throw new Error("Invalid YouTube URL");
        const videoId = videoIdMatch[1];
        target = videoId;
        
        const res = await fetch(`${window.location.origin}/api/youtube/comments?videoId=${videoId}`);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("YouTube comments: invalid JSON", text);
          throw new Error("Server returned invalid response format for YouTube comments");
        }
        
        if (data.error) throw new Error(data.error);
        comments = data;
      }

      if (comments.length === 0) throw new Error("No comments found to analyze");

      const analyzed = await analyzeSentiment(comments);
      
      const counts: { positive: number; neutral: number; negative: number } = { positive: 0, neutral: 0, negative: 0 };
      for (const curr of analyzed) {
        const sentiment = curr.sentiment || 'neutral';
        if (sentiment in counts) {
          counts[sentiment as keyof typeof counts]++;
        }
      }

      // Generate insights using ML-based analysis
      let suggestions = "Sentiment analysis is complete. Review the model results and use the counts to identify positive, neutral, and negative trends in your text data.";
      try {
        const insightsRes = await fetch(`${window.location.origin}/api/generate-insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positive_count: counts.positive,
            neutral_count: counts.neutral,
            negative_count: counts.negative,
            total_count: analyzed.length,
            comments: analyzed
          })
        });
        
        const insightsText = await insightsRes.text();
        try {
          const insightsData = JSON.parse(insightsText);
          suggestions = insightsData.insights || suggestions;
        } catch (e) {
          console.error("Generate insights: invalid JSON", insightsText);
        }
      } catch (insightsErr) {
        console.error("Failed to generate insights", insightsErr);
      }

      const analysisData = {
        source,
        target,
        algorithm,
        results: {
          ...counts,
          total: analyzed.length
        },
        comments: analyzed,
        suggestions
      };

      const saveRes = await fetch(`${window.location.origin}/api/save-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysisData)
      });
      
      const saveText = await saveRes.text();
      let saveId;
      try {
        const saveData = JSON.parse(saveText);
        saveId = saveData.id;
      } catch (e) {
        console.error("Save analysis: invalid JSON", saveText);
        throw new Error("Server returned invalid response format after saving");
      }
      
      const fullAnalysis: AnalysisResult = {
        id: saveId,
        source,
        target,
        algorithm,
        positive_count: counts.positive,
        neutral_count: counts.neutral,
        negative_count: counts.negative,
        total_count: analyzed.length,
        suggestions,
        created_at: new Date().toISOString(),
        comments: analyzed
      };

      setCurrentAnalysis(fullAnalysis);
      fetchHistory();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadAnalysis = async (id: string) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${window.location.origin}/api/analysis/${id}`);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        setCurrentAnalysis(data);
        setSource(data.source);
        setInput(data.target);
        setAlgorithm(
          data.algorithm === 'logistic_regression' || data.algorithm === 'svm' || data.algorithm === 'naive_bayes'
            ? data.algorithm
            : 'logistic_regression'
        );
      } catch (e) {
        console.error("Load analysis: invalid JSON", text);
        alert("Failed to load analysis: invalid response format");
      }
    } catch (err) {
      console.error("Failed to load analysis", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const chartData = useMemo(() => {
    if (!currentAnalysis) return [];
    return [
      { name: 'Positive', value: currentAnalysis.positive_count, color: '#10b981' },
      { name: 'Neutral', value: currentAnalysis.neutral_count, color: '#64748b' },
      { name: 'Negative', value: currentAnalysis.negative_count, color: '#f43f5e' },
    ];
  }, [currentAnalysis]);

  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setRuntimeError(event.message || 'An unknown runtime error occurred');
      console.error('Runtime error:', event.error || event.message, event.filename, event.lineno, event.colno);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || String(event.reason || 'Unhandled promise rejection');
      setRuntimeError(message);
      console.error('Unhandled promise rejection:', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/health`);
        if (res.ok) setApiStatus('ok');
        else setApiStatus('error');
      } catch (e) {
        setApiStatus('error');
      }
    };
    
    const checkDb = async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/db-health`);
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setDbStatus(data.status === 'connected' ? 'connected' : 'disconnected');
        } catch (e) {
          setDbStatus('disconnected');
        }
      } catch (e) {
        setDbStatus('disconnected');
      }
    };

    checkApi();
    checkDb();
    
    // Poll for DB status every 10 seconds if disconnected
    const interval = setInterval(checkDb, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!isInitialAuthChecked) {
    return (
      <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center">
        <Loader2 className="animate-spin text-magic-gold" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center p-4 relative overflow-hidden">
        <SparkleEffect />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-magic-gold/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-magic-purple/5 blur-[120px] rounded-full" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-md bg-magic-blue/40 border border-white/10 rounded-[32px] p-8 backdrop-blur-xl shadow-2xl"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-magic-gold via-magic-purple to-magic-gold rounded-t-full" />
          
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-20 h-20 bg-magic-gold/10 rounded-3xl flex items-center justify-center text-magic-gold mb-6 shadow-lg shadow-magic-gold/5">
              <Sparkles size={40} />
            </div>
            <h1 className="font-serif text-3xl font-bold text-white mb-3 magic-gradient-text">Sentilytics Magic</h1>
            <p className="text-slate-400 text-sm leading-relaxed">Enter the sanctum to begin your journey into the magical archives of sentiment.</p>
            
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  apiStatus === 'ok' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                  apiStatus === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-yellow-500 animate-pulse'
                }`} />
                <span className="text-white/30">
                  System: {apiStatus === 'ok' ? 'Ready' : apiStatus === 'error' ? 'Offline' : 'Awakening...'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  dbStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                  dbStatus === 'disconnected' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-yellow-500 animate-pulse'
                }`} />
                <span className="text-white/30">
                  Database: {dbStatus === 'connected' ? 'Connected' : dbStatus === 'disconnected' ? 'Disconnected' : 'Connecting...'}
                </span>
              </div>
            </div>

            {dbStatus === 'disconnected' && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center max-w-[280px]">
                <p className="text-[10px] text-rose-400 leading-tight">
                  <span className="font-bold">Database Error:</span> The portal to the archives is blocked. Please check your MONGODB_URI in the Secrets panel.
                </p>
              </div>
            )}
          </div>

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-magic-gold transition-colors" size={18} />
                  <input 
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="wizard@magic.com"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-magic-gold/50 focus:bg-white/[0.08] transition-all"
                  />
                </div>
              </div>
              <button 
                disabled={authLoading}
                type="submit"
                className="w-full py-4 bg-magic-gold text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-magic-gold/90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-magic-gold/20"
              >
                {authLoading ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                Send Magic Code
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Access Code</label>
                <div className="relative group">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-magic-gold transition-colors" size={18} />
                  <input 
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="000000"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-magic-gold/50 focus:bg-white/[0.08] transition-all tracking-[0.5em] text-center font-mono text-xl"
                  />
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-4">
                  Code sent to <span className="text-slate-300 font-medium">{loginEmail}</span>
                </p>
                {devMode && (
                  <div className="mt-4 p-4 bg-magic-gold/10 border border-magic-gold/20 rounded-xl text-center">
                    <p className="text-xs text-magic-gold font-medium mb-1">Dev Mode Active</p>
                    <p className="text-[10px] text-slate-400 mb-2">SMTP email sending failed or is not configured. Your magic code is:</p>
                    <div className="text-xl font-mono font-bold text-magic-gold tracking-widest">{devOtp}</div>
                  </div>
                )}
              </div>
              <button 
                disabled={authLoading}
                type="submit"
                className="w-full py-4 bg-magic-gold text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-magic-gold/90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-magic-gold/20"
              >
                {authLoading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                Verify Code
              </button>
              <button 
                type="button"
                onClick={() => setOtpSent(false)}
                className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs transition-colors font-medium"
              >
                Change Email
              </button>
            </form>
          )}

          <div className="mt-10 pt-8 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">© 2026 Sentilytics Magic</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-slate-200 font-sans selection:bg-magic-gold/30 relative overflow-x-hidden">
      <SparkleEffect />
      {runtimeError && (
        <div className="fixed inset-x-0 top-24 z-50 mx-auto max-w-4xl px-6">
          <div className="rounded-3xl border border-rose-500/40 bg-rose-500/10 p-5 text-rose-100 shadow-2xl backdrop-blur-xl">
            <p className="text-sm font-bold">Runtime error detected</p>
            <p className="text-xs text-rose-200 mt-1">{runtimeError}</p>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
            <div className="w-10 h-10 bg-gradient-to-br from-magic-gold to-magic-purple rounded-2xl flex items-center justify-center text-white shadow-lg shadow-magic-purple/20">
              <Sparkles size={24} className="animate-pulse" />
            </div>
            <div>
              <h1 className="font-serif font-bold text-2xl tracking-tight magic-gradient-text">Sentilytics</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">Magic in Analytics</p>
            </div>
          </motion.div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Magic User</span>
                <span className="text-xs text-white font-medium">{user?.email}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-rose-400 transition-all"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
        {/* Sidebar / Controls */}

        <div className="lg:col-span-4 space-y-8">
          <Card className="p-8">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-6">Cast a Spell</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/5">
                <button 
                  onClick={() => setSource('youtube')}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                    source === 'youtube' ? "bg-white/10 text-magic-gold shadow-lg" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Youtube size={14} /> YouTube
                </button>
                <button 
                  onClick={() => setSource('dataset')}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                    source === 'dataset' ? "bg-white/10 text-magic-gold shadow-lg" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <History size={14} /> Dataset
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Enchantment Method</label>
                  <InfoTooltip content={
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-magic-gold uppercase mb-1">Logistic Regression (ML)</p>
                        <p className="text-[10px] leading-relaxed text-slate-300">A stable local model that predicts sentiment from weighted text features without external API calls.</p>
                      </div>
                      <div className="pt-2 border-t border-white/10">
                        <p className="text-[10px] font-bold text-magic-indigo uppercase mb-1">Naive Bayes (ML)</p>
                        <p className="text-[10px] leading-relaxed text-slate-300">Lightning fast probability magic. Best for massive scrolls of data.</p>
                      </div>
                    </div>
                  }>
                    <Info size={14} className="text-slate-600 hover:text-magic-gold cursor-help transition-colors" />
                  </InfoTooltip>
                </div>
                <select 
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-magic-purple/30 transition-all text-slate-200 appearance-none cursor-pointer"
                >
                  <option value="logistic_regression" className="bg-magic-blue">Logistic Regression (ML)</option>
                  <option value="naive_bayes" className="bg-magic-blue">Naive Bayes (ML)</option>
                </select>

                <AnimatePresence mode="wait">
                  <motion.div 
                    key={algorithm}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 bg-gradient-to-br from-white/5 to-transparent rounded-2xl border border-white/5"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {React.createElement(ALGORITHM_INFO[algorithm].icon, { size: 14, className: "text-magic-gold" })}
                      <span className="text-[10px] font-bold text-magic-gold uppercase tracking-widest">
                        {ALGORITHM_INFO[algorithm].name}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                      {ALGORITHM_INFO[algorithm].description}
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
                      <div>
                        <p className="text-[8px] font-bold text-slate-500 uppercase mb-1">Best For</p>
                        <p className="text-[9px] text-slate-200 font-medium leading-tight">{ALGORITHM_INFO[algorithm].bestFor}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-bold text-slate-500 uppercase mb-1">How it works</p>
                        <p className="text-[9px] text-slate-200 font-medium leading-tight">{ALGORITHM_INFO[algorithm].howItWorks}</p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {source === 'dataset' ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Upload Your Scrolls</label>
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        "relative group border-2 border-dashed rounded-[2rem] p-10 transition-all flex flex-col items-center justify-center text-center cursor-pointer",
                        isDragging 
                          ? "border-magic-gold bg-magic-gold/5 scale-[1.02]" 
                          : "border-white/10 bg-white/5 hover:border-magic-purple/50 hover:bg-white/[0.07]"
                      )}
                      onClick={() => document.getElementById('fileInput')?.click()}
                    >
                      <input 
                        id="fileInput"
                        type="file"
                        accept=".json,.csv,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="w-16 h-16 bg-white/5 rounded-2xl shadow-inner flex items-center justify-center text-magic-gold mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                        <History size={32} />
                      </div>
                      <p className="text-sm font-bold text-slate-200 mb-2">
                        {input ? input : "Drop your data here"}
                      </p>
                      <p className="text-xs text-slate-500 font-light">
                        {input ? "Click to change file" : "Magical formats: CSV, JSON, TXT"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={source === 'youtube' ? "Enter YouTube Video URL" : "Enter Search Term"}
                    className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl focus:ring-2 focus:ring-magic-gold/30 focus:border-magic-gold/50 transition-all outline-none text-sm text-slate-200 placeholder:text-slate-600"
                  />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-magic-gold transition-colors" size={20} />
                </div>
              )}

              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing || !input}
                className="magic-button w-full py-4 bg-gradient-to-r from-magic-purple to-magic-indigo hover:from-magic-purple hover:to-magic-purple disabled:from-slate-800 disabled:to-slate-800 text-white rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-magic-purple/20"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Casting Spell...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Analyze Magic
                  </>
                )}
              </button>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-400 text-xs"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </div>
          </Card>

          <Card className="p-8">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <History size={16} /> Past Enchantments
            </h2>
            <div className="space-y-4">
              {history.length === 0 ? (
                <p className="text-slate-600 text-xs italic py-6 text-center">Your magic history is empty</p>
              ) : (
                history.map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => item.id && loadAnalysis(item.id)}
                    className="w-full text-left p-4 rounded-2xl border border-white/5 bg-white/5 hover:border-magic-gold/30 hover:bg-white/[0.08] transition-all group relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-magic-gold uppercase tracking-widest flex items-center gap-1.5">
                          {item.source === 'youtube' ? <Youtube size={12} /> : <History size={12} />}
                          {item.source}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-medium">
                        {format(new Date(item.created_at), 'MMM d')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200 truncate mb-3">
                      {item.target}
                    </p>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
                      <div className="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: `${(item.positive_count / item.total_count) * 100}%` }} />
                      <div className="bg-slate-600" style={{ width: `${(item.neutral_count / item.total_count) * 100}%` }} />
                      <div className="bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" style={{ width: `${(item.negative_count / item.total_count) * 100}%` }} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-8 space-y-10">
          {!currentAnalysis && !isAnalyzing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-[700px] flex flex-col items-center justify-center text-center p-12 magic-card border-dashed border-white/10"
            >
              <div className="w-24 h-24 bg-gradient-to-br from-magic-purple/20 to-magic-indigo/20 rounded-full flex items-center justify-center text-magic-gold mb-8 relative">
                <div className="absolute inset-0 bg-magic-gold/20 rounded-full animate-ping opacity-20" />
                <Sparkles size={48} />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-100 mb-4">The Magic Awaits</h3>
              <p className="text-slate-400 max-w-md font-light leading-relaxed">
                Step into the realm of Sentilytics. Upload your social scrolls or enter a YouTube portal to begin your journey into sentiment magic.
              </p>
            </motion.div>
          )}

          {isAnalyzing && !currentAnalysis && (
            <div className="h-[700px] flex flex-col items-center justify-center text-center p-12 magic-card">
              <div className="relative mb-10">
                <Loader2 className="animate-spin text-magic-gold" size={64} />
                <Sparkles className="absolute top-0 right-0 text-magic-purple animate-bounce" size={24} />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-100 mb-4">Casting Sentiment Spells</h3>
              <p className="text-slate-400 mb-10 font-light">
                Our AI wizards are deciphering the emotions hidden within your data...
              </p>
              
              {analysisProgress.total > 0 && (
                <div className="w-full max-w-sm space-y-4">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                    <span>Magic Progress</span>
                    <span className="text-magic-gold">{Math.round((analysisProgress.current / analysisProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-magic-purple via-magic-indigo to-magic-gold rounded-full shadow-[0_0_15px_rgba(123,44,191,0.5)]" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium tracking-widest">
                    {analysisProgress.current} OF {analysisProgress.total} COMMENTS ENCHANTED
                  </p>
                </div>
              )}
            </div>
          )}

          {currentAnalysis && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-8 bg-emerald-500/5 border-emerald-500/10 relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <ThumbsUp size={80} className="text-emerald-500" />
                  </div>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em] mb-2">Positive Magic</p>
                  <h4 className="text-4xl font-serif font-bold text-emerald-400 mb-1">
                    {Math.round((currentAnalysis.positive_count / currentAnalysis.total_count) * 100)}%
                  </h4>
                  <p className="text-xs text-slate-500">{currentAnalysis.positive_count} comments</p>
                </Card>
                <Card className="p-8 bg-slate-500/5 border-slate-500/10 relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <RefreshCw size={80} className="text-slate-500" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Neutral Vibe</p>
                  <h4 className="text-4xl font-serif font-bold text-slate-400 mb-1">
                    {Math.round((currentAnalysis.neutral_count / currentAnalysis.total_count) * 100)}%
                  </h4>
                  <p className="text-xs text-slate-500">{currentAnalysis.neutral_count} comments</p>
                </Card>
                <Card className="p-8 bg-rose-500/5 border-rose-500/10 relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <AlertCircle size={80} className="text-rose-500" />
                  </div>
                  <p className="text-[10px] font-bold text-rose-500 uppercase tracking-[0.2em] mb-2">Dark Clouds</p>
                  <h4 className="text-4xl font-serif font-bold text-rose-400 mb-1">
                    {Math.round((currentAnalysis.negative_count / currentAnalysis.total_count) * 100)}%
                  </h4>
                  <p className="text-xs text-slate-500">{currentAnalysis.negative_count} comments</p>
                </Card>
              </div>

              {/* Charts & Insights */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-8">
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                    <PieChartIcon size={18} className="text-magic-gold" /> Sentiment Distribution
                  </h3>
                  <div className="space-y-8">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={100}
                          paddingAngle={8}
                          dataKey="value"
                          stroke="none"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1A1A2E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem' }}
                          itemStyle={{ color: '#fff', fontSize: '12px' }}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-72 p-4 bg-slate-950/70 rounded-[2rem] border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-bold text-slate-100 uppercase tracking-[0.2em]">Sentiment Counts</p>
                        <p className="text-[10px] text-slate-500">Comparison of positive, neutral and negative comment totals.</p>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem' }}
                          itemStyle={{ color: '#fff', fontSize: '12px' }}
                        />
                        <Bar dataKey="value" radius={[12,12,0,0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`bar-cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                </Card>

                <Card className="p-8 bg-gradient-to-br from-magic-purple/10 to-transparent border-magic-purple/20">
                  <h3 className="text-sm font-bold text-magic-gold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Lightbulb size={18} /> AI Wizard Insights
                  </h3>
                  <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-400 prose-headings:text-slate-100 prose-strong:text-magic-gold prose-li:text-slate-400">
                    <Markdown>{currentAnalysis.suggestions || "The wizards are silent..."}</Markdown>
                  </div>
                </Card>
              </div>

              {/* Detailed Comments */}
              <Card className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-[0.2em] flex items-center gap-2">
                    <MessageSquare size={18} className="text-magic-indigo" /> The Enchanted Scroll
                  </h3>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total: {currentAnalysis.total_count}</span>
                  </div>
                </div>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                  {currentAnalysis.comments?.map((comment, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      key={idx} 
                      className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/[0.08] transition-all group"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                            {(comment.author?.[0] || 'A').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-200">{comment.author || 'Anonymous'}</p>
                            <p className="text-[10px] text-slate-500">
                              {comment.publishedAt && !isNaN(new Date(comment.publishedAt).getTime())
                                ? format(new Date(comment.publishedAt), 'MMM d, yyyy')
                                : 'Recently'}
                            </p>
                          </div>
                        </div>
                        <Badge sentiment={comment.sentiment || 'neutral'} />
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed font-light italic">"{comment.text}"</p>
                      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-magic-gold transition-colors">
                          <ThumbsUp size={12} />
                          <span className="text-[10px] font-bold">{comment.likes}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center text-magic-gold">
              <Sparkles size={16} />
            </div>
            <span className="font-serif font-bold text-lg magic-gradient-text">Sentilytics</span>
          </div>
          <p className="text-xs text-slate-600 font-light">© 2026 Sentilytics Magic. All spells reserved.</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full", 
                dbStatus === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
              )} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {dbStatus === 'connected' ? 'Magic Portal Open' : 'Portal Closed'}
              </span>
            </div>
            <a href="#" className="text-xs text-slate-500 hover:text-magic-gold transition-colors">Privacy Scroll</a>
            <a href="#" className="text-xs text-slate-500 hover:text-magic-gold transition-colors">Terms of Magic</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
