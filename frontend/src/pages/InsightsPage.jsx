import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { LogInsights } from "../LogInsights"
import axios from "axios"
import { API_BASE } from "../config/api"

export function InsightsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [logsData, setLogsData] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])

  useEffect(() => {
    const initializeLogsData = async () => {
      // Check if logs data was passed via navigation state
      if (location.state?.logsData) {
        setLogsData(location.state.logsData)
      } else {
        // If no data in state, fetch from backend with pagination
        try {
          const response = await axios.get(`${API_BASE}/logs/paginated?page=1&per_page=250`)
          setLogsData(response.data.logs || [])
        } catch (error) {
          console.error("Error fetching logs:", error)
          // Navigate back to upload page on error
          navigate("/")
        }
      }

      // Check if uploaded files were passed via navigation state
      if (location.state?.uploadedFiles) {
        setUploadedFiles(location.state.uploadedFiles)
      } else {
        // If no uploaded files in state, try to get from session storage
        const savedLogFiles = sessionStorage.getItem('uploadedLogFiles')
        if (savedLogFiles) {
          setUploadedFiles(JSON.parse(savedLogFiles))
        }
      }
    }

    initializeLogsData()
  }, [location.state, navigate])

  // Additional effect to refresh uploaded files when component mounts
  useEffect(() => {
    const savedLogFiles = sessionStorage.getItem('uploadedLogFiles')
    if (savedLogFiles) {
      setUploadedFiles(JSON.parse(savedLogFiles))
    }
  }, [])

  const handleGoBack = () => {
    navigate("/")
  }

  return <LogInsights onGoBack={handleGoBack} logsData={logsData} uploadedFiles={uploadedFiles} />
}
