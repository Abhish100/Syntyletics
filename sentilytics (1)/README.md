# 🚀 Sentilytics – Social Media Sentiment Analysis System

Sentilytics is a machine learning–based web application that analyzes social media text and classifies it into **positive, negative, and neutral sentiments**. The system supports real-time data (YouTube API) and user-provided datasets (Kaggle or exported social media data).

---

## 🌟 Features

- 🔍 Sentiment analysis using NLP techniques
- 📊 Visualization of sentiment trends
- 🌐 Multi-platform support (YouTube, Twitter, Reddit datasets)
- 📁 Upload your own dataset (CSV / JSON / TXT)
- ☁️ Cloud database integration with MongoDB
- 🤖 Multiple ML models (Naïve Bayes, SVM, Logistic Regression)

---
---

## 🧠 Tech Stack

### 👨‍💻 Backend
- Python
- Flask / FastAPI (optional)
- Scikit-learn
- NLTK / SpaCy

### 📊 Data Processing
- Pandas
- NumPy
- TF-IDF Vectorization

### 📈 Visualization
- Matplotlib
- Seaborn

### ☁️ Database
- MongoDB Atlas

### 🌐 APIs & Data Sources
- YouTube Data API
- Kaggle Datasets

---

## ⚙️ Project Workflow


Data Source (API / Dataset)
↓
Text Preprocessing
↓
Feature Extraction (TF-IDF)
↓
Machine Learning Model
↓
Sentiment Prediction
↓
Store Results (MongoDB)
↓
Visualization Dashboard


---

## 📁 Project Structure


Sentilytics/
│
├── data/
├── models/
├── notebooks/
├── app/
│ ├── main.py
│ ├── routes.py
│ └── utils.py
│
├── static/
├── templates/
├── requirements.txt
└── README.md


---

## 🔑 Environment Variables

Create a `.env` file and add:


MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com

SMTP_PASS=your_app_password


---

## ▶️ How to Run the Project

1. Clone the repository

```bash
git clone https://github.com/your-username/sentilytics.git
cd sentilytics

Install dependencies

pip install -r requirements.txt

Run the application

python app.py
📊 Example Output
Input: "This product is amazing!"
Output: Positive 😊
🚧 Future Improvements

🔴 Real-time streaming sentiment analysis

📱 Mobile-friendly UI

🧠 Deep learning models (LSTM, BERT)

📡 More API integrations (Twitter, Instagram)

👨‍🎓 Author

Abhishek Singh
Data Science Student
