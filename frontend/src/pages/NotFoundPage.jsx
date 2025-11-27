import { Link } from "react-router-dom"
import { Button } from "../components/ui/button"

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <h1 className="text-4xl font-bold text-gray-900">404</h1>
      <p className="text-xl text-gray-600">Page Not Found</p>
      <p className="text-gray-500">The page you're looking for doesn't exist.</p>
      <Link to="/">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          Go to Upload Page
        </Button>
      </Link>
    </div>
  )
}
