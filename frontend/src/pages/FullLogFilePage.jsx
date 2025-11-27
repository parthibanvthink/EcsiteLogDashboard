import { useState, useEffect, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "../components/ui/button"
import { Breadcrumb } from "../components/ui/breadcrumb"
import { Card, CardContent } from "../components/ui/card"
import { ArrowLeft, FileText, Loader2, Download, Search } from "lucide-react"
import axios from "axios"
import { API_BASE } from "../config/api"

export function FullLogFilePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [logFiles, setLogFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [logContent, setLogContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Get filename from URL params if provided
  const filenameFromUrl = searchParams.get("filename")

  // Fetch list of log files
  useEffect(() => {
    const fetchLogFiles = async () => {
      try {
        setLoadingFiles(true)
        const response = await axios.get(`${API_BASE}/logs/files`)
        const files = response.data.files || []
        setLogFiles(files)

        // If filename is provided in URL, select it
        if (filenameFromUrl && files.includes(filenameFromUrl)) {
          setSelectedFile(filenameFromUrl)
          fetchLogContent(filenameFromUrl)
        } else if (files.length === 1) {
          // If only one file, auto-select it
          setSelectedFile(files[0])
          fetchLogContent(files[0])
        }
      } catch (err) {
        console.error("Error fetching log files:", err)
        setError(err.response?.data?.detail || err.message || "Failed to fetch log files")
      } finally {
        setLoadingFiles(false)
      }
    }

    fetchLogFiles()
  }, [filenameFromUrl])

  // Fetch log content for selected file
  const fetchLogContent = async (filename) => {
    if (!filename) return

    try {
      setLoading(true)
      setError(null)
      const response = await axios.get(`${API_BASE}/logs/raw/file`, {
        params: { filename }
      })
      setLogContent(response.data.content || "")
    } catch (err) {
      console.error("Error fetching log content:", err)
      setError(err.response?.data?.detail || err.message || "Failed to fetch log content")
      setLogContent("")
    } finally {
      setLoading(false)
    }
  }

  // Handle file selection
  const handleFileSelect = (filename) => {
    setSelectedFile(filename)
    fetchLogContent(filename)
    // Update URL without reload
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set("filename", filename)
    navigate(`/full-log?${newSearchParams.toString()}`, { replace: true })
  }

  // Handle download
  const handleDownload = () => {
    if (!logContent || !selectedFile) return

    const blob = new Blob([logContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = selectedFile
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Extract just the filename from full path
  const getDisplayName = (filepath) => {
    if (!filepath) return "Unknown"
    const parts = filepath.split("/")
    return parts[parts.length - 1] || filepath
  }

  const breadcrumbItems = [
    { label: "Upload", path: "/" },
    { label: "Analysis", path: "/insights" },
    { label: "Full Log File", path: "/full-log" }
  ]

  // Filter log lines based on search term
  const filteredLogLines = logContent
    ? logContent.split('\n').filter((line) => {
        if (!searchTerm) return true
        return line.toLowerCase().includes(searchTerm.toLowerCase())
      })
    : []

  // Function to highlight search term in text
  const highlightSearchTerm = (text, searchTerm) => {
    if (!searchTerm || !text) return text

    const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, index) => {
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return (
          <span key={index} className="bg-yellow-300 font-semibold">
            {part}
          </span>
        )
      }
      return part
    })
  }

// Extract: "06:24:12:855 | " or "05:40:40:61 | " (handles 1-3 digit milliseconds)
const extractTimePrefix = (line) => {
  const match = line.match(/^(\d{2}:\d{2}:\d{2}:\d{1,3} \| )/)
  return match ? match[1] : null
}

// Calculate maximum prefix length for consistent indentation
const getMaxPrefixLength = (lines) => {
  let maxLength = 0
  lines.forEach((line) => {
    const prefix = extractTimePrefix(line)
    if (prefix && prefix.length > maxLength) {
      maxLength = prefix.length
    }
  })
  return maxLength
}




  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-6 py-4 flex-shrink-0">
        {/* Breadcrumb Navigation */}
        <div className="mb-3">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Full Log File</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* File Selection (if multiple files) - Compact dropdown style */}
            {logFiles.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">File:</label>
                <select
                  value={selectedFile || ""}
                  onChange={(e) => handleFileSelect(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {!selectedFile && <option value="">Select a file...</option>}
                  {logFiles.map((file) => (
                    <option key={file} value={file} title={file}>
                      {getDisplayName(file)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => navigate("/insights")}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Analysis
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 py-2 mb-2">
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          </div>
        )}

        {/* Search Bar */}
        {!loadingFiles && selectedFile && (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs (e.g., LOG-DEVICE)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            {searchTerm && (
              <p className="mt-2 text-sm text-gray-600">
                Showing {filteredLogLines.length} of {logContent.split('\n').length} lines
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area - Takes maximum space */}
      <div className="flex-1 flex flex-col px-6 pb-6 min-h-0">
        {/* Loading State */}
        {loadingFiles && (
          <Card className="flex-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-3 text-gray-600">Loading log files...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log Content */}
        {!loadingFiles && selectedFile && (
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="p-0 flex flex-col flex-1 min-h-0">
              {/* Header with file name and download button */}
              <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-gray-900 truncate" title={selectedFile}>
                    {getDisplayName(selectedFile)}
                  </h2>
                  {selectedFile !== getDisplayName(selectedFile) && (
                    <p className="text-xs text-gray-500 truncate mt-0.5" title={selectedFile}>
                      {selectedFile}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {loading && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Loading...</span>
                    </div>
                  )}
                  {/* {!loading && logContent && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={handleDownload}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="text-xs">Download</span>
                    </Button>
                  )} */}
                </div>
              </div>

              {/* Log Content Display - Takes maximum space */}
              <div className="flex-1 p-4 min-h-0 overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <span className="ml-3 text-gray-600">Loading log content...</span>
                  </div>
                ) : logContent ? (
                  <div className="h-full overflow-auto bg-gray-50 rounded-lg border border-gray-200">
                    {filteredLogLines.length > 0 ? (
                      <div className="font-mono text-sm leading-relaxed p-5 text-gray-800">
                        {(() => {
                          // Calculate max prefix length for consistent indentation across all events
                          const maxPrefixLength = getMaxPrefixLength(filteredLogLines)
                          
                          return filteredLogLines.map((line, index) => {
                            const prefix = extractTimePrefix(line)
                            const prefixLength = prefix ? prefix.length : 0
                            
                            // Use max prefix length for consistent alignment
                            // Lines with prefix: reserve space and pull prefix back
                            // Lines without prefix: indent to align with message content
                            const paddingLeft = maxPrefixLength > 0 ? `${maxPrefixLength}ch` : "0"
                            const textIndent = prefix ? `-${prefixLength}ch` : "0"

                            return (
                              <div
                                key={index}
                                className={`py-0.5 px-1 hover:bg-gray-100 transition-colors break-words ${
                                  index % 2 === 0 ? 'bg-white/50' : ''
                                }`}
                                style={{
                                  whiteSpace: "pre-wrap",
                                  paddingLeft: paddingLeft,
                                  textIndent: textIndent
                                }}
                              >
                                {searchTerm 
                                  ? highlightSearchTerm(line || '\u00A0', searchTerm)
                                  : (line || '\u00A0')}
                              </div>
                            )
                          })
                        })()}


                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <p className="text-sm">No lines match "{searchTerm}"</p>
                          <p className="text-xs mt-1 text-gray-400">Try a different search term</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    No log content available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* No files message */}
        {!loadingFiles && logFiles.length === 0 && (
          <Card className="flex-1">
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center h-full">
                <FileText className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600">No log files available</p>
                <p className="text-sm text-gray-500 mt-2">
                  Please upload log files first
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

