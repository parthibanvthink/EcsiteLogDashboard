import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { FileUpload } from "../FileUpload"
import { LogFilesList } from "../LogFilesList"
import axios from "axios"
import { API_BASE } from "../config/api"

export function UploadPage() {
  const navigate = useNavigate()
  const [logFiles, setLogFiles] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const isInitialMount = useRef(true)
  const [isS3ModalOpen, setIsS3ModalOpen] = useState(false)
  const [sites, setSites] = useState([])
  const [isLoadingSites, setIsLoadingSites] = useState(false)
  const [sitesError, setSitesError] = useState("")
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [selectedSite, setSelectedSite] = useState(null)
  const [isLoadingLogFiles, setIsLoadingLogFiles] = useState(false)
  const [logFilesError, setLogFilesError] = useState("")
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState("")
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState("")
  const [isGenerateURL, setIsisGenerateURL] = useState(false);
  const [generatedTimeStamp, setGeneratedTimeStamp] = useState(null);
  const [zipFiles, setZipFiles] = useState([]);
  const [selectedZipFiles, setSelectedZipFiles] = useState([]);
  const [isZipFileModalOpen, setIsZipFileModalOpen] = useState(false);
  const [isLoadingZipFiles, setIsLoadingZipFiles] = useState(false);
  const [isGenerateButtonClicked, setIsGenerateButtonClicked] = useState(false);

  // Load data from session storage on component mount
  useEffect(() => {
    const savedLogFiles = sessionStorage.getItem('uploadedLogFiles')
    if (savedLogFiles) {
      setLogFiles(JSON.parse(savedLogFiles))
    } else {
      // If no session data exists, clear backend data for fresh start
      clearBackendData()
    }
  }, [])

  // Save data to session storage whenever logFiles changes
  useEffect(() => {
    // Skip the very first render to prevent overwriting with an empty array
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    console.log("Saving to session storage:", logFiles)
    sessionStorage.setItem('uploadedLogFiles', JSON.stringify(logFiles))
    
    // Keep processedFiles in sync with logFiles that have fullPath (S3 files)
    // Extract all fullPath values from current logFiles
    const s3Files = logFiles
      .filter(file => file.fullPath && file.status === "completed")
      .map(file => file.fullPath)
    
    // Only update if we have S3 files
    if (s3Files.length > 0) {
      sessionStorage.setItem('processedFiles', JSON.stringify(s3Files))
      console.log("Updated processedFiles in sessionStorage:", s3Files)
    } else {
      // If no S3 files remain, clear processedFiles
      const existingProcessedFiles = sessionStorage.getItem('processedFiles')
      if (existingProcessedFiles) {
        sessionStorage.removeItem('processedFiles')
        console.log("Cleared processedFiles from sessionStorage (no S3 files remaining)")
      }
    }
  }, [logFiles])

  // Function to clear backend data
  const clearBackendData = async () => {
    try {
      await axios.post(`${API_BASE}/clear-data/`)
      console.log("Backend data cleared for new session")
    } catch (error) {
      console.error("Error clearing backend data:", error)
    }
  }

  const handleFileUpload = async (files) => {
    // Check for duplicate files
    const duplicateFiles = files.filter(file => 
      logFiles.some(existingFile => existingFile.name === file.name)
    )
    
    if (duplicateFiles.length > 0) {
      const duplicateNames = duplicateFiles.map(f => f.name).join(', ')
      alert(`File(s) already selected: ${duplicateNames}`)
      return
    }

    const newFiles = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      progress: 0,
      status: "processing",
      canCancel: true,
    }))

    setLogFiles((prev) => [...prev, ...newFiles])
    setIsProcessing(true)

    // Process each file with the backend
    for (const file of files) {
      const fileData = newFiles.find(f => f.name === file.name)
      await processFileWithBackend(file, fileData.id)
    }
  }

  const processFileWithBackend = async (file, fileId) => {
    const formData = new FormData()
    formData.append("file", file)

    try {
      // Update progress
      setLogFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: 50 } : f)))

      // Upload file to backend
      const response = await axios.post(`${API_BASE}/read-log/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      // Update progress to 100% and mark as completed
      setLogFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, progress: 100, status: "completed", canCancel: false }
            : f,
        ),
      )

      console.log("File processed successfully:", response.data)
    } catch (error) {
      console.error("Error processing file:", error)
      // Mark file as failed
      setLogFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, progress: 100, status: "failed", canCancel: false }
            : f,
        ),
      )
    }
  }

  const handleStartAnalysis = async () => {
    // Navigate to loading page with uploaded files data
    navigate("/loading", { 
      state: { uploadedFiles: logFiles } 
    })
  }

  const handleRemoveFile = async (fileId) => {
    // Find the file to get its name
    const fileToRemove = logFiles.find(file => file.id === fileId)
    if (!fileToRemove) return
    
    // Remove file from frontend list
    setLogFiles((prev) => prev.filter((file) => file.id !== fileId))
    
    // Clear backend data for this specific file only
    // Use fullPath for S3 files, name for local files
    const filenameToClear = fileToRemove.fullPath || fileToRemove.name
    try {
      await axios.get(`${API_BASE}/clear-file-data/?filename=${encodeURIComponent(filenameToClear)}`)
      console.log(`Backend data cleared for file: ${filenameToClear}`)
    } catch (error) {
      console.error("Error clearing backend data:", error)
    }

    // Update processedFiles in sessionStorage to remove the deleted file
    // Only update if this is an S3 file (has fullPath)
    if (fileToRemove.fullPath) {
      const processedFilesStr = sessionStorage.getItem('processedFiles')
      if (processedFilesStr) {
        try {
          const processedFiles = JSON.parse(processedFilesStr)
          // Remove the file from processedFiles array
          const updatedProcessedFiles = processedFiles.filter(
            (path) => path !== fileToRemove.fullPath
          )
          // Update sessionStorage with the updated list
          sessionStorage.setItem('processedFiles', JSON.stringify(updatedProcessedFiles))
          console.log(`Removed ${fileToRemove.fullPath} from processedFiles`)
        } catch (error) {
          console.error("Error updating processedFiles in sessionStorage:", error)
        }
      }
    }
  }

  const handleCancelFile = (fileId) => {
    setLogFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, status: "failed", canCancel: false } : file)),
    )
  }

  // Compute filtered devices for selected user
  const userDevices = useMemo(() => {
    if (!selectedUser || devices.length === 0) return []
    return devices
      .filter(device => device.startsWith(`${selectedUser}/`))
      .map(device => device.split('/')[1]) // Extract device ID part
      .filter((id, index, arr) => arr.indexOf(id) === index) // Remove duplicates
  }, [selectedUser, devices])

  // Reset generate button state when user or device selection changes
  useEffect(() => {
    setIsGenerateButtonClicked(false)
  }, [selectedUser, selectedDevice])

  // Build URL path from selections
  const s3Path = useMemo(() => {
    if (!selectedSite || !selectedSite.companyCode || !selectedSite.siteId) return ""
    
    const parts = [
      selectedSite.companyCode,
      selectedSite.siteId,
      "logs"
    ]
    
    if (selectedUser) {
      parts.push(selectedUser)
    }
    
    if (selectedDevice) {
      parts.push(selectedDevice)
    }
    
    return parts.join("/") + (selectedDevice ? "/" : "")
  }, [selectedSite, selectedUser, selectedDevice])

  const handleSelectFromS3 = async () => {
    setIsS3ModalOpen(true)
    setIsLoadingSites(true)
    setSitesError("")
    setUsers([])
    setSelectedUser("")
    setDevices([])
    setSelectedDevice("")
    setSelectedSite(null)
    try {
      // API can return either { sites: [...] } or an array directly
      const response = await axios.post(`${API_BASE}/s3/log`)
      const payload = response?.data
      const data = Array.isArray(payload) ? payload : (Array.isArray(payload?.sites) ? payload.sites : [])
      setSites(data)
    } catch (error) {
      console.error("Error fetching S3 sites:", error)
      setSitesError("Failed to load sites. Please try again.")
    } finally {
      setIsLoadingSites(false)
    }
  }

  return (
    <>
      <FileUpload onFileUpload={handleFileUpload} onSelectFromS3={handleSelectFromS3} />
      <LogFilesList
        files={logFiles}
        onStartAnalysis={handleStartAnalysis}
        onRemoveFile={handleRemoveFile}
        onCancelFile={handleCancelFile}
      />
      {isS3ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsS3ModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Select from S3</h2>
              <p className="text-sm text-gray-500">Choose a site to browse its log files.</p>
            </div>

            <div className="mb-4">
              <label htmlFor="site-select" className="mb-1 block text-sm font-medium">Select site</label>
              <select
                id="site-select"
                className="w-full rounded border border-gray-300 p-2 text-sm"
                value={selectedSiteId}
                onChange={(e) => {
                  const siteId = e.target.value
                  setSelectedSiteId(siteId)
                  const site = sites.find((s) => (s._id || s.id) === siteId)
                  setSelectedSite(site || null)
                  // Reset dependent selections
                  setUsers([])
                  setSelectedUser("")
                  setDevices([])
                  setSelectedDevice("")
                }}
                disabled={isLoadingSites}
              >
                <option value="" disabled>
                  {isLoadingSites ? "Loading sites..." : "Select a site"}
                </option>
                {sites.map((s) => (
                  <option key={s._id || s.id} value={s._id || s.id}>{s.siteName}</option>
                ))}
              </select>
              {sitesError && <p className="mt-1 text-sm text-red-600">{sitesError}</p>}
              {logFilesError && <p className="mt-1 text-sm text-red-600">{logFilesError}</p>}
            </div>

            {users.length > 0 && (
              <div className="mb-4">
                <label htmlFor="user-select" className="mb-1 block text-sm font-medium">Select User folder</label>
                <select
                  id="user-select"
                  className="w-full rounded border border-gray-300 p-2 text-sm"
                  value={selectedUser}
                  onChange={(e) => {
                    setSelectedUser(e.target.value)
                    setSelectedDevice("") // Reset device selection when user changes
                  }}
                  disabled={isLoadingUsers}
                >
                  <option value="" disabled>
                    {isLoadingUsers ? "Loading users..." : "Select a user"}
                  </option>
                  {users.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedUser && userDevices.length > 0 && (
              <div className="mb-4">
                <label htmlFor="device-select" className="mb-1 block text-sm font-medium">Select Device folder</label>
                <select
                  id="device-select"
                  className="w-full rounded border border-gray-300 p-2 text-sm"
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                >
                  <option value="" disabled>
                    Select a device
                  </option>
                  {userDevices.map((deviceId) => (
                    <option key={deviceId} value={deviceId}>{deviceId}</option>
                  ))}
                </select>
              </div>
            )}

            {s3Path && (
              <div className="mb-4 rounded bg-gray-50 p-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">S3 Path</label>
                <div className="text-sm font-mono text-gray-900 break-all">{s3Path}</div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                onClick={() => setIsS3ModalOpen(false)}
              >
                Cancel
              </button>
              {/* Show Generate Zip file button only when site is selected and users exist */}
              {selectedSiteId && users.length > 0 && (
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={
                    !selectedSiteId || 
                    !selectedUser || 
                    !selectedDevice || 
                    isLoadingLogFiles || 
                    isGenerateButtonClicked
                  }
                  onClick={async () => {
                    if (!selectedSiteId || !selectedUser || !selectedDevice) return
                    
                    setIsGenerateButtonClicked(true)
                    setIsLoadingLogFiles(true)
                    setLogFilesError("")
                    
                    if(userDevices.length > 0){
                    try {
                      const site = sites.find((s) => (s._id || s.id) === selectedSiteId)
                      console.log("selectedSite", site)
                      if (!site) {
                        throw new Error("Selected site not found")
                      }
                      
                      // Ensure selectedSite state is set
                      if (!selectedSite || (selectedSite._id || selectedSite.id) !== (site._id || site.id)) {
                        setSelectedSite(site)
                      }

                      const timestamp_ms = Math.floor(Date.now());
                      setGeneratedTimeStamp(timestamp_ms.toString())
  
                      const body = {
                        siteId: site._id || selectedSiteId,
                        companyId: site.companyId,
                        companyCode: site.companyCode,
                        siteCode: site.siteId,
                        bucket_name: "ecsite-cloud-uat",
                        site_log_path: s3Path,
                        timestamp_ms: timestamp_ms.toString()
                      }

                      // Store site body in sessionStorage for use in LogInsights
                      sessionStorage.setItem('selectedSiteBody', JSON.stringify({
                        siteId: body.siteId,
                        companyId: body.companyId,
                        companyCode: body.companyCode,
                        siteCode: body.siteCode,
                        bucket_name: body.bucket_name,
                        site_log_path: body.site_log_path
                      }))
  
                      setIsLoadingUsers(true)
                      console.log("timestamp123", timestamp_ms)
                      const response = await axios.post(`${API_BASE}/s3/log/${selectedSiteId}/generate`, body)
                      console.log("New Response", response)
                      if(response.data.data.runWorkflow.status === "success"){
                        const newResponse = await axios.post(`${API_BASE}/s3/log/${selectedSiteId}/generate1`, body)
                        console.log("New Response1", newResponse.data.data.runWorkflow.status == "Success")
                        if(newResponse.data.data.runWorkflow.status == "Success"){
                          console.log("entered")
                          setIsisGenerateURL(true);
                        }
                      }
  
                      // Parse GraphQL nested result -> stepResults[0].result is a JSON string
                      // const stepResults = response?.data?.data?.runWorkflow?.stepResults || []
                      // const first = stepResults[0]
                      // let usersList = []
                      // let devicesList = []
                      // if (first && typeof first.result === "string") {
                      //   try {
                      //     const parsed = JSON.parse(first.result)
                      //     usersList = parsed?.data?.response?.users || []
                      //     devicesList = parsed?.data?.response?.devices || []
                      //   } catch (e) {
                      //     console.error("Failed to parse result JSON:", e)
                      //   }
                      // }
  
                      // setUsers(Array.isArray(usersList) ? usersList : [])
                      // setDevices(Array.isArray(devicesList) ? devicesList : [])
                      // setSelectedUser("")
                      // setSelectedDevice("")
                    } catch (error) {
                      console.error("Error fetching S3 log files:", error)
                      setLogFilesError(error.response?.data?.detail || "Failed to load log files. Please try again.")
                    } finally {
                      setIsLoadingLogFiles(false)
                      setIsLoadingUsers(false)
                    }
                  }
                }}
              >
                {isLoadingLogFiles ? "Loading..." : "Generate Zip file"}
              </button>
              )}
              {/* Show Continue button when site is selected but users don't exist yet */}
              {selectedSiteId && users.length === 0 && (
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedSiteId || isLoadingLogFiles}
                  onClick={async () => {
                    if (!selectedSiteId) return
                    
                    setIsLoadingLogFiles(true)
                    setLogFilesError("")
                    
                    try {
                      const site = sites.find((s) => (s._id || s.id) === selectedSiteId)
                      console.log("selectedSite", site)
                      if (!site) {
                        throw new Error("Selected site not found")
                      }
                      
                      // Ensure selectedSite state is set
                      if (!selectedSite || (selectedSite._id || selectedSite.id) !== (site._id || site.id)) {
                        setSelectedSite(site)
                      }

                      const body = {
                        siteId: site._id || selectedSiteId,
                        companyId: site.companyId,
                        companyCode: site.companyCode,
                        siteCode: site.siteId,
                        bucket_name: "ecsite-cloud-uat",
                      }

                      // Store site body in sessionStorage for use in LogInsights
                      sessionStorage.setItem('selectedSiteBody', JSON.stringify(body))

                      setIsLoadingUsers(true)
                      const response = await axios.post(`${API_BASE}/s3/log/${selectedSiteId}`, body)
                      console.log("S3 log files response:", response.data)

                      // Parse GraphQL nested result -> stepResults[0].result is a JSON string
                      const stepResults = response?.data?.data?.runWorkflow?.stepResults || []
                      const first = stepResults[0]
                      let usersList = []
                      let devicesList = []
                      if (first && typeof first.result === "string") {
                        try {
                          const parsed = JSON.parse(first.result)
                          usersList = parsed?.data?.response?.users || []
                          devicesList = parsed?.data?.response?.devices || []
                        } catch (e) {
                          console.error("Failed to parse result JSON:", e)
                        }
                      }

                      setUsers(Array.isArray(usersList) ? usersList : [])
                      setDevices(Array.isArray(devicesList) ? devicesList : [])
                      setSelectedUser("")
                      setSelectedDevice("")
                    } catch (error) {
                      console.error("Error fetching S3 log files:", error)
                      setLogFilesError(error.response?.data?.detail || "Failed to load log files. Please try again.")
                    } finally {
                      setIsLoadingLogFiles(false)
                      setIsLoadingUsers(false)
                    }
                  }}
                >
                  {isLoadingLogFiles ? "Loading..." : "Continue"}
                </button>
              )}

              {isGenerateURL && (
                <button
                  type="button"
                  className="rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                  onClick={async () => {
                    try {
                      const site = sites.find((s) => (s._id || s.id) === selectedSiteId);
                      if (!site) return;
                      
                      setIsLoadingZipFiles(true);
                      setLogFilesError("");
                      
                      // List files in ZIP
                      const body = {
                        companyCode: site.companyCode,
                        siteCode: site.siteId,
                        timestamp_ms: generatedTimeStamp?.toString()
                      };
                      
                      const response = await axios.post(`${API_BASE}/s3/list-zip-files`, body);
                      setZipFiles(response.data.files || []);
                      setSelectedZipFiles([]); // Reset selection
                      setIsZipFileModalOpen(true);
                    } catch (err) {
                      console.error("Error listing ZIP files:", err);
                      setLogFilesError("Failed to list files in ZIP.");
                    } finally {
                      setIsLoadingZipFiles(false);
                    }
                  }}
                  disabled={isLoadingZipFiles}
                >
                  {isLoadingZipFiles ? "Loading Files..." : "Select Files from ZIP"}
                </button>
              )}
              
            </div>
          </div>
        </div>
      )}

      {/* ZIP File Selection Modal */}
      {isZipFileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsZipFileModalOpen(false)}
            aria-hidden="true"
          />
          
          {/* Modal */}
          <div 
            className="relative z-10 w-full max-w-2xl max-h-[85vh] rounded-lg bg-white shadow-xl overflow-hidden flex flex-col border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Select Log Files</h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose which log files to process from the ZIP archive.
              </p>
            </div>

            {/* Actions Bar */}
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={zipFiles.length > 0 && selectedZipFiles.length === zipFiles.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedZipFiles([...zipFiles]);
                    } else {
                      setSelectedZipFiles([]);
                    }
                  }}
                  disabled={isLoadingZipFiles || zipFiles.length === 0}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-sm font-medium text-gray-700">
                  {zipFiles.length > 0 && selectedZipFiles.length === zipFiles.length ? "Deselect All" : "Select All"}
                </span>
              </label>
              <div className="ml-auto text-xs text-gray-500 flex items-center">
                <span className="font-medium text-gray-900">{selectedZipFiles.length}</span>
                <span className="mx-1">/</span>
                <span>{zipFiles.length} files selected</span>
              </div>
            </div>

            {/* File List */}
            <div className="flex-1 px-6 py-4 overflow-y-auto">
              {zipFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-gray-500">No log files found in ZIP.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {zipFiles.map((file) => {
                    const isSelected = selectedZipFiles.includes(file);
                    const fileName = file.split('/').pop() || file;
                    
                    return (
                      <label
                        key={file}
                        className={`
                          flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer
                          transition-colors duration-150
                          ${isSelected 
                            ? 'bg-blue-50 border border-blue-200' 
                            : 'hover:bg-gray-50 border border-transparent'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedZipFiles(selectedZipFiles.filter(f => f !== file));
                            } else {
                              setSelectedZipFiles([...selectedZipFiles, file]);
                            }
                          }}
                          disabled={isLoadingZipFiles}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-mono text-gray-900 break-all">
                            {fileName}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error Message */}
            {logFilesError && (
              <div className="px-6 py-3 bg-red-50 border-t border-red-200">
                <p className="text-sm text-red-600">{logFilesError}</p>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsZipFileModalOpen(false);
                  setSelectedZipFiles([]);
                }}
                disabled={isLoadingZipFiles}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const site = sites.find((s) => (s._id || s.id) === selectedSiteId);
                    if (!site || selectedZipFiles.length === 0) return;

                    setIsLoadingZipFiles(true);
                    setLogFilesError("");

                    // Process selected files
                    const body = {
                      companyCode: site.companyCode,
                      siteCode: site.siteId,
                      timestamp_ms: generatedTimeStamp?.toString(),
                      selectedFiles: selectedZipFiles
                    };

                    const response = await axios.post(`${API_BASE}/s3/process-selected-files`, body);
                    console.log("Files processed:", response.data);

                    // Store processed_files list in sessionStorage for use in test-results API
                    if (response.data?.processed_files) {
                      sessionStorage.setItem('processedFiles', JSON.stringify(response.data.processed_files));
                    }

                    // Add processed files to logFiles state so they appear in the list
                    // Store full path for S3 files so removal works correctly
                    const processedFiles = selectedZipFiles.map((filename) => ({
                      id: Math.random().toString(36).substr(2, 9),
                      name: filename.split('/').pop() || filename, // Display name (short)
                      fullPath: filename, // Full path for backend matching
                      progress: 100,
                      status: "completed",
                      canCancel: false,
                    }));
                    
                    setLogFiles((prev) => [...prev, ...processedFiles]);

                    // Close all modals and reset states
                    setIsZipFileModalOpen(false);
                    setIsS3ModalOpen(false);
                    setSelectedZipFiles([]);
                    setZipFiles([]);
                    setIsisGenerateURL(false);
                    setSelectedSiteId("");
                    setSelectedSite(null);
                    setUsers([]);
                    setSelectedUser("");
                    setDevices([]);
                    setSelectedDevice("");
                    
                    alert(`Successfully processed ${selectedZipFiles.length} file(s). ${response.data.total_logs} logs imported.`);
                  } catch (err) {
                    console.error("Error processing files:", err);
                    setLogFilesError(err.response?.data?.detail || "Failed to process selected files.");
                  } finally {
                    setIsLoadingZipFiles(false);
                  }
                }}
                disabled={selectedZipFiles.length === 0 || isLoadingZipFiles}
                className="min-w-[140px] px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoadingZipFiles ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  `Process ${selectedZipFiles.length} File${selectedZipFiles.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
