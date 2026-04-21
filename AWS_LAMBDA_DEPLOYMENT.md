# AWS Lambda + API Gateway Deployment Guide

## Overview
This guide deploys your sentiment analysis API on AWS Lambda with S3 for model storage.

**Architecture:**
- Frontend (Vercel) → API Gateway → Lambda Function → S3 (models)

---

## Step 1: Create S3 Bucket for Models

```bash
# 1. Go to AWS S3 Console: https://s3.console.aws.amazon.com/
# 2. Click "Create bucket"
# 3. Bucket name: `sentilytics-models` (or your choice)
# 4. Region: Choose closest to you
# 5. Block Public Access: Keep all ON (for security)
# 6. Create bucket

# Via AWS CLI (if installed):
aws s3 mb s3://sentilytics-models
```

### Upload Model Files:
```bash
# Upload locally using AWS CLI:
aws s3 cp model.pkl s3://sentilytics-models/model.pkl
aws s3 cp vectorizer.pkl s3://sentilytics-models/vectorizer.pkl

# Or use AWS Console: Upload directly to the bucket
```

---

## Step 2: Create Lambda Function

### 2.1 Go to AWS Lambda Console
- URL: https://console.aws.amazon.com/lambda/
- Click **Create function**

### 2.2 Function Details
- **Function name:** `sentilytics-sentiment-api`
- **Runtime:** `Python 3.11`
- **Architecture:** `x86_64`
- **Role:** Create new role with basic Lambda permissions
- **Click Create function**

### 2.3 Upload Code

**Option A: Via ZIP file (Recommended)**

```bash
# 1. Create deployment package locally:
mkdir lambda_package
cd lambda_package

# 2. Install dependencies:
pip install -r lambda_requirements.txt -t .

# 3. Copy Lambda handler:
cp lambda_handler.py .

# 4. Create ZIP:
zip -r lambda_function.zip .

# 5. Upload ZIP to Lambda:
# - In Lambda console, click "Upload from" → ".zip file"
# - Select lambda_function.zip
# - Click "Save"
```

**Option B: Via inline editor**

```
1. In Lambda console
2. Click "Code" tab
3. Under "Code source", click "Upload from" → "Upload a file"
4. Select lambda_handler.py
```

### 2.4 Configure Lambda Settings

1. **Timeout:** Change from 3 seconds to **60 seconds**
   - Click "Configuration" tab
   - General settings → Timeout
   - Set to 60

2. **Environment Variables:**
   - Add: `S3_BUCKET = sentilytics-models`

3. **IAM Role Permissions:**
   - Go to IAM Console: https://console.aws.amazon.com/iam/
   - Find role: `sentilytics-sentiment-api-role-xxxxx`
   - Add inline policy with:
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Action": [
                   "s3:GetObject"
               ],
               "Resource": "arn:aws:s3:::sentilytics-models/*"
           }
       ]
   }
   ```

### 2.5 Test Lambda Function

```
1. Click "Test" button
2. Event name: `test-sentiment`
3. Test event JSON:
```json
{
  "httpMethod": "POST",
  "body": "{\"text\": \"I love this product!\"}"
}
```
4. Click "Test"
5. Should see sentiment: "positive"

---

## Step 3: Create API Gateway

### 3.1 Create API

1. Go to API Gateway: https://console.aws.amazon.com/apigateway/
2. Click **Create API**
3. Choose **REST API** → **Build**
4. **API name:** `sentilytics-api`
5. **Click Create API**

### 3.2 Create Resources & Methods

**Create POST method:**
1. Click on **Root** `/`
2. Click **Create method** → **POST**
3. **Integration type:** Lambda Function
4. **Lambda function:** `sentilytics-sentiment-api`
5. Click **Create**

**Enable CORS:**
1. Select **Root** `/`
2. **Actions** → **Enable CORS**
3. Click **Enable CORS and replace existing CORS headers**

**Create GET method (optional):**
1. Select **Root** `/`
2. **Create method** → **GET**
3. Integration: Lambda function
4. Select `sentilytics-sentiment-api`

### 3.3 Deploy API

1. Click **Deploy API**
2. **Stage:** Create new stage
3. **Stage name:** `prod`
4. Click **Deploy**

5. **Copy Invoke URL** - You'll need this for frontend!
   ```
   Example: https://xxxxxxx.execute-api.us-east-1.amazonaws.com/prod
   ```

---

## Step 4: Update Frontend

### 4.1 Update API Endpoint

In your React app, find where you call the backend API and update:

**From:**
```javascript
const response = await fetch('http://localhost:5000/predict', {
  method: 'POST',
  body: JSON.stringify({ text: userText })
})
```

**To:**
```javascript
const API_URL = 'https://xxxxxxx.execute-api.us-east-1.amazonaws.com/prod';

const response = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ text: userText })
})
```

### 4.2 Commit & Deploy to Vercel

```bash
git add .
git commit -m "Update API endpoint to AWS Lambda"
git push origin main
```

Vercel will automatically redeploy!

---

## Step 5: Monitor & Test

### Test API Endpoint

```bash
curl -X POST https://xxxxxxx.execute-api.us-east-1.amazonaws.com/prod \
  -H "Content-Type: application/json" \
  -d '{"text": "This is amazing!"}'
```

### Monitor Lambda

1. CloudWatch Logs: Lambda → Monitoring → Logs
2. View execution metrics
3. Check for errors

---

## Cost Estimates (Free Tier)

| Service | Free Tier | Your Usage |
|---------|-----------|-----------|
| Lambda | 1M requests/month | ~2.7K/day = 81K/month ✓ |
| API Gateway | 1M calls/month | Same as Lambda ✓ |
| S3 | 5GB storage | ~500MB ✓ |
| Data transfer | 1GB/month OUT | Depends on traffic ⚠️ |

**⚠️ Note:** If traffic exceeds free tier, you'll be charged per request.

---

## Troubleshooting

### "Module not found: transformers"
- Lambda has size limits (~250MB compressed)
- Use smaller model or serverless CPU optimization
- **Solution:** Download models to /tmp at runtime or use layers

### "Permission denied accessing S3"
- Check IAM role has S3 permissions
- Verify bucket name matches `S3_BUCKET` env var
- Ensure models are uploaded

### "Timeout error"
- Increase Lambda timeout to 60+ seconds
- First request may be slow (cold start)
- Consider using AWS Lambda Layers to pre-bundle models

### "CORS error from frontend"
- Verify API Gateway CORS is enabled
- Test with `curl` first, then from browser
- Check browser console for exact error

---

## Next Steps

1. ✅ Upload models to S3
2. ✅ Deploy Lambda function
3. ✅ Create API Gateway
4. ✅ Update frontend
5. ✅ Deploy to Vercel
6. ✅ Test end-to-end

Your sentiment analysis API is now live! 🚀
