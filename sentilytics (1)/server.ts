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
  : "";

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
  algorithm: { type: String, default: 'gemini' },
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

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Start listening IMMEDIATELY to satisfy the proxy health checks
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
    
    // Connect to MongoDB in the background
    console.log("Connecting to MongoDB...");
    mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
    }).then(() => {
      console.log("Connected to MongoDB successfully");
    }).catch(err => {
      console.error("CRITICAL: MongoDB connection failed:", err.message);
      if (err.message.includes('ENOTFOUND')) {
        console.error("HINT: The MongoDB hostname could not be resolved. Please check your MONGODB_URI cluster name and DNS settings.");
      }
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
    if (mongoose.connection.readyState !== 1) {
      console.error("Database not ready, state:", mongoose.connection.readyState);
      return res.status(503).json({ error: "Database connection is not ready. Please try again in a few seconds." });
    }
    const { email } = req.body;
    console.log("Email requested:", email);
    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
      console.log("Cleaning up old OTPs for:", email);
      await OTP.deleteMany({ email });
      console.log("Saving new OTP for:", email);
      await new OTP({ email, otp }).save();
      console.log("OTP saved to database");

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
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database connection is not ready." });
    }
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    try {
      const validOtp = await OTP.findOne({ email, otp });
      if (!validOtp) return res.status(400).json({ error: "Invalid or expired OTP" });

      await OTP.deleteMany({ email });

      let user = await User.findOne({ email });
      if (!user) {
        user = await new User({ email }).save();
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
      const user = await User.findById(decoded.id);
      if (!user) return res.status(401).json({ error: "User not found" });
      res.json({ user });
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // API Routes
  app.get("/api/history", async (req, res) => {
    try {
      const history = await AnalysisHistory.find().sort({ created_at: -1 }).limit(20);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const analysis = await AnalysisHistory.findById(req.params.id);
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
      const newAnalysis = new AnalysisHistory({
        source,
        target,
        algorithm: algorithm || 'gemini',
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
        }))
      });
      
      const saved = await newAnalysis.save();
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
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&key=${apiKey}`
      );
      const data = await response.json();
      
      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      const comments = data.items.map((item: any) => ({
        text: item.snippet.topLevelComment.snippet.textDisplay,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        likes: item.snippet.topLevelComment.snippet.likeCount,
        publishedAt: item.snippet.topLevelComment.snippet.publishedAt,
      }));

      res.json(comments);
    } catch (error) {
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
      server: { middlewareMode: true },
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
