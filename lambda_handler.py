"""
AWS Lambda handler for FastAPI sentiment analysis app
This wraps the FastAPI app to work with AWS Lambda + API Gateway
"""
import json
import pickle
import os
from urllib.parse import parse_qs
from io import BytesIO

# Import the FastAPI app components
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    vader_analyzer = SentimentIntensityAnalyzer()
    use_vader = True
except:
    use_vader = False
    vader_analyzer = None

try:
    from transformers import pipeline
    transformer_model = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
    use_transformer = True
except:
    use_transformer = False
    transformer_model = None

# Model loading from S3 or local
model = None
vectorizer = None
model_loaded = False

def load_models_from_s3():
    """Load model.pkl and vectorizer.pkl from S3"""
    global model, vectorizer, model_loaded
    try:
        import boto3
        s3 = boto3.client('s3')
        bucket_name = os.environ.get('S3_BUCKET', 'sentilytics-models')
        
        # Download model.pkl
        try:
            model_obj = s3.get_object(Bucket=bucket_name, Key='model.pkl')
            model = pickle.loads(model_obj['Body'].read())
        except Exception as e:
            print(f"Could not load model from S3: {e}")
        
        # Download vectorizer.pkl
        try:
            vec_obj = s3.get_object(Bucket=bucket_name, Key='vectorizer.pkl')
            vectorizer = pickle.loads(vec_obj['Body'].read())
        except Exception as e:
            print(f"Could not load vectorizer from S3: {e}")
        
        if model and vectorizer:
            model_loaded = True
            print("✓ Models loaded from S3")
    except Exception as e:
        print(f"S3 loading failed: {e}")

def predict_sentiment(text):
    """Predict sentiment using available models"""
    text = text.strip()
    
    if not text:
        return {
            "input": text,
            "sentiment": "neutral",
            "confidence": 0.0,
            "model_used": "none"
        }
    
    # Try transformer first
    if use_transformer:
        try:
            truncated_text = text[:512] if len(text) > 512 else text
            result = transformer_model(truncated_text)
            sentiment = result[0]['label'].lower()
            confidence = float(result[0]['score'])
            
            final_sentiment = 'positive' if sentiment == 'positive' else ('negative' if sentiment == 'negative' else 'neutral')
            
            return {
                "input": text,
                "sentiment": final_sentiment,
                "confidence": confidence,
                "model_used": "transformer"
            }
        except Exception as e:
            print(f"Transformer error: {e}")
    
    # Fallback to Vader
    if use_vader:
        try:
            scores = vader_analyzer.polarity_scores(text)
            compound = float(scores["compound"])
            final_sentiment = "neutral"
            if compound >= 0.4:
                final_sentiment = "positive"
            elif compound <= -0.4:
                final_sentiment = "negative"
            
            return {
                "input": text,
                "sentiment": final_sentiment,
                "confidence": abs(compound),
                "model_used": "vader"
            }
        except Exception as e:
            print(f"Vader error: {e}")
    
    # Fallback to custom model
    if model_loaded and model and vectorizer:
        try:
            vec = vectorizer.transform([text])
            result = model.predict(vec)[0]
            proba = model.predict_proba(vec)[0]
            confidence = float(max(proba))
            
            return {
                "input": text,
                "sentiment": result,
                "confidence": confidence,
                "model_used": "custom"
            }
        except Exception as e:
            print(f"Custom model error: {e}")
    
    # Default fallback
    return {
        "input": text,
        "sentiment": "neutral",
        "confidence": 0.0,
        "model_used": "default"
    }

def lambda_handler(event, context):
    """
    AWS Lambda handler function
    Receives API Gateway events and returns sentiment predictions
    """
    try:
        # Load models on first invocation
        if not model_loaded and use_transformer is False and use_vader is False:
            load_models_from_s3()
        
        # Parse the request
        if event.get('httpMethod') == 'POST':
            # Parse body
            body = event.get('body', '{}')
            if isinstance(body, str):
                data = json.loads(body)
            else:
                data = body
            
            text = data.get('text', '').strip()
            
            if not text:
                return {
                    'statusCode': 400,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({'error': 'No text provided'})
                }
            
            # Predict sentiment
            result = predict_sentiment(text)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                'body': json.dumps(result)
            }
        
        elif event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            }
        
        elif event.get('httpMethod') == 'GET':
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'message': 'Sentiment Analysis API - POST /predict with {text: "your text here"}'})
            }
        
        else:
            return {
                'statusCode': 405,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Method not allowed'})
            }
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }
