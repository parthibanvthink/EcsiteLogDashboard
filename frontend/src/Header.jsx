import { Avatar, AvatarFallback } from "./components/ui/avatar"
import EcsiteBrandSVG from "./assets/Ecsite_Brand"

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 w-full">
      <div className="flex items-center justify-between py-5 px-[48px] gap-[10px] w-full">
        
        {/* Left: Logo (60%) */}
        <div className="flex items-center">
          <EcsiteBrandSVG className="h-10 w-auto" />
        </div>

        {/* Right: Profile */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">ECSite</span>
          <Avatar className="w-8 h-8 bg-teal-600">
            <AvatarFallback className="bg-teal-600 text-white text-sm font-medium">
              ES
            </AvatarFallback>
          </Avatar>
        </div>

      </div>
    </header>
  )
}
