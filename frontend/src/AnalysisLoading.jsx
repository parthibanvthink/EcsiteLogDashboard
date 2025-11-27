import { Search, TrendingUp } from "lucide-react"
import SignalAnalysisGif from "./assets/SignalAnalysis.gif"

export function AnalysisLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <img src={SignalAnalysisGif} alt="Loading animation" width="150" height="150" />
      
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Analyzing Your Files</h2>
      <p className="text-gray-600 max-w-md">Please wait while we process your logs and prepare insights for you.</p>
    </div>
  )
}
