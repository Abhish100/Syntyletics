from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import os
import sys

app = FastAPI()

# Add CORS middleware first
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Try to load custom trained model, but also initialize transformer/Vader as fallback
model = None
vectorizer = None
model_loaded = False

transformer_model = None
use_transformer = False

vader_analyzer = None
use_vader = False

# Get the directory where this backend.py file is located
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BACKEND_DIR, "model.pkl")
VECTORIZER_PATH = os.path.join(BACKEND_DIR, "vectorizer.pkl")

# Try loading custom model
try:
    if os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH):
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        with open(VECTORIZER_PATH, "rb") as f:
            vectorizer = pickle.load(f)
        model_loaded = True
        print("✓ Custom model and vectorizer loaded successfully")
    else:
        print("⚠ Warning: model.pkl or vectorizer.pkl not found")
        print(f"  Looking for files in: {BACKEND_DIR}")
except Exception as e:
    print(f"✗ Error loading custom model: {e}")

# Load transformer as fallback for better accuracy
try:
    from transformers import pipeline
    print("📦 Loading pre-trained sentiment analyzer...")
    transformer_model = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
    use_transformer = True
    print("✓ Using pre-trained transformer for better accuracy")
except Exception as e:
    print(f"⚠ Could not load transformer: {e}")
    print("  Install with: pip install transformers torch")

# Load Vader sentiment analyzer as a lightweight fallback
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    vader_analyzer = SentimentIntensityAnalyzer()
    use_vader = True
    print("✓ Using Vader sentiment analyzer as a local fallback")
except Exception as e:
    print(f"⚠ Could not load Vader sentiment analyzer: {e}")
    print("  Install with: pip install vaderSentiment")

class InputText(BaseModel):
    text: str

def normalize_sentiment(sentiment_label: str) -> str:
    """Normalize sentiment labels to positive/negative/neutral"""
    label = sentiment_label.lower().strip()
    if "positive" in label or "good" in label or "great" in label:
        return "positive"
    elif "negative" in label or "bad" in label:
        return "negative"
    else:
        return "neutral"

@app.post("/predict")
def predict(data: InputText):
    text = data.text.strip()
    
    if not text:
        return {
            "input": text,
            "sentiment": "neutral",
            "confidence": 0.0,
            "model_used": "none"
        }
    
    # Try transformer first (better accuracy on diverse text)
    if use_transformer:
        try:
            # Handle text length (transformers have limits)
            truncated_text = text[:512] if len(text) > 512 else text
            result = transformer_model(truncated_text)
            sentiment = result[0]['label'].lower()
            confidence = float(result[0]['score'])
            
            # Map POSITIVE/NEGATIVE to our labels
            if sentiment == 'positive':
                final_sentiment = 'positive'
            elif sentiment == 'negative':
                final_sentiment = 'negative'
            else:
                final_sentiment = 'neutral'
            
            print(f"📊 Transformer prediction: {final_sentiment} ({confidence:.2%})")
            return {
                "input": text,
                "sentiment": final_sentiment,
                "confidence": confidence,
                "model_used": "transformer"
            }
        except Exception as e:
            print(f"⚠ Transformer error (falling back to custom model): {e}")
    
    # Fallback to local Vader sentiment if transformer is unavailable
    if use_vader:
        try:
            scores = vader_analyzer.polarity_scores(text)
            compound = float(scores["compound"])
            final_sentiment = "neutral"
            if compound >= 0.4:
                final_sentiment = "positive"
            elif compound <= -0.4:
                final_sentiment = "negative"
            
            print(f"📊 Vader prediction: {final_sentiment} ({compound:.2f})")
            return {
                "input": text,
                "sentiment": final_sentiment,
                "confidence": abs(compound),
                "model_used": "vader"
            }
        except Exception as e:
            print(f"⚠ Vader error: {e}")

    # Fallback to custom model
    if model_loaded and vectorizer:
        try:
            vec = vectorizer.transform([text])
            result = model.predict(vec)[0]
            proba = model.predict_proba(vec)[0]
            confidence = float(max(proba))
            
            print(f"📊 Custom model prediction: {result} ({confidence:.2%})")
            return {
                "input": text,
                "sentiment": normalize_sentiment(result),
                "confidence": confidence,
                "model_used": "custom"
            }
        except Exception as e:
            print(f"✗ Custom model error: {e}")
    
    # Last resort: simple keyword-based classification
    print("⚠ Using fallback keyword analysis")
    positive_words = ['good', 'great', 'awesome', 'love', 'amazing', 'excellent', 'best', 'wonderful', 'fantastic']
    negative_words = ['bad', 'hate', 'terrible', 'awful', 'worst', 'horrible', 'disgusting', 'poor', 'annoying']
    
    text_lower = text.lower()
    pos_count = sum(1 for word in positive_words if word in text_lower)
    neg_count = sum(1 for word in negative_words if word in text_lower)
    
    if pos_count > neg_count:
        sentiment = 'positive'
    elif neg_count > pos_count:
        sentiment = 'negative'
    else:
        sentiment = 'neutral'
    
    return {
        "input": text,
        "sentiment": sentiment,
        "confidence": 0.5,
        "model_used": "keyword_fallback"
    }

