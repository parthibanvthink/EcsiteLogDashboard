import { Button } from "./components/ui/button"
import { Progress } from "./components/ui/progress"
import { X, AlertCircle, CheckCircle, Clock } from "lucide-react"
import VectorSVG from "./assets/Vector"
import StartButtonSVG from "./assets/StartButton"
import RemoveSVG from "./assets/Remove"
import CancelSVG from "./assets/Cancel"

export function LogFilesList({ files, onStartAnalysis, onRemoveFile, onCancelFile }) {
  // if (files.length === 0) {
  //   return null
  // }

  const hasCompletedFiles = files.some((file) => file.status === "completed")
  const isUploading = files.some((file) => file.status === "processing")
  const hasNoFiles = files.length === 0

  const disableStartButton = hasNoFiles || isUploading || !hasCompletedFiles

  return (
    // <div className="bg-white rounded-lg border border-gray-200 p-6">
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Log Files</h2>
          <p className="text-gray-600">The uploaded files are listed below. Start the analysis when ready.</p>
        </div>

        {/* {hasCompletedFiles && ( */}
        <div 
          className={`${disableStartButton ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'} text-white flex items-center gap-[8px] w-[169px] h-[48px] rounded-md px-4 py-2`}
          onClick={disableStartButton ? undefined : onStartAnalysis}
        >
          <StartButtonSVG />
          <button 
            disabled={disableStartButton} 
            className="hover:bg-transparent hover:text-white focus:outline-none focus:bg-transparent focus:text-white active:bg-transparent active:text-white border-none outline-none">
            Start Analysis
          </button>
        </div>
        {/* )} */}
      </div>

            {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-[8px]">
          {/* <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-10 h-10 mb-2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6h13v6m-7-10v10M5 17V7H3v10h2zm16-6H5" />
          </svg> */}
          <VectorSVG />
          <p>Nothing here yet. Upload your files to start analyzing.</p>
        </div>
      ) : (
      // <div className="border border-gray-200 rounded-lg bg-white">
      //   {files.map((file) => (
      //     <div key={file.id} className="p-4">
      //       <div className="flex items-center justify-between mb-3">
      //         <div className="flex items-center space-x-3">
      //           {file.status === "completed" && <CheckCircle className="w-5 h-5 text-green-600" />}
      //           {file.status === "processing" && <Clock className="w-5 h-5 text-blue-600" />}
      //           {file.status === "failed" && <AlertCircle className="w-5 h-5 text-red-600" />}

      //           <div>
      //             <p className="font-medium text-gray-900">{file.name}</p>
      //             <div className="flex items-center space-x-2 text-sm">
      //               <span className="text-gray-600">{Math.round(file.progress)}%</span>
      //               <span className="text-gray-400">•</span>
      //               <span
      //                 className={`
      //                 ${file.status === "completed" ? "text-green-600" : ""}
      //                 ${file.status === "processing" ? "text-blue-600" : ""}
      //                 ${file.status === "failed" ? "text-red-600" : ""}
      //               `}
      //               >
      //                 {file.status === "completed" && "Completed"}
      //                 {file.status === "processing" && "In analysis remaining"}
      //                 {file.status === "failed" && "Failed"}
      //               </span>
      //             </div>
      //           </div>
      //         </div>

      //         <div className="flex items-center space-x-2">
      //           {file.canCancel && file.status === "processing" && (
      //             <Button
      //               variant="ghost"
      //               size="sm"
      //               onClick={() => onCancelFile(file.id)}
      //               className="text-red-600 hover:text-red-700 hover:bg-red-50"
      //             >
      //               Cancel
      //             </Button>
      //           )}

      //           <Button
      //             variant="ghost"
      //             size="sm"
      //             onClick={() => onRemoveFile(file.id)}
      //             className="text-gray-400 hover:text-gray-600"
      //           >
      //             <X className="w-4 h-4" />
      //             Remove
      //           </Button>
      //         </div>
      //       </div>

      //       {/* Progress Bar */}
      //       <div className="space-y-2">
      //         <Progress
      //           value={file.progress}
      //           className={`h-2 ${
      //             file.status === "completed"
      //               ? "[&>div]:bg-green-600"
      //               : file.status === "failed"
      //                 ? "[&>div]:bg-red-600"
      //                 : "[&>div]:bg-blue-600"
      //           }`}
      //         />
      //       </div>
      //     </div>
      //   ))}
      // </div>
      <div className="border border-gray-200 rounded-lg bg-white">
  {files.map((file, index) => (
    <div key={file.id} className="pl-4 pr-4 pt-4 pb-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {file.status === "completed" && <CheckCircle className="w-5 h-5 text-green-600" />}
          {file.status === "processing" && <Clock className="w-5 h-5 text-blue-600" />}
          {file.status === "failed" && <AlertCircle className="w-5 h-5 text-red-600" />}

          <div>
            <p className="font-medium text-gray-900">{file.name}</p>
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-600">{Math.round(file.progress)}%</span>
              <span className="text-gray-400">•</span>
              <span
                className={`
                  ${file.status === "completed" ? "text-green-600" : ""}
                  ${file.status === "processing" ? "text-blue-600" : ""}
                  ${file.status === "failed" ? "text-red-600" : ""}
                `}
              >
                {file.status === "completed" && "Completed"}
                {file.status === "processing" && "In analysis remaining"}
                {file.status === "failed" && "Failed"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {file.canCancel && file.status === "processing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancelFile(file.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <CancelSVG />
              Cancel
            </Button>
          )}

          {file.status !== "processing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveFile(file.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <RemoveSVG />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <Progress
        value={file.progress}
        className={`h-2 ${
          file.status === "completed"
            ? "[&>div]:bg-green-600"
            : file.status === "failed"
              ? "[&>div]:bg-red-600"
              : "[&>div]:bg-blue-600"
        }`}
      />

      {/* Border bottom except last row */}
      {index !== files.length - 1 && (
        <div className="border-b border-gray-200 mx-1 mt-4"></div>
      )}
    </div>
  ))}
</div>

      )}
      </>
    // </div>
  )
}
