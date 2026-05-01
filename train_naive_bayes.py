import csv
import os
import pickle
from collections import Counter

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "sentimentdataset.csv")
MODEL_PATH = os.path.join(BASE_DIR, "naive_bayes_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "naive_bayes_vectorizer.pkl")

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


def normalize_sentiment(label: str) -> str:
    label = label.strip().lower()
    if label in POSITIVE_LABELS:
        return "positive"
    if label in NEGATIVE_LABELS:
        return "negative"
    if label in NEUTRAL_LABELS:
        return "neutral"
    return "neutral"


def load_dataset():
    texts = []
    labels = []

    with open(DATASET_PATH, encoding="utf-8-sig", newline="") as dataset:
        reader = csv.DictReader(dataset)
        for row in reader:
            text = (row.get("Text") or "").strip()
            raw_label = (row.get("Sentiment") or "").strip()
            if not text or not raw_label:
                continue
            texts.append(text)
            labels.append(normalize_sentiment(raw_label))

    return texts, labels


def main():
    texts, labels = load_dataset()
    counts = Counter(labels)
    print(f"Loaded {len(texts)} labeled rows: {dict(counts)}")

    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        min_df=1,
        max_features=10000,
        strip_accents="unicode",
    )
    features = vectorizer.fit_transform(texts)

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=42,
        stratify=labels,
    )

    model = MultinomialNB(alpha=0.35)
    model.fit(x_train, y_train)

    predictions = model.predict(x_test)
    print(classification_report(y_test, predictions, zero_division=0))

    with open(MODEL_PATH, "wb") as model_file:
        pickle.dump(model, model_file)
    with open(VECTORIZER_PATH, "wb") as vectorizer_file:
        pickle.dump(vectorizer, vectorizer_file)

    print(f"Saved {MODEL_PATH}")
    print(f"Saved {VECTORIZER_PATH}")


if __name__ == "__main__":
    main()
