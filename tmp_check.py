import pandas as pd
df=pd.read_csv('sentimentdataset.csv', nrows=5)
print(list(df.columns))
print(df.head())
