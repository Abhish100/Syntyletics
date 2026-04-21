@echo off
REM Quick Lambda deployment package builder for Windows
REM Run this to create a ZIP file ready for AWS Lambda upload

echo.
echo 🔨 Building Lambda deployment package...
echo.

REM Create package directory
if exist lambda_pkg (
    rmdir /s /q lambda_pkg
)
mkdir lambda_pkg
cd lambda_pkg

REM Install dependencies
echo 📦 Installing dependencies (this may take a moment)...
pip install -q -r ../lambda_requirements.txt -t .

REM Copy handler
echo 📋 Copying Lambda handler...
copy /Y ..\lambda_handler.py .

REM Create ZIP (requires 7-Zip or built-in)
echo 📦 Creating deployment ZIP...
python -m zipfile -c lambda_function.zip .

REM Move ZIP to parent
move lambda_function.zip ..\

cd ..

echo.
echo ✅ Deployment package ready: lambda_function.zip
echo.
echo 📤 Next steps:
echo 1. Go to AWS Lambda Console: https://console.aws.amazon.com/lambda/
echo 2. Create new function (Python 3.11)
echo 3. Upload lambda_function.zip
echo 4. Set timeout to 60 seconds
echo 5. Add S3_BUCKET environment variable
echo.
echo 📖 Full guide: AWS_LAMBDA_DEPLOYMENT.md
echo.
pause
