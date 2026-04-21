# Frontend-Backend Integration Fix

## Issues Fixed

### 1. **Hardcoded API URL**
- **Problem**: Frontend was calling `http://127.0.0.1:8000/predict` directly, which only works on localhost and doesn't work in production.
- **Fix**: Updated App.tsx to call `/api/predict` (relative URL through Express server)

### 2. **Missing Proxy Endpoint**
- **Problem**: Express server (server.ts) had no endpoint to forward ML predictions to the FastAPI backend
- **Fix**: Added `/api/predict` endpoint in server.ts that proxies requests to `http://127.0.0.1:8000/predict`

### 3. **Better Error Handling**
- Added clearer error messages when FastAPI backend is unavailable
- Proxy endpoint handles connection errors gracefully

## How to Run (Development)

You need **TWO terminals** to run the full application:

### Terminal 1: Start the Python FastAPI Backend
```bash
# Make sure you're in the project directory
cd c:\Users\Abhishek Singh\Downloads\sentilytics (1)

# Install Python dependencies (one time)
pip install fastapi uvicorn scikit-learn

# Run the FastAPI server on port 8000
python -m uvicorn backend:app --host 127.0.0.1 --port 8000 --reload
```

### Terminal 2: Start the Node.js Frontend/Express Server
```bash
# Make sure you're in the project directory  
cd c:\Users\Abhishek Singh\Downloads\sentilytics (1)

# Install Node dependencies (one time)
npm install

# Run the development server on port 3000
npm run dev
```

## Testing the Integration

1. Open browser: `http://localhost:3000`
2. Select "Dataset" or "YouTube" source
3. Click "Analyze" 
4. The frontend will now correctly call the Express backend at `/api/predict`, which proxies to the FastAPI model at `http://127.0.0.1:8000/predict`

## Files Modified

- **src/App.tsx**: Changed hardcoded URL to relative URL
- **server.ts**: Added `/api/predict` proxy endpoint

## Troubleshooting

### "ML model service is unavailable" error
- Ensure FastAPI backend is running: `python -m uvicorn backend:app --host 127.0.0.1 --port 8000 --reload`
- Check that `model.pkl` and `vectorizer.pkl` exist in the project root

### Frontend doesn't connect to backend
- Make sure both servers are running in separate terminals
- Check that Express is on port 3000 and FastAPI is on port 8000
- Look at browser console (F12) for detailed error messages

### Model files missing
- Run: `python train.ipynb` to retrain and generate `model.pkl` and `vectorizer.pkl`
