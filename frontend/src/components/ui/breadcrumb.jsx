import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

export function Breadcrumb({ items }) {
  return (
    <nav className="flex items-center space-x-2 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        
        return (
          <div key={index} className="flex items-center">
            {isLast ? (
              <span className="text-gray-900 font-medium">{item.label}</span>
            ) : (
              <>
                <Link
                  to={item.path}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {item.label}
                </Link>
                <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />
              </>
            )}
          </div>
        )
      })}
    </nav>
  )
}

