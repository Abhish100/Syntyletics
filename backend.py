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
nb_model = None
nb_vectorizer = None
nb_model_loaded = False

transformer_model = None
use_transformer = False

vader_analyzer = None
use_vader = False

# Get the directory where this backend.py file is located
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BACKEND_DIR, "model.pkl")
VECTORIZER_PATH = os.path.join(BACKEND_DIR, "vectorizer.pkl")
NB_MODEL_PATH = os.path.join(BACKEND_DIR, "naive_bayes_model.pkl")
NB_VECTORIZER_PATH = os.path.join(BACKEND_DIR, "naive_bayes_vectorizer.pkl")

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

# Try loading Naive Bayes model
try:
    if os.path.exists(NB_MODEL_PATH) and os.path.exists(NB_VECTORIZER_PATH):
        with open(NB_MODEL_PATH, "rb") as f:
            nb_model = pickle.load(f)
        with open(NB_VECTORIZER_PATH, "rb") as f:
            nb_vectorizer = pickle.load(f)
        nb_model_loaded = True
        print("Naive Bayes model and vectorizer loaded successfully")
    else:
        print("Warning: naive_bayes_model.pkl or naive_bayes_vectorizer.pkl not found")
except Exception as e:
    print(f"Error loading Naive Bayes model: {e}")

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
    algorithm: str | None = None

POSITIVE_LABELS = {
    "positive", "joy", "excitement", "contentment", "gratitude", "serenity", "happy",
    "nostalgia", "awe", "hopeful", "acceptance", "pride", "elation", "euphoria",
    "enthusiasm", "determination", "playful", "inspiration", "happiness", "hope",
    "empowerment", "inspired", "admiration", "calmness", "compassion", "tenderness",
    "arousal", "fulfillment", "reverence", "proud", "grateful", "compassionate",
    "thrill", "reflection", "enchantment", "love", "amusement", "anticipation",
    "kind", "empathetic", "free-spirited", "confident", "satisfaction",
    "accomplishment", "harmony", "creativity", "wonder", "adventure", "enjoyment",
    "affection", "adoration", "zest", "overjoyed", "motivation", "blessed",
    "appreciation", "confidence", "wonderment", "optimism", "playfuljoy",
    "mindfulness", "freedom", "dazzle", "adrenaline", "spark", "marvel",
    "positivity", "kindness", "friendship", "success", "amazement", "romance",
    "grandeur", "energy", "celebration", "charm", "ecstasy", "connection",
    "iconic", "engagement", "touched", "triumph", "heartwarming", "breakthrough",
    "relief", "vibrancy"
}

NEGATIVE_LABELS = {
    "negative", "despair", "grief", "loneliness", "sad", "confusion", "embarrassed",
    "frustration", "regret", "hate", "bad", "disgust", "bitterness", "frustrated",
    "betrayal", "boredom", "overwhelmed", "desolation", "bitter", "shame",
    "jealousy", "resentment", "fearful", "jealous", "devastated", "envious",
    "dismissive", "heartbreak", "anger", "fear", "sadness", "disappointed",
    "anxiety", "intimidation", "helplessness", "envy", "apprehensive", "isolation",
    "disappointment", "sorrow", "loss", "suffering", "exhaustion", "darkness",
    "desperation", "ruins", "heartache", "pressure", "miscalculation", "challenge"
}

NEUTRAL_LABELS = {
    "neutral", "curiosity", "indifference", "numbness", "ambivalence", "surprise",
    "bittersweet", "contemplation", "pensive", "intrigue", "suspense", "solace"
}

def normalize_sentiment(sentiment_label: str) -> str:
    """Normalize fine-grained emotion labels to positive/negative/neutral."""
    label = sentiment_label.lower().strip()
    if label in POSITIVE_LABELS:
        return "positive"
    if label in NEGATIVE_LABELS:
        return "negative"
    if label in NEUTRAL_LABELS:
        return "neutral"
    return "neutral"

