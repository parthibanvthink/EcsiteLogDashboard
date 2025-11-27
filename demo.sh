#!/bin/bash

echo "🎬 Log Dashboard Demo"
echo "===================="
echo ""

echo "📋 This demo will show you how the log dashboard works:"
echo ""
echo "1. 🚀 Starting the backend server..."
cd backend
source venv/bin/activate
python app.py &
BACKEND_PID=$!

echo "⏳ Waiting for backend to start..."
sleep 5

echo ""
echo "2. 🧪 Testing the API with sample data..."
python test_backend.py

echo ""
echo "3. 📊 Showing API endpoints:"
echo "   • Health Check: http://localhost:8000/health"
echo "   • API Docs: http://localhost:8000/docs"
echo "   • Upload logs: POST http://localhost:8000/read-log/"
echo "   • Get logs: GET http://localhost:8000/logs"

echo ""
echo "4. 🎨 To start the frontend:"
echo "   cd ../frontend"
echo "   npm install"
echo "   npm run dev"
echo "   Then visit: http://localhost:5173"

echo ""
echo "5. 📁 Sample log file available:"
echo "   backend/sample_encrypted_logs.log"

echo ""
echo "🛑 Press Ctrl+C to stop the backend server"
trap "echo 'Stopping backend...'; kill $BACKEND_PID; exit" INT
wait
