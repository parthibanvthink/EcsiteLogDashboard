import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Header } from "./Header"
import { UploadPage } from "./pages/UploadPage"
import { LoadingPage } from "./pages/LoadingPage"
import { InsightsPage } from "./pages/InsightsPage"
import { HistoryPage } from "./pages/HistoryPage"
import { TestStatsPage } from "./pages/TestStatsPage"
import { FullLogFilePage } from "./pages/FullLogFilePage"
import { NotFoundPage } from "./pages/NotFoundPage"
import "./App.css"

function App() {
  return (
    <Router>
      <div className="min-h-screen w-full bg-[#F4F8FB]">
        <Header />
        
        <main className="w-full px-[48px] py-8">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/loading" element={<LoadingPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/tests" element={<TestStatsPage />} />
            <Route path="/full-log" element={<FullLogFilePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