def predict_with_model(text: str, selected_model, selected_vectorizer, model_name: str):
    vec = selected_vectorizer.transform([text])
    result = selected_model.predict(vec)[0]
    proba = selected_model.predict_proba(vec)[0]
    confidence = float(max(proba))
    final_sentiment = normalize_sentiment(result)
    print(f"{model_name} prediction: {final_sentiment} ({confidence:.2%})")
    return {
        "input": text,
        "sentiment": final_sentiment,
        "confidence": confidence,
        "model_used": model_name
    }

@app.post("/predict")
def predict(data: InputText):
    text = data.text.strip()
    algorithm = (data.algorithm or "logistic_regression").lower()
    
    if not text:
        return {
            "input": text,
            "sentiment": "neutral",
            "confidence": 0.0,
            "model_used": "none"
        }

    algo = algorithm if algorithm in ["logistic_regression", "naive_bayes", "svm"] else "logistic_regression"
    
    # If user requests logistic regression, use the custom model first
    if algo == "logistic_regression" and model_loaded and vectorizer:
        try:
            vec = vectorizer.transform([text])
            result = model.predict(vec)[0]
            proba = model.predict_proba(vec)[0]
            confidence = float(max(proba))
            final_sentiment = normalize_sentiment(result)
            print(f"📊 Custom logistic regression prediction: {final_sentiment} ({confidence:.2%})")
            return {
                "input": text,
                "sentiment": final_sentiment,
                "confidence": confidence,
                "model_used": "custom"
            }
        except Exception as e:
            print(f"✗ Custom logistic regression error: {e}")

    if algo == "naive_bayes" and nb_model_loaded and nb_vectorizer:
        try:
            return predict_with_model(text, nb_model, nb_vectorizer, "naive_bayes")
        except Exception as e:
            print(f"Naive Bayes error: {e}")

    # Try transformer first for non-custom algorithms or when custom model fails
    if use_transformer:
        try:
            # Handle text length (transformers have limits)
            truncated_text = text[:512] if len(text) > 512 else text
            result = transformer_model(truncated_text)
            sentiment = result[0]['label'].lower()
            confidence = float(result[0]['score'])
            
            # Lower confidence threshold to catch more sentiment
            if sentiment == 'positive' and confidence >= 0.5:
                final_sentiment = 'positive'
            elif sentiment == 'negative' and confidence >= 0.5:
                final_sentiment = 'negative'
            else:
                # Use Vader for borderline cases
                if use_vader:
                    try:
                        scores = vader_analyzer.polarity_scores(truncated_text)
                        compound = float(scores["compound"])
                        if compound >= 0.1:
                            final_sentiment = 'positive'
                        elif compound <= -0.1:
                            final_sentiment = 'negative'
                        else:
                            final_sentiment = 'neutral'
                    except:
                        final_sentiment = 'neutral'
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
            # More aggressive sentiment thresholds to reduce neutral classification
            if compound >= 0.1:
                final_sentiment = "positive"
            elif compound <= -0.1:
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
    algorithm: str | None = None

@app.post("/predict_batch")
def predict_batch(data: BatchInput):
    """Batch prediction for multiple texts - much faster than individual calls"""
    results = []
    algorithm = (data.algorithm or "logistic_regression").lower()
    algo = algorithm if algorithm in ["logistic_regression", "naive_bayes", "svm"] else "logistic_regression"
    
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

        if algo == "logistic_regression" and model_loaded and vectorizer:
            try:
                prediction = predict_with_model(text, model, vectorizer, "logistic_regression")
                results.append({**prediction, "text": text})
                continue
            except Exception as e:
                print(f"Custom logistic regression error for batch item: {e}")

        if algo == "naive_bayes" and nb_model_loaded and nb_vectorizer:
            try:
                prediction = predict_with_model(text, nb_model, nb_vectorizer, "naive_bayes")
                results.append({**prediction, "text": text})
                continue
            except Exception as e:
                print(f"Naive Bayes error for batch item: {e}")
        
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
                if compound >= 0.1:
                    final_sentiment = "positive"
                elif compound <= -0.1:
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
