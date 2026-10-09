import joblib
from fastapi import FastAPI
from pydantic import BaseModel , Field
import pandas as pd 
from typing import Literal
from fastapi.middleware.cors import CORSMiddleware

model = joblib.load('Mental_Health_Model.pkl')
top_countries =[
 'Other',
 'India',
 'USA',
 'Canada',
 'Australia',
 'UK',
 'Germany',
 'Mexico',
 'Turkey',
 'France'
] 

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

class StudentData(BaseModel):
    age: int = Field(..., ge=10, le=100)
    gender: Literal['Male', 'Female']
    country: str
    Academic_Level: Literal['Undergraduate', 'Graduate', 'High School']
    Most_Used_Platform: Literal[
        'Facebook', 'LinkedIn', 'Instagram', 'Snapchat', 'Twitter',
        'YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte',
        'WhatsApp', 'WeChat'
    ]
    Purpose_Of_Use: Literal[
        'Networking', 'Education', 'Entertainment', 'News'
    ]
    Avg_Daily_Usage_Hours: float = Field(..., ge=0, le=24)
    Daily_Unlocks: int = Field(..., ge=0, le=100)
    Study_Hours: float = Field(..., ge=0, le=24)
    Physical_Activity_Hours: float = Field(..., ge=0, le=2)
    Sleep_Hours_Per_Night: float = Field(..., ge=0, le=24)
    Stress_Level: Literal['Low', 'Medium', 'High', 'Very High']







# Describe what we send back to the user after making a prediction
class PredictionResponse(BaseModel):
    predicted_mental_health_score:float

# A first Pydantic Model to define the input data structure

@app.get('/')
def greet():
    return "Hello! Welcome to the Mental Health Prediction API."




@app.post('/predict',response_model=PredictionResponse)
def predict(data: StudentData):

    country_group = data.country if data.country in top_countries else 'Other'
    input_row = pd.DataFrame([{
        'Age': data.age,
        'Gender': data.gender,
        'Country': data.country,
        'Academic_Level': data.Academic_Level,
        'Most_Used_Platform': data.Most_Used_Platform,
        'Purpose_Of_Use': data.Purpose_Of_Use,
        'Avg_Daily_Usage_Hours': data.Avg_Daily_Usage_Hours,
        'Daily_Unlocks': data.Daily_Unlocks,
        'Study_Hours': data.Study_Hours,
        'Physical_Activity_Hours': data.Physical_Activity_Hours,
        'Sleep_Hours_Per_Night': data.Sleep_Hours_Per_Night,
        'Stress_Level': data.Stress_Level,
        'grouped_country': country_group
    }])

    prediction = model.predict(input_row)[0]
    return PredictionResponse(predicted_mental_health_score=prediction)