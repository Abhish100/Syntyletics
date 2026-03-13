# Sentilytics

## Objective

Sentilytics is a data science-driven sentiment analysis web app built with React and Vite. Its purpose is to analyze user-provided text (e.g., social media posts, product reviews, or comments) and classify sentiment—positive, negative, or neutral—while providing a foundation for expanding into more advanced natural language understanding.

## Key Features

- **Interactive UI**: Fast, responsive frontend built using Vite + React.
- **Sentiment Scoring**: Demonstrates sentiment prediction logic and mapping to user-friendly labels.
- **Extensible Architecture**: Easily connects to backend services, APIs, or trained ML models.

## Effectiveness

Sentiment analysis accuracy depends on the underlying model and the data used to train it. This project is designed to be effective as a proof-of-concept by:

- Providing **real-time sentiment feedback** for short text inputs.
- Showing **clear mapping** from raw scores to sentiment labels.
- Being a **solid foundation** for improvement, including:
  - Training on a larger, labeled dataset.
  - Adding contextual awareness (negation, sarcasm, domain-specific language).
  - Integrating with a production-ready inference API.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the app in your browser (typically at `http://localhost:5173`).

## Pushing to GitHub

To publish this project to GitHub:

1. Create a new repository on GitHub.
2. In this project directory, run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <YOUR_GITHUB_REMOTE_URL>
   git push -u origin main
   ```

> Replace `<YOUR_GITHUB_REMOTE_URL>` with the URL of the repository you created (e.g., `https://github.com/yourusername/sentlytics.git`).