class BatchInput(BaseModel):
    texts: list[str]

@app.post("/predict_batch")
def predict_batch(data: BatchInput):
    """Batch prediction for multiple texts - much faster than individual calls"""
    results = []
    
    for text in data.texts:
        text = text.strip()
        
        if not text:
            results.append({
                "text": text,
                "sentiment": "neutral",
                "confidence": 0.0,
                "model_used": "none"
            })
            continue
        
        # Try transformer first (better accuracy on diverse text)
        if use_transformer:
            try:
                # Handle text length (transformers have limits)
                truncated_text = text[:512] if len(text) > 512 else text
                result = transformer_model(truncated_text)
                sentiment = result[0]['label'].lower()
                confidence = float(result[0]['score'])
                
                # Map POSITIVE/NEGATIVE to our labels
                if sentiment == 'positive':
                    final_sentiment = 'positive'
                elif sentiment == 'negative':
                    final_sentiment = 'negative'
                else:
                    final_sentiment = 'neutral'
                
                results.append({
                    "text": text,
                    "sentiment": final_sentiment,
                    "confidence": confidence,
                    "model_used": "transformer"
                })
                continue
            except Exception as e:
                print(f"⚠ Transformer error for batch item: {e}")
        
        # Fallback to local Vader sentiment if transformer is unavailable
        if use_vader:
            try:
                scores = vader_analyzer.polarity_scores(text)
                compound = float(scores["compound"])
                final_sentiment = "neutral"
                if compound >= 0.4:
                    final_sentiment = "positive"
                elif compound <= -0.4:
                    final_sentiment = "negative"
                
                results.append({
                    "text": text,
                    "sentiment": final_sentiment,
                    "confidence": abs(compound),
                    "model_used": "vader"
                })
                continue
            except Exception as e:
                print(f"⚠ Vader error for batch item: {e}")

        # Fallback to custom model
        if model_loaded and vectorizer:
            try:
                vec = vectorizer.transform([text])
                result = model.predict(vec)[0]
                proba = model.predict_proba(vec)[0]
                confidence = float(max(proba))
                
                results.append({
                    "text": text,
                    "sentiment": normalize_sentiment(result),
                    "confidence": confidence,
                    "model_used": "custom"
                })
                continue
            except Exception as e:
                print(f"✗ Custom model error for batch item: {e}")
        
        # Last resort: simple keyword-based classification
        positive_words = ['good', 'great', 'awesome', 'love', 'amazing', 'excellent', 'best', 'wonderful', 'fantastic']
        negative_words = ['bad', 'hate', 'terrible', 'awful', 'worst', 'horrible', 'disgusting', 'poor', 'annoying']
        
        text_lower = text.lower()
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)
        
        if pos_count > neg_count:
            sentiment = 'positive'
        elif neg_count > pos_count:
            sentiment = 'negative'
        else:
            sentiment = 'neutral'
        
        results.append({
            "text": text,
            "sentiment": sentiment,
            "confidence": 0.5,
            "model_used": "keyword_fallback"
        })
    
    return {"results": results}

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "transformer_loaded": use_transformer,
        "vader_loaded": use_vader
    }