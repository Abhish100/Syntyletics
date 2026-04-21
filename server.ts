import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import natural from "natural";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB Connection
// Using the explicitly provided URI from the user
const rawUri = process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('cluster0.qv0oqyy') 
  ? process.env.MONGODB_URI 
  : "mongodb+srv://as9423320_db_user:YVTzl9wyH886qlGq@sentilytics.0tu8yne.mongodb.net/?appName=Sentilytics";

// Robust URI handling for passwords containing '@'
let MONGODB_URI = rawUri;
try {
  // Only attempt to encode if there are multiple '@' signs, suggesting an unencoded password
  if ((rawUri.match(/@/g) || []).length > 1) {
    const parts = rawUri.split('@');
    const hostPart = parts.pop(); 
    const credentialsPart = parts.join('@'); 
    
    if (credentialsPart.includes('://')) {
      const [protocol, auth] = credentialsPart.split('://');
      if (auth.includes(':')) {
        const [username, ...passwordParts] = auth.split(':');
        const password = passwordParts.join(':');
        // Encode password but avoid double-encoding
        const encodedPassword = encodeURIComponent(decodeURIComponent(password));
        MONGODB_URI = `${protocol}://${username}:${encodedPassword}@${hostPart}`;
      }
    }
  }
} catch (e) {
  console.error("Error parsing MONGODB_URI:", e);
}

// Set global mongoose options
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', false);

// Schemas
const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  sentiment: { type: String, required: true },
  author: String,
  likes: { type: Number, default: 0 }
});

const analysisHistorySchema = new mongoose.Schema({
  source: { type: String, required: true },
  target: { type: String, required: true },
  algorithm: { type: String, default: 'logistic_regression' },
  positive_count: { type: Number, default: 0 },
  neutral_count: { type: Number, default: 0 },
  negative_count: { type: Number, default: 0 },
  total_count: { type: Number, default: 0 },
  suggestions: String,
  created_at: { type: Date, default: Date.now },
  comments: [commentSchema]
});

analysisHistorySchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    (ret as any).id = ret._id;
    delete ret._id;
  }
});

const AnalysisHistory = mongoose.model('AnalysisHistory', analysisHistorySchema);

// Auth Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 } // 10 minutes
});

const OTP = mongoose.model('OTP', otpSchema);

let MONGODB_CONNECTED = false;
const inMemoryAnalysisHistory: any[] = [];
const inMemoryUsers: any[] = [];
const inMemoryOtps: Array<{ email: string; otp: string; createdAt: Date }> = [];

const isDbReady = () => mongoose.connection.readyState === 1 && MONGODB_CONNECTED;
const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const deleteInMemoryOtps = async (email: string) => {
  for (let i = inMemoryOtps.length - 1; i >= 0; i--) {
    if (inMemoryOtps[i].email === email) {
      inMemoryOtps.splice(i, 1);
    }
  }
};

const findInMemoryOtp = async (email: string, otp: string) => {
  return inMemoryOtps.find(item => item.email === email && item.otp === otp) || null;
};

const findInMemoryUserByEmail = async (email: string) => {
  return inMemoryUsers.find(item => item.email === email) || null;
};

const createInMemoryUser = async (email: string) => {
  const user = { _id: generateId(), email, createdAt: new Date() };
  inMemoryUsers.push(user);
  return user;
};

const createInMemoryAnalysis = async (data: any) => {
  const record = { _id: generateId(), ...data };
  inMemoryAnalysisHistory.unshift(record);
  return record;
};

const findInMemoryAnalysisById = async (id: string) => {
  return inMemoryAnalysisHistory.find(item => item._id === id) || null;
};

const listInMemoryAnalysisHistory = async () => {
  return inMemoryAnalysisHistory.slice(0, 20);
};

// Mail Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Initialize Naive Bayes Classifier with some training data
const classifier = new natural.BayesClassifier();

// Simple training set
classifier.addDocument('i love this so much amazing great', 'positive');
classifier.addDocument('best thing ever wonderful', 'positive');
classifier.addDocument('happy good excellent', 'positive');
classifier.addDocument('hate this terrible worst', 'negative');
classifier.addDocument('bad awful boring', 'negative');
classifier.addDocument('disappointed annoying', 'negative');
classifier.addDocument('it is okay fine normal', 'neutral');
classifier.addDocument('maybe average standard', 'neutral');
classifier.addDocument('the video is about a cat', 'neutral');

classifier.train();

