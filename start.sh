#!/bin/bash

# Log Dashboard Startup Script

echo "🚀 Starting Log Dashboard..."

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "❌ Port $port is already in use"
        return 1
    else
        echo "✅ Port $port is available"
        return 0
    fi
}

# Check if ports are available
echo "🔍 Checking port availability..."
check_port 8000 || exit 1
check_port 5173 || exit 1

# Start backend
echo "🔧 Starting backend server..."
cd backend
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

echo "📦 Activating virtual environment..."
source venv/bin/activate

echo "📦 Installing dependencies..."
pip install -r requirements.txt

echo "🚀 Starting FastAPI server on http://localhost:8000"
python app.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "🎨 Starting frontend server..."
cd ../frontend

echo "📦 Installing dependencies..."
npm install

echo "🚀 Starting React development server on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

# Get local IP address for network access
get_local_ip() {
    # Try different methods to get local IP
    local ip=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K\S+' 2>/dev/null)
    if [ -z "$ip" ]; then
        ip=$(hostname -I | awk '{print $1}' 2>/dev/null)
    fi
    if [ -z "$ip" ]; then
        ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
    fi
    echo "$ip"
}

LOCAL_IP=$(get_local_ip)

echo ""
echo "🎉 Log Dashboard is starting up!"
echo ""
echo "📍 Local Access:"
echo "   📊 Backend API: http://localhost:8000"
echo "   🎨 Frontend UI: http://localhost:5173"
echo "   📚 API Docs: http://localhost:8000/docs"
echo ""
if [ ! -z "$LOCAL_IP" ]; then
    echo "🌐 Network Access (from other devices):"
    echo "   📊 Backend API: http://${LOCAL_IP}:8000"
    echo "   🎨 Frontend UI: http://${LOCAL_IP}:5173"
    echo "   📚 API Docs: http://${LOCAL_IP}:8000/docs"
    echo ""
fi
echo "Press Ctrl+C to stop both servers"

# Wait for user interrupt
trap "echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
