import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "./ui/card"
import { Breadcrumb } from "./ui/breadcrumb"
import { CheckCircle, AlertCircle, Trash2, Filter } from "lucide-react"
import axios from "axios"
import StatCompleted from "../assets/StatCompleted"
import StatIncomplete from "../assets/StatIncomplete"
import StatDeleted from "../assets/StatDeleted"
import { API_BASE } from "../config/api"

// Function to extract filename from full S3 path
const extractFilename = (fullPath) => {
  if (!fullPath) return "Unknown"
  const parts = fullPath.split("/")
  return parts[parts.length - 1] || fullPath
}

// Function to parse the nested API response
const parseTestResults = (apiResponse) => {
  try {
    // Navigate through the nested structure
    const stepResults = apiResponse?.data?.data?.runWorkflow?.stepResults
    if (!stepResults || stepResults.length === 0) {
      return { testInfo: {}, totals: { completed: 0, incomplete: 0, deleted: 0 } }
    }

    // Parse the result JSON string
    const resultStr = stepResults[0]?.result
    if (!resultStr) {
      return { testInfo: {}, totals: { completed: 0, incomplete: 0, deleted: 0 } }
    }

    const resultData = JSON.parse(resultStr)
    const testInfo = resultData?.data?.response?.testInfo || {}

    // Calculate totals
    let completed = 0
    let incomplete = 0
    let aborted = 0
    let deleted = 0

    Object.values(testInfo).forEach((fileData) => {
      completed += fileData.completed || 0
      incomplete += fileData.incomplete || 0
      aborted += fileData.aborted || 0
      deleted += fileData.deleted || 0
    })

    return {
      testInfo,
      totals: { completed, incomplete, aborted, deleted }
    }
  } catch (error) {
    console.error("Error parsing test results:", error)
    return { testInfo: {}, totals: { completed: 0, incomplete: 0, aborted: 0, deleted: 0 } }
  }
}

export function TestStats() {
  const [testData, setTestData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    // Prevent duplicate API calls
    if (hasFetchedRef.current) {
      return
    }

    const fetchTestResults = async () => {
      // Mark as fetched immediately to prevent duplicate calls
      hasFetchedRef.current = true

      try {
        setLoading(true)
        setError(null)

        // Get site body from sessionStorage (optional - only for S3 uploads)
        const savedSiteBodyStr = sessionStorage.getItem('selectedSiteBody')
        const savedSiteBody = savedSiteBodyStr ? JSON.parse(savedSiteBodyStr) : null

        // Get all uploaded files from sessionStorage (includes both local and S3 files)
        // This is the source of truth for which files are currently available
        const uploadedLogFilesStr = sessionStorage.getItem('uploadedLogFiles')
        const uploadedLogFiles = uploadedLogFilesStr ? JSON.parse(uploadedLogFilesStr) : []

        // Build list of all file identifiers from uploadedLogFiles
        // Use uploadedLogFiles as the source of truth to ensure removed files are not included
        const allFileIdentifiers = []
        
        uploadedLogFiles.forEach(file => {
          if (file.status === "completed") {
            // For S3 files, use fullPath (if available)
            // For local files, use the filename
            const fileIdentifier = file.fullPath || file.name
            if (fileIdentifier && !allFileIdentifiers.includes(fileIdentifier)) {
              allFileIdentifiers.push(fileIdentifier)
            }
          }
        })

        // Build request body - site information is optional for local file uploads
        const body = {}
        if (savedSiteBody) {
          body.siteId = savedSiteBody.siteId
          body.companyId = savedSiteBody.companyId
          body.companyCode = savedSiteBody.companyCode
          body.siteCode = savedSiteBody.siteCode
          body.bucket_name = savedSiteBody.bucket_name
        }
        // Send all file identifiers (both S3 and local files)
        if (allFileIdentifiers.length > 0) {
          body.processed_files = allFileIdentifiers
        }

        const response = await axios.post(`${API_BASE}/test-results`, body, {
          headers: {
            "Content-Type": "application/json"
          }
        })

        if (response.data) {
          const parsed = parseTestResults(response.data)
          setTestData(parsed)
        } else {
          setError("No data received from API")
        }
      } catch (err) {
        console.error("Failed to fetch test results:", err)
        setError(err.response?.data?.detail || err.message || "Failed to fetch test results")
        // Reset the ref on error so it can be retried if needed
        hasFetchedRef.current = false
      } finally {
        setLoading(false)
      }
    }

    fetchTestResults()
  }, [])

  // Generate breadcrumb items
  const breadcrumbItems = [
    { label: "Upload", path: "/" },
    { label: "Analysis", path: "/insights" },
    { label: "Tests", path: "/tests" }
  ]

  // Prepare table data
  const tableData = testData
    ? Object.entries(testData.testInfo).map(([filename, data]) => ({
        filename: extractFilename(filename),
        fullPath: filename,
        completed: data.completed || 0,
        incomplete: data.incomplete || 0,
        aborted: data.aborted || 0,
        deleted: data.deleted || 0
      }))
    : []

  if (loading) {
    return (
      <div className="min-h-screen bg-white px-6 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading test statistics...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white px-6 py-8">
        <div className="mb-4">
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const totals = testData?.totals || { completed: 0, incomplete: 0, aborted: 0, deleted: 0 }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-6 py-8 space-y-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        {/* Main Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tests</h1>
        </div>

        {/* Statistics Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Statistics</h2>
            <p className="text-gray-600">Key metrics generated from your analysis.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Completed Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-gray-900">{totals.completed}</p>
                  </div>
                  {/* <div className="w-12 h-12 rounded-full border-2 border-green-500 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div> */}
                  <StatCompleted />
                </div>
              </CardContent>
            </Card>

            {/* Incomplete Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Incomplete</p>
                    <p className="text-2xl font-bold text-gray-900">{totals.incomplete}</p>
                  </div>
                  {/* <div className="w-12 h-12 rounded-full border-2 border-orange-500 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-orange-500" />
                  </div> */}
                  <StatIncomplete />
                </div>
              </CardContent>
            </Card>

            {/* Aborted Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Aborted</p>
                    <p className="text-2xl font-bold text-gray-900">{totals.aborted}</p>
                  </div>
                  <StatIncomplete />
                </div>
              </CardContent>
            </Card>

            {/* Deleted Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Deleted</p>
                    <p className="text-2xl font-bold text-gray-900">{totals.deleted}</p>
                  </div>
                  {/* <div className="w-12 h-12 rounded-full border-2 border-pink-500 flex items-center justify-center">
                    <Trash2 className="h-6 w-6 text-pink-500" />
                  </div> */}
                  <StatDeleted />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tests Table */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200 table-fixed">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div className="flex items-center gap-2">
                          Log Filename
                          {/* <Filter className="h-4 w-4" /> */}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Completed Tests
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Incomplete Tests
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aborted Tests
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Deleted Tests
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tableData.length > 0 ? (
                      tableData.map((row, index) => (
                        // <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                        <tr key={index} className="bg-white">
                          <td className="px-3 py-3 text-sm text-gray-900 truncate" title={row.fullPath}>
                            {row.filename}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 truncate">
                            {row.completed}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 truncate">
                            {row.incomplete}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 truncate">
                            {row.aborted}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 truncate">
                            {row.deleted}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-3 py-8 text-center text-gray-500">
                          No test data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

