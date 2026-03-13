@echo off
setlocal

:: --- CONFIGURATION ---
:: Title for the main process
title StudyGPT Starter

:: --- BACKEND ---
echo [1/2] Starting Backend in a separate window...
:: 'start' opens a new command window
:: 'cmd /k' keeps the window open after the command finishes (useful for debugging)
:: 'call' is needed to run another script (like activate) and return to the main one
start "StudyGPT-Backend" cmd /k "call venv\Scripts\activate && uvicorn app.main:app --reload"

:: --- FRONTEND ---
echo [2/2] Starting Frontend...
cd frontend

:: Check if node_modules exists, install if missing
if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
)

:: Run the development server
:: This will run in the current window
call npm run dev

:: In case the frontend server stops unexpectedly
pause