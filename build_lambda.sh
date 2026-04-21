#!/bin/bash
# Quick Lambda deployment package builder
# Run this to create a ZIP file ready for AWS Lambda upload

set -e

echo "🔨 Building Lambda deployment package..."

# Create package directory
if [ -d "lambda_pkg" ]; then
    rm -rf lambda_pkg
fi
mkdir -p lambda_pkg
cd lambda_pkg

# Install dependencies
echo "📦 Installing dependencies (this may take a moment)..."
pip install -q -r ../lambda_requirements.txt -t .

# Copy handler
echo "📋 Copying Lambda handler..."
cp ../lambda_handler.py .

# Create ZIP
echo "📦 Creating deployment ZIP..."
zip -r -q lambda_function.zip .

# Move ZIP to parent directory
mv lambda_function.zip ../

cd ..

echo "✅ Deployment package ready: lambda_function.zip"
echo ""
echo "📤 Next steps:"
echo "1. Go to AWS Lambda Console: https://console.aws.amazon.com/lambda/"
echo "2. Create new function (Python 3.11)"
echo "3. Upload lambda_function.zip"
echo "4. Set timeout to 60 seconds"
echo "5. Add S3_BUCKET environment variable"
echo ""
echo "📖 Full guide: AWS_LAMBDA_DEPLOYMENT.md"