const logisticWeights: Record<string, number> = {
  love: 2.5,
  great: 2.2,
  amazing: 2.3,
  wonderful: 2.0,
  excellent: 2.1,
  best: 2.4,
  happy: 2.0,
  good: 1.8,
  awesome: 2.0,
  fantastic: 2.1,
  exciting: 1.9,
  like: 1.2,
  lovely: 1.8,
  loveable: 1.9,
  hate: -2.5,
  terrible: -2.3,
  worst: -2.4,
  awful: -2.0,
  bad: -1.8,
  boring: -1.8,
  disappointed: -2.0,
  annoying: -2.0,
  poor: -1.9,
  sucks: -2.1,
  meh: -1.0,
  stupid: -2.2,
  dumb: -2.0,
  irrelevant: -1.5,
  okay: 0.2,
  fine: 0.3,
  normal: 0.1,
  average: 0.0,
  standard: 0.0,
  maybe: 0.0
};

const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
};

const logisticRegressionSentiment = (text: string) => {
  const tokens = normalizeText(text);
  const score = tokens.reduce((sum, token) => sum + (logisticWeights[token] || 0), 0) + 0.5;
  const probability = 1 / (1 + Math.exp(-score));
  if (probability >= 0.65) return 'positive';
  if (probability <= 0.35) return 'negative';
  return 'neutral';
};

const svmSentiment = (text: string) => {
  const positiveWords = ['love', 'great', 'amazing', 'best', 'good', 'happy', 'awesome', 'excellent', 'fantastic'];
  const negativeWords = ['hate', 'bad', 'terrible', 'worst', 'awful', 'boring', 'disappointed', 'annoying', 'poor', 'sucks'];

  let score = 0;
  const words = normalizeText(text);
  words.forEach((w) => {
    if (positiveWords.includes(w)) score += 1.5;
    if (negativeWords.includes(w)) score -= 1.5;
  });

  if (score > 0.5) return 'positive';
  if (score < -0.5) return 'negative';
  return 'neutral';
};

const classifyLocalText = (text: string, algorithm = 'logistic_regression') => {
  switch (algorithm) {
    case 'svm':
      return svmSentiment(text);
    case 'naive_bayes':
      return classifier.classify(text.toLowerCase());
    case 'logistic_regression':
    default:
      return logisticRegressionSentiment(text);
  }
};

