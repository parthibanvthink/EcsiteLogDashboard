# Network Access Configuration Guide

This guide explains how to access your Log Dashboard application from another computer on the same network.

## Quick Setup

### 1. Find Your Machine's IP Address

**On Linux/Mac:**
```bash
ip addr show
# or
ifconfig
# or
hostname -I
```

Look for your local network IP (usually starts with `192.168.x.x` or `10.x.x.x`)

**On Windows:**
```cmd
ipconfig
```

Look for "IPv4 Address" under your active network adapter.

### 2. Start the Application

The application is already configured to accept external connections:

- **Backend**: Already configured to listen on `0.0.0.0:8000` (all interfaces)
- **Frontend**: Now configured to listen on `0.0.0.0:5173` (all interfaces)

Simply run:
```bash
./start.sh
```

Or manually:
```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate
python app.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 3. Access from Another Computer

From another computer on the same network, open a web browser and navigate to:

```
http://YOUR_IP_ADDRESS:5173
```

Replace `YOUR_IP_ADDRESS` with the IP address you found in step 1.

**Example:**
```
http://192.168.1.100:5173
```

## How It Works

The application automatically detects the hostname/IP address being used to access the frontend and uses the same address for API calls. This means:

- If you access via `localhost:5173`, API calls go to `localhost:8000`
- If you access via `192.168.1.100:5173`, API calls go to `192.168.1.100:8000`

## Advanced Configuration

### Using Environment Variables

You can also set a custom API base URL using environment variables:

```bash
# Set environment variable before starting
export VITE_API_BASE=http://192.168.1.100:8000
npm run dev
```

Or create a `.env` file in the `frontend` directory:

```
VITE_API_BASE=http://192.168.1.100:8000
```

### Firewall Configuration

Make sure your firewall allows incoming connections on ports 8000 and 5173:

**On Linux (UFW):**
```bash
sudo ufw allow 8000/tcp
sudo ufw allow 5173/tcp
```

**On Mac:**
Go to System Preferences > Security & Privacy > Firewall > Firewall Options
Add ports 8000 and 5173

**On Windows:**
Go to Windows Defender Firewall > Advanced Settings > Inbound Rules
Create new rules for ports 8000 and 5173

## Troubleshooting

### Cannot Access from Another Computer

1. **Check Firewall**: Ensure ports 8000 and 5173 are open
2. **Check IP Address**: Verify you're using the correct IP address
3. **Check Network**: Ensure both computers are on the same network
4. **Check Backend**: Verify backend is running and accessible:
   ```bash
   curl http://YOUR_IP:8000/docs
   ```

### API Calls Failing

If API calls fail when accessing from another computer:

1. Check browser console for errors
2. Verify CORS is enabled (already configured in backend)
3. Ensure backend is listening on `0.0.0.0` (already configured)
4. Check that the API_BASE is correctly detected

### Port Already in Use

If you get "port already in use" errors:

```bash
# Find process using port 8000
lsof -i :8000
# or
netstat -tulpn | grep 8000

# Kill the process
kill -9 <PID>
```

## Security Notes

⚠️ **Important**: This configuration allows access from any device on your local network. For production deployments:

1. Use proper authentication
2. Configure HTTPS
3. Use a reverse proxy (nginx, Apache)
4. Restrict access to specific IPs if needed
5. Consider using environment-specific configurations

