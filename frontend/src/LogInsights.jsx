import { useEffect, useRef, useState, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Button } from "./components/ui/button"
import { Breadcrumb } from "./components/ui/breadcrumb"
import { Card, CardContent } from "./components/ui/card"
import { Badge } from "./components/ui/badge"
import { ArrowLeft, Save, FileText, Clock, AlertTriangle, Shield, Search, Filter, ZoomIn, ZoomOut, Maximize2, List, Workflow, Home, History, Bookmark, User, FileUp, X } from "lucide-react"
import BackArrowSVG from "./assets/BackArrow"
import SaveAnalysisSVG from "./assets/SaveAnalysis"
import axios from "axios"
import FlowChartIcon from "./assets/FlowChartIcon"
import TotalEventsIcon from "./assets/TotalEventsIcon"
import AverageSessionIcon from "./assets/AverageSessionIcon"
import TotalCrashesIcon from "./assets/TotalCrashesIcon"
import CrashFressIcon from "./assets/CrashFressIcon"
import TotalTest from "./assets/TotalTest"
import { API_BASE } from "./config/api"
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

const getLevelBadgeColor = (level) => {
  switch (level?.toUpperCase()) {
    case "ERROR":
      return "bg-red-100 text-red-800 border-red-200"
    case "WARNING":
      return "bg-yellow-100 text-yellow-800 border-yellow-200"
    case "INFO":
      return "bg-blue-100 text-blue-800 border-blue-200"
    case "DEBUG":
      return "bg-gray-100 text-gray-800 border-gray-200"
    default:
      return "bg-gray-100 text-gray-800 border-gray-200"
  }
}

// Function to extract log level from message
const extractLogLevel = (message) => {
  const upperMessage = message?.toUpperCase() || ""
  if (upperMessage.includes("ERROR") || upperMessage.includes("EXCEPTION")) return "ERROR"
  if (upperMessage.includes("WARNING") || upperMessage.includes("WARN")) return "WARNING"
  if (upperMessage.includes("INFO")) return "INFO"
  if (upperMessage.includes("DEBUG")) return "DEBUG"
  return "INFO" // default
}

// Function to extract timestamp from message (fallback when backend time not provided)
const extractTimestampFromMessage = (message) => {
  // Try ISO-like datetime first
  const isoMatch = message?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  if (isoMatch) return isoMatch[0]
  // Try HH:MM:SS:MMM format at the start (04:33:11:676)
  const hmsMatch = message?.match(/^\d{2}:\d{2}:\d{2}:\d{3}/)
  if (hmsMatch) return hmsMatch[0]
  return "" // let UI show empty if unknown
}

// Function to extract event description
const extractEvent = (message) => {
  // Remove timestamp and device info to get the main event
  return message?.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s*/, "") || message || "Unknown event"
}


// Function to generate sample device info
const generateDeviceInfo = (deviceId) => {
  const devices = [
    "Pixel 7 Pro / Android",
    "iPhone 14 Pro / iOS", 
    "Samsung Galaxy S23 / Android",
    "iPad Pro / iOS",
    "OnePlus 11 / Android"
  ]
  return devices[deviceId.length % devices.length] || "Unknown Device"
}

// Function to generate sample app version
const generateAppVersion = () => {
  const versions = ["v3.2.1", "v3.2.0", "v3.1.9", "v3.1.8"]
  return versions[Math.floor(Math.random() * versions.length)]
}

// Function to generate sample session ID
const generateSessionId = () => {
  return `SESS${Math.floor(Math.random() * 9000) + 1000}`
}

// Function to generate sample user ID
const generateUserId = () => {
  return `USER${Math.floor(Math.random() * 9000) + 1000}`
}

// Function to process logs for table view
const processLogsForTable = (logs) => {
  return logs.map(log => ({
    ...log,
    deviceInfo: generateDeviceInfo(log.device_id),
    appVersion: generateAppVersion(),
    sessionId: generateSessionId(),
    userId: generateUserId()
  }))
}


// Utils to compute average session duration from sessions list
const parseTimeHmsMs = (t) => {
  // Expect HH:MM:SS:MM or HH:MM:SS:MMM (2 or 3 digits for milliseconds)
  // Return milliseconds since day start; fallback 0
  if (!t) return 0
  // Trim whitespace and match the time pattern
  const trimmed = String(t).trim()
  const m = trimmed.match(/^(\d{2}):(\d{2}):(\d{2}):(\d{2,3})$/)
  if (!m) return 0
  const [_, hh, mm, ss, ms] = m
  // Parse milliseconds: 2 digits treated as-is (54 = 54ms), 3 digits as-is (480 = 480ms)
  const msValue = parseInt(ms)
  return (parseInt(hh)*3600 + parseInt(mm)*60 + parseInt(ss)) * 1000 + msValue
}

const formatDuration = (ms) => {
  if (!ms || ms <= 0) return "0s"
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

// Utility to truncate text for display in table cells
const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text || ""
  return text.substring(0, maxLength - 3) + "..."
}

// Utility to check if text is truncated
const isTextTruncated = (text, maxLength = 100) => {
  return text && text.length > maxLength
}

  // Function to generate statistics data
  const generateStatistics = (logs, sessions, totalCount = null, sessionErrorCount = null) => {
    const totalEvents = totalCount || logs.length
    // Use session error count if provided, otherwise calculate from current logs
    const errorLogs = sessionErrorCount !== null ? sessionErrorCount : logs.filter(log => extractLogLevel(log.message) === "ERROR").length
    const crashFreeSessions = Math.max(0, totalEvents - errorLogs)

  const deviceSessions = sessions || []
  let avgDurationLabel = "0s"
  if (deviceSessions.length > 0) {
    // Calculate durations, filtering out invalid sessions (missing or invalid times)
    const validDurations = deviceSessions
      .filter(s => s.start_time && s.end_time) // Only sessions with both times
      .map(s => {
        const startMs = parseTimeHmsMs(s.start_time)
        const endMs = parseTimeHmsMs(s.end_time)
        return endMs > startMs ? (endMs - startMs) : 0 // Ensure positive duration
      })
      .filter(d => d > 0) // Only include valid positive durations
    
    if (validDurations.length > 0) {
      const sum = validDurations.reduce((a, b) => a + b, 0)
      const avg = Math.floor(sum / validDurations.length)
      avgDurationLabel = formatDuration(avg)
    }
  }
    
  return {
    totalEvents: totalEvents,
    averageSessionDuration: avgDurationLabel,
    totalCrashes: errorLogs,
    crashFreeSessions: crashFreeSessions
  }
}

