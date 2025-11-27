import { useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { AnalysisLoading } from "../AnalysisLoading"
import axios from "axios"
import { API_BASE } from "../config/api"

export function LoadingPage() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const fetchLogsAndNavigate = async () => {
      try {
        // Fetch logs from backend
        const response = await axios.get(`${API_BASE}/logs/paginated?page=1&per_page=250`)
        const logsData = response.data.logs || []
        
        // Get uploaded files from navigation state
        const uploadedFiles = location.state?.uploadedFiles || []
        
        // Simulate analysis delay
        setTimeout(() => {
          // Navigate to insights page with logs data and uploaded files
          navigate("/insights", { 
            state: { logsData, uploadedFiles } 
          })
        }, 3000)
      } catch (error) {
        console.error("Error fetching logs:", error)
        // Navigate back to upload page on error
        navigate("/")
      }
    }

    fetchLogsAndNavigate()
  }, [navigate, location.state])

  return <AnalysisLoading />
}
