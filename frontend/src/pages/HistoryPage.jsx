import { useNavigate } from "react-router-dom"
import { Button } from "../components/ui/button"
import { ArrowLeft } from "lucide-react"

export function HistoryPage() {
  const navigate = useNavigate()

  const handleGoBack = () => {
    navigate(-1) // Go back to previous page in browser history
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center">
        <Button 
          variant="outline" 
          className="flex items-center gap-2" 
          onClick={handleGoBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">History</h1>
        <p className="text-gray-600">History page coming soon...</p>
      </div>
    </div>
  )
}

