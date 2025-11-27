// API Configuration
// This file centralizes the API base URL configuration

// Get API base URL from environment variable or use default
// For local development: use your machine's IP address (e.g., http://192.168.1.100:8000)
// To find your IP: On Linux/Mac run: ip addr show or ifconfig
//                   On Windows run: ipconfig
// Or set VITE_API_BASE environment variable before running npm run dev

const getApiBase = () => {
  // Check if running in browser (client-side)
  if (typeof window !== 'undefined') {
    // Use the same hostname as the frontend, just different port
    const hostname = window.location.hostname
    // If accessing via localhost, use localhost for API
    // If accessing via IP, use the same IP for API
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
    } else {
      // Use the same hostname but port 8000 for API
      return `http://${hostname}:8000`
    }
  }
  // Fallback for server-side rendering
  return import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
}

export const API_BASE = getApiBase()

// Export default for convenience
export default API_BASE