async function startServer() {
  const app = express();
  const DEFAULT_PORT = 3000;
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  
  // Start listening IMMEDIATELY to satisfy the proxy health checks
  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server listening on http://127.0.0.1:${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
    
    // Connect to MongoDB in the background
    console.log("Connecting to MongoDB...");
    mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
    }).then(() => {
      MONGODB_CONNECTED = true;
      console.log("Connected to MongoDB successfully");
    }).catch(err => {
      MONGODB_CONNECTED = false;
      console.error("CRITICAL: MongoDB connection failed:", err.message);
      if (err.message.includes('ENOTFOUND')) {
        console.error("HINT: The MongoDB hostname could not be resolved. Please check your MONGODB_URI cluster name and DNS settings.");
      }
      console.warn("WARNING: MongoDB is unavailable. Running with in-memory fallback storage in development mode.");
    });
  });

  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  
  // Request Logger
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ML Model Prediction Proxy - Forward to FastAPI backend
  app.post("/api/predict", async (req, res) => {
    try {
      const { text, algorithm } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const algo = ['logistic_regression', 'naive_bayes', 'svm'].includes(algorithm) ? algorithm : 'logistic_regression';

      try {
        const response = await fetch("http://127.0.0.1:8001/predict", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ text, algorithm: algo })
        });

        if (!response.ok) {
          console.warn(`FastAPI /predict unavailable (${response.status}). Using local ${algo} fallback.`);
          return res.json({ sentiment: classifyLocalText(text, algo), fallback: true });
        }

        const data = await response.json();
        return res.json(data);
      } catch (innerErr: any) {
        console.warn("FastAPI /predict request failed. Using local fallback.", innerErr.message);
        return res.json({ sentiment: classifyLocalText(text, algo), fallback: true, details: innerErr.message });
      }
    } catch (err: any) {
      console.error("Prediction proxy error:", err.message);
      res.status(503).json({ 
        error: "ML model service is unavailable and local fallback failed.",
        details: err.message
      });
    }
  });

  // Batch ML Model Prediction Proxy - Forward to FastAPI backend (MUCH FASTER!)
  app.post("/api/predict_batch", async (req, res) => {
    try {
      const { texts, algorithm } = req.body;
      if (!texts || !Array.isArray(texts)) {
        return res.status(400).json({ error: "Texts array is required" });
      }

      const algo = ['logistic_regression', 'naive_bayes', 'svm'].includes(algorithm) ? algorithm : 'logistic_regression';
      console.log(`🔄 Processing batch of ${texts.length} comments with ${algo}...`);

      try {
        const response = await fetch("http://127.0.0.1:8001/predict_batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ texts, algorithm: algo })
        });

        if (!response.ok) {
          console.warn(`FastAPI batch unavailable (${response.status}). Using local ${algo} fallback.`);
          const results = texts.map((text: string) => ({ sentiment: classifyLocalText(text, algo) }));
          return res.json({ results, fallback: true });
        }

        const data = await response.json();
        console.log(`✅ Batch prediction completed for ${data.results?.length || 0} comments`);
        return res.json(data);
      } catch (innerErr: any) {
        console.warn("FastAPI batch request failed. Using local fallback.", innerErr.message);
        const results = texts.map((text: string) => ({ sentiment: classifyLocalText(text, algo) }));
        return res.json({ results, fallback: true, details: innerErr.message });
      }
    } catch (err: any) {
      console.error("Batch prediction proxy error:", err.message);
      res.status(503).json({ 
        error: "ML model service is unavailable and local fallback failed.",
        details: err.message
      });
    }
  });

  app.get("/api/db-health", (req, res) => {
    const status = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({ 
      status, 
      database: "MongoDB",
      error: mongoose.connection.readyState !== 1 ? "Database connection is not active. Check your MONGODB_URI." : null
    });
  });

  // Auth Routes
  app.get("/api/auth/send-otp", (req, res) => {
    res.json({ message: "Use POST to send OTP", method: req.method });
  });

  app.post(["/api/auth/send-otp", "/api/auth/send-otp/"], async (req, res) => {
    console.log("POST /api/auth/send-otp received");
    console.log("Headers:", JSON.stringify(req.headers));
    console.log("Body:", JSON.stringify(req.body));
    const { email } = req.body;
    console.log("Email requested:", email);
    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
      console.log("Cleaning up old OTPs for:", email);
      if (isDbReady()) {
        await OTP.deleteMany({ email });
        console.log("Saving new OTP for:", email);
        await new OTP({ email, otp }).save();
        console.log("OTP saved to database");
      } else {
        await deleteInMemoryOtps(email);
        inMemoryOtps.push({ email, otp, createdAt: new Date() });
        console.log("OTP saved to in-memory fallback store");
      }

      const mailOptions = {
        from: `"Sentilytics Magic" <${process.env.SMTP_USER || 'noreply@sentilytics.magic'}>`,
        to: email,
        subject: "Your Magic Access Code",
        text: `Your magic access code is: ${otp}. It will expire in 10 minutes.`,
        html: `<div style="font-family: serif; padding: 20px; background: #0a0a0a; color: white; border-radius: 12px;">
                <h2 style="color: #f59e0b;">Sentilytics Magic</h2>
                <p>Your magic access code is:</p>
                <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #f59e0b; margin: 20px 0;">${otp}</div>
                <p style="font-size: 12px; color: #666;">This code will expire in 10 minutes. If you didn't request this, ignore this scroll.</p>
              </div>`,
      };

      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          // Re-initialize transporter to ensure latest env vars are used
          const currentTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: false,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });
          
          await currentTransporter.sendMail(mailOptions);
          res.json({ message: "OTP sent to your email" });
        } catch (mailErr: any) {
          console.error("SMTP Error, falling back to dev mode:", mailErr.message);
          res.json({ 
            message: "Email failed, falling back to Dev Mode", 
            dev: true,
            otp: otp,
            smtpError: mailErr.message
          });
        }
      } else {
        console.log("--- DEV MODE: OTP for", email, "is", otp, "---");
        res.json({ 
          message: "OTP generated (Check server logs in dev mode)", 
          dev: true,
          otp: otp // Include OTP in response for easier dev access
        });
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      res.status(500).json({ 
        error: "Failed to send OTP", 
        details: err.message,
        hint: err.code === 'EAUTH' ? "Invalid email or app password. Please check your secrets." : "Check your SMTP configuration."
      });
    }
  });

  app.post(["/api/auth/verify-otp", "/api/auth/verify-otp/"], async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    try {
      const validOtp = isDbReady()
        ? await OTP.findOne({ email, otp })
        : await findInMemoryOtp(email, otp);
      if (!validOtp) return res.status(400).json({ error: "Invalid or expired OTP" });

      if (isDbReady()) {
        await OTP.deleteMany({ email });
      } else {
        await deleteInMemoryOtps(email);
      }

      let user = isDbReady()
        ? await User.findOne({ email })
        : await findInMemoryUserByEmail(email);

      if (!user) {
        user = isDbReady()
          ? await new User({ email }).save()
          : await createInMemoryUser(email);
      }

      const token = jwt.sign(
        { id: user._id, email: user.email },
        process.env.JWT_SECRET || "magic_secret_key",
        { expiresIn: "7d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "magic_secret_key") as any;
      if (isDbReady()) {
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ error: "User not found" });
        return res.json({ user });
      }

      res.json({ user: { id: decoded.id, email: decoded.email } });
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // API Routes
  app.get("/api/history", async (req, res) => {
    try {
      const history = isDbReady()
        ? await AnalysisHistory.find().sort({ created_at: -1 }).limit(20)
        : await listInMemoryAnalysisHistory();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const analysis = isDbReady()
        ? await AnalysisHistory.findById(req.params.id)
        : await findInMemoryAnalysisById(req.params.id);
      res.json(analysis);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  app.post("/api/analyze-ml", (req, res) => {
    const { comments, algorithm } = req.body;
    
    const analyzed = comments.map((c: any) => {
      let sentiment = 'neutral';
      
      if (algorithm === 'naive_bayes') {
        sentiment = classifier.classify(c.text.toLowerCase());
      } else if (algorithm === 'svm') {
        const positiveWords = ['love', 'great', 'amazing', 'best', 'good', 'happy', 'awesome'];
        const negativeWords = ['hate', 'bad', 'terrible', 'worst', 'awful', 'disappointed', 'annoying'];
        
        let score = 0;
        const words = c.text.toLowerCase().split(/\s+/);
        words.forEach((w: string) => {
          if (positiveWords.includes(w)) score += 1.5;
          if (negativeWords.includes(w)) score -= 1.5;
        });
        
        if (score > 0.5) sentiment = 'positive';
        else if (score < -0.5) sentiment = 'negative';
        else sentiment = 'neutral';
      }
      
      return { ...c, sentiment };
    });
    
    res.json({ analyzed });
  });

  app.post("/api/save-analysis", async (req, res) => {
    const { source, target, algorithm, results, comments, suggestions } = req.body;
    
    try {
      const payload = {
        source,
        target,
        algorithm: algorithm || 'logistic_regression',
        positive_count: results.positive,
        neutral_count: results.neutral,
        negative_count: results.negative,
        total_count: results.total,
        suggestions: suggestions || null,
        comments: comments.map((c: any) => ({
          text: c.text,
          sentiment: c.sentiment,
          author: c.author,
          likes: c.likes || 0
        })),
        created_at: new Date()
      };

      if (isDbReady()) {
        const newAnalysis = new AnalysisHistory(payload);
        const saved = await newAnalysis.save();
        return res.json({ id: saved._id });
      }

      const saved = await createInMemoryAnalysis(payload);
      res.json({ id: saved._id });
    } catch (err) {
      res.status(500).json({ error: "Failed to save analysis" });
    }
  });

  // YouTube Proxy
  app.get("/api/youtube/comments", async (req, res) => {
    const { videoId } = req.query;
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: "YouTube API key not configured" });
    }

    try {
      const comments: any[] = [];
      let nextPageToken: string | undefined = undefined;
      const maxComments = 200;
      const pageSize = 50;

      while (comments.length < maxComments) {
        const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('videoId', String(videoId));
        url.searchParams.set('maxResults', String(pageSize));
        url.searchParams.set('key', apiKey);
        if (nextPageToken) {
          url.searchParams.set('pageToken', nextPageToken);
        }

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.error) {
          return res.status(400).json({ error: data.error.message });
        }

        const pageComments = (data.items || []).map((item: any) => ({
          text: item.snippet.topLevelComment.snippet.textDisplay,
          author: item.snippet.topLevelComment.snippet.authorDisplayName,
          likes: item.snippet.topLevelComment.snippet.likeCount,
          publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
        }));

        comments.push(...pageComments);
        nextPageToken = data.nextPageToken;

        if (!nextPageToken || comments.length >= maxComments) {
          break;
        }
      }

      res.json(comments.slice(0, maxComments));
    } catch (error) {
      console.error('YouTube comments fetch error:', error);
      res.status(500).json({ error: "Failed to fetch YouTube comments" });
    }
  });

  // API 404 Handler - Ensure API calls don't fall through to Vite HTML
  app.use("/api/*", (req, res) => {
    console.log(`API 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: "API route not found", 
      method: req.method, 
      path: req.originalUrl 
    });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("GLOBAL ERROR:", err);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ 
        error: "Internal Server Error", 
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite dev server...");
    createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: process.env.HMR_PORT ? parseInt(process.env.HMR_PORT, 10) : 24680,
        }
      },
      appType: "spa",
    }).then(vite => {
      app.use(vite.middlewares);
      console.log("Vite dev server middleware integrated");
    }).catch(err => {
      console.error("Failed to start Vite dev server:", err);
    });
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

startServer();