// Function to format uploaded files data
const formatUploadedFiles = (files) => {
  return files.map(file => ({
    name: file.name,
    size: file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Unknown size",
    status: file.status || "completed"
  }))
}

export function LogInsights({ onGoBack, logsData = [], uploadedFiles = [] }) {
  const navigate = useNavigate()
  const location = useLocation()

  // Generate breadcrumb items based on current route
  const getBreadcrumbItems = () => {
    const items = []

    switch (location.pathname) {
      case "/":
        items.push({ label: "Upload", path: "/" })
        break
      case "/loading":
        items.push({ label: "Upload", path: "/" })
        items.push({ label: "Loading", path: "/loading" })
        break
      case "/insights":
        items.push({ label: "Upload", path: "/" })
        items.push({ label: "Analysis", path: "/insights" })
        break
      case "/history":
        items.push({ label: "History", path: "/history" })
        break
      default:
        items.push({ label: "Upload", path: "/" })
        items.push({ label: "Page", path: location.pathname })
    }

    return items
  }
  const [selectedSession, setSelectedSession] = useState("1")
  const [viewMode, setViewMode] = useState("list") // "list" or "flowchart"
  const [searchTerm, setSearchTerm] = useState("")
  const [zoomLevel, setZoomLevel] = useState(100)
  const [layoutDirection, setLayoutDirection] = useState("TB") // "TB" for vertical, "LR" for horizontal
  const [sessions, setSessions] = useState([])
  console.log("sessions213", sessions)
  const sessionsLoadedRef = useRef(false)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [edgeEvents, setEdgeEvents] = useState({})
  const [showEventsPanel, setShowEventsPanel] = useState(false)
  const [showUploadedFilesSlider, setShowUploadedFilesSlider] = useState(false)
  
  // Pagination state
  const [allLogs, setAllLogs] = useState(logsData)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreLogs, setHasMoreLogs] = useState(true)
  const [sessionTotalCount, setSessionTotalCount] = useState(0)
  const [sessionErrorCount, setSessionErrorCount] = useState(0)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEventText, setSelectedEventText] = useState("")
  const [selectedEventTitle, setSelectedEventTitle] = useState("")
  const [showRawFileModal, setShowRawFileModal] = useState(false)
  const [rawLogContent, setRawLogContent] = useState("")
  const [rawLogLoading, setRawLogLoading] = useState(false)
  
  // Function to format logs in raw file format
  const formatRawLogs = (logs) => {
    return logs.map(log => {
      const timestamp = log.time || extractTimestampFromMessage(log.message) || ""
      const level = extractLogLevel(log.message)
      const message = log.message || ""
      return `${timestamp} | ${level}: ${message}`
    }).join('\n')
  }
  
  // Function to fetch raw log file from API
  const fetchRawLogFile = async (sessionId) => {
    setRawLogLoading(true)
    try {
      const response = await axios.get(`${API_BASE}/logs/raw`, {
        params: { session_id: sessionId }
      })
      setRawLogContent(response.data.content || "")
    } catch (error) {
      console.error("Error fetching raw log file:", error)
      setRawLogContent("Error loading raw log file. Please try again.")
    } finally {
      setRawLogLoading(false)
    }
  }
  
  // Handle raw file modal open
  const handleViewRawFile = () => {
    setShowRawFileModal(true)
    fetchRawLogFile(parseInt(selectedSession))
  }
  
  // Function to convert data to CSV format
  const convertToCSV = (data) => {
    const csvRows = []
    
    // Add metadata
    csvRows.push(['Analysis Export', ''])
    csvRows.push(['Timestamp', data.timestamp])
    csvRows.push(['Total Sessions', data.sessions.length])
    csvRows.push(['Total Logs', data.logs.length])
    csvRows.push(['Total Events', data.statistics.totalEvents])
    csvRows.push(['Total Crashes', data.statistics.totalCrashes])
    csvRows.push(['Crash-Free Sessions', data.statistics.crashFreeSessions])
    csvRows.push([''])
    
    // Add sessions data
    csvRows.push(['SESSIONS', ''])
    csvRows.push(['Session ID', 'Device ID', 'Start Time', 'End Time', 'Duration', 'Event Count', 'Error Count'])
    data.sessions.forEach(session => {
      csvRows.push([
        session.session_id,
        session.device_id,
        session.start_time || '',
        session.end_time || '',
        session.duration || '',
        session.event_count || 0,
        session.error_count || 0
      ])
    })
    csvRows.push([''])
    
    // Add flowchart nodes
    csvRows.push(['FLOWCHART NODES', ''])
    csvRows.push(['Node ID', 'Label', 'Count', 'Session Count', 'Frequency', 'First Seen', 'Last Seen'])
    data.flowchart.nodes?.forEach(node => {
      csvRows.push([
        node.id,
        node.label,
        node.count || 0,
        node.session_count || 0,
        node.frequency || 0,
        node.first_seen || '',
        node.last_seen || ''
      ])
    })
    csvRows.push([''])
    
    // Add flowchart edges
    csvRows.push(['FLOWCHART EDGES', ''])
    csvRows.push(['From', 'To', 'Count', 'Avg Events', 'Session Count', 'Frequency', 'Strength'])
    data.flowchart.edges?.forEach(edge => {
      csvRows.push([
        edge.from,
        edge.to,
        edge.count || 0,
        edge.avg_events || 0,
        edge.session_count || 0,
        edge.frequency || 0,
        edge.strength || 0
      ])
    })
    csvRows.push([''])
    
    // Add logs data (all currently loaded logs)
    csvRows.push(['LOGS (All Loaded)', ''])
    csvRows.push(['ID', 'Device ID', 'Time', 'Message', 'Session ID', 'Log Level'])
    data.logs.forEach(log => {
      csvRows.push([
        log.id,
        log.device_id,
        log.time || '',
        (log.message || '').replace(/,/g, ';'), // Replace commas to avoid CSV issues
        log.session_id,
        extractLogLevel(log.message)
      ])
    })
    
    return csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
  }
  
  // Function to download data in specified format
  const downloadAnalysis = (format) => {
    try {
      const analysisData = {
        timestamp: new Date().toISOString(),
        sessions: sessions || [],
        flowchart: flowchartData || {},
        logs: allLogs || [],
        statistics: generateStatistics(allLogs || [], sessions || [], sessionTotalCount, sessionErrorCount)
      }
      
      let dataStr, mimeType, extension
      
      if (format === 'csv') {
        dataStr = convertToCSV(analysisData)
        mimeType = 'text/csv'
        extension = 'csv'
      } else {
        dataStr = JSON.stringify(analysisData, null, 2)
        mimeType = 'application/json'
        extension = 'json'
      }
      
      const dataBlob = new Blob([dataStr], { type: mimeType })
      const url = URL.createObjectURL(dataBlob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `log-analysis-${new Date().toISOString().split('T')[0]}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      console.log(`Analysis saved successfully as ${format.toUpperCase()}`)
      setShowSaveModal(false)
    } catch (error) {
      console.error('Error saving analysis:', error)
    }
  }
  
  // Get unique device IDs
  const deviceIds = [...new Set(allLogs.map(log => log.device_id))]
  
  // Initialize pagination when logsData changes
  useEffect(() => {
    setAllLogs(logsData)
    setCurrentPage(1)
    setPage(1) // Reset UI pagination
    setHasMoreLogs(logsData.length >= 250) // Assuming 250 per page
    setSessionTotalCount(logsData.length) // Set initial total count
    // Calculate initial error count from logsData
    const initialErrorCount = logsData.filter(log => extractLogLevel(log.message) === "ERROR").length
    setSessionErrorCount(initialErrorCount)
  }, [logsData])
  
  // Function to load logs for a specific session (only 250 records)
  const loadSessionLogs = async (sessionId) => {
    setIsLoadingMore(true)
    try {
      // Load only the first 250 records for this session
      const response = await axios.get(`${API_BASE}/logs/paginated?page=1&per_page=250&session_id=${sessionId}`)
      const sessionLogs = response.data.logs || []
      const metadata = response.data.metadata || {}
      
      // Fetch total error count for this session
      const errorResponse = await axios.get(`${API_BASE}/logs/paginated?page=1&per_page=1000&session_id=${sessionId}`)
      const allSessionLogs = errorResponse.data.logs || []
      const totalErrorCount = allSessionLogs.filter(log => extractLogLevel(log.message) === "ERROR").length
      
      // Replace all logs with only this session's logs
      setAllLogs(sessionLogs)
      setCurrentPage(1)
      setHasMoreLogs(sessionLogs.length === 250) // More data available if we got 250 records
      setPage(1) // Reset UI pagination
      setSessionTotalCount(metadata.total_logs || 0) // Store total count for this session
      setSessionErrorCount(totalErrorCount) // Store total error count for this session
      
    } catch (error) {
      console.error("Error loading session logs:", error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Function to load more logs for current session
  const loadMoreLogs = async () => {
    if (isLoadingMore || !hasMoreLogs) return
    
    setIsLoadingMore(true)
    try {
      const nextPage = currentPage + 1
      const response = await axios.get(`${API_BASE}/logs/paginated?page=${nextPage}&per_page=250&session_id=${selectedSession}`)
      const newLogs = response.data.logs || []
      
      if (newLogs.length > 0) {
        // Append new logs to current session logs
        setAllLogs(prev => [...prev, ...newLogs])
        setCurrentPage(nextPage)
        setHasMoreLogs(newLogs.length === 250)
        setPage(1) // Reset UI pagination to show new data
      } else {
        setHasMoreLogs(false)
      }
    } catch (error) {
      console.error("Error loading more logs:", error)
    } finally {
      setIsLoadingMore(false)
    }
  }
  
  // Helper: compute sessions client-side by scanning logs
  const computeSessionsFromLogs = (logs) => {
    if (!Array.isArray(logs) || logs.length === 0) return []
    let sessionId = 0
    let current = null
    const out = []
    for (const log of logs) {
      const text = `${log.message || ""}`
      const time = log.time || extractTimestampFromMessage(text)
      const isEntry = text.includes("LOG-APP") && text.includes("App Version")
      if (isEntry || sessionId === 0) {
        // close previous
        if (current) {
          current.end_time = current.end_time || time
          out.push(current)
        }
        sessionId += 1
        current = {
          device_id: log.device_id,
          session_id: sessionId,
          start_time: time,
          end_time: time,
          entries_count: 0,
          screens: [],
        }
      }
      if (current) {
        current.entries_count += 1
        current.end_time = time || current.end_time
        // capture NAVIGATE-TO screens
        const screenMatch = text.match(/NAVIGATE-TO\s*:\s*\{\s*screen\s*:\s*([^}\s]+)/)
        if (screenMatch) current.screens.push(screenMatch[1])
      }
    }
    if (current) out.push(current)
    return out
  }
  
  
  // Fetch sessions from backend, with fallback to client-side computation
  useEffect(() => {
    if (sessionsLoadedRef.current) return
    sessionsLoadedRef.current = true
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        if (Array.isArray(data.sessions) && data.sessions.length > 0) {
          setSessions(data.sessions)
          // Default to session 1 if available, otherwise first session
          const defaultSession = data.sessions.find(s => s.session_id === 1) || data.sessions[0]
          setSelectedSession(String(defaultSession.session_id))
          return
        }
        // fallthrough to client compute if empty
      } catch (_err) {
        // compute from logs when backend endpoint is missing/404
        const local = computeSessionsFromLogs(allLogs)
        setSessions(local)
        if (local.length > 0) {
          // Default to session 1 if available, otherwise first session
          const defaultSession = local.find(s => s.session_id === 1) || local[0]
          setSelectedSession(String(defaultSession.session_id))
        }
      }
    }
    run()
  }, [allLogs])

  // Load logs for selected session when session changes
  useEffect(() => {
    if (selectedSession && sessions.length > 0) {
      // Always load fresh data for the selected session
      loadSessionLogs(parseInt(selectedSession))
    }
  }, [selectedSession, sessions])

  // Filter logs by session and search term
  const filteredLogs = allLogs.filter(log => {
    const sessionMatch = String(log.session_id) === String(selectedSession)
    const searchMatch = searchTerm === "" || 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      extractEvent(log.message).toLowerCase().includes(searchTerm.toLowerCase())
    return sessionMatch && searchMatch
  })
  
  // Client-side pagination for UI display
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const startIndex = (page - 1) * perPage
  const endIndex = startIndex + perPage
  const pagedLogs = filteredLogs.slice(startIndex, endIndex)
  const processedLogs = processLogsForTable(pagedLogs)
  
  // State for flowchart data
  const [flowchartData, setFlowchartData] = useState({ nodes: [], edges: [] })
  const [flowchartLoading, setFlowchartLoading] = useState(false)
  
  // Fetch flowchart data from backend
  useEffect(() => {
    const fetchFlowchartData = async () => {
      setFlowchartLoading(true)
      try {
        const params = new URLSearchParams()
        params.append("session_id", selectedSession)
        
        const response = await fetch(`${API_BASE}/flowchart?${params}`)
        if (response.ok) {
          const data = await response.json()
          setFlowchartData(data)
        }
      } catch (error) {
        console.error("Failed to fetch flowchart data:", error)
        // Fallback to empty data
        setFlowchartData({ nodes: [], edges: [] })
      } finally {
        setFlowchartLoading(false)
      }
    }
    
    fetchFlowchartData()
  }, [selectedSession])
  
  // Transform dependency tree data format to internal structure
  const transformDependencyTreeData = (data) => {
    if (!data || !data.nodes || data.nodes.length === 0) {
      return { nodes: [], edges: [] }
    }

    // Collect all unique node names
    const nodeSet = new Set()
    if (data.root) {
      nodeSet.add(data.root)
    }
    data.nodes.forEach(rel => {
      if (rel.parent) nodeSet.add(rel.parent)
      if (rel.child) nodeSet.add(rel.child)
    })

    // Create nodes array
    const nodes = Array.from(nodeSet).map(id => ({
      id: id,
      label: id
    }))

    // Create edges array from relationships
    const edges = data.nodes.map(rel => ({
      from: rel.parent,
      to: rel.child,
      count: rel.count || 1,
      avg_events: rel.avg_events || 0,
      session_count: rel.session_count || 0,
      frequency: rel.frequency || 0,
      strength: rel.strength || 1
    }))

    return { nodes, edges, root: data.root }
  }

  // Build tree structure from nodes and edges
  const buildTreeStructure = (nodes, edges, rootNode) => {
    // Create adjacency list (parent -> children)
    const childrenMap = {}
    const parentMap = {} // Track all parents for each node
    const nodeMap = {} // Quick lookup for node data

    nodes.forEach(node => {
      nodeMap[node.id] = node
      childrenMap[node.id] = []
      parentMap[node.id] = []
    })

    edges.forEach(edge => {
      if (!childrenMap[edge.from]) childrenMap[edge.from] = []
      childrenMap[edge.from].push(edge.to)
      if (!parentMap[edge.to]) parentMap[edge.to] = []
      parentMap[edge.to].push(edge.from)
    })

    // Find root nodes (nodes with no parents, or specified root)
    const roots = []
    if (rootNode && nodeMap[rootNode]) {
      roots.push(rootNode)
    } else {
      nodes.forEach(node => {
        if (parentMap[node.id].length === 0) {
          roots.push(node.id)
        }
      })
    }

    // If no roots found, use first node
    if (roots.length === 0 && nodes.length > 0) {
      roots.push(nodes[0].id)
    }

    return { childrenMap, parentMap, nodeMap, roots }
  }

  // Calculate node levels using BFS from roots
  const calculateNodeLevels = (treeStructure) => {
    const { childrenMap, roots } = treeStructure
    const levels = {}
    const visited = new Set()
    const queue = []

    // Initialize queue with all roots at level 0
    roots.forEach(root => {
      queue.push({ nodeId: root, level: 0 })
    })

    while (queue.length > 0) {
      const { nodeId, level } = queue.shift()
      
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      if (!levels[level]) levels[level] = []
      levels[level].push(nodeId)

      // Add children to next level
      const children = childrenMap[nodeId] || []
      children.forEach(childId => {
        if (!visited.has(childId)) {
          // If node has multiple parents, use the maximum level
          const existingLevel = Object.keys(levels).find(l => 
            levels[l] && levels[l].includes(childId)
          )
          if (!existingLevel) {
            queue.push({ nodeId: childId, level: level + 1 })
          }
        }
      })
    }

    // Handle disconnected nodes
    const allNodes = Object.keys(childrenMap)
    const unvisitedNodes = allNodes.filter(nodeId => !visited.has(nodeId))
    
    if (unvisitedNodes.length > 0) {
      const maxLevel = Math.max(...Object.keys(levels).map(Number), -1)
      const disconnectedLevel = maxLevel + 1
      if (!levels[disconnectedLevel]) levels[disconnectedLevel] = []
      levels[disconnectedLevel].push(...unvisitedNodes)
    }

    return levels
  }

  // Hierarchical dependency tree layout algorithm
  const calculateFlowchartLayout = (nodes, edges, rootNode = null) => {
    if (!nodes || nodes.length === 0) {
      return { nodePositions: {}, edgePaths: [], viewBox: "0 0 2000 1200" }
    }

    // Node dimensions
    const nodeWidth = 200
    const nodeHeight = 80
    const horizontalSpacing = 250  // Spacing between sibling nodes
    const verticalSpacing = 200   // Spacing between levels
    const margin = 100
    const startY = margin

    const nodePositions = {}
    const edgePaths = []

    // Build tree structure
    const treeStructure = buildTreeStructure(nodes, edges, rootNode)
    const { childrenMap, nodeMap, roots } = treeStructure

    // Calculate levels
    const levels = calculateNodeLevels(treeStructure)

    // Calculate positions for each level
    const levelPositions = {} // level -> array of x positions
    const maxLevel = Math.max(...Object.keys(levels).map(Number), 0)

    // First pass: Calculate initial positions for each level
    for (let level = maxLevel; level >= 0; level--) {
      const levelNodes = levels[level] || []
      if (levelNodes.length === 0) continue

      // Calculate total width needed for this level
      const totalWidth = levelNodes.length * nodeWidth + (levelNodes.length - 1) * horizontalSpacing
      const startX = margin + (2000 - totalWidth) / 2 // Center the level

      levelPositions[level] = []
      
      levelNodes.forEach((nodeId, index) => {
        const x = startX + index * (nodeWidth + horizontalSpacing)
        levelPositions[level].push({ nodeId, x })
        
        nodePositions[nodeId] = {
          x: x,
          y: startY + level * verticalSpacing,
          width: nodeWidth,
          height: nodeHeight
        }
      })
    }

    // Adjust positions to center children under their parents
    for (let level = 0; level < maxLevel; level++) {
      const levelNodes = levels[level] || []
      
      levelNodes.forEach(parentId => {
        const children = childrenMap[parentId] || []
        if (children.length === 0) return

        // Get positions of children
        const childPositions = children
          .map(childId => {
            const pos = nodePositions[childId]
            return pos ? pos.x + pos.width / 2 : null
          })
          .filter(x => x !== null)

        if (childPositions.length === 0) return

        // Calculate center of children
        const childrenCenter = (Math.min(...childPositions) + Math.max(...childPositions)) / 2
        
        // Get parent center
        const parentPos = nodePositions[parentId]
        if (!parentPos) return
        const parentCenter = parentPos.x + parentPos.width / 2

        // Calculate offset needed to center children under parent
        const offset = parentCenter - childrenCenter

        // Apply offset to all descendants (with visited tracking to prevent cycles)
        const visited = new Set()
        const applyOffset = (nodeId, offset) => {
          if (visited.has(nodeId)) return // Prevent infinite recursion
          visited.add(nodeId)
          
          const pos = nodePositions[nodeId]
          if (pos) {
            pos.x += offset
            const descendants = childrenMap[nodeId] || []
            descendants.forEach(descId => applyOffset(descId, offset))
          }
        }

        children.forEach(childId => {
          applyOffset(childId, offset)
        })
      })
    }

    // Build edge map to detect bidirectional edges
    const edgeMap = new Map()
    const bidirectionalPairs = new Set()
    
    // First pass: add all edges to map
    edges.forEach(edge => {
      const key = `${edge.from}-${edge.to}`
      edgeMap.set(key, edge)
    })
    
    // Second pass: check for bidirectional pairs
    edges.forEach(edge => {
      const key = `${edge.from}-${edge.to}`
      const reverseKey = `${edge.to}-${edge.from}`
      
      // Check if bidirectional (both directions exist)
      if (edgeMap.has(reverseKey)) {
        bidirectionalPairs.add(key)
        bidirectionalPairs.add(reverseKey)
      }
    })

    // Calculate edge paths with smooth curves
    edges.forEach((edge, index) => {
      const fromPos = nodePositions[edge.from]
      const toPos = nodePositions[edge.to]
      
      if (fromPos && toPos) {
        // Determine if this is a forward or backward edge based on Y position
        const isForward = toPos.y > fromPos.y // Child is below parent (forward)
        const isBackward = toPos.y < fromPos.y // Child is above parent (backward)
        
        // Check if there's a reverse edge
        const key = `${edge.from}-${edge.to}`
        const reverseKey = `${edge.to}-${edge.from}`
        const hasReverseEdge = bidirectionalPairs.has(key) && bidirectionalPairs.has(reverseKey)
        
        // Calculate offset for bidirectional edges
        // Forward edges offset to the right, backward edges offset to the left
        let offset = 0
        if (hasReverseEdge) {
          // Offset forward edges to the right, backward edges to the left
          offset = isBackward ? -40 : 40
        }
        
        const path = createDependencyTreePath(fromPos, toPos, offset, isBackward)
        edgePaths.push({
          ...edge,
          path,
          midPoint: calculateDependencyTreeMidPoint(fromPos, toPos),
          isForward,
          isBackward,
          hasReverseEdge
        })
      }
    })

    // Calculate required dimensions
    const allPositions = Object.values(nodePositions)
    if (allPositions.length === 0) {
      return { nodePositions: {}, edgePaths: [], viewBox: "0 0 2000 1200" }
    }

    const maxX = Math.max(...allPositions.map(pos => pos.x + pos.width))
    const maxY = Math.max(...allPositions.map(pos => pos.y + pos.height))
    const requiredWidth = Math.max(2000, maxX + margin)
    const requiredHeight = Math.max(1200, maxY + margin)
    const viewBox = `0 0 ${requiredWidth} ${requiredHeight}`

    return { nodePositions, edgePaths, viewBox }
  }

  // Create smooth curved path for dependency tree (top to bottom)
  // offset: horizontal offset for bidirectional edges (positive = right, negative = left)
  // isBackward: true if edge goes upward (child to parent)
  const createDependencyTreePath = (fromPos, toPos, offset = 0, isBackward = false) => {
    const fromX = fromPos.x + fromPos.width / 2
    const fromY = isBackward ? fromPos.y : fromPos.y + fromPos.height
    const toX = toPos.x + toPos.width / 2
    const toY = isBackward ? toPos.y + toPos.height : toPos.y

    const dx = toX - fromX
    const dy = Math.abs(toY - fromY)
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Base control points for smooth Bezier curve
    const baseControlOffset = Math.min(distance * 0.4, 100)
    
    // For bidirectional edges, use higher curvature and side offset
    if (offset !== 0) {
      // Higher curvature for bidirectional edges to make them more distinct
      const controlOffset = baseControlOffset * 1.5
      
      // Create a curved path that goes to the side with higher curvature
      // Control points are offset horizontally to create the side curve
      const controlX1 = fromX + offset * 0.7
      const controlY1 = fromY + (isBackward ? -controlOffset : controlOffset)
      const controlX2 = toX + offset * 0.7
      const controlY2 = toY + (isBackward ? controlOffset : -controlOffset)
      
      return `M ${fromX} ${fromY}
              C ${controlX1} ${controlY1}
                ${controlX2} ${controlY2}
                ${toX} ${toY}`
    }
    
    // Vertical connection (same x position) - no offset
    if (Math.abs(dx) < 10) {
      return `M ${fromX} ${fromY}
              L ${toX} ${toY}`
    }
    
    // Standard curved connection without offset
    const controlX1 = fromX
    const controlY1 = fromY + (isBackward ? -baseControlOffset : baseControlOffset)
    const controlX2 = toX
    const controlY2 = toY + (isBackward ? baseControlOffset : -baseControlOffset)
    
    return `M ${fromX} ${fromY}
            C ${controlX1} ${controlY1}
              ${controlX2} ${controlY2}
              ${toX} ${toY}`
  }

  // Calculate midpoint for edge labels
  const calculateDependencyTreeMidPoint = (fromPos, toPos) => {
    const fromX = fromPos.x + fromPos.width / 2
    const fromY = fromPos.y + fromPos.height
    const toX = toPos.x + toPos.width / 2
    const toY = toPos.y
    
    return {
      x: (fromX + toX) / 2,
      y: (fromY + toY) / 2
    }
  }

  // Check if data is in dependency tree format
  const isDependencyTreeFormat = (data) => {
    return data && data.root !== undefined && Array.isArray(data.nodes) && 
           data.nodes.length > 0 && data.nodes[0].parent !== undefined && data.nodes[0].child !== undefined
  }

  // Get flowchart layout - supports both old format and new dependency tree format
  const getFlowchartLayout = () => {
    // Check if data is in new dependency tree format
    if (isDependencyTreeFormat(flowchartData)) {
      const transformed = transformDependencyTreeData(flowchartData)
      return calculateFlowchartLayout(transformed.nodes, transformed.edges, transformed.root)
    }
    
    // Use old format (backward compatibility)
    return calculateFlowchartLayout(flowchartData.nodes || [], flowchartData.edges || [])
  }

  // Dagre layout configuration
  const nodeWidth = 200;
  const nodeHeight = 80;

  // Get layouted elements using dagre
  const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        targetPosition: isHorizontal ? 'left' : 'top',
        sourcePosition: isHorizontal ? 'right' : 'bottom',
        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  };

  // Get nodes and edges from API data
  const getFlowchartNodes = () => {
    const apiNodes = flowchartData.nodes || [];
  
    return apiNodes.map((node) => ({
      id: node.id,
      position: { x: 0, y: 0 }, // Will be set by dagre layout
      data: { 
        label: node.label || node.id,
        color: node.color || "bg-gray-500"
      },
      type: 'default',
    }));
  };
  
  const getFlowchartEdges = () => {
    const apiEdges = flowchartData.edges || [];
  
    return apiEdges.map((edge, index) => {
      // Use the same logic as previous flowchart: prioritize avg_events, fallback to count
      const countValue = Number.isFinite(edge.avg_events) 
        ? Math.max(0, Math.round(edge.avg_events)) 
        : (edge.count || 0);
      
      return {
        id: `e-${edge.from}-${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        type: ConnectionLineType.SmoothStep,
        animated: true,
        label: String(countValue),
        labelStyle: {
          fill: '#000',
          fontWeight: 600,
          fontSize: 12,
          cursor: 'pointer',
        },
        labelBgStyle: {
          fill: '#fff',
          fillOpacity: 0.8,
          cursor: 'pointer',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#000000',
        },
        // style: {
        //   strokeWidth: 2,
        //   stroke: '#FF0072',
        // },
        // Store original edge data for click handler
        data: {
          from: edge.from,
          to: edge.to,
        },
      };
    });
  };

  // Initialize ReactFlow state hooks
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes and edges when flowchartData changes
  useEffect(() => {
    if (flowchartData && flowchartData.nodes && flowchartData.nodes.length > 0) {
      const initialNodes = getFlowchartNodes();
      const initialEdges = getFlowchartEdges();
      
      // Apply dagre layout
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges,
        layoutDirection // Use state for layout direction
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } else {
      // Reset nodes and edges when no data
      setNodes([]);
      setEdges([]);
    }
  }, [flowchartData, selectedSession, layoutDirection, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge({ ...params, type: ConnectionLineType.SmoothStep, animated: true }, eds),
      ),
    [setEdges]
  );
  
  // Handle edge click
  const handleEdgeClick = async (from, to) => {
    try {
      const params = new URLSearchParams({
        from_state: from,
        to_state: to
      })
      params.append("session_id", selectedSession)
      
      const response = await fetch(`${API_BASE}/flowchart/events?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSelectedEdge({ from, to, events: data.events })
        setShowEventsPanel(true)
      }
    } catch (error) {
      console.error("Failed to fetch events:", error)
      setSelectedEdge({ from, to, events: [] })
      setShowEventsPanel(true)
    }
  }

  const handleViewTestResults = () => {
    // Navigate to test stats page
    navigate("/tests")
  }
  
  // Get statistics data (dynamic average session duration)
  const statistics = generateStatistics(filteredLogs, sessions, sessionTotalCount, sessionErrorCount)
  
  // Format uploaded files data
  const formattedUploadedFiles = formatUploadedFiles(uploadedFiles)

  return (
    <div className="min-h-screen bg-white">

      <div className="px-6 py-8 space-y-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <Breadcrumb items={getBreadcrumbItems()} />
        </div>

        {/* Main Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold text-gray-900">Log Insights</h1>
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault()
                setShowUploadedFilesSlider(true)
              }}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              View Uploaded Files
            </a>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="outline" className="flex items-center gap-2" onClick={onGoBack}>
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
            {/* <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={() => navigate("/history")}
            >
              <History className="h-4 w-4" />
              History
            </Button> */}
            <Button 
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => navigate("/full-log")}
            >
              <FileText className="h-4 w-4" />
              View Full Log File
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              onClick={() => setShowSaveModal(true)}
            >
              <Save className="h-4 w-4" />
              Save Analysis
            </Button>
          </div>
        </div>

        {/* Statistics Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Statistics</h2>
            <p className="text-gray-600">Key metrics generated from your analysis.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Events</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.totalEvents}</p>
              </div>
              {/* <FileText className="h-8 w-8 text-blue-600" /> */}
              <TotalEventsIcon className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                    <p className="text-sm font-medium text-gray-600">Average Session Duration</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.averageSessionDuration}</p>
              </div>
                  {/* <Clock className="h-8 w-8 text-green-600" /> */}
                  <AverageSessionIcon className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                    <p className="text-sm font-medium text-gray-600">Total Crashes</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.totalCrashes}</p>
              </div>
              {/* <AlertTriangle className="h-8 w-8 text-red-600" /> */}
              <TotalCrashesIcon className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                    <p className="text-sm font-medium text-gray-600">Crash-Free Events</p>
                    <p className="text-2xl font-bold text-gray-900">{statistics.crashFreeSessions}</p>
              </div>
                  {/* <Shield className="h-8 w-8 text-purple-600" /> */}
                  <CrashFressIcon className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                    <p className="text-sm font-medium text-gray-600">Total Tests</p>
                    <button 
                      onClick={handleViewTestResults}
                      className="text-blue-600 hover:text-blue-800 underline text-sm cursor-pointer bg-transparent border-none p-0"
                    >
                      View Test Stats
                    </button>
              </div>
                  {/* <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-purple-600" />
                  </div> */}
                  <TotalTest />
            </div>
          </CardContent>
        </Card>

          </div>
        </div>


        {/* Summary Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Summary</h2>
            <p className="text-gray-600">View your log summary as a detailed table or a visual flowchart.</p>
          </div>

          {/* View Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* View Toggle Buttons */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    viewMode === "list" 
                      ? "bg-blue-500 text-white" 
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <List className="h-4 w-4" />
                  List
                </button>
                <button
                  onClick={() => setViewMode("flowchart")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    viewMode === "flowchart" 
                      ? "bg-blue-500 text-white" 
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {/* <Workflow className="h-4 w-4" /> */}
                  <FlowChartIcon className="h-4 w-4" />
                  Flowchart
                </button>
      </div>

              {/* Filters (show in both views so flowchart calls carry session_id) */}
              <div className="flex items-center gap-2">
                {/* Session Filter */}
                <label className="text-sm font-medium text-gray-700">Session:</label>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
                  style={{ maxWidth: '650px' }}
                >
                  {sessions.map((s) => {
                    const fullFilename = s.filename || "Unknown"
                    // Extract only the filename (last part after /)
                    const displayFilename = fullFilename.includes('/') 
                      ? fullFilename.split('/').pop() 
                      : fullFilename
                    return (
                      <option 
                        key={`${s.device_id}-${s.session_id}`} 
                        value={s.session_id}
                        title={fullFilename !== displayFilename ? fullFilename : undefined}
                      >
                        #{s.session_id} ({s.start_time || "?"} → {s.end_time || "?"}) - {displayFilename}
                      </option>
                    )
                  })} 
                </select>
                {/* View Raw File Button */}
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={handleViewRawFile}
                >
                  <FileText className="h-4 w-4" />
                  View Raw File
                </Button>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Flowchart Controls (only show in flowchart mode) */}
              {/* {viewMode === "flowchart" && (
                <>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setZoomLevel(Math.min(zoomLevel + 10, 200))}
                      className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <ZoomIn className="h-4 w-4 text-gray-600" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">{zoomLevel}%</span>
                    <button 
                      onClick={() => setZoomLevel(Math.max(zoomLevel - 10, 50))}
                      className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <ZoomOut className="h-4 w-4 text-gray-600" />
                    </button>
                    <button className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                      <Maximize2 className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </>
              )} */}

              {/* Search Bar */}
              {viewMode === "list" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              )}

              {/* Filter Button */}
              {/* <button className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                <Filter className="h-4 w-4 text-gray-600" />
              </button> */}
            </div>
      </div>

          {/* Content Area */}
          {viewMode === "list" ? (
            /* Table View */
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full divide-y divide-gray-200 table-fixed">
                    <thead className="bg-blue-50">
                      <tr>
                        <th className="w-36 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                        <th className="w-24 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Log Level
                        </th>
                        <th className="w-80 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Event
                        </th>
                        <th className="w-40 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Device Info
                        </th>
                        <th className="w-24 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          App Version
                        </th>
                        <th className="w-28 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Session ID
                        </th>
                        <th className="w-28 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User ID
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {processedLogs.map((log, index) => (
                        <tr key={log.id || index} className={index % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                          <td className="px-3 py-3 text-sm text-gray-900 font-mono truncate" title={log.time || extractTimestampFromMessage(log.message)}>
                            {log.time || extractTimestampFromMessage(log.message)}
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={`text-xs ${getLevelBadgeColor(extractLogLevel(log.message))}`}>
                        {extractLogLevel(log.message)}
                      </Badge>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-900 max-w-0 truncate">
                            {(() => {
                              const eventText = extractEvent(log.message)
                              const isTruncated = isTextTruncated(eventText, 80)
                              const displayText = isTruncated ? truncateText(eventText, 80) : eventText
                              return (
                                <span
                                  className={isTruncated ? "truncate cursor-pointer text-gray-900 hover:text-blue-800 hover:underline block" : "truncate block"}
                                  onClick={() => {
                                    if (isTruncated) {
                                      setSelectedEventText(eventText)
                                      setSelectedEventTitle("Event Details")
                                      setShowEventModal(true)
                                    }
                                  }}
                                  title={isTruncated ? "Click to view full text" : eventText}
                                >
                                  {displayText}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600 truncate" title={log.deviceInfo}>
                            {log.deviceInfo}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600 truncate">
                            {log.appVersion}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600 font-mono truncate">
                            {log.sessionId}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600 font-mono truncate">
                            {log.userId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination Controls */}
                <div className="flex items-center justify-between p-3 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={`px-3 py-1 rounded border ${page === 1 ? "text-gray-400 border-gray-200" : "text-gray-700 border-gray-300 hover:bg-gray-50"}`}
                    >
                      Prev
                    </button>
                    <button
                      disabled={endIndex >= filteredLogs.length}
                      onClick={() => setPage(page + 1)}
                      className={`px-3 py-1 rounded border ${(endIndex >= filteredLogs.length) ? "text-gray-400 border-gray-200" : "text-gray-700 border-gray-300 hover:bg-gray-50"}`}
                    >
                      Next
                    </button>
                  </div>
                  <div className="text-sm text-gray-600">
                    Page {page} of {Math.max(1, Math.ceil(filteredLogs.length / perPage))}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span>Rows per page</span>
                    <select
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(parseInt(e.target.value, 10))
                        setPage(1)
                      }}
                      className="border border-gray-300 rounded px-2 py-1"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>
                
                {/* Session Data Status */}
                <div className="flex justify-center p-2 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-600">
                    Session {selectedSession}: {allLogs.length} of {sessionTotalCount} logs loaded
                    {hasMoreLogs && (
                      <span className="ml-2 text-blue-600">
                        (More data available - click "Load More" below)
                      </span>
                    )}
                    {isLoadingMore && (
                      <span className="ml-2 flex items-center gap-1">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                        Loading more session data...
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Load More Button for current session */}
                {hasMoreLogs && (
                  <div className="flex justify-center p-2 border-t border-gray-200 bg-blue-50">
                    <button
                      onClick={loadMoreLogs}
                      disabled={isLoadingMore}
                      className="px-4 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isLoadingMore ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          Loading more...
                        </>
                      ) : (
                        `Load More Session ${selectedSession} Data`
                      )}
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Flowchart View */
            <div className="flex">
              <Card className={showEventsPanel && selectedEdge ? "w-1/2" : "flex-1"}>
                <CardContent className="p-6">
                  {/* Dependency Tree Legend */}
                  {/* <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-end gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Edge Types:</span>
                      <div className="flex items-center gap-1">
                        <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
                          <path d="M12,4 L12,20" stroke="#3b82f6" strokeWidth="2" fill="none" markerEnd="url(#arrow-down-blue-legend)" />
                          <defs>
                            <marker id="arrow-down-blue-legend" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
                              <path d="M0,0 L10,5 L0,10 Z" fill="#3b82f6" />
                            </marker>
                          </defs>
                        </svg>
                      </div>
                      <div>
                        <span className="font-medium text-blue-600">Forward (Parent → Child)</span>
                      </div>
                    </div>
                    <div className="h-6 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <svg width="24" height="24" viewBox="0 0 24 24" className="flex-shrink-0">
                          <path d="M12,20 L12,4" stroke="#ef4444" strokeWidth="2" fill="none" markerEnd="url(#arrow-up-red-legend)" />
                          <defs>
                            <marker id="arrow-up-red-legend" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
                              <path d="M0,0 L10,5 L0,10 Z" fill="#ef4444" />
                            </marker>
                          </defs>
                        </svg>
                      </div>
                      <div>
                        <span className="font-medium text-red-600">Backward (Child → Parent)</span>
                      </div>
                    </div>
                  </div> */}
                  {/* Layout Direction Buttons */}
                  <div className="mb-4 flex items-center justify-end">
                    <div className="flex bg-gray-100 rounded-lg p-1 gap-3">
                      <button
                        onClick={() => setLayoutDirection("TB")}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                          layoutDirection === "TB" 
                            ? "bg-blue-500 text-white" 
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        vertical layout
                      </button>
                      <button
                        onClick={() => setLayoutDirection("LR")}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                          layoutDirection === "LR" 
                            ? "bg-blue-500 text-white" 
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        horizontal layout
                      </button>
                    </div>
                  </div>
                  
                  <div 
                    className="relative bg-gray-100 rounded-lg overflow-auto"
                    style={{ 
                      height: "1200px",
                      // backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
                      backgroundSize: "20px 20px"
                    }}
                  >
                    {/* Flowchart SVG */}
                    <div style={{ width: '100%', height: '100%', minHeight: '1200px' }}>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onEdgeClick={(event, edge) => {
                        event.stopPropagation();
                        const from = edge.data?.from || edge.source;
                        const to = edge.data?.to || edge.target;
                        handleEdgeClick(from, to);
                      }}
                      connectionLineType={ConnectionLineType.SmoothStep}
                      fitView
                      fitViewOptions={{
                        padding: 0.5,
                        minZoom: 0.1,
                        maxZoom: 2
                      }}
                    >
                      <MiniMap />
                      <Controls />
                      <Background />
                    </ReactFlow>
                    </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Enhanced Events Panel with Metadata */}
            {showEventsPanel && selectedEdge && (
              <div className="w-1/2 bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Transition Analysis</h3>
                  <button
                    onClick={() => setShowEventsPanel(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                
                {/* Transition metadata */}
                {(() => {
                  // Get node labels for from and to screens
                  const fromNode = nodes.find(n => n.id === selectedEdge.from)
                  const toNode = nodes.find(n => n.id === selectedEdge.to)
                  const fromLabel = fromNode?.data?.label || selectedEdge.from
                  const toLabel = toNode?.data?.label || selectedEdge.to
                  
                  return (
                    <p className="text-sm font-medium text-gray-900 mb-4">
                      {fromLabel} → {toLabel} screen
                    </p>
                  )
                })()}
                <div className="overflow-y-auto max-h-[600px]">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Event
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedEdge.events.map((log, index) => (
                        <tr key={log.id || index}>
                          <td className="px-3 py-2 text-sm text-gray-900 font-mono">
                            {log.time || extractTimestampFromMessage(log.message)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900">
                            {extractEvent(log.message)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedEdge.events.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No events found for this transition.
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Flowchart Metadata Panel */}
            {!showEventsPanel && flowchartData.metadata && (
              <div className="w-96 bg-white p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Navigation Insights</h3>
                
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium text-gray-900">Overview</div>
                    <div className="text-xs text-gray-600 mt-1">
                      <div>Sessions: {flowchartData.metadata.total_sessions}</div>
                      <div>Screens: {flowchartData.metadata.total_screens}</div>
                      <div>Transitions: {flowchartData.metadata.total_transitions}</div>
                      <div>Loops: {flowchartData.metadata.has_loops ? 'Yes' : 'No'}</div>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="text-sm font-medium text-green-900">Most Connected Nodes</div>
                    <div className="text-xs text-green-700 mt-1">
                      {nodes
                        .slice(0, 5)
                        .map(node => (
                          <div key={node.id}>{node.data?.label || node.id}</div>
                        ))}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-900">Dependencies</div>
                    <div className="text-xs text-blue-700 mt-1">
                      {edges
                        .slice(0, 5)
                        .map(edge => (
                          <div key={edge.id}>
                            {edge.source} → {edge.target}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {processedLogs.length === 0 && viewMode === "list" && (
        <div className="text-center py-8">
              <p className="text-gray-500">No logs found for the selected criteria.</p>
            </div>
          )}
        </div>
      </div>

      {/* Uploaded Files Slider */}
      {showUploadedFilesSlider && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowUploadedFilesSlider(false)}></div>
          <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl transform transition-transform duration-300 ease-in-out">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Uploaded Files</h2>
              <button 
                onClick={() => setShowUploadedFilesSlider(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">Below is the list of log files currently uploaded for analysis.</p>
              <div className="space-y-3">
                {formattedUploadedFiles.length > 0 ? (
                  formattedUploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <FileText className="h-5 w-5 text-gray-600" />
                      <div className="flex-1">
                        <div className="text-gray-900 font-medium">{file.name}</div>
                        <div className="text-gray-500 text-sm">{file.size}</div>
                      </div>
                      {file.status === "completed" && (
                        <span className="text-green-600 text-sm">✓ Completed</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No files uploaded</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Analysis Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Save Analysis</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-6">
              Choose the format for your analysis export:
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => downloadAnalysis('json')}
                className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">JSON Format</div>
                    <div className="text-sm text-gray-500">Complete data with nested structure</div>
                  </div>
                </div>
                <div className="text-sm text-gray-400">.json</div>
              </button>
              
              <button
                onClick={() => downloadAnalysis('csv')}
                className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">CSV Format</div>
                    <div className="text-sm text-gray-500">Spreadsheet-compatible format</div>
                  </div>
                </div>
                <div className="text-sm text-gray-400">.csv</div>
              </button>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowEventModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{selectedEventTitle}</h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm text-gray-900 whitespace-pre-wrap break-words font-sans">
                  {selectedEventText}
                </pre>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowEventModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw File Modal */}
      {showRawFileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => {
          setShowRawFileModal(false)
          setRawLogContent("")
        }}>
          <div className="bg-white rounded-lg p-6 w-[90vw] h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Raw Log File - Session {selectedSession}
              </h3>
              <button
                onClick={() => {
                  setShowRawFileModal(false)
                  setRawLogContent("")
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-gray-900">
              <div className="p-4 min-h-full">
                {rawLogLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-gray-400">Loading raw log file...</div>
                  </div>
                ) : (
                  <pre className="text-sm text-gray-100 whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {rawLogContent || "No log content available"}
                  </pre>
                )}
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-600">
                {rawLogLoading ? "Loading..." : `${rawLogContent.split('\n').filter(line => line.trim()).length} log entries`}
              </div>
              <div className="flex gap-2">
                {/* <button
                  onClick={() => {
                    const sessionLogs = allLogs.filter(log => String(log.session_id) === String(selectedSession))
                    const rawContent = formatRawLogs(sessionLogs)
                    const blob = new Blob([rawContent], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `session-${selectedSession}-raw-logs.txt`
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    URL.revokeObjectURL(url)
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  Download
                </button> */}
                <button
                  onClick={() => {
                    setShowRawFileModal(false)
                    setRawLogContent("")
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
